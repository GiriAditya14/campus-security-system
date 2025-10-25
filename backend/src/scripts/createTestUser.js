const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
require('dotenv').config();

async function createTestUser() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/campus_security', {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });

        console.log('Connected to MongoDB');

        // Check if test user already exists
        const existingUser = await User.findOne({ email: 'admin@campus.edu' });
        if (existingUser) {
            console.log('Test user already exists');
            console.log('Email: admin@campus.edu');
            console.log('Password: admin123');
            return;
        }

        // Hash password
        const saltRounds = 12;
        const hashedPassword = await bcrypt.hash('admin123', saltRounds);

        // Create test user
        const testUser = new User({
            _id: 'admin-001',
            username: 'admin',
            email: 'admin@campus.edu',
            password: hashedPassword,
            role: 'ADMIN',
            profile: {
                first_name: 'System',
                last_name: 'Administrator',
                phone: '+1234567890',
                department: 'IT Security',
                employee_id: 'EMP001'
            },
            status: 'active',
            preferences: {
                theme: 'dark',
                language: 'en',
                timezone: 'UTC',
                notifications: {
                    email: true,
                    sms: false,
                    push: true,
                    alert_types: ['SECURITY_BREACH', 'SYSTEM_ERROR', 'UNUSUAL_LOCATION']
                },
                dashboard: {
                    default_view: 'overview',
                    refresh_interval: 30000,
                    items_per_page: 25
                }
            }
        });

        await testUser.save();

        console.log('Test user created successfully!');
        console.log('Email: admin@campus.edu');
        console.log('Password: admin123');
        console.log('Role: ADMIN');

        // Create additional test users
        const users = [
            {
                _id: 'security-001',
                username: 'security_officer',
                email: 'security@campus.edu',
                password: await bcrypt.hash('security123', saltRounds),
                role: 'SECURITY_OFFICER',
                profile: {
                    first_name: 'John',
                    last_name: 'Security',
                    department: 'Campus Security',
                    employee_id: 'SEC001'
                },
                status: 'active'
            },
            {
                _id: 'operator-001',
                username: 'operator',
                email: 'operator@campus.edu',
                password: await bcrypt.hash('operator123', saltRounds),
                role: 'OPERATOR',
                profile: {
                    first_name: 'Jane',
                    last_name: 'Operator',
                    department: 'Operations',
                    employee_id: 'OPR001'
                },
                status: 'active'
            },
            {
                _id: 'viewer-001',
                username: 'viewer',
                email: 'viewer@campus.edu',
                password: await bcrypt.hash('viewer123', saltRounds),
                role: 'VIEWER',
                profile: {
                    first_name: 'Bob',
                    last_name: 'Viewer',
                    department: 'Analytics',
                    employee_id: 'VWR001'
                },
                status: 'active'
            }
        ];

        for (const userData of users) {
            const existingUser = await User.findOne({ email: userData.email });
            if (!existingUser) {
                const user = new User(userData);
                await user.save();
                console.log(`Created user: ${userData.email} (${userData.role})`);
            }
        }

        console.log('\nAll test users created successfully!');
        console.log('You can now log in with any of these credentials:');
        console.log('- admin@campus.edu / admin123 (ADMIN)');
        console.log('- security@campus.edu / security123 (SECURITY_OFFICER)');
        console.log('- operator@campus.edu / operator123 (OPERATOR)');
        console.log('- viewer@campus.edu / viewer123 (VIEWER)');

    } catch (error) {
        console.error('Error creating test user:', error);
    } finally {
        await mongoose.connection.close();
        console.log('Database connection closed');
    }
}

// Run the script
createTestUser();