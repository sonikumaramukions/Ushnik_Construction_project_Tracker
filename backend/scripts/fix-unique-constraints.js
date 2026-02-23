/**
 * Fix broken SQLite unique constraints on cell_data and sheet_assignments tables.
 * 
 * Problem: SQLite autoindex created UNIQUE(cell_id) and UNIQUE(user_id) constraints
 * that prevent multiple cells across sheets and multiple assignments per user.
 * 
 * Solution: Recreate tables with correct constraints, preserving all data.
 * 
 * Usage: node scripts/fix-unique-constraints.js
 */
const { sequelize } = require('../config/database');

async function fix() {
  console.log('🔧 Fixing broken unique constraints...\n');

  try {
    await sequelize.authenticate();
    console.log('✅ Database connected\n');

    // =====================================================
    // FIX 1: cell_data — remove UNIQUE(cell_id), keep UNIQUE(sheet_id, cell_id)
    // =====================================================
    console.log('📋 Fixing cell_data table...');

    // Check current data
    const cellCount = await sequelize.query('SELECT COUNT(*) as cnt FROM cell_data', { type: sequelize.QueryTypes.SELECT });
    console.log(`   Current cell_data rows: ${cellCount[0].cnt}`);

    await sequelize.query('PRAGMA foreign_keys = OFF;');

    // Create new table with correct schema
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS cell_data_new (
        id UUID PRIMARY KEY,
        sheet_id UUID NOT NULL REFERENCES sheets(id),
        cell_id VARCHAR(255) NOT NULL,
        row_index INTEGER NOT NULL,
        column_index INTEGER NOT NULL,
        value TEXT,
        numeric_value DECIMAL(15, 4),
        data_type TEXT DEFAULT 'TEXT',
        status TEXT DEFAULT 'DRAFT',
        metadata JSONB DEFAULT '{}',
        version INTEGER DEFAULT 1,
        created_by_id UUID NOT NULL REFERENCES users(id),
        last_modified_by_id UUID REFERENCES users(id),
        approved_by_id UUID REFERENCES users(id),
        approved_at DATETIME,
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL,
        UNIQUE(sheet_id, cell_id)
      );
    `);

    // Copy data
    await sequelize.query(`
      INSERT OR IGNORE INTO cell_data_new 
      SELECT * FROM cell_data;
    `);

    const newCellCount = await sequelize.query('SELECT COUNT(*) as cnt FROM cell_data_new', { type: sequelize.QueryTypes.SELECT });
    console.log(`   Copied rows: ${newCellCount[0].cnt}`);

    // Swap tables
    await sequelize.query('DROP TABLE cell_data;');
    await sequelize.query('ALTER TABLE cell_data_new RENAME TO cell_data;');

    // Recreate needed indexes
    await sequelize.query('CREATE INDEX IF NOT EXISTS cell_data_sheet_id_cell_id ON cell_data(sheet_id, cell_id);');
    await sequelize.query('CREATE INDEX IF NOT EXISTS cell_data_sheet_id_row_index_column_index ON cell_data(sheet_id, row_index, column_index);');
    await sequelize.query('CREATE INDEX IF NOT EXISTS cell_data_status ON cell_data(status);');
    await sequelize.query('CREATE INDEX IF NOT EXISTS cell_data_created_by_id ON cell_data(created_by_id);');

    console.log('   ✅ cell_data fixed!\n');

    // =====================================================
    // FIX 2: sheet_assignments — remove UNIQUE(sheet_id), UNIQUE(user_id)
    // =====================================================
    console.log('📋 Fixing sheet_assignments table...');

    const saCount = await sequelize.query('SELECT COUNT(*) as cnt FROM sheet_assignments', { type: sequelize.QueryTypes.SELECT });
    console.log(`   Current sheet_assignments rows: ${saCount[0].cnt}`);

    // Create new table with NO broken unique constraints
    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS sheet_assignments_new (
        id UUID PRIMARY KEY,
        sheet_id UUID NOT NULL REFERENCES sheets(id),
        user_id UUID REFERENCES users(id),
        assigned_role VARCHAR(255),
        assigned_by_id UUID NOT NULL REFERENCES users(id),
        assignment_type VARCHAR(255) DEFAULT 'SHEET',
        assigned_rows TEXT DEFAULT '[]',
        assigned_columns TEXT DEFAULT '[]',
        assigned_cells TEXT DEFAULT '[]',
        question TEXT,
        response TEXT,
        permissions JSONB DEFAULT '{}',
        status VARCHAR(255) DEFAULT 'PENDING',
        priority VARCHAR(255) DEFAULT 'MEDIUM',
        due_date DATETIME,
        assigned_at DATETIME,
        responded_at DATETIME,
        last_accessed_at DATETIME,
        notes TEXT,
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL
      );
    `);

    // Copy data
    await sequelize.query(`
      INSERT OR IGNORE INTO sheet_assignments_new 
      SELECT id, sheet_id, user_id, assigned_role, assigned_by_id, assignment_type,
             assigned_rows, assigned_columns, assigned_cells, question, response,
             permissions, status, priority, due_date, assigned_at, responded_at,
             last_accessed_at, notes, created_at, updated_at
      FROM sheet_assignments;
    `);

    const newSaCount = await sequelize.query('SELECT COUNT(*) as cnt FROM sheet_assignments_new', { type: sequelize.QueryTypes.SELECT });
    console.log(`   Copied rows: ${newSaCount[0].cnt}`);

    // Swap tables
    await sequelize.query('DROP TABLE sheet_assignments;');
    await sequelize.query('ALTER TABLE sheet_assignments_new RENAME TO sheet_assignments;');

    // Recreate needed indexes (NO unique on user_id or sheet_id alone!)
    await sequelize.query('CREATE INDEX IF NOT EXISTS sheet_assignments_sheet_id ON sheet_assignments(sheet_id);');
    await sequelize.query('CREATE INDEX IF NOT EXISTS sheet_assignments_user_id ON sheet_assignments(user_id);');
    await sequelize.query('CREATE INDEX IF NOT EXISTS sheet_assignments_assigned_by_id ON sheet_assignments(assigned_by_id);');
    await sequelize.query('CREATE INDEX IF NOT EXISTS sheet_assignments_status ON sheet_assignments(status);');
    await sequelize.query('CREATE INDEX IF NOT EXISTS sheet_assignments_assigned_role ON sheet_assignments(assigned_role);');
    await sequelize.query('CREATE INDEX IF NOT EXISTS sheet_assignments_assignment_type ON sheet_assignments(assignment_type);');

    console.log('   ✅ sheet_assignments fixed!\n');

    await sequelize.query('PRAGMA foreign_keys = ON;');

    // =====================================================
    // FIX 3: user_sheets — remove UNIQUE(user_id), UNIQUE(sheet_id), keep UNIQUE(user_id, sheet_id)
    // =====================================================
    console.log('📋 Fixing user_sheets table...');

    const usCount = await sequelize.query('SELECT COUNT(*) as cnt FROM user_sheets', { type: sequelize.QueryTypes.SELECT });
    console.log(`   Current user_sheets rows: ${usCount[0].cnt}`);

    await sequelize.query('PRAGMA foreign_keys = OFF;');

    await sequelize.query(`
      CREATE TABLE IF NOT EXISTS user_sheets_new (
        id UUID PRIMARY KEY,
        sheet_id UUID NOT NULL REFERENCES sheets(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status TEXT DEFAULT 'pending',
        last_modified DATETIME,
        submitted_at DATETIME,
        cell_changes JSONB DEFAULT '{}',
        notes TEXT,
        created_at DATETIME NOT NULL,
        updated_at DATETIME NOT NULL,
        UNIQUE(user_id, sheet_id)
      );
    `);

    await sequelize.query(`
      INSERT OR IGNORE INTO user_sheets_new 
      SELECT * FROM user_sheets;
    `);

    const newUsCount = await sequelize.query('SELECT COUNT(*) as cnt FROM user_sheets_new', { type: sequelize.QueryTypes.SELECT });
    console.log(`   Copied rows: ${newUsCount[0].cnt}`);

    await sequelize.query('DROP TABLE user_sheets;');
    await sequelize.query('ALTER TABLE user_sheets_new RENAME TO user_sheets;');

    await sequelize.query('CREATE INDEX IF NOT EXISTS user_sheets_user_id ON user_sheets(user_id);');
    await sequelize.query('CREATE INDEX IF NOT EXISTS user_sheets_sheet_id ON user_sheets(sheet_id);');
    await sequelize.query('CREATE UNIQUE INDEX IF NOT EXISTS user_sheets_user_id_sheet_id ON user_sheets(user_id, sheet_id);');
    await sequelize.query('CREATE INDEX IF NOT EXISTS user_sheets_status ON user_sheets(status);');

    console.log('   ✅ user_sheets fixed!\n');

    await sequelize.query('PRAGMA foreign_keys = ON;');

    // Verify
    console.log('🔍 Verifying...');
    const cdIdx = await sequelize.query('PRAGMA INDEX_LIST(cell_data)', { type: sequelize.QueryTypes.SELECT });
    console.log('   cell_data indexes:');
    for (const idx of cdIdx) {
      const cols = await sequelize.query(`PRAGMA INDEX_INFO(${idx.name})`, { type: sequelize.QueryTypes.SELECT });
      console.log(`     ${idx.name} (unique=${idx.unique}): ${cols.map(c => c.name).join(', ')}`);
    }

    const saIdx = await sequelize.query('PRAGMA INDEX_LIST(sheet_assignments)', { type: sequelize.QueryTypes.SELECT });
    console.log('   sheet_assignments indexes:');
    for (const idx of saIdx) {
      const cols = await sequelize.query(`PRAGMA INDEX_INFO(${idx.name})`, { type: sequelize.QueryTypes.SELECT });
      console.log(`     ${idx.name} (unique=${idx.unique}): ${cols.map(c => c.name).join(', ')}`);
    }

    const usIdx = await sequelize.query('PRAGMA INDEX_LIST(user_sheets)', { type: sequelize.QueryTypes.SELECT });
    console.log('   user_sheets indexes:');
    for (const idx of usIdx) {
      const cols = await sequelize.query(`PRAGMA INDEX_INFO(${idx.name})`, { type: sequelize.QueryTypes.SELECT });
      console.log(`     ${idx.name} (unique=${idx.unique}): ${cols.map(c => c.name).join(', ')}`);
    }

    console.log('\n✅ All constraints fixed! You can now restart the server.');
  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error(err.stack);
  }

  process.exit(0);
}

fix();
