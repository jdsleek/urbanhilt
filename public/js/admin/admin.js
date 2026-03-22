/* ============================================
   URBAN HILT — Admin Dashboard JavaScript
   ============================================ */

const API_BASE = '/api/admin';
const PAGE_LABELS = {
  dashboard: 'Dashboard',
  products: 'Products',
  categories: 'Categories',
  orders: 'Orders',
  subscribers: 'Subscribers',
  'sales-staff': 'Sales staff',
  'discount-codes': 'Discount codes',
  'staff-logs': 'Staff access logs',
};
let token = localStorage.getItem('uh_admin_token');
let orderFilterStatus = '';
let currentEditProduct = null;
let existingProductImages = [];

function authHeaders() {
  return { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function apiCall(endpoint, options = {}) {
  const res = await fetch(API_BASE + endpoint, {
    headers: authHeaders(),
    ...options
  });
  if (res.status === 401) { logout(); return null; }
  let data = {};
  try {
    data = await res.json();
  } catch {
    data = { error: 'Invalid JSON from server' };
  }
  if (!res.ok) {
    data.apiError = true;
    data.httpStatus = res.status;
    console.warn('Admin API', endpoint, res.status, data);
  }
  return data;
}

document.addEventListener('DOMContentLoaded', () => {
  if (token) {
    showDashboard();
  } else {
    document.getElementById('loginScreen').style.display = 'flex';
  }

  document.getElementById('loginForm')?.addEventListener('submit', handleLogin);
  document.getElementById('logoutBtn')?.addEventListener('click', logout);

  // Navigation
  document.querySelectorAll('.sidebar-link').forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const page = link.dataset.page;
      document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      document.querySelectorAll('.admin-page').forEach(p => p.classList.remove('active'));
      document.getElementById(`page-${page}`).classList.add('active');
      document.getElementById('pageTitle').textContent = PAGE_LABELS[page] || (page.charAt(0).toUpperCase() + page.slice(1));
      closeSidebar();
      loadPageData(page);
    });
  });

  // Sidebar toggle (mobile)
  document.getElementById('sidebarToggle')?.addEventListener('click', toggleSidebar);
  document.getElementById('sidebarOverlay')?.addEventListener('click', closeSidebar);

  // Close sidebar on footer link clicks (View Store, Logout) on mobile
  document.querySelectorAll('.sidebar-footer a, .sidebar-footer button').forEach(el => {
    el.addEventListener('click', closeSidebar);
  });

  // Product modal
  document.getElementById('addProductBtn')?.addEventListener('click', () => openProductModal());
  document.getElementById('closeProductModal')?.addEventListener('click', closeProductModal);
  document.getElementById('cancelProduct')?.addEventListener('click', closeProductModal);
  document.getElementById('productForm')?.addEventListener('submit', handleSaveProduct);

  // Image upload
  const uploadArea = document.getElementById('imageUploadArea');
  const fileInput = document.getElementById('prodImages');
  uploadArea?.addEventListener('click', () => fileInput?.click());
  fileInput?.addEventListener('change', handleImagePreview);

  // Category modal
  document.getElementById('addCategoryBtn')?.addEventListener('click', () => openCategoryModal());
  document.getElementById('closeCategoryModal')?.addEventListener('click', closeCategoryModal);
  document.getElementById('cancelCategory')?.addEventListener('click', closeCategoryModal);
  document.getElementById('categoryForm')?.addEventListener('submit', handleSaveCategory);

  // Order modal
  document.getElementById('closeOrderModal')?.addEventListener('click', () => document.getElementById('orderModal').classList.remove('active'));
  document.getElementById('closeOrderBtn')?.addEventListener('click', () => document.getElementById('orderModal').classList.remove('active'));

  // Order filters
  document.querySelectorAll('.order-filters .btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.order-filters .btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      orderFilterStatus = btn.dataset.status || '';
      loadOrders(orderFilterStatus);
    });
  });

  // Sales staff & discounts
  document.getElementById('addStaffBtn')?.addEventListener('click', () => openStaffModal(null));
  document.getElementById('closeStaffModal')?.addEventListener('click', closeStaffModal);
  document.getElementById('cancelStaff')?.addEventListener('click', closeStaffModal);
  document.getElementById('staffForm')?.addEventListener('submit', handleSaveStaff);
  document.getElementById('addDiscountBtn')?.addEventListener('click', () => openDiscountModal(null));
  document.getElementById('closeDiscountModal')?.addEventListener('click', closeDiscountModal);
  document.getElementById('cancelDiscount')?.addEventListener('click', closeDiscountModal);
  document.getElementById('discountForm')?.addEventListener('submit', handleSaveDiscount);
});

async function handleLogin(e) {
  e.preventDefault();
  const errEl = document.getElementById('loginError');
  errEl.textContent = '';
  const username = document.getElementById('loginUsername').value.trim();
  const password = document.getElementById('loginPassword').value;

  try {
    const res = await fetch(API_BASE + '/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const text = await res.text();
    let data = {};
    try {
      data = text ? JSON.parse(text) : {};
    } catch {
      errEl.textContent = 'Server returned an invalid response. Check deployment & database.';
      return;
    }

    if (data.token) {
      token = data.token;
      localStorage.setItem('uh_admin_token', token);
      document.getElementById('adminName').textContent = data.admin.full_name || data.admin.username;
      showDashboard();
    } else {
      errEl.textContent = data.error || (res.status === 401 ? 'Invalid credentials' : `Request failed (${res.status})`);
    }
  } catch (err) {
    errEl.textContent = 'Connection error. Please try again.';
  }
}

function toggleSidebar() {
  document.getElementById('adminSidebar')?.classList.toggle('active');
  document.getElementById('sidebarOverlay')?.classList.toggle('active');
  document.body.classList.toggle('sidebar-open');
}

function closeSidebar() {
  document.getElementById('adminSidebar')?.classList.remove('active');
  document.getElementById('sidebarOverlay')?.classList.remove('active');
  document.body.classList.remove('sidebar-open');
}

function logout() {
  token = null;
  localStorage.removeItem('uh_admin_token');
  document.getElementById('adminLayout').style.display = 'none';
  document.getElementById('loginScreen').style.display = 'flex';
}

function showDashboard() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('adminLayout').style.display = 'flex';
  loadPageData('dashboard');
}

async function loadPageData(page) {
  switch (page) {
    case 'dashboard': await loadDashboard(); break;
    case 'products': await loadProducts(); break;
    case 'categories': await loadCategories(); break;
    case 'orders': await loadOrders(); break;
    case 'sales-staff': await loadSalesStaff(); break;
    case 'discount-codes': await loadDiscountCodes(); break;
    case 'staff-logs': await loadStaffLogs(); break;
    case 'subscribers': await loadSubscribers(); break;
  }
}

async function loadDashboard() {
  const data = await apiCall('/dashboard');
  if (!data) return;

  if (data.apiError) {
    document.getElementById('statProducts').textContent = '—';
    document.getElementById('statOrders').textContent = '—';
    document.getElementById('statRevenue').textContent = '—';
    document.getElementById('statPending').textContent = '—';
    const awaitEl = document.getElementById('statAwaitingStaff');
    if (awaitEl) awaitEl.textContent = '—';
    document.getElementById('recentOrdersTable').innerHTML =
      `<tr><td colspan="5" style="text-align:center;color:#c00;">Dashboard failed: ${escapeHtml(data.error || 'Error')} (HTTP ${data.httpStatus || '?'})</td></tr>`;
    return;
  }

  document.getElementById('statProducts').textContent = data.totalProducts;
  document.getElementById('statOrders').textContent = data.totalOrders;
  document.getElementById('statRevenue').textContent = '₦' + Number(data.totalRevenue).toLocaleString();
  document.getElementById('statPending').textContent = data.pendingOrders;
  const awaitEl = document.getElementById('statAwaitingStaff');
  if (awaitEl) awaitEl.textContent = data.awaitingStaffOrders ?? 0;
  const subEl = document.getElementById('statSubscribers');
  if (subEl) subEl.textContent = data.totalSubscribers || 0;

  // Render monthly revenue/orders bar chart
  if (data.monthlyOrders && data.monthlyOrders.length > 0) {
    const months = data.monthlyOrders.slice(-6);
    const maxRevenue = Math.max(...months.map(m => m.revenue || 0), 1);

    let chartHTML = `
      <div class="dashboard-chart" style="grid-column:1/-1;background:#fff;border-radius:12px;padding:24px;box-shadow:0 1px 3px rgba(0,0,0,0.08);margin-top:24px;">
        <h3 style="margin:0 0 20px;font-size:1.1rem;color:#333;">Monthly Revenue &amp; Orders</h3>
        <div style="display:flex;align-items:flex-end;gap:12px;height:200px;padding:0 8px;">
          ${months.map(m => {
            const pct = ((m.revenue || 0) / maxRevenue * 100).toFixed(1);
            const monthLabel = new Date(m.month + '-01').toLocaleString('default', { month: 'short' });
            return `
              <div style="flex:1;display:flex;flex-direction:column;align-items:center;height:100%;">
                <div style="flex:1;width:100%;display:flex;align-items:flex-end;">
                  <div style="width:100%;background:linear-gradient(to top,#c9a96e,#e8d5a3);border-radius:6px 6px 0 0;height:${pct}%;min-height:4px;position:relative;transition:height 0.3s;" title="₦${Number(m.revenue||0).toLocaleString()} / ${m.orders||0} orders">
                    <span style="position:absolute;top:-22px;left:50%;transform:translateX(-50%);font-size:0.65rem;color:#666;white-space:nowrap;">${m.orders||0} orders</span>
                  </div>
                </div>
                <span style="font-size:0.7rem;color:#999;margin-top:8px;">${monthLabel}</span>
                <span style="font-size:0.6rem;color:#aaa;">₦${Number((m.revenue||0)/1000).toFixed(0)}k</span>
              </div>`;
          }).join('')}
        </div>
      </div>`;

    const existingChart = document.querySelector('.dashboard-chart');
    if (existingChart) existingChart.remove();
    const grid = document.querySelector('.dashboard-grid');
    if (grid) {
      grid.insertAdjacentHTML('beforeend', chartHTML);
    }
  }

  const table = document.getElementById('recentOrdersTable');
  const recent = Array.isArray(data.recentOrders) ? data.recentOrders : [];
  table.innerHTML = recent.map(o => `
    <tr>
      <td><strong>${o.order_number}</strong></td>
      <td>${o.customer_name}</td>
      <td>₦${Number(o.total).toLocaleString()}</td>
      <td><span class="status-badge status-${o.status}">${o.status}</span></td>
      <td>${new Date(o.created_at).toLocaleDateString()}</td>
    </tr>
  `).join('') || '<tr><td colspan="5" style="text-align:center;color:#999;">No orders yet</td></tr>';
}

async function loadProducts() {
  const data = await apiCall('/products');
  if (!data) return;
  if (data.apiError) {
    document.getElementById('productsTable').innerHTML =
      `<tr><td colspan="7" style="text-align:center;color:#c00;">${escapeHtml(data.error || 'Error')}</td></tr>`;
    return;
  }

  const table = document.getElementById('productsTable');
  table.innerHTML = (data.products || []).map(p => {
    const img = p.images?.[0];
    return `
      <tr>
        <td>${img ? `<img src="${img}" alt="${p.name}">` : '<div style="width:50px;height:50px;background:#f5f5f5;border-radius:6px;display:flex;align-items:center;justify-content:center;color:#ccc;"><i class="fas fa-image"></i></div>'}</td>
        <td><strong>${p.name}</strong></td>
        <td>${p.category_name || '—'}</td>
        <td>${p.sale_price ? `<s style="color:#999;">₦${Number(p.price).toLocaleString()}</s> ₦${Number(p.sale_price).toLocaleString()}` : `₦${Number(p.price).toLocaleString()}`}</td>
        <td>${p.stock}</td>
        <td>${p.featured ? '<i class="fas fa-star" style="color:#c9a96e;"></i>' : '—'}</td>
        <td>
          <div class="action-btns">
            <button class="action-btn" onclick="editProduct(${p.id})" title="Edit"><i class="fas fa-edit"></i></button>
            <button class="action-btn delete" onclick="deleteProduct(${p.id})" title="Delete"><i class="fas fa-trash"></i></button>
          </div>
        </td>
      </tr>
    `;
  }).join('') || '<tr><td colspan="7" style="text-align:center;color:#999;">No products yet. Add your first product!</td></tr>';
}

async function loadCategories() {
  const data = await apiCall('/categories');
  if (!data) return;
  if (data.apiError) {
    document.getElementById('categoriesTable').innerHTML =
      `<tr><td colspan="4" style="text-align:center;color:#c00;">${escapeHtml(data.error || 'Error')}</td></tr>`;
    return;
  }

  const table = document.getElementById('categoriesTable');
  table.innerHTML = (data.categories || []).map(c => `
    <tr>
      <td><strong>${c.name}</strong></td>
      <td>${c.slug}</td>
      <td>—</td>
      <td>
        <div class="action-btns">
          <button class="action-btn" onclick='editCategory(${JSON.stringify(c)})' title="Edit"><i class="fas fa-edit"></i></button>
          <button class="action-btn delete" onclick="deleteCategory(${c.id})" title="Delete"><i class="fas fa-trash"></i></button>
        </div>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="4" style="text-align:center;color:#999;">No categories yet</td></tr>';
}

async function loadOrders(status = '') {
  const endpoint = status ? `/orders?status=${encodeURIComponent(status)}` : '/orders';
  const data = await apiCall(endpoint);
  if (!data) return;

  const table = document.getElementById('ordersTable');
  if (data.apiError) {
    table.innerHTML =
      `<tr><td colspan="8" style="text-align:center;color:#c00;padding:24px;">Could not load orders: ${escapeHtml(data.error || 'Error')} (HTTP ${data.httpStatus || '?'}). Check Railway logs and DATABASE_URL.</td></tr>`;
    return;
  }

  const orderRows = Array.isArray(data.orders) ? data.orders : [];
  table.innerHTML = orderRows.map(o => {
    const awaiting = o.status === 'awaiting_staff';
    const payOk = !!(o.payment_verified_at || (o.payment_ref && o.payment_method === 'paystack') ||
      o.payment_method === 'pay_on_delivery' || o.payment_method === 'whatsapp');
    const payTag = awaiting
      ? (payOk
        ? '<div style="font-size:0.7rem;color:#059669;margin-top:4px;">Payment OK to approve</div>'
        : '<div style="font-size:0.7rem;color:#b45309;margin-top:4px;">Verify payment first</div>')
      : '';
    const statusCell = awaiting
      ? `<span class="status-badge status-awaiting_staff">Awaiting staff</span>${payTag}`
      : `<select class="status-select" onchange="updateOrderStatus(${o.id}, this.value)" style="padding:4px 8px;border:1px solid #ddd;border-radius:4px;font-size:0.8rem;">
          <option value="pending" ${o.status === 'pending' ? 'selected' : ''}>Pending</option>
          <option value="processing" ${o.status === 'processing' ? 'selected' : ''}>Processing</option>
          <option value="shipped" ${o.status === 'shipped' ? 'selected' : ''}>Shipped</option>
          <option value="delivered" ${o.status === 'delivered' ? 'selected' : ''}>Delivered</option>
          <option value="cancelled" ${o.status === 'cancelled' ? 'selected' : ''}>Cancelled</option>
        </select>`;
    const verifyBtn = awaiting
      ? `<button type="button" class="action-btn" style="background:#f59e0b;color:#fff;" onclick="verifyOrderPaymentAdmin(${o.id})" title="Mark payment verified"><i class="fas fa-money-check"></i></button>`
      : '';
    const confirmBtn = awaiting
      ? `<button type="button" class="action-btn" style="background:#10b981;color:#fff;" onclick="confirmAwaitingOrder(${o.id})" title="Approve sale (admin — skips payment check)"><i class="fas fa-check"></i></button>`
      : '';
    return `
    <tr>
      <td><strong>${o.order_number}</strong></td>
      <td>${o.customer_name}</td>
      <td><a href="tel:${o.customer_phone}">${o.customer_phone}</a></td>
      <td>${o.items?.length || 0} item(s)</td>
      <td>₦${Number(o.total).toLocaleString()}</td>
      <td>${statusCell}</td>
      <td>${new Date(o.created_at).toLocaleDateString()}</td>
      <td>
        <div class="action-btns">
          ${verifyBtn}
          ${confirmBtn}
          <button class="action-btn" onclick='viewOrder(${JSON.stringify(o).replace(/'/g, "&#39;")})' title="View"><i class="fas fa-eye"></i></button>
          <button class="action-btn delete" onclick="deleteOrder(${o.id})" title="Delete"><i class="fas fa-trash"></i></button>
        </div>
      </td>
    </tr>`;
  }).join('') ||
    '<tr><td colspan="8" style="text-align:center;color:#999;">No orders in this view. Use filter <strong>All</strong> — paid-on-delivery orders are usually <strong>Pending</strong>, not "Awaiting staff".</td></tr>';
}

async function verifyOrderPaymentAdmin(id) {
  const res = await fetch(API_BASE + '/orders/' + id + '/verify-payment', {
    method: 'POST',
    headers: authHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert(data.error || 'Could not mark payment verified');
    return;
  }
  loadOrders(orderFilterStatus);
}

async function confirmAwaitingOrder(id) {
  if (!confirm('Approve this sale as admin? Stock will be deducted. (Payment rules are skipped — you are the override.)')) return;
  const res = await fetch(API_BASE + '/orders/' + id + '/confirm', {
    method: 'POST',
    headers: authHeaders(),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    alert(data.error || 'Could not confirm order');
    return;
  }
  loadOrders(orderFilterStatus);
}

async function loadSubscribers() {
  const data = await apiCall('/subscribers');
  if (!data) return;

  const table = document.getElementById('subscribersTable');
  table.innerHTML = data.subscribers?.map(s => `
    <tr>
      <td>${s.email}</td>
      <td>${new Date(s.subscribed_at).toLocaleDateString()}</td>
    </tr>
  `).join('') || '<tr><td colspan="2" style="text-align:center;color:#999;">No subscribers yet</td></tr>';
}

function toDatetimeLocal(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function loadSalesStaff() {
  const data = await apiCall('/sales-staff');
  if (!data) return;
  const table = document.getElementById('salesStaffTable');
  table.innerHTML = data.staff?.map(s => `
    <tr>
      <td><code style="font-size:0.75rem;">${escapeHtml(s.staff_code || '—')}</code></td>
      <td><strong>${escapeHtml(s.name)}</strong></td>
      <td>${escapeHtml(s.job_title || '—')}</td>
      <td>${s.phone ? `<a href="tel:${escapeHtml(s.phone)}">${escapeHtml(s.phone)}</a>` : '—'}</td>
      <td>${s.email ? escapeHtml(s.email) : '—'}</td>
      <td>${s.active ? '<span class="status-badge status-delivered">Yes</span>' : '<span class="status-badge status-cancelled">No</span>'}</td>
      <td>${new Date(s.created_at).toLocaleDateString()}</td>
      <td>
        <div class="action-btns">
          <button type="button" class="action-btn" onclick="editSalesStaff(${s.id})" title="Edit"><i class="fas fa-edit"></i></button>
          <button type="button" class="action-btn delete" onclick="deactivateSalesStaff(${s.id})" title="Deactivate"><i class="fas fa-user-slash"></i></button>
        </div>
      </td>
    </tr>
  `).join('') || '<tr><td colspan="8" style="text-align:center;color:#999;">No staff yet</td></tr>';
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
}

async function editSalesStaff(id) {
  const data = await apiCall('/sales-staff');
  const s = data?.staff?.find(x => x.id === id);
  if (s) openStaffModal(s);
}

function openStaffModal(staff) {
  const modal = document.getElementById('staffModal');
  document.getElementById('staffModalTitle').textContent = staff ? 'Edit sales staff profile' : 'Add sales staff';
  document.getElementById('staffId').value = staff?.id || '';
  document.getElementById('staffName').value = staff?.name || '';
  document.getElementById('staffCode').value = staff?.staff_code || '';
  document.getElementById('staffJobTitle').value = staff?.job_title || '';
  document.getElementById('staffPhone').value = staff?.phone || '';
  document.getElementById('staffEmail').value = staff?.email || '';
  document.getElementById('staffPhotoUrl').value = staff?.photo_url || '';
  document.getElementById('staffPin').value = '';
  document.getElementById('staffPin').required = !staff;
  document.getElementById('staffPinLabel').textContent = staff ? 'New PIN (optional)' : 'PIN (min 4 digits) *';
  document.getElementById('staffPinHint').style.display = staff ? 'block' : 'none';
  document.getElementById('staffActiveWrap').style.display = staff ? 'block' : 'none';
  document.getElementById('staffActive').checked = staff ? !!staff.active : true;
  modal.classList.add('active');
}

function closeStaffModal() {
  document.getElementById('staffModal')?.classList.remove('active');
}

async function handleSaveStaff(e) {
  e.preventDefault();
  const id = document.getElementById('staffId').value;
  const name = document.getElementById('staffName').value.trim();
  const pin = document.getElementById('staffPin').value.trim();
  const active = document.getElementById('staffActive').checked;
  const profile = {
    job_title: document.getElementById('staffJobTitle').value.trim(),
    phone: document.getElementById('staffPhone').value.trim(),
    email: document.getElementById('staffEmail').value.trim(),
    photo_url: document.getElementById('staffPhotoUrl').value.trim(),
    staff_code: document.getElementById('staffCode').value.trim(),
  };

  if (!id && (!pin || pin.length < 4)) {
    alert('PIN must be at least 4 characters.');
    return;
  }

  if (!id) {
    const res = await fetch(API_BASE + '/sales-staff', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({ name, pin, ...profile }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Failed to add staff');
      return;
    }
  } else {
    const body = { name, active, ...profile };
    if (pin.length >= 4) body.pin = pin;
    const res = await fetch(API_BASE + '/sales-staff/' + id, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Failed to update');
      return;
    }
  }
  closeStaffModal();
  loadSalesStaff();
}

async function deactivateSalesStaff(id) {
  if (!confirm('Deactivate this staff member? They will no longer be able to sign in.')) return;
  await apiCall('/sales-staff/' + id, { method: 'DELETE' });
  loadSalesStaff();
}

async function loadDiscountCodes() {
  const data = await apiCall('/discount-codes');
  if (!data) return;
  const table = document.getElementById('discountCodesTable');
  table.innerHTML = data.discounts?.map(d => {
    const val = d.discount_type === 'fixed'
      ? `₦${Number(d.value).toLocaleString()}`
      : `${d.value}%`;
    const uses = d.max_uses != null ? `${d.uses_count || 0} / ${d.max_uses}` : `${d.uses_count || 0}`;
    return `
    <tr>
      <td><strong>${escapeHtml(d.code)}</strong></td>
      <td>${d.discount_type}</td>
      <td>${val}</td>
      <td>₦${Number(d.min_subtotal || 0).toLocaleString()}</td>
      <td>${uses}</td>
      <td>${d.active ? 'Yes' : 'No'}</td>
      <td>
        <div class="action-btns">
          <button type="button" class="action-btn" onclick="editDiscountCode(${d.id})" title="Edit"><i class="fas fa-edit"></i></button>
          <button type="button" class="action-btn delete" onclick="deleteDiscountCode(${d.id})" title="Delete"><i class="fas fa-trash"></i></button>
        </div>
      </td>
    </tr>`;
  }).join('') || '<tr><td colspan="7" style="text-align:center;color:#999;">No discount codes</td></tr>';
}

async function editDiscountCode(id) {
  const data = await apiCall('/discount-codes');
  const d = data?.discounts?.find(x => x.id === id);
  if (d) openDiscountModal(d);
}

function openDiscountModal(d) {
  const modal = document.getElementById('discountModal');
  document.getElementById('discountModalTitle').textContent = d ? 'Edit discount code' : 'Add discount code';
  document.getElementById('discountId').value = d?.id || '';
  const codeInput = document.getElementById('discCode');
  codeInput.value = d?.code || '';
  codeInput.readOnly = !!d;
  document.getElementById('discDesc').value = d?.description || '';
  document.getElementById('discType').value = d?.discount_type === 'fixed' ? 'fixed' : 'percent';
  document.getElementById('discValue').value = d?.value ?? '';
  document.getElementById('discMin').value = d?.min_subtotal ?? 0;
  document.getElementById('discMaxUses').value = d?.max_uses ?? '';
  document.getElementById('discValidFrom').value = toDatetimeLocal(d?.valid_from);
  document.getElementById('discValidUntil').value = toDatetimeLocal(d?.valid_until);
  document.getElementById('discActive').checked = d ? !!d.active : true;
  modal.classList.add('active');
}

function closeDiscountModal() {
  document.getElementById('discountModal')?.classList.remove('active');
}

function discPayloadFromForm() {
  const vf = document.getElementById('discValidFrom').value;
  const vu = document.getElementById('discValidUntil').value;
  const maxUses = document.getElementById('discMaxUses').value;
  return {
    code: document.getElementById('discCode').value.trim().toUpperCase(),
    description: document.getElementById('discDesc').value.trim(),
    discount_type: document.getElementById('discType').value,
    value: parseFloat(document.getElementById('discValue').value),
    min_subtotal: parseFloat(document.getElementById('discMin').value) || 0,
    max_uses: maxUses === '' ? null : parseInt(maxUses, 10),
    valid_from: vf ? new Date(vf).toISOString() : null,
    valid_until: vu ? new Date(vu).toISOString() : null,
    active: document.getElementById('discActive').checked,
  };
}

async function handleSaveDiscount(e) {
  e.preventDefault();
  const id = document.getElementById('discountId').value;
  const payload = discPayloadFromForm();
  if (!payload.code || payload.value == null || Number.isNaN(payload.value)) {
    alert('Code and value are required.');
    return;
  }
  if (!id) {
    const res = await fetch(API_BASE + '/discount-codes', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Failed to create');
      return;
    }
  } else {
    const { code, ...rest } = payload;
    const res = await fetch(API_BASE + '/discount-codes/' + id, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(rest),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Failed to update');
      return;
    }
  }
  closeDiscountModal();
  loadDiscountCodes();
}

async function deleteDiscountCode(id) {
  if (!confirm('Delete this discount code?')) return;
  await apiCall('/discount-codes/' + id, { method: 'DELETE' });
  loadDiscountCodes();
}

async function loadStaffLogs() {
  const data = await apiCall('/staff-logs?limit=200');
  if (!data) return;
  const table = document.getElementById('staffLogsTable');
  table.innerHTML = data.logs?.map(l => `
    <tr>
      <td style="white-space:nowrap;font-size:0.8rem;">${new Date(l.created_at).toLocaleString()}</td>
      <td><code style="font-size:0.75rem;">${escapeHtml(l.event_type)}</code></td>
      <td>${escapeHtml(l.staff_name || '—')}</td>
      <td style="max-width:220px;word-break:break-word;font-size:0.85rem;">${escapeHtml(l.detail || '')}</td>
      <td style="font-size:0.75rem;color:#888;">${escapeHtml(l.ip || '')}</td>
    </tr>
  `).join('') || '<tr><td colspan="5" style="text-align:center;color:#999;">No log entries yet</td></tr>';
}

// Product CRUD
async function openProductModal(product = null) {
  currentEditProduct = product;
  existingProductImages = [];
  document.getElementById('productModalTitle').textContent = product ? 'Edit Product' : 'Add Product';
  document.getElementById('productId').value = product?.id || '';
  document.getElementById('prodName').value = product?.name || '';
  document.getElementById('prodDesc').value = product?.description || '';
  document.getElementById('prodPrice').value = product?.price || '';
  document.getElementById('prodSalePrice').value = product?.sale_price || '';
  document.getElementById('prodStock').value = product?.stock || 0;
  document.getElementById('prodSku').value = product?.sku || '';
  document.getElementById('prodFeatured').checked = product?.featured || false;
  document.getElementById('prodNewArrival').checked = product?.new_arrival || false;
  document.getElementById('prodBestSeller').checked = product?.best_seller || false;
  document.getElementById('prodSizes').value = product?.sizes?.join(', ') || '';
  document.getElementById('prodColors').value = product?.colors?.join(', ') || '';

  // Load categories into dropdown
  const catData = await apiCall('/categories');
  const catSelect = document.getElementById('prodCategory');
  catSelect.innerHTML = '<option value="">Select Category</option>' +
    (catData?.categories?.map(c => `<option value="${c.id}" ${product?.category_id == c.id ? 'selected' : ''}>${c.name}</option>`).join('') || '');

  // Show existing images
  const previews = document.getElementById('imagePreviews');
  if (product?.images?.length) {
    existingProductImages = [...product.images];
    previews.innerHTML = product.images.map((img, i) => `
      <div class="image-preview">
        <img src="${img}" alt="Product image">
        <button class="remove-img" type="button" onclick="removeExistingImage(${i})"><i class="fas fa-times"></i></button>
      </div>
    `).join('');
  } else {
    previews.innerHTML = '';
  }

  document.getElementById('prodImages').value = '';
  document.getElementById('productModal').classList.add('active');
}

function closeProductModal() {
  document.getElementById('productModal').classList.remove('active');
  currentEditProduct = null;
  existingProductImages = [];
}

function removeExistingImage(index) {
  existingProductImages.splice(index, 1);
  const previews = document.getElementById('imagePreviews');
  previews.querySelectorAll('.image-preview')[index]?.remove();
}

function handleImagePreview(e) {
  const previews = document.getElementById('imagePreviews');
  Array.from(e.target.files).forEach(file => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const div = document.createElement('div');
      div.className = 'image-preview';
      div.innerHTML = `<img src="${ev.target.result}" alt="Preview">`;
      previews.appendChild(div);
    };
    reader.readAsDataURL(file);
  });
}

async function handleSaveProduct(e) {
  e.preventDefault();
  const formData = new FormData();
  formData.append('name', document.getElementById('prodName').value);
  formData.append('description', document.getElementById('prodDesc').value);
  formData.append('price', document.getElementById('prodPrice').value);
  formData.append('sale_price', document.getElementById('prodSalePrice').value);
  formData.append('category_id', document.getElementById('prodCategory').value);
  formData.append('stock', document.getElementById('prodStock').value);
  formData.append('sku', document.getElementById('prodSku').value);
  formData.append('featured', document.getElementById('prodFeatured').checked ? '1' : '');
  formData.append('new_arrival', document.getElementById('prodNewArrival').checked ? '1' : '');
  formData.append('best_seller', document.getElementById('prodBestSeller').checked ? '1' : '');
  formData.append('sizes', document.getElementById('prodSizes').value);
  formData.append('colors', document.getElementById('prodColors').value);
  formData.append('existing_images', JSON.stringify(existingProductImages));

  const files = document.getElementById('prodImages').files;
  for (let i = 0; i < files.length; i++) {
    formData.append('images', files[i]);
  }

  const id = document.getElementById('productId').value;
  const method = id ? 'PUT' : 'POST';
  const endpoint = id ? `/products/${id}` : '/products';

  try {
    const res = await fetch(API_BASE + endpoint, {
      method,
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData
    });
    const data = await res.json();
    if (data.message) {
      closeProductModal();
      loadProducts();
    }
  } catch (err) {
    alert('Error saving product');
  }
}

async function editProduct(id) {
  const data = await apiCall('/products');
  const product = data?.products?.find(p => p.id === id);
  if (product) openProductModal(product);
}

async function deleteProduct(id) {
  if (!confirm('Are you sure you want to delete this product?')) return;
  await apiCall(`/products/${id}`, { method: 'DELETE' });
  loadProducts();
}

// Category CRUD
function openCategoryModal(category = null) {
  document.getElementById('categoryModalTitle').textContent = category ? 'Edit Category' : 'Add Category';
  document.getElementById('categoryId').value = category?.id || '';
  document.getElementById('catName').value = category?.name || '';
  document.getElementById('catDesc').value = category?.description || '';
  document.getElementById('catOrder').value = category?.display_order || 0;
  document.getElementById('categoryModal').classList.add('active');
}

function closeCategoryModal() {
  document.getElementById('categoryModal').classList.remove('active');
}

async function handleSaveCategory(e) {
  e.preventDefault();
  const id = document.getElementById('categoryId').value;
  const body = {
    name: document.getElementById('catName').value,
    description: document.getElementById('catDesc').value,
    display_order: parseInt(document.getElementById('catOrder').value) || 0
  };

  const endpoint = id ? `/categories/${id}` : '/categories';
  const method = id ? 'PUT' : 'POST';
  await apiCall(endpoint, { method, body: JSON.stringify(body) });
  closeCategoryModal();
  loadCategories();
}

function editCategory(cat) {
  openCategoryModal(cat);
}

async function deleteCategory(id) {
  if (!confirm('Are you sure? Products in this category will lose their category.')) return;
  await apiCall(`/categories/${id}`, { method: 'DELETE' });
  loadCategories();
}

// Orders
async function updateOrderStatus(id, status) {
  await apiCall(`/orders/${id}`, { method: 'PUT', body: JSON.stringify({ status }) });
  loadOrders(orderFilterStatus);
}

function viewOrder(order) {
  const modal = document.getElementById('orderModal');
  let items = order.items;
  if (typeof items === 'string') {
    try { items = JSON.parse(items); } catch { items = []; }
  }
  if (!Array.isArray(items)) items = [];
  const discLine = order.discount_code
    ? `<p><strong>Discount:</strong> ${escapeHtml(order.discount_code)} (−₦${Number(order.discount_amount || 0).toLocaleString()})</p>`
    : '';
  const staffLine = order.staff_id
    ? `<p><strong>Staff checkout:</strong> staff ID ${order.staff_id}</p>`
    : '';
  const payRef = order.payment_ref || order.payment_reference;
  const payRefLine = payRef ? `<p><strong>Payment ref:</strong> <code>${escapeHtml(String(payRef))}</code></p>` : '';
  let payVerifiedLine = '';
  if (order.payment_verified_at) {
    const src = order.payment_verified_by_staff_id ? `Staff #${order.payment_verified_by_staff_id}` : 'Admin';
    payVerifiedLine = `<p><strong>Payment verified:</strong> Yes (${src}) — ${new Date(order.payment_verified_at).toLocaleString()}</p>`;
  } else if (order.status === 'awaiting_staff') {
    payVerifiedLine = `<p><strong>Payment verified:</strong> <span style="color:#b45309;">Not marked yet</span> (staff should confirm with customer, or use Paystack ref / pay on delivery)</p>`;
  }

  document.getElementById('orderModalTitle').textContent = `Order ${order.order_number}`;
  const stLabel =
    order.status === 'awaiting_staff'
      ? 'Awaiting staff confirmation'
      : (order.status || '').replace(/_/g, ' ');
  document.getElementById('orderDetailContent').innerHTML = `
    <p style="margin-bottom:16px;"><strong>Status:</strong> <span class="status-badge status-${order.status}">${stLabel}</span></p>
    <div style="margin-bottom:20px;">
      <h4 style="margin-bottom:8px;">Customer Information</h4>
      <p><strong>Name:</strong> ${order.customer_name}</p>
      <p><strong>Phone:</strong> <a href="tel:${order.customer_phone}">${order.customer_phone}</a></p>
      <p><strong>Email:</strong> ${order.customer_email || 'N/A'}</p>
      <p><strong>Address:</strong> ${order.address}, ${order.city}, ${order.state}</p>
      <p><strong>Payment:</strong> ${order.payment_method}</p>
      ${payRefLine}
      ${payVerifiedLine}
      ${discLine}
      ${staffLine}
      ${order.notes ? `<p><strong>Notes:</strong> ${order.notes}</p>` : ''}
    </div>
    <div style="margin-bottom:20px;">
      <h4 style="margin-bottom:8px;">Items</h4>
      ${items.map(item => `
        <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #eee;">
          <span>${item.name} ${item.size ? `(${item.size})` : ''} × ${item.qty}</span>
          <strong>₦${Number(item.price * item.qty).toLocaleString()}</strong>
        </div>
      `).join('') || ''}
    </div>
    <div>
      <div style="display:flex;justify-content:space-between;padding:8px 0;"><span>Subtotal</span><span>₦${Number(order.subtotal).toLocaleString()}</span></div>
      ${order.discount_amount > 0 ? `<div style="display:flex;justify-content:space-between;padding:8px 0;color:#1a7f37;"><span>Discount</span><span>−₦${Number(order.discount_amount).toLocaleString()}</span></div>` : ''}
      <div style="display:flex;justify-content:space-between;padding:8px 0;"><span>Shipping</span><span>₦${Number(order.shipping).toLocaleString()}</span></div>
      <div style="display:flex;justify-content:space-between;padding:12px 0;border-top:2px solid #333;font-weight:700;font-size:1.1rem;"><span>Total</span><span>₦${Number(order.total).toLocaleString()}</span></div>
    </div>
    <div style="margin-top:16px;display:flex;flex-wrap:wrap;gap:8px;align-items:center;">
      <a href="https://wa.me/${order.customer_phone?.replace(/[^0-9]/g,'')}" target="_blank" style="display:inline-flex;align-items:center;gap:6px;padding:8px 16px;background:#25d366;color:#fff;border-radius:6px;font-size:0.85rem;">
        <i class="fab fa-whatsapp"></i> Message Customer on WhatsApp
      </a>
      ${order.status === 'awaiting_staff' && order.id ? `
        <button type="button" class="btn btn-outline" onclick="verifyOrderPaymentAdmin(${order.id}); document.getElementById('orderModal').classList.remove('active');">Mark payment verified</button>
        <button type="button" class="btn btn-primary" onclick="confirmAwaitingOrder(${order.id}); document.getElementById('orderModal').classList.remove('active');">Approve sale (admin)</button>
      ` : ''}
    </div>
  `;
  modal.classList.add('active');
}

async function deleteOrder(id) {
  if (!confirm('Are you sure you want to delete this order?')) return;
  await apiCall(`/orders/${id}`, { method: 'DELETE' });
  loadOrders(orderFilterStatus);
}
