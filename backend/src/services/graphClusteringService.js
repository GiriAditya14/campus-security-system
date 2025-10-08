const winston = require('winston');
const Neo4jService = require('./neo4jService');
const databaseManager = require('../config/database');

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
        new winston.transports.File({ filename: 'logs/graph_clustering.log' })
    ]
});

class GraphClusteringService {
    constructor() {
        this.neo4jService = null;
        this.clusteringCache = new Map();
        this.cacheTimeout = 30 * 60 * 1000; // 30 minutes
        
        // Clustering parameters
        this.config = {
            minClusterSize: parseInt(process.env.MIN_CLUSTER_SIZE) || 2,
            maxClusters: parseInt(process.env.MAX_CLUSTERS) || 100,
            similarityThreshold: parseFloat(process.env.SIMILARITY_THRESHOLD) || 0.7,
            dbscanEps: parseFloat(process.env.DBSCAN_EPS) || 0.3,
            dbscanMinSamples: parseInt(process.env.DBSCAN_MIN_SAMPLES) || 2,
            markovInflation: parseFloat(process.env.MARKOV_INFLATION) || 2.0,
            markovExpansion: parseInt(process.env.MARKOV_EXPANSION) || 2
        };
    }

    async initialize() {
        try {
            const connections = databaseManager.getConnections();
            if (connections.neo4j) {
                this.neo4jService = new Neo4jService(connections.neo4j);
                logger.info('Graph clustering service initialized');
            } else {
                throw new Error('Neo4j connection not available');
            }
        } catch (error) {
            logger.error('Failed to initialize graph clustering service:', error);
            throw error;
        }
    }

    /**
     * Build entity similarity graph
     * @param {Array} entities - Array of entity objects
     * @param {Object} options - Clustering options
     */
    async buildSimilarityGraph(entities, options = {}) {
        const startTime = Date.now();
        
        try {
            const {
                similarityThreshold = this.config.similarityThreshold,
                includeWeakLinks = false,
                maxEdgesPerNode = 50
            } = options;

            logger.info(`Building similarity graph for ${entities.length} entities`);

            // Create similarity edges between entities
            const edges = [];
            const processedPairs = new Set();

            for (let i = 0; i < entities.length; i++) {
                const entity1 = entities[i];
                let edgeCount = 0;

                for (let j = i + 1; j < entities.length && edgeCount < maxEdgesPerNode; j++) {
                    const entity2 = entities[j];
                    const pairKey = `${entity1._id}_${entity2._id}`;
                    
                    if (processedPairs.has(pairKey)) continue;
                    processedPairs.add(pairKey);

                    // Calculate similarity between entities
                    const similarity = await this.calculateEntitySimilarity(entity1, entity2);
                    
                    if (similarity >= similarityThreshold || (includeWeakLinks && similarity >= 0.3)) {
                        edges.push({
                            source: entity1._id,
                            target: entity2._id,
                            weight: similarity,
                            type: similarity >= similarityThreshold ? 'strong' : 'weak'
                        });
                        edgeCount++;
                    }
                }
            }

            // Store graph in Neo4j
            await this.storeGraphInNeo4j(entities, edges);

            const processingTime = Date.now() - startTime;
            logger.info(`Similarity graph built: ${edges.length} edges, ${processingTime}ms`);

            return {
                nodes: entities.length,
                edges: edges.length,
                strongEdges: edges.filter(e => e.type === 'strong').length,
                weakEdges: edges.filter(e => e.type === 'weak').length,
                processingTime
            };

        } catch (error) {
            logger.error('Error building similarity graph:', error);
            throw error;
        }
    }

    /**
     * Calculate similarity between two entities
     */
    async calculateEntitySimilarity(entity1, entity2) {
        try {
            let totalSimilarity = 0;
            let weightSum = 0;

            // Name similarity (weight: 0.3)
            if (entity1.profile?.name && entity2.profile?.name) {
                const nameSim = this.calculateStringSimilarity(
                    entity1.profile.name.toLowerCase(),
                    entity2.profile.name.toLowerCase()
                );
                totalSimilarity += nameSim * 0.3;
                weightSum += 0.3;
            }

            // Email similarity (weight: 0.4)
            if (entity1.identifiers?.email && entity2.identifiers?.email) {
                const emailSim = entity1.identifiers.email === entity2.identifiers.email ? 1.0 : 0.0;
                totalSimilarity += emailSim * 0.4;
                weightSum += 0.4;
            }

            // Department similarity (weight: 0.2)
            if (entity1.profile?.department && entity2.profile?.department) {
                const deptSim = entity1.profile.department === entity2.profile.department ? 1.0 : 0.0;
                totalSimilarity += deptSim * 0.2;
                weightSum += 0.2;
            }

            // Face embedding similarity (weight: 0.1)
            if (entity1.identifiers?.face_embedding && entity2.identifiers?.face_embedding) {
                const faceSim = this.calculateCosineSimilarity(
                    entity1.identifiers.face_embedding,
                    entity2.identifiers.face_embedding
                );
                totalSimilarity += faceSim * 0.1;
                weightSum += 0.1;
            }

            return weightSum > 0 ? totalSimilarity / weightSum : 0;

        } catch (error) {
            logger.error('Error calculating entity similarity:', error);
            return 0;
        }
    }

    /**
     * Store graph in Neo4j for clustering algorithms
     */
    async storeGraphInNeo4j(entities, edges) {
        const session = this.neo4jService.driver.session();
        
        try {
            // Clear existing similarity graph
            await session.run('MATCH ()-[r:SIMILAR_TO]->() DELETE r');

            // Create similarity relationships
            const tx = session.beginTransaction();
            
            for (const edge of edges) {
                await tx.run(`
                    MATCH (e1:Entity {id: $sourceId})
                    MATCH (e2:Entity {id: $targetId})
                    MERGE (e1)-[r:SIMILAR_TO]-(e2)
                    SET r.weight = $weight,
                        r.type = $type,
                        r.created_at = datetime()
                `, {
                    sourceId: edge.source,
                    targetId: edge.target,
                    weight: edge.weight,
                    type: edge.type
                });
            }
            
            await tx.commit();
            logger.info(`Stored ${edges.length} similarity relationships in Neo4j`);

        } catch (error) {
            logger.error('Error storing graph in Neo4j:', error);
            throw error;
        } finally {
            await session.close();
        }
    }

    /**
     * Connected Components clustering
     */
    async connectedComponentsClustering(options = {}) {
        const cacheKey = `connected_components_${JSON.stringify(options)}`;
        
        // Check cache
        if (this.clusteringCache.has(cacheKey)) {
            const cached = this.clusteringCache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.cacheTimeout) {
                return cached.result;
            }
        }

        const session = this.neo4jService.driver.session();
        
        try {
            const {
                minWeight = this.config.similarityThreshold,
                includeWeakLinks = false
            } = options;

            logger.info('Running Connected Components clustering');

            const query = `
                MATCH (e1:Entity)-[r:SIMILAR_TO]-(e2:Entity)
                WHERE r.weight >= $minWeight ${includeWeakLinks ? '' : 'AND r.type = "strong"'}
                WITH e1, e2, r
                CALL {
                    WITH e1, e2
                    MATCH path = (e1)-[:SIMILAR_TO*]-(e2)
                    RETURN path
                }
                WITH collect(DISTINCT e1) + collect(DISTINCT e2) as nodes
                UNWIND nodes as node
                WITH DISTINCT node
                MATCH (node)-[:SIMILAR_TO*]-(connected)
                WITH node, collect(DISTINCT connected) + [node] as component
                RETURN 
                    node.id as representative,
                    [n in component | n.id] as members,
                    size(component) as size
                ORDER BY size DESC
            `;

            const result = await session.run(query, { minWeight });
            
            // Process results to remove duplicates
            const clusters = new Map();
            const processed = new Set();

            for (const record of result.records) {
                const members = record.get('members');
                const size = record.get('size').toNumber();
                
                // Create a sorted key for this cluster
                const sortedMembers = [...members].sort();
                const clusterKey = sortedMembers.join(',');
                
                if (!processed.has(clusterKey) && size >= this.config.minClusterSize) {
                    clusters.set(clusterKey, {
                        id: `cc_${clusters.size + 1}`,
                        members: sortedMembers,
                        size: size,
                        algorithm: 'connected_components',
                        representative: sortedMembers[0]
                    });
                    processed.add(clusterKey);
                }
            }

            const clusterArray = Array.from(clusters.values());
            
            // Cache result
            this.clusteringCache.set(cacheKey, {
                result: clusterArray,
                timestamp: Date.now()
            });

            logger.info(`Connected Components found ${clusterArray.length} clusters`);
            return clusterArray;

        } catch (error) {
            logger.error('Error in Connected Components clustering:', error);
            throw error;
        } finally {
            await session.close();
        }
    }

    /**
     * DBSCAN clustering implementation
     */
    async dbscanClustering(options = {}) {
        const cacheKey = `dbscan_${JSON.stringify(options)}`;
        
        // Check cache
        if (this.clusteringCache.has(cacheKey)) {
            const cached = this.clusteringCache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.cacheTimeout) {
                return cached.result;
            }
        }

        try {
            const {
                eps = this.config.dbscanEps,
                minSamples = this.config.dbscanMinSamples
            } = options;

            logger.info(`Running DBSCAN clustering (eps=${eps}, minSamples=${minSamples})`);

            // Get all entities and their similarities
            const entities = await this.getAllEntitiesWithSimilarities();
            
            // DBSCAN algorithm implementation
            const clusters = [];
            const visited = new Set();
            const clustered = new Set();
            let clusterIndex = 0;

            for (const entity of entities) {
                if (visited.has(entity.id)) continue;
                
                visited.add(entity.id);
                const neighbors = this.getNeighbors(entity, entities, eps);
                
                if (neighbors.length < minSamples) {
                    // Mark as noise (will be handled later)
                    continue;
                }
                
                // Start new cluster
                const cluster = {
                    id: `dbscan_${clusterIndex++}`,
                    members: [],
                    algorithm: 'dbscan',
                    eps: eps,
                    minSamples: minSamples
                };
                
                // Expand cluster
                const queue = [...neighbors];
                
                while (queue.length > 0) {
                    const neighbor = queue.shift();
                    
                    if (!visited.has(neighbor.id)) {
                        visited.add(neighbor.id);
                        const neighborNeighbors = this.getNeighbors(neighbor, entities, eps);
                        
                        if (neighborNeighbors.length >= minSamples) {
                            queue.push(...neighborNeighbors.filter(n => !visited.has(n.id)));
                        }
                    }
                    
                    if (!clustered.has(neighbor.id)) {
                        cluster.members.push(neighbor.id);
                        clustered.add(neighbor.id);
                    }
                }
                
                if (cluster.members.length >= this.config.minClusterSize) {
                    cluster.size = cluster.members.length;
                    cluster.representative = cluster.members[0];
                    clusters.push(cluster);
                }
            }

            // Cache result
            this.clusteringCache.set(cacheKey, {
                result: clusters,
                timestamp: Date.now()
            });

            logger.info(`DBSCAN found ${clusters.length} clusters`);
            return clusters;

        } catch (error) {
            logger.error('Error in DBSCAN clustering:', error);
            throw error;
        }
    }

    /**
     * Markov Clustering (MCL) implementation
     */
    async markovClustering(options = {}) {
        const cacheKey = `markov_${JSON.stringify(options)}`;
        
        // Check cache
        if (this.clusteringCache.has(cacheKey)) {
            const cached = this.clusteringCache.get(cacheKey);
            if (Date.now() - cached.timestamp < this.cacheTimeout) {
                return cached.result;
            }
        }

        try {
            const {
                inflation = this.config.markovInflation,
                expansion = this.config.markovExpansion,
                maxIterations = 100,
                convergenceThreshold = 0.001
            } = options;

            logger.info(`Running Markov Clustering (inflation=${inflation}, expansion=${expansion})`);

            // Get adjacency matrix
            const { matrix, entityIds } = await this.buildAdjacencyMatrix();
            
            if (matrix.length === 0) {
                return [];
            }

            // MCL algorithm
            let currentMatrix = this.normalizeMatrix(matrix);
            let iteration = 0;
            let converged = false;

            while (iteration < maxIterations && !converged) {
                // Expansion step
                const expanded = this.matrixPower(currentMatrix, expansion);
                
                // Inflation step
                const inflated = this.inflateMatrix(expanded, inflation);
                
                // Check convergence
                converged = this.checkConvergence(currentMatrix, inflated, convergenceThreshold);
                currentMatrix = inflated;
                iteration++;
            }

            // Extract clusters from final matrix
            const clusters = this.extractClustersFromMatrix(currentMatrix, entityIds);
            
            // Filter by minimum cluster size
            const filteredClusters = clusters
                .filter(cluster => cluster.size >= this.config.minClusterSize)
                .map((cluster, index) => ({
                    ...cluster,
                    id: `mcl_${index + 1}`,
                    algorithm: 'markov_clustering',
                    inflation: inflation,
                    expansion: expansion,
                    iterations: iteration
                }));

            // Cache result
            this.clusteringCache.set(cacheKey, {
                result: filteredClusters,
                timestamp: Date.now()
            });

            logger.info(`Markov Clustering found ${filteredClusters.length} clusters in ${iteration} iterations`);
            return filteredClusters;

        } catch (error) {
            logger.error('Error in Markov Clustering:', error);
            throw error;
        }
    }

    /**
     * Run all clustering algorithms and compare results
     */
    async runAllClusteringAlgorithms(options = {}) {
        try {
            logger.info('Running all clustering algorithms');
            
            const results = await Promise.allSettled([
                this.connectedComponentsClustering(options),
                this.dbscanClustering(options),
                this.markovClustering(options)
            ]);

            const clusteringResults = {
                connected_components: results[0].status === 'fulfilled' ? results[0].value : [],
                dbscan: results[1].status === 'fulfilled' ? results[1].value : [],
                markov: results[2].status === 'fulfilled' ? results[2].value : [],
                comparison: null
            };

            // Compare clustering results
            clusteringResults.comparison = this.compareClusteringResults(clusteringResults);

            // Log any failures
            results.forEach((result, index) => {
                if (result.status === 'rejected') {
                    const algorithms = ['Connected Components', 'DBSCAN', 'Markov'];
                    logger.error(`${algorithms[index]} clustering failed:`, result.reason);
                }
            });

            return clusteringResults;

        } catch (error) {
            logger.error('Error running all clustering algorithms:', error);
            throw error;
        }
    }

    /**
     * Compare clustering results from different algorithms
     */
    compareClusteringResults(results) {
        try {
            const comparison = {
                algorithm_stats: {},
                consensus_clusters: [],
                quality_metrics: {}
            };

            // Calculate stats for each algorithm
            Object.entries(results).forEach(([algorithm, clusters]) => {
                if (algorithm === 'comparison' || !Array.isArray(clusters)) return;
                
                comparison.algorithm_stats[algorithm] = {
                    cluster_count: clusters.length,
                    total_entities: clusters.reduce((sum, c) => sum + c.size, 0),
                    avg_cluster_size: clusters.length > 0 ? 
                        clusters.reduce((sum, c) => sum + c.size, 0) / clusters.length : 0,
                    largest_cluster: clusters.length > 0 ? Math.max(...clusters.map(c => c.size)) : 0,
                    smallest_cluster: clusters.length > 0 ? Math.min(...clusters.map(c => c.size)) : 0
                };
            });

            // Find consensus clusters (entities that appear together in multiple algorithms)
            const entityPairs = new Map();
            
            Object.entries(results).forEach(([algorithm, clusters]) => {
                if (algorithm === 'comparison' || !Array.isArray(clusters)) return;
                
                clusters.forEach(cluster => {
                    for (let i = 0; i < cluster.members.length; i++) {
                        for (let j = i + 1; j < cluster.members.length; j++) {
                            const pair = [cluster.members[i], cluster.members[j]].sort().join('|');
                            if (!entityPairs.has(pair)) {
                                entityPairs.set(pair, []);
                            }
                            entityPairs.get(pair).push(algorithm);
                        }
                    }
                });
            });

            // Find pairs that appear in multiple algorithms
            const consensusPairs = Array.from(entityPairs.entries())
                .filter(([pair, algorithms]) => algorithms.length >= 2)
                .map(([pair, algorithms]) => ({
                    entities: pair.split('|'),
                    algorithms: algorithms,
                    consensus_score: algorithms.length / 3 // Assuming 3 algorithms
                }));

            comparison.consensus_clusters = this.buildConsensusCluster(consensusPairs);

            return comparison;

        } catch (error) {
            logger.error('Error comparing clustering results:', error);
            return null;
        }
    }

    /**
     * Get clustering quality metrics
     */
    async getClusteringQualityMetrics(clusters, algorithm) {
        try {
            const metrics = {
                algorithm: algorithm,
                cluster_count: clusters.length,
                total_entities: clusters.reduce((sum, c) => sum + c.size, 0),
                modularity: await this.calculateModularity(clusters),
                silhouette_score: await this.calculateSilhouetteScore(clusters),
                intra_cluster_similarity: await this.calculateIntraClusterSimilarity(clusters),
                inter_cluster_similarity: await this.calculateInterClusterSimilarity(clusters)
            };

            return metrics;

        } catch (error) {
            logger.error('Error calculating clustering quality metrics:', error);
            return null;
        }
    }

    // Helper methods

    calculateStringSimilarity(str1, str2) {
        // Jaro-Winkler similarity implementation
        const jaroSimilarity = this.jaroSimilarity(str1, str2);
        const prefixLength = Math.min(4, this.commonPrefixLength(str1, str2));
        return jaroSimilarity + (0.1 * prefixLength * (1 - jaroSimilarity));
    }

    jaroSimilarity(str1, str2) {
        if (str1 === str2) return 1.0;
        if (str1.length === 0 || str2.length === 0) return 0.0;

        const matchWindow = Math.floor(Math.max(str1.length, str2.length) / 2) - 1;
        const str1Matches = new Array(str1.length).fill(false);
        const str2Matches = new Array(str2.length).fill(false);

        let matches = 0;
        let transpositions = 0;

        // Find matches
        for (let i = 0; i < str1.length; i++) {
            const start = Math.max(0, i - matchWindow);
            const end = Math.min(i + matchWindow + 1, str2.length);

            for (let j = start; j < end; j++) {
                if (str2Matches[j] || str1[i] !== str2[j]) continue;
                str1Matches[i] = str2Matches[j] = true;
                matches++;
                break;
            }
        }

        if (matches === 0) return 0.0;

        // Find transpositions
        let k = 0;
        for (let i = 0; i < str1.length; i++) {
            if (!str1Matches[i]) continue;
            while (!str2Matches[k]) k++;
            if (str1[i] !== str2[k]) transpositions++;
            k++;
        }

        return (matches / str1.length + matches / str2.length + 
                (matches - transpositions / 2) / matches) / 3.0;
    }

    commonPrefixLength(str1, str2) {
        let length = 0;
        for (let i = 0; i < Math.min(str1.length, str2.length); i++) {
            if (str1[i] === str2[i]) {
                length++;
            } else {
                break;
            }
        }
        return length;
    }

    calculateCosineSimilarity(vec1, vec2) {
        if (!Array.isArray(vec1) || !Array.isArray(vec2) || vec1.length !== vec2.length) {
            return 0;
        }

        let dotProduct = 0;
        let norm1 = 0;
        let norm2 = 0;

        for (let i = 0; i < vec1.length; i++) {
            dotProduct += vec1[i] * vec2[i];
            norm1 += vec1[i] * vec1[i];
            norm2 += vec2[i] * vec2[i];
        }

        if (norm1 === 0 || norm2 === 0) return 0;
        return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
    }

    async getAllEntitiesWithSimilarities() {
        const session = this.neo4jService.driver.session();
        
        try {
            const result = await session.run(`
                MATCH (e:Entity)
                OPTIONAL MATCH (e)-[r:SIMILAR_TO]-(other:Entity)
                RETURN e.id as id, 
                       e.name as name,
                       collect({id: other.id, weight: r.weight}) as similarities
            `);

            return result.records.map(record => ({
                id: record.get('id'),
                name: record.get('name'),
                similarities: record.get('similarities').filter(s => s.id !== null)
            }));

        } finally {
            await session.close();
        }
    }

    getNeighbors(entity, entities, eps) {
        return entities.filter(other => {
            if (entity.id === other.id) return false;
            
            const similarity = entity.similarities.find(s => s.id === other.id);
            return similarity && (1 - similarity.weight) <= eps; // Convert similarity to distance
        });
    }

    async buildAdjacencyMatrix() {
        const entities = await this.getAllEntitiesWithSimilarities();
        const entityIds = entities.map(e => e.id);
        const n = entities.length;
        
        // Initialize matrix
        const matrix = Array(n).fill().map(() => Array(n).fill(0));
        
        // Fill matrix with similarities
        entities.forEach((entity, i) => {
            entity.similarities.forEach(sim => {
                const j = entityIds.indexOf(sim.id);
                if (j !== -1) {
                    matrix[i][j] = sim.weight;
                    matrix[j][i] = sim.weight; // Symmetric
                }
            });
        });

        return { matrix, entityIds };
    }

    normalizeMatrix(matrix) {
        const n = matrix.length;
        const normalized = Array(n).fill().map(() => Array(n).fill(0));
        
        for (let i = 0; i < n; i++) {
            const sum = matrix[i].reduce((a, b) => a + b, 0);
            if (sum > 0) {
                for (let j = 0; j < n; j++) {
                    normalized[i][j] = matrix[i][j] / sum;
                }
            }
        }
        
        return normalized;
    }

    matrixPower(matrix, power) {
        if (power === 1) return matrix;
        
        let result = matrix;
        for (let p = 1; p < power; p++) {
            result = this.multiplyMatrices(result, matrix);
        }
        return result;
    }

    multiplyMatrices(a, b) {
        const n = a.length;
        const result = Array(n).fill().map(() => Array(n).fill(0));
        
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                for (let k = 0; k < n; k++) {
                    result[i][j] += a[i][k] * b[k][j];
                }
            }
        }
        
        return result;
    }

    inflateMatrix(matrix, inflation) {
        const n = matrix.length;
        const inflated = Array(n).fill().map(() => Array(n).fill(0));
        
        for (let j = 0; j < n; j++) {
            let sum = 0;
            for (let i = 0; i < n; i++) {
                inflated[i][j] = Math.pow(matrix[i][j], inflation);
                sum += inflated[i][j];
            }
            
            // Normalize column
            if (sum > 0) {
                for (let i = 0; i < n; i++) {
                    inflated[i][j] /= sum;
                }
            }
        }
        
        return inflated;
    }

    checkConvergence(oldMatrix, newMatrix, threshold) {
        const n = oldMatrix.length;
        let maxDiff = 0;
        
        for (let i = 0; i < n; i++) {
            for (let j = 0; j < n; j++) {
                const diff = Math.abs(oldMatrix[i][j] - newMatrix[i][j]);
                maxDiff = Math.max(maxDiff, diff);
            }
        }
        
        return maxDiff < threshold;
    }

    extractClustersFromMatrix(matrix, entityIds) {
        const n = matrix.length;
        const clusters = [];
        const processed = new Set();
        
        for (let i = 0; i < n; i++) {
            if (processed.has(i)) continue;
            
            const cluster = {
                members: [],
                representative: entityIds[i]
            };
            
            for (let j = 0; j < n; j++) {
                if (matrix[i][j] > 0.001) { // Threshold for cluster membership
                    cluster.members.push(entityIds[j]);
                    processed.add(j);
                }
            }
            
            if (cluster.members.length > 0) {
                cluster.size = cluster.members.length;
                clusters.push(cluster);
            }
        }
        
        return clusters;
    }

    buildConsensusCluster(consensusPairs) {
        // Build consensus clusters from pairs that appear in multiple algorithms
        const clusters = [];
        const processed = new Set();
        
        consensusPairs.forEach(pair => {
            const [entity1, entity2] = pair.entities;
            
            if (processed.has(entity1) || processed.has(entity2)) return;
            
            // Find all entities connected to this pair
            const cluster = new Set([entity1, entity2]);
            const queue = [entity1, entity2];
            
            while (queue.length > 0) {
                const current = queue.shift();
                consensusPairs.forEach(otherPair => {
                    if (otherPair.entities.includes(current)) {
                        otherPair.entities.forEach(entity => {
                            if (!cluster.has(entity)) {
                                cluster.add(entity);
                                queue.push(entity);
                            }
                        });
                    }
                });
            }
            
            cluster.forEach(entity => processed.add(entity));
            
            clusters.push({
                id: `consensus_${clusters.length + 1}`,
                members: Array.from(cluster),
                size: cluster.size,
                algorithm: 'consensus',
                consensus_score: pair.consensus_score
            });
        });
        
        return clusters;
    }

    async calculateModularity(clusters) {
        // Simplified modularity calculation
        // In a real implementation, this would be more sophisticated
        try {
            const totalEdges = await this.getTotalEdgeCount();
            if (totalEdges === 0) return 0;
            
            let modularity = 0;
            
            for (const cluster of clusters) {
                const internalEdges = await this.getInternalEdgeCount(cluster.members);
                const expectedEdges = Math.pow(cluster.size, 2) / (2 * totalEdges);
                modularity += (internalEdges / totalEdges) - Math.pow(expectedEdges / totalEdges, 2);
            }
            
            return modularity;
        } catch (error) {
            logger.error('Error calculating modularity:', error);
            return 0;
        }
    }

    async calculateSilhouetteScore(clusters) {
        // Simplified silhouette score calculation
        try {
            let totalScore = 0;
            let totalEntities = 0;
            
            for (const cluster of clusters) {
                for (const entityId of cluster.members) {
                    const intraDistance = await this.getAverageIntraClusterDistance(entityId, cluster.members);
                    const interDistance = await this.getMinInterClusterDistance(entityId, clusters, cluster);
                    
                    const silhouette = (interDistance - intraDistance) / Math.max(intraDistance, interDistance);
                    totalScore += silhouette;
                    totalEntities++;
                }
            }
            
            return totalEntities > 0 ? totalScore / totalEntities : 0;
        } catch (error) {
            logger.error('Error calculating silhouette score:', error);
            return 0;
        }
    }

    async calculateIntraClusterSimilarity(clusters) {
        try {
            let totalSimilarity = 0;
            let totalPairs = 0;
            
            for (const cluster of clusters) {
                for (let i = 0; i < cluster.members.length; i++) {
                    for (let j = i + 1; j < cluster.members.length; j++) {
                        const similarity = await this.getEntitySimilarity(cluster.members[i], cluster.members[j]);
                        totalSimilarity += similarity;
                        totalPairs++;
                    }
                }
            }
            
            return totalPairs > 0 ? totalSimilarity / totalPairs : 0;
        } catch (error) {
            logger.error('Error calculating intra-cluster similarity:', error);
            return 0;
        }
    }

    async calculateInterClusterSimilarity(clusters) {
        try {
            let totalSimilarity = 0;
            let totalPairs = 0;
            
            for (let i = 0; i < clusters.length; i++) {
                for (let j = i + 1; j < clusters.length; j++) {
                    const cluster1 = clusters[i];
                    const cluster2 = clusters[j];
                    
                    for (const entity1 of cluster1.members) {
                        for (const entity2 of cluster2.members) {
                            const similarity = await this.getEntitySimilarity(entity1, entity2);
                            totalSimilarity += similarity;
                            totalPairs++;
                        }
                    }
                }
            }
            
            return totalPairs > 0 ? totalSimilarity / totalPairs : 0;
        } catch (error) {
            logger.error('Error calculating inter-cluster similarity:', error);
            return 0;
        }
    }

    // Additional helper methods for metrics calculation
    async getTotalEdgeCount() {
        const session = this.neo4jService.driver.session();
        try {
            const result = await session.run('MATCH ()-[r:SIMILAR_TO]->() RETURN count(r) as count');
            return result.records[0].get('count').toNumber();
        } finally {
            await session.close();
        }
    }

    async getInternalEdgeCount(members) {
        const session = this.neo4jService.driver.session();
        try {
            const result = await session.run(`
                MATCH (e1:Entity)-[r:SIMILAR_TO]-(e2:Entity)
                WHERE e1.id IN $members AND e2.id IN $members
                RETURN count(r) as count
            `, { members });
            return result.records[0].get('count').toNumber();
        } finally {
            await session.close();
        }
    }

    async getEntitySimilarity(entityId1, entityId2) {
        const session = this.neo4jService.driver.session();
        try {
            const result = await session.run(`
                MATCH (e1:Entity {id: $id1})-[r:SIMILAR_TO]-(e2:Entity {id: $id2})
                RETURN r.weight as weight
            `, { id1: entityId1, id2: entityId2 });
            
            return result.records.length > 0 ? result.records[0].get('weight') : 0;
        } finally {
            await session.close();
        }
    }

    async getAverageIntraClusterDistance(entityId, clusterMembers) {
        let totalDistance = 0;
        let count = 0;
        
        for (const otherId of clusterMembers) {
            if (otherId !== entityId) {
                const similarity = await this.getEntitySimilarity(entityId, otherId);
                totalDistance += (1 - similarity); // Convert similarity to distance
                count++;
            }
        }
        
        return count > 0 ? totalDistance / count : 0;
    }

    async getMinInterClusterDistance(entityId, allClusters, currentCluster) {
        let minDistance = Infinity;
        
        for (const cluster of allClusters) {
            if (cluster.id === currentCluster.id) continue;
            
            for (const otherId of cluster.members) {
                const similarity = await this.getEntitySimilarity(entityId, otherId);
                const distance = 1 - similarity;
                minDistance = Math.min(minDistance, distance);
            }
        }
        
        return minDistance === Infinity ? 0 : minDistance;
    }

    // Cache management
    clearCache() {
        this.clusteringCache.clear();
        logger.info('Clustering cache cleared');
    }

    getCacheStats() {
        return {
            size: this.clusteringCache.size,
            timeout: this.cacheTimeout,
            keys: Array.from(this.clusteringCache.keys())
        };
    }
}

module.exports = GraphClusteringService;