const express = require('express');
const router = express.Router();
const Entity = require('../models/Entity');
const Event = require('../models/Event');
const Alert = require('../models/Alert');
const winston = require('winston');

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'logs/analytics.log' })
    ]
});

// Simple in-memory cache for dashboard data
const dashboardCache = new Map();
const CACHE_DURATION = 30 * 1000; // 30 seconds

/**
 * GET /api/analytics/dashboard
 * Get main dashboard analytics
 */
router.get('/dashboard', async (req, res) => {
    try {
        const timeRange = req.query.timeRange || '24h';
        const cacheKey = `dashboard_${timeRange}`;
        
        // Check cache first
        const cached = dashboardCache.get(cacheKey);
        if (cached && (Date.now() - cached.timestamp) < CACHE_DURATION) {
            return res.json({
                success: true,
                data: {
                    ...cached.data,
                    cached: true,
                    cacheAge: Math.round((Date.now() - cached.timestamp) / 1000)
                }
            });
        }
        
        const now = new Date();
        let startTime;

        // Calculate time range
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

        // Get basic counts
        const [totalEntities, activeEntities, totalEvents, activeAlerts] = await Promise.all([
            Entity.countDocuments(),
            Entity.countDocuments({ 'metadata.status': 'active' }),
            Event.countDocuments({ timestamp: { $gte: startTime } }),
            Alert.countDocuments({ status: 'active' })
        ]);

        // Get activity distribution
        const activityDistribution = await Event.aggregate([
            { $match: { timestamp: { $gte: startTime } } },
            { $group: { _id: '$activity_type', count: { $sum: 1 } } },
            { $sort: { count: -1 } }
        ]);

        // Get location activity
        const locationActivity = await Event.aggregate([
            { $match: { timestamp: { $gte: startTime } } },
            {
                $group: {
                    _id: {
                        building: '$location.building',
                        room: '$location.room'
                    },
                    count: { $sum: 1 },
                    unique_entities: { $addToSet: '$entity_id' }
                }
            },
            {
                $project: {
                    location: '$_id',
                    count: 1,
                    unique_entities: { $size: '$unique_entities' }
                }
            },
            { $sort: { count: -1 } },
            { $limit: 10 }
        ]);

        // Get hourly activity trend
        const hourlyActivity = await Event.aggregate([
            { $match: { timestamp: { $gte: startTime } } },
            {
                $group: {
                    _id: { $hour: '$timestamp' },
                    count: { $sum: 1 }
                }
            },
            { $sort: { '_id': 1 } }
        ]);

        // Get alert distribution
        const alertDistribution = await Alert.aggregate([
            { $match: { triggered_at: { $gte: startTime } } },
            { $group: { _id: '$severity', count: { $sum: 1 } } }
        ]);

        // Get ML service performance metrics
        const mlServiceClient = require('../services/mlServiceClient');
        let mlMetrics = {
            averageConfidence: 0.85,
            systemUptime: 99.9,
            mlServiceHealthy: false
        };

        try {
            const mlHealth = await mlServiceClient.healthCheck();
            const mlPerformance = await mlServiceClient.getModelPerformance();
            
            if (mlHealth.healthy && mlPerformance.success) {
                const performance = mlPerformance.data;
                mlMetrics = {
                    averageConfidence: (
                        (performance.location_predictor?.accuracy || 85) +
                        (performance.activity_predictor?.accuracy || 82) +
                        (performance.entity_resolver?.f1_score * 100 || 89)
                    ) / 300, // Convert to 0-1 scale
                    systemUptime: 99.9,
                    mlServiceHealthy: true,
                    modelPerformance: performance
                };
            }
        } catch (error) {
            logger.warn('ML service metrics unavailable:', error.message);
        }

        const dashboardData = {
            summary: {
                totalEntities,
                activeEntities,
                totalEvents,
                activeAlerts,
                ...mlMetrics
            },
            activityDistribution,
            locationActivity,
            hourlyActivity,
            alertDistribution,
            timeRange,
            generatedAt: new Date()
        };

        // Cache the result
        dashboardCache.set(cacheKey, {
            data: dashboardData,
            timestamp: Date.now()
        });

        res.json({
            success: true,
            data: dashboardData
        });

    } catch (error) {
        logger.error('Dashboard analytics error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate dashboard analytics'
        });
    }
});

/**
 * GET /api/analytics/entity/:id/timeline
 * Get entity activity timeline
 */
router.get('/entity/:id/timeline', async (req, res) => {
    try {
        const entityId = req.params.id;
        const limit = parseInt(req.query.limit) || 100;
        const offset = parseInt(req.query.offset) || 0;
        const startDate = req.query.startDate ? new Date(req.query.startDate) : null;
        const endDate = req.query.endDate ? new Date(req.query.endDate) : null;

        // Build query
        const query = { entity_id: entityId };
        if (startDate || endDate) {
            query.timestamp = {};
            if (startDate) query.timestamp.$gte = startDate;
            if (endDate) query.timestamp.$lte = endDate;
        }

        // Get events
        const events = await Event.find(query)
            .sort({ timestamp: -1 })
            .skip(offset)
            .limit(limit)
            .lean();

        // Get total count
        const totalCount = await Event.countDocuments(query);

        // Get entity info
        const entity = await Entity.findById(entityId);

        res.json({
            success: true,
            data: {
                entity: entity ? {
                    id: entity._id,
                    name: entity.profile?.name,
                    type: entity.type,
                    status: entity.metadata?.status
                } : null,
                events,
                pagination: {
                    total: totalCount,
                    limit,
                    offset,
                    hasMore: offset + limit < totalCount
                }
            }
        });

    } catch (error) {
        logger.error('Entity timeline error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get entity timeline'
        });
    }
});

/**
 * GET /api/analytics/predictions/:entityId
 * Get predictions for specific entity
 */
router.get('/predictions/:entityId', async (req, res) => {
    try {
        const entityId = req.params.entityId;
        const mlServiceClient = require('../services/mlServiceClient');

        // Get entity data for ML predictions
        const Entity = require('../models/Entity');
        const Event = require('../models/Event');
        
        const entity = await Entity.findById(entityId).lean();
        if (!entity) {
            return res.status(404).json({
                success: false,
                error: 'Entity not found'
            });
        }

        // Get recent events for historical data
        const recentEvents = await Event.find({ entity_id: entityId })
            .sort({ timestamp: -1 })
            .limit(50)
            .lean();

        const historicalData = recentEvents.map(event => ({
            location: event.location?.building || 'Unknown',
            timestamp: event.timestamp,
            activity: event.activity_type
        }));

        // Call ML service for location prediction
        const locationPrediction = await mlServiceClient.predictLocationWithRetry(
            entityId,
            new Date().toISOString(),
            historicalData
        );

        // Call ML service for activity prediction
        const activityPrediction = await mlServiceClient.predictActivityWithRetry(
            entityId,
            new Date().toISOString(),
            locationPrediction.data?.predicted_location || 'UNKNOWN',
            []
        );

        // Format predictions for frontend
        const predictions = {
            location: {
                building: locationPrediction.data?.predicted_location || 'Unknown',
                confidence: locationPrediction.data?.confidence || 0,
                alternatives: locationPrediction.data?.top_3_predictions || [],
                last_seen: entity.metadata?.last_seen
            },
            activity: {
                type: activityPrediction.data?.predicted_activity || 'unknown',
                confidence: activityPrediction.data?.confidence || 0,
                estimated_duration: Math.floor(Math.random() * 120) + 30, // 30-150 minutes
                sequence: []
            },
            risk: {
                level: 'low',
                score: Math.random() * 3, // 0-3 scale
                factors: []
            }
        };

        res.json({
            success: true,
            data: {
                entityId,
                predictions,
                generatedAt: new Date(),
                mlService: {
                    locationPrediction: locationPrediction.success,
                    activityPrediction: activityPrediction.success
                }
            }
        });

    } catch (error) {
        logger.error('Predictions error:', error);
        
        // Fallback to basic predictions if ML service fails
        const fallbackPredictions = {
            location: {
                building: 'ACADEMIC_COMPLEX',
                confidence: 0.5,
                alternatives: [],
                last_seen: new Date()
            },
            activity: {
                type: 'study_session',
                confidence: 0.5,
                estimated_duration: 60
            },
            risk: {
                level: 'low',
                score: 1.0,
                factors: ['ML service unavailable']
            }
        };

        res.json({
            success: true,
            data: {
                entityId: req.params.entityId,
                predictions: fallbackPredictions,
                generatedAt: new Date(),
                mlService: {
                    error: error.message,
                    fallback: true
                }
            }
        });
    }
});

/**
 * GET /api/analytics/locations/heatmap
 * Get location heatmap data
 */
router.get('/locations/heatmap', async (req, res) => {
    try {
        const timeRange = req.query.timeRange || '1h';
        const entityTypes = req.query.entityTypes || [];
        const now = new Date();
        let startTime;

        // Calculate time range
        switch (timeRange) {
            case '1h':
                startTime = new Date(now.getTime() - 60 * 60 * 1000);
                break;
            case '6h':
                startTime = new Date(now.getTime() - 6 * 60 * 60 * 1000);
                break;
            case '24h':
                startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                break;
            case '7d':
                startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                break;
            default:
                startTime = new Date(now.getTime() - 60 * 60 * 1000);
        }

        // Build query
        const query = { timestamp: { $gte: startTime } };

        // Get heatmap data
        const heatmapData = await Event.aggregate([
            { $match: query },
            {
                $group: {
                    _id: {
                        building: '$location.building',
                        lat: '$location.coordinates.lat',
                        lng: '$location.coordinates.lng'
                    },
                    intensity: { $sum: 1 },
                    unique_entities: { $addToSet: '$entity_id' }
                }
            },
            {
                $project: {
                    building: '$_id.building',
                    lat: '$_id.lat',
                    lng: '$_id.lng',
                    intensity: 1,
                    entity_count: { $size: '$unique_entities' }
                }
            },
            { $sort: { intensity: -1 } }
        ]);

        // Generate mock heatmap data if no real data
        const mockHeatmapData = [
            { building: 'Main Academic Block', lat: 26.5123, lng: 80.2329, intensity: 8 },
            { building: 'Library', lat: 26.5121, lng: 80.2327, intensity: 6 },
            { building: 'Computer Center', lat: 26.5125, lng: 80.2331, intensity: 5 },
            { building: 'Cafeteria', lat: 26.5120, lng: 80.2330, intensity: 4 },
            { building: 'Hostel A', lat: 26.5115, lng: 80.2340, intensity: 3 }
        ];

        res.json({
            success: true,
            data: heatmapData.length > 0 ? heatmapData : mockHeatmapData
        });

    } catch (error) {
        logger.error('Heatmap error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get heatmap data'
        });
    }
});

/**
 * GET /api/analytics
 * Get general analytics data
 */
router.get('/', async (req, res) => {
    try {
        const timeRange = req.query.timeRange || '7d';

        // Generate mock analytics data for demonstration
        const analyticsData = {
            overview: {
                totalEntities: 1247,
                activeEntities: 892,
                totalEvents: 45623,
                alertsGenerated: 23,
                averageConfidence: 0.847,
                systemUptime: 99.7
            },
            trends: {
                entityActivity: [
                    { date: '2024-01-01', count: 1200 },
                    { date: '2024-01-02', count: 1180 },
                    { date: '2024-01-03', count: 1250 },
                    { date: '2024-01-04', count: 1300 },
                    { date: '2024-01-05', count: 1280 },
                    { date: '2024-01-06', count: 1320 },
                    { date: '2024-01-07', count: 1247 }
                ],
                alertTrends: [
                    { date: '2024-01-01', count: 15 },
                    { date: '2024-01-02', count: 12 },
                    { date: '2024-01-03', count: 18 },
                    { date: '2024-01-04', count: 25 },
                    { date: '2024-01-05', count: 20 },
                    { date: '2024-01-06', count: 28 },
                    { date: '2024-01-07', count: 23 }
                ]
            },
            locations: {
                mostActive: [
                    { name: 'Main Academic Block', count: 2847, change: 12.5 },
                    { name: 'Library', count: 2156, change: -3.2 },
                    { name: 'Computer Center', count: 1923, change: 8.7 },
                    { name: 'Cafeteria', count: 1654, change: 15.3 },
                    { name: 'Hostel A', count: 1432, change: -1.8 }
                ],
                heatmapData: [
                    { building: 'Main Academic Block', intensity: 0.9 },
                    { building: 'Library', intensity: 0.7 },
                    { building: 'Computer Center', intensity: 0.8 },
                    { building: 'Cafeteria', intensity: 0.6 },
                    { building: 'Hostel A', intensity: 0.5 }
                ]
            },
            predictions: {
                accuracy: {
                    location: 94.3,
                    activity: 91.8,
                    risk: 87.2
                },
                confidence: {
                    high: 67.8,
                    medium: 24.5,
                    low: 7.7
                }
            },
            performance: {
                responseTime: 45,
                throughput: 1247,
                errorRate: 0.3,
                cacheHitRate: 89.2
            }
        };

        res.json({
            success: true,
            data: analyticsData
        });

    } catch (error) {
        logger.error('Analytics error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get analytics data'
        });
    }
});

module.exports = router;