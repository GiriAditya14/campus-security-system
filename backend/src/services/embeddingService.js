const winston = require('winston');
const axios = require('axios');
const crypto = require('crypto');

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
        new winston.transports.File({ filename: 'logs/embedding.log' })
    ]
});

class EmbeddingService {
    constructor() {
        this.config = {
            mlServiceUrl: process.env.ML_SERVICE_URL || 'http://localhost:8001',
            mlServiceApiKey: process.env.ML_SERVICE_API_KEY || 'ml-service-dev-key-123',
            textEmbeddingModel: process.env.TEXT_EMBEDDING_MODEL || 'sentence-transformers/all-MiniLM-L6-v2',
            faceEmbeddingModel: process.env.FACE_EMBEDDING_MODEL || 'facenet',
            embeddingDimension: parseInt(process.env.EMBEDDING_DIMENSION) || 128,
            batchSize: parseInt(process.env.EMBEDDING_BATCH_SIZE) || 32,
            cacheEmbeddings: process.env.CACHE_EMBEDDINGS !== 'false',
            embeddingTimeout: parseInt(process.env.EMBEDDING_TIMEOUT_MS) || 30000
        };

        // Embedding cache
        this.embeddingCache = new Map();
        this.cacheTimeout = 60 * 60 * 1000; // 1 hour

        // Supported embedding types
        this.embeddingTypes = {
            TEXT: 'text',
            FACE: 'face',
            BEHAVIORAL: 'behavioral',
            SPATIAL: 'spatial',
            TEMPORAL: 'temporal'
        };

        // Pre-trained model configurations
        this.modelConfigs = {
            'sentence-transformers/all-MiniLM-L6-v2': {
                dimension: 384,
                maxLength: 512,
                type: 'text'
            },
            'sentence-transformers/all-mpnet-base-v2': {
                dimension: 768,
                maxLength: 512,
                type: 'text'
            },
            'facenet': {
                dimension: 128,
                inputSize: [160, 160],
                type: 'face'
            },
            'arcface': {
                dimension: 512,
                inputSize: [112, 112],
                type: 'face'
            }
        };
    }

    /**
     * Generate text embeddings using Sentence-BERT
     * @param {Array|string} texts - Text or array of texts to embed
     * @param {Object} options - Embedding options
     */
    async generateTextEmbeddings(texts, options = {}) {
        const startTime = Date.now();
        
        try {
            const {
                model = this.config.textEmbeddingModel,
                normalize = true,
                useCache = this.config.cacheEmbeddings,
                batchSize = this.config.batchSize
            } = options;

            const textArray = Array.isArray(texts) ? texts : [texts];
            const embeddings = [];
            const cacheHits = [];
            const cacheMisses = [];

            logger.debug(`Generating text embeddings for ${textArray.length} texts`, {
                model,
                batchSize
            });

            // Check cache for existing embeddings
            if (useCache) {
                textArray.forEach((text, index) => {
                    const cacheKey = this.generateCacheKey('text', text, model);
                    const cached = this.embeddingCache.get(cacheKey);
                    
                    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
                        embeddings[index] = cached.embedding;
                        cacheHits.push(index);
                    } else {
                        cacheMisses.push({ index, text });
                    }
                });
            } else {
                cacheMisses.push(...textArray.map((text, index) => ({ index, text })));
            }

            // Generate embeddings for cache misses
            if (cacheMisses.length > 0) {
                const missedTexts = cacheMisses.map(item => item.text);
                const newEmbeddings = await this.callMLServiceForTextEmbeddings(missedTexts, model);
                
                // Store new embeddings
                cacheMisses.forEach((item, i) => {
                    const embedding = newEmbeddings[i];
                    embeddings[item.index] = embedding;
                    
                    // Cache the embedding
                    if (useCache) {
                        const cacheKey = this.generateCacheKey('text', item.text, model);
                        this.embeddingCache.set(cacheKey, {
                            embedding,
                            timestamp: Date.now(),
                            model,
                            type: 'text'
                        });
                    }
                });
            }

            // Normalize embeddings if requested
            const finalEmbeddings = normalize 
                ? embeddings.map(emb => this.normalizeEmbedding(emb))
                : embeddings;

            const processingTime = Date.now() - startTime;
            
            logger.info('Text embeddings generated', {
                totalTexts: textArray.length,
                cacheHits: cacheHits.length,
                cacheMisses: cacheMisses.length,
                processingTime,
                model
            });

            return {
                embeddings: finalEmbeddings,
                model,
                dimension: this.modelConfigs[model]?.dimension || this.config.embeddingDimension,
                processingTime,
                cacheStats: {
                    hits: cacheHits.length,
                    misses: cacheMisses.length,
                    hitRate: cacheHits.length / textArray.length
                }
            };

        } catch (error) {
            logger.error('Error generating text embeddings:', error);
            throw error;
        }
    }

    /**
     * Generate face embeddings using FaceNet or similar models
     * @param {Array} faceImages - Array of face image data
     * @param {Object} options - Embedding options
     */
    async generateFaceEmbeddings(faceImages, options = {}) {
        const startTime = Date.now();
        
        try {
            const {
                model = this.config.faceEmbeddingModel,
                normalize = true,
                useCache = this.config.cacheEmbeddings,
                qualityThreshold = 0.5
            } = options;

            const imageArray = Array.isArray(faceImages) ? faceImages : [faceImages];
            const embeddings = [];
            const cacheHits = [];
            const cacheMisses = [];

            logger.debug(`Generating face embeddings for ${imageArray.length} images`, {
                model,
                qualityThreshold
            });

            // Check cache and quality for existing embeddings
            if (useCache) {
                imageArray.forEach((imageData, index) => {
                    // Skip low quality images
                    if (imageData.qualityScore && imageData.qualityScore < qualityThreshold) {
                        embeddings[index] = null;
                        return;
                    }

                    const cacheKey = this.generateCacheKey('face', imageData.imageHash || imageData.data, model);
                    const cached = this.embeddingCache.get(cacheKey);
                    
                    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
                        embeddings[index] = cached.embedding;
                        cacheHits.push(index);
                    } else {
                        cacheMisses.push({ index, imageData });
                    }
                });
            } else {
                imageArray.forEach((imageData, index) => {
                    if (imageData.qualityScore && imageData.qualityScore < qualityThreshold) {
                        embeddings[index] = null;
                    } else {
                        cacheMisses.push({ index, imageData });
                    }
                });
            }

            // Generate embeddings for cache misses
            if (cacheMisses.length > 0) {
                const missedImages = cacheMisses.map(item => item.imageData);
                const newEmbeddings = await this.callMLServiceForFaceEmbeddings(missedImages, model);
                
                // Store new embeddings
                cacheMisses.forEach((item, i) => {
                    const embedding = newEmbeddings[i];
                    embeddings[item.index] = embedding;
                    
                    // Cache the embedding
                    if (useCache && embedding) {
                        const cacheKey = this.generateCacheKey('face', 
                            item.imageData.imageHash || item.imageData.data, model);
                        this.embeddingCache.set(cacheKey, {
                            embedding,
                            timestamp: Date.now(),
                            model,
                            type: 'face'
                        });
                    }
                });
            }

            // Normalize embeddings if requested
            const finalEmbeddings = normalize 
                ? embeddings.map(emb => emb ? this.normalizeEmbedding(emb) : null)
                : embeddings;

            const processingTime = Date.now() - startTime;
            
            logger.info('Face embeddings generated', {
                totalImages: imageArray.length,
                validEmbeddings: finalEmbeddings.filter(e => e !== null).length,
                cacheHits: cacheHits.length,
                cacheMisses: cacheMisses.length,
                processingTime,
                model
            });

            return {
                embeddings: finalEmbeddings,
                model,
                dimension: this.modelConfigs[model]?.dimension || this.config.embeddingDimension,
                processingTime,
                cacheStats: {
                    hits: cacheHits.length,
                    misses: cacheMisses.length,
                    hitRate: cacheHits.length / imageArray.length
                }
            };

        } catch (error) {
            logger.error('Error generating face embeddings:', error);
            throw error;
        }
    }

    /**
     * Generate behavioral embeddings from activity patterns
     * @param {Array} activitySequences - Array of activity sequences
     * @param {Object} options - Embedding options
     */
    async generateBehavioralEmbeddings(activitySequences, options = {}) {
        const startTime = Date.now();
        
        try {
            const {
                windowSize = 24, // hours
                featureTypes = ['location', 'time', 'activity', 'duration'],
                normalize = true,
                useCache = this.config.cacheEmbeddings
            } = options;

            const sequenceArray = Array.isArray(activitySequences) ? activitySequences : [activitySequences];
            const embeddings = [];

            logger.debug(`Generating behavioral embeddings for ${sequenceArray.length} sequences`, {
                windowSize,
                featureTypes
            });

            for (const sequence of sequenceArray) {
                const embedding = await this.extractBehavioralFeatures(sequence, {
                    windowSize,
                    featureTypes
                });
                
                embeddings.push(normalize ? this.normalizeEmbedding(embedding) : embedding);
            }

            const processingTime = Date.now() - startTime;
            
            logger.info('Behavioral embeddings generated', {
                totalSequences: sequenceArray.length,
                embeddingDimension: embeddings[0]?.length || 0,
                processingTime
            });

            return {
                embeddings,
                dimension: embeddings[0]?.length || 0,
                featureTypes,
                windowSize,
                processingTime
            };

        } catch (error) {
            logger.error('Error generating behavioral embeddings:', error);
            throw error;
        }
    }

    /**
     * Generate spatial embeddings from location data
     * @param {Array} locationSequences - Array of location sequences
     * @param {Object} options - Embedding options
     */
    async generateSpatialEmbeddings(locationSequences, options = {}) {
        const startTime = Date.now();
        
        try {
            const {
                gridSize = 50, // meters
                maxDistance = 1000, // meters
                includeBuildings = true,
                includeZones = true,
                normalize = true
            } = options;

            const sequenceArray = Array.isArray(locationSequences) ? locationSequences : [locationSequences];
            const embeddings = [];

            logger.debug(`Generating spatial embeddings for ${sequenceArray.length} sequences`, {
                gridSize,
                maxDistance
            });

            for (const sequence of sequenceArray) {
                const embedding = await this.extractSpatialFeatures(sequence, {
                    gridSize,
                    maxDistance,
                    includeBuildings,
                    includeZones
                });
                
                embeddings.push(normalize ? this.normalizeEmbedding(embedding) : embedding);
            }

            const processingTime = Date.now() - startTime;
            
            logger.info('Spatial embeddings generated', {
                totalSequences: sequenceArray.length,
                embeddingDimension: embeddings[0]?.length || 0,
                processingTime
            });

            return {
                embeddings,
                dimension: embeddings[0]?.length || 0,
                gridSize,
                maxDistance,
                processingTime
            };

        } catch (error) {
            logger.error('Error generating spatial embeddings:', error);
            throw error;
        }
    }

    /**
     * Generate temporal embeddings from time-based patterns
     * @param {Array} timeSequences - Array of time sequences
     * @param {Object} options - Embedding options
     */
    async generateTemporalEmbeddings(timeSequences, options = {}) {
        const startTime = Date.now();
        
        try {
            const {
                timeResolution = 'hour', // 'minute', 'hour', 'day'
                cyclicFeatures = true,
                seasonalFeatures = true,
                normalize = true
            } = options;

            const sequenceArray = Array.isArray(timeSequences) ? timeSequences : [timeSequences];
            const embeddings = [];

            logger.debug(`Generating temporal embeddings for ${sequenceArray.length} sequences`, {
                timeResolution,
                cyclicFeatures,
                seasonalFeatures
            });

            for (const sequence of sequenceArray) {
                const embedding = await this.extractTemporalFeatures(sequence, {
                    timeResolution,
                    cyclicFeatures,
                    seasonalFeatures
                });
                
                embeddings.push(normalize ? this.normalizeEmbedding(embedding) : embedding);
            }

            const processingTime = Date.now() - startTime;
            
            logger.info('Temporal embeddings generated', {
                totalSequences: sequenceArray.length,
                embeddingDimension: embeddings[0]?.length || 0,
                processingTime
            });

            return {
                embeddings,
                dimension: embeddings[0]?.length || 0,
                timeResolution,
                processingTime
            };

        } catch (error) {
            logger.error('Error generating temporal embeddings:', error);
            throw error;
        }
    }

    /**
     * Calculate similarity between embeddings
     * @param {Array} embedding1 - First embedding vector
     * @param {Array} embedding2 - Second embedding vector
     * @param {string} metric - Similarity metric ('cosine', 'euclidean', 'manhattan')
     */
    calculateSimilarity(embedding1, embedding2, metric = 'cosine') {
        try {
            if (!embedding1 || !embedding2 || embedding1.length !== embedding2.length) {
                return 0;
            }

            switch (metric) {
                case 'cosine':
                    return this.cosineSimilarity(embedding1, embedding2);
                case 'euclidean':
                    return 1 / (1 + this.euclideanDistance(embedding1, embedding2));
                case 'manhattan':
                    return 1 / (1 + this.manhattanDistance(embedding1, embedding2));
                case 'dot_product':
                    return this.dotProduct(embedding1, embedding2);
                default:
                    return this.cosineSimilarity(embedding1, embedding2);
            }

        } catch (error) {
            logger.error('Error calculating similarity:', error);
            return 0;
        }
    }

    /**
     * Find similar embeddings using approximate nearest neighbor search
     * @param {Array} queryEmbedding - Query embedding vector
     * @param {Array} candidateEmbeddings - Array of candidate embeddings
     * @param {Object} options - Search options
     */
    findSimilarEmbeddings(queryEmbedding, candidateEmbeddings, options = {}) {
        try {
            const {
                topK = 10,
                threshold = 0.7,
                metric = 'cosine'
            } = options;

            const similarities = candidateEmbeddings.map((candidate, index) => ({
                index,
                embedding: candidate.embedding || candidate,
                similarity: this.calculateSimilarity(queryEmbedding, candidate.embedding || candidate, metric),
                metadata: candidate.metadata || {}
            }));

            // Filter by threshold and sort by similarity
            const filtered = similarities
                .filter(item => item.similarity >= threshold)
                .sort((a, b) => b.similarity - a.similarity)
                .slice(0, topK);

            return filtered;

        } catch (error) {
            logger.error('Error finding similar embeddings:', error);
            return [];
        }
    }

    /**
     * Cluster embeddings using k-means or similar algorithm
     * @param {Array} embeddings - Array of embedding vectors
     * @param {Object} options - Clustering options
     */
    async clusterEmbeddings(embeddings, options = {}) {
        try {
            const {
                numClusters = 5,
                algorithm = 'kmeans',
                maxIterations = 100,
                tolerance = 1e-4
            } = options;

            logger.debug(`Clustering ${embeddings.length} embeddings`, {
                numClusters,
                algorithm
            });

            let clusters;
            switch (algorithm) {
                case 'kmeans':
                    clusters = await this.kMeansClustering(embeddings, numClusters, maxIterations, tolerance);
                    break;
                case 'hierarchical':
                    clusters = await this.hierarchicalClustering(embeddings, numClusters);
                    break;
                default:
                    clusters = await this.kMeansClustering(embeddings, numClusters, maxIterations, tolerance);
            }

            return clusters;

        } catch (error) {
            logger.error('Error clustering embeddings:', error);
            throw error;
        }
    }

    // Private methods for ML service communication

    async callMLServiceForTextEmbeddings(texts, model) {
        try {
            const response = await axios.post(`${this.config.mlServiceUrl}/embeddings/text`, {
                texts,
                model
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': this.config.mlServiceApiKey
                },
                timeout: this.config.embeddingTimeout
            });

            return response.data.embeddings;

        } catch (error) {
            logger.error('Error calling ML service for text embeddings:', error);
            
            // Fallback to simple text embeddings
            return texts.map(text => this.generateSimpleTextEmbedding(text));
        }
    }

    async callMLServiceForFaceEmbeddings(images, model) {
        try {
            const response = await axios.post(`${this.config.mlServiceUrl}/embeddings/face`, {
                images,
                model
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': this.config.mlServiceApiKey
                },
                timeout: this.config.embeddingTimeout
            });

            return response.data.embeddings;

        } catch (error) {
            logger.error('Error calling ML service for face embeddings:', error);
            
            // Fallback to random embeddings (for development)
            return images.map(() => this.generateRandomEmbedding(this.config.embeddingDimension));
        }
    }

    // Feature extraction methods

    async extractBehavioralFeatures(activitySequence, options) {
        const features = [];
        const { windowSize, featureTypes } = options;

        // Location frequency features
        if (featureTypes.includes('location')) {
            const locationCounts = new Map();
            activitySequence.forEach(activity => {
                const location = `${activity.building}:${activity.room || 'unknown'}`;
                locationCounts.set(location, (locationCounts.get(location) || 0) + 1);
            });
            
            // Top 10 most frequent locations
            const topLocations = Array.from(locationCounts.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 10)
                .map(([_, count]) => count / activitySequence.length);
            
            features.push(...topLocations);
            // Pad to 10 features
            while (features.length < 10) features.push(0);
        }

        // Time pattern features
        if (featureTypes.includes('time')) {
            const hourCounts = new Array(24).fill(0);
            const dayOfWeekCounts = new Array(7).fill(0);
            
            activitySequence.forEach(activity => {
                const date = new Date(activity.timestamp);
                hourCounts[date.getHours()]++;
                dayOfWeekCounts[date.getDay()]++;
            });
            
            // Normalize
            const totalActivities = activitySequence.length;
            features.push(...hourCounts.map(count => count / totalActivities));
            features.push(...dayOfWeekCounts.map(count => count / totalActivities));
        }

        // Activity type features
        if (featureTypes.includes('activity')) {
            const activityTypes = ['access', 'connectivity', 'transaction', 'service', 'social'];
            const activityCounts = new Array(activityTypes.length).fill(0);
            
            activitySequence.forEach(activity => {
                const index = activityTypes.indexOf(activity.activity_type);
                if (index !== -1) activityCounts[index]++;
            });
            
            features.push(...activityCounts.map(count => count / activitySequence.length));
        }

        // Duration features
        if (featureTypes.includes('duration')) {
            const durations = activitySequence
                .filter(activity => activity.duration)
                .map(activity => activity.duration);
            
            if (durations.length > 0) {
                const avgDuration = durations.reduce((sum, d) => sum + d, 0) / durations.length;
                const maxDuration = Math.max(...durations);
                const minDuration = Math.min(...durations);
                features.push(avgDuration / 3600, maxDuration / 3600, minDuration / 3600); // Convert to hours
            } else {
                features.push(0, 0, 0);
            }
        }

        return features;
    }

    async extractSpatialFeatures(locationSequence, options) {
        const features = [];
        const { gridSize, maxDistance, includeBuildings, includeZones } = options;

        // Grid-based features
        const gridCounts = new Map();
        locationSequence.forEach(location => {
            if (location.coordinates) {
                const gridX = Math.floor(location.coordinates.lat * 1000 / gridSize);
                const gridY = Math.floor(location.coordinates.lon * 1000 / gridSize);
                const gridKey = `${gridX},${gridY}`;
                gridCounts.set(gridKey, (gridCounts.get(gridKey) || 0) + 1);
            }
        });

        // Top 20 grid cells
        const topGrids = Array.from(gridCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 20)
            .map(([_, count]) => count / locationSequence.length);
        
        features.push(...topGrids);
        while (features.length < 20) features.push(0);

        // Building features
        if (includeBuildings) {
            const buildings = ['Academic Complex', 'Library', 'Hostel A', 'Hostel B', 'Admin Block'];
            const buildingCounts = new Array(buildings.length).fill(0);
            
            locationSequence.forEach(location => {
                const index = buildings.indexOf(location.building);
                if (index !== -1) buildingCounts[index]++;
            });
            
            features.push(...buildingCounts.map(count => count / locationSequence.length));
        }

        // Zone features
        if (includeZones) {
            const zones = ['academic', 'residential', 'recreational', 'administrative', 'restricted'];
            const zoneCounts = new Array(zones.length).fill(0);
            
            locationSequence.forEach(location => {
                const index = zones.indexOf(location.zone);
                if (index !== -1) zoneCounts[index]++;
            });
            
            features.push(...zoneCounts.map(count => count / locationSequence.length));
        }

        return features;
    }

    async extractTemporalFeatures(timeSequence, options) {
        const features = [];
        const { timeResolution, cyclicFeatures, seasonalFeatures } = options;

        // Basic time features
        const timestamps = timeSequence.map(item => new Date(item.timestamp || item));
        
        if (cyclicFeatures) {
            // Hour of day (cyclic encoding)
            const hours = timestamps.map(ts => ts.getHours());
            const hourSin = hours.map(h => Math.sin(2 * Math.PI * h / 24));
            const hourCos = hours.map(h => Math.cos(2 * Math.PI * h / 24));
            features.push(this.mean(hourSin), this.mean(hourCos));
            
            // Day of week (cyclic encoding)
            const days = timestamps.map(ts => ts.getDay());
            const daySin = days.map(d => Math.sin(2 * Math.PI * d / 7));
            const dayCos = days.map(d => Math.cos(2 * Math.PI * d / 7));
            features.push(this.mean(daySin), this.mean(dayCos));
        }

        if (seasonalFeatures) {
            // Month of year (cyclic encoding)
            const months = timestamps.map(ts => ts.getMonth());
            const monthSin = months.map(m => Math.sin(2 * Math.PI * m / 12));
            const monthCos = months.map(m => Math.cos(2 * Math.PI * m / 12));
            features.push(this.mean(monthSin), this.mean(monthCos));
        }

        // Time interval features
        if (timestamps.length > 1) {
            const intervals = [];
            for (let i = 1; i < timestamps.length; i++) {
                intervals.push(timestamps[i] - timestamps[i-1]);
            }
            
            const avgInterval = this.mean(intervals) / (1000 * 60 * 60); // Convert to hours
            const stdInterval = this.std(intervals) / (1000 * 60 * 60);
            features.push(avgInterval, stdInterval);
        } else {
            features.push(0, 0);
        }

        return features;
    }

    // Similarity calculation methods

    cosineSimilarity(vec1, vec2) {
        const dotProduct = this.dotProduct(vec1, vec2);
        const norm1 = this.vectorNorm(vec1);
        const norm2 = this.vectorNorm(vec2);
        
        if (norm1 === 0 || norm2 === 0) return 0;
        return dotProduct / (norm1 * norm2);
    }

    euclideanDistance(vec1, vec2) {
        let sum = 0;
        for (let i = 0; i < vec1.length; i++) {
            sum += Math.pow(vec1[i] - vec2[i], 2);
        }
        return Math.sqrt(sum);
    }

    manhattanDistance(vec1, vec2) {
        let sum = 0;
        for (let i = 0; i < vec1.length; i++) {
            sum += Math.abs(vec1[i] - vec2[i]);
        }
        return sum;
    }

    dotProduct(vec1, vec2) {
        let sum = 0;
        for (let i = 0; i < vec1.length; i++) {
            sum += vec1[i] * vec2[i];
        }
        return sum;
    }

    vectorNorm(vec) {
        let sum = 0;
        for (let i = 0; i < vec.length; i++) {
            sum += vec[i] * vec[i];
        }
        return Math.sqrt(sum);
    }

    // Clustering methods

    async kMeansClustering(embeddings, k, maxIterations, tolerance) {
        // Initialize centroids randomly
        let centroids = this.initializeRandomCentroids(embeddings, k);
        let assignments = new Array(embeddings.length);
        let converged = false;
        let iteration = 0;

        while (!converged && iteration < maxIterations) {
            // Assign points to nearest centroid
            const newAssignments = embeddings.map(embedding => {
                let minDistance = Infinity;
                let assignment = 0;
                
                centroids.forEach((centroid, index) => {
                    const distance = this.euclideanDistance(embedding, centroid);
                    if (distance < minDistance) {
                        minDistance = distance;
                        assignment = index;
                    }
                });
                
                return assignment;
            });

            // Check for convergence
            converged = newAssignments.every((assignment, index) => assignment === assignments[index]);
            assignments = newAssignments;

            if (!converged) {
                // Update centroids
                const newCentroids = new Array(k);
                for (let i = 0; i < k; i++) {
                    const clusterPoints = embeddings.filter((_, index) => assignments[index] === i);
                    if (clusterPoints.length > 0) {
                        newCentroids[i] = this.calculateCentroid(clusterPoints);
                    } else {
                        newCentroids[i] = centroids[i]; // Keep old centroid if no points assigned
                    }
                }
                centroids = newCentroids;
            }

            iteration++;
        }

        // Create cluster results
        const clusters = new Array(k).fill(null).map(() => ({ points: [], centroid: null }));
        embeddings.forEach((embedding, index) => {
            clusters[assignments[index]].points.push({ index, embedding });
        });
        
        centroids.forEach((centroid, index) => {
            clusters[index].centroid = centroid;
        });

        return {
            clusters: clusters.filter(cluster => cluster.points.length > 0),
            assignments,
            centroids,
            iterations: iteration,
            converged
        };
    }

    async hierarchicalClustering(embeddings, numClusters) {
        // Simplified hierarchical clustering implementation
        // In production, you'd use a more sophisticated algorithm
        
        let clusters = embeddings.map((embedding, index) => ({
            id: index,
            points: [{ index, embedding }],
            centroid: embedding
        }));

        while (clusters.length > numClusters) {
            let minDistance = Infinity;
            let mergeIndices = [0, 1];

            // Find closest clusters
            for (let i = 0; i < clusters.length; i++) {
                for (let j = i + 1; j < clusters.length; j++) {
                    const distance = this.euclideanDistance(clusters[i].centroid, clusters[j].centroid);
                    if (distance < minDistance) {
                        minDistance = distance;
                        mergeIndices = [i, j];
                    }
                }
            }

            // Merge closest clusters
            const [i, j] = mergeIndices;
            const mergedCluster = {
                id: `${clusters[i].id}_${clusters[j].id}`,
                points: [...clusters[i].points, ...clusters[j].points],
                centroid: this.calculateCentroid([...clusters[i].points.map(p => p.embedding), ...clusters[j].points.map(p => p.embedding)])
            };

            clusters = clusters.filter((_, index) => index !== i && index !== j);
            clusters.push(mergedCluster);
        }

        return {
            clusters,
            method: 'hierarchical'
        };
    }

    // Utility methods

    normalizeEmbedding(embedding) {
        const norm = this.vectorNorm(embedding);
        return norm === 0 ? embedding : embedding.map(val => val / norm);
    }

    generateCacheKey(type, data, model) {
        const hash = crypto.createHash('md5');
        hash.update(`${type}:${model}:${JSON.stringify(data)}`);
        return hash.digest('hex');
    }

    generateSimpleTextEmbedding(text) {
        // Simple hash-based embedding for fallback
        const embedding = new Array(this.config.embeddingDimension).fill(0);
        const hash = crypto.createHash('md5').update(text).digest('hex');
        
        for (let i = 0; i < Math.min(hash.length / 2, embedding.length); i++) {
            embedding[i] = parseInt(hash.substr(i * 2, 2), 16) / 255 - 0.5;
        }
        
        return this.normalizeEmbedding(embedding);
    }

    generateRandomEmbedding(dimension) {
        const embedding = new Array(dimension);
        for (let i = 0; i < dimension; i++) {
            embedding[i] = Math.random() - 0.5;
        }
        return this.normalizeEmbedding(embedding);
    }

    initializeRandomCentroids(embeddings, k) {
        const centroids = [];
        const dimension = embeddings[0].length;
        
        for (let i = 0; i < k; i++) {
            const centroid = new Array(dimension);
            for (let j = 0; j < dimension; j++) {
                centroid[j] = Math.random() - 0.5;
            }
            centroids.push(this.normalizeEmbedding(centroid));
        }
        
        return centroids;
    }

    calculateCentroid(points) {
        if (points.length === 0) return [];
        
        const dimension = points[0].length;
        const centroid = new Array(dimension).fill(0);
        
        points.forEach(point => {
            for (let i = 0; i < dimension; i++) {
                centroid[i] += point[i];
            }
        });
        
        return centroid.map(val => val / points.length);
    }

    mean(values) {
        return values.reduce((sum, val) => sum + val, 0) / values.length;
    }

    std(values) {
        const avg = this.mean(values);
        const squaredDiffs = values.map(val => Math.pow(val - avg, 2));
        return Math.sqrt(this.mean(squaredDiffs));
    }

    // Cache management

    clearCache() {
        this.embeddingCache.clear();
        logger.info('Embedding cache cleared');
    }

    getCacheStats() {
        const stats = {
            totalEntries: this.embeddingCache.size,
            byType: {},
            byModel: {},
            cacheTimeout: this.cacheTimeout
        };

        this.embeddingCache.forEach((value, key) => {
            stats.byType[value.type] = (stats.byType[value.type] || 0) + 1;
            stats.byModel[value.model] = (stats.byModel[value.model] || 0) + 1;
        });

        return stats;
    }

    // Configuration methods

    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        logger.info('Embedding service configuration updated', newConfig);
    }

    getConfig() {
        return { ...this.config };
    }

    getSupportedModels() {
        return {
            text: Object.keys(this.modelConfigs).filter(model => 
                this.modelConfigs[model].type === 'text'
            ),
            face: Object.keys(this.modelConfigs).filter(model => 
                this.modelConfigs[model].type === 'face'
            )
        };
    }
}

module.exports = EmbeddingService;