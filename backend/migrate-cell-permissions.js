/**
 * Migration script to create cell_permissions and user_sheets tables
 * Run this to add the new tables to your database
 */

const { sequelize } = require('./config/database');
const { CellPermission, UserSheet } = require('./models');

async function migrate() {
    try {
        console.log('🔄 Starting migration...');

        // Create cell_permissions table
        console.log('Creating cell_permissions table...');
        await CellPermission.sync({ force: false });
        console.log('✅ cell_permissions table created');

        // Create user_sheets table
        console.log('Creating user_sheets table...');
        await UserSheet.sync({ force: false });
        console.log('✅ user_sheets table created');

        console.log('✅ Migration completed successfully!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

migrate();
