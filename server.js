const express = require('express');
const cors = require('cors');
const path = require('path');
const { initDatabase, query } = require('./db/database');
const { seedDatabase } = require('./db/seed');
const apiRoutes = require('./routes/api');
const adminRoutes = require('./routes/admin');
const staffRoutes = require('./routes/staff');
const { getUploadsDir, ensureUploadsDir } = require('./lib/uploadsDir');

const app = express();
const PORT = process.env.PORT || 3000;

process.on('unhandledRejection', (reason, p) => {
  console.error('  ✗ Unhandled Rejection at:', p, 'reason:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('  ✗ Uncaught Exception:', err && err.stack ? err.stack : err);
});
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

// Register before static + /api router so production always exposes config (avoids 404 if router order/cache differs)
app.get('/api/store-config', (req, res) => {
  try {
    const siteUrl = (process.env.PUBLIC_SITE_URL || '').replace(/\/$/, '');
    res.json({
      requireStaffCheckout: process.env.REQUIRE_STAFF_CHECKOUT === 'true',
      customerSubmitStaffConfirms: process.env.REQUIRE_STAFF_CHECKOUT === 'true',
      staffGateFullSite: process.env.STAFF_GATE_FULL_SITE === 'true',
      paystackConfigured: !!(
        process.env.PAYSTACK_PUBLIC_KEY &&
        String(process.env.PAYSTACK_PUBLIC_KEY).startsWith('pk_')
      ),
      paystackPublicKey: process.env.PAYSTACK_PUBLIC_KEY || '',
      siteUrl: siteUrl || null,
    });
  } catch (e) {
    res.status(500).json({ error: 'Server error' });
  }
});

ensureUploadsDir();
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(getUploadsDir()));

// Mount admin API before /api so POST /api/admin/login is never swallowed by the public API router
app.use('/api/admin', adminRoutes);
// Staff PIN login + portal (must be before generic /api so /api/staff/login matches here)
app.use('/api/staff', staffRoutes);
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
