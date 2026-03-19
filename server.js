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

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Mount admin API before /api so POST /api/admin/login is never swallowed by the public API router
app.use('/api/admin', adminRoutes);
app.use('/api', apiRoutes);

// Admin SPA (Express path '/admin/*' is not a glob — use a regex)
app.get(/^\/admin(\/.*)?$/, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

app.get('*', (req, res) => {
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

    app.listen(PORT, () => {
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
