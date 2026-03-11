/* ============================================
   URBAN HILT — Homepage JavaScript
   ============================================ */

document.addEventListener('DOMContentLoaded', async () => {
  await Promise.all([
    loadCategories(),
    loadFeaturedProducts(),
    loadNewArrivals(),
    loadBestSellers()
  ]);
  UH.initReveal();
});

async function loadCategories() {
  try {
    const data = await UH.api('/categories');
    const grid = document.getElementById('categoriesGrid');
    if (!grid || !data.categories?.length) return;

    const icons = ['fa-tshirt', 'fa-shoe-prints', 'fa-vest', 'fa-hat-cowboy', 'fa-bag-shopping', 'fa-glasses'];
    grid.innerHTML = data.categories.map((cat, i) => `
      <a href="/shop.html?category=${cat.slug}" class="category-card reveal">
        <div class="category-card-bg"><i class="fas ${icons[i % icons.length]}"></i></div>
        <div class="category-card-overlay"></div>
        <div class="category-card-content">
          <h3>${cat.name}</h3>
          <p>${cat.product_count || 0} Products</p>
        </div>
        <div class="category-card-arrow"><i class="fas fa-arrow-right"></i></div>
      </a>
    `).join('');
  } catch (e) {
    console.error('Error loading categories:', e);
  }
}

async function loadFeaturedProducts() {
  try {
    const data = await UH.api('/products?featured=1&limit=8');
    const grid = document.getElementById('featuredProducts');
    if (!grid) return;
    if (data.products?.length) {
      grid.innerHTML = data.products.map(p => UH.productCardHTML(p)).join('');
    } else {
      const allData = await UH.api('/products?limit=8');
      grid.innerHTML = allData.products?.map(p => UH.productCardHTML(p)).join('') || '';
    }
  } catch (e) {
    console.error('Error loading featured products:', e);
  }
}

async function loadNewArrivals() {
  try {
    const data = await UH.api('/products?new_arrival=1&limit=4');
    const grid = document.getElementById('newArrivals');
    if (!grid) return;
    if (data.products?.length) {
      grid.innerHTML = data.products.map(p => UH.productCardHTML(p)).join('');
    } else {
      const allData = await UH.api('/products?sort=newest&limit=4');
      grid.innerHTML = allData.products?.map(p => UH.productCardHTML(p)).join('') || '';
    }
  } catch (e) {
    console.error('Error loading new arrivals:', e);
  }
}

async function loadBestSellers() {
  try {
    const data = await UH.api('/products?best_seller=1&limit=4');
    const grid = document.getElementById('bestSellers');
    if (!grid) return;
    if (data.products?.length) {
      grid.innerHTML = data.products.map(p => UH.productCardHTML(p)).join('');
    } else {
      const allData = await UH.api('/products?limit=4&sort=price_desc');
      grid.innerHTML = allData.products?.map(p => UH.productCardHTML(p)).join('') || '';
    }
  } catch (e) {
    console.error('Error loading best sellers:', e);
  }
}
