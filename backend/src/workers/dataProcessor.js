const Bull = require('bull');
const winston = require('winston');
const Entity = require('../models/Entity');
const Event = require('../models/Event');
const Alert = require('../models/Alert');
const CacheService = require('../services/cacheService');

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
        new winston.transports.File({ filename: 'logs/data-processor.log' })
    ]
});

class DataProcessor {
    constructor() {
        this.queues = {};
        this.metrics = {
            processed: 0,
            failed: 0,
            processingRate: 0,
            averageProcessingTime: 0,
            lastProcessedAt: null,
            errorRate: 0
        };
        
        this.setupQueues();
        this.setupMetricsTracking();
    }

    setupQueues() {
        const redisConfig = {
            redis: {
                host: process.env.REDIS_HOST || 'localhost',
                port: process.env.REDIS_PORT || 6379,
                password: process.env.REDIS_PASSWORD
            }
        };

        // Create separate queues for different data types
        this.queues = {
            cardSwipe: new Bull('card-swipe-processing', redisConfig),
            wifiLog: new Bull('wifi-log-processing', redisConfig),
            cctvFrame: new Bull('cctv-frame-processing', redisConfig),
            helpdesk: new Bull('helpdesk-processing', redisConfig),
            rsvp: new Bull('rsvp-processing', redisConfig),
            asset: new Bull('asset-processing', redisConfig),
            entityResolution: new Bull('entity-resolution', redisConfig),
            alertGeneration: new Bull('alert-generation', redisConfig)
        };

        // Setup processors for each queue
        this.setupProcessors();
        this.setupEventHandlers();
    }

    setupProcessors() {
        // Card swipe processing
        this.queues.cardSwipe.process('process', 10, async (job) => {
            return await this.processCardSwipeData(job.data);
        });

        // WiFi log processing
        this.queues.wifiLog.process('process', 15, async (job) => {
            return await this.processWiFiLogData(job.data);
        });

        // CCTV frame processing (more CPU intensive)
        this.queues.cctvFrame.process('process', 5, async (job) => {
            return await this.processCCTVFrameData(job.data);
        });

        // Helpdesk processing
        this.queues.helpdesk.process('process', 10, async (job) => {
            return await this.processHelpdeskData(job.data);
        });

        // RSVP processing
        this.queues.rsvp.process('process', 10, async (job) => {
            return await this.processRSVPData(job.data);
        });

        // Asset processing
        this.queues.asset.process('process', 10, async (job) => {
            return await this.processAssetData(job.data);
        });

        // Entity resolution processing
        this.queues.entityResolution.process('resolve', 5, async (job) => {
            return await this.processEntityResolution(job.data);
        });

        // Alert generation processing
        this.queues.alertGeneration.process('generate', 20, async (job) => {
            return await this.processAlertGeneration(job.data);
        });
    }

    setupEventHandlers() {
        Object.entries(this.queues).forEach(([queueName, queue]) => {
            queue.on('completed', (job, result) => {
                this.metrics.processed++;
                this.metrics.lastProcessedAt = new Date();
                this.updateProcessingTime(job.processedOn, job.finishedOn);
                
                logger.info(`Job completed in ${queueName}`, {
                    jobId: job.id,
                    processingTime: job.finishedOn - job.processedOn,
                    result: result
                });

                // Trigger downstream processing if needed
                this.triggerDownstreamProcessing(queueName, job, result);
            });

            queue.on('failed', (job, err) => {
                this.metrics.failed++;
                this.updateErrorRate();
                
                logger.error(`Job failed in ${queueName}`, {
                    jobId: job.id,
                    error: err.message,
                    stack: err.stack,
                    data: job.data
                });

                // Handle retry logic
                this.handleJobFailure(queueName, job, err);
            });

            queue.on('stalled', (job) => {
                logger.warn(`Job stalled in ${queueName}`, {
                    jobId: job.id,
                    data: job.data
                });
            });
        });
    }

    setupMetricsTracking() {
        // Update processing rate every minute
        setInterval(() => {
            this.updateProcessingRate();
        }, 60000);

        // Clean up old jobs every hour
        setInterval(() => {
            this.cleanupOldJobs();
        }, 3600000);
    }

    // Card swipe data processing with enhanced error handling
    async processCardSwipeData(jobData) {
        const startTime = Date.now();
        
        try {
            const { data, batch_id, record_index, source_type } = jobData;
            
            // Validate required fields
            this.validateCardSwipeData(data);

            // Normalize and clean data
            const normalizedData = this.normalizeCardSwipeData(data);

            // Find or create entity
            let entity = await this.findOrCreateEntityByCardId(normalizedData.card_id, batch_id, record_index);

            // Create event with enhanced metadata
            const event = await this.createCardSwipeEvent(entity, normalizedData, batch_id, record_index);

            // Queue for entity resolution if new entity
            if (entity.metadata.confidence < 0.8) {
                await this.queues.entityResolution.add('resolve', {
                    entity_id: entity._id,
                    trigger: 'new_card_swipe',
                    data: normalizedData
                }, {
                    delay: 5000, // 5 second delay to allow for more data
                    attempts: 3
                });
            }

            // Queue for alert generation
            await this.queues.alertGeneration.add('generate', {
                entity_id: entity._id,
                event_id: event._id,
                trigger: 'card_swipe',
                data: normalizedData
            }, {
                attempts: 2
            });

            const processingTime = Date.now() - startTime;
            
            return {
                success: true,
                entity_id: entity._id,
                event_id: event._id,
                processing_time: processingTime,
                confidence: entity.metadata.confidence
            };

        } catch (error) {
            logger.error('Card swipe processing error:', error);
            throw new Error(`Card swipe processing failed: ${error.message}`);
        }
    }

    // WiFi log data processing with signal strength analysis
    async processWiFiLogData(jobData) {
        const startTime = Date.now();
        
        try {
            const { data, batch_id, record_index } = jobData;
            
            // Validate required fields
            this.validateWiFiLogData(data);

            // Normalize and clean data
            const normalizedData = this.normalizeWiFiLogData(data);

            // Calculate confidence based on signal strength and duration
            const confidence = this.calculateWiFiConfidence(normalizedData);

            // Find or create entity by device hash
            let entity = await this.findOrCreateEntityByDeviceHash(
                normalizedData.device_hash, 
                batch_id, 
                record_index,
                confidence
            );

            // Create event
            const event = await this.createWiFiEvent(entity, normalizedData, batch_id, record_index, confidence);

            // Queue for entity resolution if confidence is low
            if (confidence < 0.6) {
                await this.queues.entityResolution.add('resolve', {
                    entity_id: entity._id,
                    trigger: 'wifi_association',
                    data: normalizedData
                });
            }

            // Queue for alert generation (unusual patterns)
            if (this.isUnusualWiFiPattern(normalizedData)) {
                await this.queues.alertGeneration.add('generate', {
                    entity_id: entity._id,
                    event_id: event._id,
                    trigger: 'unusual_wifi_pattern',
                    data: normalizedData
                });
            }

            const processingTime = Date.now() - startTime;
            
            return {
                success: true,
                entity_id: entity._id,
                event_id: event._id,
                processing_time: processingTime,
                confidence: confidence
            };

        } catch (error) {
            logger.error('WiFi log processing error:', error);
            throw new Error(`WiFi log processing failed: ${error.message}`);
        }
    }

    // CCTV frame processing with face recognition
    async processCCTVFrameData(jobData) {
        const startTime = Date.now();
        
        try {
            const { data, batch_id, record_index } = jobData;
            
            // Validate required fields
            this.validateCCTVFrameData(data);

            const results = [];
            
            // Process each face in the frame
            for (const [index, faceData] of data.face_embeddings.entries()) {
                try {
                    // Validate face embedding
                    if (!this.isValidFaceEmbedding(faceData.embedding)) {
                        continue;
                    }

                    // Try to match with existing entities
                    let entity = await this.findEntityByFaceEmbedding(faceData.embedding);
                    
                    if (!entity) {
                        // Create new entity for unrecognized face
                        entity = await this.createEntityFromFace(faceData, batch_id, record_index, index);
                    } else {
                        // Update confidence if match found
                        entity.metadata.confidence = Math.max(entity.metadata.confidence, faceData.confidence || 0.8);
                        await entity.save();
                    }

                    // Create event
                    const event = await this.createCCTVEvent(entity, data, faceData, batch_id, record_index, index);

                    // Queue for entity resolution
                    await this.queues.entityResolution.add('resolve', {
                        entity_id: entity._id,
                        trigger: 'face_detection',
                        data: { ...data, face_data: faceData }
                    });

                    results.push({
                        entity_id: entity._id,
                        event_id: event._id,
                        confidence: faceData.confidence || 0.8
                    });

                } catch (faceError) {
                    logger.error(`Error processing face ${index}:`, faceError);
                    continue;
                }
            }

            const processingTime = Date.now() - startTime;
            
            return {
                success: true,
                faces_processed: results.length,
                results: results,
                processing_time: processingTime
            };

        } catch (error) {
            logger.error('CCTV frame processing error:', error);
            throw new Error(`CCTV frame processing failed: ${error.message}`);
        }
    }

    // Enhanced helpdesk processing with text analysis
    async processHelpdeskData(jobData) {
        const startTime = Date.now();
        
        try {
            const { data, batch_id, record_index } = jobData;
            
            // Validate required fields
            this.validateHelpdeskData(data);

            // Normalize data
            const normalizedData = this.normalizeHelpdeskData(data);

            // Extract additional information from text
            const textAnalysis = await this.analyzeHelpdeskText(normalizedData);

            // Find or create entity by email
            let entity = await this.findOrCreateEntityByEmail(
                normalizedData.requester_email,
                normalizedData.requester_name,
                batch_id,
                record_index
            );

            // Create event with text analysis
            const event = await this.createHelpdeskEvent(entity, normalizedData, textAnalysis, batch_id, record_index);

            // Queue for alert generation if high priority or security-related
            if (this.isSecurityRelatedTicket(normalizedData, textAnalysis)) {
                await this.queues.alertGeneration.add('generate', {
                    entity_id: entity._id,
                    event_id: event._id,
                    trigger: 'security_ticket',
                    data: normalizedData,
                    analysis: textAnalysis
                }, {
                    priority: 10 // High priority
                });
            }

            const processingTime = Date.now() - startTime;
            
            return {
                success: true,
                entity_id: entity._id,
                event_id: event._id,
                processing_time: processingTime,
                text_analysis: textAnalysis
            };

        } catch (error) {
            logger.error('Helpdesk processing error:', error);
            throw new Error(`Helpdesk processing failed: ${error.message}`);
        }
    }

    // RSVP processing with event correlation
    async processRSVPData(jobData) {
        const startTime = Date.now();
        
        try {
            const { data, batch_id, record_index } = jobData;
            
            // Validate required fields
            this.validateRSVPData(data);

            // Normalize data
            const normalizedData = this.normalizeRSVPData(data);

            // Find or create entity by email
            let entity = await this.findOrCreateEntityByEmail(
                normalizedData.attendee_email,
                normalizedData.attendee_name,
                batch_id,
                record_index
            );

            // Create event
            const event = await this.createRSVPEvent(entity, normalizedData, batch_id, record_index);

            // Create associations with other attendees (if available)
            await this.createEventAssociations(entity, normalizedData);

            const processingTime = Date.now() - startTime;
            
            return {
                success: true,
                entity_id: entity._id,
                event_id: event._id,
                processing_time: processingTime
            };

        } catch (error) {
            logger.error('RSVP processing error:', error);
            throw new Error(`RSVP processing failed: ${error.message}`);
        }
    }

    // Asset processing with ownership tracking
    async processAssetData(jobData) {
        const startTime = Date.now();
        
        try {
            const { data, batch_id, record_index } = jobData;
            
            // Validate required fields
            this.validateAssetData(data);

            // Normalize data
            const normalizedData = this.normalizeAssetData(data);

            // Find or create entity
            let entity = await this.findOrCreateEntityByIdentifier(
                normalizedData.assigned_to,
                batch_id,
                record_index
            );

            // Create event
            const event = await this.createAssetEvent(entity, normalizedData, batch_id, record_index);

            // Queue for alert generation if unusual asset activity
            if (this.isUnusualAssetActivity(normalizedData)) {
                await this.queues.alertGeneration.add('generate', {
                    entity_id: entity._id,
                    event_id: event._id,
                    trigger: 'unusual_asset_activity',
                    data: normalizedData
                });
            }

            const processingTime = Date.now() - startTime;
            
            return {
                success: true,
                entity_id: entity._id,
                event_id: event._id,
                processing_time: processingTime
            };

        } catch (error) {
            logger.error('Asset processing error:', error);
            throw new Error(`Asset processing failed: ${error.message}`);
        }
    }

    // Entity resolution processing
    async processEntityResolution(jobData) {
        const startTime = Date.now();
        
        try {
            const { entity_id, trigger, data } = jobData;
            
            // Get the entity
            const entity = await Entity.findById(entity_id);
            if (!entity) {
                throw new Error(`Entity ${entity_id} not found`);
            }

            // Find potential matches
            const potentialMatches = await this.findPotentialEntityMatches(entity, data);
            
            if (potentialMatches.length > 0) {
                // Process matches and merge if confidence is high enough
                const mergeResults = await this.processPotentialMatches(entity, potentialMatches);
                
                if (mergeResults.merged) {
                    // Invalidate cache for merged entities
                    await this.invalidateEntityCaches([entity_id, ...mergeResults.merged_with]);
                }
                
                return {
                    success: true,
                    entity_id: entity_id,
                    matches_found: potentialMatches.length,
                    merged: mergeResults.merged,
                    final_confidence: mergeResults.final_confidence,
                    processing_time: Date.now() - startTime
                };
            }

            return {
                success: true,
                entity_id: entity_id,
                matches_found: 0,
                merged: false,
                processing_time: Date.now() - startTime
            };

        } catch (error) {
            logger.error('Entity resolution processing error:', error);
            throw new Error(`Entity resolution failed: ${error.message}`);
        }
    }

    // Alert generation processing
    async processAlertGeneration(jobData) {
        const startTime = Date.now();
        
        try {
            const { entity_id, event_id, trigger, data } = jobData;
            
            const alerts = [];
            
            // Check for different types of alerts based on trigger
            switch (trigger) {
                case 'card_swipe':
                    alerts.push(...await this.checkCardSwipeAlerts(entity_id, event_id, data));
                    break;
                case 'unusual_wifi_pattern':
                    alerts.push(...await this.checkWiFiAlerts(entity_id, event_id, data));
                    break;
                case 'security_ticket':
                    alerts.push(...await this.checkSecurityTicketAlerts(entity_id, event_id, data));
                    break;
                case 'unusual_asset_activity':
                    alerts.push(...await this.checkAssetAlerts(entity_id, event_id, data));
                    break;
            }

            // Create and save alerts
            const createdAlerts = [];
            for (const alertData of alerts) {
                const alert = new Alert(alertData);
                await alert.save();
                createdAlerts.push(alert);
                
                // Emit real-time alert via WebSocket (placeholder)
                // this.emitRealTimeAlert(alert);
            }

            return {
                success: true,
                alerts_generated: createdAlerts.length,
                alert_ids: createdAlerts.map(a => a._id),
                processing_time: Date.now() - startTime
            };

        } catch (error) {
            logger.error('Alert generation processing error:', error);
            throw new Error(`Alert generation failed: ${error.message}`);
        }
    }

    // Utility methods for data validation
    validateCardSwipeData(data) {
        const required = ['card_id', 'timestamp', 'building', 'access_point'];
        for (const field of required) {
            if (!data[field]) {
                throw new Error(`Missing required field: ${field}`);
            }
        }
        
        if (isNaN(new Date(data.timestamp).getTime())) {
            throw new Error('Invalid timestamp format');
        }
    }

    validateWiFiLogData(data) {
        const required = ['device_hash', 'timestamp', 'access_point', 'signal_strength'];
        for (const field of required) {
            if (!data[field]) {
                throw new Error(`Missing required field: ${field}`);
            }
        }
        
        const signalStrength = parseInt(data.signal_strength);
        if (isNaN(signalStrength) || signalStrength > 0 || signalStrength < -100) {
            throw new Error('Invalid signal strength (must be between -100 and 0)');
        }
    }

    validateCCTVFrameData(data) {
        const required = ['camera_id', 'timestamp', 'face_embeddings'];
        for (const field of required) {
            if (!data[field]) {
                throw new Error(`Missing required field: ${field}`);
            }
        }
        
        if (!Array.isArray(data.face_embeddings) || data.face_embeddings.length === 0) {
            throw new Error('face_embeddings must be a non-empty array');
        }
    }

    validateHelpdeskData(data) {
        const required = ['ticket_id', 'timestamp', 'requester_email', 'category'];
        for (const field of required) {
            if (!data[field]) {
                throw new Error(`Missing required field: ${field}`);
            }
        }
        
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.requester_email)) {
            throw new Error('Invalid email format');
        }
    }

    validateRSVPData(data) {
        const required = ['event_id', 'timestamp', 'attendee_email', 'event_name'];
        for (const field of required) {
            if (!data[field]) {
                throw new Error(`Missing required field: ${field}`);
            }
        }
    }

    validateAssetData(data) {
        const required = ['asset_id', 'timestamp', 'assigned_to', 'action'];
        for (const field of required) {
            if (!data[field]) {
                throw new Error(`Missing required field: ${field}`);
            }
        }
        
        const validActions = ['checkout', 'checkin', 'transfer', 'maintenance'];
        if (!validActions.includes(data.action)) {
            throw new Error(`Invalid action. Must be one of: ${validActions.join(', ')}`);
        }
    }

    // Data normalization methods
    normalizeCardSwipeData(data) {
        return {
            ...data,
            timestamp: new Date(data.timestamp),
            card_id: data.card_id.toString().trim(),
            building: data.building.trim(),
            access_point: data.access_point.trim(),
            room: data.room ? data.room.trim() : null,
            floor: data.floor ? data.floor.trim() : null,
            zone: data.zone || 'academic',
            access_level: data.access_level || 'public',
            duration: data.duration ? parseInt(data.duration) : null
        };
    }

    normalizeWiFiLogData(data) {
        return {
            ...data,
            timestamp: new Date(data.timestamp),
            device_hash: data.device_hash.toString().toLowerCase().trim(),
            access_point: data.access_point.trim(),
            signal_strength: parseInt(data.signal_strength),
            building: data.building ? data.building.trim() : 'Unknown',
            room: data.room ? data.room.trim() : null,
            session_duration: data.session_duration ? parseInt(data.session_duration) : null
        };
    }

    normalizeHelpdeskData(data) {
        return {
            ...data,
            timestamp: new Date(data.timestamp),
            ticket_id: data.ticket_id.toString().trim(),
            requester_email: data.requester_email.toLowerCase().trim(),
            category: data.category.trim(),
            requester_name: data.requester_name ? data.requester_name.trim() : null,
            priority: data.priority || 'normal'
        };
    }

    normalizeRSVPData(data) {
        return {
            ...data,
            timestamp: new Date(data.timestamp),
            event_id: data.event_id.toString().trim(),
            attendee_email: data.attendee_email.toLowerCase().trim(),
            event_name: data.event_name.trim(),
            attendee_name: data.attendee_name ? data.attendee_name.trim() : null,
            rsvp_status: data.rsvp_status || 'attending'
        };
    }

    normalizeAssetData(data) {
        return {
            ...data,
            timestamp: new Date(data.timestamp),
            asset_id: data.asset_id.toString().trim(),
            assigned_to: data.assigned_to.trim(),
            action: data.action.toLowerCase().trim(),
            asset_category: data.asset_category ? data.asset_category.trim() : 'equipment'
        };
    }

    // Helper methods for entity operations
    async findOrCreateEntityByCardId(cardId, batchId, recordIndex) {
        let entity = await Entity.findOne({ 'identifiers.card_id': cardId });
        
        if (!entity) {
            entity = new Entity({
                _id: `E_CARD_${cardId}_${Date.now()}`,
                identifiers: {
                    card_id: cardId,
                    email: null,
                    phone: null,
                    device_hashes: [],
                    face_embedding: null
                },
                profile: {
                    name: `Card User (${cardId})`,
                    first_name: 'Unknown',
                    last_name: 'User',
                    entity_type: 'unknown',
                    department: 'Unknown'
                },
                metadata: {
                    confidence: 0.6,
                    source_records: [`${batchId}_${recordIndex}`],
                    status: 'active'
                }
            });
            await entity.save();
        }
        
        return entity;
    }

    async findOrCreateEntityByDeviceHash(deviceHash, batchId, recordIndex, confidence) {
        let entity = await Entity.findOne({ 'identifiers.device_hashes': deviceHash });
        
        if (!entity) {
            entity = new Entity({
                _id: `E_WIFI_${deviceHash}_${Date.now()}`,
                identifiers: {
                    card_id: null,
                    email: null,
                    phone: null,
                    device_hashes: [deviceHash],
                    face_embedding: null
                },
                profile: {
                    name: `Device User (${deviceHash.substring(0, 8)})`,
                    first_name: 'Unknown',
                    last_name: 'User',
                    entity_type: 'unknown',
                    department: 'Unknown'
                },
                metadata: {
                    confidence: confidence,
                    source_records: [`${batchId}_${recordIndex}`],
                    status: 'active'
                }
            });
            await entity.save();
        }
        
        return entity;
    }

    async findOrCreateEntityByEmail(email, name, batchId, recordIndex) {
        let entity = await Entity.findOne({ 'identifiers.email': email });
        
        if (!entity) {
            const nameParts = name ? name.split(' ') : ['Unknown', 'User'];
            entity = new Entity({
                _id: `E_EMAIL_${email.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}`,
                identifiers: {
                    card_id: null,
                    email: email,
                    phone: null,
                    device_hashes: [],
                    face_embedding: null
                },
                profile: {
                    name: name || `User (${email})`,
                    first_name: nameParts[0],
                    last_name: nameParts.slice(1).join(' ') || 'User',
                    entity_type: 'unknown',
                    department: 'Unknown'
                },
                metadata: {
                    confidence: 0.8,
                    source_records: [`${batchId}_${recordIndex}`],
                    status: 'active'
                }
            });
            await entity.save();
        }
        
        return entity;
    }

    // Confidence calculation methods
    calculateWiFiConfidence(data) {
        let confidence = 0.3; // Base confidence for WiFi data
        
        // Signal strength factor
        const signalStrength = data.signal_strength;
        const signalFactor = Math.max(0, (signalStrength + 100) / 100);
        confidence += signalFactor * 0.4;
        
        // Session duration factor
        if (data.session_duration) {
            const durationFactor = Math.min(1, data.session_duration / 3600); // Normalize to 1 hour
            confidence += durationFactor * 0.3;
        }
        
        return Math.min(1, Math.max(0.1, confidence));
    }

    // Pattern detection methods
    isUnusualWiFiPattern(data) {
        // Check for unusual hours (before 6 AM or after 10 PM)
        const hour = data.timestamp.getHours();
        if (hour < 6 || hour > 22) {
            return true;
        }
        
        // Check for very weak signal (might indicate spoofing)
        if (data.signal_strength < -80) {
            return true;
        }
        
        return false;
    }

    isSecurityRelatedTicket(data, textAnalysis) {
        const securityKeywords = ['security', 'breach', 'unauthorized', 'hack', 'malware', 'virus', 'suspicious'];
        const category = data.category.toLowerCase();
        const priority = data.priority.toLowerCase();
        
        return securityKeywords.some(keyword => category.includes(keyword)) || 
               priority === 'urgent' || 
               (textAnalysis && textAnalysis.security_score > 0.7);
    }

    isUnusualAssetActivity(data) {
        // Check for after-hours activity
        const hour = data.timestamp.getHours();
        if ((hour < 7 || hour > 19) && data.action !== 'maintenance') {
            return true;
        }
        
        // Check for rapid successive actions
        // This would require checking recent history
        return false;
    }

    // Text analysis placeholder
    async analyzeHelpdeskText(data) {
        // This would integrate with NLP service
        // For now, return basic analysis
        return {
            sentiment: 'neutral',
            urgency_score: data.priority === 'urgent' ? 0.9 : 0.3,
            security_score: 0.1,
            keywords: []
        };
    }

    // Event creation methods
    async createCardSwipeEvent(entity, data, batchId, recordIndex) {
        const event = new Event({
            _id: `EVT_CS_${batchId}_${recordIndex}`,
            entity_id: entity._id,
            timestamp: data.timestamp,
            activity_type: 'access',
            activity_subtype: 'card_swipe',
            location: {
                building: data.building,
                room: data.room,
                floor: data.floor,
                coordinates: data.coordinates || null,
                zone: data.zone,
                access_level: data.access_level
            },
            sources: [{
                type: 'card_swipe',
                id: `${batchId}_${recordIndex}`,
                confidence: 1.0,
                raw_data: data
            }],
            fused_confidence: 1.0,
            provenance: {
                fusion_algorithm: 'single_source',
                processing_time: '0ms',
                conflicts_resolved: 0
            },
            duration: data.duration
        });
        
        await event.save();
        return event;
    }

    async createWiFiEvent(entity, data, batchId, recordIndex, confidence) {
        const event = new Event({
            _id: `EVT_WIFI_${batchId}_${recordIndex}`,
            entity_id: entity._id,
            timestamp: data.timestamp,
            activity_type: 'connectivity',
            activity_subtype: 'wifi_association',
            location: {
                building: data.building,
                room: data.room,
                floor: data.floor,
                coordinates: data.coordinates || null,
                zone: 'academic',
                access_level: 'public'
            },
            sources: [{
                type: 'wifi_log',
                id: `${batchId}_${recordIndex}`,
                confidence: confidence,
                raw_data: data
            }],
            fused_confidence: confidence,
            provenance: {
                fusion_algorithm: 'single_source',
                processing_time: '0ms',
                conflicts_resolved: 0
            },
            duration: data.session_duration
        });
        
        await event.save();
        return event;
    }

    // Additional helper methods would continue here...
    // For brevity, I'll include the key methods and structure

    // Metrics and monitoring methods
    updateProcessingTime(processedOn, finishedOn) {
        if (processedOn && finishedOn) {
            const processingTime = finishedOn - processedOn;
            this.metrics.averageProcessingTime = 
                (this.metrics.averageProcessingTime + processingTime) / 2;
        }
    }

    updateProcessingRate() {
        // Calculate records processed per minute
        this.metrics.processingRate = this.metrics.processed / 60;
    }

    updateErrorRate() {
        const total = this.metrics.processed + this.metrics.failed;
        this.metrics.errorRate = total > 0 ? this.metrics.failed / total : 0;
    }

    async cleanupOldJobs() {
        try {
            for (const [queueName, queue] of Object.entries(this.queues)) {
                await queue.clean(24 * 60 * 60 * 1000, 'completed'); // Clean completed jobs older than 24 hours
                await queue.clean(7 * 24 * 60 * 60 * 1000, 'failed'); // Clean failed jobs older than 7 days
            }
            logger.info('Old jobs cleaned up successfully');
        } catch (error) {
            logger.error('Error cleaning up old jobs:', error);
        }
    }

    // Downstream processing triggers
    triggerDownstreamProcessing(queueName, job, result) {
        // Trigger entity resolution for new entities
        if (result.entity_id && result.confidence < 0.8) {
            this.queues.entityResolution.add('resolve', {
                entity_id: result.entity_id,
                trigger: queueName,
                data: job.data
            });
        }
    }

    handleJobFailure(queueName, job, error) {
        // Implement exponential backoff retry logic
        const retryDelay = Math.pow(2, job.attemptsMade) * 1000;
        
        if (job.attemptsMade < 3) {
            logger.info(`Retrying job ${job.id} in ${retryDelay}ms`);
        } else {
            logger.error(`Job ${job.id} failed permanently after ${job.attemptsMade} attempts`);
            // Could send to dead letter queue or alert administrators
        }
    }

    // Public methods for external access
    getMetrics() {
        return {
            ...this.metrics,
            queues: Object.fromEntries(
                Object.entries(this.queues).map(([name, queue]) => [
                    name,
                    {
                        waiting: queue.waiting,
                        active: queue.active,
                        completed: queue.completed,
                        failed: queue.failed
                    }
                ])
            )
        };
    }

    async getQueueStats() {
        const stats = {};
        
        for (const [queueName, queue] of Object.entries(this.queues)) {
            stats[queueName] = await queue.getJobCounts();
        }
        
        return stats;
    }

    async pauseQueue(queueName) {
        if (this.queues[queueName]) {
            await this.queues[queueName].pause();
            logger.info(`Queue ${queueName} paused`);
        }
    }

    async resumeQueue(queueName) {
        if (this.queues[queueName]) {
            await this.queues[queueName].resume();
            logger.info(`Queue ${queueName} resumed`);
        }
    }
}

// Create singleton instance
const dataProcessor = new DataProcessor();

module.exports = dataProcessor;