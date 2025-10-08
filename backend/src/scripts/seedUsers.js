#!/usr/bin/env node

/**
 * Seed Demo Users Script
 * Creates demo users for testing the Campus Security System
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
require('dotenv').config();

const demoUsers = [
    {
        _id: 'admin_user_001',
        username: 'admin',
        email: 'admin@campus.edu',
        password: 'admin123',
        role: 'ADMIN',
        status: 'active',
        profile: {
            first_name: 'System',
            last_name: 'Administrator',
            department: 'IT Security',
            phone: '+1-555-0101',
            employee_id: 'ADM001'
        },
        preferences: {
            theme: 'dark',
            notifications: {
                email: true,
                sms: true,
                push: true,
                alert_types: ['INACTIVITY', 'UNUSUAL_LOCATION', 'MULTIPLE_PRESENCE', 'PATTERN_ANOMALY', 'SECURITY_BREACH', 'SYSTEM_ERROR']
            }
        }
    },
    {
        _id: 'security_user_001',
        username: 'security',
        email: 'security@campus.edu',
        password: 'security123',
        role: 'SECURITY_OFFICER',
        status: 'active',
        profile: {
            first_name: 'Security',
            last_name: 'Officer',
            department: 'Campus Security',
            phone: '+1-555-0102',
            employee_id: 'SEC001'
        },
        preferences: {
            theme: 'dark',
            notifications: {
                email: true,
                sms: true,
                push: true,
                alert_types: ['UNUSUAL_LOCATION', 'MULTIPLE_PRESENCE', 'SECURITY_BREACH']
            }
        }
    },
    {
        _id: 'operator_user_001',
        username: 'operator',
        email: 'operator@campus.edu',
        password: 'operator123',
        role: 'OPERATOR',
        status: 'active',
        profile: {
            first_name: 'System',
            last_name: 'Operator',
            department: 'Operations',
            phone: '+1-555-0103',
            employee_id: 'OPR001'
        },
        preferences: {
            theme: 'light',
            notifications: {
                email: true,
                sms: false,
                push: true,
                alert_types: ['INACTIVITY', 'SYSTEM_ERROR']
            }
        }
    },
    {
        _id: 'viewer_user_001',
        username: 'viewer',
        email: 'viewer@campus.edu',
        password: 'viewer123',
        role: 'VIEWER',
        status: 'active',
        profile: {
            first_name: 'Data',
            last_name: 'Viewer',
            department: 'Analytics',
            phone: '+1-555-0104',
            employee_id: 'VWR001'
        },
        preferences: {
            theme: 'auto',
            notifications: {
                email: false,
                sms: false,
                push: true,
                alert_types: []
            }
        }
    }
];

async function seedUsers() {
    try {
        console.log('🌱 Seeding demo users...');
        
        // Connect to MongoDB
        const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/campus_security';
        await mongoose.connect(mongoUri, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('✅ Connected to MongoDB');

        // Clear existing demo users
        await User.deleteMany({ 
            email: { 
                $in: demoUsers.map(user => user.email) 
            } 
        });
        console.log('🧹 Cleared existing demo users');

        // Create demo users
        for (const userData of demoUsers) {
            // Create user with plain password (let the model hash it)
            const user = new User({
                ...userData,
                // Don't pre-hash the password - let the model's pre-save middleware handle it
                password: userData.password, // This will be hashed by the pre-save middleware
                created_at: new Date(),
                updated_at: new Date(),
                last_login: null,
                sessions: [],
                audit_logs: []
            });

            await user.save();
            console.log(`✅ Created user: ${userData.email} (${userData.role})`);
        }

        console.log('\n🎉 Demo users created successfully!');
        console.log('\n📋 Login Credentials:');
        console.log('┌─────────────────────────────────────────────────────────┐');
        console.log('│ Role              │ Email                │ Password     │');
        console.log('├─────────────────────────────────────────────────────────┤');
        console.log('│ Admin             │ admin@campus.edu     │ admin123     │');
        console.log('│ Security Officer  │ security@campus.edu  │ security123  │');
        console.log('│ Operator          │ operator@campus.edu  │ operator123  │');
        console.log('│ Viewer            │ viewer@campus.edu    │ viewer123    │');
        console.log('└─────────────────────────────────────────────────────────┘');
        
        console.log('\n🚀 You can now login to the frontend with these credentials!');

    } catch (error) {
        console.error('❌ Error seeding users:', error);
        process.exit(1);
    } finally {
        await mongoose.connection.close();
        console.log('📝 Database connection closed');
        process.exit(0);
    }
}

// Handle Ctrl+C
process.on('SIGINT', async () => {
    console.log('\n👋 Seeding interrupted');
    await mongoose.connection.close();
    process.exit(0);
});

// Run the seeding
seedUsers();