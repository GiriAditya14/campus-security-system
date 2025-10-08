const winston = require('winston');
const moment = require('moment');
const Event = require('../models/Event');

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
        new winston.transports.File({ filename: 'logs/temporal_alignment.log' })
    ]
});

class TemporalAlignmentService {
    constructor() {
        this.config = {
            bucketSizeMs: parseInt(process.env.TEMPORAL_BUCKET_SIZE_MS) || 5 * 60 * 1000, // 5 minutes
            maxTimeSkewMs: parseInt(process.env.MAX_TIME_SKEW_MS) || 2 * 60 * 1000, // 2 minutes
            alignmentWindowMs: parseInt(process.env.ALIGNMENT_WINDOW_MS) || 30 * 60 * 1000, // 30 minutes
            minEventsForAlignment: parseInt(process.env.MIN_EVENTS_FOR_ALIGNMENT) || 2,
            timezoneOffset: parseInt(process.env.TIMEZONE_OFFSET_HOURS) || 0,
            clockDriftThresholdMs: parseInt(process.env.CLOCK_DRIFT_THRESHOLD_MS) || 10 * 1000 // 10 seconds
        };

        // Cache for temporal buckets
        this.bucketCache = new Map();
        this.cacheTimeout = 10 * 60 * 1000; // 10 minutes

        // Clock drift detection
        this.clockDriftData = new Map();
    }

    /**
     * Create temporal buckets for event correlation
     * @param {Array} events - Array of events to bucket
     * @param {Object} options - Bucketing options
     */
    createTemporalBuckets(events, options = {}) {
        const startTime = Date.now();
        
        try {
            const {
                bucketSize = this.config.bucketSizeMs,
                alignmentWindow = this.config.alignmentWindowMs,
                entityId = null
            } = options;

            logger.debug(`Creating temporal buckets for ${events.length} events`, {
                bucketSize,
                alignmentWindow,
                entityId
            });

            // Sort events by timestamp
            const sortedEvents = events.sort((a, b) => 
                new Date(a.timestamp) - new Date(b.timestamp)
            );

            if (sortedEvents.length === 0) {
                return [];
            }

            // Determine time range
            const startTimestamp = new Date(sortedEvents[0].timestamp);
            const endTimestamp = new Date(sortedEvents[sortedEvents.length - 1].timestamp);
            
            // Create bucket structure
            const buckets = [];
            let currentBucketStart = new Date(Math.floor(startTimestamp.getTime() / bucketSize) * bucketSize);
            
            while (currentBucketStart <= endTimestamp) {
                const bucketEnd = new Date(currentBucketStart.getTime() + bucketSize);
                
                const bucket = {
                    id: `bucket_${currentBucketStart.getTime()}`,
                    startTime: new Date(currentBucketStart),
                    endTime: new Date(bucketEnd),
                    duration: bucketSize,
                    events: [],
                    sources: new Set(),
                    entities: new Set(),
                    locations: new Set(),
                    confidence: 0,
                    alignmentScore: 0
                };

                // Add events to bucket
                sortedEvents.forEach(event => {
                    const eventTime = new Date(event.timestamp);
                    if (eventTime >= bucket.startTime && eventTime < bucket.endTime) {
                        bucket.events.push(event);
                        
                        // Track sources, entities, and locations
                        if (event.sources) {
                            event.sources.forEach(source => bucket.sources.add(source.type));
                        }
                        if (event.entity_id) {
                            bucket.entities.add(event.entity_id);
                        }
                        if (event.location) {
                            bucket.locations.add(`${event.location.building}:${event.location.room || 'unknown'}`);
                        }
                    }
                });

                // Calculate bucket metrics
                if (bucket.events.length > 0) {
                    bucket.confidence = this.calculateBucketConfidence(bucket);
                    bucket.alignmentScore = this.calculateAlignmentScore(bucket);
                    buckets.push(bucket);
                }

                currentBucketStart = new Date(bucketEnd);
            }

            // Post-process buckets for cross-source alignment
            const alignedBuckets = this.alignCrossSources(buckets, options);

            const processingTime = Date.now() - startTime;
            logger.info(`Created ${alignedBuckets.length} temporal buckets`, {
                totalEvents: events.length,
                bucketSize,
                processingTime
            });

            return alignedBuckets;

        } catch (error) {
            logger.error('Error creating temporal buckets:', error);
            throw error;
        }
    }

    /**
     * Align events across different data sources
     */
    alignCrossSources(buckets, options = {}) {
        try {
            const {
                maxTimeSkew = this.config.maxTimeSkewMs,
                minSources = 2
            } = options;

            const alignedBuckets = [];

            buckets.forEach(bucket => {
                // Skip buckets with insufficient cross-source events
                if (bucket.sources.size < minSources) {
                    alignedBuckets.push(bucket);
                    return;
                }

                // Detect and correct time skew between sources
                const correctedBucket = this.correctTimeSkew(bucket, maxTimeSkew);
                
                // Merge nearby events from different sources
                const mergedBucket = this.mergeNearbyEvents(correctedBucket, maxTimeSkew);
                
                alignedBuckets.push(mergedBucket);
            });

            return alignedBuckets;

        } catch (error) {
            logger.error('Error aligning cross-sources:', error);
            return buckets;
        }
    }

    /**
     * Detect and correct time skew between data sources
     */
    correctTimeSkew(bucket, maxTimeSkew) {
        try {
            const sourceGroups = new Map();
            
            // Group events by source type
            bucket.events.forEach(event => {
                if (event.sources && event.sources.length > 0) {
                    const sourceType = event.sources[0].type;
                    if (!sourceGroups.has(sourceType)) {
                        sourceGroups.set(sourceType, []);
                    }
                    sourceGroups.get(sourceType).push(event);
                }
            });

            // Calculate time offsets between sources
            const sourceOffsets = new Map();
            const sourceTypes = Array.from(sourceGroups.keys());
            
            if (sourceTypes.length < 2) {
                return bucket; // No cross-source alignment needed
            }

            // Use card_swipe as reference (most accurate timestamps)
            const referenceSource = sourceTypes.includes('card_swipe') ? 'card_swipe' : sourceTypes[0];
            const referenceEvents = sourceGroups.get(referenceSource) || [];

            sourceTypes.forEach(sourceType => {
                if (sourceType === referenceSource) {
                    sourceOffsets.set(sourceType, 0);
                    return;
                }

                const sourceEvents = sourceGroups.get(sourceType);
                const offset = this.calculateTimeOffset(referenceEvents, sourceEvents, maxTimeSkew);
                sourceOffsets.set(sourceType, offset);
                
                logger.debug(`Time offset for ${sourceType}: ${offset}ms`);
            });

            // Apply corrections
            const correctedBucket = { ...bucket };
            correctedBucket.events = bucket.events.map(event => {
                if (event.sources && event.sources.length > 0) {
                    const sourceType = event.sources[0].type;
                    const offset = sourceOffsets.get(sourceType) || 0;
                    
                    if (offset !== 0) {
                        const correctedEvent = { ...event };
                        correctedEvent.timestamp = new Date(new Date(event.timestamp).getTime() - offset);
                        correctedEvent.timeSkewCorrected = true;
                        correctedEvent.originalTimestamp = event.timestamp;
                        correctedEvent.appliedOffset = offset;
                        return correctedEvent;
                    }
                }
                return event;
            });

            return correctedBucket;

        } catch (error) {
            logger.error('Error correcting time skew:', error);
            return bucket;
        }
    }

    /**
     * Calculate time offset between two sets of events
     */
    calculateTimeOffset(referenceEvents, sourceEvents, maxTimeSkew) {
        try {
            if (referenceEvents.length === 0 || sourceEvents.length === 0) {
                return 0;
            }

            const offsets = [];

            // Find matching events (same entity, similar time)
            referenceEvents.forEach(refEvent => {
                sourceEvents.forEach(srcEvent => {
                    if (refEvent.entity_id === srcEvent.entity_id) {
                        const timeDiff = new Date(srcEvent.timestamp) - new Date(refEvent.timestamp);
                        if (Math.abs(timeDiff) <= maxTimeSkew) {
                            offsets.push(timeDiff);
                        }
                    }
                });
            });

            if (offsets.length === 0) {
                return 0;
            }

            // Calculate median offset (more robust than mean)
            offsets.sort((a, b) => a - b);
            const median = offsets.length % 2 === 0
                ? (offsets[offsets.length / 2 - 1] + offsets[offsets.length / 2]) / 2
                : offsets[Math.floor(offsets.length / 2)];

            return Math.round(median);

        } catch (error) {
            logger.error('Error calculating time offset:', error);
            return 0;
        }
    }

    /**
     * Merge nearby events from different sources
     */
    mergeNearbyEvents(bucket, maxTimeSkew) {
        try {
            const mergedEvents = [];
            const processed = new Set();

            bucket.events.forEach((event, index) => {
                if (processed.has(index)) return;

                const eventGroup = [event];
                processed.add(index);

                // Find nearby events from different sources
                bucket.events.forEach((otherEvent, otherIndex) => {
                    if (processed.has(otherIndex) || index === otherIndex) return;

                    const timeDiff = Math.abs(new Date(event.timestamp) - new Date(otherEvent.timestamp));
                    const sameEntity = event.entity_id === otherEvent.entity_id;
                    const differentSource = this.hasDifferentSources(event, otherEvent);

                    if (timeDiff <= maxTimeSkew && sameEntity && differentSource) {
                        eventGroup.push(otherEvent);
                        processed.add(otherIndex);
                    }
                });

                if (eventGroup.length > 1) {
                    // Create merged event
                    const mergedEvent = this.createMergedEvent(eventGroup);
                    mergedEvents.push(mergedEvent);
                } else {
                    mergedEvents.push(event);
                }
            });

            const mergedBucket = { ...bucket };
            mergedBucket.events = mergedEvents;
            mergedBucket.mergedEventCount = bucket.events.length - mergedEvents.length;

            return mergedBucket;

        } catch (error) {
            logger.error('Error merging nearby events:', error);
            return bucket;
        }
    }

    /**
     * Create a merged event from multiple source events
     */
    createMergedEvent(eventGroup) {
        try {
            // Use the event with highest confidence as base
            const baseEvent = eventGroup.reduce((prev, current) => 
                (current.fused_confidence || 0) > (prev.fused_confidence || 0) ? current : prev
            );

            // Merge sources
            const allSources = [];
            const sourceMap = new Map();

            eventGroup.forEach(event => {
                if (event.sources) {
                    event.sources.forEach(source => {
                        const key = `${source.type}_${source.id}`;
                        if (!sourceMap.has(key)) {
                            sourceMap.set(key, source);
                            allSources.push(source);
                        }
                    });
                }
            });

            // Calculate weighted average timestamp
            const totalConfidence = eventGroup.reduce((sum, event) => sum + (event.fused_confidence || 0), 0);
            let weightedTimestamp = 0;

            if (totalConfidence > 0) {
                eventGroup.forEach(event => {
                    const weight = (event.fused_confidence || 0) / totalConfidence;
                    weightedTimestamp += new Date(event.timestamp).getTime() * weight;
                });
            } else {
                // Fallback to simple average
                weightedTimestamp = eventGroup.reduce((sum, event) => 
                    sum + new Date(event.timestamp).getTime(), 0) / eventGroup.length;
            }

            // Create merged event
            const mergedEvent = {
                ...baseEvent,
                _id: `MERGED_${baseEvent._id}_${Date.now()}`,
                timestamp: new Date(Math.round(weightedTimestamp)),
                sources: allSources,
                fused_confidence: this.calculateFusedConfidence(allSources),
                provenance: {
                    ...baseEvent.provenance,
                    fusion_algorithm: 'temporal_alignment',
                    merged_events: eventGroup.length,
                    original_events: eventGroup.map(e => e._id),
                    processing_time: '0ms'
                },
                temporallyAligned: true,
                originalEvents: eventGroup
            };

            return mergedEvent;

        } catch (error) {
            logger.error('Error creating merged event:', error);
            return eventGroup[0]; // Return first event as fallback
        }
    }

    /**
     * Handle timezone differences and normalization
     */
    normalizeTimezones(events, targetTimezone = 'UTC') {
        try {
            return events.map(event => {
                const normalizedEvent = { ...event };
                
                // Convert timestamp to target timezone
                const originalTime = moment(event.timestamp);
                const normalizedTime = originalTime.utc();
                
                normalizedEvent.timestamp = normalizedTime.toDate();
                normalizedEvent.originalTimezone = originalTime.format('Z');
                normalizedEvent.normalizedTimezone = targetTimezone;
                
                return normalizedEvent;
            });

        } catch (error) {
            logger.error('Error normalizing timezones:', error);
            return events;
        }
    }

    /**
     * Validate temporal consistency (detect impossible movements)
     */
    validateTemporalConsistency(events, entityId) {
        try {
            const entityEvents = events.filter(event => event.entity_id === entityId)
                .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

            const inconsistencies = [];
            const maxSpeedKmh = 50; // Maximum realistic speed on campus

            for (let i = 1; i < entityEvents.length; i++) {
                const prevEvent = entityEvents[i - 1];
                const currEvent = entityEvents[i];

                const timeDiff = (new Date(currEvent.timestamp) - new Date(prevEvent.timestamp)) / 1000; // seconds
                
                if (timeDiff <= 0) {
                    inconsistencies.push({
                        type: 'temporal_order',
                        events: [prevEvent._id, currEvent._id],
                        issue: 'Events out of chronological order',
                        severity: 'high'
                    });
                    continue;
                }

                // Check for impossible movement speed
                if (prevEvent.location && currEvent.location && 
                    prevEvent.location.coordinates && currEvent.location.coordinates) {
                    
                    const distance = this.calculateDistance(
                        prevEvent.location.coordinates,
                        currEvent.location.coordinates
                    );
                    
                    const speedKmh = (distance / 1000) / (timeDiff / 3600);
                    
                    if (speedKmh > maxSpeedKmh) {
                        inconsistencies.push({
                            type: 'impossible_movement',
                            events: [prevEvent._id, currEvent._id],
                            issue: `Movement speed ${speedKmh.toFixed(1)} km/h exceeds maximum ${maxSpeedKmh} km/h`,
                            severity: 'medium',
                            distance: distance,
                            speed: speedKmh,
                            timeDiff: timeDiff
                        });
                    }
                }
            }

            return {
                entityId,
                totalEvents: entityEvents.length,
                inconsistencies,
                isConsistent: inconsistencies.length === 0
            };

        } catch (error) {
            logger.error('Error validating temporal consistency:', error);
            return {
                entityId,
                totalEvents: 0,
                inconsistencies: [],
                isConsistent: false,
                error: error.message
            };
        }
    }

    /**
     * Detect clock drift between data sources
     */
    detectClockDrift(events) {
        try {
            const sourceTimestamps = new Map();
            
            // Group events by source and collect timestamps
            events.forEach(event => {
                if (event.sources && event.sources.length > 0) {
                    const sourceType = event.sources[0].type;
                    if (!sourceTimestamps.has(sourceType)) {
                        sourceTimestamps.set(sourceType, []);
                    }
                    sourceTimestamps.get(sourceType).push({
                        timestamp: new Date(event.timestamp),
                        receivedAt: new Date(event.createdAt || event.timestamp)
                    });
                }
            });

            const driftAnalysis = new Map();
            
            sourceTimestamps.forEach((timestamps, sourceType) => {
                if (timestamps.length < 10) return; // Need sufficient data points
                
                // Calculate drift over time
                const drifts = timestamps.map(t => 
                    t.receivedAt.getTime() - t.timestamp.getTime()
                );
                
                const avgDrift = drifts.reduce((sum, drift) => sum + drift, 0) / drifts.length;
                const maxDrift = Math.max(...drifts.map(Math.abs));
                const driftVariance = this.calculateVariance(drifts);
                
                driftAnalysis.set(sourceType, {
                    averageDrift: avgDrift,
                    maxDrift: maxDrift,
                    driftVariance: driftVariance,
                    isDrifting: maxDrift > this.config.clockDriftThresholdMs,
                    sampleSize: timestamps.length
                });
                
                // Store for trend analysis
                this.clockDriftData.set(sourceType, {
                    lastUpdate: Date.now(),
                    driftHistory: (this.clockDriftData.get(sourceType)?.driftHistory || [])
                        .concat([{ timestamp: Date.now(), drift: avgDrift }])
                        .slice(-100) // Keep last 100 measurements
                });
            });

            return Object.fromEntries(driftAnalysis);

        } catch (error) {
            logger.error('Error detecting clock drift:', error);
            return {};
        }
    }

    /**
     * Get entity timeline with temporal alignment
     */
    async getAlignedEntityTimeline(entityId, startDate, endDate, options = {}) {
        try {
            const {
                includeMergedEvents = true,
                applyTimeCorrection = true,
                validateConsistency = true
            } = options;

            // Fetch events from database
            const events = await Event.getEntityTimeline(entityId, startDate, endDate, {
                limit: 1000,
                minConfidence: 0.1
            });

            if (events.length === 0) {
                return {
                    entityId,
                    timeline: [],
                    buckets: [],
                    consistency: { isConsistent: true, inconsistencies: [] }
                };
            }

            // Apply timezone normalization
            const normalizedEvents = this.normalizeTimezones(events);

            // Create temporal buckets
            const buckets = this.createTemporalBuckets(normalizedEvents, {
                entityId,
                ...options
            });

            // Extract aligned timeline
            const alignedTimeline = buckets.flatMap(bucket => bucket.events)
                .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

            // Validate temporal consistency
            let consistency = { isConsistent: true, inconsistencies: [] };
            if (validateConsistency) {
                consistency = this.validateTemporalConsistency(alignedTimeline, entityId);
            }

            return {
                entityId,
                timeline: alignedTimeline,
                buckets: buckets,
                consistency: consistency,
                stats: {
                    originalEvents: events.length,
                    alignedEvents: alignedTimeline.length,
                    bucketsCreated: buckets.length,
                    mergedEvents: buckets.reduce((sum, b) => sum + (b.mergedEventCount || 0), 0)
                }
            };

        } catch (error) {
            logger.error('Error getting aligned entity timeline:', error);
            throw error;
        }
    }

    // Helper methods

    calculateBucketConfidence(bucket) {
        if (bucket.events.length === 0) return 0;
        
        const totalConfidence = bucket.events.reduce((sum, event) => 
            sum + (event.fused_confidence || 0), 0);
        
        return totalConfidence / bucket.events.length;
    }

    calculateAlignmentScore(bucket) {
        // Score based on cross-source correlation
        const sourceCount = bucket.sources.size;
        const entityCount = bucket.entities.size;
        const locationCount = bucket.locations.size;
        
        // Higher score for more sources, fewer entities (better correlation)
        let score = sourceCount * 0.4;
        if (entityCount > 0) {
            score += (1 / entityCount) * 0.3;
        }
        if (locationCount > 0) {
            score += (1 / locationCount) * 0.3;
        }
        
        return Math.min(1.0, score);
    }

    hasDifferentSources(event1, event2) {
        const sources1 = new Set((event1.sources || []).map(s => s.type));
        const sources2 = new Set((event2.sources || []).map(s => s.type));
        
        // Check if there's no overlap in source types
        for (const source of sources1) {
            if (sources2.has(source)) {
                return false;
            }
        }
        return true;
    }

    calculateFusedConfidence(sources) {
        if (sources.length === 0) return 0;
        
        // Dempster-Shafer theory for confidence fusion
        let belief = 0;
        let uncertainty = 1;
        
        for (const source of sources) {
            const sourceConfidence = source.confidence || 0.5;
            const sourceBelief = sourceConfidence;
            const sourceUncertainty = 1 - sourceConfidence;
            
            const k = belief * sourceUncertainty + sourceBelief * uncertainty;
            
            if (k > 0) {
                belief = (belief * sourceBelief) / (1 - k);
                uncertainty = (uncertainty * sourceUncertainty) / (1 - k);
            }
        }
        
        return Math.min(0.99, Math.max(0.01, belief));
    }

    calculateDistance(coord1, coord2) {
        // Haversine formula for distance calculation
        const R = 6371000; // Earth's radius in meters
        const lat1Rad = coord1.lat * Math.PI / 180;
        const lat2Rad = coord2.lat * Math.PI / 180;
        const deltaLatRad = (coord2.lat - coord1.lat) * Math.PI / 180;
        const deltaLonRad = (coord2.lon - coord1.lon) * Math.PI / 180;

        const a = Math.sin(deltaLatRad / 2) * Math.sin(deltaLatRad / 2) +
                  Math.cos(lat1Rad) * Math.cos(lat2Rad) *
                  Math.sin(deltaLonRad / 2) * Math.sin(deltaLonRad / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

        return R * c; // Distance in meters
    }

    calculateVariance(values) {
        if (values.length === 0) return 0;
        
        const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
        const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
        
        return squaredDiffs.reduce((sum, diff) => sum + diff, 0) / values.length;
    }

    // Cache management
    clearCache() {
        this.bucketCache.clear();
        logger.info('Temporal alignment cache cleared');
    }

    getCacheStats() {
        return {
            bucketCacheSize: this.bucketCache.size,
            clockDriftSources: this.clockDriftData.size,
            cacheTimeout: this.cacheTimeout
        };
    }

    // Configuration methods
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        logger.info('Temporal alignment configuration updated', newConfig);
    }

    getConfig() {
        return { ...this.config };
    }
}

module.exports = TemporalAlignmentService;