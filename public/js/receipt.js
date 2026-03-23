(function () {
  const params = new URLSearchParams(window.location.search);
  const orderNum = params.get('order');
  const token = (() => {
    try {
      return sessionStorage.getItem('uh_staff_token');
    } catch {
      return null;
    }
  })();

  function money(n) {
    return '₦' + Number(n || 0).toLocaleString('en-NG');
  }

  function esc(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const root = document.getElementById('receiptRoot');
    if (!orderNum) {
      root.innerHTML = '<p class="rec-err">Missing order number.</p>';
      return;
    }
    if (!token) {
      root.innerHTML =
        '<p class="rec-err">Sign in on <a href="/staff-access.html?return=' +
        encodeURIComponent(location.pathname + location.search) +
        '">Staff Access</a> first.</p>';
      return;
    }

    const res = await fetch('/api/staff/receipt-data?order_number=' + encodeURIComponent(orderNum), {
      headers: { Authorization: 'Bearer ' + token },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      root.innerHTML = '<p class="rec-err">' + esc(data.error || 'Could not load order') + '</p>';
      return;
    }

    const o = data.order;
    const items = Array.isArray(o.items) ? o.items : [];
    const store = data.storeName || 'URBAN HILT';
    const tag = data.storeTagline || '';

    root.innerHTML = `
      <div class="rec-inner">
        <div class="rec-brand">${esc(store)}</div>
        <div class="rec-tag">${esc(tag)}</div>
        <div class="rec-divider"></div>
        <div class="rec-row"><span>Receipt</span><span>${esc(o.order_number)}</span></div>
        <div class="rec-row"><span>Date</span><span>${o.created_at ? new Date(o.created_at).toLocaleString() : '—'}</span></div>
        <div class="rec-row"><span>Status</span><span>${esc(o.status)}</span></div>
        <div class="rec-divider"></div>
        <div class="rec-cust">
          <strong>Customer</strong><br>
          ${esc(o.customer_name)}<br>
          ${esc(o.customer_phone || '')}<br>
          ${esc(o.address || '')}
        </div>
        <div class="rec-divider"></div>
        <table class="rec-items">
          <thead><tr><th>Item</th><th class="r">Qty</th><th class="r">Total</th></tr></thead>
          <tbody>
            ${items
              .map(
                (i) => `
              <tr>
                <td>${esc(i.name)}${i.size ? ' · ' + esc(i.size) : ''}</td>
                <td class="r">${i.qty}</td>
                <td class="r">${money((i.price || 0) * (i.qty || 0))}</td>
              </tr>`
              )
              .join('')}
          </tbody>
        </table>
        <div class="rec-divider"></div>
        <div class="rec-row"><span>Subtotal</span><span>${money(o.subtotal)}</span></div>
        ${
          Number(o.discount_amount) > 0
            ? `<div class="rec-row"><span>Discount</span><span>−${money(o.discount_amount)}</span></div>`
            : ''
        }
        <div class="rec-row"><span>Shipping</span><span>${money(o.shipping)}</span></div>
        <div class="rec-row rec-total"><span>Total</span><span>${money(o.total)}</span></div>
        <div class="rec-row"><span>Payment</span><span>${esc(o.payment_method || '—')}</span></div>
        ${
          o.staff_checkout_name
            ? `<div class="rec-row"><span>Staff</span><span>${esc(o.staff_checkout_name)}</span></div>`
            : ''
        }
        ${
          Number(o.refunded_amount) > 0
            ? `<div class="rec-row" style="color:#b45309;"><span>Refunded</span><span>${money(o.refunded_amount)}</span></div>`
            : ''
        }
        <p class="rec-foot">Thank you for shopping with us.</p>
      </div>
      <button type="button" class="rec-print-btn no-print" id="recPrint"><i class="fas fa-print"></i> Print</button>
    `;

    document.getElementById('recPrint').addEventListener('click', () => window.print());
  });
})();
