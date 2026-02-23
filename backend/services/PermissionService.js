// ================================================================
// PERMISSION SERVICE (services/PermissionService.js)
// ================================================================
// PURPOSE: Centralized permission checker — "Can this user do this?"
//
// This is the SINGLE SOURCE OF TRUTH for access control.
// It cascades through multiple permission levels:
//   1. Is user L1_ADMIN? → Always allowed
//   2. Does user have a UserSheet record? → Assigned access
//   3. Does their role have canView/canEdit on the sheet? → Role access
//   4. For cells: check CellPermission table → Cell-level access
//
// METHODS:
//   isAdmin()           — Check if user is L1_ADMIN
//   isAssigned()        — Check if user has UserSheet record
//   canViewSheet()      — Check view access (cascading)
//   canEditSheet()      — Check edit access (cascading)
//   canEditCell()       — Check cell-level edit (finest grain)
//
// USED BY: routes/data.js, routes/sheets.js, routes/userSheets.js
// ================================================================

/**
 * Centralized permission service for sheet and cell access checks.
 * Usage: const PermissionService = require('../services/PermissionService');
 */
const { Sheet, CellPermission, UserSheet } = require('../models');

class PermissionService {
  static isAdmin(user) {
    return user && user.role === 'L1_ADMIN';
  }

  static async isAssignedToSheet(userId, sheetId) {
    if (!userId || !sheetId) return false;
    const record = await UserSheet.findOne({ where: { userId, sheetId } });
    return !!record;
  }

  static async canViewSheet(user, sheet) {
    if (!user || !sheet) return false;
    if (PermissionService.isAdmin(user)) return true;
    const rolePerm = sheet.permissions && sheet.permissions[user.role];
    if (rolePerm && rolePerm.canView) return true;
    return PermissionService.isAssignedToSheet(user.id, sheet.id);
  }

  static async canEditSheet(user, sheet) {
    if (!user || !sheet) return false;
    if (PermissionService.isAdmin(user)) return true;
    const rolePerm = sheet.permissions && sheet.permissions[user.role];
    if (rolePerm && rolePerm.canEdit) return true;
    return PermissionService.isAssignedToSheet(user.id, sheet.id);
  }

  /**
   * Check whether a user can edit a specific cell.
   * Order of checks:
   *  1. Admin bypass
   *  2. Cell definition in sheet.structure (cell-level permissions)
   *  3. CellPermission table (canEditRoles / canEditUsers)
   *  4. Sheet-level role permission
   *  5. UserSheet assignment fallback
   */
  static async canEditCell(user, { sheetId, cellId }) {
    if (!user || !sheetId || !cellId) return false;
    if (PermissionService.isAdmin(user)) return true;

    const sheet = await Sheet.findByPk(sheetId);
    if (!sheet) return false;

    const cellDef = sheet.structure && sheet.structure.cells ? sheet.structure.cells[cellId] : null;

    if (cellDef && cellDef.permissions) {
      if (cellDef.permissions.canEdit && cellDef.permissions.canEdit.includes(user.role)) return true;
      // if explicitly denied, return false
      if (cellDef.permissions.cannotEdit && cellDef.permissions.cannotEdit.includes(user.role)) return false;
    }

    // Check DB cell permission record
    const permRecord = await CellPermission.findOne({ where: { sheetId, cellId } });
    if (permRecord) {
      if ((permRecord.canEditRoles || []).includes(user.role)) return true;
      if ((permRecord.canEditUsers || []).includes(String(user.id))) return true;
      if (permRecord.isLocked) return false;
    }

    // Fallback to sheet-level role permission
    const rolePerm = sheet.permissions && sheet.permissions[user.role];
    if (rolePerm && rolePerm.canEdit) return true;

    // Fallback to explicit assignment
    const assigned = await PermissionService.isAssignedToSheet(user.id, sheetId);
    return !!assigned;
  }
}

module.exports = PermissionService;
