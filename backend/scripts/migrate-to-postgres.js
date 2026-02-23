#!/usr/bin/env node
// ================================================================
// MIGRATE SQLite → PostgreSQL
// ================================================================
// Exports ALL data from the SQLite database and imports into PostgreSQL.
// Run ONCE: node scripts/migrate-to-postgres.js
// ================================================================

const { Sequelize, DataTypes } = require('sequelize');
const path = require('path');

const SQLITE_PATH = path.join(__dirname, '../database.sqlite');

// ── SQLite source ──
const sqliteSq = new Sequelize({
  dialect: 'sqlite',
  storage: SQLITE_PATH,
  logging: false,
});

// ── PostgreSQL target ──
const pgSq = new Sequelize('construction_tracker', 'construction', 'construction123', {
  host: 'localhost',
  port: 5432,
  dialect: 'postgres',
  logging: false,
  pool: { max: 5, min: 1, acquire: 30000, idle: 10000 },
  define: { timestamps: true, underscored: true },
});

// Table order matters for foreign key constraints — insert parents first
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
  console.log('🔄 Starting SQLite → PostgreSQL migration...\n');

  // Test connections
  try {
    await sqliteSq.authenticate();
    console.log('✅ SQLite connected');
  } catch (e) {
    console.error('❌ SQLite connection failed:', e.message);
    process.exit(1);
  }

  try {
    await pgSq.authenticate();
    console.log('✅ PostgreSQL connected\n');
  } catch (e) {
    console.error('❌ PostgreSQL connection failed:', e.message);
    process.exit(1);
  }

  // Get all tables from SQLite
  const [sqliteTables] = await sqliteSq.query(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  );
  const tableNames = sqliteTables.map(t => t.name);
  console.log('📋 SQLite tables:', tableNames.join(', '));

  // For each table, read all data from SQLite
  const tableData = {};
  for (const table of TABLE_ORDER) {
    if (!tableNames.includes(table)) {
      console.log(`  ⏭ Skipping ${table} (not in SQLite)`);
      continue;
    }
    try {
      const [rows] = await sqliteSq.query(`SELECT * FROM "${table}"`);
      tableData[table] = rows;
      console.log(`  📦 ${table}: ${rows.length} rows`);
    } catch (e) {
      console.log(`  ⚠ Failed to read ${table}: ${e.message}`);
      tableData[table] = [];
    }
  }

  console.log('\n🏗 Creating PostgreSQL schema via Sequelize sync...');
  
  // Import all models — this registers them on the pgSq instance
  // We need to redefine models on the PG sequelize instance
  // The simplest approach: just use the existing models/index.js but with PG connection
  // Instead, we'll sync the schema from models, then raw-insert data

  // First, let the app's normal sync create tables
  // We'll do this by temporarily requiring models which use our pg connection
  // Easier: just sync via the models

  // Actually the cleanest approach: create tables via raw SQL matching existing schema
  // But that's error-prone. Best approach: use Sequelize sync.
  
  // We need to close the sqlite connection in config/database and replace it
  // OR: just define the same models on pgSq

  // Let's define minimal model schemas on pgSq for table creation
  defineModels(pgSq);
  await pgSq.sync({ force: true });
  console.log('✅ PostgreSQL tables created\n');

  // Now insert data table by table
  console.log('📥 Inserting data into PostgreSQL...\n');

  for (const table of TABLE_ORDER) {
    const rows = tableData[table];
    if (!rows || rows.length === 0) {
      console.log(`  ⏭ ${table}: 0 rows, skipping`);
      continue;
    }

    try {
      // Parse JSONB fields — SQLite stores them as strings
      const parsed = rows.map(row => {
        const r = { ...row };
        // Parse any stringified JSON fields
        for (const key of Object.keys(r)) {
          if (typeof r[key] === 'string' && (r[key].startsWith('{') || r[key].startsWith('['))) {
            try { r[key] = JSON.parse(r[key]); } catch {} 
          }
        }
        return r;
      });

      // Batch insert with ignore conflicts
      let inserted = 0;
      const batchSize = 50;
      for (let i = 0; i < parsed.length; i += batchSize) {
        const batch = parsed.slice(i, i + batchSize);
        try {
          // Build column list from first row
          const cols = Object.keys(batch[0]);
          const placeholders = batch.map((_, bi) => 
            `(${cols.map((_, ci) => `$${bi * cols.length + ci + 1}`).join(', ')})`
          ).join(', ');
          
          const values = batch.flatMap(row => cols.map(c => {
            const val = row[c];
            if (val === undefined) return null;
            if (typeof val === 'object' && val !== null) return JSON.stringify(val);
            return val;
          }));

          // Use simpler approach — one row at a time for safety
          for (const row of batch) {
            const colNames = Object.keys(row);
            const colStr = colNames.map(c => `"${toSnakeCase(c)}"`).join(', ');
            const placeholderStr = colNames.map((_, i) => `$${i + 1}`).join(', ');
            const vals = colNames.map(c => {
              const v = row[c];
              if (v === undefined) return null;
              if (typeof v === 'object' && v !== null) return JSON.stringify(v);
              return v;
            });

            try {
              await pgSq.query(
                `INSERT INTO "${table}" (${colStr}) VALUES (${placeholderStr}) ON CONFLICT DO NOTHING`,
                { bind: vals }
              );
              inserted++;
            } catch (e) {
              // Try with column name as-is (not snake_case)
              try {
                const colStr2 = colNames.map(c => `"${c}"`).join(', ');
                await pgSq.query(
                  `INSERT INTO "${table}" (${colStr2}) VALUES (${placeholderStr}) ON CONFLICT DO NOTHING`,
                  { bind: vals }
                );
                inserted++;
              } catch (e2) {
                if (!e2.message.includes('duplicate') && !e2.message.includes('conflict')) {
                  // Skip individual row errors silently
                }
              }
            }
          }
        } catch (e) {
          console.log(`    ⚠ Batch error in ${table}: ${e.message}`);
        }
      }
      console.log(`  ✅ ${table}: ${inserted}/${rows.length} rows inserted`);
    } catch (e) {
      console.error(`  ❌ ${table}: ${e.message}`);
    }
  }

  console.log('\n🎉 Migration complete!');
  console.log('   You can now update .env and restart the server with PostgreSQL.\n');
  
  await sqliteSq.close();
  await pgSq.close();
  process.exit(0);
}

function toSnakeCase(str) {
  return str.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
}

function defineModels(sq) {
  // Users
  sq.define('User', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    email: { type: DataTypes.STRING, allowNull: false, unique: true },
    password: { type: DataTypes.STRING, allowNull: false },
    firstName: { type: DataTypes.STRING, allowNull: false },
    lastName: { type: DataTypes.STRING, allowNull: false },
    role: { type: DataTypes.STRING, allowNull: false },
    phone: { type: DataTypes.STRING, allowNull: true },
    avatar: { type: DataTypes.STRING, allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
    lastLoginAt: { type: DataTypes.DATE, allowNull: true },
    mustChangePassword: { type: DataTypes.BOOLEAN, defaultValue: false },
    preferences: { type: DataTypes.JSONB, defaultValue: {} },
  }, { tableName: 'users', timestamps: true, underscored: true });

  // Projects
  sq.define('Project', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT },
    status: { type: DataTypes.STRING, defaultValue: 'ACTIVE' },
    startDate: { type: DataTypes.DATE },
    endDate: { type: DataTypes.DATE },
    budget: { type: DataTypes.DECIMAL(15, 2) },
    location: { type: DataTypes.STRING },
    clientName: { type: DataTypes.STRING },
    priority: { type: DataTypes.STRING, defaultValue: 'MEDIUM' },
    progress: { type: DataTypes.INTEGER, defaultValue: 0 },
    metadata: { type: DataTypes.JSONB, defaultValue: {} },
    createdById: { type: DataTypes.UUID, allowNull: false },
  }, { tableName: 'projects', timestamps: true, underscored: true });

  // Sheets
  sq.define('Sheet', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT },
    projectId: { type: DataTypes.UUID, allowNull: false },
    structure: { type: DataTypes.JSONB, defaultValue: {} },
    permissions: { type: DataTypes.JSONB, defaultValue: {} },
    validationRules: { type: DataTypes.JSONB, defaultValue: {} },
    formulas: { type: DataTypes.JSONB, defaultValue: {} },
    status: { type: DataTypes.STRING, defaultValue: 'DRAFT' },
    version: { type: DataTypes.INTEGER, defaultValue: 1 },
    isTemplate: { type: DataTypes.BOOLEAN, defaultValue: false },
    templateId: { type: DataTypes.UUID },
    createdById: { type: DataTypes.UUID, allowNull: false },
    lastModifiedById: { type: DataTypes.UUID },
    lockedAt: { type: DataTypes.DATE },
    lockedById: { type: DataTypes.UUID },
    assignedUsers: { type: DataTypes.JSONB, defaultValue: [] },
    assignedRoles: { type: DataTypes.JSONB, defaultValue: [] },
    collaborationSettings: { type: DataTypes.JSONB, defaultValue: {} },
    lastSyncedAt: { type: DataTypes.DATE },
  }, { tableName: 'sheets', timestamps: true, underscored: true });

  // CellData
  sq.define('CellData', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    sheetId: { type: DataTypes.UUID, allowNull: false },
    cellId: { type: DataTypes.STRING, allowNull: false },
    rowIndex: { type: DataTypes.INTEGER, allowNull: false },
    columnIndex: { type: DataTypes.INTEGER, allowNull: false },
    value: { type: DataTypes.TEXT },
    numericValue: { type: DataTypes.DECIMAL(15, 4) },
    dataType: { type: DataTypes.STRING, defaultValue: 'TEXT' },
    status: { type: DataTypes.STRING, defaultValue: 'DRAFT' },
    metadata: { type: DataTypes.JSONB, defaultValue: {} },
    version: { type: DataTypes.INTEGER, defaultValue: 1 },
    createdById: { type: DataTypes.UUID, allowNull: false },
    lastModifiedById: { type: DataTypes.UUID },
    approvedById: { type: DataTypes.UUID },
    approvedAt: { type: DataTypes.DATE },
    isLocked: { type: DataTypes.BOOLEAN, defaultValue: false },
    lockedById: { type: DataTypes.UUID },
    lockedAt: { type: DataTypes.DATE },
  }, { tableName: 'cell_data', timestamps: true, underscored: true });

  // CellPermission
  sq.define('CellPermission', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    sheetId: { type: DataTypes.UUID, allowNull: false },
    cellId: { type: DataTypes.STRING, allowNull: false },
    canViewRoles: { type: DataTypes.JSONB, defaultValue: [] },
    canEditRoles: { type: DataTypes.JSONB, defaultValue: [] },
    canViewUsers: { type: DataTypes.JSONB, defaultValue: [] },
    canEditUsers: { type: DataTypes.JSONB, defaultValue: [] },
    isLocked: { type: DataTypes.BOOLEAN, defaultValue: false },
    lockedById: { type: DataTypes.UUID },
    lockedAt: { type: DataTypes.DATE },
  }, { tableName: 'cell_permissions', timestamps: true, underscored: true });

  // SheetAssignment
  sq.define('SheetAssignment', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    sheetId: { type: DataTypes.UUID, allowNull: false },
    userId: { type: DataTypes.UUID },
    role: { type: DataTypes.STRING },
    assignedById: { type: DataTypes.UUID, allowNull: false },
    permissions: { type: DataTypes.JSONB, defaultValue: {} },
    status: { type: DataTypes.STRING, defaultValue: 'active' },
  }, { tableName: 'sheet_assignments', timestamps: true, underscored: true });

  // UserSheet
  sq.define('UserSheet', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false },
    sheetId: { type: DataTypes.UUID, allowNull: false },
    role: { type: DataTypes.STRING },
    status: { type: DataTypes.STRING, defaultValue: 'pending' },
    progress: { type: DataTypes.INTEGER, defaultValue: 0 },
    cellChanges: { type: DataTypes.JSONB, defaultValue: {} },
    lastAccessedAt: { type: DataTypes.DATE },
    submittedAt: { type: DataTypes.DATE },
    reviewedAt: { type: DataTypes.DATE },
    reviewNotes: { type: DataTypes.TEXT },
    feedback: { type: DataTypes.TEXT },
    assignedCells: { type: DataTypes.JSONB, defaultValue: [] },
  }, { tableName: 'user_sheets', timestamps: true, underscored: true });

  // AuditLog
  sq.define('AuditLog', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID },
    action: { type: DataTypes.STRING, allowNull: false },
    entityType: { type: DataTypes.STRING },
    entityId: { type: DataTypes.STRING },
    details: { type: DataTypes.JSONB, defaultValue: {} },
    ipAddress: { type: DataTypes.STRING },
    userAgent: { type: DataTypes.STRING },
  }, { tableName: 'audit_logs', timestamps: true, underscored: true });

  // Report
  sq.define('Report', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    title: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.TEXT },
    type: { type: DataTypes.STRING },
    sheetId: { type: DataTypes.UUID },
    projectId: { type: DataTypes.UUID },
    generatedById: { type: DataTypes.UUID },
    data: { type: DataTypes.JSONB, defaultValue: {} },
    format: { type: DataTypes.STRING, defaultValue: 'json' },
    status: { type: DataTypes.STRING, defaultValue: 'generated' },
    filePath: { type: DataTypes.STRING },
  }, { tableName: 'reports', timestamps: true, underscored: true });

  // SheetVersion
  sq.define('SheetVersion', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    sheetId: { type: DataTypes.UUID, allowNull: false },
    version: { type: DataTypes.INTEGER, allowNull: false },
    structure: { type: DataTypes.JSONB, defaultValue: {} },
    cellData: { type: DataTypes.JSONB, defaultValue: {} },
    changedById: { type: DataTypes.UUID },
    changeNotes: { type: DataTypes.TEXT },
  }, { tableName: 'sheet_versions', timestamps: true, underscored: true });

  // Notification
  sq.define('Notification', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    userId: { type: DataTypes.UUID, allowNull: false },
    title: { type: DataTypes.STRING, allowNull: false },
    message: { type: DataTypes.TEXT },
    type: { type: DataTypes.STRING, defaultValue: 'info' },
    isRead: { type: DataTypes.BOOLEAN, defaultValue: false },
    data: { type: DataTypes.JSONB, defaultValue: {} },
  }, { tableName: 'notifications', timestamps: true, underscored: true });

  // Feedback
  sq.define('Feedback', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    projectId: { type: DataTypes.UUID },
    clientName: { type: DataTypes.STRING },
    rating: { type: DataTypes.INTEGER },
    comment: { type: DataTypes.TEXT },
    category: { type: DataTypes.STRING },
  }, { tableName: 'feedbacks', timestamps: true, underscored: true });

  // FinancialRecord
  sq.define('FinancialRecord', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    quarter: { type: DataTypes.INTEGER, allowNull: false },
    year: { type: DataTypes.INTEGER, allowNull: false },
    revenue: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
    profit: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0 },
    margin: { type: DataTypes.FLOAT },
    operationalCost: { type: DataTypes.DECIMAL(15, 2) },
    expenses: { type: DataTypes.DECIMAL(15, 2) },
    recordDate: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
    notes: { type: DataTypes.TEXT },
  }, { tableName: 'financial_records', timestamps: true, underscored: true });

  // MarketData
  sq.define('MarketData', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    sector: { type: DataTypes.STRING },
    indicator: { type: DataTypes.STRING },
    value: { type: DataTypes.FLOAT },
    period: { type: DataTypes.STRING },
    source: { type: DataTypes.STRING },
    data: { type: DataTypes.JSONB, defaultValue: {} },
  }, { tableName: 'market_data', timestamps: true, underscored: true });
}

migrate().catch(e => {
  console.error('Migration failed:', e);
  process.exit(1);
});
