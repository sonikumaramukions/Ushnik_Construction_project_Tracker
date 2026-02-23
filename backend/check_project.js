// ================================================================
// CHECK PROJECT (check_project.js)
// ================================================================
// PURPOSE: Debug script to list all projects in the database.
// RUN: node check_project.js
// ================================================================

const { Project } = require('./models');

async function checkProject() {
    try {
        const project = await Project.findByPk('00000000-0000-0000-0000-000000000001');
        if (project) {
            console.log('Project found:', project.toJSON());
        } else {
            console.log('Project NOT found');
        }
    } catch (error) {
        console.error('Error:', error);
    }
}

checkProject();
