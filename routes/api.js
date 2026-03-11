const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { query } = require('../db/database');

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
      images: JSON.parse(p.images || '[]'),
      sizes: JSON.parse(p.sizes || '[]'),
      colors: JSON.parse(p.colors || '[]')
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

    product.images = JSON.parse(product.images || '[]');
    product.sizes = JSON.parse(product.sizes || '[]');
    product.colors = JSON.parse(product.colors || '[]');

    const { rows: relatedRows } = await query(
      'SELECT * FROM products WHERE category_id = $1 AND id != $2 LIMIT 4',
      [product.category_id, product.id]
    );
    const related = relatedRows.map(p => ({
      ...p, images: JSON.parse(p.images || '[]'), sizes: JSON.parse(p.sizes || '[]'), colors: JSON.parse(p.colors || '[]')
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

    const { customer_name, rating, title, comment } = req.body;
    if (!customer_name || !rating) return res.status(400).json({ error: 'Missing required fields' });

    await query(
      'INSERT INTO reviews (product_id, customer_name, rating, title, comment) VALUES ($1, $2, $3, $4, $5)',
      [product.id, customer_name, Math.min(5, Math.max(1, parseInt(rating))), title || '', comment || '']
    );

    res.status(201).json({ message: 'Review submitted!' });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ==================== CATEGORIES ====================
router.get('/categories', async (req, res) => {
  try {
    const { rows: categories } = await query(`
      SELECT c.*, COUNT(p.id) as product_count FROM categories c
      LEFT JOIN products p ON c.id = p.category_id GROUP BY c.id ORDER BY c.display_order ASC
    `);
    res.json({ categories });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

// ==================== ORDERS ====================
router.post('/orders', async (req, res) => {
  try {
    const { customer_name, customer_email, customer_phone, address, city, state, items, subtotal, shipping, total, payment_method, payment_ref, notes } = req.body;

    if (!customer_name || !customer_phone || !address || !items || !total) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    for (const item of items) {
      const { rows } = await query('SELECT stock, name FROM products WHERE id = $1', [item.id]);
      const product = rows[0];
      if (product && product.stock < item.qty) {
        return res.status(400).json({ error: `"${product.name}" only has ${product.stock} left in stock` });
      }
    }

    const orderNumber = 'UH-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).substring(2, 6).toUpperCase();

    const result = await query(
      `INSERT INTO orders (order_number, customer_name, customer_email, customer_phone, address, city, state, items, subtotal, shipping, total, payment_method, payment_ref, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING id`,
      [orderNumber, customer_name, customer_email || '', customer_phone, address, city || '', state || '', JSON.stringify(items), subtotal, shipping || 0, total, payment_method || 'pay_on_delivery', payment_ref || '', notes || '']
    );

    for (const item of items) {
      await query('UPDATE products SET stock = stock - $1 WHERE id = $2 AND stock >= $1', [item.qty, item.id]);
    }

    res.status(201).json({
      message: 'Order placed successfully!',
      order: { id: result.rows[0].id, order_number: orderNumber, total, status: 'pending' }
    });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/orders/track/:orderNumber', async (req, res) => {
  try {
    const { rows } = await query(
      'SELECT order_number, status, items, created_at, updated_at, customer_name, shipping, total FROM orders WHERE order_number = $1',
      [req.params.orderNumber]
    );
    const order = rows[0];
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
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

router.get('/orders/:orderNumber', async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM orders WHERE order_number = $1', [req.params.orderNumber]);
    const order = rows[0];
    if (!order) return res.status(404).json({ error: 'Order not found' });
    order.items = JSON.parse(order.items || '[]');
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
      ...p, images: JSON.parse(p.images || '[]'), sizes: JSON.parse(p.sizes || '[]'), colors: JSON.parse(p.colors || '[]')
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
      ...p, images: JSON.parse(p.images || '[]'), sizes: JSON.parse(p.sizes || '[]'), colors: JSON.parse(p.colors || '[]')
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
      ...p, images: JSON.parse(p.images || '[]'), sizes: JSON.parse(p.sizes || '[]'), colors: JSON.parse(p.colors || '[]')
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
      ...o, items: JSON.parse(o.items || '[]')
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
