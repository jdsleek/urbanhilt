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

## Custom domain via API (optional)

```bash
npm run railway:add-domain -- --domain www.urbanhilt.com
```

Same token + project id; service is auto-resolved. Or add the domain in **Railway → Networking**.

Set **`PUBLIC_SITE_URL=https://www.urbanhilt.com`** in the pushed vars so `/api/store-config` includes `siteUrl`.

## Admin vs www — different data?

If **Railway “View site”** shows new products but **www.urbanhilt.com** does not, you have **two deployments or two databases**. See **`docs/DATABASE-DOMAIN-MISMATCH.md`**. Run:

```bash
npm run railway:diagnose
npm run railway:diagnose -- --compare-url https://YOUR.up.railway.app https://www.urbanhilt.com
```

## Security

Never commit **`.env`**, tokens, or filled **`.env.railway`**. Rotate any token that was pasted in chat.
