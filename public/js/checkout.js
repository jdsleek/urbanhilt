/* ============================================
   URBAN HILT — Checkout JavaScript
   ============================================ */

document.addEventListener('DOMContentLoaded', () => {
  const cart = UH.getCart();
  if (!cart.length) {
    window.location.href = '/cart.html';
    return;
  }

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

function updateCheckoutTotals() {
  const subtotal = UH.getCartTotal();
  const shipping = subtotal >= 50000 ? 0 : 3000;
  const total = subtotal + shipping;

  document.getElementById('checkoutSubtotal').textContent = UH.formatPrice(subtotal);
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
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

async function placeOrderWithMethod(paymentMethod, paystackRef) {
  const cart = UH.getCart();
  const subtotal = UH.getCartTotal();
  const shipping = subtotal >= 50000 ? 0 : 3000;

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
    total: subtotal + shipping,
    payment_method: paymentMethod,
    notes: document.getElementById('orderNotes').value.trim()
  };

  if (paystackRef) {
    orderData.payment_reference = paystackRef;
    orderData.payment_status = 'paid';
  }

  try {
    const btn = document.getElementById('placeOrder');
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';

    const data = await UH.api('/orders', {
      method: 'POST',
      body: JSON.stringify(orderData)
    });

    if (data.order) {
      document.getElementById('orderNumber').textContent = data.order.order_number;
      localStorage.removeItem('uh_cart');
      UH.updateCartCount();
      showStep(3);
    } else {
      UH.showToast(data.error || 'Order failed. Please try again.', 'fa-exclamation-circle');
      btn.disabled = false;
      btn.innerHTML = '<i class="fas fa-check"></i> Place Order';
    }
  } catch (e) {
    UH.showToast('Something went wrong. Please try again.', 'fa-exclamation-circle');
    const btn = document.getElementById('placeOrder');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Place Order'; }
  }
}

function initiatePaystackPayment() {
  const email = document.getElementById('customerEmail').value.trim();
  if (!email) {
    UH.showToast('Email is required for online payment', 'fa-exclamation-circle');
    return;
  }

  const subtotal = UH.getCartTotal();
  const shipping = subtotal >= 50000 ? 0 : 3000;
  const total = subtotal + shipping;

  if (typeof PaystackPop === 'undefined') {
    UH.showToast('Payment system loading. Please try again.', 'fa-exclamation-circle');
    loadPaystackScript();
    return;
  }

  const btn = document.getElementById('placeOrder');
  btn.disabled = true;
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Initiating payment...';

  const handler = PaystackPop.setup({
    key: window.PAYSTACK_PUBLIC_KEY || 'pk_test_xxxx',
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
      btn.innerHTML = '<i class="fas fa-check"></i> Place Order';
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
