/**
 * Restore inventory from order line items (JSON array in DB).
 */
const { query } = require('../db/database');
const { parseJsonSafe } = require('./parseJsonSafe');

async function restoreStockFromOrderItems(itemsRaw) {
  const items = parseJsonSafe(itemsRaw, []);
  if (!Array.isArray(items)) return;
  for (const item of items) {
    const id = item.id;
    const qty = parseInt(item.qty, 10);
    if (id && qty > 0) {
      await query('UPDATE products SET stock = stock + $1 WHERE id = $2', [qty, id]);
    }
  }
}

/** True if order line items were already deducted from catalog. */
function orderHadStockDeducted(status) {
  const s = String(status || '');
  return s !== 'awaiting_staff' && s !== 'cancelled' && s !== 'refunded';
}

module.exports = { restoreStockFromOrderItems, orderHadStockDeducted };
