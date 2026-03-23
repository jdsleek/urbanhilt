#!/usr/bin/env node
/**
 * Create a persistent Railway Volume for product uploads and set UPLOADS_DIR.
 *
 * Requires .env: RAILWAY_TOKEN + RAILWAY_PROJECT_ID (or RAILWAY_PROJECT_TOKEN).
 * Optional: RAILWAY_SERVICE_ID / RAILWAY_ENVIRONMENT_ID, --service-name, --dry-run
 *
 *   node scripts/railway-setup-uploads-volume.js
 *   node scripts/railway-setup-uploads-volume.js --mount-path /data/uploads --dry-run
 *
 * Region defaults to the first key in deployment meta.multiRegionConfig, or
 * RAILWAY_VOLUME_REGION override.
 *
 * @see docs/DATA-NOT-SHOWING.md
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
  let dryRun = false;
  let mountPath = '/data/uploads';
  let serviceName = null;
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--dry-run') dryRun = true;
    else if (argv[i] === '--mount-path') mountPath = argv[++i];
    else if (argv[i] === '--service-name') serviceName = argv[++i];
  }
  return { dryRun, mountPath, serviceName };
}

async function fetchRegionForService(serviceId, headers) {
  const envRegion = process.env.RAILWAY_VOLUME_REGION?.trim();
  if (envRegion) return envRegion;

  const q = `
    query S($id: String!) {
      service(id: $id) {
        serviceInstances {
          edges {
            node {
              latestDeployment {
                meta
              }
            }
          }
        }
      }
    }
  `;
  const d = await gql(q, { id: serviceId }, headers);
  const edges = d.service?.serviceInstances?.edges || [];
  for (const e of edges) {
    const m = e.node?.latestDeployment?.meta;
    const mmc = m?.serviceManifest?.deploy?.multiRegionConfig;
    if (mmc && typeof mmc === 'object') {
      const keys = Object.keys(mmc);
      if (keys.length) return keys[0];
    }
  }
  throw new Error(
    'Could not infer region. Set RAILWAY_VOLUME_REGION (e.g. europe-west4-drams3a).'
  );
}

async function listVolumeNames(projectId, headers) {
  const q = `
    query V($projectId: String!) {
      project(id: $projectId) {
        volumes { edges { node { id name } } }
      }
    }
  `;
  const d = await gql(q, { projectId }, headers);
  return (d.project?.volumes?.edges || []).map((e) => e.node.name);
}

async function main() {
  const args = parseArgs(process.argv);
  const headers = authHeaders();
  if (!headers) {
    console.error('Set RAILWAY_TOKEN or RAILWAY_PROJECT_TOKEN.');
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
    console.error('Set RAILWAY_PROJECT_ID (with account token) or use RAILWAY_PROJECT_TOKEN.');
    process.exit(1);
  }

  const targets = await resolveTargets({
    endpoint: ENDPOINT,
    headers,
    projectId,
    environmentId,
    serviceId,
    serviceNameHint: args.serviceName,
  });

  const region = await fetchRegionForService(targets.serviceId, headers);
  console.warn(`→ Inferred volume region: ${region}`);

  const existing = await listVolumeNames(targets.projectId, headers);
  if (existing.length) {
    console.warn('→ Existing project volumes:', existing.join(', '));
  }

  const input = {
    projectId: targets.projectId,
    environmentId: targets.environmentId,
    serviceId: targets.serviceId,
    mountPath: args.mountPath,
    region,
  };

  const mutation = `
    mutation Vc($input: VolumeCreateInput!) {
      volumeCreate(input: $input) {
        id
        name
      }
    }
  `;

  const upsert = `
    mutation variableCollectionUpsert($input: VariableCollectionUpsertInput!) {
      variableCollectionUpsert(input: $input)
    }
  `;

  if (args.dryRun) {
    console.log('Dry run — would call volumeCreate with:', JSON.stringify(input, null, 2));
    console.log('Then set UPLOADS_DIR=', args.mountPath);
    process.exit(0);
  }

  let vol;
  try {
    const d = await gql(mutation, { input }, headers);
    vol = d.volumeCreate;
    console.warn(`→ Created volume: ${vol.name} (${vol.id})`);
  } catch (e) {
    if (/already|exist|duplicate/i.test(e.message)) {
      console.warn('→ volumeCreate failed (volume may already exist):', e.message);
    } else {
      throw e;
    }
  }

  await gql(
    upsert,
    {
      input: {
        projectId: targets.projectId,
        environmentId: targets.environmentId,
        serviceId: targets.serviceId,
        variables: { UPLOADS_DIR: args.mountPath },
      },
    },
    headers
  );
  console.warn(`→ Set UPLOADS_DIR=${args.mountPath} on service (triggers deploy).`);
  console.warn(
    '→ Old images are still missing until re-uploaded or copied into the volume. See docs/POSTGRES-VS-UPLOAD-FILES.md'
  );
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
