# Admin shows products / categories, customer site does not

## What’s going on

The storefront and Admin are the **same app**: both use **`DATABASE_URL`** on that deployment. There is **no** separate “customer DB” in code.

So if:

- **Railway → “View site”** / `*.up.railway.app` shows the new category and products, but  
- **`https://www.urbanhilt.com`** does not,

then customers are almost certainly hitting a **different deployment** or a **different Postgres** than the one where the client used Admin.

Typical setup mistake:

| Where the client uses Admin | Where `www` points |
|------------------------------|---------------------|
| **Your** Railway project (your Postgres) | **Client’s** Railway project (empty or old seed DB) |

Or: `www` is attached to **service A** while the client opens Admin on **service B** in the same project (rare but possible with duplicate services).

## Check from your machine

Uses `.env` (`RAILWAY_TOKEN`, `RAILWAY_PROJECT_ID`):

```bash
npm run railway:diagnose
```

Compare **live** JSON from the Railway URL (from the client’s dashboard “Open app”) vs production:

```bash
npm run railway:diagnose -- --compare-url https://XXXX.up.railway.app https://www.urbanhilt.com
```

If **category counts or `products.total` differ**, the two URLs use **different databases**.

## Fix (pick one)

### A — One production (recommended)

1. In **Railway → client project → Networking / Custom domains**, ensure **`www.urbanhilt.com`** (and `www`) is attached to the **same** `urbanhilt` (Node) service where the client uses **Admin** and where **`DATABASE_URL`** points at that project’s **Postgres** (often `${{Postgres.DATABASE_URL}}` or `postgres.railway.internal`).
2. Remove or repoint any **duplicate** Node service that still has the old domain.
3. Stop using **your** Railway URL for “real” content entry if `www` is meant to be canonical — or copy **`DATABASE_URL`** from the DB that has the data onto the service behind `www` (not ideal long term).

### B — New Postgres on the client account

If the client project’s Postgres is **empty** but `www` already points there:

1. Add **Postgres** in the **client** project (if missing).
2. Set **`DATABASE_URL`** on the **urbanhilt** service to that plugin (Railway variable reference).
3. **Redeploy**, then run **`npm run seed`** once against that URL (or restore a dump), **or** re-enter categories/products in Admin on the deployment behind `www`.

## Quick API checks (no Railway CLI)

```bash
curl -s https://www.urbanhilt.com/api/categories | jq '.categories | length'
curl -s "https://YOUR.railway.app/api/categories" | jq '.categories | length'
```

Same number and same slugs → same DB. Different → dual-DB / dual-deploy problem.
