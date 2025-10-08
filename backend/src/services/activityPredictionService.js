const EventEmitter = require('events');
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
        new winston.transports.File({ filename: 'logs/activity_prediction.log' })
    ]
});

/**
 * Activity Sequence Prediction Service
 * Implements LSTM and Markov Chain models for predicting next activities
 */
class ActivityPredictionService extends EventEmitter {
    constructor() {
        super();
        this.config = {
            mlServiceUrl: process.env.ML_SERVICE_URL || 'http://localhost:8001',
            mlServiceApiKey: process.env.ML_SERVICE_API_KEY || 'ml-service-dev-key-123',
            sequenceLength: 10, // Number of previous activities to consider
            predictionHorizon: 24, // Hours to predict ahead
            accuracyTarget: 0.918, // 91.8% accuracy target
            timeEstimationMAE: 12.4, // 12.4 minutes MAE target
            minSequenceLength: 3, // Minimum sequence for prediction
            cacheTimeout: 300000 // 5 minutes
        };

        // Activity types and their typical durations (in minutes)
        this.activityTypes = {
            'access': { duration: 30, transitions: ['connectivity', 'social', 'service'] },
            'connectivity': { duration: 120, transitions: ['access', 'social', 'academic'] },
            'social': { duration: 60, transitions: ['access', 'connectivity', 'service'] },
            'service': { duration: 45, transitions: ['access', 'connectivity'] },
            'academic': { duration: 90, transitions: ['access', 'social', 'connectivity'] },
            'maintenance': { duration: 60, transitions: ['access'] }
        };

        // Markov transition matrices (will be learned from data)
        this.transitionMatrices = new Map();
        
        // Prediction cache
        this.predictionCache = new Map();
        
        // Performance metrics
        this.metrics = {
            totalPredictions: 0,
            accuratePredictions: 0,
            avgTimeError: 0,
            modelAccuracy: 0,
            lastModelUpdate: null
        };
    } 
   /**
     * Predict next activity for an entity
     */
    async predictNextActivity(entityId, options = {}) {
        const startTime = Date.now();
        
        try {
            const {
                predictionTime = new Date(),
                includeTimeEstimate = true,
                includeConfidence = true,
                includeExplanation = true,
                topK = 3,
                useCache = true
            } = options;

            logger.debug(`Predicting next activity for entity: ${entityId}`);

            // Check cache
            const cacheKey = `${entityId}_${predictionTime.getTime()}`;
            if (useCache && this.predictionCache.has(cacheKey)) {
                const cached = this.predictionCache.get(cacheKey);
                if (Date.now() - cached.timestamp < this.config.cacheTimeout) {
                    return cached.prediction;
                }
            }

            // Get recent activity sequence
            const sequence = await this.getActivitySequence(entityId, predictionTime);
            
            if (sequence.length < this.config.minSequenceLength) {
                return this.getFallbackPrediction(entityId, 'insufficient_data');
            }

            // Extract features for prediction
            const features = await this.extractSequenceFeatures(entityId, sequence, predictionTime);
            
            // Try ML-based prediction first
            let prediction;
            try {
                prediction = await this.predictWithLSTM(entityId, sequence, features, topK);
            } catch (error) {
                logger.warn('LSTM prediction failed, falling back to Markov Chain:', error.message);
                prediction = await this.predictWithMarkovChain(entityId, sequence, features, topK);
            }

            // Add time estimates if requested
            if (includeTimeEstimate) {
                prediction = await this.addTimeEstimates(prediction, entityId, predictionTime);
            }

            // Add explanations if requested
            if (includeExplanation) {
                prediction = await this.addExplanations(prediction, sequence, entityId);
            }

            // Cache result
            if (useCache) {
                this.predictionCache.set(cacheKey, {
                    prediction,
                    timestamp: Date.now()
                });
            }

            // Update metrics
            this.updateMetrics(Date.now() - startTime);

            logger.info(`Activity prediction completed for entity ${entityId}`, {
                topPrediction: prediction.predictions[0]?.activity,
                confidence: prediction.predictions[0]?.probability,
                processingTime: Date.now() - startTime
            });

            return prediction;

        } catch (error) {
            logger.error(`Activity prediction failed for entity ${entityId}:`, error);
            return this.getFallbackPrediction(entityId, 'error');
        }
    }

    /**
     * Get recent activity sequence for an entity
     */
    async getActivitySequence(entityId, predictionTime) {
        try {
            const sequenceStart = new Date(predictionTime);
            sequenceStart.setDate(sequenceStart.getDate() - 7); // Last 7 days

            const events = await Event.find({
                entity_id: entityId,
                timestamp: {
                    $gte: sequenceStart,
                    $lt: predictionTime
                }
            })
            .sort({ timestamp: -1 })
            .limit(this.config.sequenceLength)
            .lean();

            return events.map(event => ({
                activity_type: event.activity_type,
                activity_subtype: event.activity_subtype,
                timestamp: event.timestamp,
                location: event.location,
                duration: event.duration,
                confidence: event.fused_confidence
            })).reverse(); // Chronological order

        } catch (error) {
            logger.error('Error getting activity sequence:', error);
            return [];
        }
    }    /**

     * Extract features from activity sequence
     */
    async extractSequenceFeatures(entityId, sequence, predictionTime) {
        const features = {};
        
        try {
            // Sequence-based features
            features.sequence_length = sequence.length;
            features.last_activity = sequence[sequence.length - 1]?.activity_type || 'unknown';
            features.last_activity_duration = sequence[sequence.length - 1]?.duration || 0;
            
            // Time since last activity
            const lastTimestamp = sequence[sequence.length - 1]?.timestamp;
            if (lastTimestamp) {
                features.minutes_since_last = Math.floor(
                    (predictionTime - new Date(lastTimestamp)) / (1000 * 60)
                );
            } else {
                features.minutes_since_last = 9999;
            }

            // Activity frequency patterns
            const activityCounts = {};
            sequence.forEach(item => {
                const activity = item.activity_type;
                activityCounts[activity] = (activityCounts[activity] || 0) + 1;
            });

            features.access_frequency = activityCounts.access || 0;
            features.connectivity_frequency = activityCounts.connectivity || 0;
            features.social_frequency = activityCounts.social || 0;
            features.service_frequency = activityCounts.service || 0;
            features.academic_frequency = activityCounts.academic || 0;

            // Transition patterns
            const transitions = this.extractTransitions(sequence);
            features.unique_transitions = transitions.length;
            features.repetitive_pattern = this.detectRepetitivePattern(sequence);

            // Temporal context
            const hour = predictionTime.getHours();
            const dayOfWeek = predictionTime.getDay();
            
            features.hour = hour;
            features.day_of_week = dayOfWeek;
            features.is_weekend = dayOfWeek === 0 || dayOfWeek === 6 ? 1 : 0;
            features.is_work_hours = hour >= 9 && hour <= 17 ? 1 : 0;

            // Entity context
            const entity = await Entity.findById(entityId);
            if (entity) {
                features.entity_type = this.encodeEntityType(entity.profile.entity_type);
                features.department = this.encodeDepartment(entity.profile.department);
            }

            // Location context
            const lastLocation = sequence[sequence.length - 1]?.location;
            if (lastLocation) {
                features.last_zone = this.encodeZone(lastLocation.zone);
                features.last_building = this.encodeBuildingName(lastLocation.building);
            }

            return features;

        } catch (error) {
            logger.error('Feature extraction failed:', error);
            return {};
        }
    }

    /**
     * Predict using LSTM model via ML service
     */
    async predictWithLSTM(entityId, sequence, features, topK) {
        try {
            const response = await axios.post(`${this.config.mlServiceUrl}/predict/activity`, {
                entity_id: entityId,
                sequence: sequence,
                features: features,
                model_type: 'lstm',
                top_k: topK
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': this.config.mlServiceApiKey
                },
                timeout: 10000
            });

            return this.formatPredictionResponse(response.data, 'lstm');

        } catch (error) {
            logger.error('LSTM prediction failed:', error);
            throw error;
        }
    }

    /**
     * Predict using Markov Chain model
     */
    async predictWithMarkovChain(entityId, sequence, features, topK) {
        try {
            // Build or get transition matrix for this entity
            const transitionMatrix = await this.getTransitionMatrix(entityId);
            
            // Get last few activities for context
            const contextLength = Math.min(3, sequence.length);
            const context = sequence.slice(-contextLength).map(s => s.activity_type);
            
            // Calculate transition probabilities
            const predictions = this.calculateMarkovPredictions(context, transitionMatrix, topK);
            
            return {
                entity_id: entityId,
                prediction_time: new Date().toISOString(),
                model_type: 'markov_chain',
                predictions: predictions.map(pred => ({
                    activity: pred.activity,
                    probability: pred.probability,
                    confidence_level: this.getConfidenceLevel(pred.probability)
                }))
            };

        } catch (error) {
            logger.error('Markov Chain prediction failed:', error);
            throw error;
        }
    }    /**
     * Get or build transition matrix for entity
     */
    async getTransitionMatrix(entityId) {
        if (this.transitionMatrices.has(entityId)) {
            return this.transitionMatrices.get(entityId);
        }

        // Build transition matrix from historical data
        const historicalStart = new Date();
        historicalStart.setDate(historicalStart.getDate() - 90); // Last 90 days

        const events = await Event.find({
            entity_id: entityId,
            timestamp: { $gte: historicalStart }
        }).sort({ timestamp: 1 }).lean();

        const matrix = this.buildTransitionMatrix(events);
        this.transitionMatrices.set(entityId, matrix);
        
        return matrix;
    }

    /**
     * Build transition matrix from events
     */
    buildTransitionMatrix(events) {
        const matrix = {};
        const activities = Object.keys(this.activityTypes);
        
        // Initialize matrix
        activities.forEach(from => {
            matrix[from] = {};
            activities.forEach(to => {
                matrix[from][to] = 0;
            });
        });

        // Count transitions
        for (let i = 0; i < events.length - 1; i++) {
            const fromActivity = events[i].activity_type;
            const toActivity = events[i + 1].activity_type;
            
            if (matrix[fromActivity] && matrix[fromActivity][toActivity] !== undefined) {
                matrix[fromActivity][toActivity]++;
            }
        }

        // Convert counts to probabilities
        activities.forEach(from => {
            const total = Object.values(matrix[from]).reduce((sum, count) => sum + count, 0);
            if (total > 0) {
                activities.forEach(to => {
                    matrix[from][to] = matrix[from][to] / total;
                });
            } else {
                // Uniform distribution if no data
                activities.forEach(to => {
                    matrix[from][to] = 1 / activities.length;
                });
            }
        });

        return matrix;
    }

    /**
     * Calculate Markov predictions
     */
    calculateMarkovPredictions(context, transitionMatrix, topK) {
        const lastActivity = context[context.length - 1];
        
        if (!transitionMatrix[lastActivity]) {
            // Fallback to uniform distribution
            const activities = Object.keys(this.activityTypes);
            return activities.slice(0, topK).map(activity => ({
                activity,
                probability: 1 / activities.length
            }));
        }

        // Get probabilities for next activity
        const probabilities = Object.entries(transitionMatrix[lastActivity])
            .map(([activity, prob]) => ({ activity, probability: prob }))
            .sort((a, b) => b.probability - a.probability)
            .slice(0, topK);

        return probabilities;
    }

    /**
     * Add time estimates to predictions
     */
    async addTimeEstimates(prediction, entityId, predictionTime) {
        try {
            for (const pred of prediction.predictions) {
                const activityInfo = this.activityTypes[pred.activity];
                
                if (activityInfo) {
                    // Base duration from activity type
                    let estimatedDuration = activityInfo.duration;
                    
                    // Adjust based on historical patterns
                    const historicalDuration = await this.getHistoricalDuration(entityId, pred.activity);
                    if (historicalDuration > 0) {
                        estimatedDuration = Math.round((estimatedDuration + historicalDuration) / 2);
                    }
                    
                    // Estimate start time (when activity will begin)
                    const estimatedStartTime = new Date(predictionTime);
                    estimatedStartTime.setMinutes(estimatedStartTime.getMinutes() + 5); // 5 min delay
                    
                    pred.time_estimate = {
                        estimated_start_time: estimatedStartTime.toISOString(),
                        estimated_duration_minutes: estimatedDuration,
                        estimated_end_time: new Date(estimatedStartTime.getTime() + estimatedDuration * 60000).toISOString()
                    };
                }
            }

            return prediction;

        } catch (error) {
            logger.error('Error adding time estimates:', error);
            return prediction;
        }
    }

    /**
     * Get historical average duration for activity
     */
    async getHistoricalDuration(entityId, activityType) {
        try {
            const historicalStart = new Date();
            historicalStart.setDate(historicalStart.getDate() - 30);

            const events = await Event.find({
                entity_id: entityId,
                activity_type: activityType,
                duration: { $exists: true, $gt: 0 },
                timestamp: { $gte: historicalStart }
            }).lean();

            if (events.length === 0) return 0;

            const totalDuration = events.reduce((sum, event) => sum + event.duration, 0);
            return Math.round(totalDuration / events.length / 60); // Convert to minutes

        } catch (error) {
            logger.error('Error getting historical duration:', error);
            return 0;
        }
    } 
   /**
     * Add explanations to predictions
     */
    async addExplanations(prediction, sequence, entityId) {
        try {
            for (const pred of prediction.predictions) {
                const explanations = [];
                
                // Pattern-based explanations
                const lastActivity = sequence[sequence.length - 1]?.activity_type;
                if (lastActivity) {
                    const transitionInfo = this.activityTypes[lastActivity];
                    if (transitionInfo && transitionInfo.transitions.includes(pred.activity)) {
                        explanations.push(`Commonly follows ${lastActivity} activity`);
                    }
                }

                // Time-based explanations
                const hour = new Date().getHours();
                if (pred.activity === 'social' && hour >= 12 && hour <= 14) {
                    explanations.push('Lunch time social activity pattern');
                } else if (pred.activity === 'academic' && hour >= 9 && hour <= 17) {
                    explanations.push('Academic hours activity pattern');
                } else if (pred.activity === 'access' && (hour <= 9 || hour >= 17)) {
                    explanations.push('Typical commute time pattern');
                }

                // Frequency-based explanations
                const activityCount = sequence.filter(s => s.activity_type === pred.activity).length;
                if (activityCount > 0) {
                    explanations.push(`Performed ${activityCount} times in recent history`);
                }

                pred.explanation = explanations.join('; ') || 'Based on general activity patterns';
            }

            return prediction;

        } catch (error) {
            logger.error('Error adding explanations:', error);
            return prediction;
        }
    }

    /**
     * Format prediction response
     */
    formatPredictionResponse(mlResponse, modelType) {
        return {
            entity_id: mlResponse.entity_id,
            prediction_time: new Date().toISOString(),
            model_type: modelType,
            model_version: mlResponse.model_version || 'v1.0.0',
            predictions: mlResponse.predictions.map(pred => ({
                activity: pred.activity,
                probability: pred.probability,
                confidence_level: this.getConfidenceLevel(pred.probability)
            }))
        };
    }

    /**
     * Get fallback prediction
     */
    getFallbackPrediction(entityId, reason) {
        logger.warn(`Using fallback prediction for entity ${entityId}: ${reason}`);
        
        // Simple time-based fallback
        const hour = new Date().getHours();
        let fallbackActivity = 'access';
        let confidence = 0.3;

        if (hour >= 9 && hour <= 17) {
            fallbackActivity = 'academic';
            confidence = 0.4;
        } else if (hour >= 12 && hour <= 14) {
            fallbackActivity = 'social';
            confidence = 0.5;
        } else if (hour >= 18 && hour <= 22) {
            fallbackActivity = 'social';
            confidence = 0.4;
        }

        return {
            entity_id: entityId,
            prediction_time: new Date().toISOString(),
            model_type: 'fallback',
            predictions: [{
                activity: fallbackActivity,
                probability: confidence,
                confidence_level: this.getConfidenceLevel(confidence),
                explanation: `Fallback prediction based on time of day (${reason})`
            }],
            is_fallback: true
        };
    }

    // Utility methods
    extractTransitions(sequence) {
        const transitions = [];
        for (let i = 0; i < sequence.length - 1; i++) {
            transitions.push({
                from: sequence[i].activity_type,
                to: sequence[i + 1].activity_type
            });
        }
        return transitions;
    }

    detectRepetitivePattern(sequence) {
        if (sequence.length < 4) return 0;
        
        const activities = sequence.map(s => s.activity_type);
        let repetitions = 0;
        
        for (let i = 0; i < activities.length - 1; i++) {
            if (activities[i] === activities[i + 1]) {
                repetitions++;
            }
        }
        
        return repetitions / (activities.length - 1);
    }

    encodeEntityType(entityType) {
        const typeMap = { 'student': 1, 'faculty': 2, 'staff': 3, 'visitor': 4 };
        return typeMap[entityType] || 0;
    }

    encodeDepartment(department) {
        const deptMap = {
            'Computer Science': 1, 'Electrical Engineering': 2,
            'Mechanical Engineering': 3, 'Civil Engineering': 4,
            'Mathematics': 5, 'Physics': 6, 'Chemistry': 7, 'Biology': 8
        };
        return deptMap[department] || 0;
    }

    encodeZone(zone) {
        const zoneMap = {
            'academic': 1, 'residential': 2, 'social': 3,
            'recreational': 4, 'administrative': 5
        };
        return zoneMap[zone] || 0;
    }

    encodeBuildingName(building) {
        const buildingMap = {
            'Academic Complex': 1, 'Library': 2, 'Hostel A': 3,
            'Hostel B': 4, 'Cafeteria': 5, 'Sports Complex': 6, 'Admin Block': 7
        };
        return buildingMap[building] || 0;
    }

    getConfidenceLevel(probability) {
        if (probability >= 0.9) return 'very_high';
        if (probability >= 0.7) return 'high';
        if (probability >= 0.5) return 'medium';
        if (probability >= 0.3) return 'low';
        return 'very_low';
    }

    updateMetrics(processingTime) {
        this.metrics.totalPredictions++;
        // Additional metrics would be updated here
    }

    getMetrics() {
        return {
            ...this.metrics,
            cacheSize: this.predictionCache.size,
            transitionMatricesCount: this.transitionMatrices.size
        };
    }

    clearCache() {
        this.predictionCache.clear();
        this.transitionMatrices.clear();
        logger.info('Activity prediction cache cleared');
    }
}

module.exports = ActivityPredictionService;