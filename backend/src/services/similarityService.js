const natural = require('natural');
const stringSimilarity = require('string-similarity');
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
        new winston.transports.File({ filename: 'logs/similarity.log' })
    ]
});

class SimilarityService {
    constructor() {
        // Initialize phonetic algorithms
        this.soundex = natural.SoundEx;
        this.metaphone = natural.Metaphone;
        this.doubleMetaphone = natural.DoubleMetaphone;
        
        // Similarity weights for different fields
        this.fieldWeights = {
            name: 0.3,
            email: 0.25,
            phone: 0.15,
            card_id: 0.15,
            device_hash: 0.1,
            face_embedding: 0.05
        };
    }

    /**
     * Calculate composite similarity between two records
     * @param {Object} record1 - First record
     * @param {Object} record2 - Second record
     * @returns {Object} Similarity scores
     */
    async calculateCompositeSimilarity(record1, record2) {
        try {
            const similarities = {
                name: this.calculateNameSimilarity(
                    record1.profile?.name || record1.name,
                    record2.profile?.name || record2.name
                ),
                email: this.calculateExactMatch(
                    record1.identifiers?.email || record1.email,
                    record2.identifiers?.email || record2.email
                ),
                phone: this.calculatePhoneSimilarity(
                    record1.identifiers?.phone || record1.phone,
                    record2.identifiers?.phone || record2.phone
                ),
                card_id: this.calculateExactMatch(
                    record1.identifiers?.card_id || record1.card_id,
                    record2.identifiers?.card_id || record2.card_id
                ),
                device_hash: this.calculateDeviceHashSimilarity(
                    record1.identifiers?.device_hashes || record1.device_hashes || [],
                    record2.identifiers?.device_hashes || record2.device_hashes || []
                ),
                face_embedding: this.calculateFaceEmbeddingSimilarity(
                    record1.identifiers?.face_embedding || record1.face_embedding,
                    record2.identifiers?.face_embedding || record2.face_embedding
                )
            };

            // Calculate weighted overall similarity
            let weightedSum = 0;
            let totalWeight = 0;

            for (const [field, similarity] of Object.entries(similarities)) {
                if (similarity !== null && similarity !== undefined) {
                    weightedSum += similarity * this.fieldWeights[field];
                    totalWeight += this.fieldWeights[field];
                }
            }

            const overall = totalWeight > 0 ? weightedSum / totalWeight : 0;

            return {
                ...similarities,
                overall: overall,
                confidence: this.calculateConfidence(similarities)
            };

        } catch (error) {
            logger.error('Error calculating composite similarity:', error);
            throw error;
        }
    }

    /**
     * Calculate name similarity using multiple algorithms
     */
    calculateNameSimilarity(name1, name2) {
        if (!name1 || !name2) return null;
        
        // Normalize names
        const norm1 = this.normalizeName(name1);
        const norm2 = this.normalizeName(name2);
        
        if (norm1 === norm2) return 1.0;
        
        // Calculate different similarity measures
        const jaroWinkler = natural.JaroWinklerDistance(norm1, norm2);
        const levenshtein = 1 - (natural.LevenshteinDistance(norm1, norm2) / Math.max(norm1.length, norm2.length));
        const jaccard = this.calculateJaccardSimilarity(norm1.split(' '), norm2.split(' '));
        
        // Phonetic similarity
        const soundexSim = this.soundex.compare(norm1, norm2) ? 1.0 : 0.0;
        const metaphoneSim = this.metaphone.compare(norm1, norm2) ? 1.0 : 0.0;
        
        // Weighted combination
        const similarity = (
            jaroWinkler * 0.4 +
            levenshtein * 0.3 +
            jaccard * 0.2 +
            soundexSim * 0.05 +
            metaphoneSim * 0.05
        );
        
        return Math.min(1.0, Math.max(0.0, similarity));
    }

    /**
     * Calculate exact match similarity
     */
    calculateExactMatch(value1, value2) {
        if (!value1 || !value2) return null;
        return value1.toLowerCase() === value2.toLowerCase() ? 1.0 : 0.0;
    }

    /**
     * Calculate phone number similarity
     */
    calculatePhoneSimilarity(phone1, phone2) {
        if (!phone1 || !phone2) return null;
        
        // Normalize phone numbers (remove non-digits)
        const norm1 = phone1.replace(/\D/g, '');
        const norm2 = phone2.replace(/\D/g, '');
        
        if (norm1 === norm2) return 1.0;
        
        // Check if one is a substring of the other (different formats)
        if (norm1.includes(norm2) || norm2.includes(norm1)) {
            return 0.9;
        }
        
        // Calculate edit distance for partial matches
        const maxLen = Math.max(norm1.length, norm2.length);
        if (maxLen === 0) return 0.0;
        
        const editDistance = natural.LevenshteinDistance(norm1, norm2);
        return Math.max(0.0, 1 - (editDistance / maxLen));
    }

    /**
     * Calculate device hash similarity
     */
    calculateDeviceHashSimilarity(hashes1, hashes2) {
        if (!hashes1 || !hashes2 || hashes1.length === 0 || hashes2.length === 0) {
            return null;
        }
        
        // Check for exact matches
        for (const hash1 of hashes1) {
            for (const hash2 of hashes2) {
                if (hash1 === hash2) {
                    return 1.0;
                }
            }
        }
        
        // Calculate best partial similarity
        let maxSimilarity = 0.0;
        
        for (const hash1 of hashes1) {
            for (const hash2 of hashes2) {
                const similarity = stringSimilarity.compareTwoStrings(hash1, hash2);
                maxSimilarity = Math.max(maxSimilarity, similarity);
            }
        }
        
        return maxSimilarity;
    }

    /**
     * Calculate face embedding similarity using cosine similarity
     */
    calculateFaceEmbeddingSimilarity(embedding1, embedding2) {
        if (!embedding1 || !embedding2) return null;
        
        // Ensure embeddings are arrays
        const emb1 = Array.isArray(embedding1) ? embedding1 : JSON.parse(embedding1);
        const emb2 = Array.isArray(embedding2) ? embedding2 : JSON.parse(embedding2);
        
        if (emb1.length !== emb2.length) return 0.0;
        
        return this.cosineSimilarity(emb1, emb2);
    }

    /**
     * Calculate cosine similarity between two vectors
     */
    cosineSimilarity(vec1, vec2) {
        if (vec1.length !== vec2.length) return 0.0;
        
        let dotProduct = 0.0;
        let norm1 = 0.0;
        let norm2 = 0.0;
        
        for (let i = 0; i < vec1.length; i++) {
            dotProduct += vec1[i] * vec2[i];
            norm1 += vec1[i] * vec1[i];
            norm2 += vec2[i] * vec2[i];
        }
        
        if (norm1 === 0.0 || norm2 === 0.0) return 0.0;
        
        return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
    }

    /**
     * Calculate Jaccard similarity for token sets
     */
    calculateJaccardSimilarity(tokens1, tokens2) {
        const set1 = new Set(tokens1.map(t => t.toLowerCase()));
        const set2 = new Set(tokens2.map(t => t.toLowerCase()));
        
        const intersection = new Set([...set1].filter(x => set2.has(x)));
        const union = new Set([...set1, ...set2]);
        
        return union.size === 0 ? 0.0 : intersection.size / union.size;
    }

    /**
     * Normalize name for comparison
     */
    normalizeName(name) {
        return name
            .toLowerCase()
            .trim()
            .replace(/[^\w\s]/g, '') // Remove punctuation
            .replace(/\s+/g, ' ') // Normalize whitespace
            .split(' ')
            .sort() // Sort tokens for order-independent comparison
            .join(' ');
    }

    /**
     * Calculate confidence score based on similarity distribution
     */
    calculateConfidence(similarities) {
        const validSimilarities = Object.values(similarities)
            .filter(sim => sim !== null && sim !== undefined);
        
        if (validSimilarities.length === 0) return 0.0;
        
        // Calculate variance to determine confidence
        const mean = validSimilarities.reduce((sum, sim) => sum + sim, 0) / validSimilarities.length;
        const variance = validSimilarities.reduce((sum, sim) => sum + Math.pow(sim - mean, 2), 0) / validSimilarities.length;
        
        // High variance = low confidence, low variance = high confidence
        const confidenceFromVariance = Math.max(0.0, 1.0 - variance);
        
        // Also consider the number of matching fields
        const matchingFields = validSimilarities.filter(sim => sim > 0.7).length;
        const confidenceFromMatches = matchingFields / validSimilarities.length;
        
        // Combine confidence measures
        return (confidenceFromVariance * 0.6 + confidenceFromMatches * 0.4);
    }

    /**
     * Calculate similarity matrix for a set of records
     */
    async calculateSimilarityMatrix(records) {
        const matrix = [];
        const n = records.length;
        
        for (let i = 0; i < n; i++) {
            matrix[i] = [];
            for (let j = 0; j < n; j++) {
                if (i === j) {
                    matrix[i][j] = 1.0;
                } else if (i < j) {
                    // Calculate similarity only for upper triangle
                    const similarity = await this.calculateCompositeSimilarity(records[i], records[j]);
                    matrix[i][j] = similarity.overall;
                } else {
                    // Mirror the upper triangle
                    matrix[i][j] = matrix[j][i];
                }
            }
        }
        
        return matrix;
    }

    /**
     * Find most similar records above threshold
     */
    async findSimilarRecords(targetRecord, candidateRecords, threshold = 0.7) {
        const similarities = [];
        
        for (const candidate of candidateRecords) {
            const similarity = await this.calculateCompositeSimilarity(targetRecord, candidate);
            
            if (similarity.overall >= threshold) {
                similarities.push({
                    record: candidate,
                    similarity: similarity
                });
            }
        }
        
        // Sort by similarity (descending)
        similarities.sort((a, b) => b.similarity.overall - a.similarity.overall);
        
        return similarities;
    }

    /**
     * Batch similarity calculation with progress tracking
     */
    async calculateBatchSimilarities(record, candidates, progressCallback = null) {
        const results = [];
        const batchSize = 100;
        
        for (let i = 0; i < candidates.length; i += batchSize) {
            const batch = candidates.slice(i, i + batchSize);
            
            const batchPromises = batch.map(candidate => 
                this.calculateCompositeSimilarity(record, candidate)
                    .then(similarity => ({ candidate, similarity }))
                    .catch(error => ({ candidate, error: error.message }))
            );
            
            const batchResults = await Promise.all(batchPromises);
            results.push(...batchResults);
            
            // Report progress
            if (progressCallback) {
                const progress = Math.min(100, Math.round(((i + batchSize) / candidates.length) * 100));
                progressCallback(progress);
            }
        }
        
        return results;
    }

    /**
     * Get similarity statistics for analysis
     */
    calculateSimilarityStats(similarities) {
        const scores = similarities.map(s => s.similarity?.overall || 0).filter(s => s > 0);
        
        if (scores.length === 0) {
            return {
                count: 0,
                mean: 0,
                median: 0,
                std: 0,
                min: 0,
                max: 0
            };
        }
        
        scores.sort((a, b) => a - b);
        
        const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
        const median = scores[Math.floor(scores.length / 2)];
        const variance = scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scores.length;
        const std = Math.sqrt(variance);
        
        return {
            count: scores.length,
            mean: mean,
            median: median,
            std: std,
            min: scores[0],
            max: scores[scores.length - 1]
        };
    }
}

module.exports = SimilarityService;