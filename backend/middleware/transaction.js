// ================================================================
// TRANSACTION MIDDLEWARE (middleware/transaction.js)
// ================================================================
// PURPOSE: Wraps database operations in a TRANSACTION for safety.
//
// WHAT IS A DATABASE TRANSACTION?
//   Imagine you're transferring money: you debit Account A and credit Account B.
//   If the server crashes BETWEEN those two operations, money disappears!
//   A transaction says: "Either BOTH operations succeed, or NEITHER does."
//
// IN THIS PROJECT:
//   When saving a cell + recalculating formulas + updating version history,
//   ALL of those must succeed together. If any fails, everything rolls back.
//
// TWO TOOLS PROVIDED:
//   1. withTransaction  — Middleware: auto-commits on success, rolls back on error
//   2. executeInTransaction — Helper function: use in service code
//
// USED IN: routes/data.js, routes/sheets.js (cell save operations)
// ================================================================

const { sequelize } = require('../config/database');
const logger = require('../utils/logger');

// ============================================================
// withTransaction — Middleware that wraps the entire route in a transaction
// ============================================================
// HOW IT WORKS:
//   1. Starts a database transaction BEFORE the route handler runs
//   2. Attaches it to req.transaction — route handler uses it for all DB calls
//   3. If the route sends a successful response → auto-COMMIT
//   4. If the route throws an error → auto-ROLLBACK
//
// Usage: router.post('/save', authenticateToken, withTransaction, handler)
// Inside handler: await CellData.create({...}, { transaction: req.transaction })
const withTransaction = async (req, res, next) => {
    const transaction = await sequelize.transaction();
    req.transaction = transaction; // Attach to request so route handler can use it

    // Store original res.json and res.send
    const originalJson = res.json.bind(res);
    const originalSend = res.send.bind(res);

    // Flag to track if transaction has been handled
    let transactionHandled = false;

    // Override res.json to commit transaction on success
    res.json = async function (data) {
        if (!transactionHandled) {
            try {
                await transaction.commit();
                transactionHandled = true;
                logger.debug('Transaction committed successfully');
            } catch (error) {
                logger.error('Transaction commit error:', error);
                await transaction.rollback();
                transactionHandled = true;
                return res.status(500).json({ message: 'Transaction commit failed' });
            }
        }
        return originalJson(data);
    };

    // Override res.send to commit transaction on success
    res.send = async function (data) {
        if (!transactionHandled) {
            try {
                await transaction.commit();
                transactionHandled = true;
                logger.debug('Transaction committed successfully');
            } catch (error) {
                logger.error('Transaction commit error:', error);
                await transaction.rollback();
                transactionHandled = true;
                return res.status(500).send('Transaction commit failed');
            }
        }
        return originalSend(data);
    };

    // Handle errors and rollback
    const originalNext = next;
    next = async function (error) {
        if (error && !transactionHandled) {
            try {
                await transaction.rollback();
                transactionHandled = true;
                logger.debug('Transaction rolled back due to error');
            } catch (rollbackError) {
                logger.error('Transaction rollback error:', rollbackError);
            }
        }
        return originalNext(error);
    };

    next();
};

// ============================================================
// executeInTransaction — Helper for service code (not middleware)
// ============================================================
// USE THIS in service files when you need a transaction but aren't in a route.
// Example:
//   const result = await executeInTransaction(async (transaction) => {
//     await Model.create({...}, { transaction });
//     await OtherModel.update({...}, { transaction });
//     return 'done';
//   });
// If callback succeeds → commits. If it throws → rolls back.
const executeInTransaction = async (callback) => {
    const transaction = await sequelize.transaction();

    try {
        const result = await callback(transaction);
        await transaction.commit();
        return result;
    } catch (error) {
        await transaction.rollback();
        throw error;
    }
};

module.exports = {
    withTransaction,
    executeInTransaction,
};
