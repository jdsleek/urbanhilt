#!/usr/bin/env node
/**
 * Copy all Urban Hilt tables from SOURCE_DATABASE_URL → TARGET_DATABASE_URL.
 * Preserves IDs so relations stay valid.
 *
 * Requirements:
 * - Run from a network that can reach BOTH databases. Railway *internal* URLs
 *   (postgres.railway.internal) only work inside Railway — for local runs use each
 *   database’s **public** connection string from Railway → Postgres → Connect.
 *
 * Usage:
 *   SOURCE_DATABASE_URL="..." TARGET_DATABASE_URL="..." node scripts/migrate-db.js --replace
 *   SOURCE_DATABASE_URL="..." TARGET_DATABASE_URL="..." node scripts/migrate-db.js --merge
 *
 * Options:
 *   --replace          TRUNCATE all app tables on TARGET, then copy (wipes existing target data).
 *   --merge            Upsert from SOURCE into TARGET (no truncate). Keeps existing rows;
 *                      same id/key is updated from source. Use this to restore without wiping
 *                      data that only exists on the target.
 *   --dry-run          Show counts only, no writes.
 *   --rewrite-uploads-base https://old-app.up.railway.app
 *                      After copy, rewrite `/uploads/...` in categories.image and
 *                      products.images JSON to full URLs so the live site loads files
 *                      from the old deployment until you copy files to the new volume.
 *
 * Does NOT copy files on disk — only DB rows. See docs/MIGRATE-DB.md
 */

const { Client } = require('pg');

const TABLES_ORDER = [
  'categories',
  'products',
  'admin_users',
  'customers',
  'sales_staff',
  'discount_codes',
  'orders',
  'reviews',
  'wishlists',
  'staff_access_logs',
  'newsletter_subscribers',
  'site_settings',
];

function poolConfig(url) {
  const needsSsl =
    !url.includes('localhost') && !url.includes('railway.internal');
  const c = { connectionString: url };
  if (needsSsl) c.ssl = { rejectUnauthorized: false };
  return c;
}

async function getColumns(client, table) {
  const { rows } = await client.query(
    `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
    ORDER BY ordinal_position
  `,
    [table]
  );
  return rows.map((r) => r.column_name);
}

async function tableCount(client, table) {
  const { rows } = await client.query(`SELECT COUNT(*)::int AS c FROM ${table}`);
  return rows[0].c;
}

function parseArgs() {
  const a = process.argv.slice(2);
  return {
    replace: a.includes('--replace'),
    merge: a.includes('--merge'),
    dryRun: a.includes('--dry-run'),
    rewriteBase: (() => {
      const i = a.indexOf('--rewrite-uploads-base');
      if (i === -1 || !a[i + 1]) return null;
      return a[i + 1].replace(/\/$/, '');
    })(),
  };
}

/** Primary key column for ON CONFLICT */
function conflictColumn(table) {
  if (table === 'site_settings') return 'key';
  return 'id';
}

function buildUpsertSql(table, cols) {
  const conflict = conflictColumn(table);
  if (!cols.includes(conflict)) {
    return null;
  }
  const colList = cols.map((c) => `"${c}"`).join(', ');
  const ph = cols.map((_, i) => `$${i + 1}`).join(', ');
  const updates = cols
    .filter((c) => c !== conflict)
    .map((c) => `"${c}" = EXCLUDED."${c}"`)
    .join(', ');
  const updateClause =
    updates.length > 0
      ? `DO UPDATE SET ${updates}`
      : 'DO NOTHING';
  return `INSERT INTO ${table} (${colList}) VALUES (${ph}) ON CONFLICT ("${conflict}") ${updateClause}`;
}

function rewriteUploadPathsInJson(jsonStr, base) {
  if (!jsonStr || typeof jsonStr !== 'string') return jsonStr;
  const trimmed = jsonStr.trim();
  if (!trimmed.startsWith('[')) return rewriteScalarImage(jsonStr, base);
  try {
    const arr = JSON.parse(jsonStr);
    if (!Array.isArray(arr)) return jsonStr;
    const out = arr.map((item) => {
      if (typeof item === 'string' && item.startsWith('/uploads/')) {
        return `${base}${item}`;
      }
      return item;
    });
    return JSON.stringify(out);
  } catch {
    return jsonStr;
  }
}

function rewriteScalarImage(val, base) {
  if (typeof val === 'string' && val.startsWith('/uploads/')) {
    return `${base}${val}`;
  }
  return val;
}

async function main() {
  const srcUrl = process.env.SOURCE_DATABASE_URL?.trim();
  const tgtUrl = process.env.TARGET_DATABASE_URL?.trim();
  const args = parseArgs();

  if (!srcUrl || !tgtUrl) {
    console.error(
      'Set SOURCE_DATABASE_URL and TARGET_DATABASE_URL (use public Railway URLs if migrating locally).'
    );
    process.exit(1);
  }
  if (srcUrl === tgtUrl) {
    console.error('Source and target must differ.');
    process.exit(1);
  }
  if (args.replace && args.merge) {
    console.error('Use either --replace or --merge, not both.');
    process.exit(1);
  }
  if (!args.replace && !args.merge && !args.dryRun) {
    console.error(
      'Pass --replace (wipe target), --merge (upsert, keep target rows), or --dry-run.'
    );
    process.exit(1);
  }

  const src = new Client(poolConfig(srcUrl));
  const tgt = new Client(poolConfig(tgtUrl));
  await src.connect();
  await tgt.connect();

  console.log('Source:', maskUrl(srcUrl));
  console.log('Target:', maskUrl(tgtUrl));

  if (args.dryRun) {
    for (const t of TABLES_ORDER) {
      try {
        const n = await tableCount(src, t);
        const m = await tableCount(tgt, t);
        console.log(`  ${t}: source=${n} target=${m}`);
      } catch (e) {
        console.log(`  ${t}: error ${e.message}`);
      }
    }
    await src.end();
    await tgt.end();
    return;
  }

  if (args.replace) {
    console.log('\nTRUNCATE target tables (CASCADE, RESTART IDENTITY)...');
    await tgt.query(`
      TRUNCATE
        staff_access_logs,
        wishlists,
        reviews,
        orders,
        products,
        categories,
        sales_staff,
        discount_codes,
        customers,
        newsletter_subscribers,
        site_settings,
        admin_users
      RESTART IDENTITY CASCADE;
    `);
  } else {
    console.log('\n--merge: no truncate (upserting from source into target)');
  }

  let total = 0;
  for (const table of TABLES_ORDER) {
    const srcCols = await getColumns(src, table);
    const tgtCols = await getColumns(tgt, table);
    const cols = srcCols.filter((c) => tgtCols.includes(c));
    if (!cols.length) {
      console.warn(`  skip ${table} (no common columns)`);
      continue;
    }

    let rows;
    try {
      const res = await src.query(
        `SELECT ${cols.map((c) => `"${c}"`).join(', ')} FROM ${table} ORDER BY 1`
      );
      rows = res.rows;
    } catch (e) {
      console.warn(`  skip ${table} (source: ${e.message})`);
      continue;
    }
    if (!rows.length) {
      console.log(`  ${table}: 0 rows from source`);
      continue;
    }

    const colList = cols.map((c) => `"${c}"`).join(', ');
    const upsertSql = args.merge ? buildUpsertSql(table, cols) : null;
    if (args.merge && !upsertSql) {
      console.warn(`  skip ${table} (merge needs PK column ${conflictColumn(table)})`);
      continue;
    }

    const ph = cols.map((_, i) => `$${i + 1}`).join(', ');
    const insertSql = `INSERT INTO ${table} (${colList}) VALUES (${ph})`;

    for (const row of rows) {
      const vals = cols.map((c) => row[c]);
      if (args.merge) {
        await tgt.query(upsertSql, vals);
      } else {
        await tgt.query(insertSql, vals);
      }
    }
    console.log(
      `  ${table}: ${rows.length} rows (${args.merge ? 'upserted' : 'inserted'})`
    );
    total += rows.length;
  }

  console.log(`\nDone: ${total} row operations across tables.`);

  // Fix serial sequences after explicit id inserts
  for (const table of TABLES_ORDER) {
    try {
      const cols = await getColumns(tgt, table);
      if (!cols.includes('id')) continue;
      const {
        rows: [sr],
      } = await tgt.query(
        `SELECT pg_get_serial_sequence($1::text, 'id') AS seq`,
        [table]
      );
      if (!sr?.seq) continue;
      await tgt.query(
        `SELECT setval($1::regclass, COALESCE((SELECT MAX(id) FROM ${table}), 1))`,
        [sr.seq]
      );
    } catch (_) {
      /* no serial */
    }
  }

  if (args.rewriteBase) {
    console.log(
      `\nRewriting /uploads/ paths to ${args.rewriteBase} (categories + products)...`
    );
    const { rows: cats } = await tgt.query(
      'SELECT id, image FROM categories WHERE image IS NOT NULL AND image LIKE \'/uploads/%\''
    );
    for (const r of cats) {
      const img = rewriteScalarImage(r.image, args.rewriteBase);
      await tgt.query('UPDATE categories SET image = $1 WHERE id = $2', [
        img,
        r.id,
      ]);
    }
    const { rows: prods } = await tgt.query(
      "SELECT id, images FROM products WHERE images IS NOT NULL AND images LIKE '%/uploads/%'"
    );
    for (const r of prods) {
      const images = rewriteUploadPathsInJson(r.images, args.rewriteBase);
      await tgt.query('UPDATE products SET images = $1 WHERE id = $2', [
        images,
        r.id,
      ]);
    }
    console.log(
      '  Done. Images now load from old host until you copy files to the new service.'
    );
  }

  await src.end();
  await tgt.end();
  console.log('\nOK. Verify target: TARGET_DATABASE_URL node scripts/verify-order-flow.js');
}

function maskUrl(u) {
  try {
    const x = new URL(u.replace(/^postgresql:/, 'postgres:'));
    return `${x.protocol}//${x.username ? '***@' : ''}${x.host}${x.pathname}`;
  } catch {
    return '(invalid url)';
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
