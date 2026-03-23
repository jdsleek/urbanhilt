# “Some data still not showing” — what to check

Use this when **someone sees products/orders in Admin but customers see less**, or **images are broken**, or **only part of the old site’s data appeared**.

## Categories missing on the homepage or nav

- **Empty table:** If `GET /api/catalog-counts` shows **`categories: 0`**, add categories in **Admin → Categories** (or run **`npm run seed`** on that database once).
- **API error:** Open the browser **Network** tab and check **`/api/categories`** — should be **200** and a JSON array. **500** → check Railway logs (DB connection).
- **Same DB as admin:** Compare **`curl …/api/catalog-counts`** on **www** vs the URL where you use Admin (see §1).
- **Optional photos:** Set **Image URL** on each category in Admin so homepage cards use that image instead of the default icon.

## 1. Two different databases (most common)

Admin and the shop use the **same** `DATABASE_URL` **on the deployment you opened**. If the owner uses **Admin on one URL** (e.g. Railway’s `*.up.railway.app`) but customers use **`www`**, those can be **two apps** or **two Postgres** instances.

**Quick check** (replace URLs with yours):

```bash
curl -s https://www.urbanhilt.com/api/catalog-counts
curl -s https://YOUR-SERVICE.up.railway.app/api/catalog-counts
```

Same `products` and `categories` numbers → same catalog DB. **Different numbers** → fix networking / `DATABASE_URL` so **www** points at the service that has the data (see **`docs/DATABASE-DOMAIN-MISMATCH.md`**).

You can also compare:

```bash
curl -s "https://www.urbanhilt.com/api/products?limit=1" | head -c 400
```

## 2. Product images missing (migration / uploads)

**Why does Postgres “persist” but photos vanish?** The DB stores **paths**, not JPEG bytes — see **`docs/POSTGRES-VS-UPLOAD-FILES.md`**.

Rows can exist in Postgres but **image URLs** point to `/uploads/...` on **disk**. On a **new** Railway deploy, the **`uploads/`** folder is empty unless you **copy files** from the old server or re-upload in Admin.

**Symptom:** Product names/prices show, **thumbnails blank** or 404 in Network tab for `/uploads/...`.

**Fix:** Re-upload images in Admin, or copy `uploads/` from the old host, or migrate with **`--rewrite-uploads-base`** (see **`docs/MIGRATE-DB.md`**) so images load from the old public URL until files are copied.

### Persistent uploads (Railway) — stop losing files on every deploy

By default the app stores files under **`uploads/`** next to the code. On Railway that filesystem is **wiped when the service redeploys**; the database still has `/uploads/xyz.jpg` paths but the files are gone → **404** for those URLs.

**Low-risk production setup (no code behavior change beyond where files live):**

1. In Railway: **Volumes** → add a volume to your **web** service, mount path e.g. **`/data/uploads`**.
2. Set env var **`UPLOADS_DIR=/data/uploads`** on that service (must match the mount path).
3. Redeploy. New admin uploads go to the volume and **survive** redeploys.
4. **Already-lost files** are not recoverable from the app **unless** they still exist on another deployment; see §2b below. Otherwise re-upload in Admin or restore a backup into the volume (same filenames as in the DB).

The storefront still requests **`/uploads/...`**; only the server’s disk path is configurable via **`UPLOADS_DIR`**.

### 2b. “Overnight uploads” disappeared after deploy — temporary recovery

If staff uploaded photos and a **redeploy wiped disk**, the rows in Postgres are still there. The files might still exist on a **previous Railway URL** (the `*.up.railway.app` hostname for the same service) if that instance was not garbage-collected yet — **often they are gone**, but if you still have **any** URL that returns **200** + `image/*` for `GET /uploads/<filename>`, you can bridge the gap:

1. Set **`PUBLIC_UPLOADS_FALLBACK_BASE`** on **www**’s service to that origin, e.g. `https://YOUR-SERVICE.up.railway.app` (no trailing slash). **Must not** be the same hostname as the site (avoid redirect loops).
2. Redeploy. When a file is missing locally, the app **302-redirects** the browser to the same path on that host so images show again.
3. **Immediately** add a **Volume** + **`UPLOADS_DIR`**, then **copy** all files from the fallback host (or re-download) into the volume and **remove** `PUBLIC_UPLOADS_FALLBACK_BASE` when done.

Audit which filenames the DB references vs what returns an image:

```bash
npm run audit:images -- https://www.urbanhilt.com
```

## 3. Orders “missing” in Admin

- Set the filter to **All** (not only **Pending** or **Awaiting staff**).
- With **`REQUIRE_STAFF_CHECKOUT=true`**, new web orders are **Awaiting staff** until staff confirms — they won’t appear under **Pending** until confirmed.

## 4. Whole site looks empty for customers

If **`STAFF_GATE_FULL_SITE=true`**, visitors are sent to **`/staff-access.html`** until they enter a staff PIN. Turn it off in Railway variables if the public catalog should be open.

## 5. Migration only copied some tables

If you used **`migrate-db.js`**, re-run with **`--merge`** against a good **source** URL when you’re sure network can reach both DBs. Partial runs or wrong source show up as **low counts** in **`/api/catalog-counts`**.

## 6. After fixing, hard-refresh

Browsers cache JS/HTML. Use a **hard refresh** or an incognito window when testing.

---

**Still stuck?** Note **exactly** what’s missing (e.g. “orders from March”, “category X”, “photos only”) and whether it fails on **www**, **Admin**, or both — that narrows it to DB vs uploads vs filters.
