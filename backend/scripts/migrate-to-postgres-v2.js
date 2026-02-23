#!/usr/bin/env node
// ================================================================
// MIGRATE SQLite → PostgreSQL (v2 — raw column copy)
// ================================================================
// Reads data from SQLite and inserts into PostgreSQL using raw SQL.
// Column names are copied as-is since both use underscored: true.
// ================================================================

const { Sequelize } = require('sequelize');
const path = require('path');

const SQLITE_PATH = path.join(__dirname, '../database.sqlite');

const sqliteSq = new Sequelize({
  dialect: 'sqlite',
  storage: SQLITE_PATH,
  logging: false,
});

const pgSq = new Sequelize('construction_tracker', 'construction', 'construction123', {
  host: 'localhost',
  port: 5432,
  dialect: 'postgres',
  logging: false,
  pool: { max: 5, min: 1, acquire: 30000, idle: 10000 },
  define: { timestamps: true, underscored: true },
});

// Table insertion order (parents first)
const TABLE_ORDER = [
  'users',
  'projects',
  'sheets',
  'cell_data',
  'cell_permissions',
  'sheet_assignments',
  'user_sheets',
  'audit_logs',
  'reports',
  'sheet_versions',
  'notifications',
  'feedbacks',
  'financial_records',
  'market_data',
];

async function migrate() {
  console.log('🔄 SQLite → PostgreSQL migration v2\n');

  await sqliteSq.authenticate();
  console.log('✅ SQLite connected');
  await pgSq.authenticate();
  console.log('✅ PostgreSQL connected\n');

  // Step 1: Get SQLite tables and their data
  const [sqliteTables] = await sqliteSq.query(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
  );
  const existingTables = sqliteTables.map(t => t.name);

  // Step 2: Create PG tables by importing the app's models
  // We temporarily override the database config
  console.log('🏗 Creating PostgreSQL tables...');
  
  // Create each table in PG matching SQLite schema exactly
  for (const table of TABLE_ORDER) {
    if (!existingTables.includes(table)) continue;
    
    // Get column info from SQLite
    const [pragma] = await sqliteSq.query(`PRAGMA table_info("${table}")`);
    
    const colDefs = pragma.map(col => {
      let pgType = sqliteTypeToPg(col.type);
      let nullable = col.notnull === 0 ? '' : ' NOT NULL';
      let def = col.dflt_value ? ` DEFAULT ${col.dflt_value}` : '';
      let pk = col.pk === 1 ? ' PRIMARY KEY' : '';
      
      // UUID columns need special treatment
      if (col.name === 'id' && (col.type === '' || col.type === 'UUID' || col.type.includes('VARCHAR'))) {
        pgType = 'UUID';
        def = ' DEFAULT gen_random_uuid()';
      }
      // Foreign key UUID columns
      if (col.name.endsWith('_id') && col.name !== 'cell_id' && (col.type === '' || col.type === 'UUID' || col.type.includes('VARCHAR'))) {
        pgType = 'UUID';
      }
      
      return `"${col.name}" ${pgType}${nullable}${def}${pk}`;
    });
    
    try {
      await pgSq.query(`DROP TABLE IF EXISTS "${table}" CASCADE`);
      await pgSq.query(`CREATE TABLE "${table}" (${colDefs.join(', ')})`);
      console.log(`  ✅ Created table: ${table} (${pragma.length} columns)`);
    } catch (e) {
      console.error(`  ❌ Failed to create ${table}:`, e.message);
      // Fallback: create via simple column list
      try {
        await pgSq.query(`DROP TABLE IF EXISTS "${table}" CASCADE`);
        const simpleCols = pragma.map(col => `"${col.name}" TEXT`);
        simpleCols[0] = `"${pragma[0].name}" TEXT PRIMARY KEY`; // first col is usually PK
        await pgSq.query(`CREATE TABLE "${table}" (${simpleCols.join(', ')})`);
        console.log(`  ✅ Created table (fallback): ${table}`);
      } catch (e2) {
        console.error(`  ❌ Fallback also failed for ${table}:`, e2.message);
      }
    }
  }

  // Step 3: Copy data
  console.log('\n📥 Copying data...\n');
  
  for (const table of TABLE_ORDER) {
    if (!existingTables.includes(table)) continue;
    
    const [rows] = await sqliteSq.query(`SELECT * FROM "${table}"`);
    if (rows.length === 0) {
      console.log(`  ⏭ ${table}: empty`);
      continue;
    }

    let inserted = 0;
    let errors = 0;

    for (const row of rows) {
      const cols = Object.keys(row);
      const colStr = cols.map(c => `"${c}"`).join(', ');
      const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
      const values = cols.map(c => {
        let v = row[c];
        // Parse stringified JSON
        if (typeof v === 'string') {
          if ((v.startsWith('{') && v.endsWith('}')) || (v.startsWith('[') && v.endsWith(']'))) {
            try { JSON.parse(v); /* valid JSON, keep as string for PG */ } catch { /* not JSON */ }
          }
        }
        return v;
      });

      try {
        await pgSq.query(
          `INSERT INTO "${table}" (${colStr}) VALUES (${placeholders})`,
          { bind: values }
        );
        inserted++;
      } catch (e) {
        errors++;
        if (errors <= 2) {
          console.log(`    ⚠ Row error in ${table}: ${e.message.substring(0, 100)}`);
        }
      }
    }

    console.log(`  ${errors === 0 ? '✅' : '⚠'} ${table}: ${inserted}/${rows.length} rows${errors > 0 ? ` (${errors} errors)` : ''}`);
  }

  // Step 4: Verify
  console.log('\n📊 Verification:');
  for (const table of TABLE_ORDER) {
    if (!existingTables.includes(table)) continue;
    try {
      const [result] = await pgSq.query(`SELECT COUNT(*) as cnt FROM "${table}"`);
      const [srcResult] = await sqliteSq.query(`SELECT COUNT(*) as cnt FROM "${table}"`);
      const pgCount = result[0].cnt;
      const sqliteCount = srcResult[0].cnt;
      const match = pgCount == sqliteCount;
      console.log(`  ${match ? '✅' : '⚠'} ${table}: PG=${pgCount} SQLite=${sqliteCount}`);
    } catch (e) {
      console.log(`  ❌ ${table}: ${e.message.substring(0, 60)}`);
    }
  }

  console.log('\n🎉 Migration complete!');
  await sqliteSq.close();
  await pgSq.close();
  process.exit(0);
}

function sqliteTypeToPg(sqliteType) {
  const t = (sqliteType || '').toUpperCase();
  if (t.includes('INTEGER') || t.includes('INT')) return 'INTEGER';
  if (t.includes('REAL') || t.includes('FLOAT') || t.includes('DOUBLE')) return 'DOUBLE PRECISION';
  if (t.includes('DECIMAL')) return t; // DECIMAL(15,2) etc
  if (t.includes('BOOLEAN') || t === 'TINYINT(1)') return 'BOOLEAN';
  if (t.includes('DATETIME') || t.includes('TIMESTAMP') || t === 'DATE') return 'TIMESTAMPTZ';
  if (t.includes('TEXT') || t.includes('CLOB')) return 'TEXT';
  if (t.includes('BLOB')) return 'BYTEA';
  if (t.includes('JSON') || t.includes('JSONB')) return 'JSONB';
  if (t.includes('VARCHAR')) return t.replace('VARCHAR', 'VARCHAR');
  if (t.includes('UUID')) return 'UUID';
  if (t === '' || t === 'NONE') return 'TEXT'; // SQLite's dynamic typing
  return 'TEXT';
}

migrate().catch(e => {
  console.error('Fatal:', e);
  process.exit(1);
});
