/* URBAN HILT — In-store POS (staff token required) */
let posCart = [];
let posProductMap = {};

function requireStaff() {
  if (!UH.getStaffToken()) {
    window.location.href = '/staff-access.html?return=/pos.html';
    return false;
  }
  return true;
}

function posTotals() {
  const sub = posCart.reduce((s, i) => s + i.price * i.qty, 0);
  const ship = sub >= 50000 ? 0 : 3000;
  const total = sub + ship;
  document.getElementById('posSub').textContent = UH.formatPrice(sub);
  document.getElementById('posShip').textContent = ship ? UH.formatPrice(ship) : 'FREE';
  document.getElementById('posTotal').textContent = UH.formatPrice(total);
}

function renderPosCart() {
  const el = document.getElementById('posCartLines');
  if (!posCart.length) {
    el.innerHTML = '<p style="color:#666;font-size:0.85rem;">Add products from search</p>';
    posTotals();
    return;
  }
  el.innerHTML = posCart.map((i, idx) => `
    <div class="pos-cart-line">
      <span>${i.name} × ${i.qty}</span>
      <span>${UH.formatPrice(i.price * i.qty)}</span>
      <button type="button" data-idx="${idx}" aria-label="Remove"><i class="fas fa-times"></i></button>
    </div>
  `).join('');
  el.querySelectorAll('button[data-idx]').forEach(btn => {
    btn.addEventListener('click', () => {
      posCart.splice(parseInt(btn.dataset.idx, 10), 1);
      renderPosCart();
    });
  });
  posTotals();
}

function addPosLine(product) {
  const price = parseFloat(product.sale_price != null ? product.sale_price : product.price);
  const img = (product.images && product.images[0]) || '';
  const existing = posCart.find(c => c.id === product.id && !c.size && !c.color);
  if (existing) existing.qty += 1;
  else posCart.push({
    id: product.id,
    name: product.name,
    slug: product.slug,
    price,
    qty: 1,
    size: '',
    color: '',
    image: img,
  });
  renderPosCart();
  UH.showToast('Added', 'fa-plus');
}

document.addEventListener('DOMContentLoaded', async () => {
  if (!requireStaff()) return;
  let label = 'Signed in: ' + (sessionStorage.getItem('uh_staff_name') || 'Staff');
  try {
    const raw = sessionStorage.getItem('uh_staff_profile');
    if (raw) {
      const p = JSON.parse(raw);
      const bits = [p.name, p.job_title, p.staff_code].filter(Boolean);
      if (bits.length) label = bits.join(' · ');
    }
  } catch (e) { /* ignore */ }
  document.getElementById('posStaffLabel').textContent = label;

  try {
    const last = sessionStorage.getItem('uh_pos_last_order');
    const lr = document.getElementById('posLastReceipt');
    if (last && lr) {
      lr.href = '/receipt.html?order=' + encodeURIComponent(last);
      lr.style.display = '';
    }
  } catch (e) { /* ignore */ }

  let searchT;
  document.getElementById('posSearch').addEventListener('input', (e) => {
    clearTimeout(searchT);
    const q = e.target.value.trim();
    searchT = setTimeout(async () => {
      const box = document.getElementById('posResults');
      if (q.length < 2) {
        box.innerHTML = '';
        return;
      }
      const data = await UH.api('/products?search=' + encodeURIComponent(q) + '&limit=24');
      const products = data.products || [];
      posProductMap = {};
      products.forEach(p => { posProductMap[p.id] = p; });
      box.innerHTML = products.map(p => {
        const img = p.images?.[0] || '';
        const price = p.sale_price || p.price;
        return `
          <div class="pos-card" data-id="${p.id}">
            ${img ? `<img src="${img}" alt="" ${UH.productImageFallbackAttr()}>` : '<div style="height:140px;background:#222"></div>'}
            <div class="pos-card-body">
              <h4>${p.name}</h4>
              <div class="price">${UH.formatPrice(price)}</div>
              <div class="stock">Stock: ${p.stock ?? 0}</div>
            </div>
          </div>`;
      }).join('') || '<p style="color:#666">No products</p>';

      box.querySelectorAll('.pos-card').forEach(card => {
        card.addEventListener('click', () => {
          const p = posProductMap[parseInt(card.getAttribute('data-id'), 10)];
          if (!p) return;
          if ((p.stock ?? 0) < 1) {
            UH.showToast('Out of stock', 'fa-exclamation-circle');
            return;
          }
          addPosLine(p);
        });
      });
    }, 280);
  });

  document.getElementById('posVerifyPayBtn')?.addEventListener('click', async () => {
    if (!requireStaff()) return;
    const orderNum = document.getElementById('posConfirmOrderNum').value.trim();
    if (!orderNum) {
      UH.showToast('Enter order number', 'fa-exclamation-circle');
      return;
    }
    const res = await fetch('/api/orders/verify-payment', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + UH.getStaffToken(),
      },
      body: JSON.stringify({ order_number: orderNum }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      UH.showToast('Payment marked verified', 'fa-check');
    } else {
      UH.showToast(data.error || 'Failed', 'fa-exclamation-circle');
    }
  });

  document.getElementById('posConfirmOrderBtn')?.addEventListener('click', async () => {
    if (!requireStaff()) return;
    const orderNum = document.getElementById('posConfirmOrderNum').value.trim();
    if (!orderNum) {
      UH.showToast('Enter order number', 'fa-exclamation-circle');
      return;
    }
    const res = await fetch('/api/orders/confirm', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + UH.getStaffToken(),
      },
      body: JSON.stringify({ order_number: orderNum }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      UH.showToast('Sale approved: ' + (data.order_number || orderNum), 'fa-check');
      document.getElementById('posConfirmOrderNum').value = '';
    } else {
      UH.showToast(data.error || 'Could not approve', 'fa-exclamation-circle');
    }
  });

  document.getElementById('posPlaceOrder').addEventListener('click', async () => {
    if (!posCart.length) {
      UH.showToast('Cart is empty', 'fa-exclamation-circle');
      return;
    }
    const name = document.getElementById('posCustName').value.trim();
    const phone = document.getElementById('posCustPhone').value.trim();
    if (!name || !phone) {
      UH.showToast('Customer name and phone required', 'fa-exclamation-circle');
      return;
    }
    const sub = posCart.reduce((s, i) => s + i.price * i.qty, 0);
    const ship = sub >= 50000 ? 0 : 3000;
    const total = sub + ship;
    const orderData = {
      customer_name: name,
      customer_email: '',
      customer_phone: phone,
      address: 'In-store / POS',
      city: 'Lagos',
      state: 'Lagos',
      items: posCart,
      subtotal: sub,
      shipping: ship,
      total,
      payment_method: 'pay_on_delivery',
      notes: '[POS] ' + (document.getElementById('posNotes').value.trim() || ''),
    };
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + UH.getStaffToken(),
      },
      body: JSON.stringify(orderData),
    });
    const data = await res.json();
    if (data.order) {
      const onum = data.order.order_number;
      try {
        sessionStorage.setItem('uh_pos_last_order', onum);
      } catch (e) { /* ignore */ }
      UH.showToast('Order ' + onum, 'fa-check');
      const lr = document.getElementById('posLastReceipt');
      if (lr) {
        lr.href = '/receipt.html?order=' + encodeURIComponent(onum);
        lr.style.display = '';
      }
      posCart = [];
      renderPosCart();
      document.getElementById('posCustName').value = '';
      document.getElementById('posCustPhone').value = '';
      document.getElementById('posNotes').value = '';
    } else {
      UH.showToast(data.error || data.message || 'Failed', 'fa-exclamation-circle');
    }
  });

  renderPosCart();
});
