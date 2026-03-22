# Client Railway vs your Railway (dual deploy)

| Where | Role |
|--------|------|
| **Your** Railway | Staging / experiments — usually no production domain. |
| **Client’s** Railway | **Production** — [www.urbanhilt.com](https://www.urbanhilt.com/), live `DATABASE_URL`. |

## What you need locally

In **`.env`** (gitignored):

- **`RAILWAY_TOKEN`** — account or workspace token with access to the **client** project  
- **`RAILWAY_PROJECT_ID`** — client project UUID  

Scripts infer **environment** (prefers `production`) and **app service** (skips Postgres/Redis/etc.). Override with **`--service-name`** only if it picks the wrong service.

Optional: **`RAILWAY_PROJECT_TOKEN`** instead of token + project id (project settings → tokens).

## Push env vars to the client project

```bash
npm run railway:set-env -- --env-file .env.railway
```

(`--service-name foo` if auto-detect isn’t the right service.)

### Live site has no database (`DATABASE_URL` missing)

1. Try the reference (works when Railway resolves it):

```bash
npm run railway:link-postgres
```

2. If deploy logs show **`DATABASE_URL environment variable is not set`** but the variable shows `${{Postgres.DATABASE_URL}}` in the dashboard, Railway may **not resolve** that reference for a **Postgres plugin** (no `DATABASE_URL` on the DB service). **Materialize** the internal URL from `POSTGRES_*` vars:

```bash
npm run railway:materialize-db-url
```

Then wait for redeploy and check `https://www.urbanhilt.com/api/health` → `"database": true`.  
After using `materialize-db-url`, consider **rotating the Postgres password** in Railway (credentials were used to build the URL).

**502 / “Application failed to respond”:** Railway often expects **`PORT=8080`** (or whatever Railway sets — do **not** force `3000` in service variables unless it matches the platform). The Node app uses `process.env.PORT`; if it listens on the wrong port, the proxy never reaches the app.

## Custom domain via API (optional)

```bash
npm run railway:add-domain -- --domain www.urbanhilt.com
```

Same token + project id; service is auto-resolved. Or add the domain in **Railway → Networking**.

Set **`PUBLIC_SITE_URL=https://www.urbanhilt.com`** in the pushed vars so `/api/store-config` includes `siteUrl`.

## Live site stuck on an old GitHub commit

Symptoms: **GitHub `main` is ahead** (new routes, e.g. `GET /api/store-config`), but production still returns **`{"error":"Not found"}`** for those paths while older API routes work. Redeploy from the dashboard may keep the **same commit** if the service lost its GitHub trigger / stale link.

Fix from this repo (uses `RAILWAY_TOKEN` + `RAILWAY_PROJECT_ID` in `.env`):

```bash
npm run railway:sync-git-deploy
```

This runs Railway’s **`serviceConnect`** for `jdsleek/urbanhilt` @ `main`, then **`serviceInstanceDeploy(..., latestCommit: true)`**. Override repo/branch with **`RAILWAY_GITHUB_REPO`** / **`RAILWAY_GITHUB_BRANCH`** if needed.

## Admin vs www — different data?

If **Railway “View site”** shows new products but **www.urbanhilt.com** does not, you have **two deployments or two databases**. See **`docs/DATABASE-DOMAIN-MISMATCH.md`**. Run:

```bash
npm run railway:diagnose
npm run railway:diagnose -- --compare-url https://YOUR.up.railway.app https://www.urbanhilt.com
```

## Security

Never commit **`.env`**, tokens, or filled **`.env.railway`**. Rotate any token that was pasted in chat.
