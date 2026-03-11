const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { query } = require('../db/database');
const { authenticateAdmin, JWT_SECRET } = require('../middleware/auth');

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
    const { username, password } = req.body;

    const { rows } = await query('SELECT * FROM admin_users WHERE username = $1', [username]);
    const admin = rows[0];
    if (!admin) return res.status(401).json({ error: 'Invalid credentials' });

    const valid = bcrypt.compareSync(password, admin.password);
    if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: admin.id, username: admin.username, role: admin.role }, JWT_SECRET, { expiresIn: '24h' });
    res.json({ token, admin: { id: admin.id, username: admin.username, full_name: admin.full_name, role: admin.role } });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/dashboard', authenticateAdmin, async (req, res) => {
  try {
    const totalProducts = (await query('SELECT COUNT(*) as count FROM products')).rows[0].count;
    const totalOrders = (await query('SELECT COUNT(*) as count FROM orders')).rows[0].count;
    const totalRevenue = (await query('SELECT COALESCE(SUM(total), 0) as sum FROM orders WHERE status != $1', ['cancelled'])).rows[0].sum;
    const pendingOrders = (await query('SELECT COUNT(*) as count FROM orders WHERE status = $1', ['pending'])).rows[0].count;

    const { rows: recentOrderRows } = await query('SELECT * FROM orders ORDER BY created_at DESC LIMIT 10');
    const recentOrders = recentOrderRows.map(o => ({
      ...o, items: JSON.parse(o.items || '[]')
    }));

    const { rows: topProductRows } = await query('SELECT * FROM products ORDER BY best_seller DESC, created_at DESC LIMIT 5');
    const topProducts = topProductRows.map(p => ({
      ...p, images: JSON.parse(p.images || '[]')
    }));

    const subscribers = (await query('SELECT COUNT(*) as count FROM newsletter_subscribers')).rows[0].count;

    const { rows: monthlyOrders } = await query(`
      SELECT TO_CHAR(created_at, 'YYYY-MM') as month, COUNT(*) as orders, SUM(total) as revenue 
      FROM orders WHERE status != 'cancelled' GROUP BY month ORDER BY month DESC LIMIT 12
    `);

    res.json({ totalProducts, totalOrders, totalRevenue, pendingOrders, recentOrders, topProducts, subscribers, monthlyOrders });
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
        images: JSON.parse(p.images || '[]'),
        sizes: JSON.parse(p.sizes || '[]'),
        colors: JSON.parse(p.colors || '[]')
      }))
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
    const { status, limit, offset } = req.query;
    let q = 'SELECT * FROM orders';
    const params = [];
    let paramIdx = 1;

    if (status) { q += ` WHERE status = $${paramIdx++}`; params.push(status); }
    q += ' ORDER BY created_at DESC';
    if (limit) { q += ` LIMIT $${paramIdx++}`; params.push(parseInt(limit)); }
    if (offset) { q += ` OFFSET $${paramIdx++}`; params.push(parseInt(offset)); }

    const { rows: orders } = await query(q, params);
    const total = (await query('SELECT COUNT(*) as count FROM orders')).rows[0].count;

    res.json({
      orders: orders.map(o => ({ ...o, items: JSON.parse(o.items || '[]') })),
      total
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

module.exports = router;
