// ================================================================
// CREATE DEFAULT PROJECT (create-default-project.js)
// ================================================================
// PURPOSE: Creates a default project if none exists.
// Useful for first-time setup.
// RUN: node create-default-project.js
// ================================================================

const { User, Project } = require('./models');

async function createDefaultProject() {
    try {
        console.log('Creating default project...');

        // Find an admin user to be the creator
        const admin = await User.findOne({
            where: { role: 'L1_ADMIN' }
        });

        if (!admin) {
            console.error('No admin user found. Please create an admin user first.');
            process.exit(1);
        }

        console.log('Found admin user:', admin.email);

        // Check if default project already exists
        const existingProject = await Project.findByPk('00000000-0000-0000-0000-000000000001');

        if (existingProject) {
            console.log('Default project already exists');
            process.exit(0);
        }

        // Create default project
        const project = await Project.create({
            id: '00000000-0000-0000-0000-000000000001',
            name: 'Default Project',
            description: 'Default project for sheet management',
            status: 'ACTIVE',
            priority: 'MEDIUM',
            createdById: admin.id,
            startDate: new Date(),
            estimatedEndDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
            budget: 0,
            location: 'N/A',
        });

        console.log('Default project created successfully:', project.id);
        process.exit(0);

    } catch (error) {
        console.error('Error creating default project:', error);
        console.error(error.stack);
        process.exit(1);
    }
}

createDefaultProject();
