#!/usr/bin/env node
/**
 * Read-only Railway backup posture audit for Urban Hilt.
 *
 * Checks:
 * - web service upload volume mount/state/size
 * - Railway volume backup list/schedules
 * - live health/catalog/image availability
 *
 *   npm run backup:audit
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

function authHeaders() {
  const pt = process.env.RAILWAY_PROJECT_TOKEN?.trim();
  const bt = process.env.RAILWAY_TOKEN?.trim();
  if (pt) return { 'Project-Access-Token': pt };
  if (bt) return { Authorization: `Bearer ${bt}` };
  throw new Error('Set RAILWAY_TOKEN or RAILWAY_PROJECT_TOKEN.');
}

function baseUrl() {
  return (process.env.PUBLIC_SITE_URL || 'https://www.urbanhilt.com').replace(/\/$/, '');
}

async function fetchJson(url) {
  const res = await fetch(url);
  const text = await res.text();
  try {
    return { ok: res.ok, status: res.status, json: JSON.parse(text) };
  } catch {
    return { ok: res.ok, status: res.status, snippet: text.slice(0, 200) };
  }
}

async function head(url) {
  const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
  return { status: res.status, type: res.headers.get('content-type') || '' };
}

async function main() {
  const headers = authHeaders();
  let projectId = process.env.RAILWAY_PROJECT_ID?.trim();
  let environmentId = process.env.RAILWAY_ENVIRONMENT_ID?.trim();
  let serviceId = process.env.RAILWAY_SERVICE_ID?.trim();
  if (process.env.RAILWAY_PROJECT_TOKEN) {
    const t = await resolveProjectToken(ENDPOINT, headers);
    projectId = projectId || t.projectId;
    environmentId = environmentId || t.environmentId;
  }
  if (!projectId) throw new Error('Set RAILWAY_PROJECT_ID.');

  const targets = await resolveTargets({
    endpoint: ENDPOINT,
    headers,
    projectId,
    environmentId,
    serviceId,
    serviceNameHint: 'urbanhilt',
  });

  const envData = await railGql(
    ENDPOINT,
    `query Env($environmentId:String!, $projectId:String!){
      environment(id:$environmentId, projectId:$projectId){
        volumeInstances {
          edges {
            node {
              id
              mountPath
              state
              currentSizeMB
              sizeMB
              serviceId
              createdAt
              volume { name }
            }
          }
        }
      }
    }`,
    { environmentId: targets.environmentId, projectId: targets.projectId },
    headers
  );

  const volumeInstances = envData.environment.volumeInstances.edges.map((e) => e.node);
  const uploadVolume =
    volumeInstances.find((v) => v.serviceId === targets.serviceId && v.mountPath === '/data/uploads') ||
    volumeInstances.find((v) => /urbanhilt/i.test(v.volume?.name || ''));

  let backupInfo = null;
  if (uploadVolume) {
    backupInfo = await railGql(
      ENDPOINT,
      `query B($id:String!){
        volumeInstanceBackupList(volumeInstanceId:$id){
          id name createdAt expiresAt usedMB referencedMB volumeInstanceSizeMB scheduleId
        }
        volumeInstanceBackupScheduleList(volumeInstanceId:$id){
          id name kind cron retentionSeconds createdAt
        }
      }`,
      { id: uploadVolume.id },
      headers
    );
  }

  const base = baseUrl();
  const health = await fetchJson(`${base}/api/health`).catch((e) => ({ ok: false, error: e.message }));
  const productsPayload = await fetchJson(`${base}/api/products?limit=1000`).catch((e) => ({ ok: false, error: e.message }));
  const products = productsPayload.json?.products || [];
  const uploadUrls = new Set();
  for (const product of products) {
    for (const image of product.images || []) {
      if (typeof image === 'string' && image.startsWith('/uploads/')) uploadUrls.add(image);
    }
  }
  const sample = [];
  for (const path of [...uploadUrls].slice(0, 25)) {
    const result = await head(`${base}${path}`).catch((e) => ({ error: e.message }));
    sample.push({ path, ...result });
  }

  const report = {
    checkedAt: new Date().toISOString(),
    site: base,
    railway: {
      environmentId: targets.environmentId,
      serviceId: targets.serviceId,
      uploadVolume: uploadVolume
        ? {
            id: uploadVolume.id,
            name: uploadVolume.volume?.name,
            mountPath: uploadVolume.mountPath,
            state: uploadVolume.state,
            currentSizeMB: uploadVolume.currentSizeMB,
            sizeMB: uploadVolume.sizeMB,
            createdAt: uploadVolume.createdAt,
          }
        : null,
      backups: backupInfo?.volumeInstanceBackupList || [],
      backupSchedules: backupInfo?.volumeInstanceBackupScheduleList || [],
    },
    live: {
      health,
      productCount: products.length,
      uploadImageRefs: uploadUrls.size,
      uploadImageSample: sample,
    },
    recommendations: [],
  };

  if (!uploadVolume) report.recommendations.push('Attach a Railway volume to the web service at /data/uploads and set UPLOADS_DIR=/data/uploads.');
  if (uploadVolume && !report.railway.backupSchedules.length) report.recommendations.push('Enable Railway volume backups for urbanhilt-volume from the Railway dashboard or with an owner token.');
  if (uploadVolume && Number(uploadVolume.currentSizeMB || 0) === 0) report.recommendations.push('Upload volume currently reports 0 MB; existing /uploads files are not present on the mounted volume.');
  if (!products.length) report.recommendations.push('Live catalog has no products; restore/migrate source DB before opening Admin for production edits.');
  if (products.length && !uploadUrls.size) report.recommendations.push('Current product images are external URLs, not recoverable uploaded files. Re-upload client-owned product images into /data/uploads for durable storage.');

  console.log(JSON.stringify(report, null, 2));
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
