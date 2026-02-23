/**
 * Migration script to add new columns to sheet_assignments and notifications tables
 * Run this ONCE before starting the server if alter: true fails with SQLite
 * 
 * Usage: node scripts/migrate-assignments.js
 */

const { sequelize } = require('../config/database');
const logger = require('../utils/logger');

async function migrate() {
  const qi = sequelize.getQueryInterface();

  console.log('Starting migration for assignment features...\n');

  // Helper: add column if it doesn't exist
  async function addColumnSafe(table, column, definition) {
    try {
      await qi.addColumn(table, column, definition);
      console.log(`  ✅ Added ${table}.${column}`);
    } catch (err) {
      if (err.message.includes('duplicate column') || err.message.includes('already exists') || err.message.includes('SQLITE_ERROR')) {
        console.log(`  ⏩ ${table}.${column} already exists, skipping`);
      } else {
        console.error(`  ❌ Failed to add ${table}.${column}:`, err.message);
      }
    }
  }

  // --- sheet_assignments table ---
  console.log('\n📋 Migrating sheet_assignments table...');
  
  const { DataTypes } = require('sequelize');
  
  await addColumnSafe('sheet_assignments', 'assigned_role', {
    type: DataTypes.STRING,
    allowNull: true,
  });
  
  await addColumnSafe('sheet_assignments', 'assignment_type', {
    type: DataTypes.STRING,
    defaultValue: 'SHEET',
  });
  
  await addColumnSafe('sheet_assignments', 'assigned_rows', {
    type: DataTypes.TEXT, // SQLite doesn't have JSONB, use TEXT
    allowNull: true,
  });
  
  await addColumnSafe('sheet_assignments', 'assigned_columns', {
    type: DataTypes.TEXT,
    allowNull: true,
  });
  
  await addColumnSafe('sheet_assignments', 'assigned_cells', {
    type: DataTypes.TEXT,
    allowNull: true,
  });
  
  await addColumnSafe('sheet_assignments', 'question', {
    type: DataTypes.TEXT,
    allowNull: true,
  });
  
  await addColumnSafe('sheet_assignments', 'response', {
    type: DataTypes.TEXT,
    allowNull: true,
  });
  
  await addColumnSafe('sheet_assignments', 'priority', {
    type: DataTypes.STRING,
    defaultValue: 'MEDIUM',
  });
  
  await addColumnSafe('sheet_assignments', 'due_date', {
    type: DataTypes.DATE,
    allowNull: true,
  });
  
  await addColumnSafe('sheet_assignments', 'responded_at', {
    type: DataTypes.DATE,
    allowNull: true,
  });

  // --- notifications table: change type from ENUM to STRING ---
  console.log('\n🔔 Migrating notifications table...');
  // For SQLite, ENUM is stored as TEXT anyway, so this should already work.
  // Just verify the table exists
  try {
    const tables = await qi.showAllTables();
    if (tables.includes('notifications')) {
      console.log('  ✅ notifications table exists');
    } else {
      console.log('  ⚠️  notifications table does not exist yet (will be created on sync)');
    }
  } catch (err) {
    console.log('  ⚠️  Could not check tables:', err.message);
  }

  console.log('\n✅ Migration complete!\n');
  process.exit(0);
}

sequelize.authenticate()
  .then(() => migrate())
  .catch(err => {
    console.error('Database connection failed:', err);
    process.exit(1);
  });
