# “Some data still not showing” — what to check

Use this when **someone sees products/orders in Admin but customers see less**, or **images are broken**, or **only part of the old site’s data appeared**.

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

Rows can exist in Postgres but **image URLs** point to `/uploads/...` on **disk**. On a **new** Railway deploy, the **`uploads/`** folder is empty unless you **copy files** from the old server or re-upload in Admin.

**Symptom:** Product names/prices show, **thumbnails blank** or 404 in Network tab for `/uploads/...`.

**Fix:** Re-upload images in Admin, or copy `uploads/` from the old host, or migrate with **`--rewrite-uploads-base`** (see **`docs/MIGRATE-DB.md`**) so images load from the old public URL until files are copied.

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
