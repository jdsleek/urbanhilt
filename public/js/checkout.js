/* ============================================
   URBAN HILT — Checkout JavaScript
   ============================================ */

let appliedDiscount = { code: null, amount: 0 };
let storeRequireStaff = false;
let customerSubmitFlow = false;

document.addEventListener('DOMContentLoaded', async () => {
  const cart = UH.getCart();
  if (!cart.length) {
    window.location.href = '/cart.html';
    return;
  }

  try {
    const cfg = await UH.api('/store-config');
    storeRequireStaff = !!cfg.requireStaffCheckout;
    customerSubmitFlow = !!cfg.customerSubmitStaffConfirms;
    if (cfg.paystackPublicKey) window.PAYSTACK_PUBLIC_KEY = cfg.paystackPublicKey;
    const tok = UH.getStaffToken();
    if (customerSubmitFlow) {
      document.getElementById('staffCheckoutAlert').style.display = 'flex';
    } else if (tok) {
      document.getElementById('staffSignedInBar').style.display = 'flex';
      document.getElementById('staffSignedName').textContent =
        sessionStorage.getItem('uh_staff_name') || 'Staff';
    }
  } catch (e) { /* ignore */ }

  document.getElementById('staffSignOutCheckout')?.addEventListener('click', () => {
    UH.staffLogout();
    window.location.href = '/staff-access.html?return=/checkout.html';
  });

  const urlCode = new URLSearchParams(location.search).get('promo');
  if (urlCode) document.getElementById('promoCode').value = urlCode;

  document.getElementById('applyPromoBtn')?.addEventListener('click', applyPromoCode);
  document.getElementById('copyOrderNumber')?.addEventListener('click', () => {
    const el = document.getElementById('orderNumber');
    if (el) UH.copyToClipboard(el.textContent.trim());
  });

  renderCheckoutSidebar();
  initPaymentOptions();
  initStepNavigation();
});

function renderCheckoutSidebar() {
  const cart = UH.getCart();
  const container = document.getElementById('checkoutItems');

  container.innerHTML = cart.map(item => {
    const imgHTML = item.image
      ? `<img src="${item.image}" alt="${item.name}">`
      : `<div style="width:60px;height:60px;background:#f5f5f5;border-radius:4px;display:flex;align-items:center;justify-content:center;color:#ccc;"><i class="fas fa-tshirt"></i></div>`;

    return `
      <div class="checkout-item">
        ${imgHTML}
        <div class="checkout-item-info">
          <h4>${item.name}</h4>
          <p>${[item.size, item.color].filter(Boolean).join(' / ')} × ${item.qty}</p>
        </div>
        <div class="checkout-item-price">${UH.formatPrice(item.price * item.qty)}</div>
      </div>
    `;
  }).join('');

  updateCheckoutTotals();
}

async function applyPromoCode() {
  const input = document.getElementById('promoCode');
  const msg = document.getElementById('promoMessage');
  const code = (input?.value || '').trim();
  if (!code) {
    msg.textContent = 'Enter a code';
    return;
  }
  const subtotal = UH.getCartTotal();
  const data = await UH.api(`/discounts/validate?code=${encodeURIComponent(code)}&subtotal=${subtotal}`);
  if (data.valid) {
    appliedDiscount = { code: data.code, amount: data.discount_amount };
    msg.textContent = data.description || 'Applied';
    msg.style.color = '#10b981';
    updateCheckoutTotals();
  } else {
    appliedDiscount = { code: null, amount: 0 };
    msg.textContent = data.error || 'Invalid code';
    msg.style.color = '#ef4444';
    updateCheckoutTotals();
  }
}

function updateCheckoutTotals() {
  const subtotal = UH.getCartTotal();
  const disc = Math.min(appliedDiscount.amount || 0, subtotal);
  const afterDisc = Math.max(0, subtotal - disc);
  const shipping = afterDisc >= 50000 ? 0 : 3000;
  const total = afterDisc + shipping;

  document.getElementById('checkoutSubtotal').textContent = UH.formatPrice(subtotal);
  const dr = document.getElementById('discountRow');
  if (disc > 0) {
    dr.style.display = 'flex';
    document.getElementById('checkoutDiscount').textContent =
      '− ₦' + Number(disc).toLocaleString('en-NG');
  } else {
    dr.style.display = 'none';
  }
  document.getElementById('checkoutShipping').textContent = shipping === 0 ? 'FREE' : UH.formatPrice(shipping);
  document.getElementById('checkoutTotal').textContent = UH.formatPrice(total);
}

function initPaymentOptions() {
  document.querySelectorAll('.payment-option').forEach(opt => {
    opt.addEventListener('click', () => {
      document.querySelectorAll('.payment-option').forEach(o => o.classList.remove('active'));
      opt.classList.add('active');
      const method = opt.querySelector('input').value;
      document.getElementById('bankDetails').style.display = method === 'bank_transfer' ? 'block' : 'none';
      const paystackInfo = document.getElementById('paystackInfo');
      if (paystackInfo) paystackInfo.style.display = method === 'paystack' ? 'block' : 'none';
    });
  });

  loadPaystackScript();
}

function loadPaystackScript() {
  if (document.getElementById('paystackScript')) return;
  const script = document.createElement('script');
  script.id = 'paystackScript';
  script.src = 'https://js.paystack.co/v1/inline.js';
  document.head.appendChild(script);
}

function initStepNavigation() {
  document.getElementById('toStep2')?.addEventListener('click', () => {
    const form = document.getElementById('checkoutForm');
    const name = document.getElementById('customerName').value.trim();
    const phone = document.getElementById('customerPhone').value.trim();
    const address = document.getElementById('customerAddress').value.trim();
    const city = document.getElementById('customerCity').value.trim();
    const state = document.getElementById('customerState').value.trim();

    if (!name || !phone || !address || !city || !state) {
      UH.showToast('Please fill in all required fields', 'fa-exclamation-circle');
      return;
    }

    showStep(2);
    renderReview();
  });

  document.getElementById('backToStep1')?.addEventListener('click', () => showStep(1));

  document.getElementById('placeOrder')?.addEventListener('click', async () => {
    const paymentMethod = document.querySelector('input[name="payment"]:checked').value;

    if (paymentMethod === 'whatsapp') {
      orderViaWhatsApp();
      return;
    }

    if (paymentMethod === 'paystack') {
      initiatePaystackPayment();
      return;
    }

    await placeOrderWithMethod(paymentMethod);
  });
}

function showStep(step) {
  document.querySelectorAll('.checkout-step').forEach(s => s.style.display = 'none');
  document.getElementById(`step${step}`).style.display = 'block';
  document.querySelectorAll('.checkout-steps .step').forEach(s => {
    const sNum = parseInt(s.dataset.step);
    s.classList.toggle('active', sNum === step);
    s.classList.toggle('completed', sNum < step);
  });
  const layout = document.querySelector('.checkout-layout');
  const sidebar = document.getElementById('checkoutSidebar');
  if (layout) layout.classList.toggle('checkout-layout--success', step === 3);
  if (sidebar) sidebar.style.display = step === 3 ? 'none' : '';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function placeOrderWithMethod(paymentMethod, paystackRef) {
  const cart = UH.getCart();
  const subtotal = UH.getCartTotal();
  const disc = Math.min(appliedDiscount.amount || 0, subtotal);
  const afterDisc = Math.max(0, subtotal - disc);
  const shipping = afterDisc >= 50000 ? 0 : 3000;
  const total = afterDisc + shipping;

  const orderData = {
    customer_name: document.getElementById('customerName').value.trim(),
    customer_email: document.getElementById('customerEmail').value.trim(),
    customer_phone: document.getElementById('customerPhone').value.trim(),
    address: document.getElementById('customerAddress').value.trim(),
    city: document.getElementById('customerCity').value.trim(),
    state: document.getElementById('customerState').value.trim(),
    items: cart,
    subtotal,
    shipping,
    total,
    payment_method: paymentMethod,
    notes: document.getElementById('orderNotes').value.trim(),
    discount_code: appliedDiscount.code || undefined,
  };

  if (paystackRef) {
    orderData.payment_ref = paystackRef;
  }

  try {
    const btn = document.getElementById('placeOrder');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderData),
    });
    let data = {};
    try {
      data = await res.json();
    } catch {
      data = { error: 'Invalid response from server' };
    }

    if (res.ok && data.order) {
      document.getElementById('orderNumber').textContent = data.order.order_number;
      const awaiting = data.order.awaiting_staff_confirmation;
      const titleEl = document.getElementById('orderSuccessTitle');
      const subEl = document.getElementById('orderSuccessSubtitle');
      const extraEl = document.getElementById('orderSuccessExtra');
      if (titleEl) titleEl.textContent = awaiting ? 'Order submitted!' : 'Order placed successfully!';
      if (subEl) {
        subEl.style.display = 'block';
        subEl.textContent = awaiting
          ? 'We received your order. A staff member will confirm it and then we’ll process payment / delivery as chosen.'
          : 'Thank you for shopping with Urban Hilt! We’ll process your order shortly.';
      }
      if (extraEl) {
        extraEl.style.display = awaiting ? 'block' : 'none';
        if (awaiting) {
          extraEl.innerHTML =
            '<p style="margin-top:12px;color:#666;font-size:0.95rem;">You can track status with your order number below. If you paid online, confirmation may take a short moment.</p>';
        }
      }
      localStorage.removeItem('uh_cart');
      UH.updateCartCount();
      showStep(3);
    } else {
      const msg =
        data.error ||
        (!res.ok ? `Order failed (HTTP ${res.status}). Check you’re on the live store and try again.` : 'Order failed. Please try again.');
      UH.showToast(msg, 'fa-exclamation-circle');
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit order';
    }
  } catch (e) {
    UH.showToast('Something went wrong. Please try again.', 'fa-exclamation-circle');
    const btn = document.getElementById('placeOrder');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit order'; }
  }
}

function initiatePaystackPayment() {
  const email = document.getElementById('customerEmail').value.trim();
  if (!email) {
    UH.showToast('Email is required for online payment', 'fa-exclamation-circle');
    return;
  }

  const subtotal = UH.getCartTotal();
  const disc = Math.min(appliedDiscount.amount || 0, subtotal);
  const afterDisc = Math.max(0, subtotal - disc);
  const shipping = afterDisc >= 50000 ? 0 : 3000;
  const total = afterDisc + shipping;

  if (typeof PaystackPop === 'undefined') {
    UH.showToast('Payment system loading. Please try again.', 'fa-exclamation-circle');
    loadPaystackScript();
    return;
  }

  const btn = document.getElementById('placeOrder');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Initiating payment...';

  const handler = PaystackPop.setup({
    key: window.PAYSTACK_PUBLIC_KEY || '',
    email: email,
    amount: total * 100,
    currency: 'NGN',
    ref: 'UH_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 8),
    metadata: {
      customer_name: document.getElementById('customerName').value.trim(),
      customer_phone: document.getElementById('customerPhone').value.trim(),
      cart_items: UH.getCart().length
    },
    callback: function(response) {
      placeOrderWithMethod('paystack', response.reference);
    },
    onClose: function() {
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-paper-plane"></i> Submit order';
      UH.showToast('Payment cancelled', 'fa-info-circle');
    }
  });

  handler.openIframe();
}

function renderReview() {
  const cart = UH.getCart();
  const reviewItems = document.getElementById('reviewItems');
  const reviewCustomer = document.getElementById('reviewCustomer');

  reviewItems.innerHTML = cart.map(item => `
    <div class="checkout-item">
      ${item.image ? `<img src="${item.image}" alt="${item.name}">` : ''}
      <div class="checkout-item-info">
        <h4>${item.name}</h4>
        <p>${[item.size, item.color].filter(Boolean).join(' / ')} × ${item.qty}</p>
      </div>
      <div class="checkout-item-price">${UH.formatPrice(item.price * item.qty)}</div>
    </div>
  `).join('');

  const paymentMethod = document.querySelector('input[name="payment"]:checked').value;
  const paymentLabels = { pay_on_delivery: 'Pay on Delivery', bank_transfer: 'Bank Transfer', whatsapp: 'WhatsApp Order', paystack: 'Pay Online (Card)' };

  reviewCustomer.innerHTML = `
    <h4>Delivery Information</h4>
    <p><strong>Name:</strong> ${document.getElementById('customerName').value}</p>
    <p><strong>Phone:</strong> ${document.getElementById('customerPhone').value}</p>
    <p><strong>Email:</strong> ${document.getElementById('customerEmail').value || 'N/A'}</p>
    <p><strong>Address:</strong> ${document.getElementById('customerAddress').value}</p>
    <p><strong>City:</strong> ${document.getElementById('customerCity').value}, ${document.getElementById('customerState').value}</p>
    <p><strong>Payment:</strong> ${paymentLabels[paymentMethod] || paymentMethod}</p>
    ${document.getElementById('orderNotes').value ? `<p><strong>Notes:</strong> ${document.getElementById('orderNotes').value}</p>` : ''}
  `;
}

function orderViaWhatsApp() {
  const cart = UH.getCart();
  const subtotal = UH.getCartTotal();
  const shipping = subtotal >= 50000 ? 0 : 3000;
  const total = subtotal + shipping;

  let msg = `🛍️ *NEW ORDER — URBAN HILT*\n\n`;
  msg += `*Customer:* ${document.getElementById('customerName').value}\n`;
  msg += `*Phone:* ${document.getElementById('customerPhone').value}\n`;
  msg += `*Address:* ${document.getElementById('customerAddress').value}, ${document.getElementById('customerCity').value}, ${document.getElementById('customerState').value}\n\n`;
  msg += `*Items:*\n`;
  cart.forEach(item => {
    const meta = [item.size, item.color].filter(Boolean).join(' / ');
    msg += `• ${item.name}${meta ? ` (${meta})` : ''} × ${item.qty} — ${UH.formatPrice(item.price * item.qty)}\n`;
  });
  msg += `\n*Subtotal:* ${UH.formatPrice(subtotal)}\n`;
  msg += `*Shipping:* ${shipping === 0 ? 'FREE' : UH.formatPrice(shipping)}\n`;
  msg += `*Total:* ${UH.formatPrice(total)}\n`;
  if (document.getElementById('orderNotes').value) {
    msg += `\n*Notes:* ${document.getElementById('orderNotes').value}\n`;
  }

  localStorage.removeItem('uh_cart');
  UH.updateCartCount();
  window.open(`https://wa.me/${UH.WHATSAPP}?text=${encodeURIComponent(msg)}`, '_blank');
  showStep(3);
  document.getElementById('orderNumber').textContent = 'WhatsApp Order';
}
