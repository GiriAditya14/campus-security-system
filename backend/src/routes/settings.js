const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const winston = require('winston');

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'logs/settings-api.log' })
    ]
});

// Apply authentication to all settings routes
router.use(authenticate);

// Allow all authenticated users to access their settings
// No additional role authorization needed for personal settings

// Mock settings storage (in a real app, this would be in a database)
let userSettings = {
    notifications: {
        email: true,
        push: true,
        alerts: true,
        reports: false
    },
    privacy: {
        dataRetention: '90',
        anonymization: true,
        auditLogging: true
    },
    system: {
        autoRefresh: true,
        refreshInterval: '30',
        maxResults: '100',
        timezone: 'UTC'
    },
    alerts: {
        threshold: '0.8',
        cooldown: '300',
        escalation: true
    }
};

/**
 * GET /api/settings/test
 * Test endpoint to verify authentication
 */
router.get('/test', (req, res) => {
    res.json({
        success: true,
        message: 'Settings API is working',
        user: req.user ? {
            id: req.user.id,
            username: req.user.username,
            role: req.user.role
        } : null,
        timestamp: new Date()
    });
});

/**
 * GET /api/settings
 * Get user settings
 * Requires authentication
 */
router.get('/', (req, res) => {
    try {
        logger.info('Settings retrieved', { 
            userId: req.user?.id || req.user?._id,
            timestamp: new Date()
        });

        res.json({
            success: true,
            data: userSettings
        });
    } catch (error) {
        logger.error('Error getting settings:', {
            error: error.message,
            stack: error.stack,
            user: req.user?.id || 'unknown'
        });
        res.status(500).json({
            success: false,
            error: 'Failed to get settings',
            message: error.message
        });
    }
});

/**
 * PUT /api/settings
 * Update user settings
 * Requires authentication
 */
router.put('/', (req, res) => {
    try {
        const newSettings = req.body;
        
        // Validate settings structure
        if (!newSettings || typeof newSettings !== 'object') {
            return res.status(400).json({
                success: false,
                error: 'Invalid settings data'
            });
        }

        // Update settings (in a real app, save to database)
        userSettings = { ...userSettings, ...newSettings };
        
        logger.info('Settings updated', { 
            userId: req.user?.id || req.user?._id,
            settings: newSettings,
            timestamp: new Date()
        });

        res.json({
            success: true,
            message: 'Settings updated successfully',
            data: userSettings
        });
    } catch (error) {
        logger.error('Error updating settings:', {
            error: error.message,
            stack: error.stack,
            user: req.user?.id || 'unknown'
        });
        res.status(500).json({
            success: false,
            error: 'Failed to update settings',
            message: error.message
        });
    }
});

/**
 * PATCH /api/settings/:category
 * Update specific settings category
 * Requires authentication
 */
router.patch('/:category', (req, res) => {
    try {
        const { category } = req.params;
        const updates = req.body;
        
        if (!userSettings[category]) {
            return res.status(404).json({
                success: false,
                error: `Settings category '${category}' not found`
            });
        }

        // Update specific category
        userSettings[category] = { ...userSettings[category], ...updates };
        
        logger.info('Settings category updated', { 
            userId: req.user?.id || req.user?._id,
            category: category,
            updates: updates,
            timestamp: new Date()
        });

        res.json({
            success: true,
            message: `${category} settings updated successfully`,
            data: userSettings[category]
        });
    } catch (error) {
        logger.error('Error updating settings category:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update settings category'
        });
    }
});

/**
 * POST /api/settings/reset
 * Reset settings to defaults
 * Requires authentication
 */
router.post('/reset', (req, res) => {
    try {
        // Reset to default settings
        userSettings = {
            notifications: {
                email: true,
                push: true,
                alerts: true,
                reports: false
            },
            privacy: {
                dataRetention: '90',
                anonymization: true,
                auditLogging: true
            },
            system: {
                autoRefresh: true,
                refreshInterval: '30',
                maxResults: '100',
                timezone: 'UTC'
            },
            alerts: {
                threshold: '0.8',
                cooldown: '300',
                escalation: true
            }
        };
        
        logger.info('Settings reset to defaults', { 
            userId: req.user?.id || req.user?._id,
            timestamp: new Date()
        });

        res.json({
            success: true,
            message: 'Settings reset to defaults',
            data: userSettings
        });
    } catch (error) {
        logger.error('Error resetting settings:', {
            error: error.message,
            stack: error.stack,
            user: req.user?.id || 'unknown'
        });
        res.status(500).json({
            success: false,
            error: 'Failed to reset settings',
            message: error.message
        });
    }
});

module.exports = router;