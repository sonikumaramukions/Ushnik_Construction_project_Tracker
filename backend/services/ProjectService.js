// ================================================================
// PROJECT SERVICE (services/ProjectService.js)
// ================================================================
// PURPOSE: Minimal service for project creation and retrieval.
//
// METHODS:
//   createProject()  — Create a project inside a transaction
//   getProject()     — Get project with associated sheets
//
// USED BY: routes/projects.js
// ================================================================

const { Project, Sheet, sequelize } = require('../models');

class ProjectService {
  static async createProject({ name, description, createdById }) {
    return sequelize.transaction(async (t) => {
      const project = await Project.create({ name, description, createdById }, { transaction: t });
      return project;
    });
  }

  static async getProjectWithSheets(projectId) {
    return Project.findByPk(projectId, {
      include: [{ model: Sheet, as: 'sheets', attributes: ['id', 'name', 'status'] }]
    });
  }
}

module.exports = ProjectService;
