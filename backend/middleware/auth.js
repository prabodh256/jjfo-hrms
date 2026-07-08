const jwt = require('jsonwebtoken');
const prisma = require('../prisma/client');
const { isSessionValid } = require('../lib/sessions');

const JWT_SECRET = process.env.JWT_SECRET;

// Fail fast: never run with a missing/weak signing key.
if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('FATAL ERROR: JWT_SECRET is missing or too short (min 32 chars). Set a strong value in backend/.env.');
  process.exit(1);
}

const authenticate = async (req, res, next) => {
  const token = req.cookies.token;
  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    // Session must still be active (logout / password change revoke jti).
    if (!(await isSessionValid(decoded.jti))) {
      res.clearCookie('token', cookieOpts());
      return res.status(401).json({ error: 'Session expired or revoked.' });
    }
    // Confirm the account still exists and refresh the role from the DB.
    const emp = await prisma.employee.findUnique({
      where: { id: decoded.id },
      select: { id: true, role: true, status: true }
    });
    if (!emp || emp.status === 'inactive') {
      res.clearCookie('token', cookieOpts());
      return res.status(401).json({ error: emp ? 'Account deactivated.' : 'Account no longer exists.' });
    }
    req.user = { id: emp.id, role: emp.role, jti: decoded.jti };
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid or expired token.' });
  }
};

const authorize = (roles = []) => {
  if (typeof roles === 'string') roles = [roles];
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden. Insufficient permissions.' });
    }
    next();
  };
};

// CSRF defense for cookie auth: require a custom header browsers will not
// attach on cross-site form/navigation requests.
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const requireCsrfHeader = (req, res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();
  if (req.get('X-Requested-With') !== 'XMLHttpRequest') {
    return res.status(403).json({ error: 'Missing CSRF header.' });
  }
  next();
};

function cookieOpts(maxAge = 24 * 60 * 60 * 1000) {
  const isProd = process.env.NODE_ENV === 'production';
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'strict' : 'lax',
    path: '/',
    maxAge
  };
}

module.exports = {
  authenticate,
  authorize,
  requireCsrfHeader,
  JWT_SECRET,
  cookieOpts
};
