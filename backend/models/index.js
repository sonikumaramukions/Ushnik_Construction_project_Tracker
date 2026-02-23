// ================================================================
// MODEL INDEX — Central hub for all database models (models/index.js)
// ================================================================
// PURPOSE: Imports all database models and defines RELATIONSHIPS between them.
//
// WHAT ARE MODELS?
//   Each model represents a TABLE in the database.
//   User.js → 'users' table, Sheet.js → 'sheets' table, etc.
//
// WHAT ARE ASSOCIATIONS?
//   Associations define HOW tables relate to each other:
//   - User hasMany Sheet  = "One user can create many sheets"
//   - Sheet belongsTo User = "Each sheet was created by one user"
//   - Sheet hasMany CellData = "One sheet has many cells"
//
// WHY ONE INDEX FILE?
//   Sequelize needs all associations defined in one place AFTER
//   all models are loaded. This file is imported everywhere as:
//     const { User, Sheet, CellData } = require('../models');
// ================================================================

const User = require('./User');
const Project = require('./Project');
const Sheet = require('./Sheet');
const CellData = require('./CellData');
const AuditLog = require('./AuditLog');
const SheetAssignment = require('./SheetAssignment');
const CellPermission = require('./CellPermission');
const UserSheet = require('./UserSheet');
const Report = require('./Report');
const SheetVersion = require('./SheetVersion');
const Notification = require('./Notification');
const Feedback = require('./Feedback');
const FinancialRecord = require('./FinancialRecord');
const MarketData = require('./MarketData');

// ============================================================
// ASSOCIATIONS — Define how tables connect to each other
// ============================================================

// --- USER associations ---
// A user can create projects, sheets, cells, assignments, etc.
User.hasMany(Project, { foreignKey: 'createdById', as: 'createdProjects' });
User.hasMany(Sheet, { foreignKey: 'createdById', as: 'createdSheets' });
User.hasMany(Sheet, { foreignKey: 'lastModifiedById', as: 'modifiedSheets' });
User.hasMany(Sheet, { foreignKey: 'lockedById', as: 'lockedSheets' });
User.hasMany(CellData, { foreignKey: 'createdById', as: 'createdCells' });
User.hasMany(CellData, { foreignKey: 'lastModifiedById', as: 'modifiedCells' });
User.hasMany(CellData, { foreignKey: 'approvedById', as: 'approvedCells' });
User.hasMany(AuditLog, { foreignKey: 'userId', as: 'auditLogs' });
User.hasMany(SheetAssignment, { foreignKey: 'userId', as: 'sheetAssignments' });
User.hasMany(SheetAssignment, { foreignKey: 'assignedById', as: 'assignmentsMade' });

// --- PROJECT associations ---
// A project belongs to a creator and contains many sheets
Project.belongsTo(User, { foreignKey: 'createdById', as: 'creator' });
Project.hasMany(Sheet, { foreignKey: 'projectId', as: 'sheets' });

// --- SHEET associations ---
// Sheets are the core of the app — they connect to projects, users, cells, and permissions
Sheet.belongsTo(Project, { foreignKey: 'projectId', as: 'project' });
Sheet.belongsTo(User, { foreignKey: 'createdById', as: 'creator' });
Sheet.belongsTo(User, { foreignKey: 'lastModifiedById', as: 'lastModifier' });
Sheet.belongsTo(User, { foreignKey: 'lockedById', as: 'locker' });
Sheet.belongsTo(Sheet, { foreignKey: 'templateId', as: 'template' }); // Sheets can be created from templates
Sheet.hasMany(Sheet, { foreignKey: 'templateId', as: 'instances' });   // Template has many instances
Sheet.hasMany(CellData, { foreignKey: 'sheetId', as: 'cellData' });
Sheet.hasMany(SheetAssignment, { foreignKey: 'sheetId', as: 'assignments' });
Sheet.hasMany(CellPermission, { foreignKey: 'sheetId', as: 'cellPermissions' });
Sheet.hasMany(UserSheet, { foreignKey: 'sheetId', as: 'userSheets' });

// --- SHEET ASSIGNMENT associations ---
// Tracks which users/roles are assigned to which sheets (task system)
SheetAssignment.belongsTo(Sheet, { foreignKey: 'sheetId', as: 'sheet' });
SheetAssignment.belongsTo(User, { foreignKey: 'userId', as: 'user' });
SheetAssignment.belongsTo(User, { foreignKey: 'assignedById', as: 'assignedBy' });

// --- CELL DATA associations ---
// Each cell belongs to a sheet and tracks who created/modified/approved it
CellData.belongsTo(Sheet, { foreignKey: 'sheetId', as: 'sheet' });
CellData.belongsTo(User, { foreignKey: 'createdById', as: 'creator' });
CellData.belongsTo(User, { foreignKey: 'lastModifiedById', as: 'lastModifier' });
CellData.belongsTo(User, { foreignKey: 'approvedById', as: 'approver' });
CellData.belongsTo(User, { foreignKey: 'lockedById', as: 'lockedBy' });
User.hasMany(CellData, { foreignKey: 'lockedById', as: 'lockedCells' });

// --- AUDIT LOG associations ---
// Every audit entry is linked to the user who performed the action
AuditLog.belongsTo(User, { foreignKey: 'userId', as: 'user' });

// --- CELL PERMISSION associations ---
// Per-cell view/edit permissions linked to their sheet
CellPermission.belongsTo(Sheet, { foreignKey: 'sheetId', as: 'sheet' });

// --- USER SHEET associations ---
// Junction table: which users are working on which sheets
UserSheet.belongsTo(Sheet, { foreignKey: 'sheetId', as: 'sheet' });
UserSheet.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasMany(UserSheet, { foreignKey: 'userId', as: 'userSheets' });

// --- REPORT associations ---
// Reports are generated from sheets for CEO viewing
Report.belongsTo(Sheet, { foreignKey: 'sheetId', as: 'sheet' });
Report.belongsTo(Project, { foreignKey: 'projectId', as: 'project' });
Report.belongsTo(User, { foreignKey: 'generatedById', as: 'generatedBy' });
Sheet.hasMany(Report, { foreignKey: 'sheetId', as: 'reports' });
Project.hasMany(Report, { foreignKey: 'projectId', as: 'reports' });
User.hasMany(Report, { foreignKey: 'generatedById', as: 'generatedReports' });

// --- SHEET VERSION associations ---
// Version history: every change creates a snapshot
SheetVersion.belongsTo(Sheet, { foreignKey: 'sheetId', as: 'sheet' });
SheetVersion.belongsTo(User, { foreignKey: 'changedById', as: 'changedBy' });
Sheet.hasMany(SheetVersion, { foreignKey: 'sheetId', as: 'versions' });
User.hasMany(SheetVersion, { foreignKey: 'changedById', as: 'sheetVersions' });

// --- NOTIFICATION associations ---
// Push notifications for task assignments, approvals, etc.
Notification.belongsTo(User, { foreignKey: 'userId', as: 'user' });
User.hasMany(Notification, { foreignKey: 'userId', as: 'notifications' });

// --- FEEDBACK associations ---
// Client feedback ratings linked to projects (for CEO dashboard)
Feedback.belongsTo(Project, { foreignKey: 'projectId', as: 'project' });
Project.hasMany(Feedback, { foreignKey: 'projectId', as: 'feedbacks' });

// FinancialRecord — linked to Project and Sheet (optional)
FinancialRecord.belongsTo(Project, { foreignKey: 'projectId', as: 'project' });
FinancialRecord.belongsTo(Sheet, { foreignKey: 'sheetId', as: 'sheet' });
FinancialRecord.belongsTo(User, { foreignKey: 'createdById', as: 'createdBy' });
Project.hasMany(FinancialRecord, { foreignKey: 'projectId', as: 'financialRecords' });
Sheet.hasMany(FinancialRecord, { foreignKey: 'sheetId', as: 'financialRecords' });

// MarketData has no foreign keys (aggregate data for CEO analytics)

// ============================================================
// EXPORT THE SEQUELIZE INSTANCE alongside all models
// ============================================================
// Routes like dashboards.js need sequelize.fn() for aggregation queries.
// Without this export, `const { sequelize } = require('../models')` returns undefined.
const { sequelize } = require('../config/database');

module.exports = {
  sequelize,
  User,
  Project,
  Sheet,
  CellData,
  AuditLog,
  SheetAssignment,
  CellPermission,
  UserSheet,
  Report,
  SheetVersion,
  Notification,
  Feedback,
  FinancialRecord,
  MarketData,
};