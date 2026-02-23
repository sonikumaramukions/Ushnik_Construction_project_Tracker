/**
 * Migration: Add cell locking columns to cell_data table
 * Run: node scripts/add-cell-lock-columns.js
 */
const { sequelize } = require('../config/database');
const logger = require('../utils/logger');

async function migrate() {
  try {
    console.log('Adding cell lock columns to cell_data table...');

    // Check if columns already exist
    const tableInfo = await sequelize.getQueryInterface().describeTable('cell_data').catch(() => null);
    
    if (!tableInfo) {
      console.log('cell_data table does not exist yet. It will be created on server start with the new columns.');
      process.exit(0);
    }

    if (!tableInfo.is_locked) {
      await sequelize.getQueryInterface().addColumn('cell_data', 'is_locked', {
        type: require('sequelize').DataTypes.BOOLEAN,
        defaultValue: false,
        allowNull: false,
      });
      console.log('✅ Added is_locked column');
    } else {
      console.log('⏭️  is_locked column already exists');
    }

    if (!tableInfo.locked_by_id) {
      await sequelize.getQueryInterface().addColumn('cell_data', 'locked_by_id', {
        type: require('sequelize').DataTypes.UUID,
        allowNull: true,
        references: { model: 'users', key: 'id' },
      });
      console.log('✅ Added locked_by_id column');
    } else {
      console.log('⏭️  locked_by_id column already exists');
    }

    if (!tableInfo.locked_at) {
      await sequelize.getQueryInterface().addColumn('cell_data', 'locked_at', {
        type: require('sequelize').DataTypes.DATE,
        allowNull: true,
      });
      console.log('✅ Added locked_at column');
    } else {
      console.log('⏭️  locked_at column already exists');
    }

    console.log('\n✅ Migration complete! Cell lock columns are ready.');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

migrate();
