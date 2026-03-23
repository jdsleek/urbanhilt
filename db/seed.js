const { query, initDatabase } = require('./database');
const bcrypt = require('bcryptjs');

async function seedDatabase() {
  const hashedPassword = bcrypt.hashSync('urbanhilt2024', 10);
  try {
    await query(
      `INSERT INTO admin_users (username, password, full_name, role) VALUES ($1, $2, $3, $4) ON CONFLICT (username) DO NOTHING`,
      ['admin', hashedPassword, 'Urban Hilt Admin', 'admin']
    );
    console.log('  ✓ Admin user created (admin / urbanhilt2024)');
  } catch (e) {
    console.log('  ✓ Admin user already exists');
  }

  const categories = [
    { name: "Men's Clothing", slug: 'mens-clothing', description: 'Premium menswear collection', display_order: 1 },
    { name: "Women's Clothing", slug: 'womens-clothing', description: 'Elegant womenswear collection', display_order: 2 },
    { name: 'Shoes', slug: 'shoes', description: 'Premium footwear for all occasions', display_order: 3 },
    { name: 'Accessories', slug: 'accessories', description: 'Complete your look with premium accessories', display_order: 4 },
    { name: 'Unisex', slug: 'unisex', description: 'Fashion without boundaries', display_order: 5 },
  ];

  for (const c of categories) {
    await query(
      `INSERT INTO categories (name, slug, description, display_order) VALUES ($1, $2, $3, $4) ON CONFLICT (slug) DO NOTHING`,
      [c.name, c.slug, c.description, c.display_order]
    );
  }
  console.log('  ✓ Categories seeded');

  const { rows: catRows } = await query('SELECT id, slug FROM categories');
  const catMap = {};
  catRows.forEach(c => catMap[c.slug] = c.id);

  const img = (id, w = 600, h = 750) => `https://images.unsplash.com/photo-${id}?w=${w}&h=${h}&fit=crop&q=80`;

  const products = [
    { name: 'Urban Classic Polo Shirt', slug: 'urban-classic-polo-shirt', description: 'A timeless polo shirt crafted from premium cotton. Perfect for both casual and semi-formal occasions. Features our signature Urban Hilt embroidery on the chest.', price: 25000, sale_price: null, category_id: catMap['mens-clothing'], sizes: '["S","M","L","XL","XXL"]', colors: '["White","Black","Navy","Burgundy"]', images: JSON.stringify([img('1552374196-c4e7ffc6e126'), img('1618517351616-38fb9c5210c6')]), featured: 1, new_arrival: 0, best_seller: 1, stock: 50, sku: 'UH-MP-001' },
    { name: 'Luxury Slim Fit Chinos', slug: 'luxury-slim-fit-chinos', description: 'Elevate your wardrobe with these premium slim-fit chinos. Made from stretch cotton for ultimate comfort and a sharp silhouette.', price: 32000, sale_price: 28000, category_id: catMap['mens-clothing'], sizes: '["30","32","34","36","38"]', colors: '["Khaki","Black","Navy","Olive"]', images: JSON.stringify([img('1473966968600-fa801b869a1a'), img('1624378439575-d8705ad7ae80')]), featured: 1, new_arrival: 1, best_seller: 0, stock: 35, sku: 'UH-MC-002' },
    { name: 'Designer Denim Jacket', slug: 'designer-denim-jacket', description: 'A bold statement piece. This premium denim jacket features distressed detailing and a relaxed fit that pairs perfectly with any outfit.', price: 45000, sale_price: null, category_id: catMap['mens-clothing'], sizes: '["S","M","L","XL"]', colors: '["Blue","Black","Light Wash"]', images: JSON.stringify([img('1576871337632-b9aef4c17ab9'), img('1548126032-079a0fb0099d')]), featured: 1, new_arrival: 0, best_seller: 1, stock: 20, sku: 'UH-MJ-003' },
    { name: 'Premium Round Neck T-Shirt', slug: 'premium-round-neck-tshirt', description: 'Ultra-soft 100% combed cotton t-shirt. The perfect everyday essential with a modern fit and premium finish.', price: 15000, sale_price: 12000, category_id: catMap['mens-clothing'], sizes: '["S","M","L","XL","XXL"]', colors: '["White","Black","Grey","Navy","Olive"]', images: JSON.stringify([img('1521572163474-6864f9cf17ab'), img('1583743814966-8936f5b7be1a')]), featured: 0, new_arrival: 1, best_seller: 1, stock: 100, sku: 'UH-MT-004' },
    { name: 'Elegant Midi Dress', slug: 'elegant-midi-dress', description: 'Turn heads in this stunning midi dress. Features a flattering A-line silhouette, delicate fabric, and sophisticated detailing perfect for any special occasion.', price: 38000, sale_price: null, category_id: catMap['womens-clothing'], sizes: '["S","M","L","XL"]', colors: '["Black","Wine Red","Emerald","Royal Blue"]', images: JSON.stringify([img('1595777457583-95e059d581b8'), img('1572804013309-59a88b7e92f1')]), featured: 1, new_arrival: 1, best_seller: 1, stock: 30, sku: 'UH-WD-005' },
    { name: 'Satin Blouse', slug: 'satin-blouse', description: 'Luxurious satin blouse with a relaxed fit and elegant drape. Perfect for office wear or a sophisticated evening look.', price: 22000, sale_price: 18000, category_id: catMap['womens-clothing'], sizes: '["S","M","L","XL"]', colors: '["Champagne","White","Black","Blush Pink"]', images: JSON.stringify([img('1564257631407-4eb379f02301'), img('1485462537746-965f33f7f6a7')]), featured: 1, new_arrival: 0, best_seller: 0, stock: 40, sku: 'UH-WB-006' },
    { name: 'High-Waist Palazzo Pants', slug: 'high-waist-palazzo-pants', description: 'Flowing and elegant, these palazzo pants offer both style and comfort. The high-waist design creates a flattering silhouette for any body type.', price: 28000, sale_price: null, category_id: catMap['womens-clothing'], sizes: '["S","M","L","XL"]', colors: '["Black","White","Camel","Navy"]', images: JSON.stringify([img('1509631179647-0177331693ae'), img('1594938298603-c8148c4dae35')]), featured: 0, new_arrival: 1, best_seller: 0, stock: 45, sku: 'UH-WP-007' },
    { name: 'Premium Leather Sneakers', slug: 'premium-leather-sneakers', description: 'Handcrafted leather sneakers that blend luxury with street style. Features premium leather upper, cushioned insole, and durable rubber outsole.', price: 55000, sale_price: 48000, category_id: catMap['shoes'], sizes: '["39","40","41","42","43","44","45"]', colors: '["White","Black","White/Gold"]', images: JSON.stringify([img('1549298916-b41d501d3772'), img('1600269452121-4f2416e55c28')]), featured: 1, new_arrival: 1, best_seller: 1, stock: 25, sku: 'UH-SH-008' },
    { name: 'Classic Oxford Shoes', slug: 'classic-oxford-shoes', description: 'Timeless Oxford shoes crafted from genuine leather. Perfect for formal occasions, business meetings, or elevating any smart-casual outfit.', price: 65000, sale_price: null, category_id: catMap['shoes'], sizes: '["39","40","41","42","43","44","45"]', colors: '["Black","Brown","Tan"]', images: JSON.stringify([img('1614252369475-531eba835eb1'), img('1533867617858-e7b97e060509')]), featured: 1, new_arrival: 0, best_seller: 1, stock: 15, sku: 'UH-SH-009' },
    { name: "Women's Block Heel Sandals", slug: 'womens-block-heel-sandals', description: 'Chic and comfortable block heel sandals. The perfect balance of style and wearability for any occasion.', price: 35000, sale_price: 30000, category_id: catMap['shoes'], sizes: '["36","37","38","39","40","41"]', colors: '["Nude","Black","Gold","Red"]', images: JSON.stringify([img('1543163521-1bf539c55dd2'), img('1606107557195-0e29a4b5b4aa')]), featured: 0, new_arrival: 1, best_seller: 0, stock: 30, sku: 'UH-SH-010' },
    { name: 'Designer Canvas Slides', slug: 'designer-canvas-slides', description: 'Premium canvas slides for the modern urbanite. Lightweight, comfortable, and effortlessly stylish for everyday wear.', price: 18000, sale_price: null, category_id: catMap['shoes'], sizes: '["39","40","41","42","43","44"]', colors: '["Black","Beige","Navy"]', images: JSON.stringify([img('1603808033192-082d6919d3e1'), img('1575537302964-96cd47c06b1b')]), featured: 0, new_arrival: 0, best_seller: 0, stock: 60, sku: 'UH-SH-011' },
    { name: 'Luxury Leather Belt', slug: 'luxury-leather-belt', description: 'Premium Italian leather belt with a signature gold-tone buckle. The perfect finishing touch for any outfit.', price: 18000, sale_price: 15000, category_id: catMap['accessories'], sizes: '["S","M","L","XL"]', colors: '["Black","Brown","Tan"]', images: JSON.stringify([img('1624222247344-550fb60583dc'), img('1553062407-98eeb64c6a62')]), featured: 1, new_arrival: 0, best_seller: 1, stock: 50, sku: 'UH-AC-012' },
    { name: 'Designer Sunglasses', slug: 'designer-sunglasses', description: 'UV-protected designer sunglasses with a modern frame design. Comes in a premium branded case.', price: 22000, sale_price: null, category_id: catMap['accessories'], sizes: '["One Size"]', colors: '["Black","Tortoise","Gold"]', images: JSON.stringify([img('1572635196237-14b3f281503f'), img('1511499767150-a48a237f0083')]), featured: 0, new_arrival: 1, best_seller: 0, stock: 40, sku: 'UH-AC-013' },
    { name: 'Premium Crossbody Bag', slug: 'premium-crossbody-bag', description: 'Sleek and functional crossbody bag made from premium vegan leather. Perfect for carrying your essentials in style.', price: 28000, sale_price: null, category_id: catMap['accessories'], sizes: '["One Size"]', colors: '["Black","Brown","Cream"]', images: JSON.stringify([img('1548036328-c11e31e187ce'), img('1590874103328-eac38078fee0')]), featured: 1, new_arrival: 1, best_seller: 0, stock: 25, sku: 'UH-AC-014' },
    { name: 'Urban Hilt Signature Cap', slug: 'urban-hilt-signature-cap', description: 'Our signature cap featuring embroidered Urban Hilt branding. Adjustable strap for a perfect fit.', price: 12000, sale_price: null, category_id: catMap['unisex'], sizes: '["One Size"]', colors: '["Black","White","Navy","Beige"]', images: JSON.stringify([img('1588850561407-ed78c334e67a'), img('1556306535-0f09a537f0a3')]), featured: 0, new_arrival: 0, best_seller: 1, stock: 80, sku: 'UH-UN-015' },
    { name: 'Premium Hoodie', slug: 'premium-hoodie', description: 'Heavyweight premium hoodie with brushed fleece interior. Features a minimalist design with subtle Urban Hilt branding.', price: 35000, sale_price: 30000, category_id: catMap['unisex'], sizes: '["S","M","L","XL","XXL"]', colors: '["Black","Grey","Cream","Forest Green"]', images: JSON.stringify([img('1556821840-3a63f95609a7'), img('1578768079052-aa76e52ff62e')]), featured: 1, new_arrival: 1, best_seller: 1, stock: 40, sku: 'UH-UN-016' },
    { name: 'Luxury Jogger Pants', slug: 'luxury-jogger-pants', description: 'Elevated jogger pants that blur the line between comfort and style. Features tapered fit, premium cotton blend, and zippered pockets.', price: 28000, sale_price: null, category_id: catMap['unisex'], sizes: '["S","M","L","XL","XXL"]', colors: '["Black","Grey","Navy","Olive"]', images: JSON.stringify([img('1552902865-b72c031ac5ea'), img('1562157873-818bc0726f68')]), featured: 0, new_arrival: 0, best_seller: 0, stock: 55, sku: 'UH-UN-017' },
    { name: 'Oversized Graphic Tee', slug: 'oversized-graphic-tee', description: 'Bold oversized tee with exclusive Urban Hilt graphic print. Made from 100% organic cotton for a premium feel.', price: 20000, sale_price: 16000, category_id: catMap['unisex'], sizes: '["S","M","L","XL","XXL"]', colors: '["Black","White","Sand"]', images: JSON.stringify([img('1576566588028-4147f3842f27'), img('1503341504253-dff4f8e18d04')]), featured: 0, new_arrival: 1, best_seller: 0, stock: 70, sku: 'UH-UN-018' },
    { name: 'Structured Blazer', slug: 'structured-blazer', description: 'A sharp, structured blazer that transitions seamlessly from boardroom to dinner. Tailored fit with premium fabric and attention to detail.', price: 55000, sale_price: null, category_id: catMap['mens-clothing'], sizes: '["S","M","L","XL"]', colors: '["Black","Navy","Charcoal"]', images: JSON.stringify([img('1507679799987-c73779587ccf'), img('1594938298603-c8148c4dae35')]), featured: 1, new_arrival: 0, best_seller: 0, stock: 20, sku: 'UH-MB-019' },
    { name: 'Silk Wrap Dress', slug: 'silk-wrap-dress', description: 'Effortlessly elegant silk wrap dress that flatters every figure. The perfect blend of luxury and versatility for any occasion.', price: 48000, sale_price: 42000, category_id: catMap['womens-clothing'], sizes: '["S","M","L","XL"]', colors: '["Black","Burgundy","Forest Green","Champagne"]', images: JSON.stringify([img('1496747611176-843222e1e57c'), img('1515886657613-9f3515b0c78f')]), featured: 1, new_arrival: 1, best_seller: 1, stock: 20, sku: 'UH-WD-020' },
  ];

  for (const p of products) {
    await query(
      `INSERT INTO products (name, slug, description, price, sale_price, category_id, sizes, colors, images, featured, new_arrival, best_seller, stock, sku)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) ON CONFLICT (slug) DO NOTHING`,
      [p.name, p.slug, p.description, p.price, p.sale_price, p.category_id, p.sizes, p.colors, p.images, p.featured, p.new_arrival, p.best_seller, p.stock, p.sku]
    );
  }
  console.log(`  ✓ ${products.length} products seeded`);

  const { rows: productIds } = await query('SELECT id, slug FROM products');
  const pidMap = {};
  productIds.forEach(p => pidMap[p.slug] = p.id);

  const reviews = [
    [pidMap['urban-classic-polo-shirt'], 'Chidi O.', 5, 'Excellent quality!', 'The fabric is premium and the fit is perfect. I ordered 3 more in different colors.', 1],
    [pidMap['urban-classic-polo-shirt'], 'Amaka N.', 4, 'Great polo', 'Really nice material. Delivery was fast too. Would recommend.', 1],
    [pidMap['elegant-midi-dress'], 'Blessing E.', 5, 'Absolutely stunning', 'I wore this to a wedding and got so many compliments. The quality is top-notch!', 1],
    [pidMap['elegant-midi-dress'], 'Funke A.', 5, 'Perfect for occasions', 'Beautiful dress, fits perfectly. Urban Hilt never disappoints.', 1],
    [pidMap['elegant-midi-dress'], 'Grace M.', 4, 'Lovely dress', 'Beautiful color and great fabric. Slightly long for my height but still gorgeous.', 1],
    [pidMap['premium-leather-sneakers'], 'Tunde K.', 5, 'Best sneakers ever', 'So comfortable and stylish. The leather quality is amazing for this price.', 1],
    [pidMap['premium-leather-sneakers'], 'Emeka J.', 4, 'Very comfortable', 'Great sneakers. I wear them daily and they still look brand new.', 1],
    [pidMap['premium-hoodie'], 'David L.', 5, 'Premium feel', 'The hoodie is thick, warm, and the material feels expensive. Worth every naira.', 1],
    [pidMap['premium-hoodie'], 'Sarah O.', 5, 'Love it!', 'Got this for my boyfriend and he absolutely loves it. Getting one for myself too.', 1],
    [pidMap['silk-wrap-dress'], 'Aisha B.', 5, 'Gorgeous dress', 'The silk feels so luxurious. This is now my favorite going-out dress.', 1],
    [pidMap['luxury-leather-belt'], 'Kenneth U.', 5, 'High quality belt', 'The leather is genuine and the buckle has a nice weight to it. Very elegant.', 1],
    [pidMap['designer-denim-jacket'], 'Victor A.', 4, 'Stylish jacket', 'Fits perfectly and looks great with everything. The distressing is tastefully done.', 1],
    [pidMap['classic-oxford-shoes'], 'Michael O.', 5, 'Perfect formal shoes', 'Wore these to an interview and a wedding. Comfortable even after hours of standing.', 1],
    [pidMap['satin-blouse'], 'Ngozi P.', 4, 'Beautiful blouse', 'The satin has a lovely sheen. Perfect for office and dinner dates.', 1],
    [pidMap['premium-crossbody-bag'], 'Chioma D.', 5, 'Versatile bag', 'Goes with everything! The size is perfect for my phone, wallet, and essentials.', 1],
  ];

  for (const r of reviews) {
    if (!r[0]) continue;
    try {
      await query(
        `INSERT INTO reviews (product_id, customer_name, rating, title, comment, verified) VALUES ($1,$2,$3,$4,$5,$6)`,
        r
      );
    } catch (e) { /* skip duplicates */ }
  }
  console.log('  ✓ Reviews seeded');

  const staffPins = [
    { name: 'Sales Floor', pin: '8888', job_title: 'Sales associate', staff_code: 'UH-S01', phone: '', staff_role: 'staff' },
    { name: 'Store Manager', pin: '9999', job_title: 'Store lead', staff_code: 'UH-M01', phone: '', staff_role: 'supervisor' },
  ];
  for (const s of staffPins) {
    const { rows: ex } = await query('SELECT id FROM sales_staff WHERE name = $1', [s.name]);
    if (!ex.length) {
      await query(
        `INSERT INTO sales_staff (name, pin_hash, job_title, staff_code, phone, staff_role) VALUES ($1, $2, $3, $4, $5, $6)`,
        [s.name, bcrypt.hashSync(s.pin, 10), s.job_title, s.staff_code, s.phone || null, s.staff_role || 'staff']
      );
    } else {
      await query(
        `UPDATE sales_staff SET job_title = COALESCE(job_title, $1), staff_code = COALESCE(staff_code, $2), staff_role = COALESCE(staff_role, $4) WHERE name = $3`,
        [s.job_title, s.staff_code, s.name, s.staff_role || 'staff']
      );
    }
  }
  console.log('  ✓ Sales staff (8888=staff, 9999=supervisor) — edit in Admin → Sales staff');

  const discounts = [
    ['URBANHILT10', '10% off your order', 'percent', 10, 10000, 50000],
    ['WELCOME15', '₦15,000 off (orders ₦40k+)', 'fixed', 15000, 40000, 200],
    ['VIP20', '20% VIP weekend', 'percent', 20, 25000, 100],
  ];
  for (const d of discounts) {
    await query(
      `INSERT INTO discount_codes (code, description, discount_type, value, min_subtotal, max_uses, active)
       VALUES ($1, $2, $3, $4, $5, $6, 1) ON CONFLICT (code) DO NOTHING`,
      d
    );
  }
  console.log('  ✓ Sample discount codes seeded (URBANHILT10, WELCOME15, VIP20)');

  console.log('  ✓ Database seeded (admin / urbanhilt2024)');
}

module.exports = { seedDatabase };

if (require.main === module) {
  (async () => {
    await initDatabase();
    await seedDatabase();
    process.exit(0);
  })();
}
