const winston = require('winston');
const axios = require('axios');
const performanceMonitor = require('./performanceMonitor');

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
        new winston.transports.File({ filename: 'logs/ml_disambiguation.log' })
    ]
});

class MLDisambiguationService {
    constructor() {
        this.mlServiceUrl = process.env.ML_SERVICE_URL || 'http://localhost:8001';
        this.apiKey = process.env.ML_SERVICE_API_KEY;
        this.modelVersion = 'v1.0.0';
        this.confidenceThreshold = parseFloat(process.env.CONFIDENCE_THRESHOLD) || 0.7;
        
        // Model configuration
        this.modelConfig = {
            xgboost: {
                n_estimators: 100,
                max_depth: 6,
                learning_rate: 0.1,
                subsample: 0.8,
                colsample_bytree: 0.8
            },
            features: [
                'name_similarity',
                'email_similarity', 
                'phone_similarity',
                'face_similarity',
                'temporal_proximity',
                'spatial_proximity',
                'common_identifiers',
                'department_match',
                'entity_type_match'
            ]
        };
        
        // Performance metrics
        this.metrics = {
            totalPredictions: 0,
            accuratePredictions: 0,
            avgPredictionTime: 0,
            modelAccuracy: 0,
            lastModelUpdate: null
        };
        
        // Cache for model predictions
        this.predictionCache = new Map();
        this.cacheSize = 1000;
    }

    /**
     * Predict if two entities are matches using ML model
     */
    async predictMatch(entity1, entity2, similarityScores) {
        const startTime = Date.now();
        
        try {
            // Generate cache key
            const cacheKey = this.generateCacheKey(entity1._id, entity2._id);
            
            // Check cache first
            if (this.predictionCache.has(cacheKey)) {
                const cached = this.predictionCache.get(cacheKey);
                logger.debug(`Cache hit for prediction ${cacheKey}`);
                return cached;
            }
            
            // Extract features for ML model
            const features = await this.extractFeatures(entity1, entity2, similarityScores);
            
            // Make prediction via ML service
            const prediction = await this.callMLService('/predict/match', {
                features: features,
                model_version: this.modelVersion
            });
            
            // Process prediction result
            const result = {
                isMatch: prediction.probability >= this.confidenceThreshold,
                confidence: prediction.probability,
                features: features,
                modelVersion: this.modelVersion,
                processingTime: Date.now() - startTime
            };
            
            // Cache the result
            this.cacheResult(cacheKey, result);
            
            // Update metrics
            this.updateMetrics(result.processingTime);
            
            logger.debug(`ML prediction completed for entities ${entity1._id} and ${entity2._id}`, {
                isMatch: result.isMatch,
                confidence: result.confidence,
                processingTime: result.processingTime
            });
            
            return result;
            
        } catch (error) {
            logger.error('ML prediction failed:', error);
            
            // Fallback to rule-based prediction
            return this.fallbackPrediction(entity1, entity2, similarityScores);
        }
    }

    /**
     * Extract features for ML model
     */
    async extractFeatures(entity1, entity2, similarityScores) {
        const features = {};
        
        try {
            // Similarity features
            features.name_similarity = similarityScores.name || 0;
            features.email_similarity = similarityScores.email || 0;
            features.phone_similarity = similarityScores.phone || 0;
            features.face_similarity = similarityScores.face || 0;
            
            // Temporal proximity (if both entities have recent events)
            features.temporal_proximity = await this.calculateTemporalProximity(entity1, entity2);
            
            // Spatial proximity (if both entities have location data)
            features.spatial_proximity = await this.calculateSpatialProximity(entity1, entity2);
            
            // Common identifiers count
            features.common_identifiers = this.countCommonIdentifiers(entity1, entity2);
            
            // Department match
            features.department_match = entity1.profile?.department === entity2.profile?.department ? 1 : 0;
            
            // Entity type match
            features.entity_type_match = entity1.profile?.entity_type === entity2.profile?.entity_type ? 1 : 0;
            
            // Additional derived features
            features.identifier_overlap_ratio = this.calculateIdentifierOverlap(entity1, entity2);
            features.name_token_overlap = this.calculateNameTokenOverlap(entity1, entity2);
            features.confidence_product = (entity1.metadata?.confidence || 1) * (entity2.metadata?.confidence || 1);
            
            // Normalize features to [0, 1] range
            return this.normalizeFeatures(features);
            
        } catch (error) {
            logger.error('Feature extraction failed:', error);
            return this.getDefaultFeatures();
        }
    }

    /**
     * Calculate temporal proximity between entities
     */
    async calculateTemporalProximity(entity1, entity2) {
        try {
            // This would query recent events for both entities
            // For now, return a default value
            return 0.5;
        } catch (error) {
            logger.error('Temporal proximity calculation failed:', error);
            return 0;
        }
    }

    /**
     * Calculate spatial proximity between entities
     */
    async calculateSpatialProximity(entity1, entity2) {
        try {
            // This would analyze location overlap from recent events
            // For now, return a default value based on department
            if (entity1.profile?.department === entity2.profile?.department) {
                return 0.8;
            }
            return 0.2;
        } catch (error) {
            logger.error('Spatial proximity calculation failed:', error);
            return 0;
        }
    }

    /**
     * Count common identifiers between entities
     */
    countCommonIdentifiers(entity1, entity2) {
        let commonCount = 0;
        
        const id1 = entity1.identifiers || {};
        const id2 = entity2.identifiers || {};
        
        // Check each identifier type
        if (id1.email && id2.email && id1.email === id2.email) commonCount++;
        if (id1.phone && id2.phone && id1.phone === id2.phone) commonCount++;
        if (id1.card_id && id2.card_id && id1.card_id === id2.card_id) commonCount++;
        if (id1.student_id && id2.student_id && id1.student_id === id2.student_id) commonCount++;
        if (id1.employee_id && id2.employee_id && id1.employee_id === id2.employee_id) commonCount++;
        
        // Check device hash overlap
        if (id1.device_hashes && id2.device_hashes) {
            const overlap = id1.device_hashes.filter(hash => id2.device_hashes.includes(hash));
            commonCount += overlap.length;
        }
        
        return commonCount;
    }

    /**
     * Calculate identifier overlap ratio
     */
    calculateIdentifierOverlap(entity1, entity2) {
        const id1 = entity1.identifiers || {};
        const id2 = entity2.identifiers || {};
        
        const totalIdentifiers1 = Object.values(id1).filter(val => val !== null && val !== undefined).length;
        const totalIdentifiers2 = Object.values(id2).filter(val => val !== null && val !== undefined).length;
        
        if (totalIdentifiers1 === 0 || totalIdentifiers2 === 0) return 0;
        
        const commonCount = this.countCommonIdentifiers(entity1, entity2);
        return commonCount / Math.max(totalIdentifiers1, totalIdentifiers2);
    }

    /**
     * Calculate name token overlap
     */
    calculateNameTokenOverlap(entity1, entity2) {
        const name1 = entity1.profile?.name?.toLowerCase().split(' ') || [];
        const name2 = entity2.profile?.name?.toLowerCase().split(' ') || [];
        
        if (name1.length === 0 || name2.length === 0) return 0;
        
        const overlap = name1.filter(token => name2.includes(token));
        return overlap.length / Math.max(name1.length, name2.length);
    }

    /**
     * Normalize features to [0, 1] range
     */
    normalizeFeatures(features) {
        const normalized = {};
        
        for (const [key, value] of Object.entries(features)) {
            // Most features are already normalized, but ensure they're in [0, 1]
            normalized[key] = Math.max(0, Math.min(1, value));
        }
        
        return normalized;
    }

    /**
     * Get default features when extraction fails
     */
    getDefaultFeatures() {
        const defaultFeatures = {};
        
        for (const feature of this.modelConfig.features) {
            defaultFeatures[feature] = 0;
        }
        
        return defaultFeatures;
    }

    /**
     * Call ML service API
     */
    async callMLService(endpoint, data) {
        try {
            const response = await axios.post(`${this.mlServiceUrl}${endpoint}`, data, {
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': this.apiKey
                },
                timeout: 5000
            });
            
            return response.data;
            
        } catch (error) {
            if (error.response) {
                logger.error(`ML service error ${error.response.status}:`, error.response.data);
            } else if (error.request) {
                logger.error('ML service not reachable:', error.message);
            } else {
                logger.error('ML service request failed:', error.message);
            }
            throw error;
        }
    }

    /**
     * Fallback prediction when ML service is unavailable
     */
    fallbackPrediction(entity1, entity2, similarityScores) {
        logger.warn('Using fallback rule-based prediction');
        
        // Simple rule-based logic
        const avgSimilarity = Object.values(similarityScores).reduce((sum, score) => sum + score, 0) / Object.keys(similarityScores).length;
        const commonIdentifiers = this.countCommonIdentifiers(entity1, entity2);
        
        // High confidence if strong identifier match or high similarity
        const isMatch = commonIdentifiers > 0 || avgSimilarity > 0.8;
        const confidence = Math.max(avgSimilarity, commonIdentifiers > 0 ? 0.9 : 0);
        
        return {
            isMatch,
            confidence,
            features: this.extractFeatures(entity1, entity2, similarityScores),
            modelVersion: 'fallback_v1.0',
            processingTime: 0
        };
    }

    /**
     * Batch prediction for multiple entity pairs
     */
    async batchPredict(entityPairs) {
        const startTime = Date.now();
        
        try {
            // Prepare batch data
            const batchData = entityPairs.map(pair => ({
                entity1_id: pair.entity1._id,
                entity2_id: pair.entity2._id,
                features: this.extractFeatures(pair.entity1, pair.entity2, pair.similarityScores)
            }));
            
            // Call ML service for batch prediction
            const batchResponse = await this.callMLService('/predict/batch', {
                pairs: batchData,
                model_version: this.modelVersion
            });
            
            // Process batch results
            const results = batchResponse.predictions.map((prediction, index) => ({
                entity1_id: entityPairs[index].entity1._id,
                entity2_id: entityPairs[index].entity2._id,
                isMatch: prediction.probability >= this.confidenceThreshold,
                confidence: prediction.probability,
                features: batchData[index].features,
                modelVersion: this.modelVersion
            }));
            
            const processingTime = Date.now() - startTime;
            logger.info(`Batch prediction completed for ${entityPairs.length} pairs in ${processingTime}ms`);
            
            return results;
            
        } catch (error) {
            logger.error('Batch prediction failed:', error);
            
            // Fallback to individual predictions
            const results = [];
            for (const pair of entityPairs) {
                const result = await this.predictMatch(pair.entity1, pair.entity2, pair.similarityScores);
                results.push({
                    entity1_id: pair.entity1._id,
                    entity2_id: pair.entity2._id,
                    ...result
                });
            }
            
            return results;
        }
    }

    /**
     * Train or retrain the ML model
     */
    async trainModel(trainingData) {
        try {
            logger.info(`Starting model training with ${trainingData.length} samples`);
            
            const response = await this.callMLService('/train', {
                training_data: trainingData,
                model_config: this.modelConfig,
                model_version: this.modelVersion
            });
            
            this.metrics.lastModelUpdate = new Date();
            this.metrics.modelAccuracy = response.accuracy;
            
            logger.info(`Model training completed. Accuracy: ${response.accuracy}`);
            
            return response;
            
        } catch (error) {
            logger.error('Model training failed:', error);
            throw error;
        }
    }

    /**
     * Evaluate model performance
     */
    async evaluateModel(testData) {
        try {
            const response = await this.callMLService('/evaluate', {
                test_data: testData,
                model_version: this.modelVersion
            });
            
            logger.info('Model evaluation completed', response.metrics);
            
            return response.metrics;
            
        } catch (error) {
            logger.error('Model evaluation failed:', error);
            throw error;
        }
    }

    /**
     * Generate cache key for entity pair
     */
    generateCacheKey(entityId1, entityId2) {
        // Ensure consistent ordering
        const [id1, id2] = [entityId1, entityId2].sort();
        return `${id1}_${id2}`;
    }

    /**
     * Cache prediction result
     */
    cacheResult(key, result) {
        // Implement LRU cache
        if (this.predictionCache.size >= this.cacheSize) {
            const firstKey = this.predictionCache.keys().next().value;
            this.predictionCache.delete(firstKey);
        }
        
        this.predictionCache.set(key, result);
    }

    /**
     * Update performance metrics
     */
    updateMetrics(processingTime) {
        this.metrics.totalPredictions++;
        this.metrics.avgPredictionTime = (this.metrics.avgPredictionTime + processingTime) / 2;
    }

    /**
     * Get performance metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            cacheSize: this.predictionCache.size,
            cacheHitRate: this.calculateCacheHitRate()
        };
    }

    /**
     * Calculate cache hit rate
     */
    calculateCacheHitRate() {
        // This would need to be tracked separately in a real implementation
        return 0.75; // Placeholder
    }

    /**
     * Clear prediction cache
     */
    clearCache() {
        this.predictionCache.clear();
        logger.info('Prediction cache cleared');
    }

    /**
     * Health check for ML service
     */
    async healthCheck() {
        try {
            const response = await axios.get(`${this.mlServiceUrl}/health`, {
                headers: { 'X-API-Key': this.apiKey },
                timeout: 3000
            });
            
            return {
                status: 'healthy',
                mlService: response.data,
                modelVersion: this.modelVersion
            };
            
        } catch (error) {
            return {
                status: 'unhealthy',
                error: error.message,
                modelVersion: this.modelVersion
            };
        }
    }
}

module.exports = MLDisambiguationService;