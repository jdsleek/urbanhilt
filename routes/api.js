const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../db/database');
const { parseJsonSafe } = require('../lib/parseJsonSafe');

const JWT_SECRET = process.env.JWT_SECRET || 'urbanhilt-luxury-2024-secret-key';
const CUSTOMER_SECRET = process.env.CUSTOMER_SECRET || 'uh-customer-secret-2024';
const { signStaffToken, requireStaffCheckout, optionalStaffAuth } = require('../middleware/staff');
const { finalizeAwaitingOrder } = require('../lib/orderFinalize');

function requireStaffConfirmationMode() {
  return process.env.REQUIRE_STAFF_CHECKOUT === 'true';
}

function authenticateCustomer(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const decoded = jwt.verify(authHeader.split(' ')[1], JWT_SECRET);
    req.customer = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// ==================== HEALTH (debug / load balancers) ====================
router.get('/health', async (req, res) => {
  try {
    await query('SELECT 1');
    res.json({ ok: true, database: true });
  } catch (e) {
    console.error('health check failed:', e.message || e);
    res.status(503).json({ ok: false, database: false, error: 'Database unavailable' });
  }
});

/** Public row counts — use to verify www vs *.railway.app (or admin) hit the same DB. */
router.get('/catalog-counts', async (req, res) => {
  try {
    const [pr, cr] = await Promise.all([
      query('SELECT COUNT(*)::int AS c FROM products'),
      query('SELECT COUNT(*)::int AS c FROM categories'),
    ]);
    res.json({
      ok: true,
      products: pr.rows[0].c,
      categories: cr.rows[0].c,
    });
  } catch (e) {
    console.error('catalog-counts failed:', e.message || e);
    res.status(503).json({ ok: false, error: 'Database unavailable' });
  }
});

// ==================== PRODUCTS ====================
router.get('/products', async (req, res) => {
  try {
    const { category, search, sort, min_price, max_price, featured, new_arrival, best_seller, sale, limit, offset } = req.query;

    let whereClause = ' WHERE 1=1';
    const params = [];
    let paramIdx = 1;

    if (category) { whereClause += ` AND c.slug = $${paramIdx++}`; params.push(category); }
    if (search) { whereClause += ` AND (p.name ILIKE $${paramIdx++} OR p.description ILIKE $${paramIdx++})`; params.push(`%${search}%`, `%${search}%`); }
    if (min_price) { whereClause += ` AND p.price >= $${paramIdx++}`; params.push(parseFloat(min_price)); }
    if (max_price) { whereClause += ` AND p.price <= $${paramIdx++}`; params.push(parseFloat(max_price)); }
    if (featured === '1') whereClause += ' AND p.featured = 1';
    if (new_arrival === '1') whereClause += ' AND p.new_arrival = 1';
    if (best_seller === '1') whereClause += ' AND p.best_seller = 1';
    if (sale === '1') whereClause += ' AND p.sale_price IS NOT NULL';

    const countParams = [...params];
    const countResult = await query(
      `SELECT COUNT(*) as total FROM products p LEFT JOIN categories c ON p.category_id = c.id${whereClause}`,
      countParams
    );
    const total = parseInt(countResult.rows[0].total);

    let mainQuery = `SELECT p.*, c.name as category_name, c.slug as category_slug FROM products p LEFT JOIN categories c ON p.category_id = c.id${whereClause}`;

    switch (sort) {
      case 'price_asc': mainQuery += ' ORDER BY COALESCE(p.sale_price, p.price) ASC'; break;
      case 'price_desc': mainQuery += ' ORDER BY COALESCE(p.sale_price, p.price) DESC'; break;
      case 'name_asc': mainQuery += ' ORDER BY p.name ASC'; break;
      case 'newest': mainQuery += ' ORDER BY p.created_at DESC'; break;
      default: mainQuery += ' ORDER BY p.featured DESC, p.created_at DESC';
    }

    if (limit) { mainQuery += ` LIMIT $${paramIdx++}`; params.push(parseInt(limit)); }
    if (offset) { mainQuery += ` OFFSET $${paramIdx++}`; params.push(parseInt(offset)); }

    const { rows } = await query(mainQuery, params);
    const products = rows.map(p => ({
      ...p,
      images: parseJsonSafe(p.images, []),
      sizes: parseJsonSafe(p.sizes, []),
      colors: parseJsonSafe(p.colors, [])
    }));

    res.json({ products, total });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/products/:slug', async (req, res) => {
  try {
    const { rows: productRows } = await query(
      `SELECT p.*, c.name as category_name, c.slug as category_slug
       FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.slug = $1`,
      [req.params.slug]
    );
    const product = productRows[0];

    if (!product) return res.status(404).json({ error: 'Product not found' });

    product.images = parseJsonSafe(product.images, []);
    product.sizes = parseJsonSafe(product.sizes, []);
    product.colors = parseJsonSafe(product.colors, []);

    const { rows: relatedRows } = await query(
      'SELECT * FROM products WHERE category_id = $1 AND id != $2 LIMIT 4',
      [product.category_id, product.id]
    );
    const related = relatedRows.map(p => ({
      ...p, images: parseJsonSafe(p.images, []), sizes: parseJsonSafe(p.sizes, []), colors: parseJsonSafe(p.colors, [])
    }));

    const { rows: reviewRows } = await query(
      'SELECT * FROM reviews WHERE product_id = $1 ORDER BY created_at DESC',
      [product.id]
    );

    const { rows: ratingRows } = await query(
      'SELECT AVG(rating) as avg, COUNT(*) as count FROM reviews WHERE product_id = $1',
      [product.id]
    );
    const avgRating = ratingRows[0];

    res.json({ product, related, reviews: reviewRows, rating: { average: Math.round((parseFloat(avgRating.avg) || 0) * 10) / 10, count: parseInt(avgRating.count) } });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ==================== PRODUCT REVIEWS (by slug) ====================
router.get('/products/:slug/reviews', async (req, res) => {
  try {
    const { rows: productRows } = await query('SELECT id FROM products WHERE slug = $1', [req.params.slug]);
    const product = productRows[0];
    if (!product) return res.status(404).json({ error: 'Product not found' });

    const { rows: reviews } = await query('SELECT * FROM reviews WHERE product_id = $1 ORDER BY created_at DESC', [product.id]);
    const { rows: statsRows } = await query('SELECT AVG(rating) as avg, COUNT(*) as count FROM reviews WHERE product_id = $1', [product.id]);
    const stats = statsRows[0];

    res.json({
      reviews,
      average_rating: Math.round((parseFloat(stats.avg) || 0) * 10) / 10,
      count: parseInt(stats.count)
    });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/products/:slug/reviews', async (req, res) => {
  try {
    const { rows: productRows } = await query('SELECT id FROM products WHERE slug = $1', [req.params.slug]);
    const product = productRows[0];
    if (!product) return res.status(404).json({ error: 'Product not found' });

    // Frontend sends author/text; API historically used customer_name/comment
    const customer_name = req.body.customer_name || req.body.author;
    const comment =
      req.body.comment !== undefined && req.body.comment !== null
        ? req.body.comment
        : req.body.text;
    const { rating, title } = req.body;
    if (!customer_name || !rating) return res.status(400).json({ error: 'Missing required fields' });

    await query(
      'INSERT INTO reviews (product_id, customer_name, rating, title, comment) VALUES ($1, $2, $3, $4, $5)',
      [product.id, customer_name, Math.min(5, Math.max(1, parseInt(rating))), title || '', String(comment || '')]
    );

    res.status(201).json({ message: 'Review submitted!' });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ==================== STORE CONFIG (staff gate / checkout rules) ====================
router.get('/store-config', async (req, res) => {
  try {
    const siteUrl = (process.env.PUBLIC_SITE_URL || '').replace(/\/$/, '');
    res.json({
      requireStaffCheckout: process.env.REQUIRE_STAFF_CHECKOUT === 'true',
      /** When true, customers submit orders as "awaiting staff"; only staff/admin can confirm (deduct stock). */
      customerSubmitStaffConfirms: process.env.REQUIRE_STAFF_CHECKOUT === 'true',
      staffGateFullSite: process.env.STAFF_GATE_FULL_SITE === 'true',
      paystackConfigured: !!(process.env.PAYSTACK_PUBLIC_KEY && String(process.env.PAYSTACK_PUBLIC_KEY).startsWith('pk_')),
      paystackPublicKey: process.env.PAYSTACK_PUBLIC_KEY || '',
      /** Production canonical URL e.g. https://www.urbanhilt.com — set on the Railway service that has the custom domain */
      siteUrl: siteUrl || null,
    });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ==================== SALES STAFF PIN ====================
router.post('/staff/login', async (req, res) => {
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
        const token = signStaffToken({ id: s.id, name: s.name });
        const staffProfile = {
          id: s.id,
          name: s.name,
          job_title: s.job_title || null,
          phone: s.phone || null,
          email: s.email || null,
          photo_url: s.photo_url || null,
          staff_code: s.staff_code || null,
        };
        return res.json({ token, staff: staffProfile });
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

router.get('/discounts/validate', async (req, res) => {
  try {
    const code = (req.query.code || '').trim();
    if (!code) return res.status(400).json({ valid: false, error: 'No code' });
    const subtotal = parseFloat(req.query.subtotal) || 0;
    const { rows } = await query(
      `SELECT * FROM discount_codes WHERE UPPER(code) = UPPER($1) AND active = 1`,
      [code]
    );
    const d = rows[0];
    if (!d) return res.json({ valid: false, error: 'Invalid code' });
    const now = new Date();
    if (d.valid_from && new Date(d.valid_from) > now) return res.json({ valid: false, error: 'Code not active yet' });
    if (d.valid_until && new Date(d.valid_until) < now) return res.json({ valid: false, error: 'Code expired' });
    if (d.max_uses != null && parseInt(d.uses_count, 10) >= parseInt(d.max_uses, 10)) {
      return res.json({ valid: false, error: 'Code fully used' });
    }
    const minSub = parseFloat(d.min_subtotal || 0);
    if (subtotal < minSub) return res.json({ valid: false, error: `Minimum order ₦${minSub} required` });
    let discountAmount = 0;
    if (d.discount_type === 'percent') {
      discountAmount = Math.round(subtotal * (parseFloat(d.value) / 100) * 100) / 100;
    } else {
      discountAmount = parseFloat(d.value);
    }
    discountAmount = Math.min(discountAmount, subtotal);
    res.json({
      valid: true,
      code: d.code,
      description: d.description,
      discount_type: d.discount_type,
      discount_amount: discountAmount,
    });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ==================== CATEGORIES ====================
router.get('/categories', async (req, res) => {
  try {
    // Scalar subquery avoids GROUP BY + c.* edge cases; counts are integers
    const { rows: categories } = await query(`
      SELECT c.*,
        (SELECT COUNT(*)::int FROM products p WHERE p.category_id = c.id) AS product_count
      FROM categories c
      ORDER BY c.display_order ASC, c.name ASC
    `);
    res.json({ categories });
  } catch (e) {
    console.error('GET /categories failed:', e.message || e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ==================== ORDERS (customer submit + optional staff confirmation) ====================
router.post('/orders', optionalStaffAuth, async (req, res) => {
  try {
    const {
      customer_name,
      customer_email,
      customer_phone,
      address,
      city,
      state,
      items,
      payment_method,
      payment_ref,
      payment_reference,
      notes,
      discount_code,
    } = req.body;

    if (!customer_name || !customer_phone || !address || !items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const payRef = payment_ref || payment_reference || '';

    let subtotal = 0;
    const lineItems = [];
    for (const item of items) {
      const { rows } = await query(
        'SELECT id, name, slug, price, sale_price, stock, images FROM products WHERE id = $1',
        [item.id]
      );
      const product = rows[0];
      if (!product) return res.status(400).json({ error: `Product #${item.id} not found` });
      if (product.stock < item.qty) {
        return res.status(400).json({ error: `"${product.name}" only has ${product.stock} left in stock` });
      }
      const unit = parseFloat(product.sale_price != null ? product.sale_price : product.price);
      const line = unit * item.qty;
      subtotal += line;
      lineItems.push({
        id: product.id,
        name: product.name,
        slug: product.slug,
        qty: item.qty,
        size: item.size || '',
        color: item.color || '',
        price: unit,
        image: item.image || (parseJsonSafe(product.images, [])[0] || ''),
      });
    }

    let discountAmount = 0;
    let appliedCode = null;
    if (discount_code && String(discount_code).trim()) {
      const dc = String(discount_code).trim();
      const { rows: drows } = await query(
        `SELECT * FROM discount_codes WHERE UPPER(code) = UPPER($1) AND active = 1`,
        [dc]
      );
      const d = drows[0];
      const now = new Date();
      if (
        d &&
        (!d.valid_from || new Date(d.valid_from) <= now) &&
        (!d.valid_until || new Date(d.valid_until) >= now) &&
        (d.max_uses == null || parseInt(d.uses_count, 10) < parseInt(d.max_uses, 10)) &&
        subtotal >= parseFloat(d.min_subtotal || 0)
      ) {
        if (d.discount_type === 'percent') {
          discountAmount = Math.round(subtotal * (parseFloat(d.value) / 100) * 100) / 100;
        } else {
          discountAmount = parseFloat(d.value);
        }
        discountAmount = Math.min(discountAmount, subtotal);
        appliedCode = d.code;
      }
    }

    const afterDiscount = Math.max(0, subtotal - discountAmount);
    const shipping = afterDiscount >= 50000 ? 0 : 3000;
    const total = afterDiscount + shipping;

    const orderNumber =
      'UH-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();

    const staffId = req.staff?.id || null;
    /** Customer web checkout waits for staff; POS / staff Bearer finalizes immediately. */
    const awaitingStaff = requireStaffConfirmationMode() && !staffId;
    const orderStatus = awaitingStaff ? 'awaiting_staff' : 'pending';

    const result = await query(
      `INSERT INTO orders (order_number, customer_name, customer_email, customer_phone, address, city, state, items, subtotal, shipping, total, status, payment_method, payment_ref, notes, staff_id, discount_code, discount_amount)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18) RETURNING id`,
      [
        orderNumber,
        customer_name,
        customer_email || '',
        customer_phone,
        address,
        city || '',
        state || '',
        JSON.stringify(lineItems),
        subtotal,
        shipping,
        total,
        orderStatus,
        payment_method || 'pay_on_delivery',
        payRef,
        notes || '',
        staffId,
        appliedCode,
        discountAmount,
      ]
    );

    if (!awaitingStaff) {
      for (const item of lineItems) {
        await query('UPDATE products SET stock = stock - $1 WHERE id = $2 AND stock >= $1', [item.qty, item.id]);
      }

      if (appliedCode) {
        await query(
          `UPDATE discount_codes SET uses_count = uses_count + 1 WHERE UPPER(code) = UPPER($1)`,
          [appliedCode]
        );
      }

      if (staffId) {
        const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '';
        await query(
          `INSERT INTO staff_access_logs (staff_id, event_type, detail, ip, user_agent) VALUES ($1,$2,$3,$4,$5)`,
          [
            staffId,
            'order_placed',
            JSON.stringify({ order_number: orderNumber, total: String(total) }),
            ip,
            req.headers['user-agent'] || '',
          ]
        );
      }
    }

    console.log(
      `[order] created ${orderNumber} status=${orderStatus} total=${total} awaitingStaff=${awaitingStaff}`
    );

    res.status(201).json({
      message: awaitingStaff
        ? 'Order submitted! Our team will confirm it shortly.'
        : 'Order placed successfully!',
      order: {
        id: result.rows[0].id,
        order_number: orderNumber,
        total,
        status: orderStatus,
        awaiting_staff_confirmation: awaitingStaff,
      },
    });
  } catch (e) {
    console.error('orders:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

/**
 * Staff marks payment as verified (after speaking with customer — bank transfer, etc.).
 * Paystack-with-reference and pay-on-delivery skip this for approval.
 */
router.post('/orders/verify-payment', requireStaffCheckout, async (req, res) => {
  try {
    if (!requireStaffConfirmationMode()) {
      return res.status(400).json({ error: 'Staff confirmation mode is not enabled.' });
    }
    const { order_number } = req.body || {};
    if (!order_number || !String(order_number).trim()) {
      return res.status(400).json({ error: 'order_number is required' });
    }
    const staffId = req.staff?.id;
    const { rows } = await query('SELECT * FROM orders WHERE order_number = $1', [
      String(order_number).trim(),
    ]);
    const order = rows[0];
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status !== 'awaiting_staff') {
      return res.status(400).json({ error: 'Only orders awaiting staff can be updated.' });
    }
    await query(
      `UPDATE orders SET payment_verified_at = NOW(), payment_verified_by_staff_id = $1, updated_at = NOW() WHERE id = $2`,
      [staffId, order.id]
    );
    const ip = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket?.remoteAddress || '';
    await query(
      `INSERT INTO staff_access_logs (staff_id, event_type, detail, ip, user_agent) VALUES ($1,$2,$3,$4,$5)`,
      [
        staffId,
        'payment_verified',
        JSON.stringify({ order_number: order.order_number }),
        ip,
        req.headers['user-agent'] || '',
      ]
    );
    res.json({ message: 'Payment marked verified', order_number: order.order_number });
  } catch (e) {
    console.error('orders/verify-payment:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

/** Staff approves the sale (stock deducted). Payment rules apply unless already satisfied. */
router.post('/orders/confirm', requireStaffCheckout, async (req, res) => {
  try {
    if (!requireStaffConfirmationMode()) {
      return res.status(400).json({ error: 'Staff confirmation mode is not enabled.' });
    }
    const { order_number } = req.body || {};
    if (!order_number || !String(order_number).trim()) {
      return res.status(400).json({ error: 'order_number is required' });
    }
    const { rows } = await query('SELECT * FROM orders WHERE order_number = $1', [
      String(order_number).trim(),
    ]);
    const order = rows[0];
    if (!order) return res.status(404).json({ error: 'Order not found' });

    const staffId = req.staff?.id || null;
    const out = await finalizeAwaitingOrder(order, staffId, req);
    if (!out.ok) {
      const status =
        out.code === 'STOCK' ? 409 : out.code === 'PAYMENT_NOT_VERIFIED' ? 403 : 400;
      return res.status(status).json({ error: out.error, code: out.code });
    }
    res.json({ message: 'Order confirmed', order_number: out.order_number });
  } catch (e) {
    console.error('orders/confirm:', e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/orders/track/:orderNumber', async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT order_number, status, items, created_at, updated_at, customer_name, shipping, total,
              payment_method, payment_verified_at
       FROM orders WHERE order_number = $1`,
      [req.params.orderNumber]
    );
    const order = rows[0];
    if (!order) return res.status(404).json({ error: 'Order not found' });

    order.items = parseJsonSafe(order.items, []);

    res.json({
      order_number: order.order_number,
      status: order.status,
      items: order.items,
      total: order.total,
      shipping: order.shipping,
      customer_name: order.customer_name,
      payment_method: order.payment_method,
      payment_verified_at: order.payment_verified_at,
      created_at: order.created_at,
      updated_at: order.updated_at
    });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/orders/:orderNumber', async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM orders WHERE order_number = $1', [req.params.orderNumber]);
    const order = rows[0];
    if (!order) return res.status(404).json({ error: 'Order not found' });
    order.items = parseJsonSafe(order.items, []);
    res.json({ order });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ==================== REVIEWS ====================
router.get('/reviews/:productId', async (req, res) => {
  try {
    const { rows: reviews } = await query('SELECT * FROM reviews WHERE product_id = $1 ORDER BY created_at DESC', [req.params.productId]);
    const { rows: statsRows } = await query('SELECT AVG(rating) as avg, COUNT(*) as count FROM reviews WHERE product_id = $1', [req.params.productId]);
    const stats = statsRows[0];
    res.json({ reviews, average: Math.round((parseFloat(stats.avg) || 0) * 10) / 10, count: parseInt(stats.count) });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/reviews', async (req, res) => {
  try {
    const { product_id, customer_name, rating, title, comment } = req.body;
    if (!product_id || !customer_name || !rating) return res.status(400).json({ error: 'Missing fields' });

    await query(
      'INSERT INTO reviews (product_id, customer_name, rating, title, comment) VALUES ($1, $2, $3, $4, $5)',
      [product_id, customer_name, Math.min(5, Math.max(1, parseInt(rating))), title || '', comment || '']
    );
    res.status(201).json({ message: 'Review submitted!' });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ==================== STOCK VALIDATION ====================
router.post('/validate-stock', async (req, res) => {
  try {
    const { items } = req.body;
    if (!items || !Array.isArray(items)) return res.json({ valid: true, issues: [] });

    const issues = [];
    for (const item of items) {
      const { rows } = await query('SELECT stock, name FROM products WHERE id = $1', [item.id]);
      const product = rows[0];
      if (product && product.stock < item.qty) {
        issues.push({ id: item.id, name: product.name, available: product.stock });
      }
    }

    res.json({ valid: issues.length === 0, issues });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/stock-check', async (req, res) => {
  try {
    const { items } = req.body;
    if (!items) return res.json({ valid: true });
    const issues = [];
    for (const item of items) {
      const { rows } = await query('SELECT stock, name FROM products WHERE id = $1', [item.id]);
      const product = rows[0];
      if (product && product.stock < item.qty) {
        issues.push({ id: item.id, name: product.name, available: product.stock, requested: item.qty });
      }
    }
    res.json({ valid: issues.length === 0, issues });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ==================== WISHLIST ====================
router.get('/wishlist', async (req, res) => {
  try {
    const { session_id } = req.query;
    if (!session_id) return res.status(400).json({ error: 'session_id is required' });

    const { rows } = await query(`
      SELECT p.*, c.name as category_name FROM wishlists w
      JOIN products p ON w.product_id = p.id LEFT JOIN categories c ON p.category_id = c.id
      WHERE w.session_id = $1 ORDER BY w.created_at DESC
    `, [session_id]);
    const items = rows.map(p => ({
      ...p, images: parseJsonSafe(p.images, []), sizes: parseJsonSafe(p.sizes, []), colors: parseJsonSafe(p.colors, [])
    }));

    res.json({ items });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/wishlist', async (req, res) => {
  try {
    const { session_id, product_id } = req.body;
    if (!session_id || !product_id) return res.status(400).json({ error: 'Missing fields' });

    const insertResult = await query(
      'INSERT INTO wishlists (session_id, product_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [session_id, product_id]
    );
    if (insertResult.rowCount === 0) {
      await query('DELETE FROM wishlists WHERE session_id = $1 AND product_id = $2', [session_id, product_id]);
      return res.json({ message: 'Removed from wishlist', removed: true });
    }
    res.json({ message: 'Added to wishlist' });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/wishlist/:product_id', async (req, res) => {
  try {
    const { session_id } = req.query;
    if (!session_id) return res.status(400).json({ error: 'session_id is required' });

    const result = await query('DELETE FROM wishlists WHERE session_id = $1 AND product_id = $2', [session_id, req.params.product_id]);

    if (result.rowCount === 0) return res.status(404).json({ error: 'Wishlist item not found' });
    res.json({ message: 'Removed from wishlist' });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/wishlist/:sessionId', async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT p.*, c.name as category_name FROM wishlists w
      JOIN products p ON w.product_id = p.id LEFT JOIN categories c ON p.category_id = c.id
      WHERE w.session_id = $1 ORDER BY w.created_at DESC
    `, [req.params.sessionId]);
    const items = rows.map(p => ({
      ...p, images: parseJsonSafe(p.images, []), sizes: parseJsonSafe(p.sizes, []), colors: parseJsonSafe(p.colors, [])
    }));
    res.json({ items });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/wishlist/:sessionId/ids', async (req, res) => {
  try {
    const { rows } = await query('SELECT product_id FROM wishlists WHERE session_id = $1', [req.params.sessionId]);
    const ids = rows.map(r => r.product_id);
    res.json({ ids });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ==================== NEWSLETTER ====================
router.post('/newsletter', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required' });

    const result = await query('INSERT INTO newsletter_subscribers (email) VALUES ($1) ON CONFLICT DO NOTHING', [email]);
    if (result.rowCount === 0) return res.json({ message: 'Already subscribed!' });
    res.json({ message: 'Subscribed successfully!' });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ==================== SEARCH ====================
router.get('/search', async (req, res) => {
  try {
    const { q } = req.query;
    if (!q) return res.json({ products: [] });
    const { rows } = await query(`
      SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id
      WHERE p.name ILIKE $1 OR p.description ILIKE $2 OR c.name ILIKE $3 LIMIT 20
    `, [`%${q}%`, `%${q}%`, `%${q}%`]);
    const products = rows.map(p => ({
      ...p, images: parseJsonSafe(p.images, []), sizes: parseJsonSafe(p.sizes, []), colors: parseJsonSafe(p.colors, [])
    }));
    res.json({ products });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ==================== CUSTOMER AUTH ====================
router.post('/customers/register', async (req, res) => {
  try {
    const { full_name, email, phone, password } = req.body;
    if (!full_name || !email || !password) return res.status(400).json({ error: 'Missing required fields' });

    const hashed = bcrypt.hashSync(password, 10);
    const result = await query(
      'INSERT INTO customers (full_name, email, phone, password) VALUES ($1, $2, $3, $4) RETURNING id',
      [full_name, email, phone || '', hashed]
    );
    const id = result.rows[0].id;
    const token = jwt.sign({ id, email }, JWT_SECRET, { expiresIn: '30d' });
    res.status(201).json({ token, customer: { id, full_name, email, phone } });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Email already registered' });
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/customers/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const { rows } = await query('SELECT * FROM customers WHERE email = $1', [email]);
    const customer = rows[0];
    if (!customer || !bcrypt.compareSync(password, customer.password)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const token = jwt.sign({ id: customer.id, email }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, customer: { id: customer.id, full_name: customer.full_name, email: customer.email, phone: customer.phone, address: customer.address, city: customer.city, state: customer.state } });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/customers/profile', authenticateCustomer, async (req, res) => {
  try {
    const { rows } = await query('SELECT id, full_name, email, phone, address, city, state, created_at FROM customers WHERE id = $1', [req.customer.id]);
    const customer = rows[0];
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    res.json({ customer });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/customers/orders', authenticateCustomer, async (req, res) => {
  try {
    const { rows: custRows } = await query('SELECT phone FROM customers WHERE id = $1', [req.customer.id]);
    const customer = custRows[0];
    if (!customer) return res.status(404).json({ error: 'Customer not found' });

    const { rows: orderRows } = await query('SELECT * FROM orders WHERE customer_phone = $1 ORDER BY created_at DESC', [customer.phone]);
    const orders = orderRows.map(o => ({
      ...o, items: parseJsonSafe(o.items, [])
    }));

    res.json({ orders });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/customer/register', async (req, res) => {
  try {
    const { full_name, email, phone, password } = req.body;
    if (!full_name || !email || !password) return res.status(400).json({ error: 'Missing required fields' });

    const hashed = bcrypt.hashSync(password, 10);
    const result = await query(
      'INSERT INTO customers (full_name, email, phone, password) VALUES ($1, $2, $3, $4) RETURNING id',
      [full_name, email, phone || '', hashed]
    );
    const id = result.rows[0].id;
    const token = jwt.sign({ id, email }, CUSTOMER_SECRET, { expiresIn: '30d' });
    res.status(201).json({ token, customer: { id, full_name, email, phone } });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Email already registered' });
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/customer/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const { rows } = await query('SELECT * FROM customers WHERE email = $1', [email]);
    const customer = rows[0];
    if (!customer || !bcrypt.compareSync(password, customer.password)) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const token = jwt.sign({ id: customer.id, email }, CUSTOMER_SECRET, { expiresIn: '30d' });
    res.json({ token, customer: { id: customer.id, full_name: customer.full_name, email: customer.email, phone: customer.phone, address: customer.address, city: customer.city, state: customer.state } });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
