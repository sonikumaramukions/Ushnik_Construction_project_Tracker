// ================================================================
// VALIDATION MIDDLEWARE (middleware/validation.js)
// ================================================================
// PURPOSE: Validates incoming request data BEFORE it reaches the route handler.
//
// WHY VALIDATE?
//   Users (or hackers) can send ANY data to your API.
//   Without validation, bad data could crash the server or corrupt the database.
//   Example: Someone sends a sheet name with 10,000 characters, or a negative budget.
//
// HOW IT WORKS:
//   1. We define SCHEMAS — rules for what valid data looks like
//   2. The validate() middleware checks req.body against the schema
//   3. If data is valid → continue to route handler
//   4. If data is invalid → return 400 error with helpful messages
//
// LIBRARY USED: Joi (https://joi.dev/) — the most popular validation library
//
// USED IN: routes/sheets.js, routes/data.js, routes/cellPermissions.js
// ================================================================

const Joi = require('joi');
const logger = require('../utils/logger');

// ============================================================
// VALIDATION SCHEMAS — Rules for each type of operation
// ============================================================
// Each schema defines what fields are required, their types,
// min/max lengths, and allowed values.
const schemas = {
    createSheet: Joi.object({
        name: Joi.string().min(3).max(255).required(),
        description: Joi.string().max(1000).optional().allow(''),
        projectId: Joi.string().uuid().required(),
        isTemplate: Joi.boolean().optional(),
        templateId: Joi.string().uuid().optional(),
        structure: Joi.object().optional(),
        permissions: Joi.object().optional(),
        validationRules: Joi.object().optional(),
    }),

    updateCell: Joi.object({
        sheetId: Joi.string().uuid().required(),
        cellId: Joi.string().required(),
        value: Joi.alternatives().try(Joi.string(), Joi.number(), Joi.boolean()).optional().allow(''),
        dataType: Joi.string().valid('TEXT', 'NUMBER', 'DATE', 'BOOLEAN', 'FILE', 'FORMULA').optional(),
    }),

    bulkUpdateCells: Joi.object({
        sheetId: Joi.string().uuid().required(),
        cells: Joi.array().items(
            Joi.object({
                cellId: Joi.string().required(),
                value: Joi.alternatives().try(Joi.string(), Joi.number(), Joi.boolean()).optional().allow(''),
                dataType: Joi.string().valid('TEXT', 'NUMBER', 'DATE', 'BOOLEAN', 'FILE', 'FORMULA').optional(),
            })
        ).min(1).required(),
    }),

    pushSheet: Joi.object({
        targetRoles: Joi.array().items(
            Joi.string().valid('L2_SENIOR_ENGINEER', 'L3_JUNIOR_ENGINEER', 'GROUND_MANAGER', 'PROJECT_MANAGER')
        ).optional(),
        userIds: Joi.array().items(Joi.string().uuid()).optional(),
    }).or('targetRoles', 'userIds'),

    generateReport: Joi.object({
        sheetId: Joi.string().uuid().required(),
        title: Joi.string().max(255).optional(),
        description: Joi.string().max(1000).optional(),
    }),

    setCellPermission: Joi.object({
        sheetId: Joi.string().uuid().required(),
        cellId: Joi.string().required(),
        permissions: Joi.object({
            canViewRoles: Joi.array().items(Joi.string()).optional(),
            canViewUsers: Joi.array().items(Joi.string().uuid()).optional(),
            canEditRoles: Joi.array().items(Joi.string()).optional(),
            canEditUsers: Joi.array().items(Joi.string().uuid()).optional(),
            isLocked: Joi.boolean().optional(),
            notes: Joi.string().max(500).optional(),
        }).required(),
    }),
};

// ============================================================
// validate — Middleware factory that checks request data against a schema
// ============================================================
// Usage: router.post('/create', validate('createSheet'), handler)
//
// PARAMETERS:
//   schemaName — Which schema to use (e.g., 'createSheet', 'updateCell')
//   source     — Where to find the data: 'body' (POST data), 'params' (URL), 'query' (URL params)
//
// If validation fails, returns 400 with a list of specific field errors.
// If validation passes, it SANITIZES the data (strips unknown fields) and continues.
const validate = (schemaName, source = 'body') => {
    return (req, res, next) => {
        const schema = schemas[schemaName];

        if (!schema) {
            logger.error(`Validation schema not found: ${schemaName}`);
            return res.status(500).json({ message: 'Validation configuration error' });
        }

        const data = req[source];
        const { error, value } = schema.validate(data, {
            abortEarly: false,
            stripUnknown: true,
        });

        if (error) {
            const errors = error.details.map(detail => ({
                field: detail.path.join('.'),
                message: detail.message,
            }));

            logger.warn(`Validation failed for ${schemaName}:`, errors);
            return res.status(400).json({
                message: 'Validation failed',
                errors,
            });
        }

        // Replace request data with validated and sanitized data
        req[source] = value;
        next();
    };
};

module.exports = {
    validate,
    schemas,
};
