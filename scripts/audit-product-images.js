#!/usr/bin/env node
/**
 * List every /uploads/... URL referenced by the public catalog and HEAD-check it.
 *
 *   npm run audit:images -- https://www.urbanhilt.com
 *   node scripts/audit-product-images.js   # uses PUBLIC_SITE_URL from .env or defaults to localhost:3000
 */
try {
  require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
} catch (_) {}

const site =
  process.argv[2]?.replace(/\/$/, '') ||
  (process.env.PUBLIC_SITE_URL || '').replace(/\/$/, '') ||
  'http://localhost:3000';

async function main() {
  const api = `${site}/api/products?limit=500`;
  const r = await fetch(api);
  if (!r.ok) {
    console.error('Failed to fetch catalog:', r.status, api);
    process.exit(1);
  }
  const j = await r.json();
  const urls = new Set();
  for (const p of j.products || []) {
    for (const img of p.images || []) {
      if (typeof img === 'string' && img.startsWith('/uploads/')) urls.add(img);
    }
  }

  const list = [...urls];
  const bad = [];
  let ok = 0;

  async function checkOne(u) {
    const url = `${site}${u}`;
    try {
      const ac = new AbortController();
      const t = setTimeout(() => ac.abort(), 12000);
      const res = await fetch(url, {
        method: 'HEAD',
        redirect: 'follow',
        signal: ac.signal,
      });
      clearTimeout(t);
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      if (res.ok && ct.includes('image')) return { ok: true };
      return { ok: false, u, status: res.status, ct: ct.slice(0, 60) };
    } catch (e) {
      return { ok: false, u, status: 'ERR', ct: String(e.message || e).slice(0, 80) };
    }
  }

  const batch = 12;
  for (let i = 0; i < list.length; i += batch) {
    const chunk = list.slice(i, i + batch);
    const results = await Promise.all(chunk.map(checkOne));
    for (const r of results) {
      if (r.ok) ok++;
      else bad.push({ u: r.u, status: r.status, ct: r.ct });
    }
  }

  console.log('Site:', site);
  console.log('Unique /uploads URLs in catalog:', urls.size);
  console.log('HEAD looks like image (200 + image/*):', ok);
  console.log('Missing or non-image:', bad.length);
  if (bad.length) {
    console.log('\nProblems:');
    for (const row of bad) console.log(' ', row.status, row.ct, row.u);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
