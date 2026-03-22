const jwt = require('jsonwebtoken');

const STAFF_JWT_SECRET = process.env.STAFF_JWT_SECRET || (process.env.JWT_SECRET || 'urbanhilt-luxury-2024-secret-key') + '-staff';

function signStaffToken(payload) {
  return jwt.sign({ type: 'staff', ...payload }, STAFF_JWT_SECRET, { expiresIn: '12h' });
}

function verifyStaffToken(token) {
  const decoded = jwt.verify(token, STAFF_JWT_SECRET);
  if (decoded.type !== 'staff') throw new Error('not staff');
  return decoded;
}

/** If a valid staff Bearer token is present, sets req.staff (does not reject). */
function optionalStaffAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) return next();
  try {
    const decoded = verifyStaffToken(authHeader.split(' ')[1]);
    if (decoded.type === 'staff') {
      req.staff = { id: decoded.id, name: decoded.name };
    }
  } catch {
    /* invalid token — treat as customer */
  }
  next();
}

/** Express middleware — requires Authorization: Bearer <staff JWT> */
function requireStaffCheckout(req, res, next) {
  if (process.env.REQUIRE_STAFF_CHECKOUT !== 'true') {
    return next();
  }
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'Staff checkout required',
      code: 'STAFF_REQUIRED',
      message: 'A sales rep must sign in before placing an order. Open Staff Access from the footer.',
    });
  }
  try {
    const decoded = verifyStaffToken(authHeader.split(' ')[1]);
    req.staff = { id: decoded.id, name: decoded.name };
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired staff session. Sign in again.', code: 'STAFF_INVALID' });
  }
}

module.exports = {
  signStaffToken,
  verifyStaffToken,
  requireStaffCheckout,
  optionalStaffAuth,
  STAFF_JWT_SECRET,
};
