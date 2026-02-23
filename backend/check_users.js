// ================================================================
// CHECK USERS (check_users.js)
// ================================================================
// PURPOSE: Debug script to list all users in the database.
// RUN: node check_users.js
// ================================================================

const { sequelize } = require('./config/database');
const { User } = require('./models');

async function checkUsers() {
    try {
        await sequelize.authenticate();
        console.log('Database connected.');

        const users = await User.findAll();
        console.log('Users found:', users.length);
        users.forEach(user => {
            console.log(`ID: ${user.id}, Email: ${user.email}, Role: ${user.role}, IsActive: ${user.isActive}`);
        });

        await sequelize.close();
    } catch (error) {
        console.error('Error:', error);
    }
}

checkUsers();
