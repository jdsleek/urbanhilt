const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');
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

router.post('/login', (req, res) => {
  const db = getDb();
  const { username, password } = req.body;

  const admin = db.prepare('SELECT * FROM admin_users WHERE username = ?').get(username);
  if (!admin) return res.status(401).json({ error: 'Invalid credentials' });

  const valid = bcrypt.compareSync(password, admin.password);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  const token = jwt.sign({ id: admin.id, username: admin.username, role: admin.role }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token, admin: { id: admin.id, username: admin.username, full_name: admin.full_name, role: admin.role } });
});

router.get('/dashboard', authenticateAdmin, (req, res) => {
  const db = getDb();
  const totalProducts = db.prepare('SELECT COUNT(*) as count FROM products').get().count;
  const totalOrders = db.prepare('SELECT COUNT(*) as count FROM orders').get().count;
  const totalRevenue = db.prepare('SELECT COALESCE(SUM(total), 0) as sum FROM orders WHERE status != ?').get('cancelled').sum;
  const pendingOrders = db.prepare('SELECT COUNT(*) as count FROM orders WHERE status = ?').get('pending').count;
  const recentOrders = db.prepare('SELECT * FROM orders ORDER BY created_at DESC LIMIT 10').all().map(o => ({
    ...o, items: JSON.parse(o.items || '[]')
  }));
  const topProducts = db.prepare('SELECT * FROM products ORDER BY best_seller DESC, created_at DESC LIMIT 5').all().map(p => ({
    ...p, images: JSON.parse(p.images || '[]')
  }));
  const subscribers = db.prepare('SELECT COUNT(*) as count FROM newsletter_subscribers').get().count;

  const monthlyOrders = db.prepare(`
    SELECT strftime('%Y-%m', created_at) as month, COUNT(*) as orders, SUM(total) as revenue 
    FROM orders WHERE status != 'cancelled' GROUP BY month ORDER BY month DESC LIMIT 12
  `).all();

  res.json({ totalProducts, totalOrders, totalRevenue, pendingOrders, recentOrders, topProducts, subscribers, monthlyOrders });
});

router.get('/products', authenticateAdmin, (req, res) => {
  const db = getDb();
  const products = db.prepare(`
    SELECT p.*, c.name as category_name FROM products p 
    LEFT JOIN categories c ON p.category_id = c.id 
    ORDER BY p.created_at DESC
  `).all().map(p => ({
    ...p,
    images: JSON.parse(p.images || '[]'),
    sizes: JSON.parse(p.sizes || '[]'),
    colors: JSON.parse(p.colors || '[]')
  }));
  res.json({ products });
});

router.post('/products', authenticateAdmin, upload.array('images', 6), (req, res) => {
  const db = getDb();
  const { name, description, price, sale_price, category_id, sizes, colors, featured, new_arrival, best_seller, stock, sku } = req.body;

  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const images = req.files ? req.files.map(f => `/uploads/${f.filename}`) : [];

  let parsedSizes = sizes || '[]';
  let parsedColors = colors || '[]';
  try { if (typeof sizes === 'string' && !sizes.startsWith('[')) parsedSizes = JSON.stringify(sizes.split(',')); } catch (e) {}
  try { if (typeof colors === 'string' && !colors.startsWith('[')) parsedColors = JSON.stringify(colors.split(',')); } catch (e) {}

  const existingImages = req.body.existing_images ? JSON.parse(req.body.existing_images) : [];
  const allImages = [...existingImages, ...images];

  const stmt = db.prepare(`
    INSERT INTO products (name, slug, description, price, sale_price, category_id, sizes, colors, images, featured, new_arrival, best_seller, stock, sku)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(
    name, slug, description || '', parseFloat(price), sale_price ? parseFloat(sale_price) : null,
    category_id ? parseInt(category_id) : null, parsedSizes, parsedColors,
    JSON.stringify(allImages), featured ? 1 : 0, new_arrival ? 1 : 0, best_seller ? 1 : 0,
    parseInt(stock) || 0, sku || null
  );

  res.status(201).json({ message: 'Product created', id: result.lastInsertRowid });
});

router.put('/products/:id', authenticateAdmin, upload.array('images', 6), (req, res) => {
  const db = getDb();
  const { name, description, price, sale_price, category_id, sizes, colors, featured, new_arrival, best_seller, stock, sku } = req.body;
  const { id } = req.params;

  const existing = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!existing) return res.status(404).json({ error: 'Product not found' });

  const slug = name ? name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') : existing.slug;
  const newImages = req.files ? req.files.map(f => `/uploads/${f.filename}`) : [];
  const existingImages = req.body.existing_images ? JSON.parse(req.body.existing_images) : JSON.parse(existing.images || '[]');
  const allImages = [...existingImages, ...newImages];

  let parsedSizes = sizes || existing.sizes;
  let parsedColors = colors || existing.colors;
  try { if (typeof sizes === 'string' && !sizes.startsWith('[')) parsedSizes = JSON.stringify(sizes.split(',')); } catch (e) {}
  try { if (typeof colors === 'string' && !colors.startsWith('[')) parsedColors = JSON.stringify(colors.split(',')); } catch (e) {}

  db.prepare(`
    UPDATE products SET name=?, slug=?, description=?, price=?, sale_price=?, category_id=?, 
    sizes=?, colors=?, images=?, featured=?, new_arrival=?, best_seller=?, stock=?, sku=?
    WHERE id=?
  `).run(
    name || existing.name, slug, description ?? existing.description,
    price ? parseFloat(price) : existing.price, sale_price ? parseFloat(sale_price) : existing.sale_price,
    category_id ? parseInt(category_id) : existing.category_id,
    parsedSizes, parsedColors, JSON.stringify(allImages),
    featured !== undefined ? (featured ? 1 : 0) : existing.featured,
    new_arrival !== undefined ? (new_arrival ? 1 : 0) : existing.new_arrival,
    best_seller !== undefined ? (best_seller ? 1 : 0) : existing.best_seller,
    stock !== undefined ? parseInt(stock) : existing.stock,
    sku || existing.sku, id
  );

  res.json({ message: 'Product updated' });
});

router.delete('/products/:id', authenticateAdmin, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  res.json({ message: 'Product deleted' });
});

router.get('/categories', authenticateAdmin, (req, res) => {
  const db = getDb();
  const categories = db.prepare('SELECT * FROM categories ORDER BY display_order ASC').all();
  res.json({ categories });
});

router.post('/categories', authenticateAdmin, (req, res) => {
  const db = getDb();
  const { name, description, image, display_order } = req.body;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  const result = db.prepare('INSERT INTO categories (name, slug, description, image, display_order) VALUES (?, ?, ?, ?, ?)')
    .run(name, slug, description || '', image || '', display_order || 0);
  res.status(201).json({ message: 'Category created', id: result.lastInsertRowid });
});

router.put('/categories/:id', authenticateAdmin, (req, res) => {
  const db = getDb();
  const { name, description, image, display_order } = req.body;
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

  db.prepare('UPDATE categories SET name=?, slug=?, description=?, image=?, display_order=? WHERE id=?')
    .run(name, slug, description || '', image || '', display_order || 0, req.params.id);
  res.json({ message: 'Category updated' });
});

router.delete('/categories/:id', authenticateAdmin, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
  res.json({ message: 'Category deleted' });
});

router.get('/orders', authenticateAdmin, (req, res) => {
  const db = getDb();
  const { status, limit, offset } = req.query;
  let query = 'SELECT * FROM orders';
  const params = [];

  if (status) { query += ' WHERE status = ?'; params.push(status); }
  query += ' ORDER BY created_at DESC';
  if (limit) { query += ' LIMIT ?'; params.push(parseInt(limit)); }
  if (offset) { query += ' OFFSET ?'; params.push(parseInt(offset)); }

  const orders = db.prepare(query).all(...params).map(o => ({ ...o, items: JSON.parse(o.items || '[]') }));
  const total = db.prepare('SELECT COUNT(*) as count FROM orders').get().count;
  res.json({ orders, total });
});

router.put('/orders/:id', authenticateAdmin, (req, res) => {
  const db = getDb();
  const { status } = req.body;
  db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ message: 'Order updated' });
});

router.delete('/orders/:id', authenticateAdmin, (req, res) => {
  const db = getDb();
  db.prepare('DELETE FROM orders WHERE id = ?').run(req.params.id);
  res.json({ message: 'Order deleted' });
});

router.post('/upload', authenticateAdmin, upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  res.json({ url: `/uploads/${req.file.filename}` });
});

router.get('/subscribers', authenticateAdmin, (req, res) => {
  const db = getDb();
  const subscribers = db.prepare('SELECT * FROM newsletter_subscribers ORDER BY subscribed_at DESC').all();
  res.json({ subscribers });
});

module.exports = router;
