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
        new winston.transports.File({ filename: 'logs/model_drift.log' })
    ]
});

/**
 * Model Drift Detection Service
 * Monitors ML model performance and triggers retraining when accuracy drops
 */
class ModelDriftService {
    constructor() {
        this.config = {
            mlServiceUrl: process.env.ML_SERVICE_URL || 'http://localhost:8001',
            mlServiceApiKey: process.env.ML_SERVICE_API_KEY || 'ml-service-dev-key-123',
            accuracyThreshold: parseFloat(process.env.MODEL_RETRAIN_THRESHOLD) || 0.85,
            monitoringWindow: 7, // days
            minSamplesForEvaluation: 100,
            driftCheckInterval: 24 * 60 * 60 * 1000, // 24 hours
            statisticalSignificanceLevel: 0.05,
            conceptDriftThreshold: 0.1,
            dataDriftThreshold: 0.15
        };

        // Model performance tracking
        this.modelMetrics = new Map();
        
        // Drift detection algorithms
        this.driftDetectors = {
            accuracy: this.detectAccuracyDrift.bind(this),
            statistical: this.detectStatisticalDrift.bind(this),
            concept: this.detectConceptDrift.bind(this),
            data: this.detectDataDrift.bind(this)
        };

        // Performance history
        this.performanceHistory = {
            location_prediction: [],
            activity_prediction: [],
            entity_resolution: []
        };

        // Drift alerts
        this.driftAlerts = [];
        
        // Start monitoring
        this.startDriftMonitoring();
    }    /**
 
    * Start continuous drift monitoring
     */
    startDriftMonitoring() {
        logger.info('Starting model drift monitoring service');
        
        // Initial drift check
        setTimeout(() => this.performDriftCheck(), 5000);
        
        // Schedule regular drift checks
        setInterval(() => {
            this.performDriftCheck().catch(error => {
                logger.error('Scheduled drift check failed:', error);
            });
        }, this.config.driftCheckInterval);
    }

    /**
     * Perform comprehensive drift check
     */
    async performDriftCheck() {
        logger.info('Performing model drift check');
        
        try {
            const modelTypes = ['location_prediction', 'activity_prediction', 'entity_resolution'];
            const driftResults = {};

            for (const modelType of modelTypes) {
                try {
                    const result = await this.checkModelDrift(modelType);
                    driftResults[modelType] = result;
                    
                    if (result.driftDetected) {
                        await this.handleDriftDetection(modelType, result);
                    }
                } catch (error) {
                    logger.error(`Drift check failed for ${modelType}:`, error);
                    driftResults[modelType] = { error: error.message };
                }
            }

            logger.info('Drift check completed', { results: driftResults });
            return driftResults;

        } catch (error) {
            logger.error('Drift check failed:', error);
            throw error;
        }
    }

    /**
     * Check drift for a specific model type
     */
    async checkModelDrift(modelType) {
        const startTime = Date.now();
        
        try {
            logger.debug(`Checking drift for ${modelType} model`);

            // Get recent predictions and ground truth
            const evaluationData = await this.getEvaluationData(modelType);
            
            if (evaluationData.length < this.config.minSamplesForEvaluation) {
                return {
                    modelType,
                    driftDetected: false,
                    reason: 'insufficient_data',
                    sampleCount: evaluationData.length,
                    minRequired: this.config.minSamplesForEvaluation
                };
            }

            // Run all drift detection algorithms
            const driftResults = {};
            for (const [detectorName, detector] of Object.entries(this.driftDetectors)) {
                try {
                    driftResults[detectorName] = await detector(modelType, evaluationData);
                } catch (error) {
                    logger.warn(`${detectorName} drift detection failed:`, error.message);
                    driftResults[detectorName] = { detected: false, error: error.message };
                }
            }

            // Aggregate drift detection results
            const overallResult = this.aggregateDriftResults(modelType, driftResults, evaluationData);
            
            // Update performance history
            this.updatePerformanceHistory(modelType, overallResult);

            logger.info(`Drift check completed for ${modelType}`, {
                driftDetected: overallResult.driftDetected,
                processingTime: Date.now() - startTime
            });

            return overallResult;

        } catch (error) {
            logger.error(`Drift check failed for ${modelType}:`, error);
            throw error;
        }
    }

    /**
     * Get evaluation data for drift detection
     */
    async getEvaluationData(modelType) {
        try {
            const endDate = new Date();
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - this.config.monitoringWindow);

            let evaluationData = [];

            switch (modelType) {
                case 'location_prediction':
                    evaluationData = await this.getLocationPredictionData(startDate, endDate);
                    break;
                case 'activity_prediction':
                    evaluationData = await this.getActivityPredictionData(startDate, endDate);
                    break;
                case 'entity_resolution':
                    evaluationData = await this.getEntityResolutionData(startDate, endDate);
                    break;
                default:
                    throw new Error(`Unknown model type: ${modelType}`);
            }

            logger.debug(`Retrieved ${evaluationData.length} evaluation samples for ${modelType}`);
            return evaluationData;

        } catch (error) {
            logger.error(`Error getting evaluation data for ${modelType}:`, error);
            return [];
        }
    }

    /**
     * Get location prediction evaluation data
     */
    async getLocationPredictionData(startDate, endDate) {
        try {
            // Get events where we can verify predictions
            const events = await Event.find({
                timestamp: { $gte: startDate, $lte: endDate },
                activity_type: 'access', // Physical presence verification
                fused_confidence: { $gte: 0.8 } // High confidence events only
            }).lean();

            const evaluationData = [];

            for (const event of events) {
                // Simulate prediction vs actual for evaluation
                // In production, this would use stored predictions
                const predictionTime = new Date(event.timestamp);
                predictionTime.setMinutes(predictionTime.getMinutes() - 30); // 30 min before

                evaluationData.push({
                    entity_id: event.entity_id,
                    prediction_time: predictionTime,
                    predicted_location: event.location.building, // Simplified
                    actual_location: event.location.building,
                    confidence: event.fused_confidence,
                    correct: true // Simplified - would need actual prediction comparison
                });
            }

            return evaluationData.slice(0, 1000); // Limit for performance

        } catch (error) {
            logger.error('Error getting location prediction data:', error);
            return [];
        }
    }

    /**
     * Get activity prediction evaluation data
     */
    async getActivityPredictionData(startDate, endDate) {
        try {
            const events = await Event.find({
                timestamp: { $gte: startDate, $lte: endDate },
                fused_confidence: { $gte: 0.7 }
            }).sort({ entity_id: 1, timestamp: 1 }).lean();

            const evaluationData = [];
            const entityEvents = {};

            // Group events by entity
            events.forEach(event => {
                if (!entityEvents[event.entity_id]) {
                    entityEvents[event.entity_id] = [];
                }
                entityEvents[event.entity_id].push(event);
            });

            // Create prediction evaluation pairs
            for (const [entityId, entityEventList] of Object.entries(entityEvents)) {
                for (let i = 0; i < entityEventList.length - 1; i++) {
                    const currentEvent = entityEventList[i];
                    const nextEvent = entityEventList[i + 1];
                    
                    // Check if events are close enough in time for prediction
                    const timeDiff = new Date(nextEvent.timestamp) - new Date(currentEvent.timestamp);
                    if (timeDiff <= 4 * 60 * 60 * 1000) { // Within 4 hours
                        evaluationData.push({
                            entity_id: entityId,
                            prediction_time: currentEvent.timestamp,
                            predicted_activity: nextEvent.activity_type, // Simplified
                            actual_activity: nextEvent.activity_type,
                            confidence: nextEvent.fused_confidence,
                            correct: true // Simplified
                        });
                    }
                }
            }

            return evaluationData.slice(0, 1000);

        } catch (error) {
            logger.error('Error getting activity prediction data:', error);
            return [];
        }
    }

    /**
     * Get entity resolution evaluation data
     */
    async getEntityResolutionData(startDate, endDate) {
        try {
            // Get entities created/updated in the time window
            const entities = await Entity.find({
                updatedAt: { $gte: startDate, $lte: endDate },
                'metadata.confidence': { $exists: true }
            }).lean();

            const evaluationData = [];

            for (const entity of entities) {
                // Simulate resolution accuracy evaluation
                evaluationData.push({
                    entity_id: entity._id,
                    resolution_time: entity.updatedAt,
                    confidence: entity.metadata.confidence,
                    source_count: entity.metadata.source_records?.length || 1,
                    correct: entity.metadata.confidence > 0.8 // Simplified accuracy measure
                });
            }

            return evaluationData.slice(0, 1000);

        } catch (error) {
            logger.error('Error getting entity resolution data:', error);
            return [];
        }
    }

    /**
     * Detect accuracy-based drift
     */
    async detectAccuracyDrift(modelType, evaluationData) {
        try {
            const correctPredictions = evaluationData.filter(d => d.correct).length;
            const totalPredictions = evaluationData.length;
            const currentAccuracy = totalPredictions > 0 ? correctPredictions / totalPredictions : 0;

            // Get historical accuracy
            const historicalAccuracy = this.getHistoricalAccuracy(modelType);
            
            const accuracyDrop = historicalAccuracy - currentAccuracy;
            const driftDetected = currentAccuracy < this.config.accuracyThreshold || accuracyDrop > 0.1;

            logger.debug(`Accuracy drift check for ${modelType}`, {
                currentAccuracy,
                historicalAccuracy,
                accuracyDrop,
                threshold: this.config.accuracyThreshold,
                driftDetected
            });

            return {
                detected: driftDetected,
                current_accuracy: currentAccuracy,
                historical_accuracy: historicalAccuracy,
                accuracy_drop: accuracyDrop,
                threshold: this.config.accuracyThreshold,
                sample_count: totalPredictions
            };

        } catch (error) {
            logger.error('Accuracy drift detection failed:', error);
            return { detected: false, error: error.message };
        }
    }

    /**
     * Detect statistical drift using Kolmogorov-Smirnov test
     */
    async detectStatisticalDrift(modelType, evaluationData) {
        try {
            // Get confidence score distributions
            const currentConfidences = evaluationData.map(d => d.confidence);
            const historicalConfidences = this.getHistoricalConfidences(modelType);

            if (historicalConfidences.length < 30) {
                return { detected: false, reason: 'insufficient_historical_data' };
            }

            // Simplified KS test implementation
            const ksStatistic = this.calculateKSStatistic(currentConfidences, historicalConfidences);
            const criticalValue = this.getKSCriticalValue(
                currentConfidences.length, 
                historicalConfidences.length, 
                this.config.statisticalSignificanceLevel
            );

            const driftDetected = ksStatistic > criticalValue;

            return {
                detected: driftDetected,
                ks_statistic: ksStatistic,
                critical_value: criticalValue,
                significance_level: this.config.statisticalSignificanceLevel,
                current_samples: currentConfidences.length,
                historical_samples: historicalConfidences.length
            };

        } catch (error) {
            logger.error('Statistical drift detection failed:', error);
            return { detected: false, error: error.message };
        }
    }    
/**
     * Detect concept drift (changes in prediction patterns)
     */
    async detectConceptDrift(modelType, evaluationData) {
        try {
            // Analyze prediction patterns over time
            const timeWindows = this.splitIntoTimeWindows(evaluationData, 24); // 24-hour windows
            
            if (timeWindows.length < 2) {
                return { detected: false, reason: 'insufficient_time_windows' };
            }

            // Calculate accuracy for each time window
            const windowAccuracies = timeWindows.map(window => {
                const correct = window.filter(d => d.correct).length;
                return window.length > 0 ? correct / window.length : 0;
            });

            // Detect trend in accuracy
            const accuracyTrend = this.calculateTrend(windowAccuracies);
            const maxAccuracyDrop = Math.max(...windowAccuracies) - Math.min(...windowAccuracies);
            
            const driftDetected = maxAccuracyDrop > this.config.conceptDriftThreshold || 
                                 accuracyTrend < -0.05; // Negative trend threshold

            return {
                detected: driftDetected,
                accuracy_trend: accuracyTrend,
                max_accuracy_drop: maxAccuracyDrop,
                threshold: this.config.conceptDriftThreshold,
                time_windows: timeWindows.length,
                window_accuracies: windowAccuracies
            };

        } catch (error) {
            logger.error('Concept drift detection failed:', error);
            return { detected: false, error: error.message };
        }
    }

    /**
     * Detect data drift (changes in input feature distributions)
     */
    async detectDataDrift(modelType, evaluationData) {
        try {
            // Analyze feature distributions
            const currentFeatures = await this.extractFeatureDistributions(evaluationData);
            const historicalFeatures = this.getHistoricalFeatureDistributions(modelType);

            if (!historicalFeatures || Object.keys(historicalFeatures).length === 0) {
                return { detected: false, reason: 'no_historical_features' };
            }

            const driftScores = {};
            let maxDriftScore = 0;

            // Compare distributions for each feature
            for (const [featureName, currentDist] of Object.entries(currentFeatures)) {
                if (historicalFeatures[featureName]) {
                    const driftScore = this.calculateDistributionDrift(
                        currentDist, 
                        historicalFeatures[featureName]
                    );
                    driftScores[featureName] = driftScore;
                    maxDriftScore = Math.max(maxDriftScore, driftScore);
                }
            }

            const driftDetected = maxDriftScore > this.config.dataDriftThreshold;

            return {
                detected: driftDetected,
                max_drift_score: maxDriftScore,
                threshold: this.config.dataDriftThreshold,
                feature_drift_scores: driftScores,
                features_analyzed: Object.keys(driftScores).length
            };

        } catch (error) {
            logger.error('Data drift detection failed:', error);
            return { detected: false, error: error.message };
        }
    }

    /**
     * Aggregate drift detection results
     */
    aggregateDriftResults(modelType, driftResults, evaluationData) {
        const detectedDrifts = Object.entries(driftResults)
            .filter(([_, result]) => result.detected)
            .map(([type, result]) => ({ type, ...result }));

        const driftDetected = detectedDrifts.length > 0;
        
        // Calculate overall drift severity
        let driftSeverity = 'none';
        if (driftDetected) {
            const criticalDrifts = detectedDrifts.filter(d => 
                d.type === 'accuracy' || 
                (d.type === 'concept' && d.max_accuracy_drop > 0.2)
            );
            
            driftSeverity = criticalDrifts.length > 0 ? 'critical' : 
                           detectedDrifts.length > 1 ? 'high' : 'medium';
        }

        return {
            modelType,
            timestamp: new Date().toISOString(),
            driftDetected,
            driftSeverity,
            detectedDrifts,
            allResults: driftResults,
            sampleCount: evaluationData.length,
            recommendedAction: this.getRecommendedAction(driftSeverity, detectedDrifts)
        };
    }

    /**
     * Handle drift detection
     */
    async handleDriftDetection(modelType, driftResult) {
        try {
            logger.warn(`Model drift detected for ${modelType}`, {
                severity: driftResult.driftSeverity,
                detectedDrifts: driftResult.detectedDrifts.map(d => d.type)
            });

            // Create drift alert
            const alert = {
                id: `drift_${modelType}_${Date.now()}`,
                modelType,
                severity: driftResult.driftSeverity,
                detectedAt: new Date(),
                driftTypes: driftResult.detectedDrifts.map(d => d.type),
                details: driftResult,
                status: 'active',
                actions: []
            };

            this.driftAlerts.push(alert);

            // Take action based on severity
            switch (driftResult.driftSeverity) {
                case 'critical':
                    await this.handleCriticalDrift(modelType, alert);
                    break;
                case 'high':
                    await this.handleHighDrift(modelType, alert);
                    break;
                case 'medium':
                    await this.handleMediumDrift(modelType, alert);
                    break;
            }

            // Notify stakeholders
            await this.notifyDriftDetection(alert);

        } catch (error) {
            logger.error(`Error handling drift detection for ${modelType}:`, error);
        }
    }

    /**
     * Handle critical drift (immediate retraining)
     */
    async handleCriticalDrift(modelType, alert) {
        try {
            logger.error(`Critical drift detected for ${modelType} - initiating immediate retraining`);

            // Trigger immediate model retraining
            const retrainingResult = await this.triggerModelRetraining(modelType, 'critical_drift');
            
            alert.actions.push({
                action: 'immediate_retraining',
                timestamp: new Date(),
                status: retrainingResult.success ? 'completed' : 'failed',
                details: retrainingResult
            });

            // Temporarily reduce model confidence
            await this.adjustModelConfidence(modelType, 0.7);

        } catch (error) {
            logger.error(`Error handling critical drift for ${modelType}:`, error);
        }
    }

    /**
     * Handle high drift (scheduled retraining)
     */
    async handleHighDrift(modelType, alert) {
        try {
            logger.warn(`High drift detected for ${modelType} - scheduling retraining`);

            // Schedule retraining within 24 hours
            setTimeout(async () => {
                try {
                    const retrainingResult = await this.triggerModelRetraining(modelType, 'high_drift');
                    alert.actions.push({
                        action: 'scheduled_retraining',
                        timestamp: new Date(),
                        status: retrainingResult.success ? 'completed' : 'failed',
                        details: retrainingResult
                    });
                } catch (error) {
                    logger.error(`Scheduled retraining failed for ${modelType}:`, error);
                }
            }, 60 * 60 * 1000); // 1 hour delay

            // Slightly reduce model confidence
            await this.adjustModelConfidence(modelType, 0.85);

        } catch (error) {
            logger.error(`Error handling high drift for ${modelType}:`, error);
        }
    }

    /**
     * Handle medium drift (monitoring increase)
     */
    async handleMediumDrift(modelType, alert) {
        try {
            logger.info(`Medium drift detected for ${modelType} - increasing monitoring`);

            // Increase monitoring frequency
            alert.actions.push({
                action: 'increased_monitoring',
                timestamp: new Date(),
                status: 'active',
                details: { monitoring_frequency: 'every_6_hours' }
            });

            // Schedule evaluation in 48 hours
            setTimeout(async () => {
                const followUpResult = await this.checkModelDrift(modelType);
                if (followUpResult.driftDetected && followUpResult.driftSeverity !== 'none') {
                    await this.handleDriftDetection(modelType, followUpResult);
                }
            }, 48 * 60 * 60 * 1000); // 48 hours

        } catch (error) {
            logger.error(`Error handling medium drift for ${modelType}:`, error);
        }
    }

    /**
     * Trigger model retraining
     */
    async triggerModelRetraining(modelType, reason) {
        try {
            logger.info(`Triggering model retraining for ${modelType}`, { reason });

            const response = await axios.post(`${this.config.mlServiceUrl}/retrain`, {
                model_type: modelType,
                reason: reason,
                timestamp: new Date().toISOString()
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': this.config.mlServiceApiKey
                },
                timeout: 30000
            });

            logger.info(`Model retraining initiated for ${modelType}`, response.data);
            
            return {
                success: true,
                job_id: response.data.job_id,
                estimated_completion: response.data.estimated_completion
            };

        } catch (error) {
            logger.error(`Model retraining failed for ${modelType}:`, error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Adjust model confidence multiplier
     */
    async adjustModelConfidence(modelType, multiplier) {
        try {
            // This would adjust confidence scores for predictions
            // Implementation depends on how confidence is handled in the system
            logger.info(`Adjusting model confidence for ${modelType}`, { multiplier });
            
            // Store confidence adjustment
            if (!this.modelMetrics.has(modelType)) {
                this.modelMetrics.set(modelType, {});
            }
            
            this.modelMetrics.get(modelType).confidenceMultiplier = multiplier;
            this.modelMetrics.get(modelType).adjustedAt = new Date();

        } catch (error) {
            logger.error(`Error adjusting model confidence for ${modelType}:`, error);
        }
    }

    /**
     * Notify stakeholders about drift detection
     */
    async notifyDriftDetection(alert) {
        try {
            // This would integrate with the alerting system
            logger.info('Notifying stakeholders about model drift', {
                modelType: alert.modelType,
                severity: alert.severity
            });

            // Create system alert (would integrate with Alert model)
            // await Alert.create({
            //     type: 'MODEL_DRIFT',
            //     severity: alert.severity.toUpperCase(),
            //     title: `Model Drift Detected: ${alert.modelType}`,
            //     description: `Drift detected in ${alert.modelType} model with ${alert.severity} severity`,
            //     context: { model_drift: alert }
            // });

        } catch (error) {
            logger.error('Error notifying drift detection:', error);
        }
    }

    // Utility methods
    getHistoricalAccuracy(modelType) {
        const history = this.performanceHistory[modelType] || [];
        if (history.length === 0) return 0.9; // Default baseline
        
        const recentHistory = history.slice(-10); // Last 10 measurements
        const totalAccuracy = recentHistory.reduce((sum, h) => sum + (h.accuracy || 0), 0);
        return recentHistory.length > 0 ? totalAccuracy / recentHistory.length : 0.9;
    }

    getHistoricalConfidences(modelType) {
        const history = this.performanceHistory[modelType] || [];
        return history.flatMap(h => h.confidences || []).slice(-1000); // Last 1000 samples
    }

    getHistoricalFeatureDistributions(modelType) {
        // Simplified - would store actual feature distributions
        return {};
    }

    updatePerformanceHistory(modelType, result) {
        if (!this.performanceHistory[modelType]) {
            this.performanceHistory[modelType] = [];
        }
        
        this.performanceHistory[modelType].push({
            timestamp: new Date(),
            accuracy: result.allResults?.accuracy?.current_accuracy || 0,
            driftDetected: result.driftDetected,
            sampleCount: result.sampleCount
        });
        
        // Keep only last 100 entries
        if (this.performanceHistory[modelType].length > 100) {
            this.performanceHistory[modelType] = this.performanceHistory[modelType].slice(-100);
        }
    }

    splitIntoTimeWindows(data, windowHours) {
        const windows = [];
        const windowMs = windowHours * 60 * 60 * 1000;
        
        if (data.length === 0) return windows;
        
        const sortedData = data.sort((a, b) => 
            new Date(a.prediction_time || a.resolution_time) - new Date(b.prediction_time || b.resolution_time)
        );
        
        let currentWindow = [];
        let windowStart = new Date(sortedData[0].prediction_time || sortedData[0].resolution_time);
        
        for (const item of sortedData) {
            const itemTime = new Date(item.prediction_time || item.resolution_time);
            
            if (itemTime - windowStart > windowMs) {
                if (currentWindow.length > 0) {
                    windows.push(currentWindow);
                }
                currentWindow = [item];
                windowStart = itemTime;
            } else {
                currentWindow.push(item);
            }
        }
        
        if (currentWindow.length > 0) {
            windows.push(currentWindow);
        }
        
        return windows;
    }

    calculateTrend(values) {
        if (values.length < 2) return 0;
        
        const n = values.length;
        const sumX = (n * (n - 1)) / 2;
        const sumY = values.reduce((sum, val) => sum + val, 0);
        const sumXY = values.reduce((sum, val, i) => sum + i * val, 0);
        const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;
        
        const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
        return slope;
    }

    calculateKSStatistic(sample1, sample2) {
        // Simplified KS test implementation
        const combined = [...sample1, ...sample2].sort((a, b) => a - b);
        const unique = [...new Set(combined)];
        
        let maxDiff = 0;
        
        for (const value of unique) {
            const cdf1 = sample1.filter(x => x <= value).length / sample1.length;
            const cdf2 = sample2.filter(x => x <= value).length / sample2.length;
            maxDiff = Math.max(maxDiff, Math.abs(cdf1 - cdf2));
        }
        
        return maxDiff;
    }

    getKSCriticalValue(n1, n2, alpha) {
        // Simplified critical value calculation
        const c = Math.sqrt(-0.5 * Math.log(alpha / 2));
        return c * Math.sqrt((n1 + n2) / (n1 * n2));
    }

    extractFeatureDistributions(evaluationData) {
        // Simplified feature extraction
        return {
            confidence: evaluationData.map(d => d.confidence),
            hour: evaluationData.map(d => new Date(d.prediction_time || d.resolution_time).getHours())
        };
    }

    calculateDistributionDrift(dist1, dist2) {
        // Simplified distribution comparison using mean and std deviation
        const mean1 = dist1.reduce((sum, val) => sum + val, 0) / dist1.length;
        const mean2 = dist2.reduce((sum, val) => sum + val, 0) / dist2.length;
        
        const std1 = Math.sqrt(dist1.reduce((sum, val) => sum + Math.pow(val - mean1, 2), 0) / dist1.length);
        const std2 = Math.sqrt(dist2.reduce((sum, val) => sum + Math.pow(val - mean2, 2), 0) / dist2.length);
        
        const meanDiff = Math.abs(mean1 - mean2) / Math.max(std1, std2, 0.01);
        const stdDiff = Math.abs(std1 - std2) / Math.max(std1, std2, 0.01);
        
        return Math.max(meanDiff, stdDiff);
    }

    getRecommendedAction(severity, detectedDrifts) {
        switch (severity) {
            case 'critical':
                return 'immediate_retraining_required';
            case 'high':
                return 'schedule_retraining_within_24h';
            case 'medium':
                return 'increase_monitoring_frequency';
            default:
                return 'continue_monitoring';
        }
    }

    /**
     * Get drift monitoring status
     */
    getMonitoringStatus() {
        return {
            active_alerts: this.driftAlerts.filter(a => a.status === 'active').length,
            total_alerts: this.driftAlerts.length,
            model_metrics: Object.fromEntries(this.modelMetrics),
            last_check: new Date().toISOString(),
            monitoring_interval_hours: this.config.driftCheckInterval / (60 * 60 * 1000)
        };
    }

    /**
     * Clear old alerts and history
     */
    cleanup() {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - 30); // Keep 30 days

        this.driftAlerts = this.driftAlerts.filter(alert => 
            new Date(alert.detectedAt) > cutoffDate
        );

        // Clean performance history
        for (const modelType of Object.keys(this.performanceHistory)) {
            this.performanceHistory[modelType] = this.performanceHistory[modelType]
                .filter(entry => entry.timestamp > cutoffDate);
        }

        logger.info('Model drift service cleanup completed');
    }
}

module.exports = ModelDriftService;