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
        new winston.transports.File({ filename: 'logs/explainability.log' })
    ]
});

/**
 * Explainability Service using SHAP (SHapley Additive exPlanations)
 * Provides interpretable explanations for ML model predictions
 */
class ExplainabilityService {
    constructor() {
        this.config = {
            mlServiceUrl: process.env.ML_SERVICE_URL || 'http://localhost:8001',
            mlServiceApiKey: process.env.ML_SERVICE_API_KEY || 'ml-service-dev-key-123',
            shapExplainerType: process.env.SHAP_EXPLAINER_TYPE || 'tree',
            maxFeatures: parseInt(process.env.SHAP_MAX_FEATURES) || 10,
            backgroundSamples: parseInt(process.env.SHAP_BACKGROUND_SAMPLES) || 100,
            cacheTimeout: 600000 // 10 minutes
        };

        // Feature importance cache
        this.explanationCache = new Map();
        
        // Feature name mappings for human-readable explanations
        this.featureNames = {
            // Temporal features
            'hour': 'Time of day',
            'day_of_week': 'Day of the week',
            'is_weekend': 'Weekend indicator',
            'is_work_hours': 'Work hours indicator',
            
            // Spatial features
            'last_building': 'Previous building',
            'last_zone': 'Previous zone',
            'minutes_since_last_event': 'Time since last activity',
            'unique_buildings_24h': 'Buildings visited (24h)',
            
            // Behavioral features
            'is_student': 'Student status',
            'is_faculty': 'Faculty status',
            'department': 'Department affiliation',
            'student_year': 'Academic year',
            
            // Activity patterns
            'access_frequency': 'Access activity frequency',
            'social_frequency': 'Social activity frequency',
            'academic_frequency': 'Academic activity frequency',
            
            // Social features
            'social_connections': 'Social connections count',
            'co_location_events': 'Co-location events',
            
            // Similarity features (for entity resolution)
            'name_similarity': 'Name similarity score',
            'email_similarity': 'Email similarity score',
            'face_similarity': 'Face similarity score'
        };

        // Explanation templates
        this.explanationTemplates = {
            location_prediction: {
                positive: {
                    'hour': 'Entity typically visits this location at {value} o\'clock',
                    'last_building': 'Entity was previously in {building}, which often leads to this location',
                    'department': 'Department affiliation suggests this location',
                    'is_student': 'Student status indicates typical classroom/library usage',
                    'social_connections': 'Social connections frequently visit this location'
                },
                negative: {
                    'hour': 'Unusual time for this location (typically not visited at {value} o\'clock)',
                    'is_weekend': 'Weekend timing reduces likelihood of academic locations',
                    'last_building': 'Previous location doesn\'t typically lead to this destination'
                }
            },
            activity_prediction: {
                positive: {
                    'hour': 'Time of day ({value}) is typical for this activity',
                    'last_activity': 'Previous activity often leads to this next activity',
                    'is_work_hours': 'Work hours timing supports this activity type',
                    'department': 'Department schedule aligns with this activity'
                },
                negative: {
                    'is_weekend': 'Weekend timing reduces likelihood of work activities',
                    'hour': 'Unusual time for this activity type'
                }
            },
            entity_resolution: {
                positive: {
                    'name_similarity': 'Names are highly similar (score: {value})',
                    'email_similarity': 'Email addresses match or are very similar',
                    'face_similarity': 'Facial features are very similar (score: {value})',
                    'common_identifiers': 'Multiple shared identifiers found'
                },
                negative: {
                    'name_similarity': 'Names are quite different (score: {value})',
                    'department': 'Different department affiliations',
                    'entity_type': 'Different entity types (student vs faculty)'
                }
            }
        };
    }  
  /**
     * Generate SHAP explanations for a prediction
     */
    async explainPrediction(predictionType, entityId, features, prediction, options = {}) {
        const startTime = Date.now();
        
        try {
            const {
                includeHistoricalEvidence = true,
                includeNaturalLanguage = true,
                maxFeatures = this.config.maxFeatures,
                useCache = true
            } = options;

            logger.debug(`Generating explanation for ${predictionType} prediction`, {
                entityId,
                predictionType
            });

            // Check cache
            const cacheKey = `${predictionType}_${entityId}_${JSON.stringify(features)}`;
            if (useCache && this.explanationCache.has(cacheKey)) {
                const cached = this.explanationCache.get(cacheKey);
                if (Date.now() - cached.timestamp < this.config.cacheTimeout) {
                    return cached.explanation;
                }
            }

            // Get SHAP values from ML service
            const shapValues = await this.getSHAPValues(predictionType, features, prediction);
            
            // Process SHAP values into explanations
            const explanation = await this.processSHAPValues(
                shapValues, 
                features, 
                predictionType, 
                entityId,
                { includeHistoricalEvidence, includeNaturalLanguage, maxFeatures }
            );

            // Cache the result
            if (useCache) {
                this.explanationCache.set(cacheKey, {
                    explanation,
                    timestamp: Date.now()
                });
            }

            logger.info(`Explanation generated for ${predictionType}`, {
                entityId,
                topFeatures: explanation.feature_importance.slice(0, 3).map(f => f.feature),
                processingTime: Date.now() - startTime
            });

            return explanation;

        } catch (error) {
            logger.error(`Explanation generation failed for ${predictionType}:`, error);
            return this.getFallbackExplanation(predictionType, features, prediction);
        }
    }

    /**
     * Get SHAP values from ML service
     */
    async getSHAPValues(predictionType, features, prediction) {
        try {
            const response = await axios.post(`${this.config.mlServiceUrl}/explain/shap`, {
                prediction_type: predictionType,
                features: features,
                prediction: prediction,
                explainer_type: this.config.shapExplainerType,
                background_samples: this.config.backgroundSamples
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': this.config.mlServiceApiKey
                },
                timeout: 15000
            });

            return response.data.shap_values;

        } catch (error) {
            logger.error('SHAP values request failed:', error);
            throw error;
        }
    }

    /**
     * Process SHAP values into structured explanations
     */
    async processSHAPValues(shapValues, features, predictionType, entityId, options) {
        const { includeHistoricalEvidence, includeNaturalLanguage, maxFeatures } = options;
        
        try {
            // Flatten features for processing
            const flatFeatures = this.flattenFeatures(features);
            
            // Combine SHAP values with feature names and values
            const featureImportance = Object.entries(shapValues)
                .map(([featureName, shapValue]) => ({
                    feature: featureName,
                    shap_value: shapValue,
                    feature_value: flatFeatures[featureName] || 0,
                    abs_importance: Math.abs(shapValue),
                    contribution: shapValue > 0 ? 'positive' : 'negative'
                }))
                .sort((a, b) => b.abs_importance - a.abs_importance)
                .slice(0, maxFeatures);

            // Generate natural language explanations
            let naturalLanguageExplanations = [];
            if (includeNaturalLanguage) {
                naturalLanguageExplanations = await this.generateNaturalLanguageExplanations(
                    featureImportance,
                    predictionType,
                    entityId
                );
            }

            // Get historical evidence
            let historicalEvidence = [];
            if (includeHistoricalEvidence) {
                historicalEvidence = await this.getHistoricalEvidence(
                    entityId,
                    featureImportance,
                    predictionType
                );
            }

            return {
                prediction_type: predictionType,
                entity_id: entityId,
                explanation_timestamp: new Date().toISOString(),
                feature_importance: featureImportance,
                natural_language_explanations: naturalLanguageExplanations,
                historical_evidence: historicalEvidence,
                model_confidence: this.calculateOverallConfidence(featureImportance),
                explanation_quality: this.assessExplanationQuality(featureImportance)
            };

        } catch (error) {
            logger.error('SHAP values processing failed:', error);
            throw error;
        }
    }

    /**
     * Generate natural language explanations from SHAP values
     */
    async generateNaturalLanguageExplanations(featureImportance, predictionType, entityId) {
        const explanations = [];
        
        try {
            const templates = this.explanationTemplates[predictionType];
            if (!templates) {
                return ['No explanation templates available for this prediction type'];
            }

            // Process top features
            for (const feature of featureImportance.slice(0, 5)) {
                const templateType = feature.contribution === 'positive' ? 'positive' : 'negative';
                const template = templates[templateType]?.[feature.feature];
                
                if (template) {
                    let explanation = template.replace('{value}', feature.feature_value);
                    
                    // Add specific context based on feature type
                    explanation = await this.addFeatureContext(explanation, feature, entityId);
                    
                    explanations.push({
                        feature: feature.feature,
                        explanation: explanation,
                        importance: feature.abs_importance,
                        contribution: feature.contribution
                    });
                } else {
                    // Generic explanation
                    const featureName = this.featureNames[feature.feature] || feature.feature;
                    const direction = feature.contribution === 'positive' ? 'supports' : 'reduces';
                    
                    explanations.push({
                        feature: feature.feature,
                        explanation: `${featureName} (${feature.feature_value}) ${direction} this prediction`,
                        importance: feature.abs_importance,
                        contribution: feature.contribution
                    });
                }
            }

            return explanations;

        } catch (error) {
            logger.error('Natural language explanation generation failed:', error);
            return ['Unable to generate detailed explanations'];
        }
    }

    /**
     * Add specific context to feature explanations
     */
    async addFeatureContext(explanation, feature, entityId) {
        try {
            // Add building name context
            if (feature.feature === 'last_building' && feature.feature_value > 0) {
                const buildingName = this.decodeBuildingName(feature.feature_value);
                explanation = explanation.replace('{building}', buildingName);
            }
            
            // Add department context
            if (feature.feature === 'department' && feature.feature_value > 0) {
                const departmentName = this.decodeDepartment(feature.feature_value);
                explanation += ` (${departmentName})`;
            }
            
            // Add time context
            if (feature.feature === 'hour') {
                const timeOfDay = this.getTimeOfDayDescription(feature.feature_value);
                explanation += ` (${timeOfDay})`;
            }

            return explanation;

        } catch (error) {
            logger.error('Error adding feature context:', error);
            return explanation;
        }
    }

    /**
     * Get historical evidence supporting the explanation
     */
    async getHistoricalEvidence(entityId, featureImportance, predictionType) {
        try {
            const evidence = [];
            const historicalStart = new Date();
            historicalStart.setDate(historicalStart.getDate() - 30); // Last 30 days

            // Get recent events for evidence
            const recentEvents = await Event.find({
                entity_id: entityId,
                timestamp: { $gte: historicalStart }
            })
            .sort({ timestamp: -1 })
            .limit(20)
            .lean();

            // Analyze patterns based on top features
            for (const feature of featureImportance.slice(0, 3)) {
                const featureEvidence = await this.extractFeatureEvidence(
                    feature,
                    recentEvents,
                    predictionType
                );
                
                if (featureEvidence.length > 0) {
                    evidence.push({
                        feature: feature.feature,
                        feature_name: this.featureNames[feature.feature] || feature.feature,
                        evidence_type: 'historical_pattern',
                        evidence: featureEvidence
                    });
                }
            }

            return evidence;

        } catch (error) {
            logger.error('Historical evidence extraction failed:', error);
            return [];
        }
    }

    /**
     * Extract evidence for a specific feature
     */
    async extractFeatureEvidence(feature, events, predictionType) {
        const evidence = [];
        
        try {
            switch (feature.feature) {
                case 'hour':
                    const hourEvents = events.filter(e => 
                        new Date(e.timestamp).getHours() === feature.feature_value
                    );
                    if (hourEvents.length > 0) {
                        evidence.push({
                            description: `Visited similar locations ${hourEvents.length} times at this hour in the past month`,
                            count: hourEvents.length,
                            examples: hourEvents.slice(0, 3).map(e => ({
                                date: e.timestamp,
                                location: `${e.location.building}, ${e.location.room}`,
                                activity: e.activity_type
                            }))
                        });
                    }
                    break;

                case 'last_building':
                    const buildingName = this.decodeBuildingName(feature.feature_value);
                    const buildingEvents = events.filter(e => 
                        e.location.building === buildingName
                    );
                    if (buildingEvents.length > 0) {
                        evidence.push({
                            description: `Frequently visits ${buildingName} (${buildingEvents.length} times in past month)`,
                            count: buildingEvents.length,
                            frequency: Math.round((buildingEvents.length / events.length) * 100)
                        });
                    }
                    break;

                case 'social_frequency':
                    const socialEvents = events.filter(e => e.activity_type === 'social');
                    if (socialEvents.length > 0) {
                        evidence.push({
                            description: `Engaged in social activities ${socialEvents.length} times recently`,
                            count: socialEvents.length,
                            recent_examples: socialEvents.slice(0, 2).map(e => ({
                                date: e.timestamp,
                                location: `${e.location.building}, ${e.location.room}`
                            }))
                        });
                    }
                    break;

                default:
                    // Generic evidence extraction
                    if (events.length > 0) {
                        evidence.push({
                            description: `Pattern observed in ${events.length} recent activities`,
                            count: events.length
                        });
                    }
            }

            return evidence;

        } catch (error) {
            logger.error('Feature evidence extraction failed:', error);
            return [];
        }
    }    
    /**
     * Generate explanation for entity resolution decisions
     */
    async explainEntityResolution(entity1, entity2, similarityScores, matchDecision) {
        try {
            logger.debug('Generating entity resolution explanation', {
                entity1: entity1._id,
                entity2: entity2._id,
                matchDecision: matchDecision.isMatch
            });

            // Create features object for SHAP analysis
            const features = {
                name_similarity: similarityScores.name || 0,
                email_similarity: similarityScores.email || 0,
                phone_similarity: similarityScores.phone || 0,
                face_similarity: similarityScores.face || 0,
                department_match: entity1.profile?.department === entity2.profile?.department ? 1 : 0,
                entity_type_match: entity1.profile?.entity_type === entity2.profile?.entity_type ? 1 : 0,
                common_identifiers: this.countCommonIdentifiers(entity1, entity2),
                confidence_product: (entity1.metadata?.confidence || 1) * (entity2.metadata?.confidence || 1)
            };

            // Generate explanation
            const explanation = await this.explainPrediction(
                'entity_resolution',
                `${entity1._id}_${entity2._id}`,
                features,
                { isMatch: matchDecision.isMatch, confidence: matchDecision.confidence },
                { includeHistoricalEvidence: false, includeNaturalLanguage: true }
            );

            // Add entity-specific context
            explanation.entities = {
                entity1: {
                    id: entity1._id,
                    name: entity1.profile?.name,
                    type: entity1.profile?.entity_type,
                    department: entity1.profile?.department
                },
                entity2: {
                    id: entity2._id,
                    name: entity2.profile?.name,
                    type: entity2.profile?.entity_type,
                    department: entity2.profile?.department
                }
            };

            explanation.similarity_breakdown = similarityScores;
            explanation.match_decision = matchDecision;

            return explanation;

        } catch (error) {
            logger.error('Entity resolution explanation failed:', error);
            return this.getFallbackExplanation('entity_resolution', {}, matchDecision);
        }
    }

    /** 
     * Generate batch explanations for multiple predictions
     */
    async explainBatch(predictions, predictionType, options = {}) {
        const explanations = [];
        
        try {
            logger.info(`Generating batch explanations for ${predictions.length} predictions`);

            // Process in parallel with concurrency limit
            const concurrency = 5;
            for (let i = 0; i < predictions.length; i += concurrency) {
                const batch = predictions.slice(i, i + concurrency);
                
                const batchPromises = batch.map(async (pred) => {
                    try {
                        return await this.explainPrediction(
                            predictionType,
                            pred.entityId,
                            pred.features,
                            pred.prediction,
                            options
                        );
                    } catch (error) {
                        logger.error(`Batch explanation failed for ${pred.entityId}:`, error);
                        return this.getFallbackExplanation(predictionType, pred.features, pred.prediction);
                    }
                });

                const batchResults = await Promise.all(batchPromises);
                explanations.push(...batchResults);
            }

            logger.info(`Batch explanations completed: ${explanations.length} explanations generated`);
            return explanations;

        } catch (error) {
            logger.error('Batch explanation generation failed:', error);
            return predictions.map(pred => 
                this.getFallbackExplanation(predictionType, pred.features, pred.prediction)
            );
        }
    }

    /**
     * Get fallback explanation when SHAP analysis fails
     */
    getFallbackExplanation(predictionType, features, prediction) {
        logger.warn(`Using fallback explanation for ${predictionType}`);
        
        const flatFeatures = this.flattenFeatures(features);
        const topFeatures = Object.entries(flatFeatures)
            .filter(([key, value]) => value !== 0 && value !== null && value !== undefined)
            .slice(0, 5)
            .map(([feature, value]) => ({
                feature,
                feature_value: value,
                shap_value: 0.1, // Placeholder
                abs_importance: 0.1,
                contribution: 'unknown'
            }));

        return {
            prediction_type: predictionType,
            explanation_timestamp: new Date().toISOString(),
            feature_importance: topFeatures,
            natural_language_explanations: [{
                explanation: 'Detailed explanation unavailable - using simplified analysis',
                importance: 0.1,
                contribution: 'unknown'
            }],
            historical_evidence: [],
            model_confidence: 0.5,
            explanation_quality: 'low',
            is_fallback: true
        };
    }

    // Utility methods
    flattenFeatures(features) {
        const flat = {};
        
        const flatten = (obj, prefix = '') => {
            for (const [key, value] of Object.entries(obj)) {
                const newKey = prefix ? `${prefix}.${key}` : key;
                
                if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                    flatten(value, newKey);
                } else {
                    flat[newKey] = value;
                }
            }
        };
        
        flatten(features);
        return flat;
    }

    calculateOverallConfidence(featureImportance) {
        if (featureImportance.length === 0) return 0.5;
        
        const totalImportance = featureImportance.reduce((sum, f) => sum + f.abs_importance, 0);
        const positiveImportance = featureImportance
            .filter(f => f.contribution === 'positive')
            .reduce((sum, f) => sum + f.abs_importance, 0);
        
        return totalImportance > 0 ? positiveImportance / totalImportance : 0.5;
    }

    assessExplanationQuality(featureImportance) {
        if (featureImportance.length === 0) return 'very_low';
        
        const maxImportance = Math.max(...featureImportance.map(f => f.abs_importance));
        const avgImportance = featureImportance.reduce((sum, f) => sum + f.abs_importance, 0) / featureImportance.length;
        
        if (maxImportance > 0.5 && avgImportance > 0.2) return 'high';
        if (maxImportance > 0.3 && avgImportance > 0.1) return 'medium';
        if (maxImportance > 0.1) return 'low';
        return 'very_low';
    }

    countCommonIdentifiers(entity1, entity2) {
        let count = 0;
        const id1 = entity1.identifiers || {};
        const id2 = entity2.identifiers || {};
        
        if (id1.email && id2.email && id1.email === id2.email) count++;
        if (id1.phone && id2.phone && id1.phone === id2.phone) count++;
        if (id1.card_id && id2.card_id && id1.card_id === id2.card_id) count++;
        if (id1.student_id && id2.student_id && id1.student_id === id2.student_id) count++;
        if (id1.employee_id && id2.employee_id && id1.employee_id === id2.employee_id) count++;
        
        return count;
    }

    decodeBuildingName(code) {
        const buildingMap = {
            1: 'Academic Complex',
            2: 'Library',
            3: 'Hostel A',
            4: 'Hostel B',
            5: 'Hostel C',
            6: 'Cafeteria',
            7: 'Sports Complex',
            8: 'Admin Block'
        };
        return buildingMap[code] || 'Unknown Building';
    }

    decodeDepartment(code) {
        const deptMap = {
            1: 'Computer Science',
            2: 'Electrical Engineering',
            3: 'Mechanical Engineering',
            4: 'Civil Engineering',
            5: 'Mathematics',
            6: 'Physics',
            7: 'Chemistry',
            8: 'Biology'
        };
        return deptMap[code] || 'Unknown Department';
    }

    getTimeOfDayDescription(hour) {
        if (hour >= 6 && hour < 12) return 'Morning';
        if (hour >= 12 && hour < 17) return 'Afternoon';
        if (hour >= 17 && hour < 21) return 'Evening';
        return 'Night';
    }

    /**
     * Generate explanation summary for dashboard display
     */
    generateExplanationSummary(explanation) {
        try {
            const topFeature = explanation.feature_importance[0];
            const confidence = explanation.model_confidence;
            const quality = explanation.explanation_quality;
            
            let summary = '';
            
            if (topFeature) {
                const featureName = this.featureNames[topFeature.feature] || topFeature.feature;
                const contribution = topFeature.contribution === 'positive' ? 'supports' : 'contradicts';
                summary = `${featureName} ${contribution} this prediction`;
            }
            
            return {
                summary,
                confidence: Math.round(confidence * 100),
                quality,
                top_factors: explanation.feature_importance.slice(0, 3).map(f => ({
                    factor: this.featureNames[f.feature] || f.feature,
                    importance: Math.round(f.abs_importance * 100),
                    contribution: f.contribution
                }))
            };

        } catch (error) {
            logger.error('Explanation summary generation failed:', error);
            return {
                summary: 'Explanation unavailable',
                confidence: 50,
                quality: 'low',
                top_factors: []
            };
        }
    }

    /**
     * Clear explanation cache
     */
    clearCache() {
        this.explanationCache.clear();
        logger.info('Explainability cache cleared');
    }

    /**
     * Get cache statistics
     */
    getCacheStats() {
        return {
            cacheSize: this.explanationCache.size,
            maxCacheSize: 1000 // Could be configurable
        };
    }
}

module.exports = ExplainabilityService;