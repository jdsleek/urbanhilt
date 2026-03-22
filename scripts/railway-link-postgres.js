#!/usr/bin/env node
/**
 * Set DATABASE_URL to ${{Postgres.DATABASE_URL}}. If Railway leaves runtime DATABASE_URL
 * empty (common with Postgres *plugin* services), run `npm run railway:materialize-db-url`.
 *
 *   npm run railway:link-postgres
 *   npm run railway:link-postgres -- --dry-run
 *   npm run railway:link-postgres -- --postgres-service-name "Postgres"
 *
 * Requires .env: RAILWAY_TOKEN + RAILWAY_PROJECT_ID (or RAILWAY_PROJECT_TOKEN).
 * @see https://docs.railway.com/develop/variables#reference-variables
 */

try {
  require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
} catch (_) {}

const {
  graphql: railGql,
  resolveProjectToken,
  resolveTargets,
  findPostgresServiceName,
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

function parseArgs(argv) {
  let dryRun = false;
  let postgresServiceName = null;
  let appServiceName = null;
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--dry-run') dryRun = true;
    else if (argv[i] === '--postgres-service-name') postgresServiceName = argv[++i];
    else if (argv[i] === '--service-name') appServiceName = argv[++i];
  }
  return { dryRun, postgresServiceName, appServiceName };
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

  const targets = await resolveTargets({
    endpoint: ENDPOINT,
    headers,
    projectId,
    environmentId,
    serviceId,
    serviceNameHint: args.appServiceName,
  });

  const layout = targets.layout;
  if (!layout?.services) {
    throw new Error('Could not load project services');
  }

  const pgName = findPostgresServiceName(layout.services, args.postgresServiceName);
  const ref = `\${{${pgName}.DATABASE_URL}}`;

  console.warn(`→ Postgres plugin service name: "${pgName}"`);
  console.warn(`→ Will set DATABASE_URL on Node service to: ${ref}`);

  const input = {
    projectId: targets.projectId,
    environmentId: targets.environmentId,
    serviceId: targets.serviceId,
    variables: {
      DATABASE_URL: ref,
    },
  };

  if (args.dryRun) {
    console.log(JSON.stringify({ input }, null, 2));
    return;
  }

  const mutation = `
    mutation variableCollectionUpsert($input: VariableCollectionUpsertInput!) {
      variableCollectionUpsert(input: $input)
    }
  `;

  await gql(mutation, { input }, headers);
  console.log(
    'OK: DATABASE_URL set. Railway will redeploy the Node service; wait for deploy then check GET /api/health (database: true).'
  );
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
