const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');

router.get('/products', (req, res) => {
  const db = getDb();
  const { category, search, sort, min_price, max_price, featured, new_arrival, best_seller, limit, offset } = req.query;

  let query = `SELECT p.*, c.name as category_name, c.slug as category_slug 
               FROM products p LEFT JOIN categories c ON p.category_id = c.id WHERE 1=1`;
  const params = [];

  if (category) {
    query += ` AND c.slug = ?`;
    params.push(category);
  }
  if (search) {
    query += ` AND (p.name LIKE ? OR p.description LIKE ?)`;
    params.push(`%${search}%`, `%${search}%`);
  }
  if (min_price) {
    query += ` AND p.price >= ?`;
    params.push(parseFloat(min_price));
  }
  if (max_price) {
    query += ` AND p.price <= ?`;
    params.push(parseFloat(max_price));
  }
  if (featured === '1') query += ` AND p.featured = 1`;
  if (new_arrival === '1') query += ` AND p.new_arrival = 1`;
  if (best_seller === '1') query += ` AND p.best_seller = 1`;

  switch (sort) {
    case 'price_asc': query += ` ORDER BY p.price ASC`; break;
    case 'price_desc': query += ` ORDER BY p.price DESC`; break;
    case 'name_asc': query += ` ORDER BY p.name ASC`; break;
    case 'newest': query += ` ORDER BY p.created_at DESC`; break;
    default: query += ` ORDER BY p.featured DESC, p.created_at DESC`;
  }

  const countQuery = query.replace(/SELECT[\s\S]*?FROM/, 'SELECT COUNT(*) as total FROM').replace(/ORDER BY[\s\S]*$/, '');
  const total = db.prepare(countQuery).get(...params)?.total || 0;

  if (limit) {
    query += ` LIMIT ?`;
    params.push(parseInt(limit));
  }
  if (offset) {
    query += ` OFFSET ?`;
    params.push(parseInt(offset));
  }

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
    FROM products p LEFT JOIN categories c ON p.category_id = c.id 
    WHERE p.slug = ?
  `).get(req.params.slug);

  if (!product) return res.status(404).json({ error: 'Product not found' });

  product.images = JSON.parse(product.images || '[]');
  product.sizes = JSON.parse(product.sizes || '[]');
  product.colors = JSON.parse(product.colors || '[]');

  const related = db.prepare(`
    SELECT * FROM products WHERE category_id = ? AND id != ? LIMIT 4
  `).all(product.category_id, product.id).map(p => ({
    ...p,
    images: JSON.parse(p.images || '[]'),
    sizes: JSON.parse(p.sizes || '[]'),
    colors: JSON.parse(p.colors || '[]')
  }));

  res.json({ product, related });
});

router.get('/categories', (req, res) => {
  const db = getDb();
  const categories = db.prepare(`
    SELECT c.*, COUNT(p.id) as product_count 
    FROM categories c LEFT JOIN products p ON c.id = p.category_id 
    GROUP BY c.id ORDER BY c.display_order ASC
  `).all();
  res.json({ categories });
});

router.post('/orders', (req, res) => {
  const db = getDb();
  const { customer_name, customer_email, customer_phone, address, city, state, items, subtotal, shipping, total, payment_method, notes } = req.body;

  if (!customer_name || !customer_phone || !address || !items || !total) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const orderNumber = 'UH-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();

  const stmt = db.prepare(`
    INSERT INTO orders (order_number, customer_name, customer_email, customer_phone, address, city, state, items, subtotal, shipping, total, payment_method, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const result = stmt.run(orderNumber, customer_name, customer_email || '', customer_phone, address, city || '', state || '', JSON.stringify(items), subtotal, shipping || 0, total, payment_method || 'pay_on_delivery', notes || '');

  res.status(201).json({
    message: 'Order placed successfully!',
    order: { id: result.lastInsertRowid, order_number: orderNumber, total, status: 'pending' }
  });
});

router.get('/orders/:orderNumber', (req, res) => {
  const db = getDb();
  const order = db.prepare('SELECT * FROM orders WHERE order_number = ?').get(req.params.orderNumber);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  order.items = JSON.parse(order.items || '[]');
  res.json({ order });
});

router.post('/newsletter', (req, res) => {
  const db = getDb();
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  try {
    db.prepare('INSERT INTO newsletter_subscribers (email) VALUES (?)').run(email);
    res.json({ message: 'Subscribed successfully!' });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.json({ message: 'Already subscribed!' });
    }
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/search', (req, res) => {
  const db = getDb();
  const { q } = req.query;
  if (!q) return res.json({ products: [] });

  const products = db.prepare(`
    SELECT p.*, c.name as category_name FROM products p 
    LEFT JOIN categories c ON p.category_id = c.id 
    WHERE p.name LIKE ? OR p.description LIKE ? OR c.name LIKE ?
    LIMIT 20
  `).all(`%${q}%`, `%${q}%`, `%${q}%`).map(p => ({
    ...p,
    images: JSON.parse(p.images || '[]'),
    sizes: JSON.parse(p.sizes || '[]'),
    colors: JSON.parse(p.colors || '[]')
  }));

  res.json({ products });
});

module.exports = router;
