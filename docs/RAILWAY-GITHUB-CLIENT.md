# Client setup: GitHub → Railway (auto-deploy on push)

Public repo: **https://github.com/jdsleek/urbanhilt**  
Branch: **`main`**

## 1. Link GitHub in Railway (one-time)

1. Client logs in at **https://railway.app**
2. **Account settings** (avatar) → **Connections** → connect **GitHub** (install Railway app, allow repo access).
3. Pick **“urbanhilt”** (or the whole org) so Railway can see **`jdsleek/urbanhilt`**.

## 2. Create / open the project

**New project**

- **Deploy from GitHub repo** → choose **`jdsleek/urbanhilt`**
- Railway detects **Node** → start command: **`npm start`** (from `package.json`)

**Or** use existing project:

- Open the **urbanhilt** service → **Settings** → **Source** → connect **GitHub** → select **`jdsleek/urbanhilt`**, branch **`main`**.

## 3. Auto-deploy on every push

In the service → **Settings** → **Triggers** / **Deploy** (wording varies):

- Enable **deploy on push** to **`main`** (default when connected from GitHub).

After this, any **`git push origin main`** to the public repo triggers a new deploy.

## 4. Required variables (same service as the app)

| Variable         | Purpose                          |
|-----------------|----------------------------------|
| `DATABASE_URL`  | Postgres (same project or managed) |
| `JWT_SECRET`    | Optional but recommended         |
| `NODE_ENV`      | `production`                     |

Do **not** commit secrets; set them only in **Railway → Variables**.

## 5. Custom domain + `urbanhilt.com` without `www`

A **Railway token does not fix DNS.**

- **`www.urbanhilt.com`**: CNAME to the hostname Railway shows under **Custom domains**.
- **`urbanhilt.com` (apex)** with **GoDaddy**: use **domain forwarding** to `https://www.urbanhilt.com` **or** move DNS to **Cloudflare** (see **`GODADDY-APEX-DNS.md`**).

`DNS_PROBE_FINISHED_NXDOMAIN` on the bare domain means **no DNS record** for `@` at the registrar — fix in **GoDaddy** (or Cloudflare), not in Railway’s token.

## 6. API token (optional, for CLI / automation)

- **Railway → Account → Tokens** → create a token.
- **Do not** paste tokens in chat or commit them. Use locally: `export RAILWAY_TOKEN=...` or CI secrets.
