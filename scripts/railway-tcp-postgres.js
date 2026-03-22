#!/usr/bin/env node
/**
 * Create or list TCP proxy for the project's Postgres (public host for pg from your laptop).
 * Uses .env RAILWAY_TOKEN + RAILWAY_PROJECT_ID.
 *
 *   node scripts/railway-tcp-postgres.js create
 *   node scripts/railway-tcp-postgres.js list
 *   node scripts/railway-tcp-postgres.js delete <proxyId>
 *
 * Build URL: postgres://USER:PASS@DOMAIN:PROXY_PORT/DB
 * (USER/PASS/DB from Railway → Postgres variables; no TLS on proxy.rlwy.net)
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
const gql = (q, v, h) => railGql(ENDPOINT, q, v, h);

function authHeaders() {
  const pt = process.env.RAILWAY_PROJECT_TOKEN?.trim();
  const bt = process.env.RAILWAY_TOKEN?.trim();
  if (pt) return { 'Project-Access-Token': pt };
  if (bt) return { Authorization: `Bearer ${bt}` };
  return null;
}

function pgServiceId(layout) {
  const edges = layout.services?.edges || [];
  const pg = edges.filter((e) =>
    /postgres|postgresql|^pg$/i.test(String(e.node.name || '').trim())
  );
  if (pg.length !== 1) throw new Error('Expected exactly one Postgres service');
  return pg[0].node.id;
}

async function main() {
  const cmd = process.argv[2] || 'list';
  const headers = authHeaders();
  if (!headers) throw new Error('RAILWAY_TOKEN + RAILWAY_PROJECT_ID in .env');

  let projectId = process.env.RAILWAY_PROJECT_ID?.trim();
  let environmentId = process.env.RAILWAY_ENVIRONMENT_ID?.trim();
  if (process.env.RAILWAY_PROJECT_TOKEN) {
    const t = await resolveProjectToken(ENDPOINT, headers);
    projectId = projectId || t.projectId;
    environmentId = environmentId || t.environmentId;
  }
  if (!projectId) throw new Error('RAILWAY_PROJECT_ID');

  const targets = await resolveTargets({
    endpoint: ENDPOINT,
    headers,
    projectId,
    environmentId,
    serviceId: null,
    serviceNameHint: null,
  });
  const layout =
    targets.layout || (await fetchProjectLayout(ENDPOINT, projectId, headers));
  const pgSid = pgServiceId(layout);
  const eid = targets.environmentId;

  const listQ = `query T($e:String!,$s:String!){ tcpProxies(environmentId:$e,serviceId:$s){ id domain proxyPort applicationPort } }`;
  if (cmd === 'list') {
    const d = await gql(listQ, { e: eid, s: pgSid }, headers);
    console.log(JSON.stringify(d.tcpProxies, null, 2));
    return;
  }
  if (cmd === 'create') {
    const m = `mutation M($i:TCPProxyCreateInput!){ tcpProxyCreate(input:$i){ id domain proxyPort applicationPort } }`;
    const d = await gql(
      m,
      {
        i: {
          environmentId: eid,
          serviceId: pgSid,
          applicationPort: 5432,
        },
      },
      headers
    );
    console.log(JSON.stringify(d.tcpProxyCreate, null, 2));
    console.error(
      '\nUse: postgres://POSTGRES_USER:POSTGRES_PASSWORD@HOST:PORT/POSTGRES_DB (ssl off)'
    );
    return;
  }
  if (cmd === 'delete') {
    const id = process.argv[3];
    if (!id) throw new Error('Pass proxy id');
    const m = `mutation($id:String!){ tcpProxyDelete(id:$id) }`;
    await gql(m, { id }, headers);
    console.log('Deleted', id);
    return;
  }
  console.log('Commands: list | create | delete <id>');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
