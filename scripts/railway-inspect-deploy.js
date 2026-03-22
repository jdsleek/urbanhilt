#!/usr/bin/env node
/**
 * One-off: list latest deployment + recent logs for urbanhilt service.
 * Loads ../.env (RAILWAY_TOKEN, RAILWAY_PROJECT_ID).
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

const gql = (q, v, h) => railGql(ENDPOINT, q, v, h);

function authHeaders() {
  const pt = process.env.RAILWAY_PROJECT_TOKEN?.trim();
  const bt = process.env.RAILWAY_TOKEN?.trim();
  if (pt) return { 'Project-Access-Token': pt };
  if (bt) return { Authorization: `Bearer ${bt}` };
  return null;
}

async function main() {
  const headers = authHeaders();
  if (!headers) throw new Error('No RAILWAY_TOKEN');

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

  const q1 = `
    query S($sid: String!) {
      service(id: $sid) {
        id
        name
        serviceInstances {
          edges {
            node {
              latestDeployment {
                id
                status
                url
                staticUrl
                createdAt
                meta
              }
            }
          }
        }
      }
    }
  `;
  const d1 = await gql(q1, { sid: targets.serviceId }, headers);
  const svc = d1.service;
  console.log('Service:', svc?.name, svc?.id);
  const edges = svc?.serviceInstances?.edges || [];
  let depId = null;
  let depStatus = null;
  for (const e of edges) {
    const ld = e.node?.latestDeployment;
    if (ld?.id) {
      depId = ld.id;
      depStatus = ld.status;
      console.log('\nLatest deployment:', ld.id, 'status=', ld.status);
      console.log('url=', ld.url, 'staticUrl=', ld.staticUrl);
      if (ld.meta) console.log('meta=', JSON.stringify(ld.meta).slice(0, 500));
    }
  }

  if (!depId) {
    console.log('\nNo latestDeployment on serviceInstances — trying deployments list...');
    const q2 = `
      query Deps($input: DeploymentListInput!, $first: Int!) {
        deployments(input: $input, first: $first) {
          edges {
            node {
              id
              status
              url
              staticUrl
              createdAt
              serviceId
            }
          }
        }
      }
    `;
    for (const input of [
      { projectId, environmentId, serviceId: targets.serviceId },
      { projectId, environmentId },
    ]) {
      try {
        const d2 = await gql(q2, { input, first: 5 }, headers);
        const es = d2.deployments?.edges || [];
        console.log('deployments count', es.length, 'input', JSON.stringify(input));
        for (const e of es) {
          const n = e.node;
          console.log(' ', n.id, n.status, n.serviceId, n.url);
          if (!depId && n.serviceId === targets.serviceId) {
            depId = n.id;
            depStatus = n.status;
          }
        }
        if (es.length) break;
      } catch (err) {
        console.log('deployments query failed:', err.message);
      }
    }
  }

  if (depId) {
    const q3 = `
      query Logs($deploymentId: String!, $limit: Int!) {
        deploymentLogs(deploymentId: $deploymentId, limit: $limit) {
          message
          severity
          timestamp
        }
      }
    `;
    try {
      const logs = await gql(q3, { deploymentId: depId, limit: 80 }, headers);
      const arr = logs.deploymentLogs;
      const list = Array.isArray(arr) ? arr : arr ? [arr] : [];
      console.log('\n--- Last', list.length, 'log lines ---');
      for (const row of list.slice(-40)) {
        const sev = row.severity || '';
        console.log((row.timestamp || '').slice(11, 23), sev, (row.message || '').slice(0, 500));
      }
    } catch (e) {
      console.log('deploymentLogs error:', e.message);
    }
  }

  const vq = `
    query V($projectId: String!, $environmentId: String!, $serviceId: String!) {
      variables(projectId: $projectId, environmentId: $environmentId, serviceId: $serviceId, unrendered: true)
    }
  `;
  const v = await gql(
    vq,
    {
      projectId: targets.projectId,
      environmentId: targets.environmentId,
      serviceId: targets.serviceId,
    },
    headers
  );
  const vars = v.variables || {};
  console.log('\n--- Key variables (unrendered) ---');
  for (const k of ['PORT', 'NODE_ENV', 'DATABASE_URL', 'NIXPACKS_', 'RAILWAY_']) {
    for (const key of Object.keys(vars).sort()) {
      if (key === k || key.startsWith(k)) {
        let val = vars[key];
        if (key === 'DATABASE_URL' && val && !String(val).includes('${{'))
          val = '[redacted connection string]';
        console.log(key, '=', String(val).slice(0, 120));
      }
    }
  }
  console.log('PORT =', vars.PORT);
  console.log('NODE_ENV =', vars.NODE_ENV);
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
