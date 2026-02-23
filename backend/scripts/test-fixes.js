/**
 * Quick API test: verifies cell saving and assignment creation work after constraint fix.
 */
const http = require('http');

function req(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: 'localhost', port: 5001,
      path: '/api' + path, method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    const r = http.request(opts, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode, body: data }); }
      });
    });
    r.on('error', reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

async function main() {
  console.log('=== API Integration Test ===\n');

  // 1. Login
  const login = await req('POST', '/auth/login', { email: 'admin@construction.com', password: 'admin123' });
  if (login.status !== 200 || !login.body.token) {
    console.log('❌ Login failed:', login.status, login.body);
    process.exit(1);
  }
  const token = login.body.token;
  console.log('✅ Login OK');

  // 2. Get sheets via projects
  const proj = await req('GET', '/projects', null, token);
  const projects = proj.body.projects || proj.body.data || [];
  let sheetId = null;
  for (const p of projects) {
    if (p.sheets && p.sheets.length > 0) {
      sheetId = p.sheets[0].id;
      break;
    }
  }
  if (!sheetId) {
    console.log('❌ No sheets found');
    process.exit(1);
  }
  console.log('✅ Found sheet:', sheetId);

  // 3. Save cell A1 (new or update)
  const save1 = await req('PUT', '/data/cell', { sheetId, cellId: 'A1', value: 'Hello', dataType: 'TEXT' }, token);
  console.log(`${save1.status === 200 ? '✅' : '❌'} Save A1: HTTP ${save1.status}`, save1.status !== 200 ? JSON.stringify(save1.body).substring(0,200) : '');

  // 4. Save cell B1
  const save2 = await req('PUT', '/data/cell', { sheetId, cellId: 'B1', value: 'World', dataType: 'TEXT' }, token);
  console.log(`${save2.status === 200 ? '✅' : '❌'} Save B1: HTTP ${save2.status}`, save2.status !== 200 ? JSON.stringify(save2.body).substring(0,200) : '');

  // 5. Update A1 again (upsert test)
  const save3 = await req('PUT', '/data/cell', { sheetId, cellId: 'A1', value: 'Updated', dataType: 'TEXT' }, token);
  console.log(`${save3.status === 200 ? '✅' : '❌'} Update A1: HTTP ${save3.status}`, save3.status !== 200 ? JSON.stringify(save3.body).substring(0,200) : '');

  // 6. Get users to find a non-admin user
  const users = await req('GET', '/users', null, token);
  const userList = users.body.users || users.body.data || [];
  const targetUser = userList.find(u => u.role !== 'L1_ADMIN');
  if (!targetUser) {
    console.log('⚠️  No non-admin user found, skipping assignment test');
  } else {
    console.log('✅ Found target user:', targetUser.email, targetUser.role);

    // 7. Create assignment
    const assign1 = await req('POST', '/assignments/assign', {
      sheetId,
      userId: targetUser.id,
      assignmentType: 'ROW',
      assignedRows: [1, 2],
      question: 'Please fill in row 1 and 2',
      priority: 'HIGH',
    }, token);
    console.log(`${assign1.status === 201 || assign1.status === 200 ? '✅' : '❌'} Assignment 1: HTTP ${assign1.status}`, assign1.status >= 400 ? JSON.stringify(assign1.body).substring(0,200) : '');

    // 8. Create ANOTHER assignment for same user (should NOT fail now)
    const assign2 = await req('POST', '/assignments/assign', {
      sheetId,
      userId: targetUser.id,
      assignmentType: 'COLUMN',
      assignedColumns: ['C', 'D'],
      question: 'Fill columns C and D',
      priority: 'MEDIUM',
    }, token);
    console.log(`${assign2.status === 201 || assign2.status === 200 ? '✅' : '❌'} Assignment 2: HTTP ${assign2.status}`, assign2.status >= 400 ? JSON.stringify(assign2.body).substring(0,200) : '');
  }

  // 9. Verify cell data persisted
  const sheetData = await req('GET', `/data/sheet/${sheetId}`, null, token);
  const cells = sheetData.body.cells || sheetData.body.data || [];
  console.log(`\n✅ Sheet has ${cells.length} cells after saves`);

  const a1 = cells.find(c => c.cellId === 'A1');
  const b1 = cells.find(c => c.cellId === 'B1');
  console.log(`   A1 = "${a1?.value}" (expect "Updated")`);
  console.log(`   B1 = "${b1?.value}" (expect "World")`);

  console.log('\n=== Test Complete ===');
}

main().catch(err => { console.error('Fatal:', err); process.exit(1); });
