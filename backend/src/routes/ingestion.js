const express = require('express');
const { body, param, query } = require('express-validator');
const rateLimit = require('express-rate-limit');
const ingestionController = require('../controllers/ingestionController');
const auth = require('../middleware/auth');
const CacheMiddleware = require('../middleware/cache');

const router = express.Router();

// Rate limiting for ingestion endpoints
const ingestionRateLimit = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 10, // 10 requests per minute per IP
    message: {
        success: false,
        error: 'Too many ingestion requests',
        message: 'Please wait before submitting more data'
    },
    standardHeaders: true,
    legacyHeaders: false
});

// Validation schemas for different data sources
const cardSwipeValidation = [
    body('records.*.card_id').notEmpty().withMessage('Card ID is required'),
    body('records.*.timestamp').isISO8601().withMessage('Valid timestamp is required'),
    body('records.*.building').notEmpty().withMessage('Building is required'),
    body('records.*.access_point').notEmpty().withMessage('Access point is required'),
    body('records.*.room').optional().isString(),
    body('records.*.floor').optional().isString(),
    body('records.*.zone').optional().isIn(['academic', 'residential', 'recreational', 'administrative', 'restricted']),
    body('records.*.access_level').optional().isIn(['public', 'restricted', 'private', 'emergency_only']),
    body('records.*.duration').optional().isInt({ min: 0 })
];

const wifiLogValidation = [
    body('records.*.device_hash').notEmpty().withMessage('Device hash is required'),
    body('records.*.timestamp').isISO8601().withMessage('Valid timestamp is required'),
    body('records.*.access_point').notEmpty().withMessage('Access point is required'),
    body('records.*.signal_strength').isInt({ min: -100, max: 0 }).withMessage('Signal strength must be between -100 and 0'),
    body('records.*.building').optional().isString(),
    body('records.*.room').optional().isString(),
    body('records.*.floor').optional().isString(),
    body('records.*.session_duration').optional().isInt({ min: 0 })
];

const cctvFrameValidation = [
    body('records.*.camera_id').notEmpty().withMessage('Camera ID is required'),
    body('records.*.timestamp').isISO8601().withMessage('Valid timestamp is required'),
    body('records.*.face_embeddings').isArray({ min: 1 }).withMessage('At least one face embedding is required'),
    body('records.*.face_embeddings.*.embedding').isArray({ min: 128, max: 128 }).withMessage('Face embedding must be 128-dimensional'),
    body('records.*.face_embeddings.*.confidence').optional().isFloat({ min: 0, max: 1 }),
    body('records.*.face_embeddings.*.bounding_box').optional().isObject(),
    body('records.*.face_embeddings.*.quality_score').optional().isFloat({ min: 0, max: 1 }),
    body('records.*.building').optional().isString(),
    body('records.*.room').optional().isString(),
    body('records.*.coordinates').optional().isObject()
];

const helpdeskValidation = [
    body('records.*.ticket_id').notEmpty().withMessage('Ticket ID is required'),
    body('records.*.timestamp').isISO8601().withMessage('Valid timestamp is required'),
    body('records.*.requester_email').isEmail().withMessage('Valid requester email is required'),
    body('records.*.category').notEmpty().withMessage('Category is required'),
    body('records.*.requester_name').optional().isString(),
    body('records.*.priority').optional().isIn(['low', 'normal', 'high', 'urgent']),
    body('records.*.location_building').optional().isString(),
    body('records.*.location_room').optional().isString(),
    body('records.*.location_floor').optional().isString()
];

const rsvpValidation = [
    body('records.*.event_id').notEmpty().withMessage('Event ID is required'),
    body('records.*.timestamp').isISO8601().withMessage('Valid timestamp is required'),
    body('records.*.attendee_email').isEmail().withMessage('Valid attendee email is required'),
    body('records.*.event_name').notEmpty().withMessage('Event name is required'),
    body('records.*.attendee_name').optional().isString(),
    body('records.*.rsvp_status').optional().isIn(['attending', 'not_attending', 'maybe']),
    body('records.*.event_category').optional().isString(),
    body('records.*.event_location_building').optional().isString(),
    body('records.*.event_location_room').optional().isString(),
    body('records.*.event_coordinates').optional().isObject()
];

const assetValidation = [
    body('records.*.asset_id').notEmpty().withMessage('Asset ID is required'),
    body('records.*.timestamp').isISO8601().withMessage('Valid timestamp is required'),
    body('records.*.assigned_to').notEmpty().withMessage('Assigned to is required'),
    body('records.*.action').isIn(['checkout', 'checkin', 'transfer', 'maintenance']).withMessage('Valid action is required'),
    body('records.*.asset_category').optional().isString(),
    body('records.*.location_building').optional().isString(),
    body('records.*.location_room').optional().isString(),
    body('records.*.location_floor').optional().isString()
];

// Common validation for all ingestion endpoints
const commonValidation = [
    param('source_type').isIn(['card_swipe', 'wifi_log', 'cctv_frame', 'helpdesk', 'rsvp', 'asset'])
        .withMessage('Invalid source type'),
    body('batch_id').notEmpty().withMessage('Batch ID is required'),
    body('records').isArray({ min: 1, max: 1000 }).withMessage('Records must be an array with 1-1000 items')
];

// Get validation middleware based on source type
function getValidationMiddleware(req, res, next) {
    const sourceType = req.params.source_type;
    
    let validationRules = [];
    
    switch (sourceType) {
        case 'card_swipe':
            validationRules = cardSwipeValidation;
            break;
        case 'wifi_log':
            validationRules = wifiLogValidation;
            break;
        case 'cctv_frame':
            validationRules = cctvFrameValidation;
            break;
        case 'helpdesk':
            validationRules = helpdeskValidation;
            break;
        case 'rsvp':
            validationRules = rsvpValidation;
            break;
        case 'asset':
            validationRules = assetValidation;
            break;
        default:
            return res.status(400).json({
                success: false,
                error: 'Invalid source type'
            });
    }
    
    // Apply validation rules
    Promise.all(validationRules.map(validation => validation.run(req)))
        .then(() => next())
        .catch(next);
}

/**
 * @swagger
 * components:
 *   schemas:
 *     IngestionRequest:
 *       type: object
 *       required:
 *         - batch_id
 *         - records
 *       properties:
 *         batch_id:
 *           type: string
 *           description: Unique identifier for this batch of records
 *         records:
 *           type: array
 *           items:
 *             type: object
 *           description: Array of data records to ingest
 *           minItems: 1
 *           maxItems: 1000
 *     
 *     IngestionResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *         message:
 *           type: string
 *         batch_id:
 *           type: string
 *         source_type:
 *           type: string
 *         record_count:
 *           type: integer
 *         job_ids:
 *           type: array
 *           items:
 *             type: string
 *         estimated_processing_time:
 *           type: string
 */

/**
 * @swagger
 * /api/ingest/{source_type}:
 *   post:
 *     summary: Ingest data from various campus sources
 *     tags: [Data Ingestion]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: source_type
 *         required: true
 *         schema:
 *           type: string
 *           enum: [card_swipe, wifi_log, cctv_frame, helpdesk, rsvp, asset]
 *         description: Type of data source
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/IngestionRequest'
 *     responses:
 *       202:
 *         description: Data queued for processing
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/IngestionResponse'
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       429:
 *         description: Rate limit exceeded
 *       500:
 *         description: Internal server error
 */
router.post('/ingest/:source_type',
    ingestionRateLimit,
    auth.authenticate,
    auth.authorize(['ADMIN', 'SECURITY_OFFICER', 'OPERATOR']),
    commonValidation,
    getValidationMiddleware,
    ingestionController.ingestData
);

/**
 * @swagger
 * /api/ingest/status/{batch_id}:
 *   get:
 *     summary: Get processing status for a batch
 *     tags: [Data Ingestion]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: batch_id
 *         required: true
 *         schema:
 *           type: string
 *         description: Batch ID to check status for
 *     responses:
 *       200:
 *         description: Batch processing status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 status:
 *                   type: object
 *                   properties:
 *                     batch_id:
 *                       type: string
 *                     total_jobs:
 *                       type: integer
 *                     waiting:
 *                       type: integer
 *                     active:
 *                       type: integer
 *                     completed:
 *                       type: integer
 *                     failed:
 *                       type: integer
 *                     progress:
 *                       type: integer
 *       404:
 *         description: Batch not found
 *       500:
 *         description: Internal server error
 */
router.get('/ingest/status/:batch_id',
    auth.authenticate,
    auth.authorize(['ADMIN', 'SECURITY_OFFICER', 'OPERATOR']),
    param('batch_id').notEmpty().withMessage('Batch ID is required'),
    ingestionController.getIngestionStatus
);

/**
 * @swagger
 * /api/ingest/metrics:
 *   get:
 *     summary: Get ingestion system metrics
 *     tags: [Data Ingestion]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Ingestion metrics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 metrics:
 *                   type: object
 *                   properties:
 *                     totalRecords:
 *                       type: integer
 *                     successfulRecords:
 *                       type: integer
 *                     failedRecords:
 *                       type: integer
 *                     processingRate:
 *                       type: number
 *                     lastProcessedAt:
 *                       type: string
 *                       format: date-time
 *                     queue_stats:
 *                       type: object
 *       500:
 *         description: Internal server error
 */
router.get('/ingest/metrics',
    auth.authenticate,
    auth.authorize(['ADMIN', 'SECURITY_OFFICER']),
    ingestionController.getIngestionMetrics
);

/**
 * @swagger
 * /api/ingest/health:
 *   get:
 *     summary: Check ingestion system health
 *     tags: [Data Ingestion]
 *     responses:
 *       200:
 *         description: System health status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 status:
 *                   type: string
 *                 queue_ready:
 *                   type: boolean
 *                 queue_stats:
 *                   type: object
 *                 metrics:
 *                   type: object
 *       500:
 *         description: System unhealthy
 */
router.get('/ingest/health',
    ingestionController.healthCheck
);

// WebSocket endpoint for real-time ingestion (placeholder)
/**
 * @swagger
 * /ws/ingest:
 *   get:
 *     summary: WebSocket endpoint for real-time data ingestion
 *     tags: [Data Ingestion]
 *     description: |
 *       WebSocket endpoint for streaming data ingestion.
 *       
 *       Message format:
 *       ```json
 *       {
 *         "type": "card_swipe|wifi_log|cctv_frame|helpdesk|rsvp|asset",
 *         "payload": {
 *           "batch_id": "string",
 *           "data": {}
 *         }
 *       }
 *       ```
 *     responses:
 *       101:
 *         description: WebSocket connection established
 */

// Bulk ingestion endpoint for large datasets
/**
 * @swagger
 * /api/ingest/bulk:
 *   post:
 *     summary: Bulk data ingestion for large datasets
 *     tags: [Data Ingestion]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: CSV or JSON file containing data records
 *               source_type:
 *                 type: string
 *                 enum: [card_swipe, wifi_log, cctv_frame, helpdesk, rsvp, asset]
 *               batch_id:
 *                 type: string
 *     responses:
 *       202:
 *         description: File queued for processing
 *       400:
 *         description: Invalid file or parameters
 *       413:
 *         description: File too large
 *       500:
 *         description: Internal server error
 */
router.post('/ingest/bulk',
    auth.authenticate,
    auth.authorize(['ADMIN', 'SECURITY_OFFICER']),
    // File upload middleware would go here
    (req, res) => {
        res.status(501).json({
            success: false,
            error: 'Bulk ingestion not yet implemented',
            message: 'This endpoint will be available in a future version'
        });
    }
);

// Data source configuration endpoints
/**
 * @swagger
 * /api/ingest/sources:
 *   get:
 *     summary: Get available data source configurations
 *     tags: [Data Ingestion]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Available data sources
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 sources:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       type:
 *                         type: string
 *                       name:
 *                         type: string
 *                       description:
 *                         type: string
 *                       required_fields:
 *                         type: array
 *                         items:
 *                           type: string
 *                       optional_fields:
 *                         type: array
 *                         items:
 *                           type: string
 */
router.get('/ingest/sources',
    auth.authenticate,
    (req, res) => {
        const sources = [
            {
                type: 'card_swipe',
                name: 'Card Swipe Logs',
                description: 'Building access card swipe records',
                required_fields: ['card_id', 'timestamp', 'building', 'access_point'],
                optional_fields: ['room', 'floor', 'zone', 'access_level', 'duration']
            },
            {
                type: 'wifi_log',
                name: 'WiFi Connection Logs',
                description: 'Device WiFi association records',
                required_fields: ['device_hash', 'timestamp', 'access_point', 'signal_strength'],
                optional_fields: ['building', 'room', 'floor', 'session_duration']
            },
            {
                type: 'cctv_frame',
                name: 'CCTV Frame Metadata',
                description: 'CCTV camera frame analysis with face embeddings',
                required_fields: ['camera_id', 'timestamp', 'face_embeddings'],
                optional_fields: ['building', 'room', 'coordinates']
            },
            {
                type: 'helpdesk',
                name: 'Helpdesk Tickets',
                description: 'IT helpdesk service request records',
                required_fields: ['ticket_id', 'timestamp', 'requester_email', 'category'],
                optional_fields: ['requester_name', 'priority', 'location_building', 'location_room']
            },
            {
                type: 'rsvp',
                name: 'Event RSVPs',
                description: 'Campus event RSVP and attendance records',
                required_fields: ['event_id', 'timestamp', 'attendee_email', 'event_name'],
                optional_fields: ['attendee_name', 'rsvp_status', 'event_category', 'event_location_building']
            },
            {
                type: 'asset',
                name: 'Asset Management',
                description: 'Equipment and asset tracking records',
                required_fields: ['asset_id', 'timestamp', 'assigned_to', 'action'],
                optional_fields: ['asset_category', 'location_building', 'location_room']
            }
        ];

        res.json({
            success: true,
            sources
        });
    }
);

module.exports = router;