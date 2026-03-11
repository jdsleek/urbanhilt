/* ============================================
   URBAN HILT — Product Detail JavaScript
   ============================================ */

let currentProduct = null;
let currentImageIndex = 0;
let selectedSize = '';
let selectedColor = '';

document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const slug = params.get('slug');
  if (slug) loadProduct(slug);
});

async function loadProduct(slug) {
  try {
    const data = await UH.api(`/products/${slug}`);
    if (!data.product) {
      window.location.href = '/shop.html';
      return;
    }

    currentProduct = data.product;
    document.title = `${currentProduct.name} — URBAN HILT`;

    document.getElementById('breadcrumbProduct').textContent = currentProduct.name;
    document.getElementById('productName').textContent = currentProduct.name;

    // Price
    let priceHTML = UH.formatPrice(currentProduct.sale_price || currentProduct.price);
    if (currentProduct.sale_price) {
      const discount = Math.round((1 - currentProduct.sale_price / currentProduct.price) * 100);
      priceHTML += `<span class="original">${UH.formatPrice(currentProduct.price)}</span>`;
      priceHTML += `<span class="sale-tag">-${discount}% OFF</span>`;
    }
    document.getElementById('productPrice').innerHTML = priceHTML;

    // Description
    document.getElementById('productDesc').textContent = currentProduct.description || 'Premium quality product from Urban Hilt. Crafted with the finest materials for ultimate comfort and style.';

    // Badges
    const badges = document.getElementById('productBadges');
    let badgeHTML = '';
    if (currentProduct.new_arrival) badgeHTML += '<span class="badge badge-new">New Arrival</span>';
    if (currentProduct.sale_price) badgeHTML += '<span class="badge badge-sale">Sale</span>';
    if (currentProduct.best_seller) badgeHTML += '<span class="badge badge-hot">Best Seller</span>';
    badges.innerHTML = badgeHTML;

    // Images
    setupGallery(currentProduct.images);

    // Sizes
    if (currentProduct.sizes?.length) {
      document.getElementById('sizeGroup').style.display = 'block';
      document.getElementById('sizeOptions').innerHTML = currentProduct.sizes.map(s =>
        `<div class="size-option" data-size="${s}">${s}</div>`
      ).join('');
      document.querySelectorAll('.size-option').forEach(el => {
        el.addEventListener('click', () => {
          document.querySelectorAll('.size-option').forEach(o => o.classList.remove('active'));
          el.classList.add('active');
          selectedSize = el.dataset.size;
        });
      });
    }

    // Colors
    if (currentProduct.colors?.length) {
      document.getElementById('colorGroup').style.display = 'block';
      document.getElementById('colorOptions').innerHTML = currentProduct.colors.map(c =>
        `<div class="color-option" data-color="${c}">${c}</div>`
      ).join('');
      document.querySelectorAll('.color-option').forEach(el => {
        el.addEventListener('click', () => {
          document.querySelectorAll('.color-option').forEach(o => o.classList.remove('active'));
          el.classList.add('active');
          selectedColor = el.dataset.color;
        });
      });
    }

    // Quantity
    const qtyInput = document.getElementById('qtyInput');
    document.getElementById('qtyMinus')?.addEventListener('click', () => {
      qtyInput.value = Math.max(1, parseInt(qtyInput.value) - 1);
    });
    document.getElementById('qtyPlus')?.addEventListener('click', () => {
      qtyInput.value = Math.min(10, parseInt(qtyInput.value) + 1);
    });

    // Add to Cart
    document.getElementById('addToCartBtn')?.addEventListener('click', () => {
      if (currentProduct.sizes?.length && !selectedSize) {
        UH.showToast('Please select a size', 'fa-exclamation-circle');
        return;
      }
      const qty = parseInt(qtyInput.value);
      UH.addToCart(currentProduct, qty, selectedSize, selectedColor);
    });

    // WhatsApp order
    const whatsappBtn = document.getElementById('buyWhatsapp');
    if (whatsappBtn) {
      const price = UH.formatPrice(currentProduct.sale_price || currentProduct.price);
      const msg = encodeURIComponent(`Hello Urban Hilt! I'd like to order:\n\nProduct: ${currentProduct.name}\nPrice: ${price}\n\nPlease let me know the next steps.`);
      whatsappBtn.href = `https://wa.me/${UH.WHATSAPP}?text=${msg}`;
    }

    // Related products
    if (data.related?.length) {
      document.getElementById('relatedProducts').innerHTML = data.related.map(p => UH.productCardHTML(p)).join('');
      UH.initReveal();
    }

  } catch (e) {
    console.error('Error loading product:', e);
  }
}

function setupGallery(images) {
  const mainImg = document.getElementById('mainImage');
  const thumbs = document.getElementById('galleryThumbs');

  if (!images?.length) {
    mainImg.style.display = 'none';
    return;
  }

  mainImg.src = images[0];
  mainImg.alt = currentProduct.name;

  if (images.length > 1) {
    thumbs.innerHTML = images.map((img, i) => `
      <div class="gallery-thumb ${i === 0 ? 'active' : ''}" data-index="${i}">
        <img src="${img}" alt="Thumbnail ${i + 1}">
      </div>
    `).join('');

    thumbs.querySelectorAll('.gallery-thumb').forEach(thumb => {
      thumb.addEventListener('click', () => {
        currentImageIndex = parseInt(thumb.dataset.index);
        updateMainImage();
      });
    });
  }

  document.getElementById('galleryPrev')?.addEventListener('click', () => {
    currentImageIndex = (currentImageIndex - 1 + images.length) % images.length;
    updateMainImage();
  });

  document.getElementById('galleryNext')?.addEventListener('click', () => {
    currentImageIndex = (currentImageIndex + 1) % images.length;
    updateMainImage();
  });
}

function updateMainImage() {
  const images = currentProduct.images;
  document.getElementById('mainImage').src = images[currentImageIndex];
  document.querySelectorAll('.gallery-thumb').forEach((t, i) => {
    t.classList.toggle('active', i === currentImageIndex);
  });
}
