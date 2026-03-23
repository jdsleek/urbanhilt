#!/usr/bin/env node
/**
 * Show what Postgres actually stores for product images (paths only — not file bytes).
 *
 *   DATABASE_URL=... node scripts/query-image-storage.js
 *   (or put DATABASE_URL in .env and run from repo root)
 */
try {
  require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
} catch (_) {}

const { Client } = require('pg');

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('Set DATABASE_URL (e.g. from Railway Postgres → Connect).');
    process.exit(1);
  }
  const needsSsl = !url.includes('localhost') && !url.includes('railway.internal');
  const c = new Client({
    connectionString: url,
    ssl: needsSsl ? { rejectUnauthorized: false } : false,
  });
  await c.connect();

  const meta = await c.query(`
    SELECT column_name, data_type, udt_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'images'
  `);
  console.log('products.images column (information_schema):');
  console.table(meta.rows);

  const { rows: cnt } = await c.query(
    `SELECT count(*)::int AS n FROM products WHERE images IS NOT NULL AND images != '[]' AND images != ''`
  );
  console.log('\nProducts with non-empty images JSON:', cnt[0].n);

  const { rows: sample } = await c.query(`
    SELECT id, name, images
    FROM products
    WHERE images IS NOT NULL AND images != '[]'
    ORDER BY id DESC
    LIMIT 5
  `);
  console.log('\nSample (full images column — these are URL path strings, not binary photos):\n');
  for (const r of sample) {
    console.log(`id=${r.id} ${r.name}`);
    console.log(`  ${r.images}\n`);
  }

  await c.end();
  console.log(
    '---\nThe JPEG/PNG bytes are NOT in this column. They must exist as files on the server at UPLOADS_DIR (or ./uploads), named like the path after /uploads/.'
  );
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
