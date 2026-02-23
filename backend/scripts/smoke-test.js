// ================================================================
// SMOKE TEST (scripts/smoke-test.js)
// ================================================================
// PURPOSE: Quick sanity check that the backend works.
//
// WHAT IT DOES:
//   1. Connects to the database
//   2. Finds or creates an admin user
//   3. Creates a test project, sheet, and cell
//   4. Prints counts to verify everything saved
//
// RUN: node scripts/smoke-test.js
// If it prints "✅ Smoke test completed" → backend is healthy.
// ================================================================

const models = require('../models');
const { sequelize } = require('../config/database');

async function smokeTest() {
  try {
    console.log('🌡️  Running backend smoke test...');

    // Ensure connection
    await sequelize.authenticate();
    console.log('  DB connection OK');

    // Ensure there's a user to attribute createdById
    let user = await models.User.findOne({ where: { role: 'L1_ADMIN' } });
    if (!user) {
      user = await models.User.create({
        email: `smoke+${Date.now()}@example.local`,
        password: 'password',
        firstName: 'Smoke',
        lastName: 'Tester',
        role: 'L1_ADMIN',
      });
      console.log('  Created smoke user:', user.id);
    } else {
      console.log('  Using existing user:', user.id);
    }

    // Create a test project
    const project = await models.Project.create({
      name: `Smoke Test Project ${Date.now()}`,
      description: 'Created by smoke-test script',
      createdById: user.id,
    }).catch(err => { throw err; });
    console.log('  Created project:', project.id);

    // Create a sheet for the project
    const sheet = await models.Sheet.create({
      name: 'Smoke Test Sheet',
      projectId: project.id,
      createdById: user.id,
    });
    console.log('  Created sheet:', sheet.id);

    // Create a cell
    const cell = await models.CellData.create({
      sheetId: sheet.id,
      cellId: 'A1',
      rowIndex: 0,
      columnIndex: 0,
      value: '42',
      numericValue: 42,
      dataType: 'NUMBER',
      createdById: user.id,
    });
    console.log('  Created cell:', cell.id);

    // Query counts
    const projectCount = await models.Project.count();
    const sheetCount = await models.Sheet.count();
    const cellCount = await models.CellData.count();

    console.log(`  Totals - projects: ${projectCount}, sheets: ${sheetCount}, cells: ${cellCount}`);

    console.log('\n✅ Smoke test completed.');
    process.exit(0);
  } catch (err) {
    console.error('Smoke test failed:', err.message || err);
    console.error(err.stack || '');
    process.exit(1);
  }
}

smokeTest();
