/* Staff hub — /staff-portal.html */
(function () {
  const API = '/api/staff';
  let permissions = null;

  function token() {
    try {
      return sessionStorage.getItem('uh_staff_token');
    } catch {
      return null;
    }
  }

  function authHeaders() {
    const t = token();
    return {
      'Content-Type': 'application/json',
      ...(t ? { Authorization: 'Bearer ' + t } : {}),
    };
  }

  async function api(path, opts = {}) {
    const res = await fetch(API + path, { ...opts, headers: { ...authHeaders(), ...opts.headers } });
    let data = {};
    try {
      data = await res.json();
    } catch {
      data = {};
    }
    return { res, data };
  }

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

  function statusLabel(st) {
    if (st === 'awaiting_staff') return 'Awaiting confirmation';
    return String(st || '').replace(/_/g, ' ');
  }

  function renderTable(orders, extraActions) {
    if (!orders || !orders.length) {
      return '<p class="sp-loading">No orders in this view.</p>';
    }
    return `
      <div class="sp-table-wrap">
        <table class="sp-table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Customer</th>
              <th>Total</th>
              <th>Payment</th>
              <th>Status</th>
              <th>Date</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${orders
              .map((o) => {
                const payOk = !!(
                  o.payment_verified_at ||
                  o.payment_method === 'pay_on_delivery' ||
                  o.payment_method === 'whatsapp' ||
                  (o.payment_ref && o.payment_method === 'paystack')
                );
                const payCell =
                  o.status === 'awaiting_staff'
                    ? payOk
                      ? '<span style="color:var(--sp-success);">OK</span>'
                      : '<span style="color:var(--sp-warn);">Verify</span>'
                    : esc(o.payment_method || '—');
                const staffNote =
                  o.staff_checkout_name || o.payment_verified_by_name
                    ? `<div style="font-size:0.65rem;color:var(--sp-muted);margin-top:4px;">${esc(o.staff_checkout_name || '')}${
                        o.payment_verified_by_name ? ' · verified: ' + esc(o.payment_verified_by_name) : ''
                      }</div>`
                    : '';
                return `
              <tr>
                <td><strong>${esc(o.order_number)}</strong>${staffNote}</td>
                <td>${esc(o.customer_name)}<br><small style="color:var(--sp-muted);">${esc(o.customer_phone || '')}</small></td>
                <td class="num">${money(o.total)}</td>
                <td>${payCell}</td>
                <td><span class="status-pill status-${esc(o.status)}">${esc(statusLabel(o.status))}</span></td>
                <td>${o.created_at ? new Date(o.created_at).toLocaleString() : '—'}</td>
                <td class="sp-actions">
                  <button type="button" data-receipt="${esc(o.order_number)}">Receipt</button>
                  ${extraActions ? extraActions(o) : ''}
                </td>
              </tr>`;
              })
              .join('')}
          </tbody>
        </table>
      </div>`;
  }

  let cancelId = null;
  let refundOrder = null;

  async function loadMe() {
    const { res, data } = await api('/me');
    if (!res.ok) {
      window.location.href = '/staff-access.html?return=' + encodeURIComponent('/staff-portal.html');
      return null;
    }
    permissions = data.permissions || {};
    document.getElementById('spUserLine').innerHTML =
      `<strong>${esc(data.name)}</strong> <span class="sp-badge ${data.role === 'supervisor' ? 'sup' : ''}">${esc(
        data.role || 'staff'
      )}</span>`;
    if (permissions.viewAllTransactions) {
      document.getElementById('spTabAll').style.display = '';
      document.getElementById('spTabReports').style.display = '';
    }
    return data;
  }

  async function loadAwaiting() {
    const el = document.getElementById('spAwaitingBody');
    el.innerHTML = '<p class="sp-loading">Loading…</p>';
    const { res, data } = await api('/awaiting-orders');
    if (!res.ok) {
      el.innerHTML = '<p class="sp-error">Could not load queue.</p>';
      return;
    }
    const orders = data.orders || [];
    el.innerHTML = renderTable(orders, (o) => {
      let btns = '';
      btns += `<button type="button" class="danger" data-cancel="${o.id}">Cancel</button>`;
      return btns;
    });
    bindReceiptButtons(el);
    el.querySelectorAll('[data-cancel]').forEach((btn) => {
      btn.addEventListener('click', () => openCancelModal(parseInt(btn.getAttribute('data-cancel'), 10)));
    });
  }

  async function loadTransactions(scope, status, targetId) {
    const el = document.getElementById(targetId);
    el.innerHTML = '<p class="sp-loading">Loading…</p>';
    let q = '?scope=' + encodeURIComponent(scope) + '&limit=100';
    if (status) q += '&status=' + encodeURIComponent(status);
    const { res, data } = await api('/transactions' + q);
    if (!res.ok) {
      el.innerHTML = '<p class="sp-error">Could not load transactions.</p>';
      return;
    }
    const orders = data.orders || [];
    el.innerHTML = renderTable(orders, (o) => {
      let btns = '';
      if (o.status === 'awaiting_staff') {
        btns += `<button type="button" class="danger" data-cancel="${o.id}">Cancel</button>`;
      }
      if (permissions.processRefunds && ['pending', 'processing', 'shipped', 'delivered'].includes(o.status)) {
        const left = Number(o.total) - Number(o.refunded_amount || 0);
        if (left > 0.01) btns += `<button type="button" data-refund="${o.id}" data-num="${esc(o.order_number)}" data-max="${left}">Refund</button>`;
      }
      return btns;
    });
    bindReceiptButtons(el);
    el.querySelectorAll('[data-cancel]').forEach((btn) => {
      btn.addEventListener('click', () => openCancelModal(parseInt(btn.getAttribute('data-cancel'), 10)));
    });
    el.querySelectorAll('[data-refund]').forEach((btn) => {
      btn.addEventListener('click', () =>
        openRefundModal(
          parseInt(btn.getAttribute('data-refund'), 10),
          btn.getAttribute('data-num'),
          parseFloat(btn.getAttribute('data-max'))
        )
      );
    });
  }

  function bindReceiptButtons(container) {
    container.querySelectorAll('[data-receipt]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const n = btn.getAttribute('data-receipt');
        window.open('/receipt.html?order=' + encodeURIComponent(n), '_blank', 'noopener');
      });
    });
  }

  function openCancelModal(orderId) {
    cancelId = orderId;
    document.getElementById('spCancelReason').value = '';
    document.getElementById('spCancelModal').classList.add('open');
  }

  function openRefundModal(id, orderNum, max) {
    refundOrder = { id, orderNum, max };
    document.getElementById('spRefundAmount').value = String(max);
    document.getElementById('spRefundReason').value = '';
    document.getElementById('spRefundFull').checked = true;
    document.getElementById('spRefundModalTitle').textContent = 'Refund ' + orderNum;
    document.getElementById('spRefundModal').classList.add('open');
  }

  async function submitCancel() {
    const reason = document.getElementById('spCancelReason').value.trim();
    if (!reason) return alert('Enter a reason');
    const { res, data } = await api('/orders/' + cancelId + '/cancel', {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
    if (!res.ok) {
      alert(data.error || 'Cancel failed');
      return;
    }
    document.getElementById('spCancelModal').classList.remove('open');
    refreshActivePanel();
  }

  async function submitRefund() {
    const reason = document.getElementById('spRefundReason').value.trim();
    const full = document.getElementById('spRefundFull').checked;
    const amount = parseFloat(document.getElementById('spRefundAmount').value);
    if (!reason) return alert('Enter a reason');
    if (!Number.isFinite(amount) || amount <= 0) return alert('Invalid amount');
    const { res, data } = await api('/orders/' + refundOrder.id + '/refund', {
      method: 'POST',
      body: JSON.stringify({ amount, reason, full }),
    });
    if (!res.ok) {
      alert(data.error || 'Refund failed');
      return;
    }
    document.getElementById('spRefundModal').classList.remove('open');
    refreshActivePanel();
    alert(data.message || 'Recorded');
  }

  function refreshActivePanel() {
    const tab = document.querySelector('.sp-tab.active');
    const id = tab ? tab.getAttribute('data-tab') : 'awaiting';
    if (id === 'awaiting') loadAwaiting();
    else if (id === 'mine') loadTransactions('mine', '', 'spMineBody');
    else if (id === 'all') loadTransactions('all', '', 'spAllBody');
    else if (id === 'closed') loadClosedPanels();
    else if (id === 'reports') loadReports();
  }

  async function loadReports() {
    const el = document.getElementById('spReportsBody');
    el.innerHTML = '<p class="sp-loading">Loading…</p>';
    const { res, data } = await api('/reports/sales-by-staff');
    if (!res.ok) {
      el.innerHTML = '<p class="sp-error">Could not load report.</p>';
      return;
    }
    const rows = data.byStaff || [];
    el.innerHTML =
      `<div class="report-grid">` +
      rows
        .map(
          (r) => `
      <div class="report-card">
        <h4>${esc(r.staff_name)}</h4>
        <div class="big">${money(r.revenue_total)}</div>
        <div style="font-size:0.8rem;color:var(--sp-muted);">${r.completed_orders} orders (90 days)</div>
      </div>`
        )
        .join('') +
      `</div>`;
  }

  function loadClosedPanels() {
    const a = document.getElementById('spClosedBody');
    const b = document.getElementById('spRefundedBody');
    a.innerHTML = '<p class="sp-loading">Loading cancelled…</p>';
    b.innerHTML = '<p class="sp-loading">Loading refunds…</p>';
    const scope = permissions.viewAllTransactions ? 'all' : 'mine';
    api('/transactions?scope=' + scope + '&status=cancelled&limit=100').then(({ res, data }) => {
      if (!res.ok) a.innerHTML = '<p class="sp-error">Failed</p>';
      else a.innerHTML = '<h4 style="margin:12px 0 8px;font-size:0.85rem;color:var(--sp-muted);">Cancelled</h4>' + renderTable(data.orders || [], () => '');
      bindReceiptButtons(a);
    });
    api('/transactions?scope=' + scope + '&status=refunded&limit=100').then(({ res, data }) => {
      if (!res.ok) b.innerHTML = '<p class="sp-error">Failed</p>';
      else b.innerHTML = '<h4 style="margin:12px 0 8px;font-size:0.85rem;color:var(--sp-muted);">Refunded</h4>' + renderTable(data.orders || [], () => '');
      bindReceiptButtons(b);
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    if (!token()) {
      window.location.href = '/staff-access.html?return=' + encodeURIComponent('/staff-portal.html');
      return;
    }
    const me = await loadMe();
    if (!me) return;

    document.getElementById('spLogout').addEventListener('click', () => {
      try {
        sessionStorage.removeItem('uh_staff_token');
        sessionStorage.removeItem('uh_staff_name');
        sessionStorage.removeItem('uh_staff_profile');
      } catch (e) { /* ignore */ }
      window.location.href = '/staff-access.html';
    });

    document.querySelectorAll('.sp-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.sp-tab').forEach((t) => t.classList.remove('active'));
        document.querySelectorAll('.sp-panel').forEach((p) => p.classList.remove('active'));
        tab.classList.add('active');
        const id = tab.getAttribute('data-tab');
        const panel = document.getElementById('spPanel-' + id);
        if (panel) panel.classList.add('active');
        if (id === 'awaiting') loadAwaiting();
        if (id === 'mine') loadTransactions('mine', '', 'spMineBody');
        if (id === 'all') loadTransactions('all', '', 'spAllBody');
        if (id === 'closed') loadClosedPanels();
        if (id === 'reports') loadReports();
      });
    });

    document.getElementById('spCancelClose').addEventListener('click', () => document.getElementById('spCancelModal').classList.remove('open'));
    document.getElementById('spCancelSubmit').addEventListener('click', submitCancel);
    document.getElementById('spRefundClose').addEventListener('click', () => document.getElementById('spRefundModal').classList.remove('open'));
    document.getElementById('spRefundSubmit').addEventListener('click', submitRefund);
    document.getElementById('spRefundFull').addEventListener('change', function () {
      document.getElementById('spRefundAmount').disabled = this.checked;
      if (this.checked && refundOrder) document.getElementById('spRefundAmount').value = String(refundOrder.max);
    });

    loadAwaiting();
  });
})();
