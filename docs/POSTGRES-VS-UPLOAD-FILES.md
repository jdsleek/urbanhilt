# Postgres persists — so why did product photos disappear?

## Two different things

| What | Where it lives | On Railway |
|------|----------------|------------|
| **Product catalog** (names, prices, stock, **image paths** like `/uploads/abc.jpg`) | **PostgreSQL** | **Persists.** Survives redeploys. This is your “database.” |
| **The actual photo files** (JPEG/PNG bytes) | **Server disk** (`uploads/` or `UPLOADS_DIR`) | **Ephemeral by default.** The app container’s filesystem is rebuilt on deploy; files that were only on that disk are **gone** unless you use a **Volume** + `UPLOADS_DIR`. |

This app stores **only paths** in Postgres (`products.images` JSON), not the image binary. So the database is “persistent” and correct — the **files** those paths point to were on disposable disk.

## Why they look “deleted”

- **Redeploy** (new commit, settings change, scale, etc.) → new container → empty `uploads/` unless you use a mounted volume.
- **No backup** of the `uploads/` folder → nothing to restore from.
- **Not a Postgres bug** — Postgres never held the JPEG data in this schema.

## What we implemented in code

- **`UPLOADS_DIR`** — put uploads on a **Railway Volume** path so **new** files survive deploys (see `docs/DATA-NOT-SHOWING.md`).
- **`PUBLIC_UPLOADS_FALLBACK_BASE`** — optional: if **another URL** still serves the same `/uploads/filename`, www can **redirect** there until you copy files into the volume.
- **Audit:** `npm run audit:images -- https://www.urbanhilt.com` — lists which `/uploads/...` URLs don’t return an image.

We did **not** change Postgres to store image blobs (that would be a larger product change: S3/R2 or bytea in DB).

## Checking “another URL” for old files

Only **you** can see the exact **`https://xxxx.up.railway.app`** for the **Node/web** service in **Railway → Service → Settings → Networking / Domains**.

1. Copy that default Railway URL (not `www` if they differ).
2. In a browser or terminal:  
   `curl -I "https://YOUR-SERVICE.up.railway.app/uploads/PASTE-A-FILENAME-FROM-ADMIN.jpeg"`  
   If you get **200** and `content-type: image/...`, set **`PUBLIC_UPLOADS_FALLBACK_BASE=https://YOUR-SERVICE.up.railway.app`** on the **www** service (see `.env.example`).
3. A random hostname from old docs (e.g. DNS examples) is **not** reliable — it may be another project or deleted.

If **every** URL returns **404** for those filenames, the bytes are gone from Railway; only **re-upload** or a **backup** of `uploads/` can bring them back.
