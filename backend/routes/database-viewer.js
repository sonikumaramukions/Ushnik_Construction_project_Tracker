// ================================================================
// DATABASE VIEWER ROUTES (routes/database-viewer.js)
// ================================================================
// PURPOSE: Admin-only web interface to browse, query, and manage the PostgreSQL database.
//
// ENDPOINTS:
//   GET  /api/admin/db                    — Serves the database viewer HTML page
//   GET  /api/admin/db/tables             — List all tables with row counts
//   GET  /api/admin/db/table/:name        — Get rows from a table (paginated)
//   GET  /api/admin/db/schema/:name       — Get table schema (column definitions)
//   POST /api/admin/db/query              — Execute a raw SQL query (SELECT only)
//   POST /api/admin/db/create-user        — Create a user with bcrypt-hashed password
//   POST /api/admin/db/table/:name        — INSERT a new row into any table
//   PUT  /api/admin/db/table/:name/:id    — UPDATE a row by primary key
//   DELETE /api/admin/db/table/:name/:id  — Delete a row by primary key
//
// ACCESS: L1_ADMIN only (authenticated + authorized)
// SECURITY: Only SELECT queries allowed for raw SQL. Mutations via dedicated endpoints.
// ================================================================

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { sequelize } = require('../models');
const { authenticateToken, authorizeRoles } = require('../middleware/auth');
const logger = require('../utils/logger');

// All routes require admin authentication
router.use(authenticateToken);
router.use(authorizeRoles('L1_ADMIN'));

// ─── GET /api/admin/db — Serve the database viewer HTML page ───
router.get('/', (req, res) => {
  res.send(getDatabaseViewerHTML());
});

// ─── GET /api/admin/db/tables — List all tables with row counts ───
router.get('/tables', async (req, res) => {
  try {
    const [results] = await sequelize.query(
      "SELECT tablename AS name FROM pg_catalog.pg_tables WHERE schemaname = 'public' ORDER BY tablename"
    );
    const tables = [];
    for (const r of results) {
      const [[{ count }]] = await sequelize.query(`SELECT COUNT(*) as count FROM "${r.name}"`);
      tables.push({ name: r.name, rowCount: parseInt(count, 10) });
    }
    res.json({ success: true, tables });
  } catch (error) {
    logger.error('DB Viewer - list tables error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── GET /api/admin/db/schema/:name — Get table column definitions ───
router.get('/schema/:name', async (req, res) => {
  try {
    const tableName = req.params.name.replace(/[^a-zA-Z0-9_]/g, '');
    const [columns] = await sequelize.query(
      `SELECT ordinal_position as cid, column_name as name, data_type as type,
              CASE WHEN is_nullable = 'NO' THEN 1 ELSE 0 END as notnull,
              column_default as dflt_value,
              0 as pk
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = :tableName
       ORDER BY ordinal_position`,
      { replacements: { tableName } }
    );
    const [indexInfo] = await sequelize.query(
      `SELECT indexname as name, indexdef as sql
       FROM pg_indexes
       WHERE schemaname = 'public' AND tablename = :tableName`,
      { replacements: { tableName } }
    );
    res.json({ success: true, columns, indexes: indexInfo });
  } catch (error) {
    logger.error('DB Viewer - schema error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── GET /api/admin/db/table/:name — Get rows from a table (paginated) ───
router.get('/table/:name', async (req, res) => {
  try {
    const tableName = req.params.name.replace(/[^a-zA-Z0-9_]/g, '');
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const offset = (page - 1) * limit;
    const search = req.query.search || '';
    const orderBy = req.query.orderBy || 'rowid';
    const orderDir = req.query.orderDir === 'ASC' ? 'ASC' : 'DESC';

    const [[{ count }]] = await sequelize.query(`SELECT COUNT(*) as count FROM "${tableName}"`);
    const [columns] = await sequelize.query(
      `SELECT column_name as name, data_type as type,
              CASE WHEN is_nullable = 'NO' THEN 1 ELSE 0 END as notnull
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = :tableName
       ORDER BY ordinal_position`,
      { replacements: { tableName } }
    );
    const colNames = columns.map(c => c.name);

    // Default sort by created_at or first column (PostgreSQL has no rowid)
    const safeOrderBy = (orderBy === 'rowid') ? (colNames.includes('created_at') ? 'created_at' : colNames[0]) : orderBy;

    let whereClause = '';
    if (search) {
      const conditions = colNames.map(col => `CAST("${col}" AS TEXT) ILIKE '%' || :search || '%'`);
      whereClause = `WHERE ${conditions.join(' OR ')}`;
    }

    const [rows] = await sequelize.query(
      `SELECT * FROM "${tableName}" ${whereClause} ORDER BY "${safeOrderBy}" ${orderDir} LIMIT ${limit} OFFSET ${offset}`,
      search ? { replacements: { search } } : undefined
    );

    res.json({
      success: true,
      table: tableName,
      columns: colNames,
      columnInfo: columns,
      rows,
      pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) },
    });
  } catch (error) {
    logger.error('DB Viewer - table data error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── POST /api/admin/db/query — Execute a raw SQL query ───
router.post('/query', async (req, res) => {
  try {
    const { sql } = req.body;
    if (!sql || typeof sql !== 'string') {
      return res.status(400).json({ success: false, message: 'SQL query required' });
    }

    const trimmed = sql.trim().toUpperCase();
    if (!trimmed.startsWith('SELECT') && !trimmed.startsWith('EXPLAIN') && !trimmed.startsWith('SHOW') && !trimmed.startsWith('\\D')) {
      return res.status(403).json({
        success: false,
        message: 'Only SELECT, EXPLAIN, and SHOW queries are allowed in the query box. Use the UI buttons to insert/update/delete rows.',
      });
    }

    const startTime = Date.now();
    const [results] = await sequelize.query(sql);
    const duration = Date.now() - startTime;
    res.json({ success: true, rows: results, rowCount: results.length, duration: `${duration}ms` });
  } catch (error) {
    logger.error('DB Viewer - query error:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

// ─── POST /api/admin/db/create-user — Create a user with hashed password ───
router.post('/create-user', async (req, res) => {
  try {
    const { firstName, lastName, email, password, role, phone } = req.body;
    if (!firstName || !lastName || !email || !password || !role) {
      return res.status(400).json({ success: false, message: 'firstName, lastName, email, password, and role are required' });
    }

    const [existing] = await sequelize.query('SELECT id FROM users WHERE email = ?', { replacements: [email] });
    if (existing.length > 0) {
      return res.status(409).json({ success: false, message: 'A user with this email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const now = new Date().toISOString();
    const uuid = require('crypto').randomUUID();

    await sequelize.query(
      `INSERT INTO users (id, first_name, last_name, email, password, role, phone, is_active, created_at, updated_at)
       VALUES (:id, :firstName, :lastName, :email, :password, :role, :phone, true, :now1, :now2)`,
      { replacements: { id: uuid, firstName, lastName, email, password: hashedPassword, role, phone: phone || null, now1: now, now2: now } }
    );

    logger.info(`DB Viewer: Admin ${req.user.email} created user ${email} with role ${role}`);
    res.json({ success: true, message: `User ${email} created successfully` });
  } catch (error) {
    logger.error('DB Viewer - create user error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── POST /api/admin/db/table/:name — INSERT a new row ───
router.post('/table/:name', async (req, res) => {
  try {
    const tableName = req.params.name.replace(/[^a-zA-Z0-9_]/g, '');
    const data = req.body;
    if (!data || Object.keys(data).length === 0) {
      return res.status(400).json({ success: false, message: 'No data provided' });
    }

    const cols = Object.keys(data).map(c => `"${c}"`).join(', ');
    const placeholders = Object.keys(data).map(() => '?').join(', ');
    const values = Object.values(data);

    await sequelize.query(`INSERT INTO "${tableName}" (${cols}) VALUES (${placeholders})`, { replacements: values });
    logger.info(`DB Viewer: Admin ${req.user.email} inserted row into ${tableName}`);
    res.json({ success: true, message: `Row inserted into ${tableName}` });
  } catch (error) {
    logger.error('DB Viewer - insert error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── PUT /api/admin/db/table/:name/:id — UPDATE a row ───
router.put('/table/:name/:id', async (req, res) => {
  try {
    const tableName = req.params.name.replace(/[^a-zA-Z0-9_]/g, '');
    const id = req.params.id;
    const data = req.body;
    if (!data || Object.keys(data).length === 0) {
      return res.status(400).json({ success: false, message: 'No data provided' });
    }

    // Find primary key column via PostgreSQL catalog
    const [pkResult] = await sequelize.query(
      `SELECT a.attname as column_name
       FROM pg_index i
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
       WHERE i.indrelid = '"${tableName}"'::regclass AND i.indisprimary`,
    );
    const pkName = pkResult.length > 0 ? pkResult[0].column_name : 'id';

    const setClauses = Object.keys(data).map(c => `"${c}" = ?`).join(', ');
    const values = [...Object.values(data), id];

    await sequelize.query(`UPDATE "${tableName}" SET ${setClauses} WHERE "${pkName}" = ?`, { replacements: values });
    logger.info(`DB Viewer: Admin ${req.user.email} updated row ${id} in ${tableName}`);
    res.json({ success: true, message: `Row updated in ${tableName}` });
  } catch (error) {
    logger.error('DB Viewer - update error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── DELETE /api/admin/db/table/:name/:id — Delete a row ───
router.delete('/table/:name/:id', async (req, res) => {
  try {
    const tableName = req.params.name.replace(/[^a-zA-Z0-9_]/g, '');
    const id = req.params.id;

    // Find primary key column via PostgreSQL catalog
    const [pkResult] = await sequelize.query(
      `SELECT a.attname as column_name
       FROM pg_index i
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
       WHERE i.indrelid = '"${tableName}"'::regclass AND i.indisprimary`,
    );
    const pkName = pkResult.length > 0 ? pkResult[0].column_name : 'id';

    await sequelize.query(`DELETE FROM "${tableName}" WHERE "${pkName}" = ?`, { replacements: [id] });
    logger.info(`DB Viewer: Admin ${req.user.email} deleted row ${id} from ${tableName}`);
    res.json({ success: true, message: `Row deleted from ${tableName}` });
  } catch (error) {
    logger.error('DB Viewer - delete error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════
//  HTML PAGE — Full-featured Database Manager
// ═══════════════════════════════════════════════════════════════
function getDatabaseViewerHTML() {
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Database Manager</title>
  <style>
    :root { --pri: #1976d2; --pri-dk: #1565c0; --red: #d32f2f; --grn: #2e7d32; --bg: #f5f5f5; --card: #fff; --bdr: #e0e0e0; }
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; background:var(--bg); color:#333; font-size:14px; }

    .hdr { background:var(--pri); color:#fff; padding:10px 20px; display:flex; justify-content:space-between; align-items:center; position:sticky; top:0; z-index:100; }
    .hdr h1 { font-size:1.15rem; }
    .hdr-r { display:flex; gap:10px; align-items:center; }
    .hdr-r a,.hdr-r button { color:#fff; text-decoration:none; background:rgba(255,255,255,.15); padding:5px 12px; border-radius:4px; border:none; cursor:pointer; font-size:.82rem; }
    .hdr-r a:hover,.hdr-r button:hover { background:rgba(255,255,255,.25); }

    .wrap { display:flex; height:calc(100vh - 44px); }
    .side { width:230px; background:var(--card); border-right:1px solid var(--bdr); overflow-y:auto; flex-shrink:0; }
    .side h3 { padding:10px 14px 2px; font-size:.68rem; text-transform:uppercase; color:#888; letter-spacing:.5px; }
    .ti { padding:7px 14px; cursor:pointer; font-size:.83rem; border-left:3px solid transparent; display:flex; justify-content:space-between; align-items:center; }
    .ti:hover { background:#e3f2fd; }
    .ti.act { background:#bbdefb; border-left-color:var(--pri); font-weight:600; }
    .ti .badge { background:#e0e0e0; color:#666; padding:1px 6px; border-radius:10px; font-size:.68rem; }
    .ti.act .badge { background:var(--pri); color:#fff; }

    .main { flex:1; overflow:auto; padding:14px; display:flex; flex-direction:column; gap:12px; }
    .card { background:var(--card); border-radius:8px; box-shadow:0 1px 3px rgba(0,0,0,.08); overflow:hidden; }

    .qbox { padding:14px; }
    .qbox textarea { width:100%; height:48px; font-family:'Courier New',monospace; font-size:.83rem; border:1px solid #ccc; border-radius:4px; padding:8px; resize:vertical; }
    .qbox .acts { margin-top:6px; display:flex; gap:8px; align-items:center; }

    .btn { padding:5px 14px; border:none; border-radius:4px; cursor:pointer; font-size:.8rem; font-weight:500; display:inline-flex; align-items:center; gap:4px; }
    .btn-p { background:var(--pri); color:#fff; } .btn-p:hover { background:var(--pri-dk); }
    .btn-g { background:var(--grn); color:#fff; } .btn-g:hover { background:#1b5e20; }
    .btn-d { background:var(--red); color:#fff; } .btn-d:hover { background:#c62828; }
    .btn-o { background:#fff; color:var(--pri); border:1px solid var(--pri); } .btn-o:hover { background:#e3f2fd; }
    .btn-s { padding:3px 8px; font-size:.73rem; }
    .muted { font-size:.78rem; color:#888; }

    .thdr { padding:10px 14px; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--bdr); flex-wrap:wrap; gap:6px; }
    .thdr h2 { font-size:1rem; display:flex; align-items:center; gap:6px; }
    .tctrl { display:flex; gap:6px; align-items:center; }
    .sbox { padding:5px 10px; border:1px solid #ccc; border-radius:4px; font-size:.83rem; width:160px; }
    .scr { overflow-x:auto; max-height:calc(100vh - 280px); }
    table { width:100%; border-collapse:collapse; font-size:.78rem; }
    th { background:#fafafa; padding:7px 10px; text-align:left; border-bottom:2px solid var(--bdr); position:sticky; top:0; cursor:pointer; white-space:nowrap; user-select:none; z-index:1; }
    th:hover { background:#eee; }
    td { padding:5px 10px; border-bottom:1px solid #f0f0f0; max-width:260px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    td.ed { cursor:pointer; } td.ed:hover { background:#e3f2fd; outline:1px solid var(--pri); }
    tr:hover { background:#fafafa; }
    .nl { color:#bbb; font-style:italic; }
    .jc { cursor:pointer; color:var(--pri); font-weight:500; } .jc:hover { text-decoration:underline; }
    .pag { padding:8px 14px; display:flex; justify-content:space-between; align-items:center; border-top:1px solid var(--bdr); background:#fafafa; }

    .stats { display:flex; gap:10px; }
    .sc { background:var(--card); padding:14px; border-radius:8px; box-shadow:0 1px 3px rgba(0,0,0,.08); flex:1; text-align:center; min-width:100px; }
    .sc .num { font-size:1.4rem; font-weight:700; color:var(--pri); }
    .sc .lbl { font-size:.68rem; color:#888; text-transform:uppercase; margin-top:2px; }

    .mo { position:fixed; top:0; left:0; right:0; bottom:0; background:rgba(0,0,0,.45); display:flex; align-items:center; justify-content:center; z-index:1000; }
    .md { background:#fff; border-radius:8px; padding:22px; max-width:560px; width:92%; max-height:85vh; overflow:auto; }
    .md h3 { margin-bottom:14px; font-size:1rem; }
    .md pre { background:#f5f5f5; padding:10px; border-radius:4px; overflow:auto; font-size:.78rem; max-height:55vh; }
    .fr { margin-bottom:10px; }
    .fr label { display:block; font-size:.78rem; font-weight:600; margin-bottom:3px; color:#555; }
    .fr input,.fr select { width:100%; padding:7px 10px; border:1px solid #ccc; border-radius:4px; font-size:.83rem; }
    .br { display:flex; gap:8px; justify-content:flex-end; margin-top:14px; }

    .ie { padding:3px 6px; border:2px solid var(--pri); border-radius:3px; font-size:.78rem; width:100%; min-width:80px; outline:none; }

    .al { padding:9px 14px; border-radius:4px; margin-bottom:10px; font-size:.83rem; }
    .al-e { background:#ffebee; color:var(--red); border-left:4px solid var(--red); }
    .al-s { background:#e8f5e9; color:var(--grn); border-left:4px solid var(--grn); }
    .al-i { background:#e3f2fd; color:var(--pri); border-left:4px solid var(--pri); }
  </style>
</head>
<body>
  <div class="hdr">
    <h1>&#128451; Database Manager</h1>
    <div class="hdr-r">
      <button onclick="showAddUser()">&#128100;+ Add User</button>
      <a href="http://localhost:3000/admin">&#8592; Dashboard</a>
    </div>
  </div>
  <div class="wrap">
    <div class="side" id="sb"><h3>Tables</h3><div style="padding:16px;color:#888;text-align:center">Loading...</div></div>
    <div class="main" id="mn">
      <div class="stats" id="st"></div>
      <div class="card qbox">
        <textarea id="qi" placeholder="SELECT * FROM users LIMIT 10   (Ctrl+Enter to run)"></textarea>
        <div class="acts">
          <button class="btn btn-p" onclick="runQ()">&#9654; Run Query</button>
          <span class="muted" id="qinfo"></span>
        </div>
      </div>
      <div id="alrt"></div>
      <div id="res"><div class="card" style="padding:36px;text-align:center;color:#888">Select a table from the sidebar or run a query</div></div>
    </div>
  </div>
  <div class="mo" id="mo" style="display:none" onclick="clMo()"><div class="md" onclick="event.stopPropagation()" id="mb"></div></div>

<script>
var A='/api/admin/db', T=localStorage.getItem('token');
var H={'Authorization':'Bearer '+T,'Content-Type':'application/json'};
var S={tbl:null,pg:1,sch:'',ob:'rowid',od:'DESC',cols:[]};

function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function alert2(m,t){var e=document.getElementById('alrt');e.innerHTML='<div class="al al-'+t+'">'+esc(m)+'</div>';setTimeout(function(){e.innerHTML='';},4500);}

async function af(u,o){
  o=o||{};
  try{
    var r=await fetch(A+u,Object.assign({},o,{headers:H}));
    if(r.status===401){alert('Session expired');window.location.href='http://localhost:3000/login';return null;}
    var d=await r.json();
    if(!d.success){alert2(d.message||'Failed','e');return null;}
    return d;
  }catch(e){alert2('Network error: '+e.message,'e');return null;}
}

async function loadTbls(){
  var d=await af('/tables');if(!d)return;
  var sb=document.getElementById('sb');
  var tot=d.tables.reduce(function(a,t){return a+t.rowCount;},0);
  sb.innerHTML='<h3>Tables ('+d.tables.length+')</h3>';
  d.tables.forEach(function(t){
    var div=document.createElement('div');
    div.className='ti'+(S.tbl===t.name?' act':'');
    div.innerHTML='<span>'+esc(t.name)+'</span><span class="badge">'+t.rowCount+'</span>';
    div.addEventListener('click',function(){loadTbl(t.name);});
    sb.appendChild(div);
  });
  document.getElementById('st').innerHTML=
    '<div class="sc"><div class="num">'+d.tables.length+'</div><div class="lbl">Tables</div></div>'+
    '<div class="sc"><div class="num">'+tot+'</div><div class="lbl">Total Rows</div></div>';
}

async function loadTbl(n,p){
  p=p||1; S.tbl=n; S.pg=p;
  document.querySelectorAll('.ti').forEach(function(el){
    var nm=el.querySelector('span').textContent;
    el.classList.toggle('act',nm===n);
  });
  var q='?page='+p+'&limit=50&orderBy='+S.ob+'&orderDir='+S.od;
  if(S.sch)q+='&search='+encodeURIComponent(S.sch);
  var d=await af('/table/'+n+q);if(!d)return;
  S.cols=d.columnInfo||[];
  rTbl(d);
}

function rTbl(d){
  var tbl=d.table,cols=d.columns,rows=d.rows,pg=d.pagination,isU=(tbl==='users');
  var ar=document.getElementById('res');ar.innerHTML='';
  var cd=document.createElement('div');cd.className='card';

  // header
  var hd=document.createElement('div');hd.className='thdr';
  var h2=document.createElement('h2');
  h2.innerHTML=esc(tbl)+' <span class="muted">('+pg.total+' rows)</span>';
  var rc=document.createElement('div');rc.className='tctrl';

  if(isU){
    var ub=document.createElement('button');ub.className='btn btn-p btn-s';
    ub.innerHTML='&#128100;+ Add User';
    ub.addEventListener('click',showAddUser);
    rc.appendChild(ub);
  }

  var si=document.createElement('input');si.className='sbox';si.placeholder='Search...';si.value=S.sch;
  si.addEventListener('keyup',function(e){if(e.key==='Enter'){S.sch=this.value;loadTbl(tbl);}});
  rc.appendChild(si);

  var ab=document.createElement('button');ab.className='btn btn-g btn-s';ab.innerHTML='+ Add Row';
  ab.addEventListener('click',function(){showIns(tbl,d.columnInfo||S.cols||[]);});
  rc.appendChild(ab);

  hd.appendChild(h2);hd.appendChild(rc);cd.appendChild(hd);

  // table
  var sc=document.createElement('div');sc.className='scr';
  var tb=document.createElement('table');
  var th=document.createElement('thead');
  var hr=document.createElement('tr');
  cols.forEach(function(c){
    var t=document.createElement('th');
    var ar2=S.ob===c?(S.od==='ASC'?' \u2191':' \u2193'):'';
    t.textContent=c+ar2;
    t.addEventListener('click',function(){togSort(c);});
    hr.appendChild(t);
  });
  var ta=document.createElement('th');ta.textContent='Actions';ta.style.minWidth='90px';hr.appendChild(ta);
  th.appendChild(hr);tb.appendChild(th);

  var tbody=document.createElement('tbody');
  rows.forEach(function(row){
    var tr=document.createElement('tr');
    cols.forEach(function(c){
      var td=document.createElement('td');
      var v=row[c],isId=(c==='id'),isPw=(c==='password');
      if(v===null||v===undefined){td.innerHTML='<span class="nl">NULL</span>';}
      else if(typeof v==='object'){td.textContent='{JSON}';td.className='jc';td.addEventListener('click',function(){showJ(c,JSON.stringify(v));});}
      else if(isPw){td.textContent='\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022';td.style.color='#aaa';}
      else{var s=String(v);td.textContent=s.length>50?s.substring(0,50)+'\u2026':s;td.title=s;}

      if(!isId&&!isPw&&v!==null&&typeof v!=='object'){
        td.className='ed';
        td.addEventListener('dblclick',function(){inEd(td,tbl,row,c);});
      }
      tr.appendChild(td);
    });
    var tda=document.createElement('td');
    var pk=row.id!==undefined?row.id:row[cols[0]];
    var eb=document.createElement('button');eb.className='btn btn-o btn-s';eb.textContent='Edit';
    eb.addEventListener('click',function(){showEdF(tbl,row,cols);});
    var db=document.createElement('button');db.className='btn btn-d btn-s';db.textContent='Del';db.style.marginLeft='3px';
    db.addEventListener('click',function(){delR(tbl,pk);});
    tda.appendChild(eb);tda.appendChild(db);tr.appendChild(tda);
    tbody.appendChild(tr);
  });
  tb.appendChild(tbody);sc.appendChild(tb);cd.appendChild(sc);

  // pagination
  var pd=document.createElement('div');pd.className='pag';
  var pi=document.createElement('span');pi.className='muted';
  pi.textContent='Page '+pg.page+' / '+pg.totalPages+' \u2022 '+pg.total+' rows';
  pd.appendChild(pi);
  var pb=document.createElement('div');pb.style.cssText='display:flex;gap:6px';
  if(pg.page>1){var pv=document.createElement('button');pv.className='btn btn-o btn-s';pv.textContent='\u2190 Prev';pv.addEventListener('click',function(){loadTbl(tbl,pg.page-1);});pb.appendChild(pv);}
  if(pg.page<pg.totalPages){var nx=document.createElement('button');nx.className='btn btn-o btn-s';nx.textContent='Next \u2192';nx.addEventListener('click',function(){loadTbl(tbl,pg.page+1);});pb.appendChild(nx);}
  pd.appendChild(pb);cd.appendChild(pd);
  ar.appendChild(cd);
}

// Inline cell edit
function inEd(td,tbl,row,col){
  var old=row[col]!==null?String(row[col]):'';
  var inp=document.createElement('input');inp.className='ie';inp.value=old;
  td.textContent='';td.appendChild(inp);inp.focus();inp.select();
  function sv(){
    var nv=inp.value;if(nv===old){td.textContent=old;return;}
    var pk=row.id!==undefined?row.id:row[Object.keys(row)[0]];
    var b={};b[col]=nv;
    af('/table/'+tbl+'/'+pk,{method:'PUT',body:JSON.stringify(b)}).then(function(d){
      if(d){alert2('Updated '+col,'s');loadTbl(tbl,S.pg);}else{td.textContent=old;}
    });
  }
  inp.addEventListener('blur',sv);
  inp.addEventListener('keydown',function(e){
    if(e.key==='Enter'){e.preventDefault();inp.blur();}
    if(e.key==='Escape'){td.textContent=old;}
  });
}

// Edit row modal
function showEdF(tbl,row,cols){
  var pk=row.id!==undefined?row.id:row[cols[0]];
  var mb=document.getElementById('mb');
  mb.innerHTML='';
  var h=document.createElement('h3');h.textContent='\u270E Edit Row in '+tbl;mb.appendChild(h);

  cols.forEach(function(c){
    var d=document.createElement('div');d.className='fr';
    var l=document.createElement('label');l.textContent=c;d.appendChild(l);
    var inp=document.createElement('input');inp.id='ed-'+c;
    if(c==='id'){inp.value=row[c]||'';inp.disabled=true;}
    else if(c==='password'){inp.type='password';inp.placeholder='Leave blank to keep current';}
    else if(typeof row[c]==='object'&&row[c]!==null){inp.value=JSON.stringify(row[c]);}
    else{inp.value=row[c]!==null&&row[c]!==undefined?String(row[c]):'';}
    d.appendChild(inp);mb.appendChild(d);
  });

  var br=document.createElement('div');br.className='br';
  var cb=document.createElement('button');cb.className='btn btn-o';cb.textContent='Cancel';cb.addEventListener('click',clMo);
  var sb=document.createElement('button');sb.className='btn btn-p';sb.textContent='Save Changes';
  sb.addEventListener('click',function(){
    var body={};
    cols.forEach(function(c){
      if(c==='id')return;
      var inp=document.getElementById('ed-'+c);
      if(!inp)return;
      if(c==='password'&&inp.value==='')return;
      if(inp.value!=='')body[c]=inp.value;
    });
    if(!Object.keys(body).length){alert2('No changes','i');return;}
    af('/table/'+tbl+'/'+pk,{method:'PUT',body:JSON.stringify(body)}).then(function(d){
      if(d){alert2('Row updated','s');clMo();loadTbl(tbl,S.pg);}
    });
  });
  br.appendChild(cb);br.appendChild(sb);mb.appendChild(br);
  document.getElementById('mo').style.display='flex';
}

// Insert row modal
function showIns(tbl,colInfo){
  var mb=document.getElementById('mb');mb.innerHTML='';
  var h=document.createElement('h3');h.textContent='\u2795 Insert Row into '+tbl;mb.appendChild(h);

  (colInfo||[]).forEach(function(ci){
    if(ci.name==='id')return;
    var d=document.createElement('div');d.className='fr';
    var l=document.createElement('label');
    l.innerHTML=esc(ci.name)+' <span class="muted">('+esc(ci.type||'TEXT')+(ci.notnull?', required':'')+')</span>';
    d.appendChild(l);
    var inp=document.createElement('input');inp.id='ins-'+ci.name;inp.placeholder=ci.name;
    d.appendChild(inp);mb.appendChild(d);
  });

  var br=document.createElement('div');br.className='br';
  var cb=document.createElement('button');cb.className='btn btn-o';cb.textContent='Cancel';cb.addEventListener('click',clMo);
  var sb=document.createElement('button');sb.className='btn btn-g';sb.textContent='Insert Row';
  sb.addEventListener('click',function(){
    var body={};
    (colInfo||[]).forEach(function(ci){
      if(ci.name==='id')return;
      var inp=document.getElementById('ins-'+ci.name);
      if(inp&&inp.value.trim()!=='')body[ci.name]=inp.value.trim();
    });
    if(!Object.keys(body).length){alert2('Fill at least one field','e');return;}
    af('/table/'+tbl,{method:'POST',body:JSON.stringify(body)}).then(function(d){
      if(d){alert2('Row inserted','s');clMo();loadTbl(tbl,S.pg);loadTbls();}
    });
  });
  br.appendChild(cb);br.appendChild(sb);mb.appendChild(br);
  document.getElementById('mo').style.display='flex';
}

// Add User modal
function showAddUser(){
  var roles=['L1_ADMIN','L2_SENIOR_ENGINEER','L3_JUNIOR_ENGINEER','PROJECT_MANAGER','GROUND_MANAGER','CEO'];
  var mb=document.getElementById('mb');mb.innerHTML='';

  var h=document.createElement('h3');h.textContent='\uD83D\uDC64 Create New User';mb.appendChild(h);

  var fields=[
    {id:'u-fn',label:'First Name *',ph:'John',type:'text'},
    {id:'u-ln',label:'Last Name *',ph:'Doe',type:'text'},
    {id:'u-em',label:'Email *',ph:'john@example.com',type:'email'},
    {id:'u-pw',label:'Password *',ph:'Min 6 characters',type:'password'},
    {id:'u-ph',label:'Phone',ph:'+91 1234567890',type:'text'}
  ];

  fields.forEach(function(f){
    var d=document.createElement('div');d.className='fr';
    var l=document.createElement('label');l.textContent=f.label;d.appendChild(l);
    var inp=document.createElement('input');inp.id=f.id;inp.type=f.type;inp.placeholder=f.ph;
    d.appendChild(inp);mb.appendChild(d);
  });

  // Role select
  var rd=document.createElement('div');rd.className='fr';
  var rl=document.createElement('label');rl.textContent='Role *';rd.appendChild(rl);
  var sel=document.createElement('select');sel.id='u-rl';
  roles.forEach(function(r){
    var o=document.createElement('option');o.value=r;o.textContent=r.replace(/_/g,' ');sel.appendChild(o);
  });
  rd.appendChild(sel);mb.appendChild(rd);

  var br=document.createElement('div');br.className='br';
  var cb=document.createElement('button');cb.className='btn btn-o';cb.textContent='Cancel';cb.addEventListener('click',clMo);
  var sb=document.createElement('button');sb.className='btn btn-g';sb.textContent='Create User';
  sb.addEventListener('click',function(){
    var body={
      firstName:document.getElementById('u-fn').value.trim(),
      lastName:document.getElementById('u-ln').value.trim(),
      email:document.getElementById('u-em').value.trim(),
      password:document.getElementById('u-pw').value,
      role:document.getElementById('u-rl').value,
      phone:document.getElementById('u-ph').value.trim()||null
    };
    if(!body.firstName||!body.lastName||!body.email||!body.password){alert2('Fill all required fields','e');return;}
    if(body.password.length<6){alert2('Password must be at least 6 characters','e');return;}
    af('/create-user',{method:'POST',body:JSON.stringify(body)}).then(function(d){
      if(d){alert2('User '+body.email+' created!','s');clMo();if(S.tbl==='users')loadTbl('users',S.pg);loadTbls();}
    });
  });
  br.appendChild(cb);br.appendChild(sb);mb.appendChild(br);
  document.getElementById('mo').style.display='flex';
}

function togSort(c){
  if(S.ob===c)S.od=S.od==='ASC'?'DESC':'ASC';
  else{S.ob=c;S.od='DESC';}
  loadTbl(S.tbl,S.pg);
}

async function delR(tbl,id){
  if(!confirm('Delete this row from '+tbl+'?'))return;
  var d=await af('/table/'+tbl+'/'+id,{method:'DELETE'});
  if(d){alert2('Row deleted','s');loadTbl(tbl,S.pg);loadTbls();}
}

async function runQ(){
  var sql=document.getElementById('qi').value.trim();if(!sql)return;
  var info=document.getElementById('qinfo');info.textContent='Running...';
  var d=await af('/query',{method:'POST',body:JSON.stringify({sql:sql})});
  if(!d){info.textContent='';return;}
  info.textContent=d.rowCount+' rows in '+d.duration;
  if(!d.rows.length){document.getElementById('res').innerHTML='<div class="card al-s" style="padding:18px;margin:0">Query OK \u2014 0 rows</div>';return;}
  var cs=Object.keys(d.rows[0]);
  rTbl({table:'Query Result',columns:cs,rows:d.rows,pagination:{page:1,total:d.rowCount,totalPages:1},columnInfo:[]});
}

function showJ(col,json){
  var pretty;try{pretty=JSON.stringify(JSON.parse(json),null,2);}catch(e){pretty=json;}
  var mb=document.getElementById('mb');mb.innerHTML='';
  var h=document.createElement('h3');h.textContent='\uD83D\uDCC4 '+col;mb.appendChild(h);
  var pre=document.createElement('pre');pre.textContent=pretty;mb.appendChild(pre);
  var br=document.createElement('div');br.className='br';
  var cb=document.createElement('button');cb.className='btn btn-p';cb.textContent='Close';cb.addEventListener('click',clMo);
  br.appendChild(cb);mb.appendChild(br);
  document.getElementById('mo').style.display='flex';
}

function clMo(){document.getElementById('mo').style.display='none';}

document.getElementById('qi').addEventListener('keydown',function(e){if(e.ctrlKey&&e.key==='Enter')runQ();});
document.addEventListener('keydown',function(e){if(e.key==='Escape')clMo();});

if(!T){
  document.getElementById('mn').innerHTML='<div class="card al-e" style="padding:28px;margin:16px">Not authenticated. <a href="http://localhost:3000/login">Login as Admin</a> first, then return here.</div>';
}else{
  loadTbls();
}
</script>
</body>
</html>`;
}

module.exports = router;
