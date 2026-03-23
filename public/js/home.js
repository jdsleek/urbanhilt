/* ============================================
   URBAN HILT — Homepage JavaScript
   ============================================ */

function escAttr(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

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
  const grid = document.getElementById('categoriesGrid');
  if (!grid) return;

  try {
    const data = await UH.api('/categories');
    if (data.error) {
      grid.innerHTML =
        '<p class="categories-empty-msg">Categories could not be loaded. Please refresh or try again later.</p>';
      return;
    }
    const list = data.categories || [];
    if (!list.length) {
      grid.innerHTML =
        '<p class="categories-empty-msg">No categories yet. Add them in <strong>Admin → Categories</strong>, then refresh.</p>';
      return;
    }

    const icons = ['fa-tshirt', 'fa-shoe-prints', 'fa-vest', 'fa-hat-cowboy', 'fa-bag-shopping', 'fa-glasses'];
    grid.innerHTML = list.map((cat, i) => {
      const name = escAttr(cat.name);
      const img = cat.image && String(cat.image).trim();
      const bgInner = img
        ? `<img class="category-card-img" src="${escAttr(img)}" alt="" loading="lazy" width="600" height="400" ${UH.productImageFallbackAttr()}>`
        : `<i class="fas ${icons[i % icons.length]}"></i>`;
      const count = Number(cat.product_count) || 0;
      const q = encodeURIComponent(cat.slug || '');
      return `
      <a href="/shop.html?category=${q}" class="category-card reveal">
        <div class="category-card-bg">${bgInner}</div>
        <div class="category-card-overlay"></div>
        <div class="category-card-content">
          <h3>${name}</h3>
          <p>${count} Product${count !== 1 ? 's' : ''}</p>
        </div>
        <div class="category-card-arrow"><i class="fas fa-arrow-right"></i></div>
      </a>`;
    }).join('');
  } catch (e) {
    console.error('Error loading categories:', e);
    grid.innerHTML =
      '<p class="categories-empty-msg">Categories could not be loaded. Check your connection and try again.</p>';
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
