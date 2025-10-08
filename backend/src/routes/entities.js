const express = require('express');
const router = express.Router();
const Entity = require('../models/Entity');
const Event = require('../models/Event');
const winston = require('winston');

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'logs/entities.log' })
    ]
});

/**
 * GET /api/entities/search
 * Search entities with advanced filtering
 */
router.get('/search', async (req, res) => {
    try {
        // Check if user is authenticated
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }
        const {
            q: searchQuery,
            page = 1,
            limit = 20,
            type,
            status,
            department,
            role,
            sortBy = 'created_at',
            sortOrder = 'desc'
        } = req.query;

        // Build search query
        const query = {};
        
        if (searchQuery) {
            query.$or = [
                { 'profile.name': { $regex: searchQuery, $options: 'i' } },
                { 'profile.email': { $regex: searchQuery, $options: 'i' } },
                { 'identifiers.student_id': { $regex: searchQuery, $options: 'i' } },
                { 'identifiers.employee_id': { $regex: searchQuery, $options: 'i' } },
                { 'identifiers.card_id': { $regex: searchQuery, $options: 'i' } }
            ];
        }
        
        if (type) query['profile.entity_type'] = type;
        if (status) query['metadata.status'] = status;
        if (department) query['profile.department'] = department;
        if (role) query['profile.role'] = role;

        // Execute query with pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const sortOptions = { 
            [sortBy]: sortOrder === 'desc' ? -1 : 1,
            _id: 1 // Secondary sort by _id for consistent pagination
        };

        const [entities, total] = await Promise.all([
            Entity.find(query)
                .sort(sortOptions)
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            Entity.countDocuments(query)
        ]);

        res.json({
            success: true,
            data: entities,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit)),
                hasMore: skip + entities.length < total
            }
        });

    } catch (error) {
        logger.error('Error searching entities:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to search entities' 
        });
    }
});

/**
 * GET /api/entities
 * Get entities with filtering, pagination, and search
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
            search,
            type,
            status,
            department,
            sortBy = 'created_at',
            sortOrder = 'desc'
        } = req.query;

        // Build query
        const query = {};
        
        if (search) {
            query.$or = [
                { 'profile.name': { $regex: search, $options: 'i' } },
                { 'profile.email': { $regex: search, $options: 'i' } },
                { 'identifiers.student_id': { $regex: search, $options: 'i' } },
                { 'identifiers.employee_id': { $regex: search, $options: 'i' } }
            ];
        }

        if (type) query.type = type;
        if (status) query['metadata.status'] = status;
        if (department) query['profile.department'] = department;

        // Execute query with pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const sortOptions = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

        const [entities, total] = await Promise.all([
            Entity.find(query)
                .sort(sortOptions)
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            Entity.countDocuments(query)
        ]);

        res.json({
            entities,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / parseInt(limit))
            }
        });

    } catch (error) {
        logger.error('Error fetching entities:', error);
        res.status(500).json({ error: 'Failed to fetch entities' });
    }
});

/**
 * POST /api/entities/similarity
 * Calculate similarity between two entities using ML service
 */
router.post('/similarity', async (req, res) => {
    try {
        // Check if user is authenticated
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        const { entity1Id, entity2Id, algorithm = 'composite' } = req.body;

        if (!entity1Id || !entity2Id) {
            return res.status(400).json({
                success: false,
                error: 'Both entity1Id and entity2Id are required'
            });
        }

        // Get entities from database
        const [entity1, entity2] = await Promise.all([
            Entity.findById(entity1Id).lean(),
            Entity.findById(entity2Id).lean()
        ]);

        if (!entity1 || !entity2) {
            return res.status(404).json({
                success: false,
                error: 'One or both entities not found'
            });
        }

        // Prepare entity records for ML service
        const record1 = {
            entity_id: entity1._id,
            name: entity1.profile?.name || '',
            email: entity1.profile?.email || '',
            phone: entity1.profile?.phone || '',
            student_id: entity1.identifiers?.student_id || '',
            card_id: entity1.identifiers?.card_id || '',
            device_hash: entity1.identifiers?.device_hash || ''
        };

        const record2 = {
            entity_id: entity2._id,
            name: entity2.profile?.name || '',
            email: entity2.profile?.email || '',
            phone: entity2.profile?.phone || '',
            student_id: entity2.identifiers?.student_id || '',
            card_id: entity2.identifiers?.card_id || '',
            device_hash: entity2.identifiers?.device_hash || ''
        };

        // Call ML service for similarity calculation
        const mlServiceClient = require('../services/mlServiceClient');
        const similarityResult = await mlServiceClient.calculateSimilarityWithRetry(
            record1, 
            record2, 
            algorithm
        );

        if (!similarityResult.success) {
            throw new Error(similarityResult.error || 'ML service error');
        }

        res.json({
            success: true,
            data: {
                entity1: {
                    id: entity1._id,
                    name: entity1.profile?.name
                },
                entity2: {
                    id: entity2._id,
                    name: entity2.profile?.name
                },
                similarity: similarityResult.data,
                algorithm: algorithm,
                calculatedAt: new Date()
            }
        });

    } catch (error) {
        logger.error('Entity similarity error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to calculate entity similarity'
        });
    }
});

/**
 * GET /api/entities/:id
 * Get specific entity by ID
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

        const entity = await Entity.findById(req.params.id).lean();
        
        if (!entity) {
            return res.status(404).json({ 
                success: false,
                error: 'Entity not found' 
            });
        }

        res.json({
            success: true,
            data: entity
        });

    } catch (error) {
        logger.error('Error fetching entity:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to fetch entity' 
        });
    }
});

/**
 * GET /api/entities/:id/timeline
 * Get entity timeline with events
 */
router.get('/:id/timeline', async (req, res) => {
    try {
        // Check if user is authenticated
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required'
            });
        }

        const {
            startDate,
            endDate,
            activityType,
            location,
            limit = 100,
            page = 1
        } = req.query;

        // Build timeline query
        const query = { entity_id: req.params.id };
        
        if (startDate || endDate) {
            query.timestamp = {};
            if (startDate) query.timestamp.$gte = new Date(startDate);
            if (endDate) query.timestamp.$lte = new Date(endDate);
        }

        if (activityType) query.activity_type = activityType;
        if (location) {
            query.$or = [
                { 'location.building': { $regex: location, $options: 'i' } },
                { 'location.room': { $regex: location, $options: 'i' } }
            ];
        }

        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [events, total] = await Promise.all([
            Event.find(query)
                .sort({ timestamp: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            Event.countDocuments(query)
        ]);

        // Group events by day for better visualization
        const groupedEvents = events.reduce((acc, event) => {
            const date = event.timestamp.toISOString().split('T')[0];
            if (!acc[date]) acc[date] = [];
            acc[date].push(event);
            return acc;
        }, {});

        res.json({
            success: true,
            data: {
                timeline: groupedEvents,
                events,
                pagination: {
                    page: parseInt(page),
                    limit: parseInt(limit),
                    total,
                    pages: Math.ceil(total / parseInt(limit))
                }
            }
        });

    } catch (error) {
        logger.error('Error fetching entity timeline:', error);
        res.status(500).json({ 
            success: false,
            error: 'Failed to fetch timeline' 
        });
    }
});

/**
 * GET /api/entities/:id/relationships
 * Get entity relationships from graph database
 */
router.get('/:id/relationships', async (req, res) => {
    try {
        // This would integrate with Neo4j to get relationships
        // For now, return a placeholder
        res.json({
            entity_id: req.params.id,
            relationships: [],
            message: 'Graph relationships not implemented yet'
        });

    } catch (error) {
        logger.error('Error fetching entity relationships:', error);
        res.status(500).json({ error: 'Failed to fetch relationships' });
    }
});

/**
 * POST /api/entities
 * Create new entity
 */
router.post('/', async (req, res) => {
    try {
        const entityData = req.body;
        
        // Validate required fields
        if (!entityData.type || !entityData.identifiers) {
            return res.status(400).json({ error: 'Type and identifiers are required' });
        }

        const entity = new Entity(entityData);
        await entity.save();

        logger.info(`Entity created: ${entity._id}`, { userId: req.user.id });
        res.status(201).json(entity);

    } catch (error) {
        logger.error('Error creating entity:', error);
        res.status(500).json({ error: 'Failed to create entity' });
    }
});

/**
 * PUT /api/entities/:id
 * Update entity
 */
router.put('/:id', async (req, res) => {
    try {
        const entity = await Entity.findByIdAndUpdate(
            req.params.id,
            { ...req.body, updated_at: new Date() },
            { new: true, runValidators: true }
        );

        if (!entity) {
            return res.status(404).json({ error: 'Entity not found' });
        }

        logger.info(`Entity updated: ${entity._id}`, { userId: req.user.id });
        res.json(entity);

    } catch (error) {
        logger.error('Error updating entity:', error);
        res.status(500).json({ error: 'Failed to update entity' });
    }
});

/**
 * DELETE /api/entities/:id
 * Delete entity (soft delete)
 */
router.delete('/:id', async (req, res) => {
    try {
        const entity = await Entity.findByIdAndUpdate(
            req.params.id,
            { 
                'metadata.status': 'deleted',
                updated_at: new Date()
            },
            { new: true }
        );

        if (!entity) {
            return res.status(404).json({ error: 'Entity not found' });
        }

        logger.info(`Entity deleted: ${entity._id}`, { userId: req.user.id });
        res.json({ message: 'Entity deleted successfully' });

    } catch (error) {
        logger.error('Error deleting entity:', error);
        res.status(500).json({ error: 'Failed to delete entity' });
    }
});

/**
 * GET /api/entities/:id/statistics
 * Get entity statistics
 */
router.get('/:id/statistics', async (req, res) => {
    try {
        const entityId = req.params.id;
        const { days = 30 } = req.query;
        
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - parseInt(days));

        const stats = await Event.aggregate([
            {
                $match: {
                    entity_id: entityId,
                    timestamp: { $gte: startDate }
                }
            },
            {
                $group: {
                    _id: null,
                    totalEvents: { $sum: 1 },
                    uniqueLocations: { $addToSet: '$location.building' },
                    activityTypes: { $addToSet: '$activity_type' },
                    avgConfidence: { $avg: '$confidence' },
                    firstEvent: { $min: '$timestamp' },
                    lastEvent: { $max: '$timestamp' }
                }
            }
        ]);

        const dailyActivity = await Event.aggregate([
            {
                $match: {
                    entity_id: entityId,
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
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        res.json({
            entity_id: entityId,
            period_days: parseInt(days),
            statistics: stats[0] || {},
            daily_activity: dailyActivity
        });

    } catch (error) {
        logger.error('Error fetching entity statistics:', error);
        res.status(500).json({ error: 'Failed to fetch statistics' });
    }
});

module.exports = router;