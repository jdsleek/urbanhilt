const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../db/database');
const { authenticateAdmin, JWT_SECRET } = require('../middleware/auth');
const { finalizeAwaitingOrder } = require('../lib/orderFinalize');
const { parseJsonSafe } = require('../lib/parseJsonSafe');

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, path.join(__dirname, '..', 'uploads')),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `${uuidv4()}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    const extname = allowed.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowed.test(file.mimetype);
    cb(null, extname && mimetype);
  }
});

router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required' });
    }

    const { rows } = await query('SELECT * FROM admin_users WHERE username = $1', [String(username).trim()]);
    const admin = rows[0];
    if (!admin) return res.status(401).json({ error: 'Invalid credentials' });

    const hash = admin.password;
    if (!hash || typeof hash !== 'string') {
      console.error('admin login: missing password hash for user', username);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    let valid = false;
    try {
      valid = bcrypt.compareSync(String(password), hash);
    } catch (bcryptErr) {
      console.error('admin login bcrypt:', bcryptErr.message);
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const payload = {
      id: Number(admin.id),
      username: String(admin.username),
      role: String(admin.role || 'admin')
    };
    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' });
    res.json({
      token,
      admin: {
        id: payload.id,
        username: payload.username,
        full_name: admin.full_name || null,
        role: payload.role
      }
    });
  } catch (e) {
    console.error('admin login error:', e.message || e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/dashboard', authenticateAdmin, async (req, res) => {
  try {
    const totalProducts = (await query('SELECT COUNT(*) as count FROM products')).rows[0].count;
    const totalOrders = (await query('SELECT COUNT(*) as count FROM orders')).rows[0].count;
    const totalRevenue = (
      await query(
        `SELECT COALESCE(SUM(total), 0) as sum FROM orders WHERE status NOT IN ('cancelled', 'awaiting_staff')`
      )
    ).rows[0].sum;
    const pendingOrders = (await query('SELECT COUNT(*) as count FROM orders WHERE status = $1', ['pending'])).rows[0]
      .count;
    const awaitingStaffOrders = (
      await query('SELECT COUNT(*) as count FROM orders WHERE status = $1', ['awaiting_staff'])
    ).rows[0].count;

    const { rows: recentOrderRows } = await query('SELECT * FROM orders ORDER BY created_at DESC LIMIT 10');
    const recentOrders = recentOrderRows.map(o => ({
      ...o,
      items: parseJsonSafe(o.items, []),
    }));

    const { rows: topProductRows } = await query('SELECT * FROM products ORDER BY best_seller DESC, created_at DESC LIMIT 5');
    const topProducts = topProductRows.map(p => ({
      ...p,
      images: parseJsonSafe(p.images, []),
    }));

    const subscribers = (await query('SELECT COUNT(*) as count FROM newsletter_subscribers')).rows[0].count;

    const { rows: monthlyOrders } = await query(`
      SELECT TO_CHAR(created_at, 'YYYY-MM') as month, COUNT(*) as orders, SUM(total) as revenue 
      FROM orders WHERE status NOT IN ('cancelled', 'awaiting_staff') GROUP BY month ORDER BY month DESC LIMIT 12
    `);

    res.json({
      totalProducts,
      totalOrders,
      totalRevenue,
      pendingOrders,
      awaitingStaffOrders,
      recentOrders,
      topProducts,
      subscribers,
      monthlyOrders,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/products', authenticateAdmin, async (req, res) => {
  try {
    const { rows: products } = await query(`
      SELECT p.*, c.name as category_name FROM products p 
      LEFT JOIN categories c ON p.category_id = c.id 
      ORDER BY p.created_at DESC
    `);

    res.json({
      products: products.map(p => ({
        ...p,
        images: parseJsonSafe(p.images, []),
        sizes: parseJsonSafe(p.sizes, []),
        colors: parseJsonSafe(p.colors, []),
      })),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/products', authenticateAdmin, upload.array('images', 6), async (req, res) => {
  try {
    const { name, description, price, sale_price, category_id, sizes, colors, featured, new_arrival, best_seller, stock, sku } = req.body;

    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const images = req.files ? req.files.map(f => `/uploads/${f.filename}`) : [];

    let parsedSizes = sizes || '[]';
    let parsedColors = colors || '[]';
    try { if (typeof sizes === 'string' && !sizes.startsWith('[')) parsedSizes = JSON.stringify(sizes.split(',')); } catch (e) {}
    try { if (typeof colors === 'string' && !colors.startsWith('[')) parsedColors = JSON.stringify(colors.split(',')); } catch (e) {}

    const existingImages = req.body.existing_images ? JSON.parse(req.body.existing_images) : [];
    const allImages = [...existingImages, ...images];

    const result = await query(`
      INSERT INTO products (name, slug, description, price, sale_price, category_id, sizes, colors, images, featured, new_arrival, best_seller, stock, sku)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      RETURNING id
    `, [
      name, slug, description || '', parseFloat(price), sale_price ? parseFloat(sale_price) : null,
      category_id ? parseInt(category_id) : null, parsedSizes, parsedColors,
      JSON.stringify(allImages), featured ? 1 : 0, new_arrival ? 1 : 0, best_seller ? 1 : 0,
      parseInt(stock) || 0, sku || null
    ]);

    res.status(201).json({ message: 'Product created', id: result.rows[0].id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/products/:id', authenticateAdmin, upload.array('images', 6), async (req, res) => {
  try {
    const { name, description, price, sale_price, category_id, sizes, colors, featured, new_arrival, best_seller, stock, sku } = req.body;
    const { id } = req.params;

    const { rows } = await query('SELECT * FROM products WHERE id = $1', [id]);
    const existing = rows[0];
    if (!existing) return res.status(404).json({ error: 'Product not found' });

    const slug = name ? name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') : existing.slug;
    const newImages = req.files ? req.files.map(f => `/uploads/${f.filename}`) : [];
    const existingImages = req.body.existing_images ? JSON.parse(req.body.existing_images) : JSON.parse(existing.images || '[]');
    const allImages = [...existingImages, ...newImages];

    let parsedSizes = sizes || existing.sizes;
    let parsedColors = colors || existing.colors;
    try { if (typeof sizes === 'string' && !sizes.startsWith('[')) parsedSizes = JSON.stringify(sizes.split(',')); } catch (e) {}
    try { if (typeof colors === 'string' && !colors.startsWith('[')) parsedColors = JSON.stringify(colors.split(',')); } catch (e) {}

    await query(`
      UPDATE products SET name=$1, slug=$2, description=$3, price=$4, sale_price=$5, category_id=$6, 
      sizes=$7, colors=$8, images=$9, featured=$10, new_arrival=$11, best_seller=$12, stock=$13, sku=$14
      WHERE id=$15
    `, [
      name || existing.name, slug, description ?? existing.description,
      price ? parseFloat(price) : existing.price, sale_price ? parseFloat(sale_price) : existing.sale_price,
      category_id ? parseInt(category_id) : existing.category_id,
      parsedSizes, parsedColors, JSON.stringify(allImages),
      featured !== undefined ? (featured ? 1 : 0) : existing.featured,
      new_arrival !== undefined ? (new_arrival ? 1 : 0) : existing.new_arrival,
      best_seller !== undefined ? (best_seller ? 1 : 0) : existing.best_seller,
      stock !== undefined ? parseInt(stock) : existing.stock,
      sku || existing.sku, id
    ]);

    res.json({ message: 'Product updated' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/products/:id', authenticateAdmin, async (req, res) => {
  try {
    await query('DELETE FROM products WHERE id = $1', [req.params.id]);
    res.json({ message: 'Product deleted' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/categories', authenticateAdmin, async (req, res) => {
  try {
    const { rows: categories } = await query('SELECT * FROM categories ORDER BY display_order ASC');
    res.json({ categories });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/categories', authenticateAdmin, async (req, res) => {
  try {
    const { name, description, image, display_order } = req.body;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    const result = await query(
      'INSERT INTO categories (name, slug, description, image, display_order) VALUES ($1, $2, $3, $4, $5) RETURNING id',
      [name, slug, description || '', image || '', display_order || 0]
    );
    res.status(201).json({ message: 'Category created', id: result.rows[0].id });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/categories/:id', authenticateAdmin, async (req, res) => {
  try {
    const { name, description, image, display_order } = req.body;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

    await query(
      'UPDATE categories SET name=$1, slug=$2, description=$3, image=$4, display_order=$5 WHERE id=$6',
      [name, slug, description || '', image || '', display_order || 0, req.params.id]
    );
    res.json({ message: 'Category updated' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/categories/:id', authenticateAdmin, async (req, res) => {
  try {
    await query('DELETE FROM categories WHERE id = $1', [req.params.id]);
    res.json({ message: 'Category deleted' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/orders', authenticateAdmin, async (req, res) => {
  try {
    const { status, limit, offset, search } = req.query;
    let q = 'SELECT * FROM orders';
    const params = [];
    let paramIdx = 1;
    const conditions = [];

    if (status) {
      conditions.push(`status = $${paramIdx++}`);
      params.push(status);
    }
    const rawSearch = typeof search === 'string' ? search.trim().slice(0, 80) : '';
    if (rawSearch) {
      conditions.push(`order_number ILIKE $${paramIdx++}`);
      params.push(`%${rawSearch}%`);
    }
    if (conditions.length) q += ` WHERE ${conditions.join(' AND ')}`;
    q += ' ORDER BY created_at DESC';
    if (limit) { q += ` LIMIT $${paramIdx++}`; params.push(parseInt(limit)); }
    if (offset) { q += ` OFFSET $${paramIdx++}`; params.push(parseInt(offset)); }

    const { rows: orders } = await query(q, params);
    const total = (await query('SELECT COUNT(*) as count FROM orders')).rows[0].count;

    res.json({
      orders: orders.map(o => ({
        ...o,
        items: parseJsonSafe(o.items, []),
      })),
      total,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/orders/:id', authenticateAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    await query('UPDATE orders SET status = $1 WHERE id = $2', [status, req.params.id]);
    res.json({ message: 'Order updated' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

/** Confirm customer-submitted order (same as staff API — deducts stock, applies discount). */
router.post('/orders/:id/confirm', authenticateAdmin, async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM orders WHERE id = $1', [req.params.id]);
    const order = rows[0];
    if (!order) return res.status(404).json({ error: 'Order not found' });
    const out = await finalizeAwaitingOrder(order, null, null, { skipPaymentCheck: true });
    if (!out.ok) {
      const status = out.code === 'STOCK' ? 409 : 400;
      return res.status(status).json({ error: out.error, code: out.code });
    }
    res.json({
      message: 'Order confirmed (admin override — payment rules skipped)',
      order_number: out.order_number,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

/** Boss / admin: mark payment verified (same as staff step). */
router.post('/orders/:id/verify-payment', authenticateAdmin, async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM orders WHERE id = $1', [req.params.id]);
    const order = rows[0];
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.status !== 'awaiting_staff') {
      return res.status(400).json({ error: 'Only orders awaiting staff can be updated.' });
    }
    await query(
      `UPDATE orders SET payment_verified_at = NOW(), payment_verified_by_staff_id = NULL, updated_at = NOW() WHERE id = $1`,
      [order.id]
    );
    res.json({ message: 'Payment marked verified (admin)', order_number: order.order_number });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/orders/:id', authenticateAdmin, async (req, res) => {
  try {
    await query('DELETE FROM orders WHERE id = $1', [req.params.id]);
    res.json({ message: 'Order deleted' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/upload', authenticateAdmin, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ url: `/uploads/${req.file.filename}` });
});

router.get('/subscribers', authenticateAdmin, async (req, res) => {
  try {
    const { rows: subscribers } = await query('SELECT * FROM newsletter_subscribers ORDER BY subscribed_at DESC');
    res.json({ subscribers });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ==================== SALES STAFF (PIN management) ====================
router.get('/sales-staff', authenticateAdmin, async (req, res) => {
  try {
    const { rows } = await query(
      `SELECT id, name, job_title, phone, email, photo_url, staff_code, active, created_at
       FROM sales_staff ORDER BY name ASC`
    );
    res.json({ staff: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/sales-staff', authenticateAdmin, async (req, res) => {
  try {
    const { name, pin, job_title, phone, email, photo_url, staff_code } = req.body;
    if (!name || !pin || String(pin).length < 4) {
      return res.status(400).json({ error: 'Name and PIN (min 4 digits) required' });
    }
    const pin_hash = bcrypt.hashSync(String(pin), 10);
    const { rows } = await query(
      `INSERT INTO sales_staff (name, pin_hash, job_title, phone, email, photo_url, staff_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, job_title, phone, email, photo_url, staff_code, active, created_at`,
      [
        name.trim(),
        pin_hash,
        job_title?.trim() || null,
        phone?.trim() || null,
        email?.trim() || null,
        photo_url?.trim() || null,
        staff_code?.trim() || null,
      ]
    );
    res.status(201).json({ staff: rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/sales-staff/:id', authenticateAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const { name, pin, active, job_title, phone, email, photo_url, staff_code } = req.body;
    const act = active === false ? 0 : active === true ? 1 : null;

    if (pin && String(pin).length >= 4) {
      const pin_hash = bcrypt.hashSync(String(pin), 10);
      await query(
        `UPDATE sales_staff SET
          name = $1, pin_hash = $2, active = $3,
          job_title = $4, phone = $5, email = $6, photo_url = $7, staff_code = $8
         WHERE id = $9`,
        [
          (name && String(name).trim()) || 'Staff',
          pin_hash,
          act !== null ? act : 1,
          job_title?.trim() || null,
          phone?.trim() || null,
          email?.trim() || null,
          photo_url?.trim() || null,
          staff_code?.trim() || null,
          id,
        ]
      );
    } else {
      await query(
        `UPDATE sales_staff SET
          name = COALESCE($1, name),
          active = COALESCE($2, active),
          job_title = $3, phone = $4, email = $5, photo_url = $6, staff_code = $7
         WHERE id = $8`,
        [
          name?.trim() || null,
          act,
          job_title?.trim() || null,
          phone?.trim() || null,
          email?.trim() || null,
          photo_url?.trim() || null,
          staff_code?.trim() || null,
          id,
        ]
      );
    }
    res.json({ message: 'Updated' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/sales-staff/:id', authenticateAdmin, async (req, res) => {
  try {
    await query('UPDATE sales_staff SET active = 0 WHERE id = $1', [req.params.id]);
    res.json({ message: 'Staff deactivated' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ==================== DISCOUNT CODES ====================
router.get('/discount-codes', authenticateAdmin, async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM discount_codes ORDER BY created_at DESC');
    res.json({ discounts: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/discount-codes', authenticateAdmin, async (req, res) => {
  try {
    const { code, description, discount_type, value, min_subtotal, max_uses, valid_from, valid_until, active } = req.body;
    if (!code || value == null) return res.status(400).json({ error: 'Code and value required' });
    const { rows } = await query(
      `INSERT INTO discount_codes (code, description, discount_type, value, min_subtotal, max_uses, valid_from, valid_until, active)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [
        String(code).trim().toUpperCase(),
        description || '',
        discount_type === 'fixed' ? 'fixed' : 'percent',
        parseFloat(value),
        parseFloat(min_subtotal) || 0,
        max_uses != null ? parseInt(max_uses, 10) : null,
        valid_from || null,
        valid_until || null,
        active === false ? 0 : 1,
      ]
    );
    res.status(201).json({ discount: rows[0] });
  } catch (e) {
    if (e.code === '23505') return res.status(400).json({ error: 'Code already exists' });
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.put('/discount-codes/:id', authenticateAdmin, async (req, res) => {
  try {
    const { description, discount_type, value, min_subtotal, max_uses, valid_from, valid_until, active } = req.body;
    await query(
      `UPDATE discount_codes SET description = COALESCE($1, description), discount_type = COALESCE($2, discount_type),
       value = COALESCE($3, value), min_subtotal = COALESCE($4, min_subtotal), max_uses = COALESCE($5, max_uses),
       valid_from = COALESCE($6, valid_from), valid_until = COALESCE($7, valid_until), active = COALESCE($8, active)
       WHERE id = $9`,
      [
        description,
        discount_type,
        value != null ? parseFloat(value) : null,
        min_subtotal != null ? parseFloat(min_subtotal) : null,
        max_uses !== undefined ? max_uses : null,
        valid_from,
        valid_until,
        active != null ? (active ? 1 : 0) : null,
        req.params.id,
      ]
    );
    res.json({ message: 'Updated' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/discount-codes/:id', authenticateAdmin, async (req, res) => {
  try {
    await query('DELETE FROM discount_codes WHERE id = $1', [req.params.id]);
    res.json({ message: 'Deleted' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

// ==================== STAFF ACCESS LOGS ====================
router.get('/staff-logs', authenticateAdmin, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 200, 500);
    const { rows } = await query(
      `SELECT l.*, s.name as staff_name FROM staff_access_logs l
       LEFT JOIN sales_staff s ON l.staff_id = s.id
       ORDER BY l.created_at DESC LIMIT $1`,
      [limit]
    );
    res.json({ logs: rows });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
