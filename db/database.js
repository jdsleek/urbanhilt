const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('  ✗ DATABASE_URL environment variable is not set!');
  process.exit(1);
}

const dbUrl = process.env.DATABASE_URL;
const needsSsl = !dbUrl.includes('localhost') && !dbUrl.includes('railway.internal');

const poolConfig = { connectionString: dbUrl };
if (needsSsl) {
  poolConfig.ssl = { rejectUnauthorized: false };
}

const pool = new Pool(poolConfig);

// Prevent process crash when DB drops idle connections (Railway / pooler restarts)
pool.on('error', (err) => {
  console.error('  ✗ PostgreSQL pool error (idle client):', err.message || err);
});

async function query(text, params) {
  return pool.query(text, params);
}

async function initDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS categories (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      description TEXT,
      image TEXT,
      display_order INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      description TEXT,
      price NUMERIC NOT NULL,
      sale_price NUMERIC,
      category_id INTEGER REFERENCES categories(id),
      sizes TEXT DEFAULT '[]',
      colors TEXT DEFAULT '[]',
      images TEXT DEFAULT '[]',
      featured INTEGER DEFAULT 0,
      new_arrival INTEGER DEFAULT 0,
      best_seller INTEGER DEFAULT 0,
      stock INTEGER DEFAULT 0,
      sku TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      order_number TEXT UNIQUE NOT NULL,
      customer_name TEXT NOT NULL,
      customer_email TEXT,
      customer_phone TEXT NOT NULL,
      address TEXT NOT NULL,
      city TEXT,
      state TEXT,
      country TEXT DEFAULT 'Nigeria',
      items TEXT NOT NULL,
      subtotal NUMERIC NOT NULL,
      shipping NUMERIC DEFAULT 0,
      total NUMERIC NOT NULL,
      status TEXT DEFAULT 'pending',
      payment_method TEXT DEFAULT 'pay_on_delivery',
      payment_ref TEXT,
      notes TEXT,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS admin_users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      full_name TEXT,
      role TEXT DEFAULT 'admin',
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS customers (
      id SERIAL PRIMARY KEY,
      full_name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      phone TEXT,
      password TEXT NOT NULL,
      address TEXT,
      city TEXT,
      state TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS wishlists (
      id SERIAL PRIMARY KEY,
      session_id TEXT NOT NULL,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(session_id, product_id)
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      customer_name TEXT NOT NULL,
      rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
      title TEXT,
      comment TEXT,
      verified INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS site_settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS newsletter_subscribers (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      subscribed_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS sales_staff (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      pin_hash TEXT NOT NULL,
      active INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS staff_access_logs (
      id SERIAL PRIMARY KEY,
      staff_id INTEGER REFERENCES sales_staff(id) ON DELETE SET NULL,
      event_type TEXT NOT NULL,
      detail TEXT,
      ip TEXT,
      user_agent TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS discount_codes (
      id SERIAL PRIMARY KEY,
      code TEXT UNIQUE NOT NULL,
      description TEXT,
      discount_type TEXT NOT NULL DEFAULT 'percent',
      value NUMERIC NOT NULL,
      min_subtotal NUMERIC DEFAULT 0,
      max_uses INTEGER,
      uses_count INTEGER DEFAULT 0,
      valid_from TIMESTAMP,
      valid_until TIMESTAMP,
      active INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `).catch((e) => console.error('  ✗ DB init (core tables):', e.message || e));

  await pool
    .query(`
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS staff_id INTEGER REFERENCES sales_staff(id) ON DELETE SET NULL;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_code TEXT;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_amount NUMERIC DEFAULT 0;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_verified_at TIMESTAMP;
    ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_verified_by_staff_id INTEGER REFERENCES sales_staff(id) ON DELETE SET NULL;
  `)
    .catch((e) => console.error('  ✗ Orders column migration:', e.message || e));

  await pool
    .query(`
    ALTER TABLE sales_staff ADD COLUMN IF NOT EXISTS job_title TEXT;
    ALTER TABLE sales_staff ADD COLUMN IF NOT EXISTS phone TEXT;
    ALTER TABLE sales_staff ADD COLUMN IF NOT EXISTS email TEXT;
    ALTER TABLE sales_staff ADD COLUMN IF NOT EXISTS photo_url TEXT;
    ALTER TABLE sales_staff ADD COLUMN IF NOT EXISTS staff_code TEXT;
  `)
    .catch((e) => console.error('  ✗ sales_staff column migration:', e.message || e));

  console.log('  ✓ Database initialized successfully');
}

module.exports = { query, initDatabase, pool };
