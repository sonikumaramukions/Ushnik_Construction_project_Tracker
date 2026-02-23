// ================================================================
// MAIN SERVER FILE (server.js)
// ================================================================
// PURPOSE: This is the ENTRY POINT of the entire backend.
// When you run "node server.js", this file starts everything:
//   1. Creates the Express web server (handles HTTP requests)
//   2. Sets up Socket.io (handles real-time live updates)
//   3. Connects all the routes (login, sheets, assignments, etc.)
//   4. Connects to the database
//   5. Starts listening for requests on port 5001
//
// ARCHITECTURE: Frontend (React, port 3000) → sends HTTP requests →
//               Backend (this server, port 5001) → talks to →
//               Database (SQLite file)
// ================================================================

const express = require('express');     // Web framework — handles HTTP requests (GET, POST, PUT, DELETE)
const cors = require('cors');           // Allows frontend (port 3000) to talk to backend (port 5001)
const helmet = require('helmet');       // Security headers — protects against common web attacks
const morgan = require('morgan');       // Request logger — shows each API call in the terminal
const http = require('http');           // Node.js built-in HTTP module
const socketIo = require('socket.io'); // Real-time communication (live updates without refreshing)
const rateLimit = require('express-rate-limit'); // Prevents spam/abuse by limiting requests per IP
require('dotenv').config();             // Loads settings from .env file (passwords, ports, etc.)

// ============================================================
// IMPORT DATABASE AND ROUTE FILES
// Each route file handles a specific FEATURE of the project
// ============================================================
const { sequelize, checkDbHealth, getDbStatus, checkpointWAL, recoverConnection, dbRetry } = require('./config/database');

// FEATURE: User login, registration, password management
const authRoutes = require('./routes/auth');

// FEATURE: Admin manages users (create, edit, deactivate users)
const userRoutes = require('./routes/users');

// FEATURE: Create and manage construction projects
const projectRoutes = require('./routes/projects');

// FEATURE: Excel-like spreadsheets (create, edit, push to roles)
const sheetRoutes = require('./routes/sheets');

// FEATURE: Individual cell data (save cell values, formulas)
const dataRoutes = require('./routes/data');

// FEATURE: Cell-level permissions (who can edit which cell)
const cellPermissionsRoutes = require('./routes/cellPermissions');

// FEATURE: Track which sheets are assigned to which users
const userSheetsRoutes = require('./routes/userSheets');

// FEATURE: Sheet-level permissions (role-based view/edit access)
const permissionsRoutes = require('./routes/permissions');

// FEATURE: Real-time collaboration on sheets
const collaborationRoutes = require('./routes/collaboration');

// FEATURE: Generate and view reports
const reportsRoutes = require('./routes/reports');

// FEATURE: Role-based dashboard data (admin, engineer, CEO dashboards)
const dashboardsRoutes = require('./routes/dashboards');

// FEATURE: Analytics and statistics
const analyticsRoutes = require('./routes/analytics');

// FEATURE: Spreadsheet formulas (SUM, AVERAGE, etc.)
const formulasRoutes = require('./routes/formulas');

// FEATURE: Define what each role (Head Officer, Site Engineer, etc.) can do
const rolePermissionsRoutes = require('./routes/rolePermissions');

// FEATURE: Multi-user sheet collaboration
const sheetCollaborationRoutes = require('./routes/sheetCollaboration');

// FEATURE: CEO-specific reports and views
const ceoReportsRoutes = require('./routes/ceoReports');

// FEATURE: Admin-only database viewer and management
const databaseViewerRoutes = require('./routes/database-viewer');

// FEATURE: Task assignments (Head Officer assigns rows/columns to engineers)
const assignmentsRoutes = require('./routes/assignments');
const financeRoutes = require('./routes/finance');

// FEATURE: Socket.io authentication (verify user identity for live connections)
const { authenticateSocket } = require('./middleware/socketAuth');

// Utility: Logging service — writes logs to files and console
const logger = require('./utils/logger');

// ============================================================
// CREATE THE SERVER
// ============================================================
const app = express();          // The Express app — handles all HTTP routes
const server = http.createServer(app); // Wrap Express in HTTP server (needed for Socket.io)

// ============================================================
// SERVER TIMEOUT SETTINGS
// ============================================================
// These prevent the "works for 2-3 min then dies" issue by keeping
// connections alive and setting reasonable timeouts
server.keepAliveTimeout = 65000;   // Keep connections open for 65 seconds
server.headersTimeout = 70000;     // Allow 70 seconds for headers
server.timeout = 120000;           // Maximum 2 minutes for any single request
server.maxHeadersCount = 100;      // Max number of HTTP headers allowed

// ============================================================
// SOCKET.IO SETUP — Real-time live updates
// ============================================================
// Socket.io creates a persistent connection between the browser and server.
// This allows INSTANT updates without the user having to refresh the page.
// Example: When Head Officer pushes a sheet, engineers see it immediately.
// Parse allowed origins from env (comma-separated) or default to localhost
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:3000')
  .split(',')
  .map(u => u.trim())
  .filter(Boolean);

const io = socketIo(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true
  },
  pingInterval: 25000,     // Check if client is alive every 25 seconds
  pingTimeout: 20000,      // If no response in 20s, disconnect them
  connectTimeout: 45000,   // Allow 45 seconds for initial connection
  maxHttpBufferSize: 1e6,  // Maximum message size: 1MB
  transports: ['websocket', 'polling'], // Try WebSocket first, fall back to HTTP polling
});

// ============================================================
// RATE LIMITING — Prevents abuse/spam
// ============================================================
// If someone (or a bot) sends too many requests, they get temporarily blocked.
// In development with React StrictMode, every component double-renders,
// so requests are naturally 2x higher. Set generous limits.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // Time window: 15 minutes
  max: process.env.RATE_LIMIT_MAX_REQUESTS ? parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) : 15000,
  message: { error: 'Too many requests from this IP, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting for health checks and auth routes (auth has its own limiter)
  skip: (req) => {
    const url = req.path || req.url || '';
    if (url === '/health' || url === '/api/health') return true;
    if (url.startsWith('/api/auth/')) return true;
    return false;
  },
});

// Stricter limit for login attempts (prevents brute-force password guessing)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200, // 200 login attempts per 15 minutes (generous for dev)
  message: { error: 'Too many login attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ============================================================
// CRASH PREVENTION — Keep server alive even if something goes wrong
// ============================================================
// Without these, a single unhandled error would kill the entire server.
// With these, the server logs the error but KEEPS RUNNING.
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception — server staying alive:', err.message || err);
  // Attempt DB recovery on connection-related exceptions
  if (err.message && (err.message.includes('ECONNRESET') || err.message.includes('EPIPE') || err.message.includes('connection'))) {
    recoverConnection(logger).catch(() => {});
  }
});
process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  logger.error('Unhandled Rejection — server staying alive:', msg);
  // Attempt DB recovery on connection-related rejections
  if (msg && (msg.includes('ECONNRESET') || msg.includes('Connection') || msg.includes('connection'))) {
    recoverConnection(logger).catch(() => {});
  }
});

// ============================================================
// MIDDLEWARE — Code that runs on EVERY request before it reaches a route
// ============================================================
// Think of middleware as security checkpoints at an airport:
// Every request passes through these in order before reaching its destination.

// Security headers — protects against XSS, clickjacking, etc.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

// CORS — allows the React frontend (port 3000) to talk to this backend (port 5001)
// Without this, the browser would block all requests (security feature called "Same-Origin Policy")
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Request logger — shows each API call in the terminal (e.g., "GET /api/sheets 200")
// Skip logging for health checks and static assets (they flood the logs and cause rotation noise)
app.use(morgan('short', { 
  stream: { write: message => logger.info(message.trim()) },
  skip: (req) => {
    const url = req.originalUrl || req.url || '';
    // Skip health check endpoints — they fire frequently and clutter logs
    if (url === '/health' || url === '/api/health') return true;
    // Skip favicon and static asset requests
    if (url.startsWith('/favicon') || url.startsWith('/static')) return true;
    return false;
  }
}));

// JSON body parser — allows the server to read JSON data sent by the frontend
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Apply rate limiting to API routes (auth routes are excluded, they have their own)
app.use(limiter);

// Apply auth rate limiting to all auth endpoints
app.use('/api/auth', authLimiter);

// ============================================================
// REQUEST TIMEOUT MIDDLEWARE — prevents "hanging" requests
// ============================================================
// ⚠️ CRITICAL FIX: If a database query takes too long (e.g., SQLite is busy),
// this ensures the request FAILS with an error message instead of hanging
// forever and blocking the server. This was a major cause of the "dies after
// 2-3 minutes" issue — requests would pile up waiting indefinitely.
app.use((req, res, next) => {
  // Set a 30-second timeout for each individual request
  req.setTimeout(30000, () => {
    if (!res.headersSent) {
      logger.warn(`Request timeout: ${req.method} ${req.originalUrl}`);
      res.status(408).json({ message: 'Request timed out. Please try again.' });
    }
  });
  next();
});

// ============================================================
// DB CONNECTION GUARD — pre-check DB health on data routes
// ============================================================
// If the DB is known to be unhealthy, return 503 immediately instead of
// letting the request hang waiting for a dead connection from the pool.
app.use('/api/data', (req, res, next) => {
  const status = getDbStatus();
  if (!status.healthy && status.consecutiveFailures >= 3) {
    logger.warn(`DB guard: blocking ${req.method} ${req.originalUrl} — DB unhealthy (${status.consecutiveFailures} failures)`);
    // Fire off a recovery attempt in the background
    recoverConnection(logger).catch(() => {});
    return res.status(503).json({
      message: 'Database is temporarily unavailable. Retrying connection...',
      retryable: true,
    });
  }
  next();
});

// Attach Socket.io instance to all requests
// This lets any route send real-time updates (e.g., "notify all engineers")
app.use((req, res, next) => {
  req.io = io;
  next();
});

// ============================================================
// API ROUTES — Each line connects a URL path to a route file
// ============================================================
// When the frontend calls "http://localhost:5001/api/auth/login",
// Express looks at these mappings and sends the request to the
// correct route file (in this case, routes/auth.js).
//
// FORMAT: app.use('/api/FEATURE_NAME', routeFile)
// ============================================================

app.use('/api/auth', authRoutes);                       // Login, register, password change
app.use('/api/users', userRoutes);                      // User management (admin)
app.use('/api/projects', projectRoutes);                // Construction projects CRUD
app.use('/api/sheets', sheetRoutes);                    // Spreadsheet management
app.use('/api/data', dataRoutes);                       // Cell data (save/load cell values)
app.use('/api', cellPermissionsRoutes);                 // Cell-level permissions
app.use('/api', userSheetsRoutes);                      // User-sheet assignments
app.use('/api/sheets', permissionsRoutes);              // Sheet-level role permissions
app.use('/api/sheets', collaborationRoutes);            // Sheet collaboration features
app.use('/api/reports', reportsRoutes);                 // Reports generation
app.use('/api/dashboards', dashboardsRoutes);           // Dashboard data for each role
app.use('/api/analytics', analyticsRoutes);             // Analytics and statistics
app.use('/api/formulas', formulasRoutes);               // Spreadsheet formulas (SUM, AVG, etc.)
app.use('/api/role-permissions', rolePermissionsRoutes); // Role permission definitions
app.use('/api/sheets', sheetCollaborationRoutes);       // Real-time sheet collaboration
app.use('/api/ceo-reports', ceoReportsRoutes);          // CEO-specific reports
app.use('/api/assignments', assignmentsRoutes);         // Task assignments (push to roles)
app.use('/api/admin/db', databaseViewerRoutes);          // Admin-only database viewer & manager
app.use('/api/finance', financeRoutes);                  // Financial tracking & records
app.use('/api/templates', require('./routes/templates')); // Sheet templates (save/load)

// ============================================================
// HEALTH CHECK — Lets you verify the server is alive
// ============================================================
// Visit http://localhost:5001/health in your browser to check.
// It tests BOTH the server AND the database connection.
// Returns "OK" if everything is working, "ERROR" if database is down.
const healthCheck = async (req, res) => {
  try {
    const dbHealthy = await checkDbHealth();
    const dbStatus = getDbStatus();
    const memUsage = process.memoryUsage();

    if (dbHealthy) {
      res.status(200).json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: Math.round(memUsage.rss / 1024 / 1024) + 'MB',
        heapUsed: Math.round(memUsage.heapUsed / 1024 / 1024) + 'MB',
        db: 'connected',
        dbStatus,
      });
    } else {
      // DB is down — attempt recovery before responding
      logger.warn('Health check: DB unhealthy, attempting recovery...');
      const recovered = await recoverConnection(logger);
      res.status(recovered ? 200 : 503).json({
        status: recovered ? 'RECOVERED' : 'ERROR',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: Math.round(memUsage.rss / 1024 / 1024) + 'MB',
        db: recovered ? 'reconnected' : 'disconnected',
        dbStatus: getDbStatus(),
      });
    }
  } catch (err) {
    logger.error('Health check error:', err.message);
    res.status(503).json({ status: 'ERROR', db: 'disconnected', error: err.message });
  }
};
app.get('/health', healthCheck);
app.get('/api/health', healthCheck);

// ============================================================
// SOCKET.IO EVENT HANDLERS — Real-time features
// ============================================================
// When a user connects via Socket.io, they get assigned to "rooms"
// based on their role and user ID. This lets us send targeted
// messages like "notify all Site Engineers" or "notify user #123".
io.use(authenticateSocket);

io.on('connection', (socket) => {
  logger.info(`User connected: ${socket.userId}`);

  // Put user in their role room and personal room
  // Example: "role_L1_ADMIN" room, "user_abc-123" room
  socket.join(`role_${socket.userRole}`);
  socket.join(`user_${socket.userId}`);

  // ---- SHEET UPDATE: When someone modifies a sheet ----
  // Broadcast to everyone viewing the same project
  socket.on('sheet_update', (data) => {
    try {
      socket.to(`project_${data.projectId}`).emit('sheet_updated', data);
    } catch (error) {
      logger.error('Error broadcasting sheet update:', error);
    }
  });

  // ---- CELL UPDATE: When someone types in a cell ----
  // Broadcast to everyone viewing the same sheet (real-time typing)
  socket.on('cell_update', (data) => {
    try {
      socket.to(`sheet_${data.sheetId}`).emit('cell_updated', data);
    } catch (error) {
      logger.error('Error broadcasting cell update:', error);
    }
  });

  // Also handle the cell-update event from the new socketService
  socket.on('cell-update', (data) => {
    try {
      socket.to(`sheet_${data.sheetId}`).emit('cell-updated', {
        ...data,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Error broadcasting cell-update:', error);
    }
  });

  // ---- ASSIGNMENT UPDATE: When admin assigns/unassigns rows/cols ----
  socket.on('assignment-update', (data) => {
    try {
      // Broadcast to all users in the affected roles
      if (data.targetRoles) {
        data.targetRoles.forEach(role => {
          io.to(`role_${role}`).emit('assignment-updated', {
            ...data,
            timestamp: new Date().toISOString(),
          });
        });
      }
      // Also broadcast to the sheet room
      socket.to(`sheet_${data.sheetId}`).emit('assignment-updated', {
        ...data,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('Error broadcasting assignment update:', error);
    }
  });

  // ---- FORMULA UPDATE: When a formula is added/changed ----
  socket.on('formula-update', (data) => {
    try {
      socket.to(`sheet_${data.sheetId}`).emit('formula-updated', {
        ...data,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error broadcasting formula update:', error);
    }
  });

  // ---- PERMISSION UPDATE: When cell permissions change ----
  socket.on('permission-update', (data) => {
    try {
      socket.to(`sheet_${data.sheetId}`).emit('permission-updated', {
        ...data,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error broadcasting permission update:', error);
    }
  });

  // ---- SHEET PUSH: Head Officer pushes sheet to engineers ----
  // Notifies all users in the target role rooms
  socket.on('sheet_pushed', (data) => {
    try {
      const { sheetId, targetRoles, pushedBy } = data;
      targetRoles.forEach(role => {
        io.to(`role_${role}`).emit('sheet_received', {
          sheetId,
          pushedBy,
          timestamp: new Date().toISOString()
        });
      });
    } catch (error) {
      logger.error('Error pushing sheet to roles:', error);
    }
  });

  // Also handle the event from new socketService
  socket.on('sheet-pushed', (data) => {
    try {
      const { sheetId, roles, userIds } = data;
      if (roles) {
        roles.forEach(role => {
          io.to(`role_${role}`).emit('sheet-pushed-notification', {
            sheetId,
            pushedBy: socket.userId,
            timestamp: new Date().toISOString()
          });
        });
      }
      if (userIds) {
        userIds.forEach(uid => {
          io.to(`user_${uid}`).emit('sheet-pushed-notification', {
            sheetId,
            pushedBy: socket.userId,
            timestamp: new Date().toISOString()
          });
        });
      }
    } catch (error) {
      logger.error('Error broadcasting sheet-pushed:', error);
    }
  });

  // ---- SHEET SYNC: Engineer syncs changes back to Head Officer ----
  socket.on('sheet_synced', (data) => {
    try {
      const { sheetId, syncedBy } = data;
      io.to('role_L1_ADMIN').emit('sheet_sync_received', {
        sheetId,
        syncedBy,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Error syncing sheet to admin:', error);
    }
  });

  // ---- ROOM MANAGEMENT: Join/leave project and sheet rooms ----
  // Users join a room when they open a sheet, leave when they close it
  socket.on('join_project', (projectId) => {
    socket.join(`project_${projectId}`);
  });

  socket.on('leave_project', (projectId) => {
    socket.leave(`project_${projectId}`);
  });

  socket.on('join-sheet', (data) => {
    const sheetId = data.sheetId || data;
    socket.join(`sheet_${sheetId}`);
  });

  socket.on('leave-sheet', (data) => {
    const sheetId = data.sheetId || data;
    socket.leave(`sheet_${sheetId}`);
  });

  socket.on('disconnect', () => {
    logger.info(`User disconnected: ${socket.userId}`);
  });

  socket.on('error', (error) => {
    logger.error(`Socket error for user ${socket.userId}:`, error);
  });
});

// ============================================================
// ERROR HANDLERS — Catch errors that routes don't handle
// ============================================================

// Global error handler — catches database errors and unexpected crashes
app.use((err, req, res, next) => {
  // Don't send duplicate responses
  if (res.headersSent) {
    return next(err);
  }

  // PostgreSQL connection errors — return 503 for retry
  if (err && (err.name === 'SequelizeDatabaseError' || err.name === 'SequelizeConnectionError' || err.name === 'SequelizeConnectionRefusedError')) {
    logger.warn(`DB error: ${err.name} — ${req.method} ${req.originalUrl} — returning 503`);
    recoverConnection(logger).catch(() => {});
    return res.status(503).json({
      message: 'Database error, please retry in a moment.',
      retryable: true,
    });
  }

  // ConnectionAcquireTimeoutError — all DB connections were in use
  if (err && err.name === 'SequelizeConnectionAcquireTimeoutError') {
    logger.warn(`DB pool exhausted: ${req.method} ${req.originalUrl} — triggering recovery`);
    // Fire-and-forget recovery attempt
    recoverConnection(logger).catch(() => {});
    return res.status(503).json({
      message: 'Server is processing many requests. Please try again.',
      retryable: true,
    });
  }

  // SequelizeConnectionError — connection dropped mid-query
  if (err && (err.name === 'SequelizeConnectionError' || err.name === 'SequelizeConnectionRefusedError')) {
    logger.warn(`DB connection error: ${req.method} ${req.originalUrl} — triggering recovery`);
    recoverConnection(logger).catch(() => {});
    return res.status(503).json({
      message: 'Database connection lost. Reconnecting...',
      retryable: true,
    });
  }

  // SequelizeTimeoutError — query took too long
  if (err && err.name === 'SequelizeTimeoutError') {
    logger.warn(`DB query timeout: ${req.method} ${req.originalUrl}`);
    return res.status(503).json({
      message: 'Database query timed out. Please try again.',
      retryable: true,
    });
  }

  // Generic server error — log it and return 500
  logger.error(err.stack || err.message || err);
  res.status(500).json({
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'production' ? {} : err.message
  });
});

// 404 handler — when someone requests a URL that doesn't exist
app.use((req, res) => {
  res.status(404).json({ message: 'Route not found' });
});

// ============================================================
// START THE SERVER
// ============================================================
// Vercel serverless: just export the app (no server.listen)
// Local dev / traditional hosting: authenticate DB and start listener
// ============================================================
const isVercel = process.env.VERCEL === '1' || process.env.VERCEL === 'true';
const PORT = process.env.PORT || 5001;

if (isVercel) {
  // ── VERCEL SERVERLESS MODE ──
  // Vercel handles HTTP routing. We just need to ensure DB syncs on cold start.
  // No server.listen(), no setInterval health checks (not supported in serverless).
  let dbInitialized = false;
  const initDb = async () => {
    if (dbInitialized) return;
    try {
      await sequelize.authenticate();
      await sequelize.sync({ alter: false });
      dbInitialized = true;
      logger.info('✅ Database connected (Vercel serverless)');
    } catch (err) {
      logger.error('❌ Database connection failed:', err.message);
    }
  };
  // Initialize on first request via middleware
  app.use(async (req, res, next) => {
    await initDb();
    next();
  });
} else {
  // ── TRADITIONAL SERVER MODE (local dev, VPS, Docker) ──
  sequelize.authenticate()
    .then(async () => {
      logger.info('✅ Database connection established successfully.');
      logger.info('🐘 Using PostgreSQL');

      return sequelize.sync({ alter: false });
    })
    .then(() => {
      server.listen(PORT, () => {
        logger.info(`🚀 Server running on port ${PORT}`);
        logger.info(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
        logger.info(`📊 Health check: http://localhost:${PORT}/health`);
      });

      // DATABASE HEALTH MONITOR — runs every 15 seconds
      let healthCheckCount = 0;
      setInterval(async () => {
        healthCheckCount++;
        try {
          const healthy = await checkDbHealth();

          if (!healthy) {
            logger.warn('⚠️ Database health check FAILED — attempting auto-recovery...');
            const recovered = await recoverConnection(logger);
            if (!recovered) {
              logger.error('❌ Database auto-recovery FAILED. Manual restart may be needed.');
            }
          }

          if (healthCheckCount % 20 === 0) {
            const status = getDbStatus();
            const mem = process.memoryUsage();
            const pool = sequelize.connectionManager?.pool;
            const poolInfo = pool ? `size=${pool.size || 'N/A'}, available=${pool.available || 'N/A'}, pending=${pool.pending || 'N/A'}` : 'N/A';
            logger.info(`📊 DB Status: healthy=${status.healthy}, dialect=${status.dialect}, failures=${status.consecutiveFailures}, pool=[${poolInfo}], memory=${Math.round(mem.rss / 1024 / 1024)}MB`);
          }
        } catch (err) {
          logger.error('Health monitor error:', err.message);
        }
      }, 15000);
    })
    .catch(err => {
      logger.error('❌ Unable to connect to the database:', err);
      process.exit(1);
    });
}

// ============================================================
// GRACEFUL SHUTDOWN — Clean up when server is stopped
// ============================================================
const gracefulShutdown = async (signal) => {
  logger.info(`${signal} received. Shutting down gracefully...`);
  server.close(async () => {
    logger.info('Server closed.');
    try {
      await sequelize.close();
      logger.info('Database connection closed.');
    } catch (err) {
      logger.error('Error during shutdown:', err.message);
    }
    process.exit(0);
  });

  setTimeout(() => {
    logger.error('Forced shutdown after 10s timeout.');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Export for Vercel serverless AND for testing
module.exports = app;
module.exports.app = app;
module.exports.io = io;