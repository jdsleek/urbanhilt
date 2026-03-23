const fs = require('fs');
const path = require('path');
const { getUploadsDir } = require('./uploadsDir');

/**
 * When local disk has no file (e.g. after Railway redeploy), redirect the browser
 * to the same path on another origin that still holds the files.
 *
 * Set PUBLIC_UPLOADS_FALLBACK_BASE=https://YOUR-OLD-SERVICE.up.railway.app
 * (no trailing slash). Only flat filenames (multer style) are allowed.
 */
function getPublicUploadsFallbackBase() {
  const b = process.env.PUBLIC_UPLOADS_FALLBACK_BASE;
  if (b == null || !String(b).trim()) return '';
  return String(b).trim().replace(/\/$/, '');
}

/** @param {string} reqPath - e.g. /uuid.jpeg from app.use('/uploads') */
function safeUploadsFilename(reqPath) {
  let p = String(reqPath || '').replace(/^\/+/, '');
  if (!p || p.includes('..') || /[/\\]/.test(p)) return null;
  const base = path.basename(p);
  if (base !== p) return null;
  return base;
}

/**
 * Express middleware mounted at /uploads — run BEFORE express.static(uploads).
 */
function uploadsRedirectIfMissingLocally() {
  return (req, res, next) => {
    const base = getPublicUploadsFallbackBase();
    if (!base) return next();

    try {
      const incoming = (req.get('host') || '').toLowerCase();
      const fallbackHost = new URL(base).host.toLowerCase();
      if (incoming && fallbackHost === incoming) return next();
    } catch {
      return next();
    }

    const name = safeUploadsFilename(req.path);
    if (!name) return next();

    const local = path.join(getUploadsDir(), name);
    try {
      if (fs.existsSync(local) && fs.statSync(local).isFile()) return next();
    } catch {
      return next();
    }

    const target = `${base}/uploads/${encodeURIComponent(name)}`;
    return res.redirect(302, target);
  };
}

module.exports = {
  getPublicUploadsFallbackBase,
  safeUploadsFilename,
  uploadsRedirectIfMissingLocally,
};
