const express = require('express');
const router = express.Router();
const Alert = require('../models/Alert');
const winston = require('winston');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'logs/alerts.log' })
    ]
});

/**
 * GET /api/alerts
 * Get alerts with filtering and pagination
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
        const {
            page = 1,
            limit = 20,
            type,
            severity,
            status,
            entityId,
            startDate,
            endDate,
            sortBy = 'triggered_at',
            sortOrder = 'desc'
        } = req.query;

        // Build query
        const query = {};
        
        if (type) query.type = type;
        if (severity) query.severity = severity;
        if (status) query.status = status;
        if (entityId) query['context.entity_id'] = entityId;

        if (startDate || endDate) {
            query.triggered_at = {};
            if (startDate) query.triggered_at.$gte = new Date(startDate);
            if (endDate) query.triggered_at.$lte = new Date(endDate);
        }

        // Execute query with pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const sortOptions = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

        const [alerts, total] = await Promise.all([
            Alert.find(query)
                .sort(sortOptions)
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            Alert.countDocuments(query)
        ]);

        res.json({
            success: true,
            data: alerts,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit)),
                hasMore: skip + alerts.length < total
            }
        });

    } catch (error) {
        logger.error('Error fetching alerts:', error);
        res.status(500).json({ error: 'Failed to fetch alerts' });
    }
});

/**
 * GET /api/alerts/stats
 * Get alert statistics
 */
router.get('/stats', async (req, res) => {
    try {
        // Check if user is authenticated
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }
        const now = new Date();
        const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

        // Get basic counts
        const [totalAlerts, activeAlerts, last24hAlerts, last7dAlerts] = await Promise.all([
            Alert.countDocuments(),
            Alert.countDocuments({ status: 'active' }),
            Alert.countDocuments({ triggered_at: { $gte: last24h } }),
            Alert.countDocuments({ triggered_at: { $gte: last7d } })
        ]);

        // Get severity distribution
        const severityDistribution = await Alert.aggregate([
            {
                $group: {
                    _id: '$severity',
                    count: { $sum: 1 }
                }
            }
        ]);

        // Get type distribution
        const typeDistribution = await Alert.aggregate([
            {
                $group: {
                    _id: '$type',
                    count: { $sum: 1 }
                }
            },
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]);

        // Get resolution stats
        const resolutionStats = await Alert.aggregate([
            {
                $match: {
                    status: 'resolved',
                    resolved_at: { $exists: true }
                }
            },
            {
                $project: {
                    resolutionTime: {
                        $divide: [
                            { $subtract: ['$resolved_at', '$triggered_at'] },
                            1000 * 60 // Convert to minutes
                        ]
                    }
                }
            },
            {
                $group: {
                    _id: null,
                    avgResolutionTime: { $avg: '$resolutionTime' },
                    totalResolved: { $sum: 1 }
                }
            }
        ]);

        res.json({
            success: true,
            data: {
                totals: {
                    total: totalAlerts,
                    active: activeAlerts,
                    last24h: last24hAlerts,
                    last7d: last7dAlerts
                },
                distribution: {
                    severity: severityDistribution.reduce((acc, item) => {
                        acc[item._id] = item.count;
                        return acc;
                    }, {}),
                    type: typeDistribution
                },
                resolution: resolutionStats[0] || {
                    avgResolutionTime: 0,
                    totalResolved: 0
                }
            }
        });

    } catch (error) {
        logger.error('Error fetching alert stats:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to fetch alert statistics' 
        });
    }
});

/**
 * GET /api/alerts/cards-stats
 * Get specific statistics for alert cards (unaffected by filters)
 */
router.get('/cards-stats', async (req, res) => {
    try {
        // Check if user is authenticated
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        // Get status counts
        const [activeCount, acknowledgedCount, resolvedCount, dismissedCount] = await Promise.all([
            Alert.countDocuments({ status: 'active' }),
            Alert.countDocuments({ status: 'acknowledged' }),
            Alert.countDocuments({ status: 'resolved' }),
            Alert.countDocuments({ status: 'dismissed' })
        ]);

        // Get critical alerts count
        const criticalCount = await Alert.countDocuments({ severity: 'CRITICAL' });

        res.json({
            success: true,
            data: {
                active: activeCount,
                acknowledged: acknowledgedCount,
                resolved: resolvedCount,
                dismissed: dismissedCount,
                critical: criticalCount,
                total: activeCount + acknowledgedCount + resolvedCount + dismissedCount
            }
        });

    } catch (error) {
        logger.error('Error fetching alert cards stats:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to fetch alert cards statistics' 
        });
    }
});

/**
 * GET /api/alerts/dashboard/summary
 * Get alerts dashboard summary
 */
router.get('/dashboard/summary', async (req, res) => {
    try {
        const { days = 7 } = req.query;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - parseInt(days));

        // Active alerts by severity
        const activeBySeverity = await Alert.aggregate([
            {
                $match: {
                    status: { $in: ['active', 'acknowledged'] }
                }
            },
            {
                $group: {
                    _id: '$severity',
                    count: { $sum: 1 }
                }
            }
        ]);

        // Recent alerts trend
        const recentTrend = await Alert.aggregate([
            {
                $match: {
                    triggered_at: { $gte: startDate }
                }
            },
            {
                $group: {
                    _id: {
                        $dateToString: {
                            format: '%Y-%m-%d',
                            date: '$triggered_at'
                        }
                    },
                    count: { $sum: 1 },
                    critical: {
                        $sum: { $cond: [{ $eq: ['$severity', 'CRITICAL'] }, 1, 0] }
                    },
                    high: {
                        $sum: { $cond: [{ $eq: ['$severity', 'HIGH'] }, 1, 0] }
                    }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        // Alert types breakdown
        const typeBreakdown = await Alert.aggregate([
            {
                $match: {
                    triggered_at: { $gte: startDate }
                }
            },
            {
                $group: {
                    _id: '$type',
                    count: { $sum: 1 },
                    active: {
                        $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
                    }
                }
            },
            { $sort: { count: -1 } }
        ]);

        // Response time statistics
        const responseStats = await Alert.aggregate([
            {
                $match: {
                    status: { $in: ['acknowledged', 'resolved'] },
                    acknowledged_at: { $exists: true }
                }
            },
            {
                $project: {
                    responseTime: {
                        $divide: [
                            { $subtract: ['$acknowledged_at', '$triggered_at'] },
                            1000 * 60 // Convert to minutes
                        ]
                    }
                }
            },
            {
                $group: {
                    _id: null,
                    avgResponseTime: { $avg: '$responseTime' },
                    minResponseTime: { $min: '$responseTime' },
                    maxResponseTime: { $max: '$responseTime' }
                }
            }
        ]);

        res.json({
            period_days: parseInt(days),
            active_by_severity: activeBySeverity.reduce((acc, item) => {
                acc[item._id] = item.count;
                return acc;
            }, {}),
            recent_trend: recentTrend,
            type_breakdown: typeBreakdown,
            response_statistics: responseStats[0] || {
                avgResponseTime: 0,
                minResponseTime: 0,
                maxResponseTime: 0
            }
        });

    } catch (error) {
        logger.error('Error fetching alerts dashboard:', error);
        res.status(500).json({ error: 'Failed to fetch dashboard data' });
    }
});

/**
 * POST /api/alerts/:id/acknowledge
 * Acknowledge an alert
 */
router.post('/:id/acknowledge', async (req, res) => {
    try {
        const { notes } = req.body;
        
        const alert = await Alert.findByIdAndUpdate(
            req.params.id,
            {
                status: 'acknowledged',
                acknowledged_at: new Date(),
                acknowledged_by: req.user.id,
                $push: {
                    actions: {
                        type: 'acknowledge',
                        user_id: req.user.id,
                        timestamp: new Date(),
                        notes: notes || ''
                    }
                }
            },
            { new: true }
        );

        if (!alert) {
            return res.status(404).json({ error: 'Alert not found' });
        }

        logger.info(`Alert acknowledged: ${alert._id}`, { 
            userId: req.user.id,
            alertType: alert.type,
            severity: alert.severity
        });

        res.json(alert);

    } catch (error) {
        logger.error('Error acknowledging alert:', error);
        res.status(500).json({ error: 'Failed to acknowledge alert' });
    }
});

/**
 * POST /api/alerts/:id/resolve
 * Resolve an alert
 */
router.post('/:id/resolve', async (req, res) => {
    try {
        const { resolution_notes, resolution_type = 'manual' } = req.body;
        
        const alert = await Alert.findByIdAndUpdate(
            req.params.id,
            {
                status: 'resolved',
                resolved_at: new Date(),
                resolved_by: req.user.id,
                resolution_notes,
                $push: {
                    actions: {
                        type: 'resolve',
                        user_id: req.user.id,
                        timestamp: new Date(),
                        notes: resolution_notes || '',
                        resolution_type
                    }
                }
            },
            { new: true }
        );

        if (!alert) {
            return res.status(404).json({ error: 'Alert not found' });
        }

        logger.info(`Alert resolved: ${alert._id}`, { 
            userId: req.user.id,
            alertType: alert.type,
            severity: alert.severity,
            resolutionType: resolution_type
        });

        res.json(alert);

    } catch (error) {
        logger.error('Error resolving alert:', error);
        res.status(500).json({ error: 'Failed to resolve alert' });
    }
});

/**
 * POST /api/alerts/:id/dismiss
 * Dismiss an alert (mark as false positive)
 */
router.post('/:id/dismiss', async (req, res) => {
    try {
        const { reason } = req.body;
        
        const alert = await Alert.findByIdAndUpdate(
            req.params.id,
            {
                status: 'dismissed',
                dismissed_at: new Date(),
                dismissed_by: req.user.id,
                $push: {
                    actions: {
                        type: 'dismiss',
                        user_id: req.user.id,
                        timestamp: new Date(),
                        notes: reason || 'Dismissed as false positive'
                    }
                }
            },
            { new: true }
        );

        if (!alert) {
            return res.status(404).json({ error: 'Alert not found' });
        }

        logger.info(`Alert dismissed: ${alert._id}`, { 
            userId: req.user.id,
            alertType: alert.type,
            severity: alert.severity,
            reason
        });

        res.json(alert);

    } catch (error) {
        logger.error('Error dismissing alert:', error);
        res.status(500).json({ error: 'Failed to dismiss alert' });
    }
});

/**
 * POST /api/alerts
 * Create manual alert
 */
router.post('/', async (req, res) => {
    try {
        const alertData = {
            ...req.body,
            _id: `MANUAL_${Date.now()}`,
            created_by: req.user.id,
            rule: {
                name: 'manual_alert',
                condition: 'manually_created',
                threshold: null
            }
        };

        const alert = new Alert(alertData);
        await alert.save();

        logger.info(`Manual alert created: ${alert._id}`, { 
            userId: req.user.id,
            alertType: alert.type,
            severity: alert.severity
        });

        res.status(201).json(alert);

    } catch (error) {
        logger.error('Error creating manual alert:', error);
        res.status(500).json({ error: 'Failed to create alert' });
    }
});

/**
 * GET /api/alerts/analytics/patterns
 * Get alert pattern analysis
 */
router.get('/analytics/patterns', async (req, res) => {
    try {
        const { days = 30 } = req.query;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - parseInt(days));

        // Time-based patterns
        const hourlyPattern = await Alert.aggregate([
            {
                $match: {
                    triggered_at: { $gte: startDate }
                }
            },
            {
                $group: {
                    _id: { $hour: '$triggered_at' },
                    count: { $sum: 1 },
                    avgSeverity: {
                        $avg: {
                            $switch: {
                                branches: [
                                    { case: { $eq: ['$severity', 'LOW'] }, then: 1 },
                                    { case: { $eq: ['$severity', 'MEDIUM'] }, then: 2 },
                                    { case: { $eq: ['$severity', 'HIGH'] }, then: 3 },
                                    { case: { $eq: ['$severity', 'CRITICAL'] }, then: 4 }
                                ],
                                default: 1
                            }
                        }
                    }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        // Entity-based patterns
        const entityPattern = await Alert.aggregate([
            {
                $match: {
                    triggered_at: { $gte: startDate },
                    'context.entity_id': { $exists: true }
                }
            },
            {
                $group: {
                    _id: '$context.entity_id',
                    alertCount: { $sum: 1 },
                    alertTypes: { $addToSet: '$type' },
                    severities: { $addToSet: '$severity' },
                    lastAlert: { $max: '$triggered_at' }
                }
            },
            { $sort: { alertCount: -1 } },
            { $limit: 10 }
        ]);

        // Location-based patterns
        const locationPattern = await Alert.aggregate([
            {
                $match: {
                    triggered_at: { $gte: startDate },
                    'context.location': { $exists: true }
                }
            },
            {
                $group: {
                    _id: '$context.location.building',
                    alertCount: { $sum: 1 },
                    alertTypes: { $addToSet: '$type' },
                    avgSeverity: {
                        $avg: {
                            $switch: {
                                branches: [
                                    { case: { $eq: ['$severity', 'LOW'] }, then: 1 },
                                    { case: { $eq: ['$severity', 'MEDIUM'] }, then: 2 },
                                    { case: { $eq: ['$severity', 'HIGH'] }, then: 3 },
                                    { case: { $eq: ['$severity', 'CRITICAL'] }, then: 4 }
                                ],
                                default: 1
                            }
                        }
                    }
                }
            },
            { $sort: { alertCount: -1 } }
        ]);

        res.json({
            period_days: parseInt(days),
            patterns: {
                hourly: hourlyPattern,
                by_entity: entityPattern,
                by_location: locationPattern
            }
        });

    } catch (error) {
        logger.error('Error fetching alert patterns:', error);
        res.status(500).json({ error: 'Failed to fetch alert patterns' });
    }
});

/**
 * PUT /api/alerts/:id
 * Update alert
 */
router.put('/:id', async (req, res) => {
    try {
        const alert = await Alert.findByIdAndUpdate(
            req.params.id,
            { 
                ...req.body, 
                updated_at: new Date(),
                updated_by: req.user.id
            },
            { new: true, runValidators: true }
        );

        if (!alert) {
            return res.status(404).json({ error: 'Alert not found' });
        }

        logger.info(`Alert updated: ${alert._id}`, { userId: req.user.id });
        res.json(alert);

    } catch (error) {
        logger.error('Error updating alert:', error);
        res.status(500).json({ error: 'Failed to update alert' });
    }
});

/**
 * GET /api/alerts/trends
 * Get alert trends and analytics data
 */
router.get('/trends', async (req, res) => {
    try {
        // Check if user is authenticated
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        const { timeRange = '7d' } = req.query;
        const now = new Date();
        let startTime;

        // Calculate time range
        switch (timeRange) {
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
                startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        }

        // Get daily alert counts
        const dailyTrends = await Alert.aggregate([
            {
                $match: {
                    triggered_at: { $gte: startTime }
                }
            },
            {
                $group: {
                    _id: {
                        $dateToString: {
                            format: '%Y-%m-%d',
                            date: '$triggered_at'
                        }
                    },
                    count: { $sum: 1 },
                    severityBreakdown: {
                        $push: '$severity'
                    }
                }
            },
            {
                $project: {
                    date: '$_id',
                    count: 1,
                    critical: {
                        $size: {
                            $filter: {
                                input: '$severityBreakdown',
                                cond: { $eq: ['$$this', 'CRITICAL'] }
                            }
                        }
                    },
                    high: {
                        $size: {
                            $filter: {
                                input: '$severityBreakdown',
                                cond: { $eq: ['$$this', 'HIGH'] }
                            }
                        }
                    },
                    medium: {
                        $size: {
                            $filter: {
                                input: '$severityBreakdown',
                                cond: { $eq: ['$$this', 'MEDIUM'] }
                            }
                        }
                    },
                    low: {
                        $size: {
                            $filter: {
                                input: '$severityBreakdown',
                                cond: { $eq: ['$$this', 'LOW'] }
                            }
                        }
                    }
                }
            },
            { $sort: { date: 1 } }
        ]);

        // Get hourly trends for last 24h
        const hourlyTrends = await Alert.aggregate([
            {
                $match: {
                    triggered_at: { $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) }
                }
            },
            {
                $group: {
                    _id: { $hour: '$triggered_at' },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        // Get severity trends
        const severityTrends = await Alert.aggregate([
            {
                $match: {
                    triggered_at: { $gte: startTime }
                }
            },
            {
                $group: {
                    _id: '$severity',
                    count: { $sum: 1 },
                    avgResolutionTime: {
                        $avg: {
                            $cond: [
                                { $and: [{ $ne: ['$resolved_at', null] }, { $ne: ['$triggered_at', null] }] },
                                { $divide: [{ $subtract: ['$resolved_at', '$triggered_at'] }, 1000 * 60] },
                                null
                            ]
                        }
                    }
                }
            }
        ]);

        res.json({
            success: true,
            data: {
                timeRange,
                daily: dailyTrends,
                hourly: hourlyTrends,
                severity: severityTrends,
                generatedAt: new Date()
            }
        });

    } catch (error) {
        logger.error('Error fetching alert trends:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch alert trends'
        });
    }
});

/**
 * GET /api/alerts/history
 * Get alert history with detailed information
 */
router.get('/history', async (req, res) => {
    try {
        // Check if user is authenticated
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        const {
            page = 1,
            limit = 50,
            timeRange = '30d',
            severity,
            status,
            type
        } = req.query;

        const now = new Date();
        let startTime;

        // Calculate time range
        switch (timeRange) {
            case '24h':
                startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                break;
            case '7d':
                startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                break;
            case '30d':
                startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                break;
            case '90d':
                startTime = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
                break;
            default:
                startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        }

        // Build query
        const query = {
            triggered_at: { $gte: startTime }
        };

        if (severity) query.severity = severity;
        if (status) query.status = status;
        if (type) query.type = type;

        // Execute query with pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [alerts, total] = await Promise.all([
            Alert.find(query)
                .sort({ triggered_at: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            Alert.countDocuments(query)
        ]);

        // Get summary statistics for the filtered results
        const summary = await Alert.aggregate([
            { $match: query },
            {
                $group: {
                    _id: null,
                    totalAlerts: { $sum: 1 },
                    criticalCount: {
                        $sum: { $cond: [{ $eq: ['$severity', 'CRITICAL'] }, 1, 0] }
                    },
                    highCount: {
                        $sum: { $cond: [{ $eq: ['$severity', 'HIGH'] }, 1, 0] }
                    },
                    mediumCount: {
                        $sum: { $cond: [{ $eq: ['$severity', 'MEDIUM'] }, 1, 0] }
                    },
                    lowCount: {
                        $sum: { $cond: [{ $eq: ['$severity', 'LOW'] }, 1, 0] }
                    },
                    activeCount: {
                        $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
                    },
                    resolvedCount: {
                        $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] }
                    },
                    avgResolutionTime: {
                        $avg: {
                            $cond: [
                                { $and: [{ $ne: ['$resolved_at', null] }, { $ne: ['$triggered_at', null] }] },
                                { $divide: [{ $subtract: ['$resolved_at', '$triggered_at'] }, 1000 * 60] },
                                null
                            ]
                        }
                    }
                }
            }
        ]);

        res.json({
            success: true,
            data: {
                alerts,
                summary: summary[0] || {
                    totalAlerts: 0,
                    criticalCount: 0,
                    highCount: 0,
                    mediumCount: 0,
                    lowCount: 0,
                    activeCount: 0,
                    resolvedCount: 0,
                    avgResolutionTime: 0
                },
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / parseInt(limit)),
                    hasMore: skip + alerts.length < total
                },
                timeRange,
                generatedAt: new Date()
            }
        });

    } catch (error) {
        logger.error('Error fetching alert history:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch alert history'
        });
    }
});

/**
 * GET /api/alerts/advanced
 * Advanced alert detection from CSV data
 * Detects: 
 * 1. Users inactive for 24+ hours - HIGH PRIORITY
 * 2. Users with 2+ simultaneous activities - MEDIUM PRIORITY
 * 3. Admin block access - LOW PRIORITY
 */
router.get('/advanced', async (req, res) => {
    try {
        // Check if user is authenticated
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        const { priority, page = 1, limit = 20 } = req.query;
        
        // Read CSV files
        const dataPath = path.join(__dirname, '../data');
        const advancedAlerts = [];

        // Helper function to read CSV with timeout and error handling
        const readCSV = (filePath, timeout = 5000) => {
            return new Promise((resolve, reject) => {
                const results = [];
                const timeoutId = setTimeout(() => {
                    reject(new Error(`CSV read timeout: ${filePath}`));
                }, timeout);

                if (!fs.existsSync(filePath)) {
                    clearTimeout(timeoutId);
                    resolve(results);
                    return;
                }

                const stream = fs.createReadStream(filePath)
                    .pipe(csv())
                    .on('data', (data) => {
                        // Limit data processing to prevent memory issues
                        if (results.length < 10000) {
                            results.push(data);
                        }
                    })
                    .on('end', () => {
                        clearTimeout(timeoutId);
                        resolve(results);
                    })
                    .on('error', (error) => {
                        clearTimeout(timeoutId);
                        logger.error(`Error reading CSV ${filePath}:`, error);
                        resolve(results); // Return partial results instead of failing
                    });
            });
        };

        // Read profiles and all CSV files with error handling
        const [profiles, cardSwipes, wifiLogs, libCheckouts, labBookings, cctvFrames] = await Promise.all([
            readCSV(path.join(dataPath, 'student or staff profiles.csv')).catch(() => []),
            readCSV(path.join(dataPath, 'campus card_swipes.csv')).catch(() => []),
            readCSV(path.join(dataPath, 'wifi_associations_logs.csv')).catch(() => []),
            readCSV(path.join(dataPath, 'library_checkouts.csv')).catch(() => []),
            readCSV(path.join(dataPath, 'lab_bookings.csv')).catch(() => []),
            readCSV(path.join(dataPath, 'cctv_frames.csv')).catch(() => [])
        ]);

        // Build card_id -> entity_id map from profiles CSV
        const cardToEntity = new Map();
        try {
            profiles.forEach(p => {
                const card = (p.card_id || p.cardId || p.card || p.card_number || '').toString().trim();
                const eid = (p.entity_id || p.entityId || p.id || '').toString().trim();
                if (card && eid) {
                    cardToEntity.set(card, eid);
                }
            });
        } catch (e) {
            logger.warn('Failed to build card->entity map from profiles CSV', e);
        }

        // Get current time for analysis
        // Use September 23, 2025 23:59:59 as reference date to match dataset end date
        const now = new Date('2025-09-23T23:59:59');

        // Create entity activity map with optimized processing
        const entityActivities = new Map();
        
        // Helper function to process activity
        const processActivity = (entityId, timestamp, location, type, action) => {
            if (!entityId || !timestamp) return;
            
            const ts = new Date(timestamp);
            if (isNaN(ts.getTime())) return; // Skip invalid dates
            
            if (!entityActivities.has(entityId)) {
                entityActivities.set(entityId, {
                    lastSeen: ts,
                    activities: [],
                    locations: new Set()
                });
            }
            
            const entity = entityActivities.get(entityId);
            entity.activities.push({
                type,
                timestamp: ts,
                location: location || 'Unknown',
                action: action || 'unknown'
            });
            entity.locations.add(location || 'Unknown');
            if (ts > entity.lastSeen) {
                entity.lastSeen = ts;
            }
        };
        
        // Process card swipes
        // Some CSVs use card_id or cardNumber instead of entity_id — include those as fallback
        let mappedSwipesCount = 0;
        cardSwipes.forEach(swipe => {
            let rawId = swipe.entity_id || swipe.user_id || swipe.student_id || swipe.card_id || swipe.cardId || swipe.card_number || swipe.card;
            if (rawId) rawId = rawId.toString().trim();

            // If the raw id looks like a card id (e.g., starts with 'C') and we have a mapping, use the canonical entity id
            let entityId = rawId;
            if (rawId) {
                const isCardLike = /^C\d+/i.test(rawId) || rawId.toUpperCase().startsWith('C');
                if (isCardLike && cardToEntity.has(rawId)) {
                    entityId = cardToEntity.get(rawId);
                    mappedSwipesCount++;
                }
            }

            const timestamp = swipe.timestamp || swipe.swipe_time;
            const location = swipe.location || swipe.building || swipe.gate_id || swipe.location_id || swipe.locationId;
            processActivity(entityId, timestamp, location, 'card_swipe', swipe.action);
        });

        if (mappedSwipesCount > 0) {
            logger.info(`Mapped ${mappedSwipesCount} card swipe(s) to canonical entity IDs using profiles.csv`);
        }

        // Process WiFi associations
        wifiLogs.forEach(log => {
            const entityId = log.entity_id || log.user_id || log.mac_address;
            const timestamp = log.timestamp || log.connection_time;
            const location = log.location || log.ap_location || log.building;
            processActivity(entityId, timestamp, location, 'wifi', log.event_type);
        });

        // Process library checkouts
        libCheckouts.forEach(checkout => {
            const entityId = checkout.entity_id || checkout.user_id || checkout.student_id;
            const timestamp = checkout.timestamp || checkout.checkout_time;
            processActivity(entityId, timestamp, 'Library', 'library', checkout.action);
        });

        // Process lab bookings
        labBookings.forEach(booking => {
            const entityId = booking.entity_id || booking.user_id || booking.student_id;
            const timestamp = booking.timestamp || booking.booking_time || booking.start_time;
            const location = booking.location || booking.lab_name || booking.lab_id;
            processActivity(entityId, timestamp, location, 'lab_booking', booking.status);
        });

        // Process CCTV frames
        cctvFrames.forEach(frame => {
            const entityId = frame.entity_id || frame.person_id;
            const timestamp = frame.timestamp || frame.frame_time;
            const location = frame.location || frame.camera_location || frame.building;
            processActivity(entityId, timestamp, location, 'cctv', 'detected');
        });

        // ALERT TYPE 1: Users inactive for 10-20 hours - HIGH PRIORITY
        // Only show entities inactive between 10-20 hours (not less than 10, not more than 20)
        entityActivities.forEach((entity, entityId) => {
            const hoursSinceLastSeen = Math.floor((now - entity.lastSeen) / (60 * 60 * 1000));
            
            // Only flag if inactive for exactly 10-20 hours
            if (hoursSinceLastSeen >= 10 && hoursSinceLastSeen <= 20) {
                // Get the most recent activity to find last location
                const sortedActivities = entity.activities.sort((a, b) => b.timestamp - a.timestamp);
                const lastLocation = sortedActivities[0]?.location || 'Unknown';
                
                advancedAlerts.push({
                    id: `INACTIVE_${entityId}_${Date.now()}`,
                    type: 'INACTIVITY',
                    entityId,
                    priority: 'HIGH',
                    title: `User Inactive for ${hoursSinceLastSeen} hours`,
                    description: `Entity ${entityId} has not been detected in any system for ${hoursSinceLastSeen} hours`,
                    lastSeen: entity.lastSeen,
                    details: {
                        lastLocation: lastLocation,
                        activityCount: entity.activities.length,
                        hoursSinceLastSeen
                    },
                    timestamp: now,
                    status: 'active'
                });
            }
        });

        // ALERT TYPE 2: Simultaneous activities (2+ activities at same time) - MEDIUM PRIORITY
        entityActivities.forEach((entity, entityId) => {
            if (entity.activities.length < 2) return; // Skip if less than 2 activities
            
            // Sort activities by timestamp
            const sortedActivities = entity.activities.sort((a, b) => a.timestamp - b.timestamp);
            
            // Optimized check - only check first occurrence
            let found = false;
            for (let i = 0; i < sortedActivities.length - 1 && !found; i++) {
                const activity1 = sortedActivities[i];
                
                // Only check next few activities to optimize performance
                const checkLimit = Math.min(i + 10, sortedActivities.length);
                for (let j = i + 1; j < checkLimit; j++) {
                    const activity2 = sortedActivities[j];
                    const timeDiff = Math.abs(activity2.timestamp - activity1.timestamp) / (60 * 1000); // minutes
                    
                    if (timeDiff > 5) break; // Stop checking if time difference too large
                    
                    if (activity1.location !== activity2.location) {
                        advancedAlerts.push({
                            id: `SIMULT_${entityId}_${activity1.timestamp.getTime()}`,
                            type: 'SIMULTANEOUS_ACTIVITY',
                            entityId,
                            priority: 'MEDIUM',
                            title: 'Simultaneous Activities Detected',
                            description: `Entity ${entityId} recorded at different locations within ${Math.round(timeDiff)} minutes`,
                            details: {
                                activity1: {
                                    type: activity1.type,
                                    location: activity1.location,
                                    timestamp: activity1.timestamp,
                                    action: activity1.action
                                },
                                activity2: {
                                    type: activity2.type,
                                    location: activity2.location,
                                    timestamp: activity2.timestamp,
                                    action: activity2.action
                                },
                                timeDifferenceMinutes: Math.round(timeDiff)
                            },
                            timestamp: activity1.timestamp,
                            status: 'active'
                        });
                        found = true; // Only report once per entity
                        break;
                    }
                }
            }
        });

    // ALERT TYPE 3: Admin block access - LOW PRIORITY (limit to most recent per entity)
    // Include CCTV / location-based admin areas (ADMIN_LOBBY, CAF_01, GYM, HOSTEL_GATE)
    // Only flag admin access during college hours (09:00 - 18:00) and before reference date
    const adminLocations = ['admin', 'admin_lobby', 'caf_01', 'caf', 'gym', 'hostel_gate', 'hostel'];
        const adminAccessMap = new Map(); // Track one per entity
        let adminMatches = 0; // debug counter for matched admin activities
        
        entityActivities.forEach((entity, entityId) => {
            // Only check admin access within dataset timeframe
            for (let i = entity.activities.length - 1; i >= 0; i--) {
                const activity = entity.activities[i];
                
                // Check if activity is within valid time range (before reference date)
                if (activity.timestamp > now) {
                    continue; // Skip activities after reference date
                }
                
                const hour = activity.timestamp.getHours();
                const locLower = (activity.location || '').toLowerCase();
                const isAtAdmin = locLower && adminLocations.some(loc => locLower.includes(loc));

                // Check if during college hours (09:00 - 18:00)
                const isDuringCollegeHours = hour >= 9 && hour < 18;
                
                if (isAtAdmin && isDuringCollegeHours && !adminAccessMap.has(entityId)) {
                    adminAccessMap.set(entityId, true);
                    adminMatches++;
                    advancedAlerts.push({
                        id: `ADMIN_${entityId}_${activity.timestamp.getTime()}`,
                        type: 'ADMIN_ACCESS',
                        entityId,
                        priority: 'LOW',
                        title: 'Doing otherthings in college time',
                        description: `Entity ${entityId} accessed ${activity.location} at ${hour}:00`,
                        details: {
                            location: activity.location,
                            hour: hour,
                            activityType: activity.type,
                            action: activity.action,
                            timestamp: activity.timestamp.toISOString()
                        },
                        timestamp: activity.timestamp,
                        status: 'active'
                    });
                    break; // Only one per entity
                }
            }
        });

        // Log how many admin matches were found (helps debugging why LOW may be zero)
        logger.info(`Admin access candidate count: ${adminMatches}`);

        // Remove duplicates based on similar alerts
        const uniqueAlerts = [];
        const alertKeys = new Set();
        
        advancedAlerts.forEach(alert => {
            const key = `${alert.type}_${alert.entityId}_${Math.floor(alert.timestamp.getTime() / (60 * 60 * 1000))}`; // Hour-based grouping
            if (!alertKeys.has(key)) {
                alertKeys.add(key);
                uniqueAlerts.push(alert);
            }
        });

        // Filter by priority if specified
        let filteredAlerts = uniqueAlerts;
        if (priority) {
            filteredAlerts = uniqueAlerts.filter(alert => 
                alert.priority.toLowerCase() === priority.toLowerCase()
            );
        }

        // Sort by priority and timestamp
        const priorityOrder = { 'HIGH': 0, 'MEDIUM': 1, 'LOW': 2 };
        filteredAlerts.sort((a, b) => {
            const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
            if (priorityDiff !== 0) return priorityDiff;
            return new Date(b.timestamp) - new Date(a.timestamp);
        });

        // Limit total alerts to prevent performance issues (max 1000)
        const maxAlerts = 1000;
        if (filteredAlerts.length > maxAlerts) {
            filteredAlerts = filteredAlerts.slice(0, maxAlerts);
        }

        // Pagination
        const startIndex = (parseInt(page) - 1) * parseInt(limit);
        const endIndex = startIndex + parseInt(limit);
        const paginatedAlerts = filteredAlerts.slice(startIndex, endIndex);

        // Get summary statistics
        const summary = {
            total: filteredAlerts.length,
            byPriority: {
                high: filteredAlerts.filter(a => a.priority === 'HIGH').length,
                medium: filteredAlerts.filter(a => a.priority === 'MEDIUM').length,
                low: filteredAlerts.filter(a => a.priority === 'LOW').length
            },
            byType: {
                inactivity: filteredAlerts.filter(a => a.type === 'INACTIVITY').length,
                simultaneous: filteredAlerts.filter(a => a.type === 'SIMULTANEOUS_ACTIVITY').length,
                adminAccess: filteredAlerts.filter(a => a.type === 'ADMIN_ACCESS').length
            }
        };

        res.json({
            success: true,
            data: {
                alerts: paginatedAlerts,
                summary,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total: filteredAlerts.length,
                    pages: Math.ceil(filteredAlerts.length / parseInt(limit)),
                    hasMore: endIndex < filteredAlerts.length
                }
            }
        });

    } catch (error) {
        logger.error('Error generating advanced alerts:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate advanced alerts',
            message: error.message
        });
    }
});

/**
 * GET /api/alerts/:id
 * Get specific alert by ID
 */
router.get('/:id', async (req, res) => {
    try {
        const alert = await Alert.findById(req.params.id);
        
        if (!alert) {
            return res.status(404).json({ error: 'Alert not found' });
        }

        res.json(alert);

    } catch (error) {
        logger.error('Error fetching alert:', error);
        res.status(500).json({ error: 'Failed to fetch alert' });
    }
});

/**
 * GET /api/alerts/trends
 * Get alert trends and analytics data
 */
router.get('/trends', async (req, res) => {
    try {
        // Check if user is authenticated
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        const { timeRange = '7d' } = req.query;
        const now = new Date();
        let startTime;

        // Calculate time range
        switch (timeRange) {
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
                startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        }

        // Get daily alert counts
        const dailyTrends = await Alert.aggregate([
            {
                $match: {
                    triggered_at: { $gte: startTime }
                }
            },
            {
                $group: {
                    _id: {
                        $dateToString: {
                            format: '%Y-%m-%d',
                            date: '$triggered_at'
                        }
                    },
                    count: { $sum: 1 },
                    severityBreakdown: {
                        $push: '$severity'
                    }
                }
            },
            {
                $project: {
                    date: '$_id',
                    count: 1,
                    critical: {
                        $size: {
                            $filter: {
                                input: '$severityBreakdown',
                                cond: { $eq: ['$$this', 'CRITICAL'] }
                            }
                        }
                    },
                    high: {
                        $size: {
                            $filter: {
                                input: '$severityBreakdown',
                                cond: { $eq: ['$$this', 'HIGH'] }
                            }
                        }
                    },
                    medium: {
                        $size: {
                            $filter: {
                                input: '$severityBreakdown',
                                cond: { $eq: ['$$this', 'MEDIUM'] }
                            }
                        }
                    },
                    low: {
                        $size: {
                            $filter: {
                                input: '$severityBreakdown',
                                cond: { $eq: ['$$this', 'LOW'] }
                            }
                        }
                    }
                }
            },
            { $sort: { date: 1 } }
        ]);

        // Get hourly trends for last 24h
        const hourlyTrends = await Alert.aggregate([
            {
                $match: {
                    triggered_at: { $gte: new Date(now.getTime() - 24 * 60 * 60 * 1000) }
                }
            },
            {
                $group: {
                    _id: { $hour: '$triggered_at' },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        // Get severity trends
        const severityTrends = await Alert.aggregate([
            {
                $match: {
                    triggered_at: { $gte: startTime }
                }
            },
            {
                $group: {
                    _id: '$severity',
                    count: { $sum: 1 },
                    avgResolutionTime: {
                        $avg: {
                            $cond: [
                                { $and: [{ $ne: ['$resolved_at', null] }, { $ne: ['$triggered_at', null] }] },
                                { $divide: [{ $subtract: ['$resolved_at', '$triggered_at'] }, 1000 * 60] },
                                null
                            ]
                        }
                    }
                }
            }
        ]);

        res.json({
            success: true,
            data: {
                timeRange,
                daily: dailyTrends,
                hourly: hourlyTrends,
                severity: severityTrends,
                generatedAt: new Date()
            }
        });

    } catch (error) {
        logger.error('Error fetching alert trends:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch alert trends'
        });
    }
});

/**
 * GET /api/alerts/history
 * Get alert history with detailed information
 */
router.get('/history', async (req, res) => {
    try {
        // Check if user is authenticated
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        const {
            page = 1,
            limit = 50,
            timeRange = '30d',
            severity,
            status,
            type
        } = req.query;

        const now = new Date();
        let startTime;

        // Calculate time range
        switch (timeRange) {
            case '24h':
                startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                break;
            case '7d':
                startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                break;
            case '30d':
                startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                break;
            case '90d':
                startTime = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
                break;
            default:
                startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        }

        // Build query
        const query = {
            triggered_at: { $gte: startTime }
        };

        if (severity) query.severity = severity;
        if (status) query.status = status;
        if (type) query.type = type;

        // Execute query with pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [alerts, total] = await Promise.all([
            Alert.find(query)
                .sort({ triggered_at: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            Alert.countDocuments(query)
        ]);

        // Get summary statistics for the filtered results
        const summary = await Alert.aggregate([
            { $match: query },
            {
                $group: {
                    _id: null,
                    totalAlerts: { $sum: 1 },
                    criticalCount: {
                        $sum: { $cond: [{ $eq: ['$severity', 'CRITICAL'] }, 1, 0] }
                    },
                    highCount: {
                        $sum: { $cond: [{ $eq: ['$severity', 'HIGH'] }, 1, 0] }
                    },
                    mediumCount: {
                        $sum: { $cond: [{ $eq: ['$severity', 'MEDIUM'] }, 1, 0] }
                    },
                    lowCount: {
                        $sum: { $cond: [{ $eq: ['$severity', 'LOW'] }, 1, 0] }
                    },
                    activeCount: {
                        $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] }
                    },
                    resolvedCount: {
                        $sum: { $cond: [{ $eq: ['$status', 'resolved'] }, 1, 0] }
                    },
                    avgResolutionTime: {
                        $avg: {
                            $cond: [
                                { $and: [{ $ne: ['$resolved_at', null] }, { $ne: ['$triggered_at', null] }] },
                                { $divide: [{ $subtract: ['$resolved_at', '$triggered_at'] }, 1000 * 60] },
                                null
                            ]
                        }
                    }
                }
            }
        ]);

        res.json({
            success: true,
            data: {
                alerts,
                summary: summary[0] || {
                    totalAlerts: 0,
                    criticalCount: 0,
                    highCount: 0,
                    mediumCount: 0,
                    lowCount: 0,
                    activeCount: 0,
                    resolvedCount: 0,
                    avgResolutionTime: 0
                },
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / parseInt(limit)),
                    hasMore: skip + alerts.length < total
                },
                timeRange,
                generatedAt: new Date()
            }
        });

    } catch (error) {
        logger.error('Error fetching alert history:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch alert history'
        });
    }
});

module.exports = router;