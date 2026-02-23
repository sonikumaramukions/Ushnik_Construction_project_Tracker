/**
 * Assignment Routes — Row/Column/Cell assignment workflow
 * 
 * Admin assigns rows/columns/cells to users or roles with questions.
 * Assigned users receive notifications, see their tasks, submit answers.
 * Answers auto-fill back into the admin's sheet.
 */
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { SheetAssignment, Sheet, CellData, User, Notification, UserSheet } = require('../models');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { Op } = require('sequelize');
const { sequelize } = require('../config/database');
const logger = require('../utils/logger');
const FormulaEngine = require('../services/formulaEngine');

// Helper: SQLite stores JSONB as string, so parse if needed
function parseJSON(val, fallback = []) {
  if (Array.isArray(val)) return val;
  if (typeof val === 'object' && val !== null) return val;
  if (typeof val === 'string') {
    try { return JSON.parse(val); } catch { return fallback; }
  }
  return fallback;
}

// ==========================================
// ADMIN: Create assignment (assign rows/columns/cells to user or role)
// ==========================================
router.post('/assign',
  authenticateToken,
  authorizeRoles('L1_ADMIN', 'L2_SENIOR_ENGINEER'),
  [
    body('sheetId').notEmpty().withMessage('Sheet ID is required'),
    body('assignmentType').isIn(['SHEET', 'ROW', 'COLUMN', 'CELL']).withMessage('Invalid assignment type'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const {
        sheetId, userId, assignedRole, assignmentType,
        assignedRows, assignedColumns, assignedCells,
        question, priority, dueDate, notes
      } = req.body;

      // Validate sheet exists
      const sheet = await Sheet.findByPk(sheetId, {
        include: [{ association: 'project', attributes: ['id', 'name'] }]
      });
      if (!sheet) {
        return res.status(404).json({ success: false, message: 'Sheet not found' });
      }

      // Must have either userId or assignedRole
      if (!userId && !assignedRole) {
        return res.status(400).json({ success: false, message: 'Either userId or assignedRole is required' });
      }

      // Create the assignment (wrapped in try/catch for constraint safety)
      let assignment;
      try {
        assignment = await SheetAssignment.create({
          sheetId,
          userId: userId || null,
          assignedRole: assignedRole || null,
          assignedById: req.user.id,
          assignmentType: assignmentType || 'SHEET',
          assignedRows: assignedRows || [],
          assignedColumns: assignedColumns || [],
          assignedCells: assignedCells || [],
          question: question || null,
          priority: priority || 'MEDIUM',
          dueDate: dueDate || null,
          notes: notes || null,
          status: 'PENDING',
        });
      } catch (createErr) {
        // If duplicate constraint, try to find existing and update
        if (createErr.name === 'SequelizeUniqueConstraintError') {
          logger.warn('Duplicate assignment detected, updating existing', { sheetId, userId, assignedRole });
          const existing = await SheetAssignment.findOne({
            where: {
              sheetId,
              ...(userId ? { userId } : {}),
              ...(assignedRole ? { assignedRole } : {}),
              assignmentType: assignmentType || 'SHEET',
            }
          });
          if (existing) {
            await existing.update({
              assignedRows: assignedRows || existing.assignedRows,
              assignedColumns: assignedColumns || existing.assignedColumns,
              assignedCells: assignedCells || existing.assignedCells,
              question: question || existing.question,
              priority: priority || existing.priority,
              dueDate: dueDate || existing.dueDate,
              notes: notes || existing.notes,
              status: 'PENDING',
            });
            assignment = existing;
          } else {
            throw createErr;
          }
        } else {
          throw createErr;
        }
      }

      // If assigning to a specific user, also create/update UserSheet for legacy compat
      if (userId) {
        await UserSheet.findOrCreate({
          where: { sheetId, userId },
          defaults: { status: 'pending' }
        });
      }

      // Create notification(s)
      const notificationTitle = `New Task: ${sheet.name}`;
      const notificationMessage = question
        ? `You have been assigned a task on "${sheet.name}": ${question}`
        : `You have been assigned ${assignmentType.toLowerCase()}(s) on sheet "${sheet.name}"`;

      if (userId) {
        // Notify specific user
        await Notification.create({
          userId,
          type: 'TASK_ASSIGNED',
          title: notificationTitle,
          message: notificationMessage,
          data: {
            assignmentId: assignment.id,
            sheetId,
            sheetName: sheet.name,
            projectName: sheet.project?.name,
            assignmentType,
            assignedRows,
            assignedColumns,
            assignedCells,
            question,
            priority,
            dueDate,
          },
          priority: priority || 'MEDIUM',
        });

        // Emit socket event to specific user
        if (req.io) {
          req.io.to(`user_${userId}`).emit('task_assigned', {
            assignmentId: assignment.id,
            sheetId,
            sheetName: sheet.name,
            assignmentType,
            question,
            assignedBy: `${req.user.firstName} ${req.user.lastName}`,
            timestamp: new Date().toISOString(),
          });
        }
      } else if (assignedRole) {
        // Find all users with this role and notify each
        const roleUsers = await User.findAll({
          where: { role: assignedRole, isActive: true },
          attributes: ['id']
        });

        for (const roleUser of roleUsers) {
          await Notification.create({
            userId: roleUser.id,
            type: 'TASK_ASSIGNED',
            title: notificationTitle,
            message: notificationMessage,
            data: {
              assignmentId: assignment.id,
              sheetId,
              sheetName: sheet.name,
              assignmentType,
              assignedRows,
              assignedColumns,
              assignedCells,
              question,
              priority,
              dueDate,
            },
            priority: priority || 'MEDIUM',
          });

          // Also create UserSheet record
          await UserSheet.findOrCreate({
            where: { sheetId, userId: roleUser.id },
            defaults: { status: 'pending' }
          });
        }

        // Emit socket event to role room
        if (req.io) {
          req.io.to(`role_${assignedRole}`).emit('task_assigned', {
            assignmentId: assignment.id,
            sheetId,
            sheetName: sheet.name,
            assignmentType,
            question,
            assignedBy: `${req.user.firstName} ${req.user.lastName}`,
            timestamp: new Date().toISOString(),
          });
        }
      }

      // Also create a notification record for the ADMIN who sent the assignment (for their history)
      await Notification.create({
        userId: req.user.id,
        type: 'TASK_SENT',
        title: `Task sent: ${sheet.name}`,
        message: userId
          ? `You assigned a ${assignmentType.toLowerCase()} task on "${sheet.name}" to a user.`
          : `You assigned a ${assignmentType.toLowerCase()} task on "${sheet.name}" to role ${assignedRole}.`,
        data: {
          assignmentId: assignment.id,
          sheetId,
          sheetName: sheet.name,
          assignmentType,
          assignedRole,
          question,
        },
        priority: priority || 'MEDIUM',
      });

      // Fetch created assignment with associations
      const created = await SheetAssignment.findByPk(assignment.id, {
        include: [
          { association: 'sheet', attributes: ['id', 'name'] },
          { association: 'user', attributes: ['id', 'firstName', 'lastName', 'email', 'role'] },
          { association: 'assignedBy', attributes: ['id', 'firstName', 'lastName'] },
        ]
      });

      res.status(201).json({
        success: true,
        message: 'Assignment created successfully',
        assignment: created,
      });

    } catch (error) {
      logger.error('Create assignment error:', error);
      res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
    }
  }
);

// ==========================================
// GET: My tasks (for assigned users — L2/L3/Ground Manager)
// ==========================================
router.get('/my-tasks', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = req.user.role;

    // Find assignments for this user (direct or by role)
    const assignments = await SheetAssignment.findAll({
      where: {
        [Op.or]: [
          { userId },
          { assignedRole: userRole },
        ],
        status: { [Op.notIn]: ['REVOKED'] },
      },
      include: [
        {
          association: 'sheet',
          attributes: ['id', 'name', 'status', 'projectId', 'structure'],
          include: [{ association: 'project', attributes: ['id', 'name'] }]
        },
        { association: 'assignedBy', attributes: ['id', 'firstName', 'lastName'] },
      ],
      order: [
        ['priority', 'DESC'],
        ['createdAt', 'DESC'],
      ],
    });

    // Enrich with current cell values for assigned cells
    const enriched = [];
    for (const assignment of assignments) {
      const a = assignment.toJSON();

      // Parse JSON fields that SQLite may store as strings
      a.assignedRows = parseJSON(a.assignedRows, []);
      a.assignedColumns = parseJSON(a.assignedColumns, []);
      a.assignedCells = parseJSON(a.assignedCells, []);
      a.response = parseJSON(a.response, null);

      // Get current cell values for the assigned area
      const cellWhere = { sheetId: a.sheetId };
      let cellData = [];

      if (a.assignmentType === 'ROW' && a.assignedRows.length > 0) {
        cellData = await CellData.findAll({
          where: { sheetId: a.sheetId, rowIndex: { [Op.in]: a.assignedRows.map(r => r - 1) } }
        });
      } else if (a.assignmentType === 'COLUMN' && a.assignedColumns.length > 0) {
        const colIndices = a.assignedColumns.map(c => c.charCodeAt(0) - 65);
        cellData = await CellData.findAll({
          where: { sheetId: a.sheetId, columnIndex: { [Op.in]: colIndices } }
        });
      } else if (a.assignmentType === 'CELL' && a.assignedCells.length > 0) {
        cellData = await CellData.findAll({
          where: { sheetId: a.sheetId, cellId: { [Op.in]: a.assignedCells } }
        });
      } else {
        // SHEET assignment — get all cells
        cellData = await CellData.findAll({ where: { sheetId: a.sheetId } });
      }

      a.cellData = cellData.map(cd => ({
        cellId: cd.cellId,
        value: cd.value,
        dataType: cd.dataType,
        rowIndex: cd.rowIndex,
        columnIndex: cd.columnIndex,
      }));

      enriched.push(a);
    }

    res.json({
      success: true,
      tasks: enriched,
      total: enriched.length,
    });

  } catch (error) {
    logger.error('Get my tasks error:', error);
    res.status(500).json({ success: false, message: 'Failed to load tasks', error: error.message });
  }
});

// ==========================================
// POST: Submit response for an assignment
// ==========================================
router.post('/:id/respond',
  authenticateToken,
  [
    body('values').isObject().withMessage('Values object is required (cellId → value map)'),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { id } = req.params;
      const { values, note } = req.body; // values = { "A1": "answer1", "B1": "answer2" }

      const assignment = await SheetAssignment.findByPk(id, {
        include: [
          { association: 'sheet', attributes: ['id', 'name', 'projectId', 'formulas'], include: [{ association: 'project', attributes: ['id', 'name'] }] },
        ]
      });

      if (!assignment) {
        return res.status(404).json({ success: false, message: 'Assignment not found' });
      }

      // Verify the current user is the assignee (or has the assigned role)
      const userId = req.user.id;
      const userRole = req.user.role;
      if (assignment.userId && assignment.userId !== userId) {
        return res.status(403).json({ success: false, message: 'This assignment is not yours' });
      }
      if (assignment.assignedRole && assignment.assignedRole !== userRole && assignment.userId !== userId) {
        return res.status(403).json({ success: false, message: 'This assignment is not for your role' });
      }

      if (assignment.status === 'REVOKED') {
        return res.status(400).json({ success: false, message: 'This assignment has been revoked' });
      }

      // Write values into the MAIN sheet's CellData (auto-fill admin's sheet)
      const sheetId = assignment.sheetId;

      await sequelize.transaction(async (tx) => {
        for (const [cellId, value] of Object.entries(values)) {
          const match = cellId.match(/^([A-Z]+)(\d+)$/);
          const columnIndex = match ? match[1].charCodeAt(0) - 65 : 0;
          const rowIndex = match ? parseInt(match[2]) - 1 : 0;

          let cell = await CellData.findOne({
            where: { sheetId, cellId },
            transaction: tx,
          });

          if (cell) {
            cell.value = value != null ? String(value) : '';
            cell.lastModifiedById = userId;
            cell.status = 'SUBMITTED';
            const numVal = parseFloat(value);
            if (!isNaN(numVal)) cell.numericValue = numVal;
            await cell.save({ transaction: tx });
          } else {
            cell = await CellData.create({
              sheetId,
              cellId,
              rowIndex,
              columnIndex,
              value: value != null ? String(value) : '',
              dataType: 'TEXT',
              status: 'SUBMITTED',
              createdById: userId,
              lastModifiedById: userId,
            }, { transaction: tx });
          }
        }

        // Recalculate formulas after inserting values
        try {
          const sheetWithCells = await Sheet.findByPk(sheetId, {
            include: ['cellData'],
            transaction: tx,
          });
          const formulas = sheetWithCells.formulas || {};
          if (Object.keys(formulas).length > 0) {
            const cMap = {};
            sheetWithCells.cellData.forEach(cd => { cMap[cd.cellId] = { value: cd.value }; });
            const recalculated = FormulaEngine.recalculateSheet(formulas, cMap);

            for (const [cid, obj] of Object.entries(recalculated)) {
              if (!obj.isCalculated) continue;
              const existing = sheetWithCells.cellData.find(x => x.cellId === cid);
              if (existing) {
                existing.value = String(obj.value);
                const numeric = parseFloat(obj.value);
                if (!isNaN(numeric)) existing.numericValue = numeric;
                await existing.save({ transaction: tx });
              }
            }
          }
        } catch (err) {
          logger.warn('Formula recalculation after response: ' + err.message);
        }
      });

      // Update assignment status
      await assignment.update({
        status: 'SUBMITTED',
        respondedAt: new Date(),
        response: {
          values,
          note: note || null,
          submittedAt: new Date().toISOString(),
          submittedBy: userId,
        },
      });

      // Update UserSheet if exists
      const userSheet = await UserSheet.findOne({ where: { sheetId, userId } });
      if (userSheet) {
        const cellChanges = userSheet.cellChanges || {};
        Object.entries(values).forEach(([cellId, value]) => {
          cellChanges[cellId] = { newValue: value, timestamp: new Date().toISOString() };
        });
        await userSheet.update({
          status: 'submitted',
          submittedAt: new Date(),
          cellChanges,
        });
      }

      // Notify the admin who created this assignment
      await Notification.create({
        userId: assignment.assignedById,
        type: 'TASK_RESPONSE',
        title: `Response received: ${assignment.sheet.name}`,
        message: `${req.user.firstName} ${req.user.lastName} responded to your assignment on "${assignment.sheet.name}"`,
        data: {
          assignmentId: assignment.id,
          sheetId,
          sheetName: assignment.sheet.name,
          respondedBy: userId,
          respondedByName: `${req.user.firstName} ${req.user.lastName}`,
          cellCount: Object.keys(values).length,
        },
        priority: 'HIGH',
      });

      // Emit socket events
      if (req.io) {
        // Notify admin
        req.io.to(`user_${assignment.assignedById}`).emit('task_response', {
          assignmentId: assignment.id,
          sheetId,
          sheetName: assignment.sheet.name,
          respondedBy: `${req.user.firstName} ${req.user.lastName}`,
          cellCount: Object.keys(values).length,
          timestamp: new Date().toISOString(),
        });

        // Notify all viewers of this sheet that cells were updated
        req.io.to(`sheet_${sheetId}`).emit('bulk_cells_updated', {
          sheetId,
          updatedCells: Object.keys(values).map(cellId => ({
            cellId,
            value: values[cellId],
          })),
          userId,
          userName: `${req.user.firstName} ${req.user.lastName}`,
          timestamp: new Date().toISOString(),
        });
      }

      res.json({
        success: true,
        message: 'Response submitted successfully. Values have been filled into the sheet.',
        assignment: {
          id: assignment.id,
          status: 'SUBMITTED',
          respondedAt: assignment.respondedAt,
        },
      });

    } catch (error) {
      logger.error('Submit response error:', error);
      res.status(500).json({ success: false, message: 'Failed to submit response', error: error.message });
    }
  }
);

// ==========================================
// GET: Sheet assignment history (Admin view)
// ==========================================
router.get('/sheet/:sheetId/history', authenticateToken, async (req, res) => {
  try {
    const { sheetId } = req.params;

    const sheet = await Sheet.findByPk(sheetId, {
      attributes: ['id', 'name', 'status', 'projectId'],
    });
    if (!sheet) {
      return res.status(404).json({ success: false, message: 'Sheet not found' });
    }

    const assignments = await SheetAssignment.findAll({
      where: { sheetId },
      include: [
        { association: 'user', attributes: ['id', 'firstName', 'lastName', 'email', 'role'] },
        { association: 'assignedBy', attributes: ['id', 'firstName', 'lastName'] },
      ],
      order: [['createdAt', 'DESC']],
    });

    // Parse JSON fields for SQLite compatibility
    const parsed = assignments.map(a => {
      const j = a.toJSON();
      j.assignedRows = parseJSON(j.assignedRows, []);
      j.assignedColumns = parseJSON(j.assignedColumns, []);
      j.assignedCells = parseJSON(j.assignedCells, []);
      j.response = parseJSON(j.response, null);
      return j;
    });

    res.json({
      success: true,
      sheet: { id: sheet.id, name: sheet.name, status: sheet.status },
      history: parsed,
      total: parsed.length,
    });

  } catch (error) {
    logger.error('Get sheet history error:', error);
    res.status(500).json({ success: false, message: 'Failed to load history', error: error.message });
  }
});

// ==========================================
// GET: All assignments (Admin overview)
// ==========================================
router.get('/all',
  authenticateToken,
  authorizeRoles('L1_ADMIN', 'L2_SENIOR_ENGINEER'),
  async (req, res) => {
    try {
      const { status, sheetId, projectId } = req.query;
      const where = {};
      if (status) where.status = status;
      if (sheetId) where.sheetId = sheetId;

      const include = [
        {
          association: 'sheet',
          attributes: ['id', 'name', 'projectId'],
          include: [{ association: 'project', attributes: ['id', 'name'] }],
        },
        { association: 'user', attributes: ['id', 'firstName', 'lastName', 'email', 'role'] },
        { association: 'assignedBy', attributes: ['id', 'firstName', 'lastName'] },
      ];

      // Filter by projectId through Sheet
      if (projectId) {
        include[0].where = { projectId };
      }

      const assignments = await SheetAssignment.findAll({
        where,
        include,
        order: [['createdAt', 'DESC']],
      });

      // Parse JSON fields for SQLite compatibility
      const parsed = assignments.map(a => {
        const j = a.toJSON();
        j.assignedRows = parseJSON(j.assignedRows, []);
        j.assignedColumns = parseJSON(j.assignedColumns, []);
        j.assignedCells = parseJSON(j.assignedCells, []);
        j.response = parseJSON(j.response, null);
        return j;
      });

      res.json({
        success: true,
        assignments: parsed,
        total: parsed.length,
      });

    } catch (error) {
      logger.error('Get all assignments error:', error);
      res.status(500).json({ success: false, message: 'Failed to load assignments', error: error.message });
    }
  }
);

// ==========================================
// PATCH: Update assignment status (Admin — approve/reject/revoke)
// ==========================================
router.patch('/:id/status',
  authenticateToken,
  authorizeRoles('L1_ADMIN', 'L2_SENIOR_ENGINEER'),
  [
    body('status').isIn(['PENDING', 'IN_PROGRESS', 'APPROVED', 'REJECTED', 'REVOKED']),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, errors: errors.array() });
      }

      const { id } = req.params;
      const { status, feedback } = req.body;

      const assignment = await SheetAssignment.findByPk(id, {
        include: [
          { association: 'sheet', attributes: ['id', 'name'] },
        ]
      });
      if (!assignment) {
        return res.status(404).json({ success: false, message: 'Assignment not found' });
      }

      await assignment.update({
        status,
        notes: feedback ? `${assignment.notes || ''}\n[${status}] ${feedback}` : assignment.notes,
      });

      // Notify the assignee
      const notifyUserId = assignment.userId;
      if (notifyUserId) {
        await Notification.create({
          userId: notifyUserId,
          type: status === 'APPROVED' ? 'CELL_APPROVED' : status === 'REJECTED' ? 'CELL_REJECTED' : 'GENERAL',
          title: `Assignment ${status.toLowerCase()}: ${assignment.sheet.name}`,
          message: feedback || `Your assignment on "${assignment.sheet.name}" has been ${status.toLowerCase()}.`,
          data: {
            assignmentId: assignment.id,
            sheetId: assignment.sheetId,
            status,
          },
          priority: 'HIGH',
        });

        if (req.io) {
          req.io.to(`user_${notifyUserId}`).emit('assignment_status_changed', {
            assignmentId: assignment.id,
            status,
            sheetName: assignment.sheet.name,
          });
        }
      }

      res.json({
        success: true,
        message: `Assignment ${status.toLowerCase()} successfully`,
        assignment,
      });

    } catch (error) {
      logger.error('Update assignment status error:', error);
      res.status(500).json({ success: false, message: 'Failed to update status', error: error.message });
    }
  }
);

// ==========================================
// GET: Notifications for current user
// ==========================================
router.get('/notifications', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { unreadOnly } = req.query;

    const where = { userId };
    if (unreadOnly === 'true') where.isRead = false;

    const notifications = await Notification.findAll({
      where,
      order: [['createdAt', 'DESC']],
      limit: 50,
    });

    const unreadCount = await Notification.count({
      where: { userId, isRead: false },
    });

    res.json({
      success: true,
      notifications,
      unreadCount,
    });

  } catch (error) {
    logger.error('Get notifications error:', error);
    res.status(500).json({ success: false, message: 'Failed to load notifications', error: error.message });
  }
});

// ==========================================
// PATCH: Mark notification(s) as read
// ==========================================
router.patch('/notifications/read', authenticateToken, async (req, res) => {
  try {
    const { notificationIds } = req.body; // array of IDs, or "all"
    const userId = req.user.id;

    if (notificationIds === 'all') {
      await Notification.update(
        { isRead: true, readAt: new Date() },
        { where: { userId, isRead: false } }
      );
    } else if (Array.isArray(notificationIds)) {
      await Notification.update(
        { isRead: true, readAt: new Date() },
        { where: { id: { [Op.in]: notificationIds }, userId } }
      );
    }

    res.json({ success: true, message: 'Notifications marked as read' });

  } catch (error) {
    logger.error('Mark notifications read error:', error);
    res.status(500).json({ success: false, message: 'Failed to update notifications', error: error.message });
  }
});

module.exports = router;
