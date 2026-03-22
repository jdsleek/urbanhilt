/** Parse DB JSON text (or pass-through arrays) without throwing. */
function parseJsonSafe(raw, fallback = []) {
  if (raw == null || raw === '') return fallback;
  if (typeof raw !== 'string') {
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'object') return raw;
    return fallback;
  }
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

module.exports = { parseJsonSafe };
