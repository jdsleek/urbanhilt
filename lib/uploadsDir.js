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
  return path.join(__dirname, '..', 'uploads');
}

function ensureUploadsDir() {
  const dir = getUploadsDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

module.exports = { getUploadsDir, ensureUploadsDir };
