const express = require('express');
const router = express.Router();
const winston = require('winston');

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'logs/audit-api.log' })
    ]
});

// Authentication middleware (will be applied by server.js)
const requireAuth = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            error: 'Authentication required'
        });
    }
    next();
};

// Authorization middleware for audit access
const requireAuditAccess = (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            error: 'Authentication required'
        });
    }
    
    // Only ADMIN and SECURITY_OFFICER can access audit logs
    if (!['ADMIN', 'SECURITY_OFFICER'].includes(req.user.role)) {
        return res.status(403).json({
            success: false,
            error: 'Insufficient permissions to access audit logs'
        });
    }
    
    next();
};

// Mock audit data for demonstration
const mockAuditLogs = [
    {
        _id: '1',
        timestamp: new Date(Date.now() - 3600000),
        user: { email: 'admin@campus.edu', name: 'System Administrator' },
        action: 'LOGIN',
        resource: '/api/auth/login',
        ip_address: '192.168.1.100',
        user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        status: 'SUCCESS',
        details: { method: 'POST', response_time: 245 }
    },
    {
        _id: '2',
        timestamp: new Date(Date.now() - 7200000),
        user: { email: 'security@campus.edu', name: 'Security Officer' },
        action: 'VIEW_ENTITY',
        resource: '/api/entities/12345',
        ip_address: '192.168.1.101',
        user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        status: 'SUCCESS',
        details: { method: 'GET', response_time: 156, entity_id: '12345' }
    },
    {
        _id: '3',
        timestamp: new Date(Date.now() - 10800000),
        user: { email: 'operator@campus.edu', name: 'System Operator' },
        action: 'CREATE_ALERT',
        resource: '/api/alerts',
        ip_address: '192.168.1.102',
        user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        status: 'SUCCESS',
        details: { method: 'POST', response_time: 892, alert_type: 'MANUAL' }
    },
    {
        _id: '4',
        timestamp: new Date(Date.now() - 14400000),
        user: { email: 'unknown@campus.edu', name: 'Unknown User' },
        action: 'LOGIN',
        resource: '/api/auth/login',
        ip_address: '10.0.0.50',
        user_agent: 'curl/7.68.0',
        status: 'FAILED',
        details: { method: 'POST', response_time: 1200, error: 'Invalid credentials' }
    },
    {
        _id: '5',
        timestamp: new Date(Date.now() - 18000000),
        user: { email: 'admin@campus.edu', name: 'System Administrator' },
        action: 'DELETE_USER',
        resource: '/api/users/67890',
        ip_address: '192.168.1.100',
        user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        status: 'SUCCESS',
        details: { method: 'DELETE', response_time: 345, user_id: '67890' }
    }
];

/**
 * GET /api/audit/logs
 * Get audit logs with filtering and pagination
 * Requires ADMIN or SECURITY_OFFICER role
 */
router.get('/logs', requireAuditAccess, async (req, res) => {
    try {
        const {
            page = 1,
            limit = 50,
            dateRange = '7d',
            action,
            user,
            resource,
            status,
            search
        } = req.query;

        // Apply filters to mock data
        let filteredLogs = [...mockAuditLogs];
        
        if (action) {
            filteredLogs = filteredLogs.filter(log => log.action.toLowerCase().includes(action.toLowerCase()));
        }
        
        if (user) {
            filteredLogs = filteredLogs.filter(log => 
                log.user.email.toLowerCase().includes(user.toLowerCase()) ||
                log.user.name.toLowerCase().includes(user.toLowerCase())
            );
        }
        
        if (resource) {
            filteredLogs = filteredLogs.filter(log => log.resource.toLowerCase().includes(resource.toLowerCase()));
        }
        
        if (status) {
            filteredLogs = filteredLogs.filter(log => log.status.toLowerCase() === status.toLowerCase());
        }
        
        if (search) {
            filteredLogs = filteredLogs.filter(log => 
                log.user.email.toLowerCase().includes(search.toLowerCase()) ||
                log.action.toLowerCase().includes(search.toLowerCase()) ||
                log.resource.toLowerCase().includes(search.toLowerCase())
            );
        }

        // Apply pagination
        const startIndex = (parseInt(page) - 1) * parseInt(limit);
        const endIndex = startIndex + parseInt(limit);
        const paginatedLogs = filteredLogs.slice(startIndex, endIndex);
        const total = filteredLogs.length;

        res.json({
            success: true,
            data: paginatedLogs,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });

    } catch (error) {
        logger.error('Error retrieving audit logs:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve audit logs'
        });
    }
});

/**
 * GET /api/audit/statistics
 * Get audit statistics and metrics
 * Requires ADMIN role
 */
router.get('/statistics', requireAuditAccess, async (req, res) => {
    try {
        const timeRange = req.query.timeRange || '24h';
        
        // Mock statistics for demonstration
        const statistics = {
            totalLogs: mockAuditLogs.length,
            successfulActions: mockAuditLogs.filter(log => log.status === 'SUCCESS').length,
            failedActions: mockAuditLogs.filter(log => log.status === 'FAILED').length,
            uniqueUsers: [...new Set(mockAuditLogs.map(log => log.user.email))].length,
            topActions: [
                { action: 'LOGIN', count: 2 },
                { action: 'VIEW_ENTITY', count: 1 },
                { action: 'CREATE_ALERT', count: 1 },
                { action: 'DELETE_USER', count: 1 }
            ],
            timeRange,
            generatedAt: new Date()
        };

        res.json({
            success: true,
            data: statistics
        });

    } catch (error) {
        logger.error('Error retrieving audit statistics:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve audit statistics'
        });
    }
});

/**
 * GET /api/audit/security-events
 * Get security-related audit events
 * Requires ADMIN or SECURITY_OFFICER role
 */
router.get('/security-events', requireAuditAccess, async (req, res) => {
    try {
        const timeRange = req.query.timeRange || '24h';
        const limit = parseInt(req.query.limit) || 100;
        const offset = parseInt(req.query.offset) || 0;

        const now = new Date();
        let startTime;

        switch (timeRange) {
            case '1h':
                startTime = new Date(now.getTime() - 60 * 60 * 1000);
                break;
            case '24h':
                startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                break;
            case '7d':
                startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                break;
            case '30d':
                startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                break;
            default:
                startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        }

        const filters = {
            startDate: startTime,
            endDate: now
        };

        // Get security-related events
        const securityFilters = [
            { success: false, action: 'login' }, // Failed logins
            { response_status: { $in: [401, 403] } }, // Unauthorized/Forbidden
            { action: 'delete' }, // Deletion operations
            { resource: 'users' }, // User management operations
            { endpoint: { $regex: '/admin' } } // Admin endpoint access
        ];

        const options = {
            limit,
            offset,
            sortBy: 'timestamp',
            sortOrder: -1
        };

        // Filter mock data for security events
        const securityEvents = mockAuditLogs.filter(log => 
            log.status === 'FAILED' || 
            log.action === 'DELETE_USER' ||
            log.resource.includes('/admin')
        );

        res.json({
            success: true,
            data: {
                events: securityEvents,
                pagination: {
                    total: securityEvents.length,
                    limit,
                    offset,
                    hasMore: false // Simplified
                },
                timeRange,
                generatedAt: new Date()
            }
        });

    } catch (error) {
        logger.error('Error retrieving security events:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve security events'
        });
    }
});

/**
 * GET /api/audit/user/:userId
 * Get audit logs for specific user
 * Requires ADMIN or SECURITY_OFFICER role, or own user data
 */
router.get('/user/:userId', requireAuth, async (req, res) => {
    try {
        const targetUserId = req.params.userId;
        const requestingUser = req.user;

        // Check permissions: ADMIN/SECURITY_OFFICER can view any user, users can view their own
        if (!['ADMIN', 'SECURITY_OFFICER'].includes(requestingUser.role) && 
            requestingUser.id !== targetUserId) {
            return res.status(403).json({
                success: false,
                error: 'Insufficient permissions to view user audit logs'
            });
        }

        const filters = {
            userId: targetUserId,
            startDate: req.query.startDate,
            endDate: req.query.endDate
        };

        const options = {
            limit: parseInt(req.query.limit) || 100,
            offset: parseInt(req.query.offset) || 0,
            sortBy: 'timestamp',
            sortOrder: -1
        };

        // Filter mock data for specific user
        const userLogs = mockAuditLogs.filter(log => 
            log.user.email.includes(targetUserId) || log.user.name.includes(targetUserId)
        );

        res.json({
            success: true,
            data: {
                logs: userLogs,
                pagination: {
                    total: userLogs.length,
                    limit: parseInt(req.query.limit) || 100,
                    offset: parseInt(req.query.offset) || 0
                }
            }
        });

    } catch (error) {
        logger.error('Error retrieving user audit logs:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to retrieve user audit logs'
        });
    }
});

/**
 * GET /api/audit/export
 * Export audit logs as CSV
 * Requires ADMIN role
 */
router.get('/export', requireAuditAccess, async (req, res) => {
    try {
        const filters = {
            startDate: req.query.startDate,
            endDate: req.query.endDate,
            userId: req.query.userId,
            action: req.query.action,
            resource: req.query.resource
        };

        const options = {
            limit: parseInt(req.query.limit) || 10000, // Large limit for export
            offset: 0,
            sortBy: 'timestamp',
            sortOrder: -1
        };

        // Convert mock data to CSV format
        const csvHeaders = [
            'Timestamp',
            'User Email',
            'User Name',
            'Action',
            'Resource',
            'IP Address',
            'User Agent',
            'Status'
        ];

        const csvRows = mockAuditLogs.map(log => [
            log.timestamp.toISOString(),
            log.user.email,
            log.user.name,
            log.action,
            log.resource,
            log.ip_address,
            log.user_agent,
            log.status
        ]);

        const csvContent = [
            csvHeaders.join(','),
            ...csvRows.map(row => row.map(field => 
                typeof field === 'string' && field.includes(',') 
                    ? `"${field.replace(/"/g, '""')}"` 
                    : field
            ).join(','))
        ].join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="audit-logs-${new Date().toISOString().split('T')[0]}.csv"`);
        res.send(csvContent);

    } catch (error) {
        logger.error('Error exporting audit logs:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to export audit logs'
        });
    }
});

module.exports = router;