# URBAN HILT — Luxury Redefined

Premium e-commerce website for Urban Hilt Luxury Wears.

## Quick Start

```bash
# Install dependencies
npm install

# Seed the database with sample data
npm run seed

# Start the server
npm start
```

Then open **http://localhost:3000** in your browser.

## Admin Panel

Access the admin dashboard at **http://localhost:3000/admin/**

**Default Credentials:**
- Username: `admin`
- Password: `urbanhilt2024`

### Admin Features
- **Dashboard** — Overview of orders, revenue, and key metrics
- **Products** — Full CRUD: add, edit, delete products with images, sizes, colors, pricing
- **Categories** — Manage product categories
- **Orders** — View, update status, and manage customer orders
- **Subscribers** — View newsletter subscribers

## Store Features
- Beautiful, luxury-themed responsive design
- Product catalog with filtering, sorting, and search
- Product detail pages with image gallery, size/color selection
- Shopping cart with quantity management
- Multi-step checkout (Pay on Delivery, Bank Transfer, WhatsApp ordering)
- WhatsApp integration for direct ordering and customer support
- Newsletter subscription
- FAQ section
- Contact page with all business details

## Custom domain (GoDaddy + Railway)

**Do not paste GoDaddy API keys into chat.** Use a local `.env` only.

1. In **Railway** → your web service → **Custom domains**: add `www.yourdomain.com` (and apex if offered). Copy the **CNAME target** (e.g. `xxxx.up.railway.app`).
2. In **GoDaddy** [API keys](https://developer.godaddy.com/keys), create a key with **DNS** access for your domain.
3. Locally:

```bash
cp .env.example .env
# Edit .env: GODADDY_KEY, GODADDY_SECRET, GODADDY_DOMAIN
npm install
node scripts/godaddy-dns.js list
node scripts/godaddy-dns.js set-www --target YOUR_RAILWAY_CNAME.up.railway.app
# Optional: remove old GitHub Pages apex A records, then set apex only if Railway tells you to:
# node scripts/godaddy-dns.js remove-apex-a
# node scripts/godaddy-dns.js set-apex-a --ips 1.2.3.4
```

4. Wait for DNS + Railway certificate (often 5–30 minutes). Check `https://www.yourdomain.com/api/health`.

## Railway / production

- Set **`DATABASE_URL`** on the **same** Railway service that runs this app (ideally use a Postgres plugin in the **same project** so `postgres.railway.internal` works).
- **Port:** On Railway, **`PORT` is usually `8080`** (the platform sets it). Don’t pin **`3000`** in Railway variables unless you know it matches — wrong port → **502** / “application failed to respond”.
- Bulk-set vars from a local file (API token required): `npm run railway:set-env -- --env-file .env.railway` — see **`docs/RAILWAY-GITHUB-CLIENT.md`**, **`docs/CLIENT-RAILWAY.md`**, and **`scripts/railway-set-env.js`**.
- **Copy old DB → client DB** (catalog, orders, etc.): **`docs/MIGRATE-DB.md`** and `npm run migrate:db` (requires public `SOURCE_DATABASE_URL` + `TARGET_DATABASE_URL`).
- On the deployment that serves **www.urbanhilt.com**, set **`PUBLIC_SITE_URL=https://www.urbanhilt.com`** (optional but recommended; exposed in `/api/store-config` as `siteUrl`).
- Optional: **`JWT_SECRET`**, **`NODE_ENV=production`**
- **Checkout & staff:** set **`REQUIRE_STAFF_CHECKOUT=true`** so customers **submit** online; **sales staff** (PIN at `/staff-access.html`) verify payment with the customer, **mark payment verified** if needed (e.g. bank transfer), then **approve the sale** on **POS** or let **Admin** override. **Admin** is owner/manager (full access, can skip payment checks on approve); **staff profiles** (role, phone, staff code, etc.) are edited in **Admin → Sales staff**. Stock and promo use apply on approval.
- **Paystack:** **`PAYSTACK_PUBLIC_KEY`** (and secret on server if you verify webhooks). Discount codes and **Staff access logs** are in **Admin** (`/admin/`).
- Optional **`STAFF_GATE_FULL_SITE=true`** locks the whole storefront behind the PIN screen.
- Health check: **`GET /api/health`** — should return `{"ok":true,"database":true}`

### Orders show on checkout but not in Admin / “0 awaiting staff”

1. **Filters:** If **`REQUIRE_STAFF_CHECKOUT`** is **not** `true`, new orders are **`pending`**, not `awaiting_staff`. Open **Admin → Orders** and choose **All** or **Pending**, not only “Awaiting staff”.
2. **Same database & app:** `www` and apex must point at the **one** Railway service that has your **`DATABASE_URL`**. If the storefront and admin use different deployments or DBs, orders disappear from Admin.
3. **Logs:** After deploy, Railway logs should show `[order] created UH-…` for each successful checkout.
4. **DB check (optional):** from a machine with DB access, run  
   `DATABASE_URL=… node scripts/verify-order-flow.js`  
   to print order counts and the latest rows.

### “Server error” on admin login but the site loads

If you have **more than one** `*.up.railway.app` domain, they may point to **different deployments** (different IPs). Open **`/api/health`** on the URL you use for the store: if it returns `503`, that deployment has no working database. In Railway → **Networking**, attach your preferred public URL to the service that already has Postgres + `DATABASE_URL` configured (or add Postgres and `DATABASE_URL` to the failing service).

### New categories/products in Admin, but not on www.urbanhilt.com

Admin and the shop use the **same** `DATABASE_URL` **per deployment**. If Railway **“View site”** shows new data but the **custom domain** does not, `www` is almost certainly hitting **another** service or **another** Postgres. See **`docs/DATABASE-DOMAIN-MISMATCH.md`** and run **`npm run railway:diagnose`** (optionally with **`--compare-url`** between your `*.railway.app` URL and `https://www.urbanhilt.com`).

### “Some data still not showing” (images, orders, partial catalog)

See **`docs/DATA-NOT-SHOWING.md`**. Quick same-DB check:

```bash
curl -s https://www.urbanhilt.com/api/catalog-counts
```

## Tech Stack
- **Backend:** Node.js, Express.js
- **Database:** PostgreSQL (`pg` + `DATABASE_URL`)
- **Auth:** JWT (JSON Web Tokens) + bcrypt
- **Frontend:** Vanilla HTML, CSS, JavaScript
- **File Upload:** Multer

## Contact
- **Store:** 134/136 Broad Street, Lagos
- **Phone/WhatsApp:** +234 814 674 7883
- **Email:** urbanhiltltd@gmail.com
- **Instagram:** @urban_hilt
- **TikTok:** @urbanhiltluxurywears
