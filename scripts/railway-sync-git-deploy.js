#!/usr/bin/env node
/**
 * If Railway keeps rebuilding an old commit (e.g. /api/store-config 404 while GitHub main is ahead),
 * the service may be disconnected from GitHub or stuck on a stale ref. This script:
 *   1) Re-links the repo + branch on the app service (serviceConnect)
 *   2) Triggers a deploy from the latest commit on that branch (serviceInstanceDeploy latestCommit: true)
 *
 * Requires .env: RAILWAY_TOKEN + RAILWAY_PROJECT_ID (same as other railway-* scripts).
 *
 * Optional env:
 *   RAILWAY_GITHUB_REPO   default: jdsleek/urbanhilt
 *   RAILWAY_GITHUB_BRANCH default: main
 *
 * Usage: node scripts/railway-sync-git-deploy.js
 */
try {
  require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
} catch (_) {}

const {
  graphql: gql,
  resolveProjectToken,
  resolveTargets,
} = require('./railway-resolve.js');

const ENDPOINT =
  process.env.RAILWAY_GRAPHQL_URL || 'https://backboard.railway.com/graphql/v2';

function authHeaders() {
  const pt = process.env.RAILWAY_PROJECT_TOKEN?.trim();
  const bt = process.env.RAILWAY_TOKEN?.trim();
  if (pt) return { 'Project-Access-Token': pt };
  if (bt) return { Authorization: `Bearer ${bt}` };
  return null;
}

async function main() {
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
    serviceNameHint: null,
  });

  const repo = (process.env.RAILWAY_GITHUB_REPO || 'jdsleek/urbanhilt').trim();
  const branch = (process.env.RAILWAY_GITHUB_BRANCH || 'main').trim();

  const connectM = `
    mutation C($id: String!, $input: ServiceConnectInput!) {
      serviceConnect(id: $id, input: $input) { id name }
    }
  `;
  await gql(ENDPOINT, connectM, {
    id: targets.serviceId,
    input: { repo, branch },
  }, headers);
  console.log(`OK: serviceConnect → ${repo} @ ${branch}`);

  const deployM = `
    mutation D($e: String!, $s: String!) {
      serviceInstanceDeploy(environmentId: $e, serviceId: $s, latestCommit: true)
    }
  `;
  const r = await gql(ENDPOINT, deployM, {
    e: targets.environmentId,
    s: targets.serviceId,
  }, headers);
  console.log(`OK: serviceInstanceDeploy(latestCommit: true) → ${r.serviceInstanceDeploy}`);
  console.log('Wait for BUILD → SUCCESS, then verify GET /api/store-config on your domain.');
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
