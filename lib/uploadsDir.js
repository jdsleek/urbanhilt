const path = require('path');
const fs = require('fs');

/**
 * Absolute directory for uploaded product/category images (multer + express.static).
 *
 * On Railway (and similar), the container filesystem is ephemeral — set UPLOADS_DIR to a
 * **mounted volume** path (e.g. /data/uploads) so files survive redeploys.
 *
 * Public URLs stay `/uploads/filename` regardless of this path.
 */
function getUploadsDir() {
  const raw = process.env.UPLOADS_DIR;
  if (raw != null && String(raw).trim() !== '') {
    return path.resolve(String(raw).trim());
  }
  return getFallbackUploadsDir();
}

function getFallbackUploadsDir() {
  return path.join(__dirname, '..', 'uploads');
}

function ensureUploadsDir() {
  const dir = getUploadsDir();
  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return dir;
  } catch (err) {
    if (process.env.UPLOADS_DIR && process.env.NODE_ENV === 'production') {
      err.message = `Persistent uploads directory unavailable (${dir}): ${err.message || err}`;
      throw err;
    }

    const fallback = getFallbackUploadsDir();
    console.error(
      `  ✗ Uploads directory unavailable (${dir}): ${err.message || err}. Falling back to ${fallback}`
    );
    if (!fs.existsSync(fallback)) {
      fs.mkdirSync(fallback, { recursive: true });
    }
    process.env.UPLOADS_DIR = fallback;
    return fallback;
  }
}

module.exports = { getUploadsDir, ensureUploadsDir };
