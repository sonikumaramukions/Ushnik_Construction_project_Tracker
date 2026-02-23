// ================================================================
// LOGGER UTILITY (utils/logger.js)
// ================================================================
// PURPOSE: Centralized logging for the entire application.
//
// Uses Winston library to write logs to:
//   1. Console (development only) — colorized, human-readable
//   2. logs/error.log — only ERROR-level messages (max 5MB, rotates)
//   3. logs/combined.log — ALL messages: info, warn, error (max 5MB, rotates)
//
// Usage throughout the app:
//   const logger = require('../utils/logger');
//   logger.info('Server started');
//   logger.warn('Connection slow');
//   logger.error('Database failed:', error);
//
// USED BY: Every file in the application
// ================================================================

const winston = require('winston');
const path = require('path');

// Create logs directory if it doesn't exist
const logDir = path.join(__dirname, '../logs');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss'
    }),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'construction-tracker' },
  transports: [
    // Write all logs with level `error` and below to `error.log`
    // 20MB max per file, keep 3 rotated files, tailable for smooth rotation
    new winston.transports.File({ 
      filename: path.join(logDir, 'error.log'), 
      level: 'error',
      maxsize: 20971520, // 20MB (was 5MB — caused frequent "unlinking" rotation noise)
      maxFiles: 3,
      tailable: true,    // Keeps the base filename always current (reduces unlink churn)
    }),
    // Write all logs with level `info` and below to `combined.log`
    // 20MB max per file, keep 3 rotated files
    new winston.transports.File({ 
      filename: path.join(logDir, 'combined.log'),
      maxsize: 20971520, // 20MB (was 5MB — caused frequent "unlinking" rotation noise)
      maxFiles: 3,
      tailable: true,    // Keeps the base filename always current (reduces unlink churn)
    }),
  ],
});

// If we're not in production then log to the `console` with the format:
// `${info.level}: ${info.message} JSON.stringify({ ...rest }) `
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

module.exports = logger;