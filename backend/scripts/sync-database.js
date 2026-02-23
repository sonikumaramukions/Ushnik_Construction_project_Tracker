/**
 * Force database sync - creates all tables
 * WARNING: Use with caution in production
 */

const { sequelize } = require('../config/database');
const models = require('../models');

async function forceSyncDatabase() {
    try {
        console.log('🔄 Force syncing database...\n');

        // First, just sync new models without altering existing ones
        console.log('Creating new tables...');

        // Sync each new model individually
        await models.Report.sync();
        console.log('✅ Reports table created');

        await models.SheetVersion.sync();
        console.log('✅ Sheet versions table created');

        await models.Notification.sync();
        console.log('✅ Notifications table created');

        // Update sheets table with new column
        await models.Sheet.sync({ alter: true });
        console.log('✅ Sheets table updated');

        console.log('\n✨ Database sync complete!\n');

        // Verify tables exist
        const [results] = await sequelize.query(`
      SELECT name FROM sqlite_master 
      WHERE type='table' 
      ORDER BY name
    `);

        console.log('📊 All tables in database:');
        results.forEach(row => console.log(`   - ${row.name}`));

        process.exit(0);
    } catch (error) {
        console.error('❌ Sync failed:', error.message);
        console.error(error.stack);
        process.exit(1);
    }
}

forceSyncDatabase();
