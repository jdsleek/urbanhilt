# Product image recovery — audit checklist (internal)

Use this before telling a client that lost uploads **can** be recovered. In most Railway/ephemeral-disk cases they **cannot** be recovered without a human-held copy or a real backup.

## What the app stores

- **Postgres `products.images`:** JSON array of **path strings** only (e.g. `["/uploads/uuid.jpeg"]`). **No image bytes.**
- **Files:** Written under **`UPLOADS_DIR`** (or `./uploads`) on the **web service**. Without a **Railway Volume**, that folder is **ephemeral** and is **not** restored by git rollback or “old deployment” rollback.

## Automated checks (repo / public web)

| Check | Command / action | Urban Hilt result (as of audit) |
|--------|-------------------|----------------------------------|
| Live site serves images | `npm run audit:images -- https://www.urbanhilt.com` | **0 / 100** URLs return `image/*` (all missing or 404) |
| Git history contains `uploads/` | `git log --all -- uploads/` | **No commits** (folder gitignored) |
| GitHub commits on `uploads/` | `GET .../commits?path=uploads` | **[]** |
| Internet Archive (CDX / `web/0/…`) | Sample `/uploads/<uuid>.jpeg` | **No captures** |
| Google cache | `webcache.googleusercontent.com/search?q=cache:...` | Not a usable image recovery path (HTML / no file) |

## Checks only the account owner can do (Railway / client)

| Check | Where | If positive |
|--------|--------|-------------|
| **Volume backups** | Railway → Volume → Backups | Restore or download backup → copy files into current `UPLOADS_DIR` with **same filenames** as in DB |
| **Second service / env** | Another deployment URL that still had disk (rare) | `curl -I https://OTHER.up.railway.app/uploads/<file>` → 200 `image/*` → temporary `PUBLIC_UPLOADS_FALLBACK_BASE` then copy files |
| **Railway support / incident** | Support ticket | Only if platform or incident promised retention (unusual for ephemeral layer) |
| **Client devices** | Phone, PC, WhatsApp, email, supplier | Re-upload originals |

## What to tell the client (accurate)

- **If** none of the owner-only checks find a backup or second copy: **the original upload files are not recoverable from the database or from a normal code rollback.** Paths in the DB remain; **re-upload** (or replace with new assets) is required.
- **Going forward:** Volume + `UPLOADS_DIR` (already documented) prevents **new** uploads from disappearing on deploy.

## Scripts in this repo

- `npm run audit:images -- <https://your-site>` — which `/uploads/...` URLs fail
- `npm run query:image-storage` — proves DB column is text paths only (needs `DATABASE_URL`)
