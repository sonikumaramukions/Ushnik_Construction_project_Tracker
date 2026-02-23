// ================================================================
// ASSIGNMENTS API (services/assignmentsAPI.ts)
// ================================================================
// PURPOSE: Task assignment and notification API calls.
//
// ASSIGNMENT METHODS:
//   getMyAssignments()     — Get tasks assigned to current user
//   createAssignment(data) — Create a new task assignment
//   respondToAssignment()  — Submit response to an assignment
//   getBySheet(sheetId)    — Get assignments for a sheet
//   revokeAssignment(id)   — Cancel an assignment
//
// NOTIFICATION METHODS:
//   getNotifications()     — Get user's notifications
//   markAsRead(id)         — Mark notification as read
//
// USED BY: Task pages, engineer dashboards, admin dashboard
// ================================================================

import { apiClient } from './api';

// ─── ASSIGNMENT TYPE ───
// An "assignment" is a TASK given by an admin/senior engineer to another user.
// Example: "Fill in cells B3-B10 of the Budget Sheet by Friday"
// The assigned user sees this in their "My Tasks" page.
export interface Assignment {
  id: string;
  sheetId: string;           // Which sheet the task is about
  userId?: string;           // Specific user assigned (optional)
  assignedRole?: string;     // OR assigned to all users with this role
  assignedById: string;      // Who created the assignment
  assignmentType: 'SHEET' | 'ROW' | 'COLUMN' | 'CELL';  // What scope of work
  assignedRows: number[];    // Specific rows to fill in
  assignedColumns: string[]; // Specific columns to fill in
  assignedCells: string[];   // Specific cells to fill in (e.g., ["B3", "B4"])
  question?: string;         // Optional question ("What is the cost of X?")
  response?: {               // The user's answer/response
    values: Record<string, string>;  // Cell values filled in
    note?: string;                   // Optional note from the user
    submittedAt: string;
    submittedBy: string;
  };
  status: 'PENDING' | 'IN_PROGRESS' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'REVOKED';
  priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
  dueDate?: string;          // Deadline
  notes?: string;            // Notes from the assigner
  assignedAt: string;        // When the task was created
  respondedAt?: string;      // When the user responded
  sheet?: {                  // The sheet details (joined from DB)
    id: string;
    name: string;
    status: string;
    projectId?: string;
    structure?: any;
    project?: { id: string; name: string };
  };
  user?: {                   // The assigned user's info
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
  };
  assignedBy?: {             // Who assigned this task
    id: string;
    firstName: string;
    lastName: string;
  };
  cellData?: Array<{         // Current cell data (for pre-filling the form)
    cellId: string;
    value: string;
    dataType: string;
    rowIndex: number;
    columnIndex: number;
  }>;
}

// ─── NOTIFICATION TYPE ───
// Notifications shown in the bell icon dropdown.
// Created automatically when assignments are created, approved, etc.
export interface AppNotification {
  id: string;
  userId: string;          // Who receives this notification
  type: string;            // e.g., "ASSIGNMENT_CREATED", "CELL_APPROVED"
  title: string;           // Short title ("New Task Assigned")
  message: string;         // Detailed message
  data: Record<string, any>; // Extra data (sheetId, assignmentId, etc.)
  isRead: boolean;         // Has the user seen it?
  priority: string;        // e.g., "HIGH", "NORMAL"
  createdAt: string;
}

// ─── ASSIGNMENTS API SERVICE ───
export const assignmentsAPI = {

  // ---- ADMIN: CREATE & MANAGE ASSIGNMENTS ----

  // POST /api/assignments/assign → Create a new task assignment
  // Admin fills in: which sheet, which cells, who to assign, due date, etc.
  createAssignment: async (data: {
    sheetId: string;
    userId?: string;           // Assign to specific user
    assignedRole?: string;     // OR assign to all users with this role
    assignmentType: string;    // SHEET, ROW, COLUMN, or CELL
    assignedRows?: number[];
    assignedColumns?: string[];
    assignedCells?: string[];
    question?: string;         // Optional question for the user
    priority?: string;
    dueDate?: string;
    notes?: string;
  }) => {
    const response = await apiClient.post('/assignments/assign', data);
    return response.data;
  },

  // ---- USER: VIEW & RESPOND TO MY TASKS ----

  // GET /api/assignments/my-tasks → Get tasks assigned to me
  getMyTasks: async () => {
    const response = await apiClient.get('/assignments/my-tasks');
    return response.data;
  },

  // POST /api/assignments/:id/respond → Submit my answers for an assignment
  // The `values` object maps cellId → the value I entered
  submitResponse: async (assignmentId: string, values: Record<string, string>, note?: string) => {
    const response = await apiClient.post(`/assignments/${assignmentId}/respond`, { values, note });
    return response.data;
  },

  // ---- ADMIN: VIEW ALL ASSIGNMENTS ----

  // GET /api/assignments/all → See all assignments across the system
  // Can filter by status, sheet, or project
  getAllAssignments: async (params?: { status?: string; sheetId?: string; projectId?: string }) => {
    const response = await apiClient.get('/assignments/all', { params });
    return response.data;
  },

  // GET /api/assignments/sheet/:sheetId/history → See assignment history for a sheet
  getSheetHistory: async (sheetId: string) => {
    const response = await apiClient.get(`/assignments/sheet/${sheetId}/history`);
    return response.data;
  },

  // PATCH /api/assignments/:id/status → Approve or reject a submitted assignment
  updateAssignmentStatus: async (assignmentId: string, status: string, feedback?: string) => {
    const response = await apiClient.patch(`/assignments/${assignmentId}/status`, { status, feedback });
    return response.data;
  },

  // ---- NOTIFICATIONS ----

  // GET /api/assignments/notifications → Get my notifications (bell icon)
  getNotifications: async (unreadOnly?: boolean) => {
    const response = await apiClient.get('/assignments/notifications', {
      params: unreadOnly ? { unreadOnly: 'true' } : {},
    });
    return response.data;
  },

  // PATCH /api/assignments/notifications/read → Mark notifications as read
  // Pass specific IDs or 'all' to mark everything
  markNotificationsRead: async (notificationIds: string[] | 'all') => {
    const response = await apiClient.patch('/assignments/notifications/read', { notificationIds });
    return response.data;
  },
};
