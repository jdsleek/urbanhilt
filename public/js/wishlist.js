/* ============================================
   URBAN HILT — Wishlist Page JavaScript
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
  loadWishlist();
});

async function loadWishlist() {
  const grid = document.getElementById('wishlistGrid');
  const empty = document.getElementById('wishlistEmpty');
  const countEl = document.getElementById('wishlistTotal');
  const wishlist = UH.getWishlist();

  if (!wishlist.length) {
    if (grid) grid.style.display = 'none';
    if (empty) empty.style.display = 'block';
    if (countEl) countEl.textContent = '0 items';
    return;
  }

  if (grid) grid.style.display = 'grid';
  if (empty) empty.style.display = 'none';
  if (countEl) countEl.textContent = `${wishlist.length} item${wishlist.length !== 1 ? 's' : ''}`;

  grid.innerHTML = '<div class="shop-loading"><div class="spinner"></div><p>Loading your wishlist...</p></div>';

  try {
    const products = [];
    for (const id of wishlist) {
      try {
        const data = await UH.api(`/products/id/${id}`);
        if (data.product) products.push(data.product);
      } catch (e) {
        // product may have been removed
      }
    }

    if (!products.length) {
      grid.style.display = 'none';
      if (empty) empty.style.display = 'block';
      if (countEl) countEl.textContent = '0 items';
      return;
    }

    grid.innerHTML = products.map(product => {
      const img = product.images?.[0];
      const imgHTML = img
        ? `<img src="${img}" alt="${product.name}" loading="lazy">`
        : `<div class="placeholder-icon"><i class="fas fa-tshirt"></i></div>`;

      let badges = '';
      if (product.new_arrival) badges += '<span class="badge badge-new">New</span>';
      if (product.sale_price) badges += '<span class="badge badge-sale">Sale</span>';
      if (product.best_seller) badges += '<span class="badge badge-hot">Hot</span>';

      const priceHTML = product.sale_price
        ? `<span class="current">${UH.formatPrice(product.sale_price)}</span><span class="original">${UH.formatPrice(product.price)}</span>`
        : `<span class="current">${UH.formatPrice(product.price)}</span>`;

      return `
        <div class="product-card reveal" data-wishlist-id="${product.id}">
          <div class="product-card-image">
            ${imgHTML}
            <div class="product-badges">${badges}</div>
            <button class="wishlist-btn active" data-id="${product.id}" onclick="removeFromWishlist(${product.id})">
              <i class="fas fa-heart"></i>
            </button>
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
    }).join('');

    UH.initReveal();
  } catch (e) {
    grid.innerHTML = '<div class="shop-empty"><i class="fas fa-exclamation-circle"></i><p>Failed to load wishlist. Please try again.</p></div>';
  }
}

async function removeFromWishlist(productId) {
  await UH.toggleWishlist(productId);
  const card = document.querySelector(`.product-card[data-wishlist-id="${productId}"]`);
  if (card) {
    card.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    card.style.opacity = '0';
    card.style.transform = 'scale(0.95)';
    setTimeout(() => {
      card.remove();
      const wishlist = UH.getWishlist();
      const countEl = document.getElementById('wishlistTotal');
      if (countEl) countEl.textContent = `${wishlist.length} item${wishlist.length !== 1 ? 's' : ''}`;
      if (!wishlist.length) {
        const grid = document.getElementById('wishlistGrid');
        const empty = document.getElementById('wishlistEmpty');
        if (grid) grid.style.display = 'none';
        if (empty) empty.style.display = 'block';
      }
    }, 300);
  }
}
