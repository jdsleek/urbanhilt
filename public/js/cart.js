/* ============================================
   URBAN HILT — Cart Page JavaScript
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
  renderCart();
});

function renderCart() {
  const cart = UH.getCart();
  const cartContent = document.getElementById('cartContent');
  const cartEmpty = document.getElementById('cartEmpty');
  const cartItems = document.getElementById('cartItems');

  if (!cart.length) {
    cartContent.style.display = 'none';
    cartEmpty.style.display = 'block';
    return;
  }

  cartContent.style.display = 'grid';
  cartEmpty.style.display = 'none';

  cartItems.innerHTML = cart.map(item => {
    const imgHTML = item.image
      ? `<img src="${item.image}" alt="${item.name}">`
      : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:#ccc;"><i class="fas fa-tshirt" style="font-size:1.5rem;"></i></div>`;

    const meta = [item.size, item.color].filter(Boolean).join(' / ');
    const itemTotal = item.price * item.qty;

    return `
      <div class="cart-item" data-key="${item.key}">
        <div class="cart-item-image">
          <a href="/product.html?slug=${item.slug}">${imgHTML}</a>
        </div>
        <div class="cart-item-details">
          <h4><a href="/product.html?slug=${item.slug}">${item.name}</a></h4>
          ${meta ? `<div class="cart-item-meta">${meta}</div>` : ''}
          <div class="cart-item-price">${UH.formatPrice(item.price)}</div>
          <div class="stock-warning" id="stock-${item.key}" style="display:none;color:var(--danger);font-size:0.8rem;margin-top:4px;"></div>
          <div class="quantity-selector" style="margin-top:8px;">
            <button class="qty-btn" onclick="updateQty('${item.key}', ${item.qty - 1})">−</button>
            <input type="number" value="${item.qty}" min="1" max="10" class="qty-input"
                   onchange="updateQty('${item.key}', parseInt(this.value))">
            <button class="qty-btn" onclick="updateQty('${item.key}', ${item.qty + 1})">+</button>
          </div>
        </div>
        <div class="cart-item-right">
          <div class="cart-item-total">${UH.formatPrice(itemTotal)}</div>
          <button class="cart-item-remove" onclick="removeItem('${item.key}')">
            <i class="fas fa-trash-alt"></i> Remove
          </button>
        </div>
      </div>
    `;
  }).join('');

  updateSummary();
  validateStock(cart);
}

async function validateStock(cart) {
  try {
    const items = cart.map(i => ({ product_id: i.id, qty: i.qty }));
    const data = await UH.api('/validate-stock', {
      method: 'POST',
      body: JSON.stringify({ items })
    });

    if (data.warnings?.length) {
      data.warnings.forEach(w => {
        const el = document.getElementById(`stock-${w.key}`) ||
          document.querySelector(`.cart-item[data-key*="${w.product_id}"] .stock-warning`);
        if (el) {
          el.style.display = 'block';
          if (w.available === 0) {
            el.innerHTML = '<i class="fas fa-exclamation-triangle"></i> Out of stock';
          } else {
            el.innerHTML = `<i class="fas fa-exclamation-triangle"></i> Only ${w.available} left in stock`;
          }
        }
      });
    }

    const checkoutBtn = document.querySelector('.cart-summary .btn-primary');
    if (checkoutBtn && data.warnings?.some(w => w.available === 0)) {
      checkoutBtn.style.opacity = '0.6';
      checkoutBtn.title = 'Some items are out of stock';
    }
  } catch (e) {
    // Stock validation endpoint may not exist yet
  }
}

function updateQty(key, qty) {
  if (qty < 1) return;
  UH.updateCartQty(key, qty);
  renderCart();
}

function removeItem(key) {
  UH.removeFromCart(key);
  renderCart();
  UH.showToast('Item removed from cart');
}

function updateSummary() {
  const subtotal = UH.getCartTotal();
  const shipping = subtotal >= 50000 ? 0 : 3000;
  const total = subtotal + shipping;

  document.getElementById('cartSubtotal').textContent = UH.formatPrice(subtotal);
  document.getElementById('cartShipping').textContent = shipping === 0 ? 'FREE' : UH.formatPrice(shipping);
  document.getElementById('cartTotal').textContent = UH.formatPrice(total);
}
