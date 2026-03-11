const { getDb, initDatabase } = require('./database');
const bcrypt = require('bcryptjs');

function seed() {
  initDatabase();
  const db = getDb();

  // Create admin user (username: admin, password: urbanhilt2024)
  const hashedPassword = bcrypt.hashSync('urbanhilt2024', 10);
  try {
    db.prepare('INSERT INTO admin_users (username, password, full_name, role) VALUES (?, ?, ?, ?)')
      .run('admin', hashedPassword, 'Urban Hilt Admin', 'admin');
    console.log('  ✓ Admin user created (username: admin, password: urbanhilt2024)');
  } catch (e) {
    if (e.message.includes('UNIQUE')) {
      console.log('  ✓ Admin user already exists');
    }
  }

  // Categories
  const categories = [
    { name: 'Men\'s Clothing', slug: 'mens-clothing', description: 'Premium menswear collection', display_order: 1 },
    { name: 'Women\'s Clothing', slug: 'womens-clothing', description: 'Elegant womenswear collection', display_order: 2 },
    { name: 'Shoes', slug: 'shoes', description: 'Premium footwear for all occasions', display_order: 3 },
    { name: 'Accessories', slug: 'accessories', description: 'Complete your look with premium accessories', display_order: 4 },
    { name: 'Unisex', slug: 'unisex', description: 'Fashion without boundaries', display_order: 5 },
  ];

  const catStmt = db.prepare('INSERT OR IGNORE INTO categories (name, slug, description, display_order) VALUES (?, ?, ?, ?)');
  categories.forEach(c => catStmt.run(c.name, c.slug, c.description, c.display_order));
  console.log('  ✓ Categories seeded');

  const catRows = db.prepare('SELECT id, slug FROM categories').all();
  const catMap = {};
  catRows.forEach(c => catMap[c.slug] = c.id);

  // Products
  const products = [
    {
      name: 'Urban Classic Polo Shirt',
      slug: 'urban-classic-polo-shirt',
      description: 'A timeless polo shirt crafted from premium cotton. Perfect for both casual and semi-formal occasions. Features our signature Urban Hilt embroidery on the chest.',
      price: 25000, sale_price: null,
      category_id: catMap['mens-clothing'],
      sizes: '["S","M","L","XL","XXL"]', colors: '["White","Black","Navy","Burgundy"]',
      images: '[]', featured: 1, new_arrival: 0, best_seller: 1, stock: 50, sku: 'UH-MP-001'
    },
    {
      name: 'Luxury Slim Fit Chinos',
      slug: 'luxury-slim-fit-chinos',
      description: 'Elevate your wardrobe with these premium slim-fit chinos. Made from stretch cotton for ultimate comfort and a sharp silhouette.',
      price: 32000, sale_price: 28000,
      category_id: catMap['mens-clothing'],
      sizes: '["30","32","34","36","38"]', colors: '["Khaki","Black","Navy","Olive"]',
      images: '[]', featured: 1, new_arrival: 1, best_seller: 0, stock: 35, sku: 'UH-MC-002'
    },
    {
      name: 'Designer Denim Jacket',
      slug: 'designer-denim-jacket',
      description: 'A bold statement piece. This premium denim jacket features distressed detailing and a relaxed fit that pairs perfectly with any outfit.',
      price: 45000, sale_price: null,
      category_id: catMap['mens-clothing'],
      sizes: '["S","M","L","XL"]', colors: '["Blue","Black","Light Wash"]',
      images: '[]', featured: 1, new_arrival: 0, best_seller: 1, stock: 20, sku: 'UH-MJ-003'
    },
    {
      name: 'Premium Round Neck T-Shirt',
      slug: 'premium-round-neck-tshirt',
      description: 'Ultra-soft 100% combed cotton t-shirt. The perfect everyday essential with a modern fit and premium finish.',
      price: 15000, sale_price: 12000,
      category_id: catMap['mens-clothing'],
      sizes: '["S","M","L","XL","XXL"]', colors: '["White","Black","Grey","Navy","Olive"]',
      images: '[]', featured: 0, new_arrival: 1, best_seller: 1, stock: 100, sku: 'UH-MT-004'
    },
    {
      name: 'Elegant Midi Dress',
      slug: 'elegant-midi-dress',
      description: 'Turn heads in this stunning midi dress. Features a flattering A-line silhouette, delicate fabric, and sophisticated detailing perfect for any special occasion.',
      price: 38000, sale_price: null,
      category_id: catMap['womens-clothing'],
      sizes: '["S","M","L","XL"]', colors: '["Black","Wine Red","Emerald","Royal Blue"]',
      images: '[]', featured: 1, new_arrival: 1, best_seller: 1, stock: 30, sku: 'UH-WD-005'
    },
    {
      name: 'Satin Blouse',
      slug: 'satin-blouse',
      description: 'Luxurious satin blouse with a relaxed fit and elegant drape. Perfect for office wear or a sophisticated evening look.',
      price: 22000, sale_price: 18000,
      category_id: catMap['womens-clothing'],
      sizes: '["S","M","L","XL"]', colors: '["Champagne","White","Black","Blush Pink"]',
      images: '[]', featured: 1, new_arrival: 0, best_seller: 0, stock: 40, sku: 'UH-WB-006'
    },
    {
      name: 'High-Waist Palazzo Pants',
      slug: 'high-waist-palazzo-pants',
      description: 'Flowing and elegant, these palazzo pants offer both style and comfort. The high-waist design creates a flattering silhouette for any body type.',
      price: 28000, sale_price: null,
      category_id: catMap['womens-clothing'],
      sizes: '["S","M","L","XL"]', colors: '["Black","White","Camel","Navy"]',
      images: '[]', featured: 0, new_arrival: 1, best_seller: 0, stock: 45, sku: 'UH-WP-007'
    },
    {
      name: 'Premium Leather Sneakers',
      slug: 'premium-leather-sneakers',
      description: 'Handcrafted leather sneakers that blend luxury with street style. Features premium leather upper, cushioned insole, and durable rubber outsole.',
      price: 55000, sale_price: 48000,
      category_id: catMap['shoes'],
      sizes: '["39","40","41","42","43","44","45"]', colors: '["White","Black","White/Gold"]',
      images: '[]', featured: 1, new_arrival: 1, best_seller: 1, stock: 25, sku: 'UH-SH-008'
    },
    {
      name: 'Classic Oxford Shoes',
      slug: 'classic-oxford-shoes',
      description: 'Timeless Oxford shoes crafted from genuine leather. Perfect for formal occasions, business meetings, or elevating any smart-casual outfit.',
      price: 65000, sale_price: null,
      category_id: catMap['shoes'],
      sizes: '["39","40","41","42","43","44","45"]', colors: '["Black","Brown","Tan"]',
      images: '[]', featured: 1, new_arrival: 0, best_seller: 1, stock: 15, sku: 'UH-SH-009'
    },
    {
      name: 'Women\'s Block Heel Sandals',
      slug: 'womens-block-heel-sandals',
      description: 'Chic and comfortable block heel sandals. The perfect balance of style and wearability for any occasion, from brunch to evening events.',
      price: 35000, sale_price: 30000,
      category_id: catMap['shoes'],
      sizes: '["36","37","38","39","40","41"]', colors: '["Nude","Black","Gold","Red"]',
      images: '[]', featured: 0, new_arrival: 1, best_seller: 0, stock: 30, sku: 'UH-SH-010'
    },
    {
      name: 'Designer Canvas Slides',
      slug: 'designer-canvas-slides',
      description: 'Premium canvas slides for the modern urbanite. Lightweight, comfortable, and effortlessly stylish for everyday wear.',
      price: 18000, sale_price: null,
      category_id: catMap['shoes'],
      sizes: '["39","40","41","42","43","44"]', colors: '["Black","Beige","Navy"]',
      images: '[]', featured: 0, new_arrival: 0, best_seller: 0, stock: 60, sku: 'UH-SH-011'
    },
    {
      name: 'Luxury Leather Belt',
      slug: 'luxury-leather-belt',
      description: 'Premium Italian leather belt with a signature gold-tone buckle. The perfect finishing touch for any outfit.',
      price: 18000, sale_price: 15000,
      category_id: catMap['accessories'],
      sizes: '["S","M","L","XL"]', colors: '["Black","Brown","Tan"]',
      images: '[]', featured: 1, new_arrival: 0, best_seller: 1, stock: 50, sku: 'UH-AC-012'
    },
    {
      name: 'Designer Sunglasses',
      slug: 'designer-sunglasses',
      description: 'UV-protected designer sunglasses with a modern frame design. Comes in a premium branded case.',
      price: 22000, sale_price: null,
      category_id: catMap['accessories'],
      sizes: '["One Size"]', colors: '["Black","Tortoise","Gold"]',
      images: '[]', featured: 0, new_arrival: 1, best_seller: 0, stock: 40, sku: 'UH-AC-013'
    },
    {
      name: 'Premium Crossbody Bag',
      slug: 'premium-crossbody-bag',
      description: 'Sleek and functional crossbody bag made from premium vegan leather. Perfect for carrying your essentials in style.',
      price: 28000, sale_price: null,
      category_id: catMap['accessories'],
      sizes: '["One Size"]', colors: '["Black","Brown","Cream"]',
      images: '[]', featured: 1, new_arrival: 1, best_seller: 0, stock: 25, sku: 'UH-AC-014'
    },
    {
      name: 'Urban Hilt Signature Cap',
      slug: 'urban-hilt-signature-cap',
      description: 'Our signature cap featuring embroidered Urban Hilt branding. Adjustable strap for a perfect fit.',
      price: 12000, sale_price: null,
      category_id: catMap['unisex'],
      sizes: '["One Size"]', colors: '["Black","White","Navy","Beige"]',
      images: '[]', featured: 0, new_arrival: 0, best_seller: 1, stock: 80, sku: 'UH-UN-015'
    },
    {
      name: 'Premium Hoodie',
      slug: 'premium-hoodie',
      description: 'Heavyweight premium hoodie with brushed fleece interior. Features a minimalist design with subtle Urban Hilt branding.',
      price: 35000, sale_price: 30000,
      category_id: catMap['unisex'],
      sizes: '["S","M","L","XL","XXL"]', colors: '["Black","Grey","Cream","Forest Green"]',
      images: '[]', featured: 1, new_arrival: 1, best_seller: 1, stock: 40, sku: 'UH-UN-016'
    },
    {
      name: 'Luxury Jogger Pants',
      slug: 'luxury-jogger-pants',
      description: 'Elevated jogger pants that blur the line between comfort and style. Features tapered fit, premium cotton blend, and zippered pockets.',
      price: 28000, sale_price: null,
      category_id: catMap['unisex'],
      sizes: '["S","M","L","XL","XXL"]', colors: '["Black","Grey","Navy","Olive"]',
      images: '[]', featured: 0, new_arrival: 0, best_seller: 0, stock: 55, sku: 'UH-UN-017'
    },
    {
      name: 'Oversized Graphic Tee',
      slug: 'oversized-graphic-tee',
      description: 'Bold oversized tee with exclusive Urban Hilt graphic print. Made from 100% organic cotton for a premium feel.',
      price: 20000, sale_price: 16000,
      category_id: catMap['unisex'],
      sizes: '["S","M","L","XL","XXL"]', colors: '["Black","White","Sand"]',
      images: '[]', featured: 0, new_arrival: 1, best_seller: 0, stock: 70, sku: 'UH-UN-018'
    },
    {
      name: 'Structured Blazer',
      slug: 'structured-blazer',
      description: 'A sharp, structured blazer that transitions seamlessly from boardroom to dinner. Tailored fit with premium fabric and attention to detail.',
      price: 55000, sale_price: null,
      category_id: catMap['mens-clothing'],
      sizes: '["S","M","L","XL"]', colors: '["Black","Navy","Charcoal"]',
      images: '[]', featured: 1, new_arrival: 0, best_seller: 0, stock: 20, sku: 'UH-MB-019'
    },
    {
      name: 'Silk Wrap Dress',
      slug: 'silk-wrap-dress',
      description: 'Effortlessly elegant silk wrap dress that flatters every figure. The perfect blend of luxury and versatility for any occasion.',
      price: 48000, sale_price: 42000,
      category_id: catMap['womens-clothing'],
      sizes: '["S","M","L","XL"]', colors: '["Black","Burgundy","Forest Green","Champagne"]',
      images: '[]', featured: 1, new_arrival: 1, best_seller: 1, stock: 20, sku: 'UH-WD-020'
    },
  ];

  const prodStmt = db.prepare(`
    INSERT OR IGNORE INTO products (name, slug, description, price, sale_price, category_id, sizes, colors, images, featured, new_arrival, best_seller, stock, sku)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  products.forEach(p => {
    prodStmt.run(p.name, p.slug, p.description, p.price, p.sale_price, p.category_id, p.sizes, p.colors, p.images, p.featured, p.new_arrival, p.best_seller, p.stock, p.sku);
  });

  console.log(`  ✓ ${products.length} products seeded`);
  console.log('\n  🎉 Database seeded successfully!\n');
  console.log('  Admin Login:');
  console.log('  Username: admin');
  console.log('  Password: urbanhilt2024\n');
}

seed();
