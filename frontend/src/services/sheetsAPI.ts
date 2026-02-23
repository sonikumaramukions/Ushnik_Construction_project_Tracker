// ================================================================
// SHEETS API (services/sheetsAPI.ts)
// ================================================================
// PURPOSE: All sheet and cell-related API calls.
//
// SHEET METHODS:
//   getSheets(projectId)   — Get all sheets for a project
//   getSheet(id)           — Get one sheet with all data
//   createSheet(data)      — Create a new sheet
//   updateSheet(id, data)  — Update sheet structure
//   deleteSheet(id)        — Delete a sheet
//
// CELL METHODS:
//   getCellData(sheetId)         — Get all cells for a sheet
//   updateCell(sheetId, cellId)  — Update a single cell
//   lockCell(sheetId, cellId)    — Lock a cell (admin)
//   bulkUpdateCells(data)        — Update many cells at once
//
// ALSO: pushToRoles, pushToUsers, getMySheets, getVersionHistory
//
// USED BY: Sheet editor pages, admin dashboard, task pages
// ================================================================

import { apiClient } from './api';

// ─── LOCAL TYPE DEFINITIONS ───
// These types match the BACKEND database column names (snake_case like project_id).
// They're different from the types in types/index.ts (which use camelCase like projectId).
// We keep both because the backend sends snake_case, but some frontend code uses camelCase.

// Represents a sheet as stored in the database
export interface Sheet {
  id: string;
  name: string;
  project_id: string;       // Foreign key to the projects table
  type: string;             // Sheet type (e.g., "tracking", "budget")
  status: 'DRAFT' | 'ACTIVE' | 'COMPLETED' | 'ARCHIVED';
  is_template: boolean;     // Can this be reused as a template?
  created_by_id: string;    // User who created this sheet
  created_at: string;
  updated_at: string;
}

// A cell value as stored in the database
export interface CellData {
  id: string;
  sheet_id: string;         // Which sheet this cell belongs to
  cell_id: string;          // Cell identifier (e.g., "B3")
  row_index: number;
  column_index: number;
  value: any;               // The cell's content (text, number, etc.)
  formula?: string;         // Formula if this is a calculated cell
  data_type: 'TEXT' | 'NUMBER' | 'DATE' | 'BOOLEAN' | 'FORMULA';
  validation_rules?: any;   // Rules the value must pass
  permissions?: {           // Who can interact with this cell
    canEdit: boolean;
    canView: boolean;
    editRoles: string[];    // Roles allowed to edit (e.g., ["L1_ADMIN"])
  };
  status: 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';
  created_by_id: string;
  approved_by_id?: string;  // Who approved this cell's value
  created_at: string;
  updated_at: string;
}

// A reusable sheet template (pre-built column/row layout)
export interface SheetTemplate {
  id: string;
  name: string;
  description: string;
  structure: any;             // Column/row definitions
  defaultPermissions: any;    // Default role permissions
}

// ─── SHEETS API SERVICE ───
// All these methods call the backend REST API via apiClient (see api.ts).
// Each method maps to one API endpoint on the server.
export const sheetsAPI = {

  // ---- SHEET CRUD (Create, Read, Update, Delete) ----

  // GET /api/sheets → List all sheets the current user can see
  getAll: async (): Promise<Sheet[]> => {
    const response = await apiClient.get('/sheets');
    return response.data;
  },

  // GET /api/sheets/:id → Get one sheet by ID (includes structure, cells, etc.)
  getById: async (id: string): Promise<Sheet> => {
    const response = await apiClient.get(`/sheets/${id}`);
    return response.data;
  },

  // GET /api/sheets/project/:projectId → Get all sheets in a specific project
  getByProject: async (projectId: string): Promise<Sheet[]> => {
    const response = await apiClient.get(`/sheets/project/${projectId}`);
    return response.data;
  },

  // POST /api/sheets → Create a new sheet
  create: async (sheetData: Partial<Sheet>): Promise<Sheet> => {
    const response = await apiClient.post('/sheets', sheetData);
    return response.data;
  },

  // PUT /api/sheets/:id → Update sheet info (name, structure, status, etc.)
  update: async (id: string, sheetData: Partial<Sheet>): Promise<Sheet> => {
    const response = await apiClient.put(`/sheets/${id}`, sheetData);
    return response.data;
  },

  // DELETE /api/sheets/:id → Delete a sheet permanently
  delete: async (id: string): Promise<void> => {
    await apiClient.delete(`/sheets/${id}`);
  },

  // ---- CELL OPERATIONS (read/write individual cells) ----

  // GET /api/sheets/:sheetId/cells → Get all cell values for a sheet
  getCells: async (sheetId: string): Promise<CellData[]> => {
    const response = await apiClient.get(`/sheets/${sheetId}/cells`);
    return response.data;
  },

  // PUT /api/sheets/:sheetId/cells/:cellId → Update one cell
  updateCell: async (sheetId: string, cellId: string, data: Partial<CellData>): Promise<CellData> => {
    const response = await apiClient.put(`/sheets/${sheetId}/cells/${cellId}`, data);
    return response.data;
  },

  // PUT /api/sheets/:sheetId/cells/batch → Update many cells at once
  updateCells: async (sheetId: string, cellUpdates: Partial<CellData>[]): Promise<CellData[]> => {
    const response = await apiClient.put(`/sheets/${sheetId}/cells/batch`, cellUpdates);
    return response.data;
  },

  // GET /api/sheets/:sheetId/cells/:cellId/history → See who changed a cell and when
  getCellHistory: async (sheetId: string, cellId: string): Promise<any[]> => {
    const response = await apiClient.get(`/sheets/${sheetId}/cells/${cellId}/history`);
    return response.data;
  },

  // ---- TEMPLATE OPERATIONS ----
  // Templates are pre-built sheet layouts that can be reused.
  // Example: a "Budget Tracking" template with preset columns.

  // GET /api/sheets/templates → List all available templates
  getTemplates: async (): Promise<SheetTemplate[]> => {
    const response = await apiClient.get('/sheets/templates');
    return response.data;
  },

  // POST /api/sheets/from-template → Create a new sheet based on a template
  createFromTemplate: async (templateId: string, projectId: string, name: string): Promise<Sheet> => {
    const response = await apiClient.post('/sheets/from-template', {
      templateId,
      projectId,
      name,
    });
    return response.data;
  },

  // ---- CELL PERMISSIONS ----
  // Control which roles can view/edit specific cells.
  // Example: Only L1_ADMIN can edit the "Budget" column cells.

  // GET /api/sheets/:sheetId/cells/:cellId/permissions
  getCellPermissions: async (sheetId: string, cellId: string): Promise<any> => {
    const response = await apiClient.get(`/sheets/${sheetId}/cells/${cellId}/permissions`);
    return response.data;
  },

  // PUT /api/sheets/:sheetId/cells/:cellId/permissions
  updateCellPermissions: async (sheetId: string, cellId: string, permissions: any): Promise<void> => {
    await apiClient.put(`/sheets/${sheetId}/cells/${cellId}/permissions`, permissions);
  },

  // ---- APPROVAL WORKFLOW ----
  // Junior engineers submit cell values → Senior engineers approve or reject.
  // Flow: DRAFT → PENDING_APPROVAL → APPROVED or REJECTED

  // POST /api/sheets/:sheetId/submit-approval → Submit cells for review
  submitForApproval: async (sheetId: string, cellIds: string[]): Promise<void> => {
    await apiClient.post(`/sheets/${sheetId}/submit-approval`, { cellIds });
  },

  // POST /api/sheets/:sheetId/cells/:cellId/approve → Approve a cell value
  approveCell: async (sheetId: string, cellId: string): Promise<CellData> => {
    const response = await apiClient.post(`/sheets/${sheetId}/cells/${cellId}/approve`);
    return response.data;
  },

  // POST /api/sheets/:sheetId/cells/:cellId/reject → Reject with reason
  rejectCell: async (sheetId: string, cellId: string, reason: string): Promise<CellData> => {
    const response = await apiClient.post(`/sheets/${sheetId}/cells/${cellId}/reject`, { reason });
    return response.data;
  },

  // ---- SHEET PUSH/SYNC ----
  // "Push" means sending a sheet to specific users/roles so it appears on their dashboard.
  // "Sync" means junior engineers sync their changes back up to admin.

  // GET /api/sheets/my-sheets → Get sheets that were pushed/assigned to the current user
  getMySheets: async (): Promise<{ success: boolean; sheets: Sheet[]; count: number }> => {
    const response = await apiClient.get('/sheets/my-sheets');
    return response.data;
  },

  // POST /api/sheets/:sheetId/push-to-roles → Push sheet to all users with these roles
  // Example: Admin pushes a "Budget Sheet" to all L3_JUNIOR_ENGINEERs
  pushToRoles: async (sheetId: string, targetRoles: string[]): Promise<{ success: boolean; message: string; sheet: Sheet }> => {
    const response = await apiClient.post(`/sheets/${sheetId}/push-to-roles`, { targetRoles });
    return response.data;
  },

  // POST /api/sheets/:sheetId/sync-to-admin → Sync changes back to admin's view
  syncToAdmin: async (sheetId: string): Promise<{ success: boolean; message: string; sheet: Sheet }> => {
    const response = await apiClient.post(`/sheets/${sheetId}/sync-to-admin`);
    return response.data;
  },

  // ---- CELL DATA OPERATIONS (via /data endpoint) ----
  // These use a different backend route (/api/data) for cell-specific operations.

  // GET /api/data/sheet/:sheetId → Get all cell data for a sheet
  getCellData: async (sheetId: string): Promise<{ cellData: CellData[] }> => {
    const response = await apiClient.get(`/data/sheet/${sheetId}`);
    return response.data;
  },

  // PUT /api/data/cell → Update a single cell's value
  updateCellData: async (cellData: { sheetId: string; cellId: string; value: any; dataType?: string }): Promise<{ success: boolean; cellData: CellData }> => {
    const response = await apiClient.put('/data/cell', cellData);
    return response.data;
  },

  // POST /api/data/bulk-update → Update many cells at once (more efficient than one-by-one)
  // Returns a summary of which cells succeeded and which failed
  bulkUpdateCells: async (sheetId: string, cells: Array<{ cellId: string; value: any; dataType?: string }>): Promise<{
    success: boolean;
    message: string;
    updatedCells: Array<{ cellId: string; success: boolean }>;
    failedCells: Array<{ cellId: string; error: string }>;
    summary: { total: number; succeeded: number; failed: number };
  }> => {
    const response = await apiClient.post('/data/bulk-update', { sheetId, cells });
    return response.data;
  },

  // ---- CELL LOCKING (Admin only) ----
  // Locked cells cannot be edited by anyone until unlocked.
  // Used to freeze approved data so it doesn't get accidentally changed.

  // PUT /api/data/cell/lock → Lock specific cells
  lockCells: async (sheetId: string, cellIds: string[]): Promise<{ success: boolean; locked: string[]; failed: any[] }> => {
    const response = await apiClient.put('/data/cell/lock', { sheetId, cellIds });
    return response.data;
  },

  // PUT /api/data/cell/unlock → Unlock specific cells
  unlockCells: async (sheetId: string, cellIds: string[]): Promise<{ success: boolean; unlocked: string[]; failed: any[] }> => {
    const response = await apiClient.put('/data/cell/unlock', { sheetId, cellIds });
    return response.data;
  },

  // GET /api/data/sheet/:sheetId/locked-cells → See which cells are currently locked
  getLockedCells: async (sheetId: string): Promise<{ lockedCells: any[] }> => {
    const response = await apiClient.get(`/data/sheet/${sheetId}/locked-cells`);
    return response.data;
  },

  // ---- EXPORT/IMPORT ----
  // Download sheets as Excel/CSV/PDF, or upload data from a file.

  // GET /api/sheets/:sheetId/export/:format → Download as file
  // Returns a Blob (raw binary data) that the browser can save as a file
  exportSheet: async (sheetId: string, format: 'excel' | 'csv' | 'pdf'): Promise<Blob> => {
    const response = await apiClient.get(`/sheets/${sheetId}/export/${format}`, {
      responseType: 'blob',   // Tell axios to expect binary data, not JSON
    });
    return response.data;
  },

  // POST /api/sheets/:sheetId/import → Upload data from a file
  // Uses FormData to send the file (like attaching a file to an email)
  importData: async (sheetId: string, file: File): Promise<any> => {
    const formData = new FormData();
    formData.append('file', file);   // Add the file to the form
    const response = await apiClient.post(`/sheets/${sheetId}/import`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',   // Tell server it's a file upload
      },
    });
    return response.data;
  },
};

export default sheetsAPI;