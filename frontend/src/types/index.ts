// ================================================================
// TYPE DEFINITIONS (types/index.ts)
// ================================================================
// PURPOSE: Central TypeScript types shared across the entire frontend.
//
// TypeScript types define the SHAPE of data:
//   - User: { id, email, firstName, lastName, role, ... }
//   - Sheet: { id, name, structure, permissions, ... }
//   - CellData: { cellId, value, dataType, status, ... }
//   - Project: { name, status, budget, ... }
//
// WHY TYPES?
//   Without types, you might accidentally write user.naem instead of user.name
//   and not notice until it crashes. Types catch mistakes BEFORE you run the code.
//
// USER ROLES (the 6 roles in the system):
//   L1_ADMIN, L2_SENIOR_ENGINEER, L3_JUNIOR_ENGINEER,
//   PROJECT_MANAGER, GROUND_MANAGER, CEO
//
// USED BY: Every .tsx file that handles data
// ================================================================

// ─── USER TYPE ───
// Represents a person who can log into the system.
// Every user has a role that determines what they can see and do.
// USED BY: AuthContext, admin user management, profile pages
export interface User {
  id: string;             // Unique ID (e.g., "user_abc123")
  email: string;          // Login email
  firstName: string;      // First name (e.g., "John")
  lastName: string;       // Last name (e.g., "Smith")
  role: UserRole;         // Their role in the system (see UserRole below)
  phone?: string;         // Optional phone number
  avatar?: string;        // Optional profile picture URL
  isActive: boolean;      // Is this account active? (false = disabled)
  lastLoginAt?: string;   // When they last logged in
  preferences: Record<string, any>;  // User settings (theme, language, etc.)
  createdAt: string;      // When this account was created
  updatedAt: string;      // When this account was last modified
}

// ─── USER ROLES ───
// The 6 roles in the Construction Tracker system.
// Each role has different permissions and sees a different dashboard.
//   L1_ADMIN           → Full control: create users, sheets, projects
//   L2_SENIOR_ENGINEER → Manage junior engineers, approve data
//   L3_JUNIOR_ENGINEER → Fill in assigned sheet cells, answer Q&A
//   PROJECT_MANAGER    → Oversee projects, manage teams
//   GROUND_MANAGER     → Field data entry on mobile devices
//   CEO                → View-only executive dashboard
export type UserRole = 
  | 'L1_ADMIN'
  | 'L2_SENIOR_ENGINEER'
  | 'L3_JUNIOR_ENGINEER'
  | 'PROJECT_MANAGER'
  | 'GROUND_MANAGER'
  | 'CEO';

// ─── PROJECT TYPE ───
// A construction project (e.g., "Building A Renovation").
// Projects contain sheets, team members, and have a timeline/budget.
// USED BY: Project detail page, admin dashboard, PM dashboard
export interface Project {
  id: string;
  name: string;             // Project name (e.g., "Highway Bridge Phase 2")
  description?: string;     // Optional description
  location?: string;        // Construction site location
  startDate?: string;       // When construction starts
  endDate?: string;         // Expected completion date
  status: ProjectStatus;    // Current status (planning, in progress, etc.)
  priority: ProjectPriority; // How urgent (low, medium, high, critical)
  budget?: number;          // Total budget in currency
  actualCost: number;       // Money spent so far
  progressPercentage: number; // 0-100% completion
  metadata: Record<string, any>; // Extra data (custom fields)
  createdById: string;      // Who created this project
  creator?: User;           // The creator's user object
  sheets?: Sheet[];         // Sheets that belong to this project
  createdAt: string;
  updatedAt: string;
}

// Project lifecycle: PLANNING → IN_PROGRESS → COMPLETED (or ON_HOLD / CANCELLED)
export type ProjectStatus = 'PLANNING' | 'IN_PROGRESS' | 'ON_HOLD' | 'COMPLETED' | 'CANCELLED';
export type ProjectPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

// ─── SHEET TYPE ───
// A tracking sheet (like an Excel spreadsheet) within a project.
// The core feature of this app — users view and edit cells in sheets.
// USED BY: Sheet editor, admin sheets management, my-sheets page
export interface Sheet {
  id: string;
  name: string;                // Sheet name (e.g., "Material Costs Q1")
  description?: string;
  projectId: string;           // Which project this sheet belongs to
  project?: Project;           // The parent project object
  structure: SheetStructure;   // Column/row definitions (the grid layout)
  permissions: SheetPermissions; // Who can view/edit this sheet
  validationRules: Record<string, any>; // Data validation rules per cell
  status: SheetStatus;         // DRAFT, ACTIVE, LOCKED, or ARCHIVED
  version: number;             // Version number (increments on each save)
  isTemplate: boolean;         // Is this a reusable template?
  templateId?: string;         // If created from a template, which one
  template?: Sheet;
  createdById: string;         // Who created this sheet
  creator?: User;
  lastModifiedById?: string;   // Who last edited this sheet
  lastModifier?: User;
  lockedAt?: string;           // When the sheet was locked (if locked)
  lockedById?: string;         // Who locked it
  locker?: User;
  cellData?: CellData[];       // All cell values in this sheet
  createdAt: string;
  updatedAt: string;
}

// Sheet lifecycle: DRAFT → ACTIVE → LOCKED (or ARCHIVED)
export type SheetStatus = 'DRAFT' | 'ACTIVE' | 'LOCKED' | 'ARCHIVED';

// ─── SHEET STRUCTURE ───
// Defines the GRID LAYOUT of a sheet (columns + rows + cell definitions).
// Think of it as the "blueprint" for the spreadsheet — where each column
// and row goes, and what properties each cell has.
export interface SheetStructure {
  columns: SheetColumn[];               // All columns in order
  rows: SheetRow[];                     // All rows in order
  cells: Record<string, SheetCell>;     // Map of cellId → cell definition
}

// A single column definition (like column headers in Excel: A, B, C...)
export interface SheetColumn {
  id: string;                  // Unique column ID
  name: string;                // Display name (e.g., "Material", "Cost")
  type: CellDataType;          // What data this column holds (text, number, etc.)
  width?: number;              // Column width in pixels
  index: number;               // Position (0 = first column)
  parentId?: string;           // For sub-columns: which parent column this belongs to
  children?: string[];         // Sub-column IDs (for grouped/nested columns)
  isFixed: boolean;            // If true, column stays visible when scrolling
  validationRules?: ValidationRule[];  // Data validation for this column
}

// A single row definition (like row numbers in Excel: 1, 2, 3...)
export interface SheetRow {
  id: string;
  name: string;                // Row label (e.g., "Foundation", "Roofing")
  index: number;               // Position (0 = first row)
  parentId?: string;           // For sub-rows: which parent row this belongs to
  children?: string[];         // Sub-row IDs (for grouped/nested rows)
  metadata?: Record<string, any>;
}

// A single cell DEFINITION (not the VALUE — see CellData for values).
// This defines what the cell IS: its position, type, permissions.
export interface SheetCell {
  id: string;                  // e.g., "B3" (column B, row 3)
  rowId: string;               // Which row this cell belongs to
  columnId: string;            // Which column this cell belongs to
  rowIndex: number;            // Row position
  columnIndex: number;         // Column position
  dataType: CellDataType;      // Data type (text, number, date, etc.)
  isFixed: boolean;            // If true, cell can't be scrolled off screen
  permissions: CellPermissions; // Which roles can view/edit this cell
  validationRules?: ValidationRule[];  // Rules the value must follow
  formula?: string;            // Formula (e.g., "=SUM(B1:B5)")
  metadata?: Record<string, any>;
}

// ─── PERMISSION TYPES ───
// These control WHO can do WHAT in a sheet.

// Sheet-level permissions: a map of role → what that role can do
// Example: { "L1_ADMIN": { canView: true, canEdit: true, ... }, "CEO": { canView: true, canEdit: false, ... } }
export interface SheetPermissions {
  [role: string]: RolePermissions;   // Key = role name, Value = permissions
}

// What a specific role can do in a sheet
export interface RolePermissions {
  canView: boolean;            // Can see the sheet at all
  canEdit: boolean;            // Can change cell values
  canDelete: boolean;          // Can delete the sheet
  canCreateRows: boolean;      // Can add new rows
  canCreateColumns: boolean;   // Can add new columns
  canModifyStructure: boolean; // Can rename/reorder columns and rows
  canLock: boolean;            // Can lock the sheet (prevent edits)
  canUnlock: boolean;          // Can unlock a locked sheet
  editableCells?: string[];    // Specific cells this role CAN edit (e.g., ["B3", "C5"])
  readOnlyCells?: string[];    // Specific cells this role can ONLY view
}

// Cell-level permissions: which roles can interact with a specific cell
export interface CellPermissions {
  canView: UserRole[];     // Roles that can SEE this cell's value
  canEdit: UserRole[];     // Roles that can CHANGE this cell's value
  cannotSee: UserRole[];   // Roles that CANNOT see this cell at all (hidden)
}

// ─── CELL DATA TYPE ───
// A single cell value in a sheet (like cell B3 = "500").
// This is the actual DATA stored in the database for each cell.
// USED BY: Sheet editor (rendering/editing cells), cell permissions dialog
export interface CellData {
  id: string;
  sheetId: string;          // Which sheet this cell belongs to
  cellId: string;           // Cell identifier (e.g., "B3", "C5")
  rowIndex: number;         // Row number (0-based)
  columnIndex: number;      // Column number (0-based)
  value?: string;           // The text/string value
  numericValue?: number;    // Numeric value (for calculations)
  dataType: CellDataType;   // What kind of data (text, number, date, formula)
  status: CellDataStatus;   // Workflow status (draft, submitted, approved, rejected)
  metadata: Record<string, any>; // Extra info (formulas, formatting, etc.)
  version: number;          // Version number (for edit history)
  createdById: string;      // Who first entered this value
  creator?: User;
  lastModifiedById?: string; // Who last changed this value
  lastModifier?: User;
  approvedById?: string;    // Who approved this value (if applicable)
  approver?: User;
  approvedAt?: string;      // When it was approved
  createdAt: string;
  updatedAt: string;
}

// Cell data types: what kind of value the cell holds
export type CellDataType = 'TEXT' | 'NUMBER' | 'DATE' | 'BOOLEAN' | 'FILE' | 'FORMULA';

// Cell workflow status: tracks approval process
//   DRAFT → SUBMITTED (engineer submits) → APPROVED or REJECTED (senior reviews)
export type CellDataStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED';

// ─── VALIDATION RULES ───
// Rules that cell values must satisfy.
// Example: { type: 'min', value: 0, message: 'Must be positive' }
export interface ValidationRule {
  type: 'required' | 'min' | 'max' | 'pattern' | 'custom';  // What kind of check
  value?: any;           // The threshold/pattern (e.g., 0 for min, regex for pattern)
  message: string;       // Error message shown if validation fails
}

// ─── AUDIT LOG ───
// Records every important action in the system (who did what, when).
// Used for security, accountability, and the "Recent Activity" widget.
// USED BY: Admin dashboard activity feed, CEO reports
export interface AuditLog {
  id: string;
  userId: string;         // Who performed the action
  user?: User;
  action: string;         // What they did (e.g., "CREATE", "UPDATE", "DELETE")
  resource: string;       // What they acted on (e.g., "Sheet", "CellData")
  resourceId?: string;    // ID of the specific item
  oldValues?: Record<string, any>;  // Previous values (for tracking changes)
  newValues?: Record<string, any>;  // New values (what it changed to)
  ipAddress?: string;     // User's IP address
  userAgent?: string;     // User's browser info
  metadata: Record<string, any>;
  createdAt: string;      // When the action happened
}

// ─── API RESPONSE TYPES ───
// Every API call returns data in this standard format.
// success=true means the request worked; success=false means it failed.
export interface ApiResponse<T = any> {
  success: boolean;     // Did the request succeed?
  message?: string;     // Human-readable message (e.g., "Login successful")
  data?: T;             // The actual data (type depends on the API call)
  error?: string;       // Error message if failed
  errors?: ValidationError[];  // Field-level validation errors
}

// Validation error for a specific form field
// Example: { field: 'email', message: 'Email is required' }
export interface ValidationError {
  field: string;    // Which form field has the error
  message: string;  // What's wrong
  value?: any;      // What value was submitted
}

// Paginated response for lists (when there's too many items for one page)
export interface PaginatedResponse<T> {
  data: T[];         // The items on this page
  pagination: {
    page: number;    // Current page number
    limit: number;   // Items per page
    total: number;   // Total items across all pages
    pages: number;   // Total number of pages
  };
}

// ─── FORM TYPES ───
// These define the shape of form data submitted by users.

// Login form: just email + password
export interface LoginForm {
  email: string;
  password: string;
}

// Registration form: full user details
export interface RegisterForm {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  role: UserRole;      // Which role to assign (admin selects this)
  phone?: string;
}

// Create/edit project form
export interface ProjectForm {
  name: string;
  description?: string;
  location?: string;
  startDate?: string;
  endDate?: string;
  status: ProjectStatus;
  priority: ProjectPriority;
  budget?: number;
}

// Create/edit sheet form
export interface SheetForm {
  name: string;
  description?: string;
  projectId: string;     // Which project to create the sheet in
  isTemplate?: boolean;  // Is this a reusable template?
  templateId?: string;   // Create from an existing template?
}

// ─── SOCKET (REAL-TIME) EVENT TYPES ───
// These define the data format for WebSocket messages between frontend and backend.
// When User A edits a cell, the server sends a CellUpdateEvent to all other users.
export interface SocketEvents {
  // Events the SERVER sends TO the client (incoming)
  sheet_updated: (data: SheetUpdateEvent) => void;     // Sheet structure changed
  user_joined_project: (data: UserJoinEvent) => void;  // Someone joined the project
  user_left_project: (data: UserLeaveEvent) => void;   // Someone left the project
  cell_updated: (data: CellUpdateEvent) => void;       // A cell value changed
  
  // Events the CLIENT sends TO the server (outgoing)
  join_project: (projectId: string) => void;           // Subscribe to project updates
  leave_project: (projectId: string) => void;          // Unsubscribe from project
  sheet_update: (data: SheetUpdateEvent) => void;      // I changed the sheet structure
  cell_update: (data: CellUpdateEvent) => void;        // I edited a cell
}

// Data sent when a sheet is created/updated/deleted/locked
export interface SheetUpdateEvent {
  sheetId: string;
  projectId: string;
  userId: string;                                       // Who made the change
  action: 'create' | 'update' | 'delete' | 'lock' | 'unlock';
  data?: Partial<Sheet>;                                // The changed data
  timestamp: string;
}

// Data sent when a cell value changes
export interface CellUpdateEvent {
  sheetId: string;
  cellId: string;     // e.g., "B3"
  value: any;         // The new value
  userId: string;     // Who changed it
  timestamp: string;
}

// Data sent when a user opens/joins a project (real-time presence)
export interface UserJoinEvent {
  userId: string;
  projectId: string;
  user: User;           // Full user info (so we can show their name/avatar)
  timestamp: string;
}

// Data sent when a user leaves/closes a project
export interface UserLeaveEvent {
  userId: string;
  projectId: string;
  timestamp: string;
}

// ─── DASHBOARD TYPES ───
// Data structures used by the dashboard overview cards and charts.

// Stats shown on the admin dashboard overview tab
export interface DashboardStats {
  totalProjects: number;       // Total projects in the system
  activeProjects: number;      // Projects currently IN_PROGRESS
  completedProjects: number;   // Finished projects
  totalSheets: number;         // Total tracking sheets
  pendingApprovals: number;    // Cells waiting for approval
  recentActivity: AuditLog[];  // Last 10 actions (audit trail)
}

// Progress data for a single project (used in charts)
export interface ProjectProgress {
  projectId: string;
  projectName: string;
  progress: number;            // 0-100% completion
  status: ProjectStatus;
  dueDate?: string;
  issues: number;              // Number of open issues
}

// ─── MOBILE TYPES ───
// Extra data collected on mobile devices (Ground Manager in the field)
export interface MobileFormData {
  location?: GeolocationPosition;  // GPS coordinates from the phone
  photos?: File[];                 // Photos taken on site
  timestamp: string;               // When the data was collected
  deviceInfo?: {
    userAgent: string;             // Browser/device info
    screen: {
      width: number;               // Screen width in pixels
      height: number;              // Screen height in pixels
    };
  };
}