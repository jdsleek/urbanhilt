/**
 * Resolve Railway environment + app service from projectId + API token.
 * Token + project id only — no manual ENVIRONMENT_ID / SERVICE_ID.
 */

const DB_SERVICE_RE =
  /postgres|redis|mysql|mongo|database|supabase|neon|pg\b|clickhouse|elasticsearch/i;

async function graphql(endpoint, query, variables, headers) {
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${JSON.stringify(json)}`);
  }
  if (json.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join('; '));
  }
  return json.data;
}

async function resolveProjectToken(endpoint, headers) {
  const data = await graphql(
    endpoint,
    `query { projectToken { projectId environmentId } }`,
    {},
    headers
  );
  const t = data.projectToken;
  if (!t?.projectId || !t?.environmentId) {
    throw new Error('projectToken query returned no projectId/environmentId');
  }
  return { projectId: t.projectId, environmentId: t.environmentId };
}

async function fetchProjectLayout(endpoint, projectId, headers) {
  const qProj = `
    query Project($id: String!) {
      project(id: $id) {
        id
        name
        baseEnvironmentId
        services {
          edges {
            node {
              id
              name
            }
          }
        }
      }
    }
  `;
  const qEnv = `
    query Envs($projectId: String!) {
      environments(projectId: $projectId) {
        edges {
          node {
            id
            name
          }
        }
      }
    }
  `;
  const projData = await graphql(endpoint, qProj, { id: projectId }, headers);
  const project = projData.project;
  if (!project) {
    throw new Error(`No project found for id ${projectId}`);
  }

  let environments = null;
  try {
    const envData = await graphql(endpoint, qEnv, { projectId }, headers);
    environments = envData.environments;
  } catch (e) {
    /* use baseEnvironmentId */
  }

  return { ...project, environments };
}

function resolveEnvironmentId(layout) {
  const edges = layout.environments?.edges || [];
  if (edges.length) {
    const bySlug = (re) =>
      edges.find((e) => re.test(String(e.node.name || '').toLowerCase()));
    const prod =
      bySlug(/^production$/) ||
      bySlug(/production/) ||
      bySlug(/^prod$/) ||
      bySlug(/^primary$/);
    const chosen = prod || edges[0];
    return {
      id: chosen.node.id,
      name: chosen.node.name || chosen.node.id,
    };
  }
  if (layout.baseEnvironmentId) {
    return { id: layout.baseEnvironmentId, name: '(base environment)' };
  }
  throw new Error(
    'Could not resolve environment: no environments list and no baseEnvironmentId on project.'
  );
}

function pickServiceBySubstring(services, nameSubstr) {
  const n = nameSubstr.toLowerCase();
  const edges = services?.edges || [];
  const matches = edges.filter((e) =>
    (e.node.name || '').toLowerCase().includes(n)
  );
  if (matches.length === 1) {
    return { id: matches[0].node.id, name: matches[0].node.name };
  }
  if (matches.length === 0) {
    throw new Error(
      `No service matching "${nameSubstr}". Available: ${edges
        .map((e) => e.node.name)
        .join(', ') || '(none)'}`
    );
  }
  throw new Error(
    `Multiple services match "${nameSubstr}": ${matches
      .map((e) => e.node.name)
      .join(', ')} — pass a more specific --service-name`
  );
}

function inferAppService(services) {
  const edges = services?.edges || [];
  if (!edges.length) {
    throw new Error('Project has no services');
  }
  const nodes = edges.map((e) => e.node);
  const appLike = nodes.filter((s) => !DB_SERVICE_RE.test(s.name || ''));
  if (appLike.length === 1) {
    return { id: appLike[0].id, name: appLike[0].name };
  }
  if (appLike.length === 0) {
    throw new Error(
      'Only database/plugin-like services found; cannot infer the Node web service. Pass --service-name.'
    );
  }
  const score = (name) => {
    const n = String(name || '').toLowerCase();
    let s = 0;
    if (n.includes('urbanhilt')) s += 10;
    if (n.includes('urban')) s += 5;
    if (n.includes('hilt')) s += 5;
    if (n.includes('web')) s += 3;
    if (n.includes('app')) s += 2;
    if (n.includes('server')) s += 2;
    if (n.includes('api')) s += 1;
    return s;
  };
  const ranked = appLike
    .map((s) => ({ ...s, sc: score(s.name) }))
    .sort((a, b) => b.sc - a.sc);
  const best = ranked[0];
  if (ranked.length > 1 && ranked[1].sc === best.sc && best.sc === 0) {
    console.warn(
      `Multiple services look like the app (${appLike.map((s) => s.name).join(', ')}). Using "${best.name}". Use --service-name to pick another.`
    );
  } else if (ranked.length > 1 && best.sc > 0) {
    console.warn(`Using service "${best.name}" (best name match).`);
  }
  return { id: best.id, name: best.name };
}

/**
 * @param {object} opts
 * @param {string} opts.endpoint
 * @param {object} opts.headers - auth headers
 * @param {string} opts.projectId
 * @param {string} [opts.environmentId]
 * @param {string} [opts.serviceId]
 * @param {string|null} [opts.serviceNameHint] - --service-name
 */
async function resolveTargets(opts) {
  const {
    endpoint,
    headers,
    projectId,
    environmentId: envIn,
    serviceId: svcIn,
    serviceNameHint,
  } = opts;

  const hint = serviceNameHint?.trim();
  const eIn = envIn?.trim();
  const sIn = svcIn?.trim();

  if (eIn && sIn && !hint) {
    return {
      projectId,
      environmentId: eIn,
      serviceId: sIn,
      layout: null,
    };
  }

  const layout = await fetchProjectLayout(endpoint, projectId, headers);

  let environmentId = eIn;
  if (!environmentId) {
    const e = resolveEnvironmentId(layout);
    environmentId = e.id;
    console.warn(`→ Railway environment: ${e.name} (${environmentId})`);
  }

  let serviceId = sIn;
  if (hint) {
    const s = pickServiceBySubstring(layout.services, hint);
    serviceId = s.id;
    console.warn(`→ Railway service: ${s.name} (${serviceId}) [${hint}]`);
  } else if (!serviceId) {
    const s = inferAppService(layout.services);
    serviceId = s.id;
    console.warn(`→ Railway service: ${s.name} (${serviceId})`);
  }

  return {
    projectId,
    environmentId,
    serviceId,
    layout,
  };
}

module.exports = {
  graphql,
  resolveProjectToken,
  fetchProjectLayout,
  resolveTargets,
  resolveEnvironmentId,
  inferAppService,
  pickServiceBySubstring,
};
