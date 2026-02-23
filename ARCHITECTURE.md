# 🎯 SYSTEM ARCHITECTURE DIAGRAM

## Overall System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        CONSTRUCTION TRACKER SYSTEM                           │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                          FRONTEND (React + TypeScript)                       │
│                          Port: 3000 (localhost:3000)                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │  Admin Dashboard with 9 Tabs:                                       │   │
│  │                                                                      │   │
│  │  [Overview] [Users] [Sheets] [📐] [🔐] [👥] [📊] [Logs] [Settings]│   │
│  │                                 ↑     ↑    ↑    ↑                   │   │
│  │                               NEW TABS!                             │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                    │                                        │
│         ┌──────────────────────────┼──────────────────────────┐            │
│         │                          │                          │            │
│  ┌─────────────────────┐  ┌──────────────────────┐  ┌──────────────────┐ │
│  │ FormulaBuilder.tsx  │  │PermissionManager.tsx │  │CollaborationMgr  │ │
│  ├─────────────────────┤  ├──────────────────────┤  ├──────────────────┤ │
│  │ • Cell ID input     │  │ • Permission table   │  │ • Share dialog   │ │
│  │ • Formula input     │  │ • Edit button        │  │ • Collab table   │ │
│  │ • Validate button   │  │ • Toggle switches    │  │ • Sync button    │ │
│  │ • Add formula       │  │ • Template selection │  │ • Remove access  │ │
│  │ • Formula table     │  │ • Role permissions   │  │ • Real-time sync │ │
│  │ • Recalculate btn   │  │ • Visual indicators  │  │ • Notifications  │ │
│  └─────────────────────┘  └──────────────────────┘  └──────────────────┘ │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │ CEOReportGenerator.tsx                                               │  │
│  ├──────────────────────────────────────────────────────────────────────┤  │
│  │ • Generate Report dialog    • Report history table                   │  │
│  │ • Title & description input • View & Download buttons               │  │
│  │ • Excel file download       • Access log display                    │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                                                                             │
│  ┌──────────────────────────────────────────────────────────────────────┐  │
│  │              API Service Layer (constructionServices.ts)             │  │
│  ├──────────────────────────────────────────────────────────────────────┤  │
│  │ • formulasAPI          • permissionsAPI      • collaborationAPI     │  │
│  │ • reportsAPI           • authAPI              • projectsAPI         │  │
│  └──────────────────────────────────────────────────────────────────────┘  │
│                          ↓              ↓              ↓                   │
│                    HTTP Requests    HTTP Requests   HTTP Requests         │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      │ REST API Calls
                                      │ (JSON over HTTP)
                                      ↓

┌─────────────────────────────────────────────────────────────────────────────┐
│                        BACKEND (Node.js + Express)                          │
│                        Port: 5001 (localhost:5001)                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      Route Handlers (routes/)                       │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │                                                                     │   │
│  │  formulas.js              rolePermissions.js                      │   │
│  │  ├─ POST /set/:id         ├─ GET /templates                       │   │
│  │  ├─ POST /validate        ├─ GET /:sheetId/:role                │   │
│  │  ├─ DELETE /:id           ├─ POST /batch                         │   │
│  │  └─ POST /recalculate     └─ POST /template/:template            │   │
│  │                                                                     │   │
│  │  sheetCollaboration.js    ceoReports.js                          │   │
│  │  ├─ POST /push-collaborate ├─ POST /generate                     │   │
│  │  ├─ GET /collaborators    ├─ GET /:id/download                  │   │
│  │  ├─ DELETE /collaboration ├─ GET /:id/access-log                │   │
│  │  └─ POST /sync-dashboard  └─ POST /:id/share                    │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                          ↓              ↓              ↓                   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                      Service Layer (services/)                      │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │                                                                     │   │
│  │  ┌────────────────────┐  ┌──────────────────────┐                 │   │
│  │  │ FormulaService.js  │  │ RolePermissionSvc.js │                 │   │
│  │  ├────────────────────┤  ├──────────────────────┤                 │   │
│  │  │ • parseFormula()   │  │ • setPermissions()   │                 │   │
│  │  │ • calculate()      │  │ • getPermissions()   │                 │   │
│  │  │ • validate()       │  │ • applyTemplate()    │                 │   │
│  │  │ • 12+ formula fn   │  │ • getDefaults()      │                 │   │
│  │  │ • dependency track │  │ • Permission matrix  │                 │   │
│  │  └────────────────────┘  └──────────────────────┘                 │   │
│  │                                                                     │   │
│  │  ┌────────────────────┐  ┌──────────────────────┐                 │   │
│  │  │SheetCollaboration  │  │ CEOReportService.js  │                 │   │
│  │  ├────────────────────┤  ├──────────────────────┤                 │   │
│  │  │ • pushToRoles()    │  │ • generate()         │                 │   │
│  │  │ • broadcast()      │  │ • exportToExcel()    │                 │   │
│  │  │ • syncDashboard()  │  │ • 4-sheet format     │                 │   │
│  │  │ • Socket.io events │  │ • trackAccess()      │                 │   │
│  │  │ • offline support  │  │ • shareWithCEO()     │                 │   │
│  │  └────────────────────┘  └──────────────────────┘                 │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                          ↓              ↓              ↓                   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                   Real-Time Layer (Socket.io)                       │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │                                                                     │   │
│  │  Events:                                                            │   │
│  │  • sheet_shared           → Notify when sheet shared              │   │
│  │  • sheet_updated          → Broadcast cell updates                │   │
│  │  • cell_updated           → Individual cell sync                  │   │
│  │  • sheet_synced_to_dash   → Dashboard synchronization             │   │
│  │                                                                     │   │
│  │  Room-Based Broadcasting:                                          │   │
│  │  • Rooms: [role]-[sheetId]                                        │   │
│  │  • Permission-aware delivery                                      │   │
│  │  • Real-time for all collaborators                                │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                          ↓              ↓              ↓                   │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                    Database Layer (models/)                         │   │
│  ├─────────────────────────────────────────────────────────────────────┤   │
│  │                                                                     │   │
│  │  Users  → Roles  → Permissions                                    │   │
│  │   ↓               ↓          ↓                                     │   │
│  │  Projects → Sheets → CellData → Formulas                          │   │
│  │              ↓          ↓                                           │   │
│  │          Notifications  Reports                                   │   │
│  │                                                                     │   │
│  │  + CellPermissions, AuditLogs, Financial Records, Market Data    │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                          ↓                                                  │
│                      SQLite Database                                       │
│                  (construction_tracker.db)                                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Data Flow Diagrams

### 1. Formula Flow

```
User Input (Frontend)
    ↓
[📐 Formulas Tab]
    ↓
Enter: Cell = A1, Formula = =SUM(B1:B10)
    ↓
Click "Validate Formula"
    ↓
    API: POST /api/formulas/validate
         ↓ (Backend)
    FormulaService.validateFormula()
    ├─ Check syntax
    ├─ Check cell references
    └─ Return validation result
         ↓
    API Response: { valid: true }
    ↓ (Frontend)
    Show success toast
    ↓
Click "Add Formula to Cell"
    ↓
    API: POST /api/formulas/set/sheet-123/A1
         { formula: "=SUM(B1:B10)" }
         ↓ (Backend)
    FormulaService.setFormula()
    ├─ Parse formula
    ├─ Calculate result
    ├─ Save to database
    ├─ Track dependencies [B1, B2, ..., B10]
    └─ Return calculated value
         ↓
    API Response: { 
      cellId: "A1",
      formula: "=SUM(B1:B10)",
      calculatedValue: 1500,
      dependencies: ["B1", "B2", ..., "B10"]
    }
    ↓ (Frontend)
    ├─ Display in table
    ├─ Show calculated value in chip
    ├─ Show dependencies as tags
    └─ Success toast: "Formula added!"
```

### 2. Permission Flow

```
Admin Action (Frontend)
    ↓
[🔐 Permissions Tab]
    ↓
Find Role: L3_JUNIOR_ENGINEER
Click "Edit"
    ↓
    Dialog opens with toggles:
    ☑️ Can View
    ☑️ Can Edit
    ☐ Can Approve
    ☐ Can Delete
    ☐ Can Share
    ↓
Toggle canApprove to ON
    ↓
Click "Save"
    ↓
    API: POST /api/role-permissions/sheet-123/L3_JUNIOR_ENGINEER
         {
           canView: true,
           canEdit: true,
           canApprove: true,
           canDelete: false,
           canShare: false
         }
         ↓ (Backend)
    RolePermissionService.setSheetPermissions()
    ├─ Validate permissions
    ├─ Update database
    ├─ Log audit trail
    └─ Return confirmation
         ↓
    API Response: { success: true, updated: true }
    ↓ (Frontend)
    ├─ Refresh permissions table
    ├─ Update display (checkmarks)
    ├─ Close dialog
    └─ Success toast: "Permissions updated!"
```

### 3. Collaboration Flow

```
Admin Action (Frontend)
    ↓
[👥 Collaboration Tab]
    ↓
Click "Share with Roles"
    ↓
    Dialog opens
    Select: L3_JUNIOR_ENGINEER, GROUND_MANAGER
    ↓
Click "Share Sheet"
    ↓
    API: POST /api/sheets/sheet-123/push-collaborate
         { rolesToShare: ["L3_JUNIOR_ENGINEER", "GROUND_MANAGER"] }
         ↓ (Backend)
    SheetCollaborationService.pushSheetToRoles()
    ├─ Find all users with these roles
    ├─ Save collaborator records
    ├─ Emit Socket.io: sheet_shared event
    │  ├─ To: role-sheet-123 room
    │  ├─ With: sheet details & permissions
    │  └─ Listeners: Users with that role
    ├─ Create notifications
    └─ Return success
         ↓
    Socket.io Broadcasting (Real-Time!)
    └─ Users with L3_JUNIOR_ENGINEER role receive:
       { type: "sheet_shared", sheetId: "sheet-123", ... }
         ↓
    API Response: { success: true, sharedRoles: [...] }
    ↓ (Frontend - Admin)
    ├─ Refresh collaborators table
    ├─ Show new roles
    └─ Success toast: "Sheet shared with 2 roles!"
    
    Meanwhile (Frontend - Junior Engineers & Ground Managers)
    ├─ Socket.io listener fires
    ├─ New sheet appears in their dashboard
    └─ Notification: "Road Construction sheet shared with you"
```

### 4. Report Generation Flow

```
Admin Action (Frontend)
    ↓
[📊 CEO Reports Tab]
    ↓
Click "Generate Report"
    ↓
    Dialog opens
    Title: "Q1 2026 Progress Report"
    Description: "Weekly construction progress"
    ↓
Click "Generate Report"
    ↓
    API: POST /api/ceo-reports/generate
         {
           sheetId: "sheet-123",
           title: "Q1 2026 Progress Report",
           description: "Weekly construction progress"
         }
         ↓ (Backend)
    CEOReportService.generateCEOReport()
    ├─ Load sheet data
    ├─ Calculate all formulas
    ├─ Create report object
    ├─ Save to database
    └─ Return report ID
         ↓
    Then: CEOReportService.exportCEOReportToExcel()
    ├─ Create Excel workbook (ExcelJS)
    ├─ Sheet 1: Summary
    │  └─ Project info, totals, metadata
    ├─ Sheet 2: Data
    │  └─ All cells with calculated values
    ├─ Sheet 3: Formulas
    │  └─ Formula details & dependencies
    ├─ Sheet 4: Metadata
    │  └─ Access tracking, timestamps
    ├─ Format professionally
    │  ├─ Headers: colored
    │  ├─ Alternating rows
    │  ├─ Column widths auto
    │  └─ Text wrapping enabled
    ├─ Generate binary blob
    └─ Return file reference
         ↓
    API Response: { 
      reportId: "report-789",
      title: "Q1 2026 Progress Report",
      createdAt: "2026-02-12T10:30:00Z",
      downloadUrl: "/api/ceo-reports/report-789/download"
    }
    ↓ (Frontend)
    ├─ Close dialog
    ├─ Add report to history table
    └─ Success toast: "Report generated!"
    
    When Admin clicks "Download Excel":
    ↓
    API: GET /api/ceo-reports/report-789/download
    ├─ Log access: { action: "download", userId: "admin-1" }
    ├─ Generate Excel file
    └─ Return as blob
         ↓
    Browser:
    ├─ Download file: CEO-Report-report-789.xlsx
    └─ File ready for sending to CEO!
```

---

## User Interaction Flow

### Admin User Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                      Admin Dashboard Entry                       │
└─────────────────────────────────────────────────────────────────┘
                              ↓
        ┌─────────────────────┼─────────────────────┐
        ↓                     ↓                     ↓
    [Overview]          [Users]              [Sheets]
    (System stats)      (User mgmt)          (Sheet list)
        ↓                     ↓                     ↓
    
    NEW FEATURE TABS:
    ├─────────────────────────────────────────────────┐
    │                                                 │
    ├─ 📐 Formulas                                    │
    │   ├─ Add formulas to cells                     │
    │   ├─ Validate syntax                           │
    │   ├─ View calculated values                    │
    │   ├─ See dependencies                          │
    │   └─ Recalculate all                           │
    │                                                 │
    ├─ 🔐 Permissions                                 │
    │   ├─ View permission matrix                    │
    │   ├─ Edit role permissions                     │
    │   ├─ Toggle 5 permission types                 │
    │   ├─ Apply templates                           │
    │   └─ Set defaults                              │
    │                                                 │
    ├─ 👥 Collaboration                               │
    │   ├─ Share with multiple roles                 │
    │   ├─ See all collaborators                     │
    │   ├─ Sync to dashboards                        │
    │   ├─ Remove access                             │
    │   └─ Monitor in real-time                      │
    │                                                 │
    ├─ 📊 CEO Reports                                 │
    │   ├─ Generate reports                          │
    │   ├─ Download Excel files                      │
    │   ├─ View access history                       │
    │   └─ Track who viewed/downloaded               │
    │                                                 │
    └─────────────────────────────────────────────────┘
```

### Collaborator User Flow (Real-Time)

```
L3_JUNIOR_ENGINEER Dashboard
        ↓
    [My Dashboard]
        ↓
Admin shares "Road Construction" sheet
        ↓
Socket.io Event Received: sheet_shared
        ↓
    ✅ New sheet appears INSTANTLY!
        ↓
    [Road Construction Sheet]
    ├─ Can view all cells
    ├─ Can edit cells (permission granted)
    ├─ Cannot approve (permission denied)
    ├─ Cannot delete (permission denied)
    └─ Cannot share (permission denied)
        ↓
Admin updates a cell: A1 = 1500
        ↓
Socket.io Event Received: cell_updated
        ↓
    ✅ Cell updates in real-time!
        ↓
Formulas recalculate automatically
        ↓
    ✅ B1 shows new calculated value!
        ↓
Admin generates report
        ↓
CEO downloads Excel
        ↓
All data, formulas, metadata included ✅
```

---

## Summary of All Connections

```
┌──────────────────┐
│  Frontend (React)│
└────────┬─────────┘
         │ HTTP/REST API
         ↓
┌──────────────────┐
│  Backend (Node)  │
├──────────────────┤
│  Services Layer  │
│  • Formula       │
│  • Permissions   │
│  • Collaboration │
│  • Reports       │
└────────┬─────────┘
         │ Database Ops + Socket.io
         ↓
┌──────────────────┐       ┌──────────────────┐
│   Database       │◄─────►│ Real-Time Socket │
│   (SQLite)       │       │     .io Events   │
└──────────────────┘       └──────────────────┘
                                    ↑
                                    │
                    ┌───────────────┼───────────────┐
                    │               │               │
                Users with      Users with     Users with
              L3_JUNIOR      GROUND_MANAGER      CEO Role
              Dashboard        Dashboard       Dashboard
```

---

## Component Hierarchy

```
AdminDashboard (625 lines)
├─ Overview Tab (renders: renderOverview)
│  └─ StatCard components
├─ Users Tab (renders: renderUserManagement)
│  └─ User management logic
├─ Sheets Tab (renders: SheetsManagement component)
├─ 📐 Formulas Tab (renders: FormulaBuilder component)
│  ├─ Text inputs (Cell ID, Formula)
│  ├─ Buttons (Validate, Add, Recalculate)
│  └─ Table (formulas with values & dependencies)
├─ 🔐 Permissions Tab (renders: PermissionManager component)
│  ├─ Permission matrix table (6 roles × 5 permissions)
│  ├─ Edit mode with toggle switches
│  └─ Template selection dialog
├─ 👥 Collaboration Tab (renders: CollaborationManager component)
│  ├─ Share dialog (multi-select dropdown)
│  ├─ Collaborators table
│  └─ Action buttons (Sync, Remove)
├─ 📊 CEO Reports Tab (renders: CEOReportGenerator component)
│  ├─ Generate dialog (title, description)
│  ├─ Reports table (history)
│  └─ Download buttons
├─ Audit Logs Tab (renders: renderAuditLogs)
└─ Settings Tab (renders: renderSystemSettings)
```

---

This completes the full system architecture documentation!
