// ================================================================
// CHECK PASSWORD (scripts/check-pw.js)
// ================================================================
// PURPOSE: Debug script to verify a user's password hash in the DB.
// RUN: node scripts/check-pw.js
// ================================================================

const {sequelize} = require('../config/database');
const User = require('../models/User');
const bcrypt = require('bcryptjs');
(async () => {
  await sequelize.authenticate();
  const user = await User.findOne({ where: { email: 'admin@construction.com' } });
  const ok1 = await bcrypt.compare('admin123', user.password);
  console.log('admin123:', ok1);
  const ok2 = await bcrypt.compare('password123', user.password);
  console.log('password123:', ok2);
  const ok3 = await bcrypt.compare('Admin@123', user.password);
  console.log('Admin@123:', ok3);
  process.exit(0);
})();
