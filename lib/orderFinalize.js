/**
 * Finalize an order that was submitted by a customer and is waiting for staff confirmation.
 * Deducts stock, increments discount uses, sets status to pending.
 */
const { query } = require('../db/database');

/**
 * Staff must verify payment (or order must be COD / WhatsApp / paid Paystack) before approving.
 * Admin can skip via finalizeAwaitingOrder(..., { skipPaymentCheck: true }).
 */
function paymentSatisfiedForStaffApproval(order) {
  const method = String(order.payment_method || '').trim();
  const ref = String(order.payment_ref || order.payment_reference || '').trim();
  if (method === 'pay_on_delivery' || method === 'whatsapp') {
    return { ok: true };
  }
  if (method === 'paystack' && ref) {
    return { ok: true };
  }
  if (order.payment_verified_at) {
    return { ok: true };
  }
  return {
    ok: false,
    error:
      'Payment must be confirmed with the customer first. Use “Mark payment verified” (bank transfer, or if needed). Pay on delivery and completed online card payments do not need this step.',
    code: 'PAYMENT_NOT_VERIFIED',
  };
}

function parseItems(raw) {
  if (raw == null || raw === '') return [];
  if (typeof raw !== 'string') {
    if (Array.isArray(raw)) return raw;
    return [];
  }
  try {
    const p = JSON.parse(raw);
    return Array.isArray(p) ? p : [];
  } catch {
    return [];
  }
}

/**
 * @param {object} order - DB row (status must be awaiting_staff)
 * @param {number|null} staffId - confirming sales_staff id, or null if confirmed via admin
 * @param {object|null} req - optional Express req for logging
 * @param {{ skipPaymentCheck?: boolean }} options - admin override: skip staff payment rules
 * @returns {Promise<{ ok: true, order_number: string } | { ok: false, error: string, code?: string }>}
 */
async function finalizeAwaitingOrder(order, staffId, req = null, options = {}) {
  const { skipPaymentCheck = false } = options;

  if (!order || order.status !== 'awaiting_staff') {
    return {
      ok: false,
      error: 'This order is not waiting for staff confirmation.',
      code: 'INVALID_STATE',
    };
  }

  if (!skipPaymentCheck && staffId) {
    const pay = paymentSatisfiedForStaffApproval(order);
    if (!pay.ok) {
      return { ok: false, error: pay.error, code: pay.code };
    }
  }

  const items = parseItems(order.items);
  if (!items.length) {
    return { ok: false, error: 'Order has no items.', code: 'INVALID_ITEMS' };
  }

  for (const item of items) {
    const { rows } = await query('SELECT id, name, stock FROM products WHERE id = $1', [item.id]);
    const p = rows[0];
    if (!p) {
      return { ok: false, error: `Product #${item.id} is no longer available.`, code: 'STOCK' };
    }
    if (p.stock < item.qty) {
      return {
        ok: false,
        error: `"${p.name}" only has ${p.stock} left in stock (requested ${item.qty}).`,
        code: 'STOCK',
      };
    }
  }

  for (const item of items) {
    await query('UPDATE products SET stock = stock - $1 WHERE id = $2 AND stock >= $1', [
      item.qty,
      item.id,
    ]);
  }

  if (order.discount_code) {
    await query(
      `UPDATE discount_codes SET uses_count = uses_count + 1 WHERE UPPER(code) = UPPER($1)`,
      [order.discount_code]
    );
  }

  await query(
    `UPDATE orders SET status = 'pending', staff_id = COALESCE($1, staff_id), updated_at = NOW() WHERE id = $2`,
    [staffId, order.id]
  );

  if (staffId && req) {
    const ip =
      (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '';
    await query(
      `INSERT INTO staff_access_logs (staff_id, event_type, detail, ip, user_agent) VALUES ($1,$2,$3,$4,$5)`,
      [
        staffId,
        'order_confirmed',
        JSON.stringify({
          order_number: order.order_number,
          total: String(order.total),
        }),
        ip,
        req.headers['user-agent'] || '',
      ]
    );
  }

  return { ok: true, order_number: order.order_number };
}

module.exports = { finalizeAwaitingOrder, parseItems, paymentSatisfiedForStaffApproval };
