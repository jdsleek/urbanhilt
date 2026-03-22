const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDatabase, query } = require('./db/database');
const { seedDatabase } = require('./db/seed');
const apiRoutes = require('./routes/api');
const adminRoutes = require('./routes/admin');

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PRODUCTION =
  process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT === 'production';

// Railway / reverse proxy: correct protocol for redirects and security headers
app.set('trust proxy', 1);

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Force HTTPS in production (fixes "Not secure" when users open http:// links)
app.use((req, res, next) => {
  if (!IS_PRODUCTION) return next();
  const forwardedProto = req.get('x-forwarded-proto');
  if (forwardedProto && forwardedProto !== 'https') {
    const host = req.get('host') || 'www.urbanhilt.com';
    return res.redirect(301, `https://${host}${req.originalUrl || req.url}`);
  }
  next();
});

app.use((req, res, next) => {
  if (IS_PRODUCTION && req.get('x-forwarded-proto') === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Mount admin API before /api so POST /api/admin/login is never swallowed by the public API router
app.use('/api/admin', adminRoutes);
app.use('/api', apiRoutes);

// Admin SPA (Express path '/admin/*' is not a glob — use a regex)
app.get(/^\/admin(\/.*)?$/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

app.get('*', (req, res, next) => {
  // Never treat /api/* as static or SPA — avoids returning HTML for unknown API paths
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'Not found' });
  }
  const requestedFile = path.join(__dirname, 'public', req.path);
  res.sendFile(requestedFile, (err) => {
    if (err) {
      res.sendFile(path.join(__dirname, 'public', 'index.html'));
    }
  });
});

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

(async () => {
  try {
    await initDatabase();

    const { rows } = await query('SELECT COUNT(*) as count FROM products');
    if (parseInt(rows[0].count) === 0) {
      console.log('  → Empty database detected, auto-seeding...');
      await seedDatabase();
    }

    // 0.0.0.0 required on Railway/Docker so the platform proxy can reach the process
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`\n  ╔══════════════════════════════════════════╗`);
      console.log(`  ║     URBAN HILT - Luxury Redefined        ║`);
      console.log(`  ║     Server running on port ${PORT}            ║`);
      console.log(`  ╚══════════════════════════════════════════╝\n`);
    });
  } catch (err) {
    console.error('  ✗ Failed to start:', err.message || err);
    console.error(err.stack || err);
    process.exit(1);
  }
})();
