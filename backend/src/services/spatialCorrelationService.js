const winston = require('winston');
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
        new winston.transports.File({ filename: 'logs/spatial_correlation.log' })
    ]
});

class SpatialCorrelationService {
    constructor() {
        this.config = {
            proximityThresholdMeters: parseFloat(process.env.PROXIMITY_THRESHOLD_METERS) || 50,
            timeWindowMs: parseInt(process.env.SPATIAL_TIME_WINDOW_MS) || 5 * 60 * 1000, // 5 minutes
            maxMovementSpeedKmh: parseFloat(process.env.MAX_MOVEMENT_SPEED_KMH) || 50,
            buildingProximityBonus: parseFloat(process.env.BUILDING_PROXIMITY_BONUS) || 0.2,
            floorProximityBonus: parseFloat(process.env.FLOOR_PROXIMITY_BONUS) || 0.1,
            roomProximityBonus: parseFloat(process.env.ROOM_PROXIMITY_BONUS) || 0.3,
            confidenceDecayRate: parseFloat(process.env.CONFIDENCE_DECAY_RATE) || 0.1
        };

        // Campus layout and building information
        this.campusLayout = {
            buildings: new Map(),
            accessPoints: new Map(),
            zones: new Map()
        };

        // Spatial correlation cache
        this.correlationCache = new Map();
        this.cacheTimeout = 15 * 60 * 1000; // 15 minutes

        this.initializeCampusLayout();
    }

    /**
     * Initialize campus layout with building coordinates and relationships
     */
    initializeCampusLayout() {
        // Sample campus layout - in production, this would be loaded from database
        const buildings = [
            {
                id: 'academic_complex',
                name: 'Academic Complex',
                coordinates: { lat: 26.1882, lon: 91.6920 },
                floors: ['Ground', '1st', '2nd', '3rd'],
                zone: 'academic',
                accessLevel: 'public'
            },
            {
                id: 'library',
                name: 'Library',
                coordinates: { lat: 26.1885, lon: 91.6925 },
                floors: ['Ground', '1st', '2nd', '3rd', '4th'],
                zone: 'academic',
                accessLevel: 'public'
            },
            {
                id: 'hostel_a',
                name: 'Hostel A',
                coordinates: { lat: 26.1890, lon: 91.6930 },
                floors: ['Ground', '1st', '2nd', '3rd'],
                zone: 'residential',
                accessLevel: 'private'
            },
            {
                id: 'admin_block',
                name: 'Admin Block',
                coordinates: { lat: 26.1880, lon: 91.6915 },
                floors: ['Ground', '1st', '2nd'],
                zone: 'administrative',
                accessLevel: 'restricted'
            },
            {
                id: 'sports_complex',
                name: 'Sports Complex',
                coordinates: { lat: 26.1875, lon: 91.6935 },
                floors: ['Ground', '1st'],
                zone: 'recreational',
                accessLevel: 'public'
            }
        ];

        buildings.forEach(building => {
            this.campusLayout.buildings.set(building.name, building);
        });

        logger.info(`Initialized campus layout with ${buildings.length} buildings`);
    }

    /**
     * Analyze spatial correlation between events
     * @param {Array} events - Array of events to analyze
     * @param {Object} options - Analysis options
     */
    async analyzeSpatialCorrelation(events, options = {}) {
        const startTime = Date.now();
        
        try {
            const {
                entityId = null,
                timeWindow = this.config.timeWindowMs,
                proximityThreshold = this.config.proximityThresholdMeters,
                includeMovementAnalysis = true
            } = options;

            logger.debug(`Analyzing spatial correlation for ${events.length} events`, {
                entityId,
                timeWindow,
                proximityThreshold
            });

            // Filter events by entity if specified
            const targetEvents = entityId 
                ? events.filter(event => event.entity_id === entityId)
                : events;

            if (targetEvents.length < 2) {
                return {
                    correlations: [],
                    movementPatterns: [],
                    spatialClusters: [],
                    anomalies: []
                };
            }

            // Sort events by timestamp
            const sortedEvents = targetEvents.sort((a, b) => 
                new Date(a.timestamp) - new Date(b.timestamp)
            );

            // Find spatial correlations
            const correlations = await this.findSpatialCorrelations(sortedEvents, {
                timeWindow,
                proximityThreshold
            });

            // Analyze movement patterns
            let movementPatterns = [];
            if (includeMovementAnalysis) {
                movementPatterns = await this.analyzeMovementPatterns(sortedEvents);
            }

            // Identify spatial clusters
            const spatialClusters = await this.identifySpatialClusters(sortedEvents);

            // Detect spatial anomalies
            const anomalies = await this.detectSpatialAnomalies(sortedEvents);

            const processingTime = Date.now() - startTime;
            
            const result = {
                correlations,
                movementPatterns,
                spatialClusters,
                anomalies,
                stats: {
                    totalEvents: targetEvents.length,
                    correlationsFound: correlations.length,
                    movementSegments: movementPatterns.length,
                    spatialClusters: spatialClusters.length,
                    anomaliesDetected: anomalies.length,
                    processingTime
                }
            };

            logger.info('Spatial correlation analysis completed', result.stats);
            return result;

        } catch (error) {
            logger.error('Error analyzing spatial correlation:', error);
            throw error;
        }
    }

    /**
     * Find spatial correlations between events
     */
    async findSpatialCorrelations(events, options = {}) {
        try {
            const {
                timeWindow = this.config.timeWindowMs,
                proximityThreshold = this.config.proximityThresholdMeters
            } = options;

            const correlations = [];

            for (let i = 0; i < events.length; i++) {
                const event1 = events[i];
                if (!event1.location || !event1.location.coordinates) continue;

                for (let j = i + 1; j < events.length; j++) {
                    const event2 = events[j];
                    if (!event2.location || !event2.location.coordinates) continue;

                    // Check temporal proximity
                    const timeDiff = Math.abs(new Date(event2.timestamp) - new Date(event1.timestamp));
                    if (timeDiff > timeWindow) {
                        // Events are too far apart in time
                        if (j > i + 10) break; // Optimization: skip if we're too far ahead
                        continue;
                    }

                    // Calculate spatial distance
                    const distance = this.calculateDistance(
                        event1.location.coordinates,
                        event2.location.coordinates
                    );

                    if (distance <= proximityThreshold) {
                        // Calculate correlation strength
                        const correlation = await this.calculateCorrelationStrength(
                            event1, event2, distance, timeDiff
                        );

                        correlations.push({
                            event1Id: event1._id,
                            event2Id: event2._id,
                            entity1Id: event1.entity_id,
                            entity2Id: event2.entity_id,
                            distance: Math.round(distance * 100) / 100,
                            timeDiff: timeDiff,
                            correlationStrength: correlation.strength,
                            correlationType: correlation.type,
                            location1: event1.location,
                            location2: event2.location,
                            confidenceBoost: correlation.confidenceBoost,
                            spatialContext: correlation.spatialContext
                        });
                    }
                }
            }

            // Sort by correlation strength
            correlations.sort((a, b) => b.correlationStrength - a.correlationStrength);

            return correlations;

        } catch (error) {
            logger.error('Error finding spatial correlations:', error);
            return [];
        }
    }

    /**
     * Calculate correlation strength between two spatially and temporally close events
     */
    async calculateCorrelationStrength(event1, event2, distance, timeDiff) {
        try {
            let strength = 0;
            let confidenceBoost = 0;
            let correlationType = 'proximity';
            const spatialContext = {};

            // Base correlation from proximity (inverse relationship with distance)
            const proximityScore = Math.max(0, 1 - (distance / this.config.proximityThresholdMeters));
            strength += proximityScore * 0.4;

            // Temporal correlation (inverse relationship with time difference)
            const temporalScore = Math.max(0, 1 - (timeDiff / this.config.timeWindowMs));
            strength += temporalScore * 0.3;

            // Building-level correlation
            if (event1.location.building === event2.location.building) {
                strength += this.config.buildingProximityBonus;
                confidenceBoost += 0.15;
                correlationType = 'same_building';
                spatialContext.building = event1.location.building;

                // Floor-level correlation
                if (event1.location.floor === event2.location.floor) {
                    strength += this.config.floorProximityBonus;
                    confidenceBoost += 0.1;
                    correlationType = 'same_floor';
                    spatialContext.floor = event1.location.floor;

                    // Room-level correlation
                    if (event1.location.room === event2.location.room) {
                        strength += this.config.roomProximityBonus;
                        confidenceBoost += 0.2;
                        correlationType = 'same_room';
                        spatialContext.room = event1.location.room;
                    }
                }
            }

            // Zone-level correlation
            if (event1.location.zone === event2.location.zone) {
                strength += 0.05;
                spatialContext.zone = event1.location.zone;
            }

            // Source diversity bonus (different sources reporting same location)
            const source1Types = new Set((event1.sources || []).map(s => s.type));
            const source2Types = new Set((event2.sources || []).map(s => s.type));
            const hasCommonSources = [...source1Types].some(type => source2Types.has(type));
            
            if (!hasCommonSources && source1Types.size > 0 && source2Types.size > 0) {
                strength += 0.1;
                confidenceBoost += 0.1;
                spatialContext.sourceDiversity = true;
            }

            // Entity relationship bonus
            if (event1.entity_id === event2.entity_id) {
                // Same entity - check for realistic movement
                const movementSpeed = this.calculateMovementSpeed(event1, event2, distance, timeDiff);
                if (movementSpeed <= this.config.maxMovementSpeedKmh) {
                    strength += 0.2;
                    spatialContext.sameEntity = true;
                    spatialContext.movementSpeed = movementSpeed;
                } else {
                    // Impossible movement - reduce correlation
                    strength *= 0.5;
                    spatialContext.impossibleMovement = true;
                    spatialContext.movementSpeed = movementSpeed;
                }
            } else {
                // Different entities - potential co-location
                spatialContext.coLocation = true;
            }

            // Normalize strength to [0, 1]
            strength = Math.min(1.0, Math.max(0.0, strength));

            return {
                strength: Math.round(strength * 1000) / 1000,
                type: correlationType,
                confidenceBoost: Math.round(confidenceBoost * 1000) / 1000,
                spatialContext
            };

        } catch (error) {
            logger.error('Error calculating correlation strength:', error);
            return {
                strength: 0,
                type: 'unknown',
                confidenceBoost: 0,
                spatialContext: {}
            };
        }
    }

    /**
     * Analyze movement patterns from spatial data
     */
    async analyzeMovementPatterns(events) {
        try {
            if (events.length < 2) return [];

            const patterns = [];
            const entityGroups = new Map();

            // Group events by entity
            events.forEach(event => {
                if (!entityGroups.has(event.entity_id)) {
                    entityGroups.set(event.entity_id, []);
                }
                entityGroups.get(event.entity_id).push(event);
            });

            // Analyze patterns for each entity
            for (const [entityId, entityEvents] of entityGroups) {
                if (entityEvents.length < 2) continue;

                const entityPatterns = await this.analyzeEntityMovementPattern(entityId, entityEvents);
                patterns.push(...entityPatterns);
            }

            return patterns;

        } catch (error) {
            logger.error('Error analyzing movement patterns:', error);
            return [];
        }
    }

    /**
     * Analyze movement pattern for a specific entity
     */
    async analyzeEntityMovementPattern(entityId, events) {
        try {
            const patterns = [];
            const sortedEvents = events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

            for (let i = 1; i < sortedEvents.length; i++) {
                const fromEvent = sortedEvents[i - 1];
                const toEvent = sortedEvents[i];

                if (!fromEvent.location?.coordinates || !toEvent.location?.coordinates) {
                    continue;
                }

                const distance = this.calculateDistance(
                    fromEvent.location.coordinates,
                    toEvent.location.coordinates
                );

                const timeDiff = new Date(toEvent.timestamp) - new Date(fromEvent.timestamp);
                const speed = this.calculateMovementSpeed(fromEvent, toEvent, distance, timeDiff);

                const pattern = {
                    entityId,
                    segmentId: `${entityId}_${i}`,
                    fromLocation: {
                        building: fromEvent.location.building,
                        room: fromEvent.location.room,
                        coordinates: fromEvent.location.coordinates
                    },
                    toLocation: {
                        building: toEvent.location.building,
                        room: toEvent.location.room,
                        coordinates: toEvent.location.coordinates
                    },
                    fromTimestamp: fromEvent.timestamp,
                    toTimestamp: toEvent.timestamp,
                    distance: Math.round(distance * 100) / 100,
                    duration: timeDiff,
                    speed: Math.round(speed * 100) / 100,
                    movementType: this.classifyMovement(fromEvent.location, toEvent.location, distance, speed),
                    isRealistic: speed <= this.config.maxMovementSpeedKmh,
                    confidence: Math.min(fromEvent.fused_confidence || 0, toEvent.fused_confidence || 0)
                };

                patterns.push(pattern);
            }

            return patterns;

        } catch (error) {
            logger.error('Error analyzing entity movement pattern:', error);
            return [];
        }
    }

    /**
     * Identify spatial clusters of activity
     */
    async identifySpatialClusters(events) {
        try {
            const clusters = [];
            const processed = new Set();
            const eventsWithCoords = events.filter(e => e.location?.coordinates);

            for (let i = 0; i < eventsWithCoords.length; i++) {
                if (processed.has(i)) continue;

                const centerEvent = eventsWithCoords[i];
                const cluster = {
                    id: `cluster_${clusters.length + 1}`,
                    centerLocation: centerEvent.location,
                    events: [centerEvent],
                    entities: new Set([centerEvent.entity_id]),
                    timeSpan: {
                        start: centerEvent.timestamp,
                        end: centerEvent.timestamp
                    },
                    radius: 0,
                    density: 0
                };

                processed.add(i);

                // Find nearby events
                for (let j = i + 1; j < eventsWithCoords.length; j++) {
                    if (processed.has(j)) continue;

                    const otherEvent = eventsWithCoords[j];
                    const distance = this.calculateDistance(
                        centerEvent.location.coordinates,
                        otherEvent.location.coordinates
                    );

                    if (distance <= this.config.proximityThresholdMeters) {
                        cluster.events.push(otherEvent);
                        cluster.entities.add(otherEvent.entity_id);
                        
                        // Update time span
                        if (new Date(otherEvent.timestamp) < new Date(cluster.timeSpan.start)) {
                            cluster.timeSpan.start = otherEvent.timestamp;
                        }
                        if (new Date(otherEvent.timestamp) > new Date(cluster.timeSpan.end)) {
                            cluster.timeSpan.end = otherEvent.timestamp;
                        }

                        // Update radius
                        cluster.radius = Math.max(cluster.radius, distance);
                        
                        processed.add(j);
                    }
                }

                // Calculate cluster metrics
                if (cluster.events.length >= 2) {
                    cluster.entityCount = cluster.entities.size;
                    cluster.eventCount = cluster.events.length;
                    cluster.duration = new Date(cluster.timeSpan.end) - new Date(cluster.timeSpan.start);
                    cluster.density = cluster.eventCount / (Math.PI * Math.pow(cluster.radius || 1, 2));
                    cluster.avgConfidence = cluster.events.reduce((sum, e) => 
                        sum + (e.fused_confidence || 0), 0) / cluster.events.length;

                    clusters.push(cluster);
                }
            }

            // Sort clusters by density and size
            clusters.sort((a, b) => (b.density * b.eventCount) - (a.density * a.eventCount));

            return clusters;

        } catch (error) {
            logger.error('Error identifying spatial clusters:', error);
            return [];
        }
    }

    /**
     * Detect spatial anomalies
     */
    async detectSpatialAnomalies(events) {
        try {
            const anomalies = [];
            const entityGroups = new Map();

            // Group events by entity
            events.forEach(event => {
                if (!entityGroups.has(event.entity_id)) {
                    entityGroups.set(event.entity_id, []);
                }
                entityGroups.get(event.entity_id).push(event);
            });

            // Check each entity for anomalies
            for (const [entityId, entityEvents] of entityGroups) {
                const entityAnomalies = await this.detectEntitySpatialAnomalies(entityId, entityEvents);
                anomalies.push(...entityAnomalies);
            }

            return anomalies;

        } catch (error) {
            logger.error('Error detecting spatial anomalies:', error);
            return [];
        }
    }

    /**
     * Detect spatial anomalies for a specific entity
     */
    async detectEntitySpatialAnomalies(entityId, events) {
        try {
            const anomalies = [];
            const sortedEvents = events.filter(e => e.location?.coordinates)
                .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

            if (sortedEvents.length < 2) return anomalies;

            for (let i = 1; i < sortedEvents.length; i++) {
                const prevEvent = sortedEvents[i - 1];
                const currEvent = sortedEvents[i];

                const distance = this.calculateDistance(
                    prevEvent.location.coordinates,
                    currEvent.location.coordinates
                );

                const timeDiff = new Date(currEvent.timestamp) - new Date(prevEvent.timestamp);
                const speed = this.calculateMovementSpeed(prevEvent, currEvent, distance, timeDiff);

                // Detect impossible movement
                if (speed > this.config.maxMovementSpeedKmh) {
                    anomalies.push({
                        type: 'impossible_movement',
                        entityId,
                        severity: speed > this.config.maxMovementSpeedKmh * 2 ? 'high' : 'medium',
                        description: `Entity moved ${distance.toFixed(1)}m in ${(timeDiff/1000).toFixed(1)}s (${speed.toFixed(1)} km/h)`,
                        fromEvent: prevEvent._id,
                        toEvent: currEvent._id,
                        fromLocation: prevEvent.location,
                        toLocation: currEvent.location,
                        distance,
                        speed,
                        timeDiff,
                        detectedAt: new Date()
                    });
                }

                // Detect simultaneous presence (if events are very close in time but far in space)
                if (timeDiff < 60000 && distance > 100) { // Less than 1 minute, more than 100m
                    anomalies.push({
                        type: 'simultaneous_presence',
                        entityId,
                        severity: 'high',
                        description: `Entity appears at two distant locations within ${(timeDiff/1000).toFixed(1)} seconds`,
                        fromEvent: prevEvent._id,
                        toEvent: currEvent._id,
                        fromLocation: prevEvent.location,
                        toLocation: currEvent.location,
                        distance,
                        timeDiff,
                        detectedAt: new Date()
                    });
                }
            }

            // Detect unusual location patterns
            const locationFrequency = new Map();
            sortedEvents.forEach(event => {
                const locationKey = `${event.location.building}:${event.location.room || 'unknown'}`;
                locationFrequency.set(locationKey, (locationFrequency.get(locationKey) || 0) + 1);
            });

            // Check for access to restricted areas
            sortedEvents.forEach(event => {
                if (event.location.access_level === 'restricted' || event.location.access_level === 'private') {
                    const building = this.campusLayout.buildings.get(event.location.building);
                    if (building && building.accessLevel === 'restricted') {
                        anomalies.push({
                            type: 'restricted_area_access',
                            entityId,
                            severity: 'medium',
                            description: `Entity accessed restricted area: ${event.location.building}`,
                            event: event._id,
                            location: event.location,
                            timestamp: event.timestamp,
                            detectedAt: new Date()
                        });
                    }
                }
            });

            return anomalies;

        } catch (error) {
            logger.error('Error detecting entity spatial anomalies:', error);
            return [];
        }
    }

    /**
     * Enhance event confidence based on spatial correlation
     */
    async enhanceEventConfidence(events) {
        try {
            const enhancedEvents = [...events];
            
            // Find spatial correlations
            const correlations = await this.findSpatialCorrelations(events);
            
            // Apply confidence boosts
            correlations.forEach(correlation => {
                const event1Index = enhancedEvents.findIndex(e => e._id === correlation.event1Id);
                const event2Index = enhancedEvents.findIndex(e => e._id === correlation.event2Id);
                
                if (event1Index !== -1 && event2Index !== -1) {
                    const boost = correlation.confidenceBoost;
                    
                    enhancedEvents[event1Index] = {
                        ...enhancedEvents[event1Index],
                        fused_confidence: Math.min(1.0, 
                            (enhancedEvents[event1Index].fused_confidence || 0) + boost
                        ),
                        spatialCorrelationBoost: boost,
                        correlatedWith: correlation.event2Id
                    };
                    
                    enhancedEvents[event2Index] = {
                        ...enhancedEvents[event2Index],
                        fused_confidence: Math.min(1.0, 
                            (enhancedEvents[event2Index].fused_confidence || 0) + boost
                        ),
                        spatialCorrelationBoost: boost,
                        correlatedWith: correlation.event1Id
                    };
                }
            });

            return enhancedEvents;

        } catch (error) {
            logger.error('Error enhancing event confidence:', error);
            return events;
        }
    }

    // Helper methods

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

    calculateMovementSpeed(event1, event2, distance, timeDiff) {
        if (timeDiff <= 0) return Infinity;
        
        const speedMs = distance / (timeDiff / 1000); // meters per second
        const speedKmh = speedMs * 3.6; // convert to km/h
        
        return speedKmh;
    }

    classifyMovement(fromLocation, toLocation, distance, speed) {
        if (distance < 5) {
            return 'stationary';
        } else if (fromLocation.building === toLocation.building) {
            if (fromLocation.room === toLocation.room) {
                return 'within_room';
            } else if (fromLocation.floor === toLocation.floor) {
                return 'within_floor';
            } else {
                return 'within_building';
            }
        } else {
            if (distance < 100) {
                return 'nearby_building';
            } else if (speed < 5) {
                return 'walking';
            } else if (speed < 25) {
                return 'cycling';
            } else {
                return 'vehicular';
            }
        }
    }

    // Cache management
    clearCache() {
        this.correlationCache.clear();
        logger.info('Spatial correlation cache cleared');
    }

    getCacheStats() {
        return {
            correlationCacheSize: this.correlationCache.size,
            buildingsLoaded: this.campusLayout.buildings.size,
            cacheTimeout: this.cacheTimeout
        };
    }

    // Configuration methods
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        logger.info('Spatial correlation configuration updated', newConfig);
    }

    getConfig() {
        return { ...this.config };
    }

    // Campus layout management
    addBuilding(building) {
        this.campusLayout.buildings.set(building.name, building);
        logger.info(`Added building to campus layout: ${building.name}`);
    }

    updateBuilding(buildingName, updates) {
        const building = this.campusLayout.buildings.get(buildingName);
        if (building) {
            this.campusLayout.buildings.set(buildingName, { ...building, ...updates });
            logger.info(`Updated building: ${buildingName}`);
        }
    }

    getCampusLayout() {
        return {
            buildings: Array.from(this.campusLayout.buildings.values()),
            accessPoints: Array.from(this.campusLayout.accessPoints.values()),
            zones: Array.from(this.campusLayout.zones.values())
        };
    }
}

module.exports = SpatialCorrelationService;