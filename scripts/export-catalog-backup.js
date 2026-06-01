#!/usr/bin/env node
/**
 * Export the live public catalog and any downloadable image assets.
 *
 * This is a recovery aid, not a replacement for Railway volume/database backups:
 * it can only save images that are currently reachable by URL.
 *
 *   npm run backup:catalog -- https://www.urbanhilt.com
 */

const fs = require('fs');
const path = require('path');

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function siteBase(argv) {
  return (argv[2] || process.env.PUBLIC_SITE_URL || 'https://www.urbanhilt.com').replace(/\/$/, '');
}

function safeName(input, fallback) {
  const raw = String(input || fallback || 'asset');
  return raw
    .replace(/^https?:\/\//, '')
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 180);
}

function imageUrl(base, src) {
  if (!src || typeof src !== 'string') return null;
  if (/^https?:\/\//i.test(src)) return src;
  if (src.startsWith('/')) return `${base}${src}`;
  return null;
}

async function fetchJson(url) {
  const res = await fetch(url);
  const text = await res.text();
  if (!res.ok) throw new Error(`${url} returned ${res.status}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

async function download(url, dest) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) return { ok: false, status: res.status, type: res.headers.get('content-type') || '' };
  const type = res.headers.get('content-type') || '';
  if (!type.startsWith('image/')) return { ok: false, status: res.status, type };
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buf);
  return { ok: true, status: res.status, type, bytes: buf.length };
}

async function main() {
  const base = siteBase(process.argv);
  const outDir = path.join(process.cwd(), 'backups', `catalog-${stamp()}`);
  const imageDir = path.join(outDir, 'images');
  fs.mkdirSync(imageDir, { recursive: true });

  const [productsPayload, categoriesPayload] = await Promise.all([
    fetchJson(`${base}/api/products?limit=1000`),
    fetchJson(`${base}/api/categories`),
  ]);

  const products = productsPayload.products || [];
  const categories = categoriesPayload.categories || [];
  const imageRefs = [];

  for (const product of products) {
    for (const src of product.images || []) {
      const url = imageUrl(base, src);
      if (url) imageRefs.push({ ownerType: 'product', ownerId: product.id, ownerName: product.name, src, url });
    }
  }
  for (const category of categories) {
    const url = imageUrl(base, category.image);
    if (url) imageRefs.push({ ownerType: 'category', ownerId: category.id, ownerName: category.name, src: category.image, url });
  }

  const seen = new Map();
  for (const ref of imageRefs) {
    if (!seen.has(ref.url)) seen.set(ref.url, ref);
  }

  const downloads = [];
  let i = 0;
  for (const ref of seen.values()) {
    i += 1;
    const ext = path.extname(new URL(ref.url).pathname) || '.img';
    const filename = `${String(i).padStart(4, '0')}-${safeName(ref.ownerName, ref.ownerId)}${ext}`;
    const dest = path.join(imageDir, filename);
    const result = await download(ref.url, dest).catch((e) => ({ ok: false, error: e.message || String(e) }));
    downloads.push({ ...ref, filename: result.ok ? `images/${filename}` : null, ...result });
  }

  const manifest = {
    createdAt: new Date().toISOString(),
    source: base,
    counts: {
      products: products.length,
      categories: categories.length,
      uniqueImages: seen.size,
      downloadedImages: downloads.filter((d) => d.ok).length,
      failedImages: downloads.filter((d) => !d.ok).length,
    },
    products,
    categories,
    downloads,
  };

  fs.writeFileSync(path.join(outDir, 'catalog.json'), JSON.stringify(manifest, null, 2));
  console.log(JSON.stringify({ ok: true, outDir, counts: manifest.counts }, null, 2));
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
