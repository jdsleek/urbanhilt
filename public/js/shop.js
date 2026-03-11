/* ============================================
   URBAN HILT — Shop Page JavaScript
   ============================================ */

let currentPage = 1;
const perPage = 12;
let currentFilters = {};

document.addEventListener('DOMContentLoaded', async () => {
  parseURLParams();
  await loadShopCategories();
  loadProducts();
  initFilterListeners();
  initViewToggle();
  UH.initReveal();
});

function parseURLParams() {
  const params = new URLSearchParams(window.location.search);
  const category = params.get('category');
  const filter = params.get('filter');

  if (category) currentFilters.category = category;
  if (filter === 'new') {
    currentFilters.new_arrival = '1';
    document.getElementById('shopTitle').textContent = 'New Arrivals';
    document.getElementById('shopSubtitle').textContent = 'The latest additions to our collection';
    document.getElementById('breadcrumbCurrent').textContent = 'New Arrivals';
  }
  if (filter === 'sale') {
    document.getElementById('shopTitle').textContent = 'Sale';
    document.getElementById('shopSubtitle').textContent = 'Unbeatable deals on premium fashion';
    document.getElementById('breadcrumbCurrent').textContent = 'Sale';
  }
}

async function loadShopCategories() {
  try {
    const data = await UH.api('/categories');
    const container = document.getElementById('filterCategories');
    if (!container || !data.categories) return;

    container.innerHTML = `
      <label class="filter-option">
        <input type="radio" name="category" value="" ${!currentFilters.category ? 'checked' : ''}> 
        <span>All Categories</span>
      </label>
      ${data.categories.map(c => `
        <label class="filter-option">
          <input type="radio" name="category" value="${c.slug}" ${currentFilters.category === c.slug ? 'checked' : ''}> 
          <span>${c.name} (${c.product_count || 0})</span>
        </label>
      `).join('')}
    `;

    if (currentFilters.category) {
      const cat = data.categories.find(c => c.slug === currentFilters.category);
      if (cat) {
        document.getElementById('shopTitle').textContent = cat.name;
        document.getElementById('breadcrumbCurrent').textContent = cat.name;
      }
    }
  } catch (e) {}
}

async function loadProducts() {
  const loading = document.getElementById('shopLoading');
  const grid = document.getElementById('shopProducts');
  const empty = document.getElementById('shopEmpty');
  loading.style.display = 'block';
  grid.innerHTML = '';
  empty.style.display = 'none';

  const params = new URLSearchParams();
  params.set('limit', perPage);
  params.set('offset', (currentPage - 1) * perPage);

  if (currentFilters.category) params.set('category', currentFilters.category);
  if (currentFilters.sort) params.set('sort', currentFilters.sort);
  if (currentFilters.min_price) params.set('min_price', currentFilters.min_price);
  if (currentFilters.max_price) params.set('max_price', currentFilters.max_price);
  if (currentFilters.new_arrival) params.set('new_arrival', '1');
  if (currentFilters.best_seller) params.set('best_seller', '1');
  if (currentFilters.search) params.set('search', currentFilters.search);

  try {
    const data = await UH.api(`/products?${params.toString()}`);
    loading.style.display = 'none';

    if (!data.products?.length) {
      empty.style.display = 'block';
      document.getElementById('productCount').textContent = '0 products';
      return;
    }

    document.getElementById('productCount').textContent = `${data.total} product${data.total !== 1 ? 's' : ''}`;
    grid.innerHTML = data.products.map(p => UH.productCardHTML(p)).join('');
    renderPagination(data.total);
    UH.initReveal();
  } catch (e) {
    loading.style.display = 'none';
    empty.style.display = 'block';
  }
}

function renderPagination(total) {
  const pages = Math.ceil(total / perPage);
  const container = document.getElementById('pagination');
  if (pages <= 1) { container.innerHTML = ''; return; }

  let html = '';
  if (currentPage > 1) html += `<button data-page="${currentPage - 1}">‹ Prev</button>`;
  for (let i = 1; i <= pages; i++) {
    html += `<button data-page="${i}" class="${i === currentPage ? 'active' : ''}">${i}</button>`;
  }
  if (currentPage < pages) html += `<button data-page="${currentPage + 1}">Next ›</button>`;
  container.innerHTML = html;

  container.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      currentPage = parseInt(btn.dataset.page);
      loadProducts();
      window.scrollTo({ top: 300, behavior: 'smooth' });
    });
  });
}

function initFilterListeners() {
  document.querySelectorAll('input[name="category"]').forEach(input => {
    input.addEventListener('change', (e) => {
      currentFilters.category = e.target.value;
      currentPage = 1;
      loadProducts();
    });
  });

  document.querySelectorAll('input[name="sort"]').forEach(input => {
    input.addEventListener('change', (e) => {
      currentFilters.sort = e.target.value;
      currentPage = 1;
      loadProducts();
    });
  });

  document.getElementById('applyPrice')?.addEventListener('click', () => {
    currentFilters.min_price = document.getElementById('minPrice').value || '';
    currentFilters.max_price = document.getElementById('maxPrice').value || '';
    currentPage = 1;
    loadProducts();
  });

  document.getElementById('clearFilters')?.addEventListener('click', () => {
    currentFilters = {};
    currentPage = 1;
    document.querySelectorAll('input[name="category"]')[0].checked = true;
    document.querySelectorAll('input[name="sort"]')[0].checked = true;
    document.getElementById('minPrice').value = '';
    document.getElementById('maxPrice').value = '';
    loadProducts();
  });

  // Sidebar toggle (mobile)
  const sidebar = document.getElementById('shopSidebar');
  document.getElementById('filterToggle')?.addEventListener('click', () => sidebar?.classList.add('active'));
  document.getElementById('sidebarClose')?.addEventListener('click', () => sidebar?.classList.remove('active'));
}

function initViewToggle() {
  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const grid = document.getElementById('shopProducts');
      if (btn.dataset.view === 'list') {
        grid.style.gridTemplateColumns = '1fr';
      } else {
        grid.style.gridTemplateColumns = '';
      }
    });
  });
}
