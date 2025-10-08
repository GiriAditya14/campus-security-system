const EventEmitter = require('events');
const winston = require('winston');

// Logger setup
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'logs/data-fusion.log' })
    ]
});

/**
 * Data Fusion Service
 * Handles multi-modal data fusion using Dempster-Shafer theory
 */
class DataFusionService extends EventEmitter {
    constructor(neo4jDriver, redisClient) {
        super();
        this.neo4j = neo4jDriver;
        this.redis = redisClient;
        
        this.config = {
            temporalWindow: 5 * 60 * 1000, // 5 minutes
            spatialThreshold: 50, // 50 meters
            confidenceThreshold: 0.7,
            maxConflictResolution: 3
        };

        logger.info('Data Fusion Service initialized');
    }

    /**
     * Fuse entity data from multiple sources
     */
    async fuseEntityData(entityId, events) {
        try {
            logger.info(`Fusing data for entity: ${entityId}`);

            // Temporal alignment
            const alignedEvents = this.performTemporalAlignment(events);

            // Spatial correlation
            const spatiallyCorrelated = this.performSpatialCorrelation(alignedEvents);

            // Confidence aggregation using Dempster-Shafer
            const fusedData = this.aggregateConfidence(spatiallyCorrelated);

            // Store in Neo4j
            await this.storeInGraph(entityId, fusedData);

            // Cache results
            await this.cacheResults(entityId, fusedData);

            // Emit event
            this.emit('entity_updated', entityId);

            return {
                success: true,
                entityId,
                fusedEvents: fusedData.length,
                confidence: fusedData.reduce((sum, event) => sum + event.confidence, 0) / fusedData.length
            };

        } catch (error) {
            logger.error('Data fusion error:', error);
            throw error;
        }
    }

    /**
     * Perform temporal alignment of events
     */
    performTemporalAlignment(events) {
        // Group events by temporal buckets
        const buckets = new Map();
        
        events.forEach(event => {
            const bucketTime = Math.floor(new Date(event.timestamp).getTime() / this.config.temporalWindow);
            
            if (!buckets.has(bucketTime)) {
                buckets.set(bucketTime, []);
            }
            buckets.get(bucketTime).push(event);
        });

        // Align events within buckets
        const alignedEvents = [];
        for (const [bucketTime, bucketEvents] of buckets) {
            alignedEvents.push(...this.alignEventsInBucket(bucketEvents));
        }

        return alignedEvents;
    }

    /**
     * Align events within a temporal bucket
     */
    alignEventsInBucket(events) {
        // Sort by timestamp
        events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        
        // Add temporal alignment metadata
        return events.map((event, index) => ({
            ...event,
            temporalAlignment: {
                bucketPosition: index,
                bucketSize: events.length,
                alignmentConfidence: this.calculateTemporalConfidence(event, events)
            }
        }));
    }

    /**
     * Calculate temporal confidence
     */
    calculateTemporalConfidence(event, bucketEvents) {
        // Simple confidence based on temporal consistency
        const avgTime = bucketEvents.reduce((sum, e) => sum + new Date(e.timestamp).getTime(), 0) / bucketEvents.length;
        const eventTime = new Date(event.timestamp).getTime();
        const deviation = Math.abs(eventTime - avgTime);
        
        return Math.max(0.1, 1 - (deviation / this.config.temporalWindow));
    }

    /**
     * Perform spatial correlation
     */
    performSpatialCorrelation(events) {
        return events.map(event => {
            const spatialConfidence = this.calculateSpatialConfidence(event, events);
            
            return {
                ...event,
                spatialCorrelation: {
                    confidence: spatialConfidence,
                    nearbyEvents: this.findNearbyEvents(event, events)
                }
            };
        });
    }

    /**
     * Calculate spatial confidence
     */
    calculateSpatialConfidence(event, allEvents) {
        if (!event.location || !event.location.coordinates) {
            return 0.5; // Default confidence for events without location
        }

        const nearbyEvents = this.findNearbyEvents(event, allEvents);
        const supportingEvents = nearbyEvents.length;
        
        // Confidence increases with supporting events
        return Math.min(1.0, 0.3 + (supportingEvents * 0.1));
    }

    /**
     * Find nearby events within spatial threshold
     */
    findNearbyEvents(targetEvent, allEvents) {
        if (!targetEvent.location || !targetEvent.location.coordinates) {
            return [];
        }

        return allEvents.filter(event => {
            if (event === targetEvent || !event.location || !event.location.coordinates) {
                return false;
            }

            const distance = this.calculateHaversineDistance(
                targetEvent.location.coordinates,
                event.location.coordinates
            );

            return distance <= this.config.spatialThreshold;
        });
    }

    /**
     * Calculate Haversine distance between two coordinates
     */
    calculateHaversineDistance(coord1, coord2) {
        const R = 6371000; // Earth's radius in meters
        const lat1Rad = coord1.lat * Math.PI / 180;
        const lat2Rad = coord2.lat * Math.PI / 180;
        const deltaLatRad = (coord2.lat - coord1.lat) * Math.PI / 180;
        const deltaLonRad = (coord2.lon - coord1.lon) * Math.PI / 180;

        const a = Math.sin(deltaLatRad / 2) * Math.sin(deltaLatRad / 2) +
                  Math.cos(lat1Rad) * Math.cos(lat2Rad) *
                  Math.sin(deltaLonRad / 2) * Math.sin(deltaLonRad / 2);
        
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        
        return R * c;
    }

    /**
     * Aggregate confidence using Dempster-Shafer theory
     */
    aggregateConfidence(events) {
        return events.map(event => {
            const sources = this.identifyDataSources(event);
            const beliefs = this.calculateBeliefs(event, sources);
            const combinedBelief = this.combineBeliefs(beliefs);

            return {
                ...event,
                confidence: combinedBelief.confidence,
                uncertainty: combinedBelief.uncertainty,
                conflictMass: combinedBelief.conflict,
                fusionMetadata: {
                    sources: sources.length,
                    beliefCombination: combinedBelief,
                    fusedAt: new Date()
                }
            };
        });
    }

    /**
     * Identify data sources for an event
     */
    identifyDataSources(event) {
        const sources = [];
        
        if (event.source_type) sources.push(event.source_type);
        if (event.temporalAlignment) sources.push('temporal');
        if (event.spatialCorrelation) sources.push('spatial');
        
        return sources;
    }

    /**
     * Calculate beliefs for each source
     */
    calculateBeliefs(event, sources) {
        const beliefs = [];

        sources.forEach(source => {
            let belief = 0.5; // Default belief
            
            switch (source) {
                case 'card_swipe':
                    belief = 0.9; // High reliability
                    break;
                case 'wifi_log':
                    belief = 0.7; // Medium reliability
                    break;
                case 'cctv_frame':
                    belief = 0.8; // High reliability
                    break;
                case 'temporal':
                    belief = event.temporalAlignment?.alignmentConfidence || 0.5;
                    break;
                case 'spatial':
                    belief = event.spatialCorrelation?.confidence || 0.5;
                    break;
                default:
                    belief = 0.6; // Default
            }

            beliefs.push({
                source,
                belief,
                uncertainty: 1 - belief
            });
        });

        return beliefs;
    }

    /**
     * Combine beliefs using Dempster-Shafer rule
     */
    combineBeliefs(beliefs) {
        if (beliefs.length === 0) {
            return { confidence: 0.5, uncertainty: 0.5, conflict: 0 };
        }

        if (beliefs.length === 1) {
            return {
                confidence: beliefs[0].belief,
                uncertainty: beliefs[0].uncertainty,
                conflict: 0
            };
        }

        // Simplified Dempster-Shafer combination
        let combinedBelief = beliefs[0].belief;
        let combinedUncertainty = beliefs[0].uncertainty;
        let conflict = 0;

        for (let i = 1; i < beliefs.length; i++) {
            const b1 = combinedBelief;
            const u1 = combinedUncertainty;
            const b2 = beliefs[i].belief;
            const u2 = beliefs[i].uncertainty;

            // Calculate conflict
            const k = b1 * u2 + u1 * b2;
            conflict += k;

            // Combine beliefs
            const denominator = 1 - k;
            if (denominator > 0) {
                combinedBelief = (b1 * b2) / denominator;
                combinedUncertainty = (u1 * u2) / denominator;
            }
        }

        return {
            confidence: combinedBelief,
            uncertainty: combinedUncertainty,
            conflict: conflict / beliefs.length
        };
    }

    /**
     * Store fused data in Neo4j graph
     */
    async storeInGraph(entityId, fusedData) {
        if (!this.neo4j) return;

        const session = this.neo4j.session();
        
        try {
            for (const event of fusedData) {
                await session.run(`
                    MERGE (e:Entity {id: $entityId})
                    CREATE (ev:Event {
                        id: $eventId,
                        timestamp: datetime($timestamp),
                        confidence: $confidence,
                        source_type: $sourceType,
                        activity_type: $activityType
                    })
                    CREATE (e)-[:HAS_EVENT]->(ev)
                `, {
                    entityId,
                    eventId: event._id || event.id,
                    timestamp: event.timestamp,
                    confidence: event.confidence,
                    sourceType: event.source_type,
                    activityType: event.activity_type
                });
            }
        } finally {
            await session.close();
        }
    }

    /**
     * Cache fusion results
     */
    async cacheResults(entityId, fusedData) {
        if (!this.redis) return;

        const cacheKey = `fusion:${entityId}`;
        const cacheData = {
            entityId,
            fusedData: fusedData.slice(0, 100), // Limit cache size
            fusedAt: new Date(),
            eventCount: fusedData.length
        };

        await this.redis.setEx(cacheKey, 300, JSON.stringify(cacheData)); // 5 minute TTL
    }

    /**
     * Get cached fusion results
     */
    async getCachedResults(entityId) {
        if (!this.redis) return null;

        const cacheKey = `fusion:${entityId}`;
        const cached = await this.redis.get(cacheKey);
        
        return cached ? JSON.parse(cached) : null;
    }
}

module.exports = DataFusionService;