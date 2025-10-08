const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const winston = require('winston');

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'logs/users.log' })
    ]
});

/**
 * GET /api/users
 * Get users with filtering and pagination
 */
router.get('/', async (req, res) => {
    try {
        // Check if user is authenticated
        if (!req.user) {
            return res.status(401).json({ 
                success: false,
                error: 'Authentication required' 
            });
        }
        
        // Check if user has permission to view users
        if (!['ADMIN', 'SECURITY_OFFICER'].includes(req.user.role)) {
            return res.status(403).json({ 
                success: false,
                error: 'Insufficient permissions to view users' 
            });
        }
        const {
            page = 1,
            limit = 20,
            role,
            status,
            search,
            sortBy = 'created_at',
            sortOrder = 'desc'
        } = req.query;

        // Build query
        const query = {};
        
        if (role) query.role = role;
        if (status) query.status = status;
        
        if (search) {
            query.$or = [
                { email: { $regex: search, $options: 'i' } },
                { 'profile.name': { $regex: search, $options: 'i' } },
                { 'profile.department': { $regex: search, $options: 'i' } }
            ];
        }

        // Execute query with pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const sortOptions = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

        const [users, total] = await Promise.all([
            User.find(query)
                .select('-password') // Exclude password from results
                .sort(sortOptions)
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            User.countDocuments(query)
        ]);

        res.json({
            success: true,
            data: users,
            total,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit)),
                hasMore: skip + users.length < total
            }
        });

    } catch (error) {
        logger.error('Error fetching users:', error);
        res.status(500).json({ error: 'Failed to fetch users' });
    }
});

/**
 * GET /api/users/:id
 * Get specific user by ID
 */
router.get('/:id', async (req, res) => {
    try {
        // Check if user is authenticated
        if (!req.user) {
            return res.status(401).json({ 
                success: false,
                error: 'Authentication required' 
            });
        }
        const user = await User.findById(req.params.id).select('-password');
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json(user);

    } catch (error) {
        logger.error('Error fetching user:', error);
        res.status(500).json({ error: 'Failed to fetch user' });
    }
});

/**
 * POST /api/users
 * Create new user (Admin only)
 */
router.post('/', async (req, res) => {
    try {
        // Check if user is authenticated
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        
        // Check if user has admin permissions
        if (req.user.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const { email, password, role, profile, preferences } = req.body;

        // Validate required fields
        if (!email || !password || !role) {
            return res.status(400).json({ 
                error: 'Email, password, and role are required' 
            });
        }

        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(409).json({ error: 'User already exists' });
        }

        // Hash password
        const saltRounds = 12;
        const hashedPassword = await bcrypt.hash(password, saltRounds);

        // Create user
        const user = new User({
            email,
            password: hashedPassword,
            role,
            profile: profile || {},
            preferences: preferences || {},
            created_by: req.user.id
        });

        await user.save();

        // Return user without password
        const userResponse = user.toObject();
        delete userResponse.password;

        logger.info(`User created: ${user.email}`, { 
            createdBy: req.user.id,
            role: user.role
        });

        res.status(201).json(userResponse);

    } catch (error) {
        logger.error('Error creating user:', error);
        res.status(500).json({ error: 'Failed to create user' });
    }
});

/**
 * PUT /api/users/:id
 * Update user
 */
router.put('/:id', async (req, res) => {
    try {
        // Check if user is authenticated
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        const { password, role, profile, preferences, status } = req.body;
        const updateData = { updated_at: new Date() };

        // Only admin can update role and status
        if (req.user.role !== 'ADMIN' && (role || status)) {
            return res.status(403).json({ 
                error: 'Admin access required to update role or status' 
            });
        }

        // Users can only update their own profile (unless admin)
        if (req.user.role !== 'ADMIN' && req.user.id !== req.params.id) {
            return res.status(403).json({ 
                error: 'Can only update your own profile' 
            });
        }

        // Hash password if provided
        if (password) {
            const saltRounds = 12;
            updateData.password = await bcrypt.hash(password, saltRounds);
        }

        if (role) updateData.role = role;
        if (profile) updateData.profile = { ...updateData.profile, ...profile };
        if (preferences) updateData.preferences = { ...updateData.preferences, ...preferences };
        if (status) updateData.status = status;

        const user = await User.findByIdAndUpdate(
            req.params.id,
            updateData,
            { new: true, runValidators: true }
        ).select('-password');

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        logger.info(`User updated: ${user.email}`, { 
            updatedBy: req.user.id,
            changes: Object.keys(updateData)
        });

        res.json(user);

    } catch (error) {
        logger.error('Error updating user:', error);
        res.status(500).json({ error: 'Failed to update user' });
    }
});

/**
 * DELETE /api/users/:id
 * Delete user (soft delete - set status to inactive)
 */
router.delete('/:id', async (req, res) => {
    try {
        // Check if user is authenticated
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        
        // Only admin can delete users
        if (req.user.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        // Prevent self-deletion
        if (req.user.id === req.params.id) {
            return res.status(400).json({ error: 'Cannot delete your own account' });
        }

        const user = await User.findByIdAndUpdate(
            req.params.id,
            { 
                status: 'inactive',
                updated_at: new Date(),
                deleted_by: req.user.id,
                deleted_at: new Date()
            },
            { new: true }
        ).select('-password');

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        logger.info(`User deleted: ${user.email}`, { 
            deletedBy: req.user.id
        });

        res.json({ message: 'User deleted successfully' });

    } catch (error) {
        logger.error('Error deleting user:', error);
        res.status(500).json({ error: 'Failed to delete user' });
    }
});

/**
 * GET /api/users/me/profile
 * Get current user's profile
 */
router.get('/me/profile', async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        res.json(user);

    } catch (error) {
        logger.error('Error fetching user profile:', error);
        res.status(500).json({ error: 'Failed to fetch profile' });
    }
});

/**
 * PUT /api/users/me/profile
 * Update current user's profile
 */
router.put('/me/profile', async (req, res) => {
    try {
        const { profile, preferences } = req.body;
        const updateData = { updated_at: new Date() };

        if (profile) updateData.profile = { ...req.user.profile, ...profile };
        if (preferences) updateData.preferences = { ...req.user.preferences, ...preferences };

        const user = await User.findByIdAndUpdate(
            req.user.id,
            updateData,
            { new: true, runValidators: true }
        ).select('-password');

        logger.info(`User profile updated: ${user.email}`);
        res.json(user);

    } catch (error) {
        logger.error('Error updating user profile:', error);
        res.status(500).json({ error: 'Failed to update profile' });
    }
});

/**
 * POST /api/users/me/change-password
 * Change current user's password
 */
router.post('/me/change-password', async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({ 
                error: 'Current password and new password are required' 
            });
        }

        // Get user with password
        const user = await User.findById(req.user.id);
        
        // Verify current password
        const isValidPassword = await bcrypt.compare(currentPassword, user.password);
        if (!isValidPassword) {
            return res.status(400).json({ error: 'Current password is incorrect' });
        }

        // Hash new password
        const saltRounds = 12;
        const hashedPassword = await bcrypt.hash(newPassword, saltRounds);

        // Update password
        await User.findByIdAndUpdate(req.user.id, {
            password: hashedPassword,
            updated_at: new Date()
        });

        logger.info(`Password changed for user: ${user.email}`);
        res.json({ message: 'Password changed successfully' });

    } catch (error) {
        logger.error('Error changing password:', error);
        res.status(500).json({ error: 'Failed to change password' });
    }
});

/**
 * GET /api/users/analytics/activity
 * Get user activity analytics (Admin only)
 */
router.get('/analytics/activity', async (req, res) => {
    try {
        // Only admin can view user analytics
        if (req.user.role !== 'ADMIN') {
            return res.status(403).json({ error: 'Admin access required' });
        }

        const { days = 30 } = req.query;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - parseInt(days));

        // User registration trends
        const registrationTrend = await User.aggregate([
            {
                $match: {
                    created_at: { $gte: startDate }
                }
            },
            {
                $group: {
                    _id: {
                        $dateToString: {
                            format: '%Y-%m-%d',
                            date: '$created_at'
                        }
                    },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        // User distribution by role
        const roleDistribution = await User.aggregate([
            {
                $group: {
                    _id: '$role',
                    count: { $sum: 1 },
                    active: {
                        $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
                    }
                }
            }
        ]);

        // Login activity (would need to track login events)
        const loginActivity = await User.aggregate([
            {
                $match: {
                    last_login: { $gte: startDate }
                }
            },
            {
                $group: {
                    _id: {
                        $dateToString: {
                            format: '%Y-%m-%d',
                            date: '$last_login'
                        }
                    },
                    unique_logins: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        res.json({
            period_days: parseInt(days),
            registration_trend: registrationTrend,
            role_distribution: roleDistribution,
            login_activity: loginActivity
        });

    } catch (error) {
        logger.error('Error fetching user analytics:', error);
        res.status(500).json({ error: 'Failed to fetch user analytics' });
    }
});

module.exports = router;