const express = require('express');
const router = express.Router();
const Event = require('../models/Event');
const winston = require('winston');

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'logs/events.log' })
    ]
});

/**
 * GET /api/events
 * Get events with filtering and pagination
 */
router.get('/', async (req, res) => {
    try {
        const {
            page = 1,
            limit = 50,
            entityId,
            activityType,
            location,
            startDate,
            endDate,
            minConfidence,
            sortBy = 'timestamp',
            sortOrder = 'desc'
        } = req.query;

        // Build query
        const query = {};
        
        if (entityId) query.entity_id = entityId;
        if (activityType) query.activity_type = activityType;
        if (minConfidence) query.fused_confidence = { $gte: parseFloat(minConfidence) };
        
        if (location) {
            query.$or = [
                { 'location.building': { $regex: location, $options: 'i' } },
                { 'location.room': { $regex: location, $options: 'i' } }
            ];
        }

        if (startDate || endDate) {
            query.timestamp = {};
            if (startDate) query.timestamp.$gte = new Date(startDate);
            if (endDate) query.timestamp.$lte = new Date(endDate);
        }

        // Execute query with pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const sortOptions = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

        const [events, total] = await Promise.all([
            Event.find(query)
                .sort(sortOptions)
                .skip(skip)
                .limit(parseInt(limit))
                .populate('entity_id', 'profile.name type')
                .lean(),
            Event.countDocuments(query)
        ]);

        res.json({
            events,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });

    } catch (error) {
        logger.error('Error fetching events:', error);
        res.status(500).json({ error: 'Failed to fetch events' });
    }
});

/**
 * GET /api/events/:id
 * Get specific event by ID
 */
router.get('/:id', async (req, res) => {
    try {
        const event = await Event.findById(req.params.id)
            .populate('entity_id', 'profile.name type identifiers');
        
        if (!event) {
            return res.status(404).json({ error: 'Event not found' });
        }

        res.json(event);

    } catch (error) {
        logger.error('Error fetching event:', error);
        res.status(500).json({ error: 'Failed to fetch event' });
    }
});

/**
 * GET /api/events/analytics/summary
 * Get events analytics summary
 */
router.get('/analytics/summary', async (req, res) => {
    try {
        const { days = 7 } = req.query;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - parseInt(days));

        const summary = await Event.aggregate([
            {
                $match: {
                    timestamp: { $gte: startDate }
                }
            },
            {
                $group: {
                    _id: null,
                    totalEvents: { $sum: 1 },
                    uniqueEntities: { $addToSet: '$entity_id' },
                    activityTypes: { $addToSet: '$activity_type' },
                    avgConfidence: { $avg: '$confidence' },
                    locations: { $addToSet: '$location.building' }
                }
            }
        ]);

        const activityBreakdown = await Event.aggregate([
            {
                $match: {
                    timestamp: { $gte: startDate }
                }
            },
            {
                $group: {
                    _id: '$activity_type',
                    count: { $sum: 1 },
                    avgConfidence: { $avg: '$confidence' }
                }
            },
            { $sort: { count: -1 } }
        ]);

        const dailyTrends = await Event.aggregate([
            {
                $match: {
                    timestamp: { $gte: startDate }
                }
            },
            {
                $group: {
                    _id: {
                        $dateToString: {
                            format: '%Y-%m-%d',
                            date: '$timestamp'
                        }
                    },
                    count: { $sum: 1 },
                    uniqueEntities: { $addToSet: '$entity_id' }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        res.json({
            period_days: parseInt(days),
            summary: {
                ...summary[0],
                uniqueEntities: summary[0]?.uniqueEntities?.length || 0,
                uniqueLocations: summary[0]?.locations?.length || 0
            },
            activity_breakdown: activityBreakdown,
            daily_trends: dailyTrends.map(day => ({
                date: day._id,
                events: day.count,
                unique_entities: day.uniqueEntities.length
            }))
        });

    } catch (error) {
        logger.error('Error fetching events analytics:', error);
        res.status(500).json({ error: 'Failed to fetch analytics' });
    }
});

/**
 * GET /api/events/analytics/heatmap
 * Get location-based activity heatmap data
 */
router.get('/analytics/heatmap', async (req, res) => {
    try {
        const { days = 7, activityType } = req.query;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - parseInt(days));

        const query = { timestamp: { $gte: startDate } };
        if (activityType) query.activity_type = activityType;

        const heatmapData = await Event.aggregate([
            { $match: query },
            {
                $group: {
                    _id: {
                        building: '$location.building',
                        room: '$location.room',
                        coordinates: '$location.coordinates'
                    },
                    count: { $sum: 1 },
                    uniqueEntities: { $addToSet: '$entity_id' },
                    avgConfidence: { $avg: '$confidence' }
                }
            },
            {
                $project: {
                    location: '$_id',
                    activity_count: '$count',
                    unique_entities: { $size: '$uniqueEntities' },
                    avg_confidence: '$avgConfidence'
                }
            },
            { $sort: { activity_count: -1 } }
        ]);

        res.json({
            period_days: parseInt(days),
            activity_type: activityType || 'all',
            heatmap_data: heatmapData
        });

    } catch (error) {
        logger.error('Error fetching heatmap data:', error);
        res.status(500).json({ error: 'Failed to fetch heatmap data' });
    }
});

/**
 * POST /api/events
 * Create new event
 */
router.post('/', async (req, res) => {
    try {
        const eventData = req.body;
        
        // Validate required fields
        if (!eventData.entity_id || !eventData.activity_type || !eventData.timestamp) {
            return res.status(400).json({ 
                error: 'entity_id, activity_type, and timestamp are required' 
            });
        }

        const event = new Event(eventData);
        await event.save();

        logger.info(`Event created: ${event._id}`, { userId: req.user.id });
        res.status(201).json(event);

    } catch (error) {
        logger.error('Error creating event:', error);
        res.status(500).json({ error: 'Failed to create event' });
    }
});

/**
 * PUT /api/events/:id
 * Update event
 */
router.put('/:id', async (req, res) => {
    try {
        const event = await Event.findByIdAndUpdate(
            req.params.id,
            { ...req.body, updated_at: new Date() },
            { new: true, runValidators: true }
        );

        if (!event) {
            return res.status(404).json({ error: 'Event not found' });
        }

        logger.info(`Event updated: ${event._id}`, { userId: req.user.id });
        res.json(event);

    } catch (error) {
        logger.error('Error updating event:', error);
        res.status(500).json({ error: 'Failed to update event' });
    }
});

/**
 * DELETE /api/events/:id
 * Delete event
 */
router.delete('/:id', async (req, res) => {
    try {
        const event = await Event.findByIdAndDelete(req.params.id);

        if (!event) {
            return res.status(404).json({ error: 'Event not found' });
        }

        logger.info(`Event deleted: ${event._id}`, { userId: req.user.id });
        res.json({ message: 'Event deleted successfully' });

    } catch (error) {
        logger.error('Error deleting event:', error);
        res.status(500).json({ error: 'Failed to delete event' });
    }
});

/**
 * GET /api/events/search/similar
 * Find similar events based on criteria
 */
router.get('/search/similar', async (req, res) => {
    try {
        const {
            entityId,
            activityType,
            location,
            timeWindow = 60, // minutes
            limit = 10
        } = req.query;

        if (!entityId) {
            return res.status(400).json({ error: 'entityId is required' });
        }

        // Get reference event
        const referenceEvent = await Event.findOne({ entity_id: entityId })
            .sort({ timestamp: -1 });

        if (!referenceEvent) {
            return res.json({ similar_events: [] });
        }

        // Build similarity query
        const query = {
            entity_id: entityId,
            _id: { $ne: referenceEvent._id }
        };

        if (activityType) query.activity_type = activityType;
        
        if (location) {
            query['location.building'] = referenceEvent.location.building;
        }

        // Time window filter
        const timeStart = new Date(referenceEvent.timestamp);
        timeStart.setMinutes(timeStart.getMinutes() - parseInt(timeWindow));
        const timeEnd = new Date(referenceEvent.timestamp);
        timeEnd.setMinutes(timeEnd.getMinutes() + parseInt(timeWindow));

        query.timestamp = { $gte: timeStart, $lte: timeEnd };

        const similarEvents = await Event.find(query)
            .sort({ timestamp: -1 })
            .limit(parseInt(limit))
            .lean();

        res.json({
            reference_event: referenceEvent,
            similar_events: similarEvents,
            criteria: {
                time_window_minutes: parseInt(timeWindow),
                activity_type: activityType,
                location_match: !!location
            }
        });

    } catch (error) {
        logger.error('Error finding similar events:', error);
        res.status(500).json({ error: 'Failed to find similar events' });
    }
});

module.exports = router;