/**
 * Sales staff API: PIN login, portal data, cancellations, refunds, receipt payload.
 * Mounted at /api/staff — must be registered before the generic /api router.
 */
const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const { query } = require('../db/database');
const { parseJsonSafe } = require('../lib/parseJsonSafe');
const { signStaffToken, requireStaffAuth } = require('../middleware/staff');
const { getStaffPermissions, normalizeStaffRole } = require('../lib/staffRoles');
const { restoreStockFromOrderItems, orderHadStockDeducted } = require('../lib/stockAdjust');

function mapOrder(o) {
  if (!o) return null;
  return {
    ...o,
    items: parseJsonSafe(o.items, []),
  };
}

function staffFromRow(s) {
  const role = normalizeStaffRole(s.staff_role);
  return {
    id: s.id,
    name: s.name,
    job_title: s.job_title || null,
    phone: s.phone || null,
    email: s.email || null,
    photo_url: s.photo_url || null,
    staff_code: s.staff_code || null,
    role,
    permissions: getStaffPermissions(role),
  };
}

// ==================== LOGIN (PIN) ====================
router.post('/login', async (req, res) => {
  try {
    const { pin } = req.body || {};
    if (!pin || String(pin).length < 4) {
      return res.status(400).json({ error: 'Enter a valid PIN' });
    }
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '';
    const ua = req.headers['user-agent'] || '';
    const { rows } = await query('SELECT * FROM sales_staff WHERE active = 1');
    for (const s of rows) {
      if (bcrypt.compareSync(String(pin), s.pin_hash)) {
        await query(
          `INSERT INTO staff_access_logs (staff_id, event_type, detail, ip, user_agent) VALUES ($1,$2,$3,$4,$5)`,
          [s.id, 'login_success', JSON.stringify({ name: s.name }), ip, ua]
        );
        const role = normalizeStaffRole(s.staff_role);
        const token = signStaffToken({ id: s.id, name: s.name, role });
        return res.json({ token, staff: staffFromRow(s) });
      }
    }
    await query(
      `INSERT INTO staff_access_logs (staff_id, event_type, detail, ip, user_agent) VALUES (NULL,$1,$2,$3,$4)`,
      ['login_failed', JSON.stringify({ reason: 'bad_pin' }), ip, ua]
    );
    res.status(401).json({ error: 'Invalid PIN' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ==================== PORTAL (Bearer) ====================
router.get('/me', requireStaffAuth, (req, res) => {
  const role = normalizeStaffRole(req.staff.role);
  res.json({
    id: req.staff.id,
    name: req.staff.name,
    role,
    permissions: getStaffPermissions(role),
  });
});

/** Web orders waiting for payment verification / confirmation */
router.get('/awaiting-orders', requireStaffAuth, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT o.*, 
        ss.name AS staff_checkout_name,
        pv.name AS payment_verified_by_name
       FROM orders o
       LEFT JOIN sales_staff ss ON o.staff_id = ss.id
       LEFT JOIN sales_staff pv ON o.payment_verified_by_staff_id = pv.id
       WHERE o.status = 'awaiting_staff'
       ORDER BY o.created_at ASC
       LIMIT 100`
    );
    res.json({ orders: rows.map(mapOrder) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * Transactions: scope=mine|all (supervisor only for all), optional status filter
 */
router.get('/transactions', requireStaffAuth, async (req, res) => {
  try {
    const perms = getStaffPermissions(req.staff.role);
    let scope = (req.query.scope || 'mine').toLowerCase();
    if (scope === 'all' && !perms.viewAllTransactions) {
      scope = 'mine';
    }
    const status = req.query.status ? String(req.query.status).trim() : '';
    const limit = Math.min(parseInt(req.query.limit, 10) || 80, 200);
    const staffId = req.staff.id;

    let sql = `
      SELECT o.*, 
        ss.name AS staff_checkout_name,
        pv.name AS payment_verified_by_name,
        cb.name AS cancelled_by_name
      FROM orders o
      LEFT JOIN sales_staff ss ON o.staff_id = ss.id
      LEFT JOIN sales_staff pv ON o.payment_verified_by_staff_id = pv.id
      LEFT JOIN sales_staff cb ON o.cancelled_by_staff_id = cb.id
      WHERE 1=1`;
    const params = [];
    let i = 1;

    if (scope === 'mine') {
      sql += ` AND (o.staff_id = $${i} OR o.payment_verified_by_staff_id = $${i} OR o.cancelled_by_staff_id = $${i})`;
      params.push(staffId);
      i++;
    }

    if (status) {
      sql += ` AND o.status = $${i++}`;
      params.push(status);
    }

    sql += ` ORDER BY o.created_at DESC LIMIT $${i}`;
    params.push(limit);

    const { rows } = await query(sql, params);
    res.json({ orders: rows.map(mapOrder), scope });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

/** Single order if staff can see it (mine or supervisor) */
router.get('/orders/:id', requireStaffAuth, async (req, res) => {
  try {
    const perms = getStaffPermissions(req.staff.role);
    const { rows } = await query(
      `SELECT o.*, 
        ss.name AS staff_checkout_name,
        pv.name AS payment_verified_by_name,
        cb.name AS cancelled_by_name
      FROM orders o
      LEFT JOIN sales_staff ss ON o.staff_id = ss.id
      LEFT JOIN sales_staff pv ON o.payment_verified_by_staff_id = pv.id
      LEFT JOIN sales_staff cb ON o.cancelled_by_staff_id = cb.id
      WHERE o.id = $1`,
      [req.params.id]
    );
    const order = rows[0];
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const mine =
      order.staff_id === req.staff.id ||
      order.payment_verified_by_staff_id === req.staff.id ||
      order.cancelled_by_staff_id === req.staff.id;
    if (!perms.viewAllTransactions && !mine) {
      return res.status(403).json({ error: 'You can only open orders linked to your account.' });
    }

    const { rows: refunds } = await query(
      `SELECT r.*, s.name AS staff_name FROM order_refunds r
       LEFT JOIN sales_staff s ON r.staff_id = s.id
       WHERE r.order_id = $1 ORDER BY r.created_at DESC`,
      [order.id]
    );

    res.json({ order: mapOrder(order), refunds });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

/** Receipt / print view JSON */
router.get('/receipt-data', requireStaffAuth, async (req, res) => {
  try {
    const orderNumber = String(req.query.order_number || '').trim();
    if (!orderNumber) return res.status(400).json({ error: 'order_number required' });

    const { rows } = await query(
      `SELECT o.*, ss.name AS staff_checkout_name
       FROM orders o
       LEFT JOIN sales_staff ss ON o.staff_id = ss.id
       WHERE o.order_number = $1`,
      [orderNumber]
    );
    const order = rows[0];
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const perms = getStaffPermissions(req.staff.role);
    const mine =
      order.staff_id === req.staff.id ||
      order.payment_verified_by_staff_id === req.staff.id ||
      order.cancelled_by_staff_id === req.staff.id;
    if (!perms.viewAllTransactions && !mine) {
      return res.status(403).json({ error: 'Not allowed to view this receipt' });
    }

    res.json({
      order: mapOrder(order),
      storeName: process.env.STORE_RECEIPT_NAME || 'URBAN HILT',
      storeTagline: process.env.STORE_RECEIPT_TAGLINE || 'Luxury Redefined',
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

/** Supervisor: sales counts by staff (recent window) */
router.get('/reports/sales-by-staff', requireStaffAuth, async (req, res) => {
  try {
    const perms = getStaffPermissions(req.staff.role);
    if (!perms.salesByStaffReports) {
      return res.status(403).json({ error: 'Supervisor role required' });
    }
    const { rows } = await query(`
      SELECT 
        s.id AS staff_id,
        s.name AS staff_name,
        COUNT(o.id) FILTER (WHERE o.status NOT IN ('cancelled', 'awaiting_staff', 'refunded'))::int AS completed_orders,
        COALESCE(SUM(o.total) FILTER (WHERE o.status NOT IN ('cancelled', 'awaiting_staff', 'refunded')), 0)::numeric AS revenue_total
      FROM sales_staff s
      LEFT JOIN orders o ON o.staff_id = s.id AND o.created_at > NOW() - INTERVAL '90 days'
      WHERE s.active = 1
      GROUP BY s.id, s.name
      ORDER BY revenue_total DESC
    `);
    res.json({ byStaff: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/orders/:id/cancel', requireStaffAuth, async (req, res) => {
  try {
    const reason = String(req.body?.reason || '').trim();
    if (!reason) return res.status(400).json({ error: 'Cancellation reason is required' });

    const { rows } = await query('SELECT * FROM orders WHERE id = $1', [req.params.id]);
    const order = rows[0];
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const st = order.status;
    if (st === 'cancelled' || st === 'refunded') {
      return res.status(400).json({ error: 'Order is already closed' });
    }

    const perms = getStaffPermissions(req.staff.role);
    const mine =
      order.staff_id === req.staff.id ||
      order.payment_verified_by_staff_id === req.staff.id ||
      st === 'awaiting_staff';

    if (st === 'awaiting_staff') {
      if (!perms.cancelAwaiting && !perms.viewAllTransactions) {
        return res.status(403).json({ error: 'Not allowed' });
      }
      await query(
        `UPDATE orders SET status = 'cancelled', cancellation_reason = $1, cancelled_at = NOW(), 
         cancelled_by_staff_id = $2, updated_at = NOW() WHERE id = $3`,
        [reason, req.staff.id, order.id]
      );
      const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '';
      await query(
        `INSERT INTO staff_access_logs (staff_id, event_type, detail, ip, user_agent) VALUES ($1,$2,$3,$4,$5)`,
        [
          req.staff.id,
          'order_cancelled',
          JSON.stringify({ order_number: order.order_number, reason }),
          ip,
          req.headers['user-agent'] || '',
        ]
      );
      return res.json({ message: 'Order cancelled', order_number: order.order_number });
    }

    if (['pending', 'processing'].includes(st)) {
      if (!perms.cancelConfirmedOrders) {
        return res.status(403).json({
          error: 'Only supervisors can cancel confirmed orders (inventory will be restored).',
        });
      }
      if (orderHadStockDeducted(st)) {
        await restoreStockFromOrderItems(order.items);
      }
      await query(
        `UPDATE orders SET status = 'cancelled', cancellation_reason = $1, cancelled_at = NOW(), 
         cancelled_by_staff_id = $2, updated_at = NOW() WHERE id = $3`,
        [reason, req.staff.id, order.id]
      );
      const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '';
      await query(
        `INSERT INTO staff_access_logs (staff_id, event_type, detail, ip, user_agent) VALUES ($1,$2,$3,$4,$5)`,
        [
          req.staff.id,
          'order_cancelled',
          JSON.stringify({ order_number: order.order_number, reason, restocked: true }),
          ip,
          req.headers['user-agent'] || '',
        ]
      );
      return res.json({ message: 'Order cancelled; stock restored', order_number: order.order_number });
    }

    return res.status(400).json({
      error: 'This order cannot be cancelled from the staff portal. Use admin or contact support.',
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/orders/:id/refund', requireStaffAuth, async (req, res) => {
  try {
    const perms = getStaffPermissions(req.staff.role);
    if (!perms.processRefunds) {
      return res.status(403).json({ error: 'Only supervisors can process refunds' });
    }

    const amount = parseFloat(req.body?.amount);
    const reason = String(req.body?.reason || '').trim();
    const full = req.body?.full === true || req.body?.full === 'true';

    if (!reason) return res.status(400).json({ error: 'Refund reason is required' });
    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: 'Valid refund amount is required' });
    }

    const { rows } = await query('SELECT * FROM orders WHERE id = $1', [req.params.id]);
    const order = rows[0];
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const st = order.status;
    if (['cancelled', 'refunded', 'awaiting_staff'].includes(st)) {
      return res.status(400).json({ error: 'Order cannot be refunded in its current state' });
    }

    const total = parseFloat(order.total) || 0;
    const already = parseFloat(order.refunded_amount) || 0;
    const remaining = Math.max(0, total - already);
    if (remaining <= 0) return res.status(400).json({ error: 'Order is already fully refunded' });

    const wantFull = full || amount >= remaining - 0.009;
    const applyAmount = wantFull ? remaining : Math.min(amount, remaining);

    await query(
      `INSERT INTO order_refunds (order_id, amount, reason, staff_id, restock) VALUES ($1,$2,$3,$4,$5)`,
      [order.id, applyAmount, reason, req.staff.id, wantFull ? 1 : 0]
    );

    const newRefunded = already + applyAmount;
    const isFullRefund = newRefunded >= total - 0.009;

    if (isFullRefund) {
      await restoreStockFromOrderItems(order.items);
      await query(
        `UPDATE orders SET refunded_amount = $1, refund_status = 'full', status = 'refunded', updated_at = NOW() WHERE id = $2`,
        [total, order.id]
      );
    } else {
      await query(
        `UPDATE orders SET refunded_amount = $1, refund_status = 'partial', updated_at = NOW() WHERE id = $2`,
        [newRefunded, order.id]
      );
    }

    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '';
    await query(
      `INSERT INTO staff_access_logs (staff_id, event_type, detail, ip, user_agent) VALUES ($1,$2,$3,$4,$5)`,
      [
        req.staff.id,
        'refund_recorded',
        JSON.stringify({
          order_number: order.order_number,
          amount: applyAmount,
          full: isFullRefund,
        }),
        ip,
        req.headers['user-agent'] || '',
      ]
    );

    res.json({
      message: isFullRefund ? 'Full refund recorded; stock restored' : 'Partial refund recorded',
      order_number: order.order_number,
      refunded_total: isFullRefund ? total : newRefunded,
      refund_status: isFullRefund ? 'full' : 'partial',
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
