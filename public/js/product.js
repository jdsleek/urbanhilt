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

    // Wishlist button on detail page
    const wishDetailBtn = document.getElementById('wishlistDetailBtn');
    if (wishDetailBtn) {
      if (UH.isInWishlist(currentProduct.id)) wishDetailBtn.classList.add('active');
      wishDetailBtn.addEventListener('click', async () => {
        const inList = await UH.toggleWishlist(currentProduct.id);
        wishDetailBtn.classList.toggle('active', inList);
      });
    }

    document.getElementById('copyProductLink')?.addEventListener('click', () => {
      UH.copyToClipboard(window.location.href);
    });

    // Related products
    if (data.related?.length) {
      document.getElementById('relatedProducts').innerHTML = data.related.map(p => UH.productCardHTML(p)).join('');
      UH.initReveal();
    }

    // Reviews
    loadReviews(slug);

  } catch (e) {
    console.error('Error loading product:', e);
  }
}

function setupGallery(images) {
  const mainImg = document.getElementById('mainImage');
  const thumbs = document.getElementById('galleryThumbs');
  if (!mainImg) return;

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
  const galleryMain = document.querySelector('.gallery-main');
  if (galleryMain) galleryMain.classList.remove('zoomed');
  document.getElementById('mainImage').src = images[currentImageIndex];
  document.querySelectorAll('.gallery-thumb').forEach((t, i) => {
    t.classList.toggle('active', i === currentImageIndex);
  });
}

// Image Zoom
document.addEventListener('click', (e) => {
  const galleryMain = e.target.closest('.gallery-main');
  if (!galleryMain) return;
  galleryMain.classList.toggle('zoomed');
  if (!galleryMain.classList.contains('zoomed')) {
    const img = galleryMain.querySelector('img');
    if (img) img.style.transformOrigin = 'center center';
  }
});

document.addEventListener('mousemove', (e) => {
  const galleryMain = e.target.closest('.gallery-main');
  if (!galleryMain || !galleryMain.classList.contains('zoomed')) return;
  const rect = galleryMain.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * 100;
  const y = ((e.clientY - rect.top) / rect.height) * 100;
  const img = galleryMain.querySelector('img');
  if (img) img.style.transformOrigin = `${x}% ${y}%`;
});

// Reviews
async function loadReviews(slug) {
  const section = document.getElementById('reviewsSection');
  if (!section) return;

  try {
    const data = await UH.api(`/products/${slug}/reviews`);
    const reviews = data.reviews || [];

    const avgRating = data.average_rating ?? data.avg_rating;
    if (!reviews.length && !(avgRating > 0)) {
      section.innerHTML = `
        <div class="container">
          <div class="reviews-header">
            <h2 style="font-family:var(--font-display);font-size:1.5rem;">Customer Reviews</h2>
          </div>
          <p style="color:var(--text-light);">No reviews yet. Be the first to review this product!</p>
          ${renderReviewForm(slug)}
        </div>
      `;
      initReviewForm(slug);
      return;
    }

    const avgNum = Number(avgRating) || 0;
    const avg = avgNum.toFixed(1);
    const total = data.total ?? data.count ?? reviews.length;
    const dist = data.distribution || {};

    section.innerHTML = `
      <div class="container">
        <div class="reviews-header">
          <div class="reviews-summary">
            <div class="reviews-avg">
              <div class="big-rating">${avg}</div>
              <div class="star-display">${renderStars(Math.round(avgNum))}</div>
              <div class="review-count">${total} review${total !== 1 ? 's' : ''}</div>
            </div>
            <div class="review-bars">
              ${[5,4,3,2,1].map(n => {
                const count = dist[n] || 0;
                const pct = total > 0 ? (count / total) * 100 : 0;
                return `<div class="review-bar"><span>${n}★</span><div class="bar-track"><div class="bar-fill" style="width:${pct}%"></div></div><span>${count}</span></div>`;
              }).join('')}
            </div>
          </div>
        </div>
        <div class="review-list">
          ${reviews.map(r => {
            const author = r.customer_name || r.author || 'Anonymous';
            const reviewText = r.comment != null && r.comment !== '' ? r.comment : r.text || '';
            const reviewDate = r.created_at || r.date;
            return `
            <div class="review-card">
              <div class="review-card-header">
                <span class="review-card-author">${author}</span>
                <span class="review-card-date">${reviewDate ? new Date(reviewDate).toLocaleDateString('en-NG', { year: 'numeric', month: 'short', day: 'numeric' }) : ''}</span>
              </div>
              <div class="review-card-stars">${renderStars(r.rating)}</div>
              ${r.title ? `<div class="review-card-title">${r.title}</div>` : ''}
              <div class="review-card-text">${reviewText}</div>
              ${r.verified ? '<div class="review-verified"><i class="fas fa-check-circle"></i> Verified Purchase</div>' : ''}
            </div>
          `;
          }).join('')}
        </div>
        ${renderReviewForm(slug)}
      </div>
    `;
    initReviewForm(slug);
  } catch (e) {
    // Reviews endpoint may not exist yet
  }
}

function renderStars(rating) {
  let html = '';
  for (let i = 1; i <= 5; i++) {
    html += `<i class="fas fa-star${i <= rating ? '' : (i - 0.5 <= rating ? '-half-alt' : '')}"></i>`;
  }
  return html;
}

function renderReviewForm(slug) {
  return `
    <div class="review-form" id="reviewFormWrap">
      <h3>Write a Review</h3>
      <form id="reviewForm">
        <label class="option-label">Your Rating</label>
        <div class="star-input" id="starInput">
          ${[1,2,3,4,5].map(i => `<i class="fas fa-star" data-rating="${i}"></i>`).join('')}
        </div>
        <div class="form-group">
          <label>Name</label>
          <input type="text" id="reviewAuthor" placeholder="Your name" required>
        </div>
        <div class="form-group">
          <label>Review Title</label>
          <input type="text" id="reviewTitle" placeholder="Summary of your review">
        </div>
        <div class="form-group">
          <label>Your Review</label>
          <textarea id="reviewText" rows="4" placeholder="Tell us about your experience..." required></textarea>
        </div>
        <button type="submit" class="btn btn-primary">Submit Review</button>
      </form>
    </div>
  `;
}

function initReviewForm(slug) {
  let selectedRating = 0;
  const starInput = document.getElementById('starInput');
  if (starInput) {
    const stars = starInput.querySelectorAll('i');
    stars.forEach(star => {
      star.addEventListener('mouseenter', () => {
        const r = parseInt(star.dataset.rating);
        stars.forEach((s, i) => s.classList.toggle('active', i < r));
      });
      star.addEventListener('click', () => {
        selectedRating = parseInt(star.dataset.rating);
        stars.forEach((s, i) => s.classList.toggle('active', i < selectedRating));
      });
    });
    starInput.addEventListener('mouseleave', () => {
      stars.forEach((s, i) => s.classList.toggle('active', i < selectedRating));
    });
  }

  const form = document.getElementById('reviewForm');
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!selectedRating) {
        UH.showToast('Please select a rating', 'fa-exclamation-circle');
        return;
      }
      const reviewData = {
        rating: selectedRating,
        customer_name: document.getElementById('reviewAuthor').value.trim(),
        title: document.getElementById('reviewTitle').value.trim(),
        comment: document.getElementById('reviewText').value.trim(),
      };
      try {
        const result = await UH.api(`/products/${slug}/reviews`, {
          method: 'POST',
          body: JSON.stringify(reviewData)
        });
        if (result.error) {
          UH.showToast(result.error || 'Failed to submit review.', 'fa-exclamation-circle');
          return;
        }
        UH.showToast('Review submitted! Thank you.');
        loadReviews(slug);
      } catch (err) {
        UH.showToast('Failed to submit review. Please try again.', 'fa-exclamation-circle');
      }
    });
  }
}
