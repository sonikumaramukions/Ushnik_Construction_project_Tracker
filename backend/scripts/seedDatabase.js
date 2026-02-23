// ================================================================
// SEED DATABASE (scripts/seedDatabase.js)
// ================================================================
// PURPOSE: Populates the database with sample data for development.
//
// CREATES:
//   - Admin user (admin@test.com / password)
//   - Sample project with sheets and cell data
//   - Users for each role (CEO, engineers, PM, ground mgr)
//
// RUN: node scripts/seedDatabase.js
// WARNING: Deletes existing data first!
// ================================================================

const bcrypt = require('bcryptjs');
const { sequelize } = require('../config/database');
const { User, Project, Sheet, CellData } = require('../models');

const seedDatabase = async () => {
  try {
    console.log('🔄 Starting database seeding...');

    // Force sync to create tables
    await sequelize.sync({ force: true });
    console.log('✅ Database tables created');

    // Create demo users
    const saltRounds = 12;
    const users = [
      {
        email: 'admin@construction.com',
        password: await bcrypt.hash('admin123', saltRounds),
        firstName: 'System',
        lastName: 'Administrator',
        role: 'L1_ADMIN',
        phone: '+1-555-0001',
      },
      {
        email: 'senior@construction.com',
        password: await bcrypt.hash('senior123', saltRounds),
        firstName: 'John',
        lastName: 'Senior',
        role: 'L2_SENIOR_ENGINEER',
        phone: '+1-555-0002',
      },
      {
        email: 'junior@construction.com',
        password: await bcrypt.hash('junior123', saltRounds),
        firstName: 'Alice',
        lastName: 'Junior',
        role: 'L3_JUNIOR_ENGINEER',
        phone: '+1-555-0003',
      },
      {
        email: 'pm@construction.com',
        password: await bcrypt.hash('pm123', saltRounds),
        firstName: 'Bob',
        lastName: 'Manager',
        role: 'PROJECT_MANAGER',
        phone: '+1-555-0004',
      },
      {
        email: 'ground@construction.com',
        password: await bcrypt.hash('ground123', saltRounds),
        firstName: 'Charlie',
        lastName: 'Supervisor',
        role: 'GROUND_MANAGER',
        phone: '+1-555-0005',
      },
      {
        email: 'ceo@construction.com',
        password: await bcrypt.hash('ceo123', saltRounds),
        firstName: 'David',
        lastName: 'Executive',
        role: 'CEO',
        phone: '+1-555-0006',
      },
    ];

    const createdUsers = await User.bulkCreate(users);
    console.log(`✅ Created ${createdUsers.length} demo users`);

    // Get admin user for project creation
    const admin = createdUsers.find(user => user.role === 'L1_ADMIN');

    // Create demo projects
    const projects = [
      {
        name: 'Downtown Office Complex',
        description: 'Construction of a 20-story office building in downtown area',
        location: 'Downtown, Metro City',
        startDate: new Date('2024-01-01'),
        endDate: new Date('2024-12-31'),
        status: 'IN_PROGRESS',
        priority: 'HIGH',
        budget: 50000000,
        actualCost: 15000000,
        progressPercentage: 35,
        createdById: admin.id,
      },
      {
        name: 'Highway Bridge Construction',
        description: 'Building a new suspension bridge over Metro River',
        location: 'Metro River Crossing',
        startDate: new Date('2024-03-01'),
        endDate: new Date('2025-06-30'),
        status: 'IN_PROGRESS',
        priority: 'CRITICAL',
        budget: 75000000,
        actualCost: 25000000,
        progressPercentage: 25,
        createdById: admin.id,
      },
      {
        name: 'Residential Complex Phase 1',
        description: 'Construction of 200 residential units',
        location: 'Suburban Area, Metro City',
        startDate: new Date('2024-02-01'),
        endDate: new Date('2024-10-31'),
        status: 'IN_PROGRESS',
        priority: 'MEDIUM',
        budget: 30000000,
        actualCost: 12000000,
        progressPercentage: 45,
        createdById: admin.id,
      },
    ];

    const createdProjects = await Project.bulkCreate(projects);
    console.log(`✅ Created ${createdProjects.length} demo projects`);

    // Create demo sheets
    for (const project of createdProjects) {
      const sheetStructure = {
        columns: [
          { id: 'col_1', name: 'Date', type: 'DATE', index: 0, isFixed: true, validationRules: [{ type: 'required', message: 'Date is required' }] },
          { id: 'col_2', name: 'Activity', type: 'TEXT', index: 1, isFixed: true, validationRules: [] },
          { id: 'col_3', name: 'Planned Progress (%)', type: 'NUMBER', index: 2, isFixed: false, validationRules: [{ type: 'min', value: 0, message: 'Must be >= 0' }, { type: 'max', value: 100, message: 'Must be <= 100' }] },
          { id: 'col_4', name: 'Actual Progress (%)', type: 'NUMBER', index: 3, isFixed: false, validationRules: [{ type: 'min', value: 0, message: 'Must be >= 0' }, { type: 'max', value: 100, message: 'Must be <= 100' }] },
          { id: 'col_5', name: 'Issues', type: 'TEXT', index: 4, isFixed: false, validationRules: [] },
          { id: 'col_6', name: 'Weather', type: 'TEXT', index: 5, isFixed: false, validationRules: [] },
        ],
        rows: [
          { id: 'row_1', name: 'Foundation', index: 0, metadata: {} },
          { id: 'row_2', name: 'Structure', index: 1, metadata: {} },
          { id: 'row_3', name: 'MEP Work', index: 2, metadata: {} },
          { id: 'row_4', name: 'Finishing', index: 3, metadata: {} },
        ],
        cells: {},
      };

      // Generate cell definitions
      sheetStructure.columns.forEach(col => {
        sheetStructure.rows.forEach(row => {
          const cellId = `cell_${row.index}_${col.index}`;
          sheetStructure.cells[cellId] = {
            id: cellId,
            rowId: row.id,
            columnId: col.id,
            rowIndex: row.index,
            columnIndex: col.index,
            dataType: col.type,
            isFixed: col.isFixed,
            permissions: {
              canView: ['L1_ADMIN', 'L2_SENIOR_ENGINEER', 'L3_JUNIOR_ENGINEER', 'PROJECT_MANAGER', 'GROUND_MANAGER', 'CEO'],
              canEdit: col.isFixed ? ['L1_ADMIN'] : ['L1_ADMIN', 'L2_SENIOR_ENGINEER', 'L3_JUNIOR_ENGINEER', 'GROUND_MANAGER'],
              cannotSee: [],
            },
            validationRules: col.validationRules,
            metadata: {},
          };
        });
      });

      const sheetPermissions = {
        'L1_ADMIN': {
          canView: true,
          canEdit: true,
          canDelete: true,
          canCreateRows: true,
          canCreateColumns: true,
          canModifyStructure: true,
          canLock: true,
          canUnlock: true,
        },
        'L2_SENIOR_ENGINEER': {
          canView: true,
          canEdit: true,
          canDelete: false,
          canCreateRows: false,
          canCreateColumns: false,
          canModifyStructure: false,
          canLock: false,
          canUnlock: false,
        },
        'L3_JUNIOR_ENGINEER': {
          canView: true,
          canEdit: true,
          canDelete: false,
          canCreateRows: false,
          canCreateColumns: false,
          canModifyStructure: false,
          canLock: false,
          canUnlock: false,
        },
        'PROJECT_MANAGER': {
          canView: true,
          canEdit: false,
          canDelete: false,
          canCreateRows: false,
          canCreateColumns: false,
          canModifyStructure: false,
          canLock: false,
          canUnlock: false,
        },
        'GROUND_MANAGER': {
          canView: true,
          canEdit: true,
          canDelete: false,
          canCreateRows: false,
          canCreateColumns: false,
          canModifyStructure: false,
          canLock: false,
          canUnlock: false,
        },
        'CEO': {
          canView: true,
          canEdit: false,
          canDelete: false,
          canCreateRows: false,
          canCreateColumns: false,
          canModifyStructure: false,
          canLock: false,
          canUnlock: false,
        },
      };

      const sheet = await Sheet.create({
        name: `${project.name} - Progress Tracker`,
        description: `Daily progress tracking sheet for ${project.name}`,
        projectId: project.id,
        structure: sheetStructure,
        permissions: sheetPermissions,
        validationRules: {},
        status: 'ACTIVE',
        version: 1,
        isTemplate: false,
        createdById: admin.id,
      });

      // Add some sample data
      const sampleData = [
        { cellId: 'cell_0_0', value: '2024-02-07', dataType: 'DATE' },
        { cellId: 'cell_0_1', value: 'Foundation excavation', dataType: 'TEXT' },
        { cellId: 'cell_0_2', value: '75', dataType: 'NUMBER', numericValue: 75 },
        { cellId: 'cell_0_3', value: '80', dataType: 'NUMBER', numericValue: 80 },
        { cellId: 'cell_0_4', value: 'Ahead of schedule', dataType: 'TEXT' },
        { cellId: 'cell_0_5', value: 'Clear, 22°C', dataType: 'TEXT' },
      ];

      const cellDataEntries = sampleData.map(data => ({
        sheetId: sheet.id,
        cellId: data.cellId,
        rowIndex: parseInt(data.cellId.split('_')[1]),
        columnIndex: parseInt(data.cellId.split('_')[2]),
        value: data.value,
        numericValue: data.numericValue || null,
        dataType: data.dataType,
        status: 'APPROVED',
        version: 1,
        createdById: admin.id,
        approvedById: admin.id,
        approvedAt: new Date(),
      }));

      await CellData.bulkCreate(cellDataEntries);
    }

    console.log('✅ Created demo sheets with sample data');

    console.log('🎉 Database seeding completed successfully!');
    console.log('\n📋 Demo Login Credentials:');
    console.log('Admin: admin@construction.com / admin123');
    console.log('Senior Engineer: senior@construction.com / senior123');
    console.log('Junior Engineer: junior@construction.com / junior123');
    console.log('Project Manager: pm@construction.com / pm123');
    console.log('Ground Manager: ground@construction.com / ground123');
    console.log('CEO: ceo@construction.com / ceo123');

  } catch (error) {
    console.error('❌ Database seeding failed:', error);
    throw error;
  }
};

// Run seeding if this file is executed directly
if (require.main === module) {
  seedDatabase()
    .then(() => {
      console.log('✅ Seeding completed, exiting...');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Seeding failed:', error);
      process.exit(1);
    });
}

module.exports = { seedDatabase };