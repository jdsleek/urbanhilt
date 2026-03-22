#!/usr/bin/env node
try {
  require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
} catch (_) {
  /* dotenv optional */
}

/**
 * Push Urban Hilt env vars to Railway (variableCollectionUpsert).
 *
 * You only need:
 *   - RAILWAY_TOKEN (Bearer) or RAILWAY_PROJECT_TOKEN (Project-Access-Token)
 *   - RAILWAY_PROJECT_ID (with Bearer; optional with project token — resolved via API)
 *
 * Environment + Node service are resolved automatically (production env, app service
 * excluding Postgres/Redis/etc.). Override with --service-name if needed.
 *
 *   node scripts/railway-set-env.js --env-file .env.railway
 *
 * Docs: https://docs.railway.com/integrations/api/manage-variables
 */

const {
  graphql: railGql,
  resolveProjectToken,
  fetchProjectLayout,
  resolveTargets,
} = require('./railway-resolve.js');

const ENDPOINT =
  process.env.RAILWAY_GRAPHQL_URL || 'https://backboard.railway.com/graphql/v2';

const gql = (query, variables, headers) =>
  railGql(ENDPOINT, query, variables, headers);

/** Keys we expect for this app (others in the file are ignored unless --all-keys) */
const URBANHILT_KEYS = new Set([
  'NODE_ENV',
  'PORT',
  'DATABASE_URL',
  'JWT_SECRET',
  'STAFF_JWT_SECRET',
  'CUSTOMER_SECRET',
  'REQUIRE_STAFF_CHECKOUT',
  'STAFF_GATE_FULL_SITE',
  'PAYSTACK_PUBLIC_KEY',
  'PAYSTACK_SECRET_KEY',
  'PUBLIC_SITE_URL',
]);

function parseArgs(argv) {
  const out = {
    envFile: null,
    dryRun: false,
    skipDeploys: false,
    listProject: false,
    serviceName: null,
    printTemplate: false,
    allKeys: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--env-file') out.envFile = argv[++i];
    else if (a === '--dry-run') out.dryRun = true;
    else if (a === '--skip-deploys') out.skipDeploys = true;
    else if (a === '--list-project') out.listProject = true;
    else if (a === '--service-name') out.serviceName = argv[++i];
    else if (a === '--print-template') out.printTemplate = true;
    else if (a === '--all-keys') out.allKeys = true;
    else if (a === '--help' || a === '-h') out.help = true;
  }
  return out;
}

function parseDotenv(content) {
  const vars = {};
  for (let line of content.split('\n')) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    vars[key] = val;
  }
  return vars;
}

function authHeaders() {
  const pt = process.env.RAILWAY_PROJECT_TOKEN?.trim();
  const bt = process.env.RAILWAY_TOKEN?.trim();
  if (pt) {
    return { 'Project-Access-Token': pt };
  }
  if (bt) {
    return { Authorization: `Bearer ${bt}` };
  }
  return null;
}

function filterVars(raw, allKeys) {
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v === undefined || v === '') continue;
    if (!allKeys && !URBANHILT_KEYS.has(k)) continue;
    out[k] = v;
  }
  return out;
}

function printHelp() {
  console.log(`Usage:
  node scripts/railway-set-env.js --env-file .env.railway [options]

Required:
  RAILWAY_TOKEN + RAILWAY_PROJECT_ID   OR   RAILWAY_PROJECT_TOKEN

Optional (auto-resolved from the API if omitted):
  RAILWAY_ENVIRONMENT_ID   RAILWAY_SERVICE_ID

Options:
  --service-name <str>   Pick service by name (substring) instead of auto-detect
  --list-project         JSON dump of services + environments
  --dry-run              Print mutation payload only
  --skip-deploys         skipDeploys: true
  --all-keys             Push every non-empty key from the file
  --print-template       Print Urban Hilt variable names

Never commit tokens or filled .env.railway.`);
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (args.printTemplate) {
    console.log(
      'Suggested .env.railway (fill values; DATABASE_URL often ${{Postgres.DATABASE_URL}}):\n'
    );
    for (const k of URBANHILT_KEYS) {
      console.log(`${k}=`);
    }
    process.exit(0);
  }

  const headers = authHeaders();
  if (!headers) {
    console.error('Set RAILWAY_TOKEN or RAILWAY_PROJECT_TOKEN.');
    printHelp();
    process.exit(1);
  }

  let projectId = process.env.RAILWAY_PROJECT_ID?.trim();
  let environmentId = process.env.RAILWAY_ENVIRONMENT_ID?.trim();
  let serviceId = process.env.RAILWAY_SERVICE_ID?.trim();

  if (process.env.RAILWAY_PROJECT_TOKEN) {
    const resolved = await resolveProjectToken(ENDPOINT, headers);
    projectId = projectId || resolved.projectId;
    environmentId = environmentId || resolved.environmentId;
  }

  if (!projectId) {
    console.error(
      'Set RAILWAY_PROJECT_ID (with account/workspace token) or use RAILWAY_PROJECT_TOKEN.'
    );
    process.exit(1);
  }

  if (args.listProject) {
    const proj = await fetchProjectLayout(ENDPOINT, projectId, headers);
    console.log(JSON.stringify(proj, null, 2));
    process.exit(0);
  }

  const targets = await resolveTargets({
    endpoint: ENDPOINT,
    headers,
    projectId,
    environmentId,
    serviceId,
    serviceNameHint: args.serviceName,
  });
  projectId = targets.projectId;
  environmentId = targets.environmentId;
  serviceId = targets.serviceId;

  if (!args.envFile) {
    console.error('Pass --env-file path (e.g. .env.railway).');
    process.exit(1);
  }

  const fs = await import('fs');
  const path = await import('path');
  const abs = path.resolve(args.envFile);
  if (!fs.existsSync(abs)) {
    console.error(`File not found: ${abs}`);
    process.exit(1);
  }
  const raw = parseDotenv(fs.readFileSync(abs, 'utf8'));
  const variables = filterVars(raw, args.allKeys);

  if (!Object.keys(variables).length) {
    console.error(
      'No variables to push (empty values skipped). Fill --env-file or use --all-keys.'
    );
    process.exit(1);
  }

  const input = {
    projectId,
    environmentId,
    serviceId,
    variables,
    ...(args.skipDeploys ? { skipDeploys: true } : {}),
  };

  const mutation = `
    mutation variableCollectionUpsert($input: VariableCollectionUpsertInput!) {
      variableCollectionUpsert(input: $input)
    }
  `;

  if (args.dryRun) {
    console.log('Dry run — variableCollectionUpsert input:');
    console.log(JSON.stringify({ input }, null, 2));
    process.exit(0);
  }

  await gql(mutation, { input }, headers);
  console.log(
    `OK: set ${Object.keys(variables).length} variable(s) on service ${serviceId}.`
  );
  if (args.skipDeploys) {
    console.log('skipDeploys was true — trigger a deploy in Railway when ready.');
  }
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
