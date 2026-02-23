// ================================================================
// AUTHENTICATION & AUTHORIZATION MIDDLEWARE (middleware/auth.js)
// ================================================================
// PURPOSE: This file protects ALL API routes from unauthorized access.
// It runs BEFORE every protected route and answers two questions:
//
//   1. AUTHENTICATION: "Are you who you say you are?"
//      → Checks the JWT token sent with each request
//
//   2. AUTHORIZATION: "Are you ALLOWED to do this?"
//      → Checks if your role (Head Officer, Site Engineer, etc.)
//        has permission for the requested action
//
// HOW IT WORKS:
//   Frontend sends: Authorization: Bearer <JWT_TOKEN>
//   This middleware decodes the token → finds the user → attaches to req.user
//   Then the route handler can use req.user to know WHO is making the request.
// ================================================================

const jwt = require('jsonwebtoken');    // Library to create/verify JWT tokens
const { User } = require('../models');  // User database model
const logger = require('../utils/logger');

// Secret key used to sign/verify tokens — in production, use a strong random string in .env
const JWT_SECRET = process.env.JWT_SECRET || 'construction-tracker-default-dev-secret-key-2024';

// ============================================================
// USER CACHE — Performance optimization
// ============================================================
// WITHOUT cache: Every single API call hits the database to find the user.
//   With 10 requests/second, that's 10 DB queries/second JUST for auth.
//   This overwhelms SQLite and causes the "dies after 2-3 min" problem.
//
// WITH cache: We remember users in memory for 1 minute.
//   Repeat requests skip the database entirely → much faster.
const userCache = new Map();  // userId → { user, cachedAt }
const USER_CACHE_TTL = 60 * 1000; // Cache lasts 1 minute (60,000 milliseconds)

// Get user from cache if fresh, otherwise query database
const getCachedUser = async (userId) => {
  const cached = userCache.get(userId);
  // If we have a cached version and it's less than 1 minute old, use it
  if (cached && (Date.now() - cached.cachedAt) < USER_CACHE_TTL) {
    return cached.user;
  }
  // Cache miss or expired — query database
  const user = await User.findByPk(userId);
  if (user) {
    userCache.set(userId, { user, cachedAt: Date.now() });
  } else {
    userCache.delete(userId);
  }
  return user;
};

// Clean up old cache entries every 5 minutes to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of userCache.entries()) {
    if (now - val.cachedAt > USER_CACHE_TTL * 5) {
      userCache.delete(key);
    }
  }
}, 5 * 60 * 1000);

// Invalidate a specific user's cache (called on login to ensure fresh data)
const invalidateUserCache = (userId) => {
  userCache.delete(userId);
};

// Clear entire user cache (useful for admin operations)
const clearUserCache = () => {
  userCache.clear();
};

// ============================================================
// authenticateToken — Verifies the JWT token on every request
// ============================================================
// This runs on EVERY protected route. Without a valid token, you get 401.
// Used like: router.get('/something', authenticateToken, handlerFunction)
const authenticateToken = async (req, res, next) => {
  // Extract token from the "Authorization: Bearer TOKEN" header
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Access token required' });
  }

  try {
    // Decode the token to get userId, email, role
    const decoded = jwt.verify(token, JWT_SECRET);

    // Look up the user (from cache or database)
    let user;
    try {
      user = await getCachedUser(decoded.userId);
    } catch (dbError) {
      // ⚠️ DATABASE ERROR — NOT an auth failure!
      // If the database has a transient error,
      // don't return 401 (which would log the user out).
      // Return 503 (Service Unavailable) so the frontend retries instead.
      logger.warn('Database error during auth lookup (returning 503, NOT 401):', dbError.message);
      return res.status(503).json({ message: 'Database temporarily busy, please retry' });
    }

    if (!user || !user.isActive) {
      return res.status(401).json({ message: 'User not found or inactive' });
    }

    // Attach user info to the request — all route handlers can now use req.user
    req.user = user;
    next(); // Continue to the next middleware or route handler
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ message: 'Token expired, please login again' });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ message: 'Invalid token' });
    }
    logger.error('Token verification failed:', error);
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};

// ============================================================
// authorizeRoles — Checks if the user's role is allowed
// ============================================================
// Used like: router.post('/admin-only', authenticateToken, authorizeRoles('L1_ADMIN'), handler)
// This ensures ONLY users with the specified roles can access the route.
const authorizeRoles = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Authentication required' });
    }

    // Check if the user's role is in the allowed list
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        message: 'Insufficient permissions for this action',
        requiredRoles: roles,
        userRole: req.user.role
      });
    }

    next();
  };
};

// ============================================================
// checkSheetAccess — Verifies user can access a specific sheet
// ============================================================
// Some sheets are private — only assigned users or specific roles can view them.
// This middleware checks:
//   1. Admin (L1_ADMIN) → always allowed
//   2. Role has canView permission on this sheet → allowed
//   3. User is explicitly assigned to this sheet (UserSheet record) → allowed
//   4. Otherwise → 403 Forbidden
const checkSheetAccess = async (req, res, next) => {
  try {
    const sheetId = req.params.sheetId || req.params.id || req.body.sheetId || req.body.id;
    const { Sheet, UserSheet } = require('../models');

    if (!sheetId) {
      return res.status(400).json({ message: 'Sheet id is required' });
    }

    const sheet = await Sheet.findByPk(sheetId, {
      include: ['project']
    });

    if (!sheet) {
      return res.status(404).json({ message: 'Sheet not found' });
    }

    // Admin always has access to everything
    const userRole = req.user.role;
    if (userRole === 'L1_ADMIN') {
      req.sheet = sheet;
      req.userPermissions = sheet.permissions && sheet.permissions[userRole] ? sheet.permissions[userRole] : {};
      return next();
    }

    // Check role-based permissions set on the sheet
    const permissions = (sheet.permissions && sheet.permissions[userRole]) || {};
    if (permissions.canView) {
      req.sheet = sheet;
      req.userPermissions = permissions;
      return next();
    }

    // Check if user is directly assigned to this sheet
    const userId = req.user.id;
    const userSheet = await UserSheet.findOne({ where: { sheetId: sheet.id, userId } });
    if (userSheet) {
      req.sheet = sheet;
      req.userPermissions = permissions;
      return next();
    }

    return res.status(403).json({ message: 'No permission to access this sheet' });
  } catch (error) {
    logger.error('Sheet access check failed:', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

module.exports = {
  authenticateToken,
  authorizeRoles,
  authorizeRole: authorizeRoles, // Alias for backward compatibility
  checkSheetAccess,
  invalidateUserCache,
  clearUserCache,
};