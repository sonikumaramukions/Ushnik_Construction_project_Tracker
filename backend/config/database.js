// ================================================================
// DATABASE CONNECTION SETUP (config/database.js)
// ================================================================
// PURPOSE: Creates and manages the connection to PostgreSQL.
//
// PostgreSQL provides:
//   - True concurrent connections (no SQLITE_BUSY)
//   - Native JSONB support (fast JSON queries)
//   - Reliable connection pooling
//   - No WAL file bloat or locking issues
//   - Production-grade stability
// ================================================================

const { Sequelize } = require('sequelize');
require('dotenv').config();

// ================================================================
// DATABASE CONNECTION — supports both DATABASE_URL and individual vars
// ================================================================
// Cloud providers (Neon, Supabase, Railway, Render) provide a DATABASE_URL.
// For local dev, we fall back to individual DB_HOST/DB_NAME/DB_USER/DB_PASSWORD.
// ================================================================

let sequelize;

if (process.env.DATABASE_URL) {
  // Cloud PostgreSQL — use the connection string directly
  sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    logging: false,

    pool: {
      max: 10,           // Cloud DBs have lower connection limits
      min: 1,
      acquire: 60000,
      idle: 10000,
      evict: 5000,
      validate: (client) => {
        try {
          return client && client._connected !== false && !client._ending;
        } catch {
          return false;
        }
      },
    },

    define: {
      timestamps: true,
      underscored: true,
    },

    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false, // Required for most cloud PostgreSQL providers
      },
      keepAlive: true,
      keepAliveInitialDelayMillis: 10000,
      statement_timeout: 30000,
      idle_in_transaction_session_timeout: 60000,
      connectTimeout: 15000,
    },

    retry: {
      max: 5,
      backoffBase: 300,
      backoffExponent: 1.5,
    },

    hooks: {
      afterConnect: (connection) => {
        connection._connected = true;
      },
      beforeDisconnect: (connection) => {
        connection._connected = false;
      },
    },
  });
} else {
  // Local development — use individual environment variables
  sequelize = new Sequelize(
    process.env.DB_NAME || 'construction_tracker',
    process.env.DB_USER || 'construction',
    process.env.DB_PASSWORD || 'construction123',
    {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 5432,
      dialect: 'postgres',
      logging: false,

      pool: {
        max: 20,
        min: 2,
        acquire: 60000,
        idle: 10000,
        evict: 5000,
        validate: (client) => {
          try {
            return client && client._connected !== false && !client._ending;
          } catch {
            return false;
          }
        },
      },

      define: {
        timestamps: true,
        underscored: true,
      },

      dialectOptions: {
        keepAlive: true,
        keepAliveInitialDelayMillis: 5000,
        statement_timeout: 30000,
        idle_in_transaction_session_timeout: 60000,
        connectTimeout: 10000,
        tcp_keepalives_idle: 5,
        tcp_keepalives_interval: 5,
        tcp_keepalives_count: 3,
      },

      retry: {
        max: 5,
        backoffBase: 300,
        backoffExponent: 1.5,
      },

      hooks: {
        afterConnect: (connection) => {
          connection._connected = true;
        },
        beforeDisconnect: (connection) => {
          connection._connected = false;
        },
      },
    }
  );
}


// ================================================================
// DATABASE HEALTH MONITOR
// ================================================================

let isDbHealthy = true;
let lastHealthCheck = Date.now();
let consecutiveFailures = 0;

/**
 * Check if the database connection is alive.
 * Returns true/false without throwing.
 */
const checkDbHealth = async () => {
  try {
    // Use a lightweight query with a short timeout
    await sequelize.query('SELECT 1', {
      type: Sequelize.QueryTypes.SELECT,
      raw: true,
      plain: true,
    });
    isDbHealthy = true;
    consecutiveFailures = 0;
    lastHealthCheck = Date.now();
    return true;
  } catch (err) {
    consecutiveFailures++;
    isDbHealthy = false;
    lastHealthCheck = Date.now();
    console.error(`DB health check failed (attempt ${consecutiveFailures}):`, err.message);
    return false;
  }
};

/**
 * Get database health status
 */
const getDbStatus = () => ({
  healthy: isDbHealthy,
  lastCheck: new Date(lastHealthCheck).toISOString(),
  consecutiveFailures,
  dialect: 'postgres',
});

/**
 * WAL checkpoint — no-op for PostgreSQL (only needed for SQLite)
 */
const checkpointWAL = async () => true;

/**
 * Recover a broken database connection.
 */
const recoverConnection = async (logger) => {
  const log = logger || console;
  try {
    log.warn ? log.warn('Attempting database connection recovery...') : log.log('Attempting database connection recovery...');

    const pool = sequelize.connectionManager?.pool;
    if (pool) {
      try {
        await pool.drain();
        await pool.destroyAllNow();
      } catch {
        // Pool might already be broken
      }
    }

    await sequelize.authenticate();

    isDbHealthy = true;
    consecutiveFailures = 0;
    log.info ? log.info('✅ Database connection recovered successfully') : log.log('Database connection recovered');
    return true;
  } catch (err) {
    isDbHealthy = false;
    log.error ? log.error('❌ Database recovery failed:', err.message) : log.error('Database recovery failed:', err.message);
    return false;
  }
};

/**
 * Retry wrapper for database operations.
 * Wraps any async DB function with automatic retry on transient errors.
 *
 * Usage:
 *   const result = await dbRetry(() => User.findAll());
 *   const user = await dbRetry(() => User.findByPk(id), { retries: 5 });
 */
const dbRetry = async (fn, options = {}) => {
  const { retries = 3, baseDelay = 200, maxDelay = 5000 } = options;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const isRetryable =
        err.name === 'SequelizeConnectionAcquireTimeoutError' ||
        err.name === 'SequelizeConnectionError' ||
        err.name === 'SequelizeTimeoutError' ||
        err.name === 'SequelizeConnectionRefusedError';

      if (!isRetryable || attempt === retries) {
        throw err;
      }

      const delay = Math.min(baseDelay * Math.pow(2, attempt) + Math.random() * 100, maxDelay);
      await new Promise(resolve => setTimeout(resolve, delay));

      if (err.name === 'SequelizeConnectionAcquireTimeoutError' && attempt >= 1) {
        await recoverConnection();
      }
    }
  }
};


module.exports = {
  sequelize,
  checkDbHealth,
  getDbStatus,
  checkpointWAL,
  recoverConnection,
  dbRetry,
};