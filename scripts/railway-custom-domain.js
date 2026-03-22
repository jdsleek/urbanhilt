#!/usr/bin/env node
/**
 * Attach a custom hostname — only needs RAILWAY_TOKEN + RAILWAY_PROJECT_ID
 * (environment + app service are auto-resolved). Loads ../.env if present.
 *
 *   node scripts/railway-custom-domain.js [--domain www.urbanhilt.com] [--dry-run]
 */

try {
  require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
} catch (_) {}

const {
  graphql: railGql,
  resolveProjectToken,
  resolveTargets,
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
  let domain = 'www.urbanhilt.com';
  let dryRun = false;
  let serviceName = null;
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--domain') domain = argv[++i];
    else if (argv[i] === '--dry-run') dryRun = true;
    else if (argv[i] === '--service-name') serviceName = argv[++i];
    else if (argv[i] === '--help' || argv[i] === '-h') {
      console.log(`Usage: node scripts/railway-custom-domain.js [options]
  --domain www.urbanhilt.com
  --service-name <substring>   if auto-detect picks the wrong service
  --dry-run

Needs: RAILWAY_TOKEN + RAILWAY_PROJECT_ID  OR  RAILWAY_PROJECT_TOKEN`);
      process.exit(0);
    }
  }
  return {
    domain: domain.replace(/^https?:\/\//i, '').replace(/\/$/, ''),
    dryRun,
    serviceName,
  };
}

async function main() {
  const { domain, dryRun, serviceName } = parseArgs(process.argv);
  const headers = authHeaders();
  if (!headers) {
    console.error('Set RAILWAY_TOKEN or RAILWAY_PROJECT_TOKEN.');
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
    console.error(
      'Set RAILWAY_PROJECT_ID (with Bearer token) or use RAILWAY_PROJECT_TOKEN.'
    );
    process.exit(1);
  }

  const targets = await resolveTargets({
    endpoint: ENDPOINT,
    headers,
    projectId,
    environmentId,
    serviceId,
    serviceNameHint: serviceName,
  });

  const input = {
    projectId: targets.projectId,
    environmentId: targets.environmentId,
    serviceId: targets.serviceId,
    domain,
  };

  const mutation = `
    mutation customDomainCreate($input: CustomDomainCreateInput!) {
      customDomainCreate(input: $input) {
        id
        domain
        serviceId
        environmentId
      }
    }
  `;

  if (dryRun) {
    console.log(JSON.stringify({ input }, null, 2));
    return;
  }

  const data = await gql(mutation, { input }, headers);
  console.log('Custom domain:', JSON.stringify(data.customDomainCreate, null, 2));
  console.log(
    '\nAdd DNS per Railway’s domain card (see docs/GODADDY-APEX-DNS.md).'
  );
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
