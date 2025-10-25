const winston = require('winston');

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
        new winston.transports.File({ filename: 'logs/dempster_shafer.log' })
    ]
});

class DempsterShaferService {
    constructor() {
        this.config = {
            conflictThreshold: parseFloat(process.env.DS_CONFLICT_THRESHOLD) || 0.9,
            minBeliefThreshold: parseFloat(process.env.DS_MIN_BELIEF_THRESHOLD) || 0.01,
            maxUncertainty: parseFloat(process.env.DS_MAX_UNCERTAINTY) || 0.99,
            normalizationMethod: process.env.DS_NORMALIZATION_METHOD || 'yager', // 'yager' or 'smets'
            enableConflictDetection: process.env.DS_ENABLE_CONFLICT_DETECTION !== 'false'
        };

        // Frame of discernment for campus security system
        this.frameOfDiscernment = {
            // Entity identity hypotheses
            identity: ['correct_identity', 'incorrect_identity', 'unknown_identity'],
            
            // Location accuracy hypotheses
            location: ['accurate_location', 'approximate_location', 'inaccurate_location'],
            
            // Activity classification hypotheses
            activity: ['normal_activity', 'suspicious_activity', 'anomalous_activity'],
            
            // Source reliability hypotheses
            reliability: ['reliable_source', 'unreliable_source', 'unknown_reliability']
        };

        // Source reliability weights based on historical performance
        this.sourceReliability = new Map([
            ['card_swipe', 0.95],
            ['wifi_log', 0.75],
            ['cctv_frame', 0.85],
            ['helpdesk', 0.90],
            ['rsvp', 0.80],
            ['asset', 0.88]
        ]);

        // Evidence combination cache
        this.combinationCache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    }

    /**
     * Combine evidence from multiple sources using Dempster-Shafer theory
     * @param {Array} evidences - Array of evidence objects
     * @param {Object} options - Combination options
     */
    combineEvidence(evidences, options = {}) {
        const startTime = Date.now();
        
        try {
            const {
                hypothesis = 'identity',
                normalizationMethod = this.config.normalizationMethod,
                detectConflicts = this.config.enableConflictDetection
            } = options;

            if (!evidences || evidences.length === 0) {
                return this.createEmptyBeliefStructure(hypothesis);
            }

            if (evidences.length === 1) {
                return this.normalizeBeliefStructure(evidences[0], hypothesis);
            }

            logger.debug(`Combining ${evidences.length} pieces of evidence for hypothesis: ${hypothesis}`);

            // Validate and normalize input evidences
            const validEvidences = this.validateEvidences(evidences, hypothesis);
            
            if (validEvidences.length === 0) {
                return this.createEmptyBeliefStructure(hypothesis);
            }

            // Perform iterative combination
            let combinedBelief = validEvidences[0];
            const combinationHistory = [{ step: 0, belief: { ...combinedBelief } }];
            let totalConflict = 0;

            for (let i = 1; i < validEvidences.length; i++) {
                const evidence = validEvidences[i];
                const combinationResult = this.combineTwo(combinedBelief, evidence, {
                    normalizationMethod,
                    detectConflicts
                });

                combinedBelief = combinationResult.combinedBelief;
                totalConflict += combinationResult.conflict;

                combinationHistory.push({
                    step: i,
                    belief: { ...combinedBelief },
                    conflict: combinationResult.conflict,
                    source: evidence.source
                });

                // Check for excessive conflict
                if (detectConflicts && combinationResult.conflict > this.config.conflictThreshold) {
                    logger.warn(`High conflict detected in evidence combination: ${combinationResult.conflict}`, {
                        step: i,
                        sources: [combinedBelief.source, evidence.source]
                    });
                }
            }

            // Calculate final metrics
            const result = {
                combinedBelief,
                totalConflict,
                conflictRate: totalConflict / (validEvidences.length - 1),
                evidenceCount: validEvidences.length,
                combinationHistory,
                processingTime: Date.now() - startTime,
                hypothesis,
                normalizationMethod
            };

            logger.debug('Evidence combination completed', {
                evidenceCount: result.evidenceCount,
                totalConflict: result.totalConflict,
                processingTime: result.processingTime
            });

            return result;

        } catch (error) {
            logger.error('Error combining evidence:', error);
            throw error;
        }
    }

    /**
     * Combine two belief structures using Dempster's rule
     */
    combineTwo(belief1, belief2, options = {}) {
        try {
            const {
                normalizationMethod = this.config.normalizationMethod,
                detectConflicts = true
            } = options;

            // Get all possible focal elements (power set intersections)
            const focalElements = this.getFocalElements(belief1, belief2);
            const combinedMasses = new Map();
            let conflict = 0;

            // Apply Dempster's rule of combination
            for (const [subset1, mass1] of Object.entries(belief1.masses || {})) {
                for (const [subset2, mass2] of Object.entries(belief2.masses || {})) {
                    const intersection = this.intersectSubsets(subset1, subset2);
                    const combinedMass = mass1 * mass2;

                    if (intersection === '∅' || intersection.length === 0) {
                        // Empty intersection - contributes to conflict
                        conflict += combinedMass;
                    } else {
                        // Non-empty intersection
                        const currentMass = combinedMasses.get(intersection) || 0;
                        combinedMasses.set(intersection, currentMass + combinedMass);
                    }
                }
            }

            // Normalize based on chosen method
            let normalizedMasses;
            if (normalizationMethod === 'yager') {
                normalizedMasses = this.yaegerNormalization(combinedMasses, conflict);
            } else if (normalizationMethod === 'smets') {
                normalizedMasses = this.smetsNormalization(combinedMasses, conflict);
            } else {
                normalizedMasses = this.dempsterNormalization(combinedMasses, conflict);
            }

            // Create combined belief structure
            const combinedBelief = {
                masses: Object.fromEntries(normalizedMasses),
                belief: this.calculateBelief(normalizedMasses),
                plausibility: this.calculatePlausibility(normalizedMasses),
                uncertainty: this.calculateUncertainty(normalizedMasses),
                source: `combined_${belief1.source || 'unknown'}_${belief2.source || 'unknown'}`,
                timestamp: new Date(),
                conflictHandling: normalizationMethod
            };

            return {
                combinedBelief,
                conflict,
                normalizedMasses,
                focalElements: Array.from(combinedMasses.keys())
            };

        } catch (error) {
            logger.error('Error combining two belief structures:', error);
            throw error;
        }
    }

    /**
     * Create evidence structure from source data
     */
    createEvidence(sourceData, sourceType, options = {}) {
        try {
            const {
                hypothesis = 'identity',
                confidenceScore = null,
                qualityMetrics = {},
                contextualFactors = {}
            } = options;

            // Get source reliability
            const sourceReliability = this.sourceReliability.get(sourceType) || 0.5;
            
            // Calculate base confidence
            let baseConfidence = confidenceScore || sourceData.confidence || 0.5;
            
            // Adjust confidence based on source reliability
            const adjustedConfidence = baseConfidence * sourceReliability;
            
            // Create mass assignment based on hypothesis type
            let masses;
            switch (hypothesis) {
                case 'identity':
                    masses = this.createIdentityMasses(adjustedConfidence, qualityMetrics);
                    break;
                case 'location':
                    masses = this.createLocationMasses(adjustedConfidence, qualityMetrics);
                    break;
                case 'activity':
                    masses = this.createActivityMasses(adjustedConfidence, qualityMetrics);
                    break;
                case 'reliability':
                    masses = this.createReliabilityMasses(adjustedConfidence, qualityMetrics);
                    break;
                default:
                    masses = this.createGenericMasses(adjustedConfidence);
            }

            // Apply contextual adjustments
            if (Object.keys(contextualFactors).length > 0) {
                masses = this.applyContextualAdjustments(masses, contextualFactors);
            }

            const evidence = {
                masses,
                belief: this.calculateBelief(new Map(Object.entries(masses))),
                plausibility: this.calculatePlausibility(new Map(Object.entries(masses))),
                uncertainty: this.calculateUncertainty(new Map(Object.entries(masses))),
                source: sourceType,
                sourceData,
                baseConfidence,
                adjustedConfidence,
                sourceReliability,
                qualityMetrics,
                contextualFactors,
                hypothesis,
                timestamp: new Date()
            };

            return evidence;

        } catch (error) {
            logger.error('Error creating evidence:', error);
            throw error;
        }
    }

    /**
     * Create identity-specific mass assignments
     */
    createIdentityMasses(confidence, qualityMetrics = {}) {
        const masses = {};
        
        // Adjust confidence based on quality metrics
        let adjustedConfidence = confidence;
        
        if (qualityMetrics.faceQuality) {
            adjustedConfidence *= qualityMetrics.faceQuality;
        }
        
        if (qualityMetrics.signalStrength) {
            adjustedConfidence *= Math.max(0.1, (qualityMetrics.signalStrength + 100) / 100);
        }

        // Assign masses to identity hypotheses
        masses['correct_identity'] = Math.max(0, Math.min(0.99, adjustedConfidence));
        masses['incorrect_identity'] = Math.max(0, Math.min(0.3, (1 - adjustedConfidence) * 0.3));
        masses['unknown_identity'] = Math.max(0.01, 1 - masses['correct_identity'] - masses['incorrect_identity']);

        return masses;
    }

    /**
     * Create location-specific mass assignments
     */
    createLocationMasses(confidence, qualityMetrics = {}) {
        const masses = {};
        
        // Adjust confidence based on location precision
        let adjustedConfidence = confidence;
        
        if (qualityMetrics.gpsAccuracy) {
            // Better GPS accuracy increases location confidence
            adjustedConfidence *= Math.min(1, 50 / qualityMetrics.gpsAccuracy);
        }
        
        if (qualityMetrics.signalStrength) {
            // Stronger signal increases location confidence
            adjustedConfidence *= Math.max(0.1, (qualityMetrics.signalStrength + 100) / 100);
        }

        masses['accurate_location'] = Math.max(0, Math.min(0.99, adjustedConfidence));
        masses['approximate_location'] = Math.max(0, Math.min(0.4, (1 - adjustedConfidence) * 0.6));
        masses['inaccurate_location'] = Math.max(0.01, 1 - masses['accurate_location'] - masses['approximate_location']);

        return masses;
    }

    /**
     * Create activity-specific mass assignments
     */
    createActivityMasses(confidence, qualityMetrics = {}) {
        const masses = {};
        
        // Activity classification confidence
        let adjustedConfidence = confidence;
        
        if (qualityMetrics.anomalyScore) {
            // Higher anomaly score reduces normal activity confidence
            adjustedConfidence *= (1 - qualityMetrics.anomalyScore);
        }

        masses['normal_activity'] = Math.max(0, Math.min(0.99, adjustedConfidence));
        masses['suspicious_activity'] = Math.max(0, Math.min(0.3, (1 - adjustedConfidence) * 0.4));
        masses['anomalous_activity'] = Math.max(0.01, 1 - masses['normal_activity'] - masses['suspicious_activity']);

        return masses;
    }

    /**
     * Create reliability-specific mass assignments
     */
    createReliabilityMasses(confidence, qualityMetrics = {}) {
        const masses = {};
        
        masses['reliable_source'] = Math.max(0, Math.min(0.99, confidence));
        masses['unreliable_source'] = Math.max(0, Math.min(0.2, (1 - confidence) * 0.3));
        masses['unknown_reliability'] = Math.max(0.01, 1 - masses['reliable_source'] - masses['unreliable_source']);

        return masses;
    }

    /**
     * Create generic mass assignments
     */
    createGenericMasses(confidence) {
        return {
            'hypothesis': Math.max(0, Math.min(0.99, confidence)),
            'not_hypothesis': Math.max(0, Math.min(0.3, (1 - confidence) * 0.3)),
            'unknown': Math.max(0.01, 1 - confidence - ((1 - confidence) * 0.3))
        };
    }

    /**
     * Apply contextual adjustments to mass assignments
     */
    applyContextualAdjustments(masses, contextualFactors) {
        const adjustedMasses = { ...masses };
        
        // Time-based adjustments
        if (contextualFactors.timeOfDay) {
            const hour = new Date().getHours();
            if (hour < 6 || hour > 22) {
                // Off-hours - increase uncertainty
                const uncertaintyIncrease = 0.1;
                Object.keys(adjustedMasses).forEach(key => {
                    if (key.includes('unknown') || key.includes('uncertain')) {
                        adjustedMasses[key] = Math.min(0.99, adjustedMasses[key] + uncertaintyIncrease);
                    } else {
                        adjustedMasses[key] = Math.max(0.01, adjustedMasses[key] - uncertaintyIncrease / (Object.keys(adjustedMasses).length - 1));
                    }
                });
            }
        }

        // Location-based adjustments
        if (contextualFactors.restrictedArea) {
            // In restricted area - increase suspicion
            if (adjustedMasses['suspicious_activity']) {
                adjustedMasses['suspicious_activity'] = Math.min(0.99, adjustedMasses['suspicious_activity'] + 0.2);
                adjustedMasses['normal_activity'] = Math.max(0.01, adjustedMasses['normal_activity'] - 0.15);
            }
        }

        // Normalize to ensure sum = 1
        const sum = Object.values(adjustedMasses).reduce((a, b) => a + b, 0);
        if (sum > 0) {
            Object.keys(adjustedMasses).forEach(key => {
                adjustedMasses[key] /= sum;
            });
        }

        return adjustedMasses;
    }

    /**
     * Calculate belief function from mass assignments
     */
    calculateBelief(masses) {
        const belief = {};
        const massEntries = masses instanceof Map ? Array.from(masses.entries()) : Object.entries(masses);
        
        // For each singleton hypothesis, belief equals its mass
        massEntries.forEach(([subset, mass]) => {
            if (this.isSingleton(subset)) {
                belief[subset] = mass;
            }
        });

        // For compound hypotheses, belief is sum of masses of all subsets
        massEntries.forEach(([subset, mass]) => {
            if (!this.isSingleton(subset)) {
                const elements = this.parseSubset(subset);
                elements.forEach(element => {
                    belief[element] = (belief[element] || 0) + mass;
                });
            }
        });

        return belief;
    }

    /**
     * Calculate plausibility function from mass assignments
     */
    calculatePlausibility(masses) {
        const plausibility = {};
        const massEntries = masses instanceof Map ? Array.from(masses.entries()) : Object.entries(masses);
        
        // Get all singleton elements
        const singletons = new Set();
        massEntries.forEach(([subset]) => {
            if (this.isSingleton(subset)) {
                singletons.add(subset);
            } else {
                const elements = this.parseSubset(subset);
                elements.forEach(element => singletons.add(element));
            }
        });

        // For each singleton, plausibility is sum of masses of all intersecting subsets
        singletons.forEach(singleton => {
            plausibility[singleton] = 0;
            massEntries.forEach(([subset, mass]) => {
                if (this.subsetIntersects(subset, singleton)) {
                    plausibility[singleton] += mass;
                }
            });
        });

        return plausibility;
    }

    /**
     * Calculate uncertainty from mass assignments
     */
    calculateUncertainty(masses) {
        const massEntries = masses instanceof Map ? Array.from(masses.entries()) : Object.entries(masses);
        
        let uncertainty = 0;
        massEntries.forEach(([subset, mass]) => {
            if (!this.isSingleton(subset)) {
                uncertainty += mass;
            }
        });

        return Math.min(this.config.maxUncertainty, uncertainty);
    }

    /**
     * Dempster normalization (standard approach)
     */
    dempsterNormalization(masses, conflict) {
        const normalizedMasses = new Map();
        const normalizationFactor = 1 - conflict;

        if (normalizationFactor <= 0) {
            // Complete conflict - return uniform distribution
            const uniformMass = 1 / masses.size;
            masses.forEach((_, subset) => {
                normalizedMasses.set(subset, uniformMass);
            });
        } else {
            masses.forEach((mass, subset) => {
                normalizedMasses.set(subset, mass / normalizationFactor);
            });
        }

        return normalizedMasses;
    }

    /**
     * Yager normalization (assigns conflict to uncertainty)
     */
    yaegerNormalization(masses, conflict) {
        const normalizedMasses = new Map(masses);
        
        if (conflict > 0) {
            // Add conflict to the most uncertain element (frame of discernment)
            const frameKey = this.getFrameOfDiscernmentKey(masses);
            const currentMass = normalizedMasses.get(frameKey) || 0;
            normalizedMasses.set(frameKey, currentMass + conflict);
        }

        return normalizedMasses;
    }

    /**
     * Smets normalization (allows non-normalized masses)
     */
    smetsNormalization(masses, conflict) {
        // In Smets' approach, we don't normalize - conflict is preserved
        return new Map(masses);
    }

    /**
     * Get focal elements from two belief structures
     */
    getFocalElements(belief1, belief2) {
        const elements = new Set();
        
        Object.keys(belief1.masses || {}).forEach(subset => elements.add(subset));
        Object.keys(belief2.masses || {}).forEach(subset => elements.add(subset));
        
        return Array.from(elements);
    }

    /**
     * Calculate intersection of two subsets
     */
    intersectSubsets(subset1, subset2) {
        if (subset1 === '∅' || subset2 === '∅') return '∅';
        
        const elements1 = this.parseSubset(subset1);
        const elements2 = this.parseSubset(subset2);
        
        const intersection = elements1.filter(e => elements2.includes(e));
        
        return intersection.length === 0 ? '∅' : intersection.join(',');
    }

    /**
     * Parse subset string into array of elements
     */
    parseSubset(subset) {
        if (subset === '∅' || !subset) return [];
        return subset.split(',').map(s => s.trim());
    }

    /**
     * Check if subset is a singleton (single element)
     */
    isSingleton(subset) {
        const elements = this.parseSubset(subset);
        return elements.length === 1;
    }

    /**
     * Check if two subsets intersect
     */
    subsetIntersects(subset1, subset2) {
        const intersection = this.intersectSubsets(subset1, subset2);
        return intersection !== '∅' && intersection.length > 0;
    }

    /**
     * Get frame of discernment key for uncertainty assignment
     */
    getFrameOfDiscernmentKey(masses) {
        // Return the key that represents maximum uncertainty
        const keys = Array.from(masses.keys());
        
        // Look for keys containing 'unknown', 'uncertain', or the full frame
        const uncertainKeys = keys.filter(key => 
            key.includes('unknown') || key.includes('uncertain') || key.includes('_')
        );
        
        return uncertainKeys.length > 0 ? uncertainKeys[0] : keys[keys.length - 1];
    }

    /**
     * Validate evidence structures
     */
    validateEvidences(evidences, hypothesis) {
        const validEvidences = [];
        
        evidences.forEach((evidence, index) => {
            try {
                // Check required fields
                if (!evidence.masses || typeof evidence.masses !== 'object') {
                    logger.warn(`Evidence ${index} missing or invalid masses`);
                    return;
                }

                // Check mass sum
                const massSum = Object.values(evidence.masses).reduce((sum, mass) => sum + mass, 0);
                if (Math.abs(massSum - 1.0) > 0.01) {
                    logger.warn(`Evidence ${index} masses don't sum to 1: ${massSum}`);
                    // Normalize masses
                    const normalizedMasses = {};
                    Object.entries(evidence.masses).forEach(([key, mass]) => {
                        normalizedMasses[key] = mass / massSum;
                    });
                    evidence.masses = normalizedMasses;
                }

                // Check for negative masses
                const hasNegativeMass = Object.values(evidence.masses).some(mass => mass < 0);
                if (hasNegativeMass) {
                    logger.warn(`Evidence ${index} contains negative masses`);
                    return;
                }

                validEvidences.push(evidence);

            } catch (error) {
                logger.error(`Error validating evidence ${index}:`, error);
            }
        });

        return validEvidences;
    }

    /**
     * Create empty belief structure
     */
    createEmptyBeliefStructure(hypothesis) {
        const frameElements = this.frameOfDiscernment[hypothesis] || ['unknown'];
        const masses = {};
        
        // Assign uniform mass to uncertainty
        masses[frameElements.join(',')] = 1.0;
        
        return {
            masses,
            belief: {},
            plausibility: {},
            uncertainty: 1.0,
            source: 'empty',
            timestamp: new Date()
        };
    }

    /**
     * Normalize belief structure
     */
    normalizeBeliefStructure(evidence, hypothesis) {
        const masses = new Map(Object.entries(evidence.masses));
        
        return {
            ...evidence,
            belief: this.calculateBelief(masses),
            plausibility: this.calculatePlausibility(masses),
            uncertainty: this.calculateUncertainty(masses),
            hypothesis
        };
    }

    /**
     * Get decision based on combined evidence
     */
    makeDecision(combinedEvidence, options = {}) {
        try {
            const {
                decisionThreshold = 0.7,
                uncertaintyThreshold = 0.5,
                conflictThreshold = this.config.conflictThreshold
            } = options;

            const belief = combinedEvidence.combinedBelief.belief;
            const plausibility = combinedEvidence.combinedBelief.plausibility;
            const uncertainty = combinedEvidence.combinedBelief.uncertainty;
            const conflict = combinedEvidence.totalConflict;

            // Find hypothesis with maximum belief
            const maxBeliefHypothesis = Object.entries(belief).reduce((max, [hyp, bel]) => 
                bel > max.belief ? { hypothesis: hyp, belief: bel } : max, 
                { hypothesis: null, belief: 0 }
            );

            // Determine decision confidence
            let confidence = 'low';
            if (maxBeliefHypothesis.belief >= decisionThreshold && uncertainty < uncertaintyThreshold) {
                confidence = 'high';
            } else if (maxBeliefHypothesis.belief >= decisionThreshold * 0.7) {
                confidence = 'medium';
            }

            // Check for high conflict
            const hasHighConflict = conflict > conflictThreshold;

            const decision = {
                hypothesis: maxBeliefHypothesis.hypothesis,
                belief: maxBeliefHypothesis.belief,
                plausibility: plausibility[maxBeliefHypothesis.hypothesis] || 0,
                confidence,
                uncertainty,
                conflict,
                hasHighConflict,
                recommendation: this.getRecommendation(maxBeliefHypothesis, uncertainty, conflict, options),
                evidenceCount: combinedEvidence.evidenceCount,
                timestamp: new Date()
            };

            return decision;

        } catch (error) {
            logger.error('Error making decision:', error);
            throw error;
        }
    }

    /**
     * Get recommendation based on decision analysis
     */
    getRecommendation(maxBeliefHypothesis, uncertainty, conflict, options = {}) {
        const { conflictThreshold = this.config.conflictThreshold } = options;

        if (conflict > conflictThreshold) {
            return {
                action: 'investigate_conflict',
                reason: 'High conflict between evidence sources detected',
                priority: 'high'
            };
        }

        if (uncertainty > 0.7) {
            return {
                action: 'gather_more_evidence',
                reason: 'High uncertainty in current evidence',
                priority: 'medium'
            };
        }

        if (maxBeliefHypothesis.belief > 0.8) {
            return {
                action: 'accept_hypothesis',
                reason: 'Strong evidence supports hypothesis',
                priority: 'low'
            };
        }

        return {
            action: 'continue_monitoring',
            reason: 'Moderate evidence, continue observation',
            priority: 'low'
        };
    }

    /**
     * Update source reliability based on feedback
     */
    updateSourceReliability(sourceType, feedback) {
        try {
            const currentReliability = this.sourceReliability.get(sourceType) || 0.5;
            const learningRate = 0.1;
            
            // Feedback should be between 0 (completely wrong) and 1 (completely correct)
            const newReliability = currentReliability + learningRate * (feedback - currentReliability);
            const clampedReliability = Math.max(0.1, Math.min(0.99, newReliability));
            
            this.sourceReliability.set(sourceType, clampedReliability);
            
            logger.info(`Updated source reliability for ${sourceType}: ${clampedReliability}`, {
                previousReliability: currentReliability,
                feedback,
                newReliability: clampedReliability
            });

        } catch (error) {
            logger.error('Error updating source reliability:', error);
        }
    }

    /**
     * Get source reliability statistics
     */
    getSourceReliabilityStats() {
        const stats = {};
        
        this.sourceReliability.forEach((reliability, sourceType) => {
            stats[sourceType] = {
                reliability,
                category: reliability > 0.8 ? 'high' : reliability > 0.6 ? 'medium' : 'low'
            };
        });

        return stats;
    }

    /**
     * Clear combination cache
     */
    clearCache() {
        this.combinationCache.clear();
        logger.info('Dempster-Shafer combination cache cleared');
    }

    /**
     * Get cache statistics
     */
    getCacheStats() {
        return {
            cacheSize: this.combinationCache.size,
            cacheTimeout: this.cacheTimeout,
            sourceReliabilityEntries: this.sourceReliability.size
        };
    }

    /**
     * Update configuration
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        logger.info('Dempster-Shafer configuration updated', newConfig);
    }

    /**
     * Get current configuration
     */
    getConfig() {
        return { ...this.config };
    }

    /**
     * Export belief structure for visualization
     */
    exportBeliefStructure(beliefStructure) {
        return {
            masses: beliefStructure.masses,
            belief: beliefStructure.belief,
            plausibility: beliefStructure.plausibility,
            uncertainty: beliefStructure.uncertainty,
            source: beliefStructure.source,
            timestamp: beliefStructure.timestamp,
            visualization: {
                massChart: Object.entries(beliefStructure.masses).map(([hypothesis, mass]) => ({
                    hypothesis,
                    mass: Math.round(mass * 1000) / 1000
                })),
                beliefChart: Object.entries(beliefStructure.belief).map(([hypothesis, belief]) => ({
                    hypothesis,
                    belief: Math.round(belief * 1000) / 1000
                })),
                plausibilityChart: Object.entries(beliefStructure.plausibility).map(([hypothesis, plausibility]) => ({
                    hypothesis,
                    plausibility: Math.round(plausibility * 1000) / 1000
                }))
            }
        };
    }
}

module.exports = DempsterShaferService;