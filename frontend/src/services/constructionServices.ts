// ================================================================
// CONSTRUCTION SERVICES (services/constructionServices.ts)
// ================================================================
// PURPOSE: Domain-specific services bundled together.
//
// INCLUDES:
//   formulaService  — Validate/set/calculate formulas
//   reportService   — Generate/download reports
//   feedbackService — Submit/manage client feedback
//   versionService  — Sheet version history and rollback
//
// USED BY: Sheet editor pages, report pages, CEO dashboard
// ================================================================

import api from './api';

// ─────────────────────────────────────────────────────────────
// FORMULA SERVICE
// ─────────────────────────────────────────────────────────────
// Handles spreadsheet formulas (like =SUM, =AVERAGE, etc.).
// Formulas are calculated on the SERVER, not in the browser.
// USED BY: Sheet editor (formula bar)
export const formulaService = {

    // GET /api/formulas/available → List all formula types (SUM, AVG, MAX, etc.)
    async getAvailableFormulas() {
        try {
            const response = await api.get('/formulas/available');
            return response.data.data || [];
        } catch (error) {
            console.error('Failed to fetch formulas:', error);
            return [];
        }
    },

    // POST /api/formulas/validate → Check if a formula is valid before saving
    // Returns { valid: true } or { valid: false, error: "reason" }
    async validateFormula(formula: string) {
        try {
            const response = await api.post('/formulas/validate', { formula });
            return response.data.data;
        } catch (error) {
            console.error('Failed to validate formula:', error);
            const message = error instanceof Error ? error.message : 'Unknown error';
            return { valid: false, error: message };
        }
    },

    // POST /api/formulas/set/:sheetId/:cellId → Save a formula to a cell
    // Example: Set cell C10 to "=SUM(C1:C9)"
    async setFormula(sheetId: string, cellId: string, formula: string) {
        try {
            const response = await api.post(`/formulas/set/${sheetId}/${cellId}`, { formula });
            return response.data.data;
        } catch (error) {
            console.error('Failed to set formula:', error);
            throw error;
        }
    },

    // POST /api/formulas/calculate/:sheetId → Evaluate a formula and get the result
    // Useful for "preview" before saving
    async calculateFormula(sheetId: string, formula: string) {
        try {
            const response = await api.post(`/formulas/calculate/${sheetId}`, { formula });
            return response.data.data;
        } catch (error) {
            console.error('Failed to calculate formula:', error);
            throw error;
        }
    },

    // GET /api/formulas/:sheetId/:cellId → Get the formula currently in a cell
    async getCellFormula(sheetId: string, cellId: string) {
        try {
            const response = await api.get(`/formulas/${sheetId}/${cellId}`);
            return response.data.data;
        } catch (error) {
            console.error('Failed to fetch cell formula:', error);
            return null;
        }
    },

    // POST /api/formulas/recalculate/:sheetId → Recalculate ALL formulas in a sheet
    // Used when many cells change at once (like after an import)
    async recalculateFormulas(sheetId: string) {
        try {
            const response = await api.post(`/formulas/recalculate/${sheetId}`);
            return response.data.data;
        } catch (error) {
            console.error('Failed to recalculate formulas:', error);
            throw error;
        }
    }
};

// ─────────────────────────────────────────────────────────────
// ROLE PERMISSION SERVICE
// ─────────────────────────────────────────────────────────────
// Manages which roles can do what in each sheet.
// Uses "templates" (preset permission sets) to quickly assign common patterns.
// USED BY: Admin sheet settings, cell permissions dialog
export const rolePermissionService = {

    // GET /api/role-permissions/templates → Get permission template presets
    // Templates are named sets like "full-access", "view-only", "editor"
    async getTemplates() {
        try {
            const response = await api.get('/role-permissions/templates');
            return response.data.data;
        } catch (error) {
            console.error('Failed to fetch templates:', error);
            return {};
        }
    },

    // GET /api/role-permissions/defaults → Get default permissions for each role
    async getDefaults() {
        try {
            const response = await api.get('/role-permissions/defaults');
            return response.data.data;
        } catch (error) {
            console.error('Failed to fetch defaults:', error);
            return {};
        }
    },

    // GET /api/role-permissions/:sheetId → Get ALL role permissions for a sheet
    // Returns { L1_ADMIN: {...}, L3_JUNIOR_ENGINEER: {...}, ... }
    async getSheetPermissions(sheetId: string) {
        try {
            const response = await api.get(`/role-permissions/${sheetId}`);
            return response.data.data;
        } catch (error) {
            console.error('Failed to fetch permissions:', error);
            return {};
        }
    },

    // GET /api/role-permissions/:sheetId/:role → Get permissions for ONE role in a sheet
    async getRolePermissions(sheetId: string, role: string) {
        try {
            const response = await api.get(`/role-permissions/${sheetId}/${role}`);
            return response.data.data.permissions;
        } catch (error) {
            console.error('Failed to fetch role permissions:', error);
            return {};
        }
    },

    // POST /api/role-permissions/:sheetId/:role → Set permissions for ONE role
    async setRolePermissions(sheetId: string, role: string, permissions: any) {
        try {
            const response = await api.post(`/role-permissions/${sheetId}/${role}`, permissions);
            return response.data.data;
        } catch (error) {
            console.error('Failed to set permissions:', error);
            throw error;
        }
    },

    // POST /api/role-permissions/:sheetId/batch → Set permissions for MULTIPLE roles at once
    async setMultipleRolePermissions(sheetId: string, rolePermissions: any) {
        try {
            const response = await api.post(`/role-permissions/${sheetId}/batch`, { rolePermissions });
            return response.data.data;
        } catch (error) {
            console.error('Failed to set multiple permissions:', error);
            throw error;
        }
    },

    // POST /api/role-permissions/:sheetId/:role/template/:template → Apply a template
    // Example: Apply "view-only" template to CEO role for this sheet
    async applyTemplate(sheetId: string, role: string, template: string) {
        try {
            const response = await api.post(`/role-permissions/${sheetId}/${role}/template/${template}`);
            return response.data.data;
        } catch (error) {
            console.error('Failed to apply template:', error);
            throw error;
        }
    },

    // GET /api/role-permissions/:sheetId/:role/can/:action → Check if a role can do something
    // Example: Can L3_JUNIOR_ENGINEER "edit" cells in this sheet? → true/false
    async canPerformAction(sheetId: string, role: string, action: string) {
        try {
            const response = await api.get(`/role-permissions/${sheetId}/${role}/can/${action}`);
            return response.data.data.allowed;
        } catch (error) {
            console.error('Failed to check permission:', error);
            return false;  // Default to "not allowed" if check fails
        }
    }
};

// ─────────────────────────────────────────────────────────────
// SHEET COLLABORATION SERVICE
// ─────────────────────────────────────────────────────────────
// Manages sharing sheets between roles and real-time collaboration.
// "Push" = admin sends a sheet to other roles/users.
// "Broadcast" = send real-time updates to all collaborators.
// USED BY: Admin sheet management, sheet editor push dialog
export const sheetCollaborationService = {

    // POST /api/sheets/:sheetId/push-collaborate → Share sheet with specific roles
    // Example: Push "Budget Sheet" to L3_JUNIOR_ENGINEER and GROUND_MANAGER
    async pushSheetToRoles(sheetId: string, rolesToShare: string[]) {
        try {
            const response = await api.post(`/sheets/${sheetId}/push-collaborate`, { rolesToShare });
            return response.data.data;
        } catch (error) {
            console.error('Failed to push sheet:', error);
            throw error;
        }
    },

    // POST /api/sheets/:sheetId/broadcast-update → Notify all collaborators of a change
    async broadcastUpdate(sheetId: string, updateData: any) {
        try {
            const response = await api.post(`/sheets/${sheetId}/broadcast-update`, updateData);
            return response.data;
        } catch (error) {
            console.error('Failed to broadcast update:', error);
            throw error;
        }
    },

    // POST /api/sheets/:sheetId/push-cell-update → Push a single cell change to collaborators
    async pushCellUpdate(sheetId: string, cellId: string, cellData: any) {
        try {
            const response = await api.post(`/sheets/${sheetId}/push-cell-update`, { cellId, cellData });
            return response.data;
        } catch (error) {
            console.error('Failed to push cell update:', error);
            throw error;
        }
    },

    // DELETE /api/sheets/:sheetId/collaboration/:role → Remove a role's access to the sheet
    async removeCollaboration(sheetId: string, role: string) {
        try {
            const response = await api.delete(`/sheets/${sheetId}/collaboration/${role}`);
            return response.data.data;
        } catch (error) {
            console.error('Failed to remove collaboration:', error);
            throw error;
        }
    },

    // GET /api/sheets/:sheetId/collaborators → See who has access to this sheet
    async getCollaborators(sheetId: string) {
        try {
            const response = await api.get(`/sheets/${sheetId}/collaborators`);
            return response.data.data;
        } catch (error) {
            console.error('Failed to fetch collaborators:', error);
            return {};
        }
    },

    // POST /api/sheets/:sheetId/sync-dashboard/:role → Sync sheet to a role's dashboard
    async syncToDashboard(sheetId: string, role: string) {
        try {
            const response = await api.post(`/sheets/${sheetId}/sync-dashboard/${role}`);
            return response.data;
        } catch (error) {
            console.error('Failed to sync to dashboard:', error);
            throw error;
        }
    },

    // POST /api/sheets/:sheetId/offline-sync/:role → Enable offline access
    // For Ground Managers who may lose internet at the construction site
    async enableOfflineSync(sheetId: string, role: string) {
        try {
            const response = await api.post(`/sheets/${sheetId}/offline-sync/${role}`);
            return response.data.data;
        } catch (error) {
            console.error('Failed to enable offline sync:', error);
            throw error;
        }
    }
};

// ─────────────────────────────────────────────────────────────
// CEO REPORT SERVICE
// ─────────────────────────────────────────────────────────────
// Generates and downloads executive reports for the CEO.
// Reports are Excel files containing sheet data + summaries.
// USED BY: CEO dashboard, admin "Generate Report" button
export const ceoReportService = {

    // POST /api/ceo-reports/generate → Generate a new CEO report from a sheet
    async generateReport(sheetId: string, title?: string, description?: string, ceoUserId?: string) {
        try {
            const response = await api.post('/ceo-reports/generate', {
                sheetId,
                title,
                description,
                ceoUserId     // Which CEO user to share the report with
            });
            return response.data.data;
        } catch (error) {
            console.error('Failed to generate report:', error);
            throw error;
        }
    },

    // GET /api/ceo-reports/:reportId → Get report details (metadata, not the file)
    async getReport(reportId: string) {
        try {
            const response = await api.get(`/ceo-reports/${reportId}`);
            return response.data.data;
        } catch (error) {
            console.error('Failed to fetch report:', error);
            throw error;
        }
    },

    // GET /api/ceo-reports/:reportId/download → Download report as Excel file
    // Creates a temporary download link and clicks it automatically
    async downloadReport(reportId: string) {
        try {
            const response = await api.get(`/ceo-reports/${reportId}/download`, {
                responseType: 'blob'   // Expect binary file data, not JSON
            });
            
            // Create a temporary URL pointing to the file data in memory
            const url = window.URL.createObjectURL(new Blob([response.data]));
            // Create a hidden <a> link element
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `CEO_Report_${reportId}.xlsx`);  // Set filename
            document.body.appendChild(link);
            link.click();               // Trigger the download
            link.parentNode?.removeChild(link);  // Clean up the link
        } catch (error) {
            console.error('Failed to download report:', error);
            throw error;
        }
    },

    // GET /api/ceo-reports → List all generated CEO reports
    async listReports() {
        try {
            const response = await api.get('/ceo-reports');
            return response.data.data;
        } catch (error) {
            console.error('Failed to list reports:', error);
            return [];
        }
    },

    // POST /api/ceo-reports/:reportId/share → Make a report visible to a specific CEO user
    async shareReport(reportId: string, ceoUserId: string) {
        try {
            const response = await api.post(`/ceo-reports/${reportId}/share`, { ceoUserId });
            return response.data.data;
        } catch (error) {
            console.error('Failed to share report:', error);
            throw error;
        }
    },

    // GET /api/ceo-reports/:reportId/access-log → See who viewed/downloaded the report
    async getAccessLog(reportId: string) {
        try {
            const response = await api.get(`/ceo-reports/${reportId}/access-log`);
            return response.data.data;
        } catch (error) {
            console.error('Failed to fetch access log:', error);
            return { accessLog: [] };
        }
    }
};

// ─── EXPORT ALL SERVICES ───
// Import this file to get access to all 4 domain services at once.
export default {
    formulaService,
    rolePermissionService,
    sheetCollaborationService,
    ceoReportService
};
