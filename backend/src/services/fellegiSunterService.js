const winston = require('winston');
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
        new winston.transports.File({ filename: 'logs/fellegi_sunter.log' })
    ]
});

class FellegiSunterService {
    constructor() {
        // Field-specific m and u probabilities
        // These would typically be learned from training data
        this.fieldProbabilities = {
            name: {
                m: { // Probability that field agrees given records match
                    exact: 0.95,
                    high_similarity: 0.85,
                    medium_similarity: 0.60,
                    low_similarity: 0.30,
                    no_similarity: 0.05
                },
                u: { // Probability that field agrees given records don't match
                    exact: 0.001,
                    high_similarity: 0.01,
                    medium_similarity: 0.05,
                    low_similarity: 0.15,
                    no_similarity: 0.829
                }
            },
            email: {
                m: {
                    exact: 0.99,
                    no_match: 0.01
                },
                u: {
                    exact: 0.0001,
                    no_match: 0.9999
                }
            },
            phone: {
                m: {
                    exact: 0.95,
                    partial: 0.80,
                    no_match: 0.05
                },
                u: {
                    exact: 0.001,
                    partial: 0.01,
                    no_match: 0.989
                }
            },
            card_id: {
                m: {
                    exact: 0.99,
                    no_match: 0.01
                },
                u: {
                    exact: 0.0001,
                    no_match: 0.9999
                }
            },
            device_hash: {
                m: {
                    exact: 0.90,
                    high_similarity: 0.70,
                    no_match: 0.10
                },
                u: {
                    exact: 0.01,
                    high_similarity: 0.05,
                    no_match: 0.94
                }
            },
            face_embedding: {
                m: {
                    high_similarity: 0.85,
                    medium_similarity: 0.70,
                    low_similarity: 0.40,
                    no_similarity: 0.15
                },
                u: {
                    high_similarity: 0.05,
                    medium_similarity: 0.15,
                    low_similarity: 0.30,
                    no_similarity: 0.50
                }
            }
        };

        // Decision thresholds
        this.thresholds = {
            match: parseFloat(process.env.MATCH_THRESHOLD) || 8.0,      // Log-likelihood ratio for definite match
            nonMatch: parseFloat(process.env.NON_MATCH_THRESHOLD) || -8.0, // Log-likelihood ratio for definite non-match
            confidence: parseFloat(process.env.CONFIDENCE_THRESHOLD) || 0.7
        };

        // Training data for parameter estimation
        this.trainingData = {
            matches: [],
            nonMatches: [],
            lastUpdated: null
        };
    }

    /**
     * Apply Fellegi-Sunter probabilistic record linkage
     * @param {Object} record1 - First record
     * @param {Object} record2 - Second record
     * @param {Object} similarities - Pre-calculated similarity scores
     * @returns {Object} Linkage result with probability and decision
     */
    async applyProbabilisticLinkage(record1, record2, similarities) {
        const timerId = performanceMonitor.startTimer('fellegi_sunter', {
            record1Id: record1._id || record1.id,
            record2Id: record2._id || record2.id
        });

        try {
            // Step 1: Classify similarity levels for each field
            const fieldClassifications = this.classifyFieldSimilarities(similarities);

            // Step 2: Calculate log-likelihood ratio
            const logLikelihoodRatio = this.calculateLogLikelihoodRatio(fieldClassifications);

            // Step 3: Convert to match probability
            const matchProbability = this.logOddsToProb(logLikelihoodRatio);

            // Step 4: Make decision based on thresholds
            const decision = this.makeDecision(logLikelihoodRatio, matchProbability);

            // Step 5: Calculate confidence score
            const confidence = this.calculateConfidence(logLikelihoodRatio, fieldClassifications);

            const result = {
                logLikelihoodRatio: logLikelihoodRatio,
                matchProbability: matchProbability,
                decision: decision,
                confidence: confidence,
                fieldClassifications: fieldClassifications,
                fieldContributions: this.calculateFieldContributions(fieldClassifications),
                metadata: {
                    algorithm: 'fellegi_sunter',
                    version: '1.0.0',
                    timestamp: new Date().toISOString()
                }
            };

            performanceMonitor.endTimer(timerId);
            performanceMonitor.incrementCounter('fellegi_sunter_linkages', 1, { decision: decision });

            return result;

        } catch (error) {
            performanceMonitor.endTimer(timerId);
            logger.error('Fellegi-Sunter linkage failed:', error);
            throw error;
        }
    }

    /**
     * Classify similarity scores into discrete categories
     */
    classifyFieldSimilarities(similarities) {
        const classifications = {};

        // Name classification
        if (similarities.name !== null && similarities.name !== undefined) {
            if (similarities.name >= 0.95) {
                classifications.name = 'exact';
            } else if (similarities.name >= 0.85) {
                classifications.name = 'high_similarity';
            } else if (similarities.name >= 0.60) {
                classifications.name = 'medium_similarity';
            } else if (similarities.name >= 0.30) {
                classifications.name = 'low_similarity';
            } else {
                classifications.name = 'no_similarity';
            }
        }

        // Email classification
        if (similarities.email !== null && similarities.email !== undefined) {
            classifications.email = similarities.email === 1.0 ? 'exact' : 'no_match';
        }

        // Phone classification
        if (similarities.phone !== null && similarities.phone !== undefined) {
            if (similarities.phone === 1.0) {
                classifications.phone = 'exact';
            } else if (similarities.phone >= 0.8) {
                classifications.phone = 'partial';
            } else {
                classifications.phone = 'no_match';
            }
        }

        // Card ID classification
        if (similarities.card_id !== null && similarities.card_id !== undefined) {
            classifications.card_id = similarities.card_id === 1.0 ? 'exact' : 'no_match';
        }

        // Device hash classification
        if (similarities.device_hash !== null && similarities.device_hash !== undefined) {
            if (similarities.device_hash === 1.0) {
                classifications.device_hash = 'exact';
            } else if (similarities.device_hash >= 0.8) {
                classifications.device_hash = 'high_similarity';
            } else {
                classifications.device_hash = 'no_match';
            }
        }

        // Face embedding classification
        if (similarities.face_embedding !== null && similarities.face_embedding !== undefined) {
            if (similarities.face_embedding >= 0.85) {
                classifications.face_embedding = 'high_similarity';
            } else if (similarities.face_embedding >= 0.70) {
                classifications.face_embedding = 'medium_similarity';
            } else if (similarities.face_embedding >= 0.50) {
                classifications.face_embedding = 'low_similarity';
            } else {
                classifications.face_embedding = 'no_similarity';
            }
        }

        return classifications;
    }

    /**
     * Calculate log-likelihood ratio for all fields
     */
    calculateLogLikelihoodRatio(fieldClassifications) {
        let logRatio = 0.0;

        for (const [field, classification] of Object.entries(fieldClassifications)) {
            const fieldProbs = this.fieldProbabilities[field];
            
            if (fieldProbs && fieldProbs.m[classification] && fieldProbs.u[classification]) {
                const m = fieldProbs.m[classification];
                const u = fieldProbs.u[classification];
                
                if (m > 0 && u > 0) {
                    const fieldLogRatio = Math.log(m / u);
                    logRatio += fieldLogRatio;
                    
                    logger.debug(`Field ${field} (${classification}): m=${m}, u=${u}, log_ratio=${fieldLogRatio}`);
                }
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
     * Make linkage decision based on thresholds
     */
    makeDecision(logLikelihoodRatio, matchProbability) {
        if (logLikelihoodRatio >= this.thresholds.match) {
            return 'MATCH';
        } else if (logLikelihoodRatio <= this.thresholds.nonMatch) {
            return 'NON_MATCH';
        } else {
            return 'POSSIBLE_MATCH';
        }
    }

    /**
     * Calculate confidence score
     */
    calculateConfidence(logLikelihoodRatio, fieldClassifications) {
        // Base confidence from log-likelihood ratio magnitude
        const ratioConfidence = Math.min(1.0, Math.abs(logLikelihoodRatio) / 10.0);
        
        // Confidence from number of agreeing fields
        const agreeingFields = Object.values(fieldClassifications).filter(
            classification => ['exact', 'high_similarity'].includes(classification)
        ).length;
        
        const fieldConfidence = agreeingFields / Object.keys(fieldClassifications).length;
        
        // Combined confidence
        return (ratioConfidence * 0.7 + fieldConfidence * 0.3);
    }

    /**
     * Calculate individual field contributions to the decision
     */
    calculateFieldContributions(fieldClassifications) {
        const contributions = {};
        let totalContribution = 0;

        // Calculate raw contributions
        for (const [field, classification] of Object.entries(fieldClassifications)) {
            const fieldProbs = this.fieldProbabilities[field];
            
            if (fieldProbs && fieldProbs.m[classification] && fieldProbs.u[classification]) {
                const m = fieldProbs.m[classification];
                const u = fieldProbs.u[classification];
                const logRatio = Math.log(m / u);
                
                contributions[field] = {
                    logRatio: logRatio,
                    classification: classification,
                    weight: Math.abs(logRatio)
                };
                
                totalContribution += Math.abs(logRatio);
            }
        }

        // Normalize contributions to percentages
        for (const field of Object.keys(contributions)) {
            contributions[field].percentage = totalContribution > 0 
                ? (contributions[field].weight / totalContribution) * 100 
                : 0;
        }

        return contributions;
    }

    /**
     * Batch probabilistic linkage for multiple record pairs
     */
    async batchProbabilisticLinkage(recordPairs) {
        const results = [];
        const batchSize = 100;

        for (let i = 0; i < recordPairs.length; i += batchSize) {
            const batch = recordPairs.slice(i, i + batchSize);
            
            const batchPromises = batch.map(async ({ record1, record2, similarities }) => {
                try {
                    return await this.applyProbabilisticLinkage(record1, record2, similarities);
                } catch (error) {
                    logger.error(`Batch linkage error for pair ${record1.id}-${record2.id}:`, error);
                    return {
                        error: error.message,
                        decision: 'ERROR',
                        confidence: 0
                    };
                }
            });

            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);

            // Log progress
            logger.info(`Processed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(recordPairs.length / batchSize)}`);
        }

        return results;
    }

    /**
     * Update field probabilities based on training data
     */
    async updateFieldProbabilities(trainingData) {
        logger.info('Updating Fellegi-Sunter field probabilities from training data');

        try {
            const { matches, nonMatches } = trainingData;
            
            // Calculate new m and u probabilities for each field
            for (const field of Object.keys(this.fieldProbabilities)) {
                const fieldProbs = this.calculateFieldProbabilities(field, matches, nonMatches);
                this.fieldProbabilities[field] = fieldProbs;
            }

            this.trainingData.lastUpdated = new Date();
            
            logger.info('Field probabilities updated successfully', {
                matchCount: matches.length,
                nonMatchCount: nonMatches.length,
                updatedAt: this.trainingData.lastUpdated
            });

        } catch (error) {
            logger.error('Error updating field probabilities:', error);
            throw error;
        }
    }

    /**
     * Calculate field probabilities from training data
     */
    calculateFieldProbabilities(field, matches, nonMatches) {
        const mCounts = {};
        const uCounts = {};
        
        // Count occurrences in matches
        for (const match of matches) {
            const classification = match.fieldClassifications[field];
            if (classification) {
                mCounts[classification] = (mCounts[classification] || 0) + 1;
            }
        }
        
        // Count occurrences in non-matches
        for (const nonMatch of nonMatches) {
            const classification = nonMatch.fieldClassifications[field];
            if (classification) {
                uCounts[classification] = (uCounts[classification] || 0) + 1;
            }
        }
        
        // Convert counts to probabilities
        const totalMatches = matches.length;
        const totalNonMatches = nonMatches.length;
        
        const mProbs = {};
        const uProbs = {};
        
        for (const classification of Object.keys({...mCounts, ...uCounts})) {
            mProbs[classification] = (mCounts[classification] || 0) / totalMatches;
            uProbs[classification] = (uCounts[classification] || 0) / totalNonMatches;
        }
        
        return { m: mProbs, u: uProbs };
    }

    /**
     * Evaluate linkage quality using labeled data
     */
    async evaluateLinkageQuality(testData) {
        const results = {
            totalPairs: testData.length,
            correctMatches: 0,
            correctNonMatches: 0,
            falsePositives: 0,
            falseNegatives: 0,
            possibleMatches: 0
        };

        for (const testPair of testData) {
            const { record1, record2, similarities, trueLabel } = testPair;
            
            const linkageResult = await this.applyProbabilisticLinkage(record1, record2, similarities);
            const predictedLabel = linkageResult.decision;
            
            if (trueLabel === 'MATCH') {
                if (predictedLabel === 'MATCH') {
                    results.correctMatches++;
                } else if (predictedLabel === 'NON_MATCH') {
                    results.falseNegatives++;
                } else {
                    results.possibleMatches++;
                }
            } else { // trueLabel === 'NON_MATCH'
                if (predictedLabel === 'NON_MATCH') {
                    results.correctNonMatches++;
                } else if (predictedLabel === 'MATCH') {
                    results.falsePositives++;
                } else {
                    results.possibleMatches++;
                }
            }
        }

        // Calculate performance metrics
        const precision = results.correctMatches / (results.correctMatches + results.falsePositives);
        const recall = results.correctMatches / (results.correctMatches + results.falseNegatives);
        const f1Score = 2 * (precision * recall) / (precision + recall);
        const accuracy = (results.correctMatches + results.correctNonMatches) / results.totalPairs;

        return {
            ...results,
            precision: precision || 0,
            recall: recall || 0,
            f1Score: f1Score || 0,
            accuracy: accuracy || 0
        };
    }

    /**
     * Get current configuration and statistics
     */
    getConfiguration() {
        return {
            fieldProbabilities: this.fieldProbabilities,
            thresholds: this.thresholds,
            trainingData: {
                matchCount: this.trainingData.matches.length,
                nonMatchCount: this.trainingData.nonMatches.length,
                lastUpdated: this.trainingData.lastUpdated
            }
        };
    }

    /**
     * Update decision thresholds
     */
    updateThresholds(newThresholds) {
        this.thresholds = { ...this.thresholds, ...newThresholds };
        
        logger.info('Fellegi-Sunter thresholds updated', {
            oldThresholds: this.thresholds,
            newThresholds: newThresholds
        });
    }

    /**
     * Generate explanation for a linkage decision
     */
    generateExplanation(linkageResult) {
        const { decision, confidence, fieldContributions, logLikelihoodRatio } = linkageResult;
        
        // Sort fields by contribution
        const sortedContributions = Object.entries(fieldContributions)
            .sort(([,a], [,b]) => b.percentage - a.percentage);
        
        const explanation = {
            decision: decision,
            confidence: Math.round(confidence * 100),
            logLikelihoodRatio: Math.round(logLikelihoodRatio * 100) / 100,
            reasoning: [],
            topContributors: []
        };
        
        // Add decision reasoning
        if (decision === 'MATCH') {
            explanation.reasoning.push(`Strong evidence for match (log-likelihood ratio: ${explanation.logLikelihoodRatio})`);
        } else if (decision === 'NON_MATCH') {
            explanation.reasoning.push(`Strong evidence against match (log-likelihood ratio: ${explanation.logLikelihoodRatio})`);
        } else {
            explanation.reasoning.push(`Uncertain match requiring review (log-likelihood ratio: ${explanation.logLikelihoodRatio})`);
        }
        
        // Add top contributing fields
        for (const [field, contribution] of sortedContributions.slice(0, 3)) {
            explanation.topContributors.push({
                field: field,
                classification: contribution.classification,
                contribution: Math.round(contribution.percentage),
                impact: contribution.logRatio > 0 ? 'positive' : 'negative'
            });
        }
        
        return explanation;
    }
}

module.exports = FellegiSunterService;