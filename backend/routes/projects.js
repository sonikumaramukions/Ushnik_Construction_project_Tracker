// ================================================================
// PROJECT ROUTES (routes/projects.js)
// ================================================================
// PURPOSE: CRUD operations for construction projects.
//
// Projects are the TOP-LEVEL container in the app hierarchy:
//   Project → Sheets → Cells
//
// ENDPOINTS:
//   GET  /api/projects/          — List all projects (paginated, filterable)
//   GET  /api/projects/:id       — Get project details with sheets
//   POST /api/projects/          — Create a new project (L1_ADMIN, PM)
//   PUT  /api/projects/:id       — Update a project (L1_ADMIN, PM)
//   DELETE /api/projects/:id     — Delete a project (L1_ADMIN only)
//
// ACCESS: L1_ADMIN and PROJECT_MANAGER for write, all for read
// ================================================================

const express = require('express');
const { body, validationResult, query } = require('express-validator');
const { Project } = require('../models');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const { auditLog } = require('../middleware/audit');
const logger = require('../utils/logger');

const router = express.Router();

// Get all projects
router.get('/', 
  authenticateToken,
  [
    query('page').optional().isInt({ min: 1 }),
    query('limit').optional().isInt({ min: 1, max: 100 }),
    query('status').optional().isIn(['PLANNING', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED']),
    query('priority').optional().isIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  ],
  auditLog('VIEW_PROJECTS', 'PROJECT'),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const offset = (page - 1) * limit;

      const where = {};
      if (req.query.status) where.status = req.query.status;
      if (req.query.priority) where.priority = req.query.priority;

      // Role-based filtering
      if (!['L1_ADMIN', 'PROJECT_MANAGER', 'CEO'].includes(req.user.role)) {
        // Limit to assigned projects for other roles
        // This would be implemented with a user-project assignment table in a real app
      }

      const { count, rows: projects } = await Project.findAndCountAll({
        where,
        limit,
        offset,
        include: [
          {
            association: 'creator',
            attributes: ['id', 'firstName', 'lastName', 'email'],
          },
          {
            association: 'sheets',
            attributes: ['id', 'name', 'status'],
          },
        ],
        order: [['createdAt', 'DESC']],
      });

      res.json({
        projects,
        pagination: {
          page,
          limit,
          total: count,
          pages: Math.ceil(count / limit),
        },
      });

    } catch (error) {
      logger.error('Get projects error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
);

// Get project by ID
router.get('/:id',
  authenticateToken,
  auditLog('VIEW_PROJECT', 'PROJECT'),
  async (req, res) => {
    try {
      const project = await Project.findByPk(req.params.id, {
        include: [
          {
            association: 'creator',
            attributes: ['id', 'firstName', 'lastName', 'email'],
          },
          {
            association: 'sheets',
            attributes: ['id', 'name', 'description', 'status', 'createdAt'],
            include: [
              {
                association: 'creator',
                attributes: ['id', 'firstName', 'lastName'],
              },
            ],
          },
        ],
      });

      if (!project) {
        return res.status(404).json({ message: 'Project not found' });
      }

      res.json({ project });

    } catch (error) {
      logger.error('Get project error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
);

// Create project (Admin and PM only)
router.post('/',
  authenticateToken,
  authorizeRoles('L1_ADMIN', 'PROJECT_MANAGER'),
  [
    body('name').notEmpty().trim().isLength({ min: 3, max: 255 }),
    body('description').optional().trim(),
    body('location').optional().trim(),
    body('startDate').optional().isISO8601(),
    body('endDate').optional().isISO8601(),
    body('status').optional().isIn(['PLANNING', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED']),
    body('priority').optional().isIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
    body('budget').optional().isNumeric(),
  ],
  auditLog('CREATE_PROJECT', 'PROJECT'),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const projectData = {
        ...req.body,
        createdById: req.user.id,
      };

      const project = await Project.create(projectData);

      // Fetch the created project with associations
      const createdProject = await Project.findByPk(project.id, {
        include: [
          {
            association: 'creator',
            attributes: ['id', 'firstName', 'lastName', 'email'],
          },
        ],
      });

      res.status(201).json({
        message: 'Project created successfully',
        project: createdProject,
      });

    } catch (error) {
      logger.error('Create project error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
);

// Update project
router.put('/:id',
  authenticateToken,
  authorizeRoles('L1_ADMIN', 'PROJECT_MANAGER'),
  [
    body('name').optional().notEmpty().trim().isLength({ min: 3, max: 255 }),
    body('description').optional().trim(),
    body('location').optional().trim(),
    body('startDate').optional().isISO8601(),
    body('endDate').optional().isISO8601(),
    body('status').optional().isIn(['PLANNING', 'IN_PROGRESS', 'ON_HOLD', 'COMPLETED', 'CANCELLED']),
    body('priority').optional().isIn(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
    body('budget').optional().isNumeric(),
    body('actualCost').optional().isNumeric(),
    body('progressPercentage').optional().isInt({ min: 0, max: 100 }),
  ],
  auditLog('UPDATE_PROJECT', 'PROJECT'),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const project = await Project.findByPk(req.params.id);
      if (!project) {
        return res.status(404).json({ message: 'Project not found' });
      }

      // Store original data for audit
      req.originalData = project.toJSON();

      await project.update(req.body);

      // Fetch updated project with associations
      const updatedProject = await Project.findByPk(project.id, {
        include: [
          {
            association: 'creator',
            attributes: ['id', 'firstName', 'lastName', 'email'],
          },
        ],
      });

      res.json({
        message: 'Project updated successfully',
        project: updatedProject,
      });

    } catch (error) {
      logger.error('Update project error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
);

// Delete project (Admin only)
router.delete('/:id',
  authenticateToken,
  authorizeRoles('L1_ADMIN'),
  auditLog('DELETE_PROJECT', 'PROJECT'),
  async (req, res) => {
    try {
      const project = await Project.findByPk(req.params.id);
      if (!project) {
        return res.status(404).json({ message: 'Project not found' });
      }

      // Store project data for audit
      req.originalData = project.toJSON();

      await project.destroy();

      res.json({ message: 'Project deleted successfully' });

    } catch (error) {
      logger.error('Delete project error:', error);
      res.status(500).json({ message: 'Internal server error' });
    }
  }
);

module.exports = router;