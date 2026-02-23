// ================================================================
// AUDIT LOGGING MIDDLEWARE (middleware/audit.js)
// ================================================================
// PURPOSE: Records WHO did WHAT and WHEN in the system.
//
// WHAT IS AUDIT LOGGING?
//   Every time a user creates, updates, or deletes something,
//   we save a record to the audit_logs table in the database.
//   This is like a security camera for your application —
//   you can always go back and see what happened.
//
// WHERE IS IT USED?
//   Routes attach this middleware like:
//     router.post('/create', authenticateToken, auditLog('CREATE', 'sheet'), handler)
//   This automatically logs the action after the route finishes.
//
// TWO WAYS TO LOG:
//   1. auditLog(action, resource) — Middleware, auto-logs on route success
//   2. logUserAction(...)          — Manual function, call from anywhere
// ================================================================

const { AuditLog } = require('../models');
const logger = require('../utils/logger');

// ============================================================
// auditLog — Express middleware that auto-logs successful API calls
// ============================================================
// HOW IT WORKS:
//   1. When the route starts, we capture the request data (req.body)
//   2. We override res.json() to also capture the response data
//   3. When the response finishes (res 'finish' event), we save the audit log
//   4. We only log successful operations (HTTP 200-299)
//   5. Logging is "fire and forget" — if it fails, the API still works
//
// PARAMETERS:
//   action   — What happened: 'CREATE', 'UPDATE', 'DELETE', 'LOGIN', etc.
//   resource — What was affected: 'sheet', 'user', 'project', 'cell', etc.
const auditLog = (action, resource) => {
  return async (req, res, next) => {
    // Save the original res.json so we can call it later
    const originalJson = res.json.bind(res);
    let responseData = null;

    // Override res.json to capture what the route sends back
    res.json = function (data) {
      responseData = data;
      return originalJson(data);
    };

    // Save a copy of the request body (the data the user sent)
    const originalData = { ...req.body };

    // When the response is fully sent back to the client...
    res.on('finish', () => {
      // Only log successful operations (2xx status codes like 200, 201)
      if (res.statusCode >= 200 && res.statusCode < 300) {
        try {
          const auditData = {
            userId: req.user?.id,                    // WHO did it
            action,                                   // WHAT they did (CREATE, UPDATE, etc.)
            resource,                                 // WHAT type of thing (sheet, user, etc.)
            resourceId: req.params.id || responseData?.id || null, // WHICH specific item
            oldValues: req.method === 'PUT' || req.method === 'PATCH' ? req.originalData : null,
            newValues: req.method !== 'GET' && req.method !== 'DELETE' ? originalData : null,
            ipAddress: req.ip || req.connection?.remoteAddress,    // WHERE (IP address)
            userAgent: req.get('User-Agent'),                      // WHAT browser/app
            metadata: {
              method: req.method,              // HTTP method (GET, POST, PUT, DELETE)
              url: req.originalUrl,            // Full URL path
              statusCode: res.statusCode,      // HTTP response code (200, 201, etc.)
              timestamp: new Date().toISOString()
            }
          };

          // Fire and forget — if audit logging fails, the API still works fine
          // We NEVER want the app to crash just because we couldn't save a log
          AuditLog.create(auditData).catch(err => {
            logger.warn('Audit logging failed (non-critical):', err.message);
          });
        } catch (error) {
          logger.warn('Audit logging setup error (non-critical):', error.message);
        }
      }
    });

    next(); // Continue to the actual route handler
  };
};

// ============================================================
// logUserAction — Manual audit logger, call from anywhere in code
// ============================================================
// USE THIS when you need to log something that isn't a route,
// or when you need to log inside a service function.
//
// Example:
//   await logUserAction(userId, 'APPROVE', 'cell', cellId, oldValue, newValue);
const logUserAction = async (userId, action, resource, resourceId, oldValues = null, newValues = null, metadata = {}) => {
  try {
    await AuditLog.create({
      userId,
      action,
      resource,
      resourceId,
      oldValues,
      newValues,
      metadata: {
        ...metadata,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    logger.error('Manual audit logging failed:', error);
  }
};

module.exports = {
  auditLog,       // Middleware — attach to routes for automatic logging
  logUserAction,  // Function — call manually for custom audit entries
};