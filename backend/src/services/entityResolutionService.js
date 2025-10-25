const EventEmitter = require('events');
const winston = require('winston');
const natural = require('natural');
const stringSimilarity = require('string-similarity');
const Entity = require('../models/Entity');
const CacheService = require('./cacheService');
const BlockingService = require('./blockingService');
const SimilarityService = require('./similarityService');

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
        new winston.transports.File({ filename: 'logs/entity_resolution.log' })
    ]
});

class EntityResolutionService extends EventEmitter {
    constructor(cacheService) {
        super();
        this.cache = cacheService;
        this.blockingService = new BlockingService();
        this.similarityService = new SimilarityService();
        
        // Configuration
        this.config = {
            similarityThreshold: parseFloat(process.env.SIMILARITY_THRESHOLD) || 0.8,
            confidenceThreshold: parseFloat(process.env.CONFIDENCE_THRESHOLD) || 0.7,
            blockingKeySize: parseInt(process.env.BLOCKING_KEY_SIZE) || 3,
            maxCandidates: 1000,
            batchSize: 100
        };
        
        // Performance metrics
        this.metrics = {
            totalComparisons: 0,
            blockedComparisons: 0,
            matches: 0,
            processingTime: 0,
            accuracy: 0
        };
    }

    /**
     * Main entity resolution method
     * @param {Object} inputRecord - New record to resolve
     * @param {Array} candidateEntities - Optional candidate entities
     * @returns {Object} Resolution result
     */
    async resolveEntity(inputRecord, candidateEntities = null) {
        const startTime = Date.now();
        
        try {
            logger.info('Starting entity resolution', { 
                recordId: inputRecord.id,
                recordType: inputRecord.type 
            });

            // Step 1: Generate blocking keys and find candidates
            let candidates = candidateEntities;
            if (!candidates) {
                candidates = await this.findCandidates(inputRecord);
            }

            logger.debug(`Found ${candidates.length} candidate entities`);

            // Step 2: Calculate similarities for all candidates
            const similarities = await this.calculateSimilarities(inputRecord, candidates);

            // Step 3: Apply Fellegi-Sunter probabilistic linkage
            const linkageResults = await this.applyProbabilisticLinkage(similarities);

            // Step 4: Make final decision
            const resolution = await this.makeResolutionDecision(inputRecord, linkageResults);

            // Update metrics
            this.updateMetrics(startTime, candidates.length, resolution);

            logger.info('Entity resolution completed', {
                recordId: inputRecord.id,
                resolution: resolution.decision,
                confidence: resolution.confidence,
                processingTime: Date.now() - startTime
            });

            return resolution;

        } catch (error) {
            logger.error('Entity resolution failed', { 
                recordId: inputRecord.id,
                error: error.message 
            });
            throw error;
        }
    }

    /**
     * Find candidate entities using blocking
     */
    async findCandidates(inputRecord) {
        try {
            // Generate blocking keys
            const blockingKeys = this.blockingService.generateBlockingKeys(inputRecord);
            
            let allCandidates = new Set();
            
            // Find candidates for each blocking key
            for (const key of blockingKeys) {
                const candidates = await this.blockingService.findCandidatesByKey(key);
                candidates.forEach(candidate => allCandidates.add(candidate));
                
                // Limit total candidates to prevent performance issues
                if (allCandidates.size >= this.config.maxCandidates) {
                    break;
                }
            }

            return Array.from(allCandidates);

        } catch (error) {
            logger.error('Error finding candidates', error);
            throw error;
        }
    }

    /**
     * Calculate similarities between input record and candidates
     */
    async calculateSimilarities(inputRecord, candidates) {
        const similarities = [];
        
        for (const candidate of candidates) {
            try {
                const similarity = await this.similarityService.calculateCompositeSimilarity(
                    inputRecord, 
                    candidate
                );
                
                similarities.push({
                    candidate: candidate,
                    similarity: similarity,
                    recordPair: {
                        record1: inputRecord,
                        record2: candidate
                    }
                });
                
                this.metrics.totalComparisons++;
                
            } catch (error) {
                logger.warn('Error calculating similarity', {
                    candidateId: candidate._id,
                    error: error.message
                });
            }
        }

        // Sort by similarity score (descending)
        similarities.sort((a, b) => b.similarity.overall - a.similarity.overall);
        
        return similarities;
    }

    /**
     * Apply Fellegi-Sunter probabilistic record linkage
     */
    async applyProbabilisticLinkage(similarities) {
        const results = [];
        
        for (const simResult of similarities) {
            try {
                // Calculate m and u probabilities for each field
                const fieldProbabilities = await this.calculateFieldProbabilities(simResult);
                
                // Calculate log-likelihood ratio
                const logLikelihoodRatio = this.calculateLogLikelihoodRatio(fieldProbabilities);
                
                // Convert to probability
                const matchProbability = this.logOddsToProb(logLikelihoodRatio);
                
                results.push({
                    candidate: simResult.candidate,
                    similarity: simResult.similarity,
                    matchProbability: matchProbability,
                    logLikelihoodRatio: logLikelihoodRatio,
                    fieldProbabilities: fieldProbabilities
                });
                
            } catch (error) {
                logger.warn('Error in probabilistic linkage', {
                    candidateId: simResult.candidate._id,
                    error: error.message
                });
            }
        }

        return results.sort((a, b) => b.matchProbability - a.matchProbability);
    }

    /**
     * Calculate field-specific m and u probabilities
     */
    async calculateFieldProbabilities(simResult) {
        const { similarity, recordPair } = simResult;
        
        // These would typically be learned from training data
        // For now, using heuristic values
        const fieldProbs = {
            name: {
                m: similarity.name > 0.9 ? 0.95 : (similarity.name > 0.7 ? 0.7 : 0.1),
                u: 0.01
            },
            email: {
                m: similarity.email === 1.0 ? 0.99 : 0.01,
                u: 0.001
            },
            phone: {
                m: similarity.phone === 1.0 ? 0.95 : 0.05,
                u: 0.01
            },
            card_id: {
                m: similarity.card_id === 1.0 ? 0.99 : 0.01,
                u: 0.001
            },
            device_hash: {
                m: similarity.device_hash > 0.8 ? 0.9 : 0.1,
                u: 0.05
            },
            face_embedding: {
                m: similarity.face_embedding > 0.8 ? 0.85 : 0.15,
                u: 0.1
            }
        };

        return fieldProbs;
    }

    /**
     * Calculate log-likelihood ratio
     */
    calculateLogLikelihoodRatio(fieldProbabilities) {
        let logRatio = 0;
        
        for (const [field, probs] of Object.entries(fieldProbabilities)) {
            if (probs.m > 0 && probs.u > 0) {
                logRatio += Math.log(probs.m / probs.u);
            }
        }
        
        return logRatio;
    }

    /**
     * Convert log odds to probability
     */
    logOddsToProb(logOdds) {
        const odds = Math.exp(logOdds);
        return odds / (1 + odds);
    }

    /**
     * Make final resolution decision
     */
    async makeResolutionDecision(inputRecord, linkageResults) {
        if (linkageResults.length === 0) {
            return {
                decision: 'CREATE_NEW',
                confidence: 1.0,
                entity: null,
                reasoning: 'No candidate entities found'
            };
        }

        const bestMatch = linkageResults[0];
        
        // Decision thresholds
        const highThreshold = 0.9;
        const lowThreshold = 0.3;
        
        if (bestMatch.matchProbability >= highThreshold) {
            return {
                decision: 'MATCH',
                confidence: bestMatch.matchProbability,
                entity: bestMatch.candidate,
                reasoning: `High confidence match (${bestMatch.matchProbability.toFixed(3)})`
            };
        } else if (bestMatch.matchProbability <= lowThreshold) {
            return {
                decision: 'CREATE_NEW',
                confidence: 1 - bestMatch.matchProbability,
                entity: null,
                reasoning: `Low match probability (${bestMatch.matchProbability.toFixed(3)})`
            };
        } else {
            return {
                decision: 'MANUAL_REVIEW',
                confidence: bestMatch.matchProbability,
                entity: bestMatch.candidate,
                reasoning: `Uncertain match requiring manual review (${bestMatch.matchProbability.toFixed(3)})`,
                alternatives: linkageResults.slice(1, 3) // Top 2 alternatives
            };
        }
    }

    /**
     * Batch entity resolution for multiple records
     */
    async resolveBatch(inputRecords) {
        const results = [];
        const batchSize = this.config.batchSize;
        
        for (let i = 0; i < inputRecords.length; i += batchSize) {
            const batch = inputRecords.slice(i, i + batchSize);
            
            const batchPromises = batch.map(record => 
                this.resolveEntity(record).catch(error => ({
                    record: record,
                    error: error.message,
                    decision: 'ERROR'
                }))
            );
            
            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);
            
            // Log progress
            logger.info(`Processed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(inputRecords.length / batchSize)}`);
        }
        
        return results;
    }

    /**
     * Update performance metrics
     */
    updateMetrics(startTime, candidateCount, resolution) {
        this.metrics.processingTime += Date.now() - startTime;
        this.metrics.blockedComparisons += candidateCount;
        
        if (resolution.decision === 'MATCH') {
            this.metrics.matches++;
        }
    }

    /**
     * Get performance metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            averageProcessingTime: this.metrics.processingTime / Math.max(1, this.metrics.totalComparisons),
            blockingEfficiency: 1 - (this.metrics.blockedComparisons / Math.max(1, this.metrics.totalComparisons)),
            matchRate: this.metrics.matches / Math.max(1, this.metrics.totalComparisons)
        };
    }

    /**
     * Clear metrics
     */
    clearMetrics() {
        this.metrics = {
            totalComparisons: 0,
            blockedComparisons: 0,
            matches: 0,
            processingTime: 0,
            accuracy: 0
        };
    }
}

module.exports = EntityResolutionService;