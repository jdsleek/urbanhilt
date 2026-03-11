/* ============================================
   URBAN HILT — Core JavaScript
   ============================================ */

const UH = {
  API: '/api',
  WHATSAPP: '2348146747883',
  CURRENCY: '₦',

  formatPrice(amount) {
    return this.CURRENCY + Number(amount).toLocaleString('en-NG');
  },

  async api(endpoint, options = {}) {
    const res = await fetch(this.API + endpoint, {
      headers: { 'Content-Type': 'application/json', ...options.headers },
      ...options
    });
    return res.json();
  },

  getCart() {
    return JSON.parse(localStorage.getItem('uh_cart') || '[]');
  },

  saveCart(cart) {
    localStorage.setItem('uh_cart', JSON.stringify(cart));
    this.updateCartCount();
  },

  addToCart(product, qty = 1, size = '', color = '') {
    const cart = this.getCart();
    const key = `${product.id}-${size}-${color}`;
    const existing = cart.find(i => i.key === key);
    if (existing) {
      existing.qty += qty;
    } else {
      cart.push({
        key, id: product.id, name: product.name, slug: product.slug,
        price: product.sale_price || product.price,
        image: product.images?.[0] || '',
        size, color, qty
      });
    }
    this.saveCart(cart);
    this.showToast('Added to cart!');
  },

  removeFromCart(key) {
    const cart = this.getCart().filter(i => i.key !== key);
    this.saveCart(cart);
  },

  updateCartQty(key, qty) {
    const cart = this.getCart();
    const item = cart.find(i => i.key === key);
    if (item) {
      item.qty = Math.max(1, Math.min(10, qty));
      this.saveCart(cart);
    }
  },

  getCartTotal() {
    return this.getCart().reduce((sum, i) => sum + (i.price * i.qty), 0);
  },

  getCartCount() {
    return this.getCart().reduce((sum, i) => sum + i.qty, 0);
  },

  updateCartCount() {
    document.querySelectorAll('#cartCount').forEach(el => {
      el.textContent = this.getCartCount();
    });
  },

  showToast(message, icon = 'fa-check-circle') {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<i class="fas ${icon}"></i> ${message}`;
    document.body.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('show'));
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 400);
    }, 3000);
  },

  getSessionId() {
    let sid = localStorage.getItem('uh_session_id');
    if (!sid) {
      sid = 'sess_' + Date.now().toString(36) + Math.random().toString(36).substring(2);
      localStorage.setItem('uh_session_id', sid);
    }
    return sid;
  },

  getWishlist() {
    return JSON.parse(localStorage.getItem('uh_wishlist') || '[]');
  },

  async toggleWishlist(productId) {
    const wishlist = this.getWishlist();
    const idx = wishlist.indexOf(productId);
    if (idx > -1) {
      wishlist.splice(idx, 1);
      await this.api(`/wishlist/${productId}?session_id=${this.getSessionId()}`, { method: 'DELETE' }).catch(() => {});
      this.showToast('Removed from wishlist', 'fa-heart-broken');
    } else {
      wishlist.push(productId);
      await this.api('/wishlist', { method: 'POST', body: JSON.stringify({ session_id: this.getSessionId(), product_id: productId }) }).catch(() => {});
      this.showToast('Added to wishlist!', 'fa-heart');
    }
    localStorage.setItem('uh_wishlist', JSON.stringify(wishlist));
    this.updateWishlistCount();
    document.querySelectorAll(`.wishlist-btn[data-id="${productId}"]`).forEach(btn => btn.classList.toggle('active', wishlist.includes(productId)));
    return wishlist.includes(productId);
  },

  isInWishlist(productId) {
    return this.getWishlist().includes(productId);
  },

  updateWishlistCount() {
    const count = this.getWishlist().length;
    document.querySelectorAll('#wishlistCount').forEach(el => el.textContent = count);
  },

  getCustomerToken() {
    return localStorage.getItem('uh_customer_token');
  },

  productCardHTML(product) {
    const img = product.images?.[0];
    const imgHTML = img
      ? `<img src="${img}" alt="${product.name}" loading="lazy">`
      : `<div class="placeholder-icon"><i class="fas fa-tshirt"></i></div>`;

    let badges = '';
    if (product.new_arrival) badges += '<span class="badge badge-new">New</span>';
    if (product.sale_price) badges += '<span class="badge badge-sale">Sale</span>';
    if (product.best_seller) badges += '<span class="badge badge-hot">Hot</span>';

    const priceHTML = product.sale_price
      ? `<span class="current">${this.formatPrice(product.sale_price)}</span><span class="original">${this.formatPrice(product.price)}</span>`
      : `<span class="current">${this.formatPrice(product.price)}</span>`;

    const outOfStock = product.stock === 0
      ? '<div class="out-of-stock-overlay"><span class="out-of-stock-label">Out of Stock</span></div>'
      : '';

    const wishlistActive = UH.isInWishlist(product.id) ? 'active' : '';

    return `
      <div class="product-card reveal">
        <div class="product-card-image">
          ${imgHTML}
          <div class="product-badges">${badges}</div>
          <button class="wishlist-btn ${wishlistActive}" data-id="${product.id}" onclick="UH.toggleWishlist(${product.id})"><i class="fas fa-heart"></i></button>
          ${outOfStock}
          <div class="product-card-actions">
            <a href="/product.html?slug=${product.slug}" class="btn btn-white btn-sm">View Details</a>
          </div>
        </div>
        <div class="product-card-body">
          <div class="product-card-category">${product.category_name || 'Urban Hilt'}</div>
          <h3 class="product-card-name"><a href="/product.html?slug=${product.slug}">${product.name}</a></h3>
          <div class="product-card-price">${priceHTML}</div>
        </div>
      </div>
    `;
  },

  initReveal() {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });

    document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
  }
};

document.addEventListener('DOMContentLoaded', () => {
  UH.updateCartCount();
  UH.updateWishlistCount();

  // Preloader
  const preloader = document.getElementById('preloader');
  if (preloader) {
    setTimeout(() => preloader.classList.add('loaded'), 1800);
  }

  // Navbar scroll
  const navbar = document.getElementById('navbar');
  if (navbar && !navbar.classList.contains('navbar-light')) {
    const announcementBar = document.querySelector('.announcement-bar');
    const offset = announcementBar ? announcementBar.offsetHeight : 0;
    window.addEventListener('scroll', () => {
      navbar.classList.toggle('scrolled', window.scrollY > offset + 50);
    });
  }

  // Navbar padding for announcement bar
  if (navbar && navbar.classList.contains('navbar-light')) {
    const announcementBar = document.querySelector('.announcement-bar');
    if (announcementBar) {
      navbar.style.top = announcementBar.offsetHeight + 'px';
    }
  }

  // Mobile menu
  const navToggle = document.getElementById('navToggle');
  const navMenu = document.getElementById('navMenu');
  if (navToggle && navMenu) {
    navToggle.addEventListener('click', () => {
      navToggle.classList.toggle('active');
      navMenu.classList.toggle('active');
      document.body.style.overflow = navMenu.classList.contains('active') ? 'hidden' : '';
    });
  }

  // Search
  const searchToggle = document.getElementById('searchToggle');
  const searchOverlay = document.getElementById('searchOverlay');
  const searchClose = document.getElementById('searchClose');
  const searchInput = document.getElementById('searchInput');
  const searchResults = document.getElementById('searchResults');

  if (searchToggle && searchOverlay) {
    searchToggle.addEventListener('click', () => {
      searchOverlay.classList.add('active');
      setTimeout(() => searchInput?.focus(), 300);
    });
    searchClose?.addEventListener('click', () => searchOverlay.classList.remove('active'));
    searchOverlay.addEventListener('click', (e) => {
      if (e.target === searchOverlay) searchOverlay.classList.remove('active');
    });

    let searchTimeout;
    searchInput?.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      const q = e.target.value.trim();
      if (q.length < 2) { searchResults.innerHTML = ''; return; }
      searchTimeout = setTimeout(async () => {
        const data = await UH.api(`/search?q=${encodeURIComponent(q)}`);
        if (data.products?.length) {
          searchResults.innerHTML = data.products.map(p => {
            const img = p.images?.[0] || '';
            return `
              <a href="/product.html?slug=${p.slug}" class="search-result-item">
                ${img ? `<img src="${img}" alt="${p.name}">` : '<div style="width:60px;height:60px;background:#333;border-radius:4px;display:flex;align-items:center;justify-content:center;color:#666"><i class="fas fa-tshirt"></i></div>'}
                <div class="search-result-info">
                  <h4>${p.name}</h4>
                  <p>${UH.formatPrice(p.sale_price || p.price)}</p>
                </div>
              </a>
            `;
          }).join('');
        } else {
          searchResults.innerHTML = '<p style="color:rgba(255,255,255,0.5);padding:20px;">No products found.</p>';
        }
      }, 300);
    });
  }

  // Load categories in nav
  loadNavCategories();

  // Back to top
  const backToTop = document.getElementById('backToTop');
  if (backToTop) {
    window.addEventListener('scroll', () => {
      backToTop.classList.toggle('visible', window.scrollY > 500);
    });
    backToTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }

  // Newsletter
  const newsletterForm = document.getElementById('newsletterForm');
  if (newsletterForm) {
    newsletterForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = document.getElementById('newsletterEmail').value;
      const data = await UH.api('/newsletter', { method: 'POST', body: JSON.stringify({ email }) });
      document.getElementById('newsletterMessage').textContent = data.message || 'Subscribed!';
      document.getElementById('newsletterEmail').value = '';
    });
  }
});

async function loadNavCategories() {
  try {
    const data = await UH.api('/categories');
    const navCats = document.getElementById('navCategories');
    if (navCats && data.categories?.length) {
      navCats.innerHTML = data.categories.map(c =>
        `<a href="/shop.html?category=${c.slug}">${c.name}</a>`
      ).join('') + '<a href="/shop.html">View All</a>';
    }
  } catch (e) {}
}
