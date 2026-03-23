/**
 * Staff roles (set in Admin → Sales staff → Role).
 * - staff: POS, payment verify, confirm awaiting orders, own transactions, receipts
 * - supervisor: + all transactions, sales summaries, cancel confirmed orders (restock), refunds
 */
const VALID_ROLES = ['staff', 'supervisor'];

function normalizeStaffRole(raw) {
  const r = String(raw || 'staff').toLowerCase().trim();
  return VALID_ROLES.includes(r) ? r : 'staff';
}

function getStaffPermissions(role) {
  const r = normalizeStaffRole(role);
  if (r === 'supervisor') {
    return {
      role: r,
      pos: true,
      verifyPayment: true,
      confirmAwaiting: true,
      viewOwnTransactions: true,
      viewAllTransactions: true,
      printReceipt: true,
      cancelAwaiting: true,
      /** Cancel pending/processing (restores stock) */
      cancelConfirmedOrders: true,
      processRefunds: true,
      salesByStaffReports: true,
    };
  }
  return {
    role: r,
    pos: true,
    verifyPayment: true,
    confirmAwaiting: true,
    viewOwnTransactions: true,
    viewAllTransactions: false,
    printReceipt: true,
    cancelAwaiting: true,
    cancelConfirmedOrders: false,
    processRefunds: false,
    salesByStaffReports: false,
  };
}

module.exports = { normalizeStaffRole, getStaffPermissions, VALID_ROLES };
