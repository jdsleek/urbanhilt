#!/usr/bin/env node
/**
 * Inspect client Railway project: app service vars (DATABASE_URL shape) + service list.
 * Explains "Admin shows data, shop doesn't" = usually two different DATABASE_URLs / two deploys.
 *
 *   npm run railway:diagnose
 *   npm run railway:diagnose -- --compare-url https://xxx.up.railway.app https://www.urbanhilt.com
 *
 * Loads .env (RAILWAY_TOKEN + RAILWAY_PROJECT_ID). Optional --service-name.
 */

try {
  require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
} catch (_) {}

const {
  graphql: railGql,
  resolveProjectToken,
  resolveTargets,
  fetchProjectLayout,
} = require('./railway-resolve.js');

const ENDPOINT =
  process.env.RAILWAY_GRAPHQL_URL || 'https://backboard.railway.com/graphql/v2';

const gql = (query, variables, headers) =>
  railGql(ENDPOINT, query, variables, headers);

function authHeaders() {
  const pt = process.env.RAILWAY_PROJECT_TOKEN?.trim();
  const bt = process.env.RAILWAY_TOKEN?.trim();
  if (pt) return { 'Project-Access-Token': pt };
  if (bt) return { Authorization: `Bearer ${bt}` };
  return null;
}

function maskDatabaseUrl(raw) {
  if (!raw || typeof raw !== 'string') return raw;
  if (raw.includes('${{')) return raw; // Railway reference — safe to show
  try {
    const u = new URL(raw.replace(/^postgresql:/, 'postgres:'));
    const host = u.hostname;
    const db = (u.pathname || '').replace(/^\//, '') || '(default)';
    return `postgres://***:***@${host}/${db} (password hidden)`;
  } catch {
    return raw.length > 60 ? `${raw.slice(0, 40)}…` : '[set]';
  }
}

function parseArgs(argv) {
  const out = { compareUrls: null, serviceName: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--compare-url') {
      const u1 = argv[++i];
      const u2 = argv[++i];
      if (u1 && u2) out.compareUrls = [u1, u2];
    } else if (argv[i] === '--service-name') {
      out.serviceName = argv[++i];
    }
  }
  return out;
}

async function fetchJson(url, path) {
  const base = url.replace(/\/$/, '');
  const res = await fetch(`${base}${path}`);
  const text = await res.text();
  let j;
  try {
    j = JSON.parse(text);
  } catch {
    return { error: 'not json', status: res.status, snippet: text.slice(0, 120) };
  }
  return { status: res.status, ok: res.ok, ...j };
}

async function main() {
  const args = parseArgs(process.argv);
  const headers = authHeaders();
  if (!headers) {
    console.error('Set RAILWAY_TOKEN + RAILWAY_PROJECT_ID in .env');
    process.exit(1);
  }

  let projectId = process.env.RAILWAY_PROJECT_ID?.trim();
  let environmentId = process.env.RAILWAY_ENVIRONMENT_ID?.trim();
  let serviceId = process.env.RAILWAY_SERVICE_ID?.trim();

  if (process.env.RAILWAY_PROJECT_TOKEN) {
    const t = await resolveProjectToken(ENDPOINT, headers);
    projectId = projectId || t.projectId;
    environmentId = environmentId || t.environmentId;
  }
  if (!projectId) {
    console.error('RAILWAY_PROJECT_ID missing');
    process.exit(1);
  }

  const layout = await fetchProjectLayout(ENDPOINT, projectId, headers);
  console.log('\n=== Project services (same project = should share one Postgres for this app) ===');
  const edges = layout.services?.edges || [];
  for (const e of edges) {
    console.log(`  - ${e.node.name}  (${e.node.id})`);
  }

  const targets = await resolveTargets({
    endpoint: ENDPOINT,
    headers,
    projectId,
    environmentId,
    serviceId,
    serviceNameHint: args.serviceName,
  });

  const vq = `
    query Vars($projectId: String!, $environmentId: String!, $serviceId: String!, $unrendered: Boolean!) {
      variables(
        projectId: $projectId
        environmentId: $environmentId
        serviceId: $serviceId
        unrendered: $unrendered
      )
    }
  `;

  const varsRendered = await gql(
    vq,
    {
      projectId: targets.projectId,
      environmentId: targets.environmentId,
      serviceId: targets.serviceId,
      unrendered: false,
    },
    headers
  );
  const varsRaw = await gql(
    vq,
    {
      projectId: targets.projectId,
      environmentId: targets.environmentId,
      serviceId: targets.serviceId,
      unrendered: true,
    },
    headers
  );

  const r = varsRendered.variables || {};
  const u = varsRaw.variables || {};

  console.log('\n=== App service (where Admin + shop API run) ===');
  console.log(`Service: ${targets.serviceId}`);
  console.log(`DATABASE_URL (unrendered / as stored): ${maskDatabaseUrl(u.DATABASE_URL) || '(missing — app will 503 / empty data)'}`);
  console.log(`DATABASE_URL (rendered for deploy):     ${maskDatabaseUrl(r.DATABASE_URL) || '(missing)'}`);
  console.log(`NODE_ENV: ${r.NODE_ENV || u.NODE_ENV || '(unset)'}`);
  console.log(`PUBLIC_SITE_URL: ${r.PUBLIC_SITE_URL || u.PUBLIC_SITE_URL || '(unset)'}`);

  console.log('\n=== Why shop ≠ Admin data ===');
  console.log(
    'Storefront and Admin use the SAME code: both read/write the Postgres in DATABASE_URL for that deployment.'
  );
  console.log(
    'If Railway "Open app" / *.railway.app shows your new products but www.urbanhilt.com does not, those URLs hit TWO different services OR two different DATABASE_URL values.'
  );
  console.log(
    'Fix: In Railway → Networking, attach www.urbanhilt.com to the SAME service that has the Postgres data (or point both services at the SAME DATABASE_URL / same Postgres plugin).'
  );

  if (args.compareUrls?.length === 2) {
    const [a, b] = args.compareUrls;
    console.log('\n=== Live API comparison (category count) ===');
    for (const url of [a, b]) {
      const cat = await fetchJson(url, '/api/categories');
      const n = cat.categories?.length;
      const prod = await fetchJson(url, '/api/products?limit=1');
      const total = prod.total;
      console.log(`  ${url}`);
      console.log(`    /api/categories → ${n == null ? 'error ' + JSON.stringify(cat).slice(0, 80) : n + ' categories'}`);
      console.log(`    /api/products   → total=${total ?? '?'}`);
    }
    const c1 = await fetchJson(a, '/api/categories');
    const c2 = await fetchJson(b, '/api/categories');
    const n1 = c1.categories?.length;
    const n2 = c2.categories?.length;
    if (n1 != null && n2 != null && n1 !== n2) {
      console.log('\n>>> Counts differ — different databases (or one empty).');
    }
  } else {
    console.log(
      '\nTip: npm run railway:diagnose -- --compare-url https://YOUR.railway.app https://www.urbanhilt.com'
    );
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
