const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { initDatabase, getDb } = require('./db/database');
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

app.use('/api', apiRoutes);
app.use('/api/admin', adminRoutes);

app.get('/admin/*', (req, res) => {
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

initDatabase();

const db = getDb();
const productCount = db.prepare('SELECT COUNT(*) as count FROM products').get().count;
if (productCount === 0) {
  console.log('  → Empty database detected, auto-seeding...');
  seedDatabase();
}

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

app.listen(PORT, () => {
  console.log(`\n  ╔══════════════════════════════════════════╗`);
  console.log(`  ║     URBAN HILT - Luxury Redefined        ║`);
  console.log(`  ║     Server running on port ${PORT}            ║`);
  console.log(`  ╚══════════════════════════════════════════╝\n`);
});
