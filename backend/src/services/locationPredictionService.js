const winston = require('winston');
const axios = require('axios');
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
        new winston.transports.File({ filename: 'logs/location_prediction.log' })
    ]
});

class LocationPredictionService {
    constructor() {
        this.config = {
            mlServiceUrl: process.env.ML_SERVICE_URL || 'http://localhost:8001',
            mlServiceApiKey: process.env.ML_SERVICE_API_KEY || 'ml-service-dev-key-123',
            predictionWindowHours: parseInt(process.env.PREDICTION_WINDOW_HOURS) || 24,
            historicalWindowDays: parseInt(process.env.HISTORICAL_WINDOW_DAYS) || 90,
            minTrainingSamples: parseInt(process.env.MIN_TRAINING_SAMPLES) || 100,
            accuracyThreshold: parseFloat(process.env.LOCATION_ACCURACY_THRESHOLD) || 0.85,
            top3AccuracyTarget: parseFloat(process.env.TOP3_ACCURACY_TARGET) || 0.987,
            modelRetrainThreshold: parseFloat(process.env.MODEL_RETRAIN_THRESHOLD) || 0.85,
            cacheTimeout: parseInt(process.env.PREDICTION_CACHE_TIMEOUT) || 600000 // 10 minutes
        };

        // Prediction cache
        this.predictionCache = new Map();
        
        // Feature extractors
        this.featureExtractors = {
            temporal: this.extractTemporalFeatures.bind(this),
            spatial: this.extractSpatialFeatures.bind(this),
            behavioral: this.extractBehavioralFeatures.bind(this),
            social: this.extractSocialFeatures.bind(this),
            contextual: this.extractContextualFeatures.bind(this)
        };

        // Campus locations for prediction
        this.campusLocations = new Map();
        this.initializeCampusLocations();

        // Performance metrics
        this.metrics = {
            totalPredictions: 0,
            accuratePredictions: 0,
            top3AccuratePredictions: 0,
            avgPredictionTime: 0,
            cacheHitRate: 0,
            modelAccuracy: 0,
            lastModelUpdate: null
        };
    }

    initializeCampusLocations() {
        // Initialize campus location mappings
        const locations = [
            { id: 'AC_301', building: 'Academic Complex', room: '301', zone: 'academic', capacity: 50 },
            { id: 'AC_302', building: 'Academic Complex', room: '302', zone: 'academic', capacity: 30 },
            { id: 'LIB_RH', building: 'Library', room: 'Reading Hall', zone: 'academic', capacity: 200 },
            { id: 'LIB_301', building: 'Library', room: '301', zone: 'academic', capacity: 25 },
            { id: 'HA_205', building: 'Hostel A', room: '205', zone: 'residential', capacity: 2 },
            { id: 'HB_301', building: 'Hostel B', room: '301', zone: 'residential', capacity: 2 },
            { id: 'CAF_MAIN', building: 'Cafeteria', room: 'Main Hall', zone: 'social', capacity: 300 },
            { id: 'GYM_MAIN', building: 'Sports Complex', room: 'Main Gym', zone: 'recreational', capacity: 100 },
            { id: 'ADM_101', building: 'Admin Block', room: '101', zone: 'administrative', capacity: 20 }
        ];

        locations.forEach(location => {
            this.campusLocations.set(location.id, location);
        });

        logger.info(`Initialized ${locations.length} campus locations for prediction`);
    }

    /**
     * Predict entity's most likely location
     * @param {string} entityId - Entity identifier
     * @param {Object} options - Prediction options
     */
    async predictLocation(entityId, options = {}) {
        const startTime = Date.now();
        
        try {
            const {
                predictionTime = new Date(),
                includeConfidence = true,
                includeExplanation = true,
                topK = 3,
                useCache = true
            } = options;

            logger.debug(`Predicting location for entity: ${entityId}`, {
                predictionTime,
                topK
            });

            // Check cache first
            const cacheKey = `${entityId}_${predictionTime.getTime()}`;
            if (useCache && this.predictionCache.has(cacheKey)) {
                const cached = this.predictionCache.get(cacheKey);
                if (Date.now() - cached.timestamp < this.config.cacheTimeout) {
                    logger.debug(`Cache hit for location prediction: ${entityId}`);
                    return cached.prediction;
                }
            }

            // Get entity information
            const entity = await Entity.findById(entityId);
            if (!entity) {
                throw new Error(`Entity not found: ${entityId}`);
            }

            // Extract features for prediction
            const features = await this.extractAllFeatures(entityId, predictionTime);
            
            // Make prediction using ML service
            const mlPrediction = await this.callMLService('/predict/location', {
                entity_id: entityId,
                features: features,
                prediction_time: predictionTime.toISOString(),
                top_k: topK
            });

            // Process and enhance prediction
            const prediction = await this.processPrediction(
                entityId, 
                mlPrediction, 
                features, 
                { includeConfidence, includeExplanation, topK }
            );

            // Cache the result
            if (useCache) {
                this.predictionCache.set(cacheKey, {
                    prediction,
                    timestamp: Date.now()
                });
            }

            // Update metrics
            this.updateMetrics(Date.now() - startTime);

            logger.info(`Location prediction completed for entity ${entityId}`, {
                topPrediction: prediction.predictions[0]?.location,
                confidence: prediction.predictions[0]?.probability,
                processingTime: Date.now() - startTime
            });

            return prediction;

        } catch (error) {
            logger.error(`Location prediction failed for entity ${entityId}:`, error);
            
            // Return fallback prediction
            return this.getFallbackPrediction(entityId, options);
        }
    }

    /**
     * Extract all features for location prediction
     */
    async extractAllFeatures(entityId, predictionTime) {
        const features = {};
        
        try {
            // Extract features from all extractors
            for (const [type, extractor] of Object.entries(this.featureExtractors)) {
                try {
                    const typeFeatures = await extractor(entityId, predictionTime);
                    features[type] = typeFeatures;
                } catch (error) {
                    logger.warn(`Failed to extract ${type} features for ${entityId}:`, error.message);
                    features[type] = {};
                }
            }

            logger.debug(`Extracted features for entity ${entityId}`, {
                featureTypes: Object.keys(features),
                totalFeatures: Object.values(features).reduce((sum, f) => sum + Object.keys(f).length, 0)
            });

            return features;

        } catch (error) {
            logger.error(`Feature extraction failed for entity ${entityId}:`, error);
            return this.getDefaultFeatures();
        }
    }

    /**
     * Extract temporal features (time-based patterns)
     */
    async extractTemporalFeatures(entityId, predictionTime) {
        const features = {};
        
        try {
            const hour = predictionTime.getHours();
            const dayOfWeek = predictionTime.getDay();
            const dayOfMonth = predictionTime.getDate();
            const month = predictionTime.getMonth();

            // Basic time features
            features.hour = hour;
            features.day_of_week = dayOfWeek;
            features.day_of_month = dayOfMonth;
            features.month = month;
            features.is_weekend = dayOfWeek === 0 || dayOfWeek === 6 ? 1 : 0;
            features.is_morning = hour >= 6 && hour < 12 ? 1 : 0;
            features.is_afternoon = hour >= 12 && hour < 18 ? 1 : 0;
            features.is_evening = hour >= 18 && hour < 22 ? 1 : 0;
            features.is_night = hour >= 22 || hour < 6 ? 1 : 0;

            // Historical patterns for this time
            const historicalStart = new Date(predictionTime);
            historicalStart.setDate(historicalStart.getDate() - this.config.historicalWindowDays);

            const historicalEvents = await Event.find({
                entity_id: entityId,
                timestamp: {
                    $gte: historicalStart,
                    $lt: predictionTime
                }
            }).lean();

            // Calculate frequency patterns
            const hourlyFrequency = this.calculateHourlyFrequency(historicalEvents);
            const dailyFrequency = this.calculateDailyFrequency(historicalEvents);
            const locationFrequency = this.calculateLocationFrequency(historicalEvents);

            features.usual_hour_frequency = hourlyFrequency[hour] || 0;
            features.usual_day_frequency = dailyFrequency[dayOfWeek] || 0;
            features.total_historical_events = historicalEvents.length;

            // Recent activity patterns (last 7 days)
            const recentStart = new Date(predictionTime);
            recentStart.setDate(recentStart.getDate() - 7);
            
            const recentEvents = historicalEvents.filter(event => 
                new Date(event.timestamp) >= recentStart
            );

            features.recent_activity_count = recentEvents.length;
            features.recent_unique_locations = new Set(
                recentEvents.map(e => `${e.location.building}_${e.location.room}`)
            ).size;

            return features;

        } catch (error) {
            logger.error('Temporal feature extraction failed:', error);
            return {};
        }
    }

    /**
     * Extract spatial features (location-based patterns)
     */
    async extractSpatialFeatures(entityId, predictionTime) {
        const features = {};
        
        try {
            // Get recent location history
            const recentStart = new Date(predictionTime);
            recentStart.setHours(recentStart.getHours() - 24); // Last 24 hours

            const recentEvents = await Event.find({
                entity_id: entityId,
                timestamp: {
                    $gte: recentStart,
                    $lt: predictionTime
                }
            }).sort({ timestamp: -1 }).limit(10).lean();

            if (recentEvents.length > 0) {
                const lastEvent = recentEvents[0];
                features.last_building = this.encodeBuildingName(lastEvent.location.building);
                features.last_zone = this.encodeZone(lastEvent.location.zone);
                features.minutes_since_last_event = Math.floor(
                    (predictionTime - new Date(lastEvent.timestamp)) / (1000 * 60)
                );

                // Movement patterns
                const buildings = recentEvents.map(e => e.location.building);
                features.unique_buildings_24h = new Set(buildings).size;
                features.building_transitions = this.calculateTransitions(buildings);
                
                // Zone preferences
                const zones = recentEvents.map(e => e.location.zone);
                const zoneFreq = this.calculateFrequency(zones);
                features.academic_zone_freq = zoneFreq.academic || 0;
                features.residential_zone_freq = zoneFreq.residential || 0;
                features.social_zone_freq = zoneFreq.social || 0;
                features.recreational_zone_freq = zoneFreq.recreational || 0;
            } else {
                // No recent events
                features.last_building = 0;
                features.last_zone = 0;
                features.minutes_since_last_event = 9999;
                features.unique_buildings_24h = 0;
                features.building_transitions = 0;
                features.academic_zone_freq = 0;
                features.residential_zone_freq = 0;
                features.social_zone_freq = 0;
                features.recreational_zone_freq = 0;
            }

            return features;

        } catch (error) {
            logger.error('Spatial feature extraction failed:', error);
            return {};
        }
    }

    /**
     * Extract behavioral features (activity patterns)
     */
    async extractBehavioralFeatures(entityId, predictionTime) {
        const features = {};
        
        try {
            // Get entity profile
            const entity = await Entity.findById(entityId);
            if (!entity) return {};

            // Entity type features
            features.is_student = entity.profile.entity_type === 'student' ? 1 : 0;
            features.is_faculty = entity.profile.entity_type === 'faculty' ? 1 : 0;
            features.is_staff = entity.profile.entity_type === 'staff' ? 1 : 0;

            // Department encoding
            features.department = this.encodeDepartment(entity.profile.department);

            // Year (for students)
            if (entity.profile.entity_type === 'student' && entity.profile.year) {
                features.student_year = entity.profile.year;
            } else {
                features.student_year = 0;
            }

            // Activity type preferences (last 30 days)
            const activityStart = new Date(predictionTime);
            activityStart.setDate(activityStart.getDate() - 30);

            const activities = await Event.find({
                entity_id: entityId,
                timestamp: {
                    $gte: activityStart,
                    $lt: predictionTime
                }
            }).lean();

            const activityTypes = activities.map(a => a.activity_type);
            const activityFreq = this.calculateFrequency(activityTypes);

            features.access_activity_freq = activityFreq.access || 0;
            features.connectivity_activity_freq = activityFreq.connectivity || 0;
            features.social_activity_freq = activityFreq.social || 0;
            features.service_activity_freq = activityFreq.service || 0;

            // Confidence patterns
            const avgConfidence = activities.length > 0 
                ? activities.reduce((sum, a) => sum + a.fused_confidence, 0) / activities.length 
                : 0;
            features.avg_confidence = avgConfidence;

            return features;

        } catch (error) {
            logger.error('Behavioral feature extraction failed:', error);
            return {};
        }
    }

    /**
     * Extract social features (co-location patterns)
     */
    async extractSocialFeatures(entityId, predictionTime) {
        const features = {};
        
        try {
            // Get co-location events (last 7 days)
            const socialStart = new Date(predictionTime);
            socialStart.setDate(socialStart.getDate() - 7);

            // Find events where multiple entities were at same location/time
            const coLocationEvents = await Event.aggregate([
                {
                    $match: {
                        timestamp: {
                            $gte: socialStart,
                            $lt: predictionTime
                        }
                    }
                },
                {
                    $group: {
                        _id: {
                            building: '$location.building',
                            room: '$location.room',
                            hour: { $hour: '$timestamp' },
                            date: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } }
                        },
                        entities: { $addToSet: '$entity_id' },
                        count: { $sum: 1 }
                    }
                },
                {
                    $match: {
                        count: { $gt: 1 },
                        entities: entityId
                    }
                }
            ]);

            features.co_location_events = coLocationEvents.length;
            
            // Calculate social connectivity
            const connectedEntities = new Set();
            coLocationEvents.forEach(event => {
                event.entities.forEach(id => {
                    if (id !== entityId) {
                        connectedEntities.add(id);
                    }
                });
            });

            features.social_connections = connectedEntities.size;
            features.avg_group_size = coLocationEvents.length > 0 
                ? coLocationEvents.reduce((sum, e) => sum + e.entities.length, 0) / coLocationEvents.length 
                : 1;

            return features;

        } catch (error) {
            logger.error('Social feature extraction failed:', error);
            return {};
        }
    }

    /**
     * Extract contextual features (external factors)
     */
    async extractContextualFeatures(entityId, predictionTime) {
        const features = {};
        
        try {
            // Academic calendar context
            const academicWeek = this.getAcademicWeek(predictionTime);
            features.academic_week = academicWeek;
            features.is_exam_period = this.isExamPeriod(predictionTime) ? 1 : 0;
            features.is_holiday = this.isHoliday(predictionTime) ? 1 : 0;

            // Weather context (simplified)
            features.is_rainy_season = this.isRainySeason(predictionTime) ? 1 : 0;

            // Campus events context
            const campusEvents = await this.getCampusEvents(predictionTime);
            features.campus_events_count = campusEvents.length;
            features.has_major_event = campusEvents.some(e => e.type === 'major') ? 1 : 0;

            return features;

        } catch (error) {
            logger.error('Contextual feature extraction failed:', error);
            return {};
        }
    }

    /**
     * Process ML prediction and add explanations
     */
    async processPrediction(entityId, mlPrediction, features, options) {
        const { includeConfidence, includeExplanation, topK } = options;
        
        const processedPrediction = {
            entity_id: entityId,
            prediction_time: new Date().toISOString(),
            predictions: [],
            model_version: mlPrediction.model_version || 'v1.0.0'
        };

        // Process top-k predictions
        const predictions = mlPrediction.predictions.slice(0, topK);
        
        for (const pred of predictions) {
            const locationInfo = this.campusLocations.get(pred.location_id) || {
                building: 'Unknown',
                room: 'Unknown',
                zone: 'unknown'
            };

            const processedPred = {
                location_id: pred.location_id,
                location: `${locationInfo.building}, ${locationInfo.room}`,
                building: locationInfo.building,
                room: locationInfo.room,
                zone: locationInfo.zone,
                probability: pred.probability
            };

            if (includeConfidence) {
                processedPred.confidence_level = this.getConfidenceLevel(pred.probability);
            }

            if (includeExplanation && pred.explanation) {
                processedPred.explanation = pred.explanation;
                processedPred.supporting_evidence = await this.getSupportingEvidence(
                    entityId, 
                    pred.location_id
                );
            }

            processedPrediction.predictions.push(processedPred);
        }

        return processedPrediction;
    }

    /**
     * Get supporting evidence for prediction
     */
    async getSupportingEvidence(entityId, locationId) {
        try {
            const evidenceStart = new Date();
            evidenceStart.setDate(evidenceStart.getDate() - 30);

            const evidence = await Event.find({
                entity_id: entityId,
                'location.building': { $exists: true },
                timestamp: { $gte: evidenceStart }
            })
            .sort({ timestamp: -1 })
            .limit(10)
            .lean();

            return evidence.map(e => ({
                date: e.timestamp,
                location: `${e.location.building}, ${e.location.room}`,
                activity: e.activity_type,
                confidence: e.fused_confidence
            }));

        } catch (error) {
            logger.error('Error getting supporting evidence:', error);
            return [];
        }
    }

    /**
     * Call ML service for prediction
     */
    async callMLService(endpoint, data) {
        try {
            const response = await axios.post(`${this.config.mlServiceUrl}${endpoint}`, data, {
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': this.config.mlServiceApiKey
                },
                timeout: 10000
            });

            return response.data;

        } catch (error) {
            if (error.response) {
                logger.error(`ML service error ${error.response.status}:`, error.response.data);
            } else {
                logger.error('ML service call failed:', error.message);
            }
            throw error;
        }
    }

    /**
     * Get fallback prediction when ML service fails
     */
    async getFallbackPrediction(entityId, options) {
        logger.warn(`Using fallback prediction for entity ${entityId}`);
        
        try {
            // Simple rule-based fallback
            const entity = await Entity.findById(entityId);
            const recentEvents = await Event.find({
                entity_id: entityId,
                timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
            }).sort({ timestamp: -1 }).limit(5).lean();

            let fallbackLocation = 'Unknown Location';
            let confidence = 0.3;

            if (recentEvents.length > 0) {
                // Most frequent recent location
                const locationCounts = {};
                recentEvents.forEach(event => {
                    const loc = `${event.location.building}, ${event.location.room}`;
                    locationCounts[loc] = (locationCounts[loc] || 0) + 1;
                });

                const mostFrequent = Object.entries(locationCounts)
                    .sort(([,a], [,b]) => b - a)[0];
                
                if (mostFrequent) {
                    fallbackLocation = mostFrequent[0];
                    confidence = Math.min(0.7, mostFrequent[1] / recentEvents.length);
                }
            } else if (entity?.profile?.entity_type === 'student') {
                // Default student locations based on time
                const hour = new Date().getHours();
                if (hour >= 9 && hour <= 17) {
                    fallbackLocation = 'Academic Complex, 301';
                    confidence = 0.4;
                } else {
                    fallbackLocation = entity.profile.hostel || 'Hostel A, 205';
                    confidence = 0.5;
                }
            }

            return {
                entity_id: entityId,
                prediction_time: new Date().toISOString(),
                predictions: [{
                    location: fallbackLocation,
                    probability: confidence,
                    confidence_level: this.getConfidenceLevel(confidence),
                    explanation: 'Fallback prediction based on recent activity patterns'
                }],
                model_version: 'fallback_v1.0',
                is_fallback: true
            };

        } catch (error) {
            logger.error('Fallback prediction failed:', error);
            return {
                entity_id: entityId,
                prediction_time: new Date().toISOString(),
                predictions: [{
                    location: 'Unknown Location',
                    probability: 0.1,
                    confidence_level: 'very_low',
                    explanation: 'No data available for prediction'
                }],
                model_version: 'fallback_v1.0',
                is_fallback: true,
                error: true
            };
        }
    }

    // Utility methods
    calculateHourlyFrequency(events) {
        const frequency = {};
        events.forEach(event => {
            const hour = new Date(event.timestamp).getHours();
            frequency[hour] = (frequency[hour] || 0) + 1;
        });
        return frequency;
    }

    calculateDailyFrequency(events) {
        const frequency = {};
        events.forEach(event => {
            const day = new Date(event.timestamp).getDay();
            frequency[day] = (frequency[day] || 0) + 1;
        });
        return frequency;
    }

    calculateLocationFrequency(events) {
        const frequency = {};
        events.forEach(event => {
            const location = `${event.location.building}_${event.location.room}`;
            frequency[location] = (frequency[location] || 0) + 1;
        });
        return frequency;
    }

    calculateFrequency(items) {
        const frequency = {};
        items.forEach(item => {
            frequency[item] = (frequency[item] || 0) + 1;
        });
        return frequency;
    }

    calculateTransitions(sequence) {
        let transitions = 0;
        for (let i = 1; i < sequence.length; i++) {
            if (sequence[i] !== sequence[i-1]) {
                transitions++;
            }
        }
        return transitions;
    }

    encodeBuildingName(building) {
        const buildingMap = {
            'Academic Complex': 1,
            'Library': 2,
            'Hostel A': 3,
            'Hostel B': 4,
            'Hostel C': 5,
            'Cafeteria': 6,
            'Sports Complex': 7,
            'Admin Block': 8
        };
        return buildingMap[building] || 0;
    }

    encodeZone(zone) {
        const zoneMap = {
            'academic': 1,
            'residential': 2,
            'social': 3,
            'recreational': 4,
            'administrative': 5
        };
        return zoneMap[zone] || 0;
    }

    encodeDepartment(department) {
        const deptMap = {
            'Computer Science': 1,
            'Electrical Engineering': 2,
            'Mechanical Engineering': 3,
            'Civil Engineering': 4,
            'Mathematics': 5,
            'Physics': 6,
            'Chemistry': 7,
            'Biology': 8
        };
        return deptMap[department] || 0;
    }

    getConfidenceLevel(probability) {
        if (probability >= 0.9) return 'very_high';
        if (probability >= 0.7) return 'high';
        if (probability >= 0.5) return 'medium';
        if (probability >= 0.3) return 'low';
        return 'very_low';
    }

    getAcademicWeek(date) {
        // Simplified academic week calculation
        const startOfYear = new Date(date.getFullYear(), 0, 1);
        const weekNumber = Math.ceil(((date - startOfYear) / 86400000 + startOfYear.getDay() + 1) / 7);
        return weekNumber;
    }

    isExamPeriod(date) {
        // Simplified exam period detection
        const month = date.getMonth();
        return month === 4 || month === 11; // May and December
    }

    isHoliday(date) {
        // Simplified holiday detection
        const day = date.getDay();
        return day === 0; // Sunday
    }

    isRainySeason(date) {
        // Simplified rainy season for India
        const month = date.getMonth();
        return month >= 5 && month <= 9; // June to October
    }

    async getCampusEvents(date) {
        // Simplified campus events
        return [];
    }

    getDefaultFeatures() {
        return {
            temporal: {},
            spatial: {},
            behavioral: {},
            social: {},
            contextual: {}
        };
    }

    updateMetrics(processingTime) {
        this.metrics.totalPredictions++;
        this.metrics.avgPredictionTime = (this.metrics.avgPredictionTime + processingTime) / 2;
    }

    getMetrics() {
        return {
            ...this.metrics,
            cacheSize: this.predictionCache.size
        };
    }

    clearCache() {
        this.predictionCache.clear();
        logger.info('Location prediction cache cleared');
    }
}

module.exports = LocationPredictionService;