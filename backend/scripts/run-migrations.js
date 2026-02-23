// ================================================================
// RUN MIGRATIONS (scripts/run-migrations.js)
// ================================================================
// PURPOSE: Syncs all Sequelize models with the database.
// Creates any missing tables/columns.
// RUN: node scripts/run-migrations.js
// ================================================================

const { sequelize } = require('../config/database');
const models = require('../models');

/**
 * Simple migration runner using Sequelize model sync.
 * This will create or alter tables to match models. Safe for development.
 * WARNING: In production prefer proper migrations (umzug / sequelize-cli).
 */
async function runMigrations() {
  try {
    console.log('🔧 Running model sync for core tables...');

    // Sync core models - adjust order if you have FK dependencies
    await models.Project.sync({ alter: true });
    console.log('  ✅ projects');

    await models.Sheet.sync({ alter: true });
    console.log('  ✅ sheets');

    await models.CellData.sync({ alter: true });
    console.log('  ✅ cell_data');

    await models.CellPermission.sync({ alter: true });
    console.log('  ✅ cell_permissions');

    await models.UserSheet.sync({ alter: true });
    console.log('  ✅ user_sheets');

    await models.SheetAssignment.sync({ alter: true });
    console.log('  ✅ sheet_assignments');

    // Sync other models conservatively
    if (models.SheetVersion) {
      await models.SheetVersion.sync({ alter: true });
      console.log('  ✅ sheet_versions');
    }

    console.log('\n✨ Migration sync complete.');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err.message || err);
    console.error(err.stack || '');
    process.exit(1);
  }
}

runMigrations();
