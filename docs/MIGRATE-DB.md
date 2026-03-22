# Migrate catalog / orders from old Postgres → client Postgres

The app stores **categories, products, orders, etc.** in PostgreSQL. **Uploaded** product images are stored as paths like `/uploads/xyz.jpg` on the server disk — the DB only holds those paths (or external URLs).

## 1. Connection strings

Run the migration from your laptop (or any host) that can open **both** databases over the internet.

- In **Railway** → **Postgres** service → **Connect** / **Variables**: copy the **public** `DATABASE_URL` (or host that is **not** `postgres.railway.internal`).
- **Internal** URLs only work **inside** Railway; they will **fail** from your Mac.

You need:

| Variable | Meaning |
|----------|---------|
| `SOURCE_DATABASE_URL` | Old project (where the client added real products). |
| `TARGET_DATABASE_URL` | Client live project (where `www.urbanhilt.com` points). |

## 2. Dry run (row counts)

```bash
export SOURCE_DATABASE_URL='postgres://...old...'
export TARGET_DATABASE_URL='postgres://...client...'
node scripts/migrate-db.js --dry-run
```

## 3. Full copy (replaces all data on target)

**Warning:** `--replace` **truncates** all listed tables on the **target** (orders, customers, products, categories, admin users, staff, discounts, etc.).

```bash
export SOURCE_DATABASE_URL='postgres://...old...'
export TARGET_DATABASE_URL='postgres://...client...'
node scripts/migrate-db.js --replace
```

## 4. Images that live under `/uploads/`

Those files are **not** inside Postgres.

**Option A — Quick:** Point image paths at the **old** public app URL so the new site loads images from the old deployment until you move files:

```bash
export SOURCE_DATABASE_URL='...'
export TARGET_DATABASE_URL='...'
node scripts/migrate-db.js --replace --rewrite-uploads-base https://YOUR-OLD-SERVICE.up.railway.app
```

**Option B — Proper:** Copy the `uploads/` folder from the old deployment to the new one (same paths), then **do not** use `--rewrite-uploads-base`. On Railway you may use volume backup/restore or redeploy with files — depends on your setup.

External image URLs (e.g. Unsplash) in the DB are unchanged and keep working.

## 5. After migration

- Redeploy or restart the **client** Node service if needed.
- Check `https://www.urbanhilt.com/api/categories` and a few product pages.
- If **admin** password came from the old DB, log in with that password; otherwise reset via seed or SQL.

Never commit `SOURCE_DATABASE_URL` / `TARGET_DATABASE_URL` or paste them into public chats.
