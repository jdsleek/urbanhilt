# Migrate catalog / orders from old Postgres → client Postgres

The app stores **categories, products, orders, etc.** in PostgreSQL. **Uploaded** product images are stored as paths like `/uploads/xyz.jpg` on the server disk — the DB only holds those paths (or external URLs).

## 0. `postgres.railway.internal` will NOT work from your laptop

Hosts like **`postgres.railway.internal`** only resolve **inside** Railway’s private network. From your Mac you will see **`getaddrinfo ENOTFOUND`**.

**Do this instead:** open the **old** Railway project → **Postgres** → **Connect** (or **Variables**) and copy the **public** connection URL (often `*.proxy.rlwy.net` or `containers-*.railway.app` with a **port**).

Use the same for the **client** DB if needed (public URL), or build the client URL from the **urbanhilt** service variables after deploy.

## 1. Environment variables

| Variable | Meaning |
|----------|---------|
| `SOURCE_DATABASE_URL` | Old database (**public** URL from dashboard). |
| `TARGET_DATABASE_URL` | Client live database (**public** URL, or internal only if you run the script **inside** Railway). |

## 2. Dry run (row counts)

```bash
export SOURCE_DATABASE_URL='postgres://...old PUBLIC...'
export TARGET_DATABASE_URL='postgres://...client PUBLIC...'
node scripts/migrate-db.js --dry-run
```

## 3. Restore / merge (**does not delete** existing target rows)

Use **`--merge`** to **upsert** every row from the source into the target:

- Rows with the **same `id`** (or **`key`** for `site_settings`) are **updated** from the source.
- Rows that exist **only** on the target are **left as-is** (nothing “away” / extra tracking data is wiped by this mode).
- No `TRUNCATE`.

```bash
export SOURCE_DATABASE_URL='...'
export TARGET_DATABASE_URL='...'
node scripts/migrate-db.js --merge
```

Optional: add **`--rewrite-uploads-base https://OLD-SERVICE.up.railway.app`** so `/uploads/...` paths still load from the old app until you copy files.

If you hit **unique** errors (e.g. duplicate **slug** on products with different ids), resolve conflicts in SQL or use `--replace` on a **backup** first.

## 4. Full replace (**wipes** target tables)

**Warning:** **`--replace`** truncates all listed tables on the **target** (orders, customers, products, categories, admin users, staff, discounts, etc.).

```bash
node scripts/migrate-db.js --replace
```

## 5. Images under `/uploads/`

Those files are **not** in Postgres. Use **`--rewrite-uploads-base`** (see §3) or copy the **`uploads/`** folder to the new service.

## 6. After migration

- Redeploy the **client** `urbanhilt` service if needed (so code matches `main`, e.g. `/api/store-config`).
- Check `https://www.urbanhilt.com/api/health` and `/api/categories`.

## 7. Security

Never commit database URLs or paste them into chat/AI. **Rotate** any Postgres password that was ever exposed.
