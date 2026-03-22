# Fix `urbanhilt.com` (no www) — “can’t be reached” / NXDOMAIN

## What’s wrong

After removing the old **GitHub Pages** `A` records on **`@`**, the **root** name `urbanhilt.com` has **no DNS answer**.  
`www.urbanhilt.com` still works because it has a **CNAME** to Railway.

**Railway + GoDaddy:** GoDaddy does **not** support true **CNAME at the root** the way Railway expects ([Railway docs](https://docs.railway.com/networking/domains/working-with-domains)). So you must use **forwarding** or **external DNS** (e.g. Cloudflare).

---

## Option 1 — Easiest: Forward root to www (GoDaddy)

1. Log in at **https://www.godaddy.com** (not only DNS).
2. **My Products** → **Domains** → **urbanhilt.com** → **Manage** (or **DNS** / **Forwarding** depending on UI).
3. Find **Forwarding** (sometimes under **Domain** → **Forwarding** or **Additional Settings**).
4. Add **forward**:
   - **From:** `urbanhilt.com` (or `@` / “Domain only”)
   - **To:** `https://www.urbanhilt.com`
   - Type: **Permanent (301)**
5. Save. GoDaddy will use **their** forwarding hosts (you may see new **`A`** records for `@` — that’s normal for forwarding).

Wait 15–60 minutes, then try **http://urbanhilt.com** and **https://urbanhilt.com** — they should land on **www**.

---

## Option 2 — Root on Railway without forwarding (Cloudflare DNS)

1. Create a free **Cloudflare** account → **Add site** → `urbanhilt.com`.
2. Cloudflare shows **two nameservers**. In **GoDaddy** → **urbanhilt.com** → **Nameservers** → **Change** → paste Cloudflare’s nameservers (replaces GoDaddy DNS hosting).
3. In **Cloudflare DNS**:
   - **`@`** → **CNAME** → `xa07jftc.up.railway.app` (or whatever Railway shows **today** for your service) — **Proxied** (orange cloud) is OK per Railway docs.
   - **`www`** → **CNAME** → same target, or CNAME to `@` as you prefer.
4. In **Railway** → your web service → **Custom domains**: add **`urbanhilt.com`** and **`www.urbanhilt.com`** and wait for SSL.

---

## Option 3 — Railway dashboard

In **Railway** → **Settings** → **Networking** → **Custom domains**, add **`urbanhilt.com`**.  
If Railway shows **specific `A` records** for the apex, add **only those** at GoDaddy for **`@`**.  
If it only shows a **CNAME** target, use **Option 1** or **2** on GoDaddy.

---

## Check DNS from your computer

```bash
dig +short urbanhilt.com A
dig +short www.urbanhilt.com A
```

- **`www`** should resolve (e.g. to a Railway IP).
- **`urbanhilt.com`** should show **at least one `A`** (forwarding) or work after Cloudflare/Railway apex setup — **not** empty forever.
