#!/usr/bin/env node
/**
 * When ${{Postgres.DATABASE_URL}} does not resolve (empty at runtime — app exits),
 * build postgres://...@postgres.railway.internal/... from the Postgres plugin's
 * POSTGRES_* variables and set DATABASE_URL on the Node service.
 *
 *   npm run railway:materialize-db-url
 *
 * After this, rotate POSTGRES_PASSWORD in Railway if this token was ever exposed.
 */
try {
  require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
} catch (_) {}

const {
  graphql: railGql,
  resolveProjectToken,
  resolveTargets,
  fetchProjectLayout,
  findPostgresServiceName,
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
  if (pg.length !== 1) {
    throw new Error(
      pg.length === 0
        ? 'No Postgres service in project'
        : `Multiple Postgres services: ${pg.map((e) => e.node.name).join(', ')}`
    );
  }
  return pg[0].node.id;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const headers = authHeaders();
  if (!headers) throw new Error('Set RAILWAY_TOKEN + RAILWAY_PROJECT_ID');

  let projectId = process.env.RAILWAY_PROJECT_ID?.trim();
  let environmentId = process.env.RAILWAY_ENVIRONMENT_ID?.trim();
  let serviceId = process.env.RAILWAY_SERVICE_ID?.trim();
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
    serviceId,
    serviceNameHint: null,
  });

  const layout =
    targets.layout || (await fetchProjectLayout(ENDPOINT, projectId, headers));
  const pgId = pgServiceId(layout);

  const vq = `
    query V($p: String!, $e: String!, $s: String!, $u: Boolean!) {
      variables(projectId: $p, environmentId: $e, serviceId: $s, unrendered: $u)
    }
  `;
  const unr = await gql(
    vq,
    { p: targets.projectId, e: targets.environmentId, s: pgId, u: true },
    headers
  );
  const ren = await gql(
    vq,
    { p: targets.projectId, e: targets.environmentId, s: pgId, u: false },
    headers
  );

  const u = unr.variables || {};
  const user = u.POSTGRES_USER;
  const pass = u.POSTGRES_PASSWORD;
  const db = u.POSTGRES_DB;
  if (!user || !pass || !db) {
    throw new Error(
      'Postgres service missing POSTGRES_USER / POSTGRES_PASSWORD / POSTGRES_DB'
    );
  }

  const host =
    (ren.variables || {}).RAILWAY_PRIVATE_DOMAIN || 'postgres.railway.internal';
  const port = process.env.RAILWAY_PG_PORT || '5432';
  const databaseUrl = `postgres://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${port}/${encodeURIComponent(db)}`;

  console.warn(
    `→ Postgres plugin: ${findPostgresServiceName(layout.services)} (${pgId})`
  );
  console.warn(`→ Internal host: ${host}`);
  console.warn(
    `→ Setting DATABASE_URL on Node service ${targets.serviceId} (password not printed)`
  );

  if (dryRun) {
    console.log('Dry run — would set DATABASE_URL length:', databaseUrl.length);
    return;
  }

  const mutation = `
    mutation variableCollectionUpsert($input: VariableCollectionUpsertInput!) {
      variableCollectionUpsert(input: $input)
    }
  `;
  await gql(
    mutation,
    {
      input: {
        projectId: targets.projectId,
        environmentId: targets.environmentId,
        serviceId: targets.serviceId,
        variables: { DATABASE_URL: databaseUrl },
      },
    },
    headers
  );
  console.log('OK: DATABASE_URL materialized. Redeploy will start; check /api/health.');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
