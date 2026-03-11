const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb } = require('../db/database');

const JWT_SECRET = process.env.JWT_SECRET || 'urbanhilt-luxury-2024-secret-key';
const CUSTOMER_SECRET = process.env.CUSTOMER_SECRET || 'uh-customer-secret-2024';

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

// ==================== PRODUCTS ====================
router.get('/products', (req, res) => {
  const db = getDb();
  const { category, search, sort, min_price, max_price, featured, new_arrival, best_seller, sale, limit, offset } = req.query;

  let query = `SELECT p.*, c.name as category_name, c.slug as category_slug FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE 1=1`;
  const params = [];

  if (category) { query += ` AND c.slug = ?`; params.push(category); }
  if (search) { query += ` AND (p.name LIKE ? OR p.description LIKE ?)`; params.push(`%${search}%`, `%${search}%`); }
  if (min_price) { query += ` AND p.price >= ?`; params.push(parseFloat(min_price)); }
  if (max_price) { query += ` AND p.price <= ?`; params.push(parseFloat(max_price)); }
  if (featured === '1') query += ` AND p.featured = 1`;
  if (new_arrival === '1') query += ` AND p.new_arrival = 1`;
  if (best_seller === '1') query += ` AND p.best_seller = 1`;
  if (sale === '1') query += ` AND p.sale_price IS NOT NULL`;

  switch (sort) {
    case 'price_asc': query += ` ORDER BY COALESCE(p.sale_price, p.price) ASC`; break;
    case 'price_desc': query += ` ORDER BY COALESCE(p.sale_price, p.price) DESC`; break;
    case 'name_asc': query += ` ORDER BY p.name ASC`; break;
    case 'newest': query += ` ORDER BY p.created_at DESC`; break;
    default: query += ` ORDER BY p.featured DESC, p.created_at DESC`;
  }

  const countQuery = query.replace(/SELECT[\s\S]*?FROM/, 'SELECT COUNT(*) as total FROM').replace(/ORDER BY[\s\S]*$/, '');
  const total = db.prepare(countQuery).get(...params)?.total || 0;

  if (limit) { query += ` LIMIT ?`; params.push(parseInt(limit)); }
  if (offset) { query += ` OFFSET ?`; params.push(parseInt(offset)); }

  const products = db.prepare(query).all(...params).map(p => ({
    ...p,
    images: JSON.parse(p.images || '[]'),
    sizes: JSON.parse(p.sizes || '[]'),
    colors: JSON.parse(p.colors || '[]')
  }));

  res.json({ products, total });
});

router.get('/products/:slug', (req, res) => {
  const db = getDb();
  const product = db.prepare(`
    SELECT p.*, c.name as category_name, c.slug as category_slug 
    FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE p.slug = ?
  `).get(req.params.slug);

  if (!product) return res.status(404).json({ error: 'Product not found' });

  product.images = JSON.parse(product.images || '[]');
  product.sizes = JSON.parse(product.sizes || '[]');
  product.colors = JSON.parse(product.colors || '[]');

  const related = db.prepare(`SELECT * FROM products WHERE category_id = ? AND id != ? LIMIT 4`)
    .all(product.category_id, product.id).map(p => ({
      ...p, images: JSON.parse(p.images || '[]'), sizes: JSON.parse(p.sizes || '[]'), colors: JSON.parse(p.colors || '[]')
    }));

  const reviews = db.prepare(`SELECT * FROM reviews WHERE product_id = ? ORDER BY created_at DESC`).all(product.id);
  const avgRating = db.prepare(`SELECT AVG(rating) as avg, COUNT(*) as count FROM reviews WHERE product_id = ?`).get(product.id);

  res.json({ product, related, reviews, rating: { average: Math.round((avgRating.avg || 0) * 10) / 10, count: avgRating.count } });
});

// ==================== PRODUCT REVIEWS (by slug) ====================
router.get('/products/:slug/reviews', (req, res) => {
  const db = getDb();
  const product = db.prepare('SELECT id FROM products WHERE slug = ?').get(req.params.slug);
  if (!product) return res.status(404).json({ error: 'Product not found' });

  const reviews = db.prepare('SELECT * FROM reviews WHERE product_id = ? ORDER BY created_at DESC').all(product.id);
  const stats = db.prepare('SELECT AVG(rating) as avg, COUNT(*) as count FROM reviews WHERE product_id = ?').get(product.id);

  res.json({
    reviews,
    average_rating: Math.round((stats.avg || 0) * 10) / 10,
    count: stats.count
  });
});

router.post('/products/:slug/reviews', (req, res) => {
  const db = getDb();
  const product = db.prepare('SELECT id FROM products WHERE slug = ?').get(req.params.slug);
  if (!product) return res.status(404).json({ error: 'Product not found' });

  const { customer_name, rating, title, comment } = req.body;
  if (!customer_name || !rating) return res.status(400).json({ error: 'Missing required fields' });

  db.prepare('INSERT INTO reviews (product_id, customer_name, rating, title, comment) VALUES (?, ?, ?, ?, ?)')
    .run(product.id, customer_name, Math.min(5, Math.max(1, parseInt(rating))), title || '', comment || '');

  res.status(201).json({ message: 'Review submitted!' });
});

// ==================== CATEGORIES ====================
router.get('/categories', (req, res) => {
  const db = getDb();
  const categories = db.prepare(`
    SELECT c.*, COUNT(p.id) as product_count FROM categories c 
    LEFT JOIN products p ON c.id = p.category_id GROUP BY c.id ORDER BY c.display_order ASC
  `).all();
  res.json({ categories });
});

// ==================== ORDERS ====================
router.post('/orders', (req, res) => {
  const db = getDb();
  const { customer_name, customer_email, customer_phone, address, city, state, items, subtotal, shipping, total, payment_method, payment_ref, notes } = req.body;

  if (!customer_name || !customer_phone || !address || !items || !total) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  for (const item of items) {
    const product = db.prepare('SELECT stock, name FROM products WHERE id = ?').get(item.id);
    if (product && product.stock < item.qty) {
      return res.status(400).json({ error: `"${product.name}" only has ${product.stock} left in stock` });
    }
  }

  const orderNumber = 'UH-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();

  const stmt = db.prepare(`
    INSERT INTO orders (order_number, customer_name, customer_email, customer_phone, address, city, state, items, subtotal, shipping, total, payment_method, payment_ref, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(orderNumber, customer_name, customer_email || '', customer_phone, address, city || '', state || '', JSON.stringify(items), subtotal, shipping || 0, total, payment_method || 'pay_on_delivery', payment_ref || '', notes || '');

  const deductStmt = db.prepare('UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?');
  items.forEach(item => deductStmt.run(item.qty, item.id, item.qty));

  res.status(201).json({
    message: 'Order placed successfully!',
    order: { id: result.lastInsertRowid, order_number: orderNumber, total, status: 'pending' }
  });
});

router.get('/orders/track/:orderNumber', (req, res) => {
  const db = getDb();
  const order = db.prepare('SELECT order_number, status, items, created_at, updated_at, customer_name, shipping, total FROM orders WHERE order_number = ?').get(req.params.orderNumber);
  if (!order) return res.status(404).json({ error: 'Order not found' });

  order.items = JSON.parse(order.items || '[]');

  res.json({
    order_number: order.order_number,
    status: order.status,
    items: order.items,
    total: order.total,
    shipping: order.shipping,
    customer_name: order.customer_name,
    created_at: order.created_at,
    updated_at: order.updated_at
  });
});

router.get('/orders/:orderNumber', (req, res) => {
  const db = getDb();
  const order = db.prepare('SELECT * FROM orders WHERE order_number = ?').get(req.params.orderNumber);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  order.items = JSON.parse(order.items || '[]');
  res.json({ order });
});

// ==================== REVIEWS ====================
router.get('/reviews/:productId', (req, res) => {
  const db = getDb();
  const reviews = db.prepare('SELECT * FROM reviews WHERE product_id = ? ORDER BY created_at DESC').all(req.params.productId);
  const stats = db.prepare('SELECT AVG(rating) as avg, COUNT(*) as count FROM reviews WHERE product_id = ?').get(req.params.productId);
  res.json({ reviews, average: Math.round((stats.avg || 0) * 10) / 10, count: stats.count });
});

router.post('/reviews', (req, res) => {
  const db = getDb();
  const { product_id, customer_name, rating, title, comment } = req.body;
  if (!product_id || !customer_name || !rating) return res.status(400).json({ error: 'Missing fields' });

  db.prepare('INSERT INTO reviews (product_id, customer_name, rating, title, comment) VALUES (?, ?, ?, ?, ?)')
    .run(product_id, customer_name, Math.min(5, Math.max(1, parseInt(rating))), title || '', comment || '');
  res.status(201).json({ message: 'Review submitted!' });
});

// ==================== STOCK VALIDATION ====================
router.post('/validate-stock', (req, res) => {
  const db = getDb();
  const { items } = req.body;
  if (!items || !Array.isArray(items)) return res.json({ valid: true, issues: [] });

  const issues = [];
  items.forEach(item => {
    const product = db.prepare('SELECT stock, name FROM products WHERE id = ?').get(item.id);
    if (product && product.stock < item.qty) {
      issues.push({ id: item.id, name: product.name, available: product.stock });
    }
  });

  res.json({ valid: issues.length === 0, issues });
});

router.post('/stock-check', (req, res) => {
  const db = getDb();
  const { items } = req.body;
  if (!items) return res.json({ valid: true });
  const issues = [];
  items.forEach(item => {
    const product = db.prepare('SELECT stock, name FROM products WHERE id = ?').get(item.id);
    if (product && product.stock < item.qty) {
      issues.push({ id: item.id, name: product.name, available: product.stock, requested: item.qty });
    }
  });
  res.json({ valid: issues.length === 0, issues });
});

// ==================== WISHLIST ====================
router.get('/wishlist', (req, res) => {
  const db = getDb();
  const { session_id } = req.query;
  if (!session_id) return res.status(400).json({ error: 'session_id is required' });

  const items = db.prepare(`
    SELECT p.*, c.name as category_name FROM wishlists w 
    JOIN products p ON w.product_id = p.id LEFT JOIN categories c ON p.category_id = c.id
    WHERE w.session_id = ? ORDER BY w.created_at DESC
  `).all(session_id).map(p => ({
    ...p, images: JSON.parse(p.images || '[]'), sizes: JSON.parse(p.sizes || '[]'), colors: JSON.parse(p.colors || '[]')
  }));

  res.json({ items });
});

router.post('/wishlist', (req, res) => {
  const db = getDb();
  const { session_id, product_id } = req.body;
  if (!session_id || !product_id) return res.status(400).json({ error: 'Missing fields' });
  try {
    db.prepare('INSERT INTO wishlists (session_id, product_id) VALUES (?, ?)').run(session_id, product_id);
    res.json({ message: 'Added to wishlist' });
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      db.prepare('DELETE FROM wishlists WHERE session_id = ? AND product_id = ?').run(session_id, product_id);
      return res.json({ message: 'Removed from wishlist', removed: true });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

router.delete('/wishlist/:product_id', (req, res) => {
  const db = getDb();
  const { session_id } = req.query;
  if (!session_id) return res.status(400).json({ error: 'session_id is required' });

  const result = db.prepare('DELETE FROM wishlists WHERE session_id = ? AND product_id = ?').run(session_id, req.params.product_id);

  if (result.changes === 0) return res.status(404).json({ error: 'Wishlist item not found' });
  res.json({ message: 'Removed from wishlist' });
});

router.get('/wishlist/:sessionId', (req, res) => {
  const db = getDb();
  const items = db.prepare(`
    SELECT p.*, c.name as category_name FROM wishlists w 
    JOIN products p ON w.product_id = p.id LEFT JOIN categories c ON p.category_id = c.id
    WHERE w.session_id = ? ORDER BY w.created_at DESC
  `).all(req.params.sessionId).map(p => ({
    ...p, images: JSON.parse(p.images || '[]'), sizes: JSON.parse(p.sizes || '[]'), colors: JSON.parse(p.colors || '[]')
  }));
  res.json({ items });
});

router.get('/wishlist/:sessionId/ids', (req, res) => {
  const db = getDb();
  const ids = db.prepare('SELECT product_id FROM wishlists WHERE session_id = ?').all(req.params.sessionId).map(r => r.product_id);
  res.json({ ids });
});

// ==================== NEWSLETTER ====================
router.post('/newsletter', (req, res) => {
  const db = getDb();
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });
  try {
    db.prepare('INSERT INTO newsletter_subscribers (email) VALUES (?)').run(email);
    res.json({ message: 'Subscribed successfully!' });
  } catch (err) {
    if (err.message.includes('UNIQUE')) return res.json({ message: 'Already subscribed!' });
    res.status(500).json({ error: 'Server error' });
  }
});

// ==================== SEARCH ====================
router.get('/search', (req, res) => {
  const db = getDb();
  const { q } = req.query;
  if (!q) return res.json({ products: [] });
  const products = db.prepare(`
    SELECT p.*, c.name as category_name FROM products p LEFT JOIN categories c ON p.category_id = c.id 
    WHERE p.name LIKE ? OR p.description LIKE ? OR c.name LIKE ? LIMIT 20
  `).all(`%${q}%`, `%${q}%`, `%${q}%`).map(p => ({
    ...p, images: JSON.parse(p.images || '[]'), sizes: JSON.parse(p.sizes || '[]'), colors: JSON.parse(p.colors || '[]')
  }));
  res.json({ products });
});

// ==================== CUSTOMER AUTH ====================
router.post('/customers/register', (req, res) => {
  const db = getDb();
  const { full_name, email, phone, password } = req.body;
  if (!full_name || !email || !password) return res.status(400).json({ error: 'Missing required fields' });

  const hashed = bcrypt.hashSync(password, 10);
  try {
    const result = db.prepare('INSERT INTO customers (full_name, email, phone, password) VALUES (?, ?, ?, ?)')
      .run(full_name, email, phone || '', hashed);
    const token = jwt.sign({ id: result.lastInsertRowid, email }, JWT_SECRET, { expiresIn: '30d' });
    res.status(201).json({ token, customer: { id: result.lastInsertRowid, full_name, email, phone } });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(400).json({ error: 'Email already registered' });
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/customers/login', (req, res) => {
  const db = getDb();
  const { email, password } = req.body;
  const customer = db.prepare('SELECT * FROM customers WHERE email = ?').get(email);
  if (!customer || !bcrypt.compareSync(password, customer.password)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  const token = jwt.sign({ id: customer.id, email }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, customer: { id: customer.id, full_name: customer.full_name, email: customer.email, phone: customer.phone, address: customer.address, city: customer.city, state: customer.state } });
});

router.get('/customers/profile', authenticateCustomer, (req, res) => {
  const db = getDb();
  const customer = db.prepare('SELECT id, full_name, email, phone, address, city, state, created_at FROM customers WHERE id = ?').get(req.customer.id);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });
  res.json({ customer });
});

router.get('/customers/orders', authenticateCustomer, (req, res) => {
  const db = getDb();
  const customer = db.prepare('SELECT phone FROM customers WHERE id = ?').get(req.customer.id);
  if (!customer) return res.status(404).json({ error: 'Customer not found' });

  const orders = db.prepare('SELECT * FROM orders WHERE customer_phone = ? ORDER BY created_at DESC').all(customer.phone).map(o => ({
    ...o, items: JSON.parse(o.items || '[]')
  }));

  res.json({ orders });
});

router.post('/customer/register', (req, res) => {
  const db = getDb();
  const { full_name, email, phone, password } = req.body;
  if (!full_name || !email || !password) return res.status(400).json({ error: 'Missing required fields' });

  const hashed = bcrypt.hashSync(password, 10);
  try {
    const result = db.prepare('INSERT INTO customers (full_name, email, phone, password) VALUES (?, ?, ?, ?)')
      .run(full_name, email, phone || '', hashed);
    const token = jwt.sign({ id: result.lastInsertRowid, email }, CUSTOMER_SECRET, { expiresIn: '30d' });
    res.status(201).json({ token, customer: { id: result.lastInsertRowid, full_name, email, phone } });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(400).json({ error: 'Email already registered' });
    res.status(500).json({ error: 'Server error' });
  }
});

router.post('/customer/login', (req, res) => {
  const db = getDb();
  const { email, password } = req.body;
  const customer = db.prepare('SELECT * FROM customers WHERE email = ?').get(email);
  if (!customer || !bcrypt.compareSync(password, customer.password)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }
  const token = jwt.sign({ id: customer.id, email }, CUSTOMER_SECRET, { expiresIn: '30d' });
  res.json({ token, customer: { id: customer.id, full_name: customer.full_name, email: customer.email, phone: customer.phone, address: customer.address, city: customer.city, state: customer.state } });
});

module.exports = router;
