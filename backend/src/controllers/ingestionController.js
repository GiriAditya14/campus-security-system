const { validationResult } = require('express-validator');
const winston = require('winston');
const Bull = require('bull');
const Event = require('../models/Event');
const Entity = require('../models/Entity');

// Logger setup
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'logs/ingestion.log' })
    ]
});

// Job queue for background processing
const ingestionQueue = new Bull('data ingestion', {
    redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: process.env.REDIS_PORT || 6379,
        password: process.env.REDIS_PASSWORD
    }
});

class IngestionController {
    constructor() {
        this.setupJobProcessors();
        this.metrics = {
            totalRecords: 0,
            successfulRecords: 0,
            failedRecords: 0,
            processingRate: 0,
            lastProcessedAt: null
        };
    }

    setupJobProcessors() {
        // Process card swipe data
        ingestionQueue.process('card_swipe', 10, async (job) => {
            return await this.processCardSwipeData(job.data);
        });

        // Process WiFi log data
        ingestionQueue.process('wifi_log', 10, async (job) => {
            return await this.processWiFiLogData(job.data);
        });

        // Process CCTV frame data
        ingestionQueue.process('cctv_frame', 5, async (job) => {
            return await this.processCCTVFrameData(job.data);
        });

        // Process helpdesk ticket data
        ingestionQueue.process('helpdesk', 10, async (job) => {
            return await this.processHelpdeskData(job.data);
        });

        // Process RSVP data
        ingestionQueue.process('rsvp', 10, async (job) => {
            return await this.processRSVPData(job.data);
        });

        // Process asset management data
        ingestionQueue.process('asset', 10, async (job) => {
            return await this.processAssetData(job.data);
        });

        // Job event handlers
        ingestionQueue.on('completed', (job, result) => {
            this.metrics.successfulRecords++;
            this.metrics.lastProcessedAt = new Date();
            logger.info(`Job ${job.id} completed successfully`, { jobType: job.name, result });
        });

        ingestionQueue.on('failed', (job, err) => {
            this.metrics.failedRecords++;
            logger.error(`Job ${job.id} failed`, { jobType: job.name, error: err.message });
        });
    }

    // Generic ingestion endpoint
    async ingestData(req, res) {
        try {
            const errors = validationResult(req);
            if (!errors.isEmpty()) {
                return res.status(400).json({
                    success: false,
                    error: 'Validation failed',
                    details: errors.array()
                });
            }

            const { source_type } = req.params;
            const { batch_id, records } = req.body;

            // Validate source type
            const validSources = ['card_swipe', 'wifi_log', 'cctv_frame', 'helpdesk', 'rsvp', 'asset'];
            if (!validSources.includes(source_type)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid source type',
                    validSources
                });
            }

            // Validate records array
            if (!Array.isArray(records) || records.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Records must be a non-empty array'
                });
            }

            // Rate limiting check (1000 records per minute)
            const currentMinute = Math.floor(Date.now() / 60000);
            const rateLimitKey = `ingestion_rate_${currentMinute}`;
            
            // This would use Redis for actual rate limiting
            // For now, we'll implement a simple check
            if (records.length > 1000) {
                return res.status(429).json({
                    success: false,
                    error: 'Rate limit exceeded',
                    message: 'Maximum 1000 records per request'
                });
            }

            // Queue records for processing
            const jobPromises = records.map((record, index) => {
                const jobData = {
                    batch_id,
                    record_index: index,
                    source_type,
                    data: record,
                    received_at: new Date(),
                    client_ip: req.ip,
                    user_agent: req.get('User-Agent')
                };

                return ingestionQueue.add(source_type, jobData, {
                    attempts: 3,
                    backoff: {
                        type: 'exponential',
                        delay: 2000
                    },
                    removeOnComplete: 100,
                    removeOnFail: 50
                });
            });

            const jobs = await Promise.all(jobPromises);
            this.metrics.totalRecords += records.length;

            logger.info(`Queued ${records.length} ${source_type} records for processing`, {
                batch_id,
                source_type,
                record_count: records.length,
                job_ids: jobs.map(job => job.id)
            });

            res.status(202).json({
                success: true,
                message: 'Data queued for processing',
                batch_id,
                source_type,
                record_count: records.length,
                job_ids: jobs.map(job => job.id),
                estimated_processing_time: `${Math.ceil(records.length / 10)} seconds`
            });

        } catch (error) {
            logger.error('Data ingestion error:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: error.message
            });
        }
    }

    // Card swipe data processing
    async processCardSwipeData(jobData) {
        const { data, batch_id, record_index } = jobData;
        
        try {
            // Validate required fields
            const requiredFields = ['card_id', 'timestamp', 'building', 'access_point'];
            for (const field of requiredFields) {
                if (!data[field]) {
                    throw new Error(`Missing required field: ${field}`);
                }
            }

            // Normalize timestamp
            const timestamp = new Date(data.timestamp);
            if (isNaN(timestamp.getTime())) {
                throw new Error('Invalid timestamp format');
            }

            // Find or create entity by card_id
            let entity = await Entity.findOne({ 'identifiers.card_id': data.card_id });
            
            if (!entity) {
                // Create placeholder entity
                entity = new Entity({
                    _id: `E_CARD_${data.card_id}_${Date.now()}`,
                    identifiers: {
                        card_id: data.card_id,
                        email: null,
                        phone: null,
                        device_hashes: [],
                        face_embedding: null
                    },
                    profile: {
                        name: `Unknown User (${data.card_id})`,
                        first_name: 'Unknown',
                        last_name: 'User',
                        entity_type: 'unknown',
                        department: 'Unknown'
                    },
                    metadata: {
                        confidence: 0.5,
                        source_records: [`${batch_id}_${record_index}`],
                        status: 'active'
                    }
                });
                await entity.save();
            }

            // Create event
            const event = new Event({
                _id: `EVT_CS_${batch_id}_${record_index}`,
                entity_id: entity._id,
                timestamp: timestamp,
                activity_type: 'access',
                activity_subtype: 'card_swipe',
                location: {
                    building: data.building,
                    room: data.room || null,
                    floor: data.floor || null,
                    coordinates: data.coordinates || null,
                    zone: data.zone || 'academic',
                    access_level: data.access_level || 'public'
                },
                sources: [{
                    type: 'card_swipe',
                    id: `${batch_id}_${record_index}`,
                    confidence: 1.0,
                    raw_data: data
                }],
                fused_confidence: 1.0,
                provenance: {
                    fusion_algorithm: 'single_source',
                    processing_time: '0ms',
                    conflicts_resolved: 0
                },
                duration: data.duration || null
            });

            await event.save();

            return {
                success: true,
                entity_id: entity._id,
                event_id: event._id,
                processing_time: Date.now() - new Date(jobData.received_at).getTime()
            };

        } catch (error) {
            logger.error('Card swipe processing error:', error);
            throw error;
        }
    }

    // WiFi log data processing
    async processWiFiLogData(jobData) {
        const { data, batch_id, record_index } = jobData;
        
        try {
            // Validate required fields
            const requiredFields = ['device_hash', 'timestamp', 'access_point', 'signal_strength'];
            for (const field of requiredFields) {
                if (!data[field]) {
                    throw new Error(`Missing required field: ${field}`);
                }
            }

            // Normalize timestamp
            const timestamp = new Date(data.timestamp);
            if (isNaN(timestamp.getTime())) {
                throw new Error('Invalid timestamp format');
            }

            // Find entity by device hash
            let entity = await Entity.findOne({ 
                'identifiers.device_hashes': data.device_hash 
            });
            
            if (!entity) {
                // Create placeholder entity
                entity = new Entity({
                    _id: `E_WIFI_${data.device_hash}_${Date.now()}`,
                    identifiers: {
                        card_id: null,
                        email: null,
                        phone: null,
                        device_hashes: [data.device_hash],
                        face_embedding: null
                    },
                    profile: {
                        name: `Unknown Device (${data.device_hash.substring(0, 8)})`,
                        first_name: 'Unknown',
                        last_name: 'Device',
                        entity_type: 'unknown',
                        department: 'Unknown'
                    },
                    metadata: {
                        confidence: 0.3,
                        source_records: [`${batch_id}_${record_index}`],
                        status: 'active'
                    }
                });
                await entity.save();
            }

            // Calculate confidence based on signal strength
            const signalStrength = parseInt(data.signal_strength);
            const confidence = Math.max(0.1, Math.min(1.0, (signalStrength + 100) / 100));

            // Create event
            const event = new Event({
                _id: `EVT_WIFI_${batch_id}_${record_index}`,
                entity_id: entity._id,
                timestamp: timestamp,
                activity_type: 'connectivity',
                activity_subtype: 'wifi_association',
                location: {
                    building: data.building || 'Unknown',
                    room: data.room || null,
                    floor: data.floor || null,
                    coordinates: data.coordinates || null,
                    zone: data.zone || 'academic',
                    access_level: 'public'
                },
                sources: [{
                    type: 'wifi_log',
                    id: `${batch_id}_${record_index}`,
                    confidence: confidence,
                    raw_data: data
                }],
                fused_confidence: confidence,
                provenance: {
                    fusion_algorithm: 'single_source',
                    processing_time: '0ms',
                    conflicts_resolved: 0
                },
                duration: data.session_duration || null
            });

            await event.save();

            return {
                success: true,
                entity_id: entity._id,
                event_id: event._id,
                confidence: confidence,
                processing_time: Date.now() - new Date(jobData.received_at).getTime()
            };

        } catch (error) {
            logger.error('WiFi log processing error:', error);
            throw error;
        }
    }

    // CCTV frame data processing
    async processCCTVFrameData(jobData) {
        const { data, batch_id, record_index } = jobData;
        
        try {
            // Validate required fields
            const requiredFields = ['camera_id', 'timestamp', 'face_embeddings'];
            for (const field of requiredFields) {
                if (!data[field]) {
                    throw new Error(`Missing required field: ${field}`);
                }
            }

            // Normalize timestamp
            const timestamp = new Date(data.timestamp);
            if (isNaN(timestamp.getTime())) {
                throw new Error('Invalid timestamp format');
            }

            // Process each face embedding
            const results = [];
            
            for (const [index, faceData] of data.face_embeddings.entries()) {
                if (!faceData.embedding || !Array.isArray(faceData.embedding)) {
                    continue;
                }

                // Find entity by face embedding similarity (simplified)
                // In production, this would use ML service for similarity matching
                let entity = null;
                const confidence = faceData.confidence || 0.8;

                if (!entity) {
                    // Create placeholder entity
                    entity = new Entity({
                        _id: `E_FACE_${batch_id}_${record_index}_${index}`,
                        identifiers: {
                            card_id: null,
                            email: null,
                            phone: null,
                            device_hashes: [],
                            face_embedding: faceData.embedding
                        },
                        profile: {
                            name: `Unknown Person (Face ${index + 1})`,
                            first_name: 'Unknown',
                            last_name: 'Person',
                            entity_type: 'unknown',
                            department: 'Unknown'
                        },
                        metadata: {
                            confidence: confidence,
                            source_records: [`${batch_id}_${record_index}`],
                            status: 'active'
                        }
                    });
                    await entity.save();
                }

                // Create event
                const event = new Event({
                    _id: `EVT_CCTV_${batch_id}_${record_index}_${index}`,
                    entity_id: entity._id,
                    timestamp: timestamp,
                    activity_type: 'access',
                    activity_subtype: 'visual_detection',
                    location: {
                        building: data.building || 'Unknown',
                        room: data.room || null,
                        floor: data.floor || null,
                        coordinates: data.coordinates || null,
                        zone: data.zone || 'academic',
                        access_level: 'public'
                    },
                    sources: [{
                        type: 'cctv_frame',
                        id: `${batch_id}_${record_index}_${index}`,
                        confidence: confidence,
                        raw_data: {
                            camera_id: data.camera_id,
                            bounding_box: faceData.bounding_box,
                            quality_score: faceData.quality_score
                        }
                    }],
                    fused_confidence: confidence,
                    provenance: {
                        fusion_algorithm: 'single_source',
                        processing_time: '0ms',
                        conflicts_resolved: 0
                    }
                });

                await event.save();

                results.push({
                    entity_id: entity._id,
                    event_id: event._id,
                    confidence: confidence
                });
            }

            return {
                success: true,
                faces_processed: results.length,
                results: results,
                processing_time: Date.now() - new Date(jobData.received_at).getTime()
            };

        } catch (error) {
            logger.error('CCTV frame processing error:', error);
            throw error;
        }
    }

    // Helpdesk ticket data processing
    async processHelpdeskData(jobData) {
        const { data, batch_id, record_index } = jobData;
        
        try {
            // Validate required fields
            const requiredFields = ['ticket_id', 'timestamp', 'requester_email', 'category'];
            for (const field of requiredFields) {
                if (!data[field]) {
                    throw new Error(`Missing required field: ${field}`);
                }
            }

            // Normalize timestamp
            const timestamp = new Date(data.timestamp);
            if (isNaN(timestamp.getTime())) {
                throw new Error('Invalid timestamp format');
            }

            // Find entity by email
            let entity = await Entity.findOne({ 
                'identifiers.email': data.requester_email 
            });
            
            if (!entity) {
                // Create placeholder entity
                entity = new Entity({
                    _id: `E_HELP_${data.requester_email.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`,
                    identifiers: {
                        card_id: null,
                        email: data.requester_email,
                        phone: null,
                        device_hashes: [],
                        face_embedding: null
                    },
                    profile: {
                        name: data.requester_name || `User (${data.requester_email})`,
                        first_name: 'Unknown',
                        last_name: 'User',
                        entity_type: 'unknown',
                        department: 'Unknown'
                    },
                    metadata: {
                        confidence: 0.7,
                        source_records: [`${batch_id}_${record_index}`],
                        status: 'active'
                    }
                });
                await entity.save();
            }

            // Create event
            const event = new Event({
                _id: `EVT_HELP_${batch_id}_${record_index}`,
                entity_id: entity._id,
                timestamp: timestamp,
                activity_type: 'service',
                activity_subtype: 'helpdesk_request',
                location: {
                    building: data.location_building || 'Remote',
                    room: data.location_room || null,
                    floor: data.location_floor || null,
                    coordinates: null,
                    zone: 'service',
                    access_level: 'public'
                },
                sources: [{
                    type: 'helpdesk',
                    id: `${batch_id}_${record_index}`,
                    confidence: 0.9,
                    raw_data: data
                }],
                fused_confidence: 0.9,
                provenance: {
                    fusion_algorithm: 'single_source',
                    processing_time: '0ms',
                    conflicts_resolved: 0
                },
                tags: [data.category, data.priority || 'normal']
            });

            await event.save();

            return {
                success: true,
                entity_id: entity._id,
                event_id: event._id,
                processing_time: Date.now() - new Date(jobData.received_at).getTime()
            };

        } catch (error) {
            logger.error('Helpdesk processing error:', error);
            throw error;
        }
    }

    // RSVP data processing
    async processRSVPData(jobData) {
        const { data, batch_id, record_index } = jobData;
        
        try {
            // Validate required fields
            const requiredFields = ['event_id', 'timestamp', 'attendee_email', 'event_name'];
            for (const field of requiredFields) {
                if (!data[field]) {
                    throw new Error(`Missing required field: ${field}`);
                }
            }

            // Normalize timestamp
            const timestamp = new Date(data.timestamp);
            if (isNaN(timestamp.getTime())) {
                throw new Error('Invalid timestamp format');
            }

            // Find entity by email
            let entity = await Entity.findOne({ 
                'identifiers.email': data.attendee_email 
            });
            
            if (!entity) {
                // Create placeholder entity
                entity = new Entity({
                    _id: `E_RSVP_${data.attendee_email.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`,
                    identifiers: {
                        card_id: null,
                        email: data.attendee_email,
                        phone: null,
                        device_hashes: [],
                        face_embedding: null
                    },
                    profile: {
                        name: data.attendee_name || `Attendee (${data.attendee_email})`,
                        first_name: 'Unknown',
                        last_name: 'Attendee',
                        entity_type: 'unknown',
                        department: 'Unknown'
                    },
                    metadata: {
                        confidence: 0.8,
                        source_records: [`${batch_id}_${record_index}`],
                        status: 'active'
                    }
                });
                await entity.save();
            }

            // Create event
            const event = new Event({
                _id: `EVT_RSVP_${batch_id}_${record_index}`,
                entity_id: entity._id,
                timestamp: timestamp,
                activity_type: 'social',
                activity_subtype: 'event_rsvp',
                location: {
                    building: data.event_location_building || 'Unknown',
                    room: data.event_location_room || null,
                    floor: data.event_location_floor || null,
                    coordinates: data.event_coordinates || null,
                    zone: 'social',
                    access_level: 'public'
                },
                sources: [{
                    type: 'rsvp',
                    id: `${batch_id}_${record_index}`,
                    confidence: 0.95,
                    raw_data: data
                }],
                fused_confidence: 0.95,
                provenance: {
                    fusion_algorithm: 'single_source',
                    processing_time: '0ms',
                    conflicts_resolved: 0
                },
                tags: [data.event_category || 'event', data.rsvp_status || 'attending']
            });

            await event.save();

            return {
                success: true,
                entity_id: entity._id,
                event_id: event._id,
                processing_time: Date.now() - new Date(jobData.received_at).getTime()
            };

        } catch (error) {
            logger.error('RSVP processing error:', error);
            throw error;
        }
    }

    // Asset management data processing
    async processAssetData(jobData) {
        const { data, batch_id, record_index } = jobData;
        
        try {
            // Validate required fields
            const requiredFields = ['asset_id', 'timestamp', 'assigned_to', 'action'];
            for (const field of requiredFields) {
                if (!data[field]) {
                    throw new Error(`Missing required field: ${field}`);
                }
            }

            // Normalize timestamp
            const timestamp = new Date(data.timestamp);
            if (isNaN(timestamp.getTime())) {
                throw new Error('Invalid timestamp format');
            }

            // Find entity by assigned_to (could be email or employee_id)
            let entity = await Entity.findOne({
                $or: [
                    { 'identifiers.email': data.assigned_to },
                    { 'identifiers.employee_id': data.assigned_to }
                ]
            });
            
            if (!entity) {
                // Create placeholder entity
                entity = new Entity({
                    _id: `E_ASSET_${data.assigned_to.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`,
                    identifiers: {
                        card_id: null,
                        email: data.assigned_to.includes('@') ? data.assigned_to : null,
                        employee_id: !data.assigned_to.includes('@') ? data.assigned_to : null,
                        phone: null,
                        device_hashes: [],
                        face_embedding: null
                    },
                    profile: {
                        name: `Asset User (${data.assigned_to})`,
                        first_name: 'Unknown',
                        last_name: 'User',
                        entity_type: 'unknown',
                        department: 'Unknown'
                    },
                    metadata: {
                        confidence: 0.6,
                        source_records: [`${batch_id}_${record_index}`],
                        status: 'active'
                    }
                });
                await entity.save();
            }

            // Create event
            const event = new Event({
                _id: `EVT_ASSET_${batch_id}_${record_index}`,
                entity_id: entity._id,
                timestamp: timestamp,
                activity_type: 'transaction',
                activity_subtype: 'asset_management',
                location: {
                    building: data.location_building || 'Unknown',
                    room: data.location_room || null,
                    floor: data.location_floor || null,
                    coordinates: null,
                    zone: 'administrative',
                    access_level: 'restricted'
                },
                sources: [{
                    type: 'asset',
                    id: `${batch_id}_${record_index}`,
                    confidence: 0.9,
                    raw_data: data
                }],
                fused_confidence: 0.9,
                provenance: {
                    fusion_algorithm: 'single_source',
                    processing_time: '0ms',
                    conflicts_resolved: 0
                },
                tags: [data.asset_category || 'equipment', data.action]
            });

            await event.save();

            return {
                success: true,
                entity_id: entity._id,
                event_id: event._id,
                processing_time: Date.now() - new Date(jobData.received_at).getTime()
            };

        } catch (error) {
            logger.error('Asset processing error:', error);
            throw error;
        }
    }

    // Get ingestion status
    async getIngestionStatus(req, res) {
        try {
            const { batch_id } = req.params;
            
            // Get job statuses for the batch
            const jobs = await ingestionQueue.getJobs(['waiting', 'active', 'completed', 'failed'], 0, -1);
            const batchJobs = jobs.filter(job => job.data.batch_id === batch_id);
            
            const status = {
                batch_id,
                total_jobs: batchJobs.length,
                waiting: batchJobs.filter(job => job.opts.jobId && job.finishedOn === null && job.processedOn === null).length,
                active: batchJobs.filter(job => job.processedOn !== null && job.finishedOn === null).length,
                completed: batchJobs.filter(job => job.finishedOn !== null && job.failedReason === null).length,
                failed: batchJobs.filter(job => job.failedReason !== null).length,
                progress: 0
            };
            
            if (status.total_jobs > 0) {
                status.progress = Math.round(((status.completed + status.failed) / status.total_jobs) * 100);
            }

            res.json({
                success: true,
                status
            });

        } catch (error) {
            logger.error('Get ingestion status error:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: error.message
            });
        }
    }

    // Get ingestion metrics
    async getIngestionMetrics(req, res) {
        try {
            const queueStats = await ingestionQueue.getJobCounts();
            
            res.json({
                success: true,
                metrics: {
                    ...this.metrics,
                    queue_stats: queueStats,
                    processing_rate: this.calculateProcessingRate()
                }
            });

        } catch (error) {
            logger.error('Get ingestion metrics error:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error',
                message: error.message
            });
        }
    }

    calculateProcessingRate() {
        // Calculate records processed per minute
        const now = Date.now();
        const oneMinuteAgo = now - 60000;
        
        // This is a simplified calculation
        // In production, you'd track this more accurately
        return Math.round(this.metrics.successfulRecords / 60);
    }

    // Health check endpoint
    async healthCheck(req, res) {
        try {
            const queueHealth = await ingestionQueue.isReady();
            const queueStats = await ingestionQueue.getJobCounts();
            
            res.json({
                success: true,
                status: 'healthy',
                queue_ready: queueHealth,
                queue_stats: queueStats,
                metrics: this.metrics
            });

        } catch (error) {
            logger.error('Ingestion health check error:', error);
            res.status(500).json({
                success: false,
                status: 'unhealthy',
                error: error.message
            });
        }
    }
}

module.exports = new IngestionController();