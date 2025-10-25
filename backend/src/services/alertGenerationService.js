const winston = require('winston');
const Event = require('../models/Event');
const Entity = require('../models/Entity');
const Alert = require('../models/Alert');
const { v4: uuidv4 } = require('uuid');

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
        new winston.transports.File({ filename: 'logs/alert_generation.log' })
    ]
});

/**
 * Real-time Alert Generation Service
 * Monitors events and generates alerts based on predefined rules
 */
class AlertGenerationService {
    constructor(socketService = null) {
        this.socketService = socketService;
        
        this.config = {
            inactivityThresholdHours: parseInt(process.env.INACTIVITY_THRESHOLD_HOURS) || 12,
            anomalyScoreThreshold: parseFloat(process.env.ANOMALY_SCORE_THRESHOLD) || 0.8,
            alertCheckInterval: parseInt(process.env.ALERT_CHECK_INTERVAL) || 300000, // 5 minutes
            maxAlertsPerEntity: 10,
            alertCooldownMinutes: 30
        };

        // Alert rules configuration
        this.alertRules = {
            INACTIVITY: {
                name: 'inactivity_detection',
                condition: 'hours_since_last_seen > threshold',
                threshold: this.config.inactivityThresholdHours,
                severity: 'MEDIUM',
                channels: ['websocket', 'email'],
                cooldown: 60 * 60 * 1000, // 1 hour
                enabled: true
            },
            UNUSUAL_LOCATION: {
                name: 'unusual_location_detection',
                condition: 'entity_in_restricted_area',
                severity: 'HIGH',
                channels: ['websocket', 'email', 'sms'],
                cooldown: 30 * 60 * 1000, // 30 minutes
                enabled: true
            },
            MULTIPLE_PRESENCE: {
                name: 'multiple_presence_detection',
                condition: 'simultaneous_locations > 1',
                severity: 'CRITICAL',
                channels: ['websocket', 'email', 'sms', 'webhook'],
                cooldown: 15 * 60 * 1000, // 15 minutes
                enabled: true
            },
            PATTERN_ANOMALY: {
                name: 'pattern_anomaly_detection',
                condition: 'anomaly_score > threshold',
                threshold: this.config.anomalyScoreThreshold,
                severity: 'MEDIUM',
                channels: ['websocket', 'email'],
                cooldown: 45 * 60 * 1000, // 45 minutes
                enabled: true
            },
            SECURITY_BREACH: {
                name: 'security_breach_detection',
                condition: 'unauthorized_access_detected',
                severity: 'CRITICAL',
                channels: ['websocket', 'email', 'sms', 'webhook'],
                cooldown: 10 * 60 * 1000, // 10 minutes
                enabled: true
            }
        };

        // Alert cache to prevent duplicates
        this.alertCache = new Map();
        
        // Performance metrics
        this.metrics = {
            totalAlertsGenerated: 0,
            alertsByType: {},
            alertsBySeverity: {},
            avgProcessingTime: 0,
            lastAlertTime: null
        };

        // Start alert monitoring
        this.startAlertMonitoring();
    }    
/**
     * Start continuous alert monitoring
     */
    startAlertMonitoring() {
        logger.info('Starting real-time alert generation service');
        
        // Initial check
        setTimeout(() => this.performAlertCheck(), 5000);
        
        // Schedule regular checks
        setInterval(() => {
            this.performAlertCheck().catch(error => {
                logger.error('Scheduled alert check failed:', error);
            });
        }, this.config.alertCheckInterval);
    }

    /**
     * Perform comprehensive alert check
     */
    async performAlertCheck() {
        const startTime = Date.now();
        
        try {
            logger.debug('Starting alert generation cycle');

            const alertResults = {
                inactivity: await this.checkInactivityAlerts(),
                unusualLocation: await this.checkUnusualLocationAlerts(),
                multiplePresence: await this.checkMultiplePresenceAlerts(),
                patternAnomaly: await this.checkPatternAnomalyAlerts()
            };

            const totalAlerts = Object.values(alertResults).reduce((sum, alerts) => sum + alerts.length, 0);
            
            // Process all generated alerts
            for (const [type, alerts] of Object.entries(alertResults)) {
                for (const alert of alerts) {
                    await this.processAlert(alert);
                }
            }

            const processingTime = Date.now() - startTime;
            this.updateMetrics(totalAlerts, processingTime);

            logger.info(`Alert check completed`, {
                totalAlerts,
                processingTime,
                alertBreakdown: Object.fromEntries(
                    Object.entries(alertResults).map(([type, alerts]) => [type, alerts.length])
                )
            });

            return alertResults;

        } catch (error) {
            logger.error('Alert check failed:', error);
            throw error;
        }
    }

    /**
     * Check for inactivity alerts
     */
    async checkInactivityAlerts() {
        try {
            const alerts = [];
            const thresholdTime = new Date(Date.now() - this.config.inactivityThresholdHours * 60 * 60 * 1000);

            // Find entities with no recent activity
            const inactiveEntities = await this.findInactiveEntities(thresholdTime);

            for (const entity of inactiveEntities) {
                // Check if alert already exists or is in cooldown
                if (await this.isAlertInCooldown(entity._id, 'INACTIVITY')) {
                    continue;
                }

                const lastSeenHours = this.calculateHoursSinceLastSeen(entity.lastSeen);
                
                // Get predicted location if available
                const predictedLocation = await this.getPredictedLocation(entity._id);

                const alert = {
                    type: 'INACTIVITY',
                    severity: lastSeenHours > 24 ? 'HIGH' : 'MEDIUM',
                    entity_id: entity._id,
                    entity_name: entity.name,
                    title: 'Entity Inactivity Detected',
                    description: `${entity.name} has not been observed for ${lastSeenHours} hours`,
                    context: {
                        entity_id: entity._id,
                        entity_name: entity.name,
                        hours_inactive: lastSeenHours,
                        last_seen: entity.lastSeen,
                        predicted_location: predictedLocation
                    },
                    rule: this.alertRules.INACTIVITY,
                    auto_resolve: true
                };

                alerts.push(alert);
            }

            logger.debug(`Generated ${alerts.length} inactivity alerts`);
            return alerts;

        } catch (error) {
            logger.error('Inactivity alert check failed:', error);
            return [];
        }
    }

    /**
     * Check for unusual location alerts
     */
    async checkUnusualLocationAlerts() {
        try {
            const alerts = [];
            const recentTime = new Date(Date.now() - 60 * 60 * 1000); // Last hour

            // Find recent events in restricted areas
            const restrictedEvents = await Event.find({
                timestamp: { $gte: recentTime },
                'location.access_level': { $in: ['restricted', 'private'] },
                fused_confidence: { $gte: 0.7 }
            }).lean();

            for (const event of restrictedEvents) {
                // Check if alert already exists or is in cooldown
                if (await this.isAlertInCooldown(event.entity_id, 'UNUSUAL_LOCATION')) {
                    continue;
                }

                // Get entity information
                const entity = await Entity.findById(event.entity_id);
                if (!entity) continue;

                // Check if entity has authorization for this location
                const hasAuthorization = await this.checkLocationAuthorization(entity, event.location);
                
                if (!hasAuthorization) {
                    const alert = {
                        type: 'UNUSUAL_LOCATION',
                        severity: event.location.access_level === 'restricted' ? 'HIGH' : 'MEDIUM',
                        entity_id: event.entity_id,
                        entity_name: entity.profile?.name || 'Unknown',
                        title: 'Unusual Location Access',
                        description: `${entity.profile?.name} detected in ${event.location.access_level} area: ${event.location.building}`,
                        context: {
                            entity_id: event.entity_id,
                            entity_name: entity.profile?.name,
                            location: event.location,
                            access_level: event.location.access_level,
                            timestamp: event.timestamp,
                            confidence: event.fused_confidence
                        },
                        rule: this.alertRules.UNUSUAL_LOCATION,
                        auto_resolve: true
                    };

                    alerts.push(alert);
                }
            }

            logger.debug(`Generated ${alerts.length} unusual location alerts`);
            return alerts;

        } catch (error) {
            logger.error('Unusual location alert check failed:', error);
            return [];
        }
    }

    /**
     * Check for multiple presence alerts
     */
    async checkMultiplePresenceAlerts() {
        try {
            const alerts = [];
            const recentTime = new Date(Date.now() - 10 * 60 * 1000); // Last 10 minutes

            // Group recent events by entity and check for simultaneous locations
            const recentEvents = await Event.find({
                timestamp: { $gte: recentTime },
                fused_confidence: { $gte: 0.6 }
            }).lean();

            const entityLocationMap = {};
            
            // Group events by entity
            recentEvents.forEach(event => {
                if (!entityLocationMap[event.entity_id]) {
                    entityLocationMap[event.entity_id] = [];
                }
                entityLocationMap[event.entity_id].push(event);
            });

            // Check for multiple simultaneous locations
            for (const [entityId, events] of Object.entries(entityLocationMap)) {
                // Check if alert already exists or is in cooldown
                if (await this.isAlertInCooldown(entityId, 'MULTIPLE_PRESENCE')) {
                    continue;
                }

                // Group events by 5-minute time windows
                const timeWindows = this.groupEventsByTimeWindows(events, 5 * 60 * 1000);
                
                for (const window of timeWindows) {
                    const uniqueLocations = new Set(
                        window.map(e => `${e.location.building}_${e.location.room}`)
                    );

                    if (uniqueLocations.size > 1) {
                        const entity = await Entity.findById(entityId);
                        if (!entity) continue;

                        const locations = Array.from(uniqueLocations).map(loc => {
                            const [building, room] = loc.split('_');
                            return { building, room };
                        });

                        const alert = {
                            type: 'MULTIPLE_PRESENCE',
                            severity: 'CRITICAL',
                            entity_id: entityId,
                            entity_name: entity.profile?.name || 'Unknown',
                            title: 'Multiple Presence Detected',
                            description: `${entity.profile?.name} appears at multiple locations simultaneously`,
                            context: {
                                entity_id: entityId,
                                entity_name: entity.profile?.name,
                                locations: locations,
                                simultaneous_count: uniqueLocations.size,
                                time_window: window[0].timestamp,
                                related_events: window.map(e => e._id)
                            },
                            rule: this.alertRules.MULTIPLE_PRESENCE,
                            auto_resolve: false
                        };

                        alerts.push(alert);
                        break; // Only one alert per entity per check
                    }
                }
            }

            logger.debug(`Generated ${alerts.length} multiple presence alerts`);
            return alerts;

        } catch (error) {
            logger.error('Multiple presence alert check failed:', error);
            return [];
        }
    }

    /**
     * Check for pattern anomaly alerts
     */
    async checkPatternAnomalyAlerts() {
        try {
            const alerts = [];
            const recentTime = new Date(Date.now() - 60 * 60 * 1000); // Last hour

            // Find events with high anomaly scores
            const anomalousEvents = await Event.find({
                timestamp: { $gte: recentTime },
                anomaly_score: { $gte: this.config.anomalyScoreThreshold },
                risk_level: { $in: ['high', 'critical'] }
            }).lean();

            for (const event of anomalousEvents) {
                // Check if alert already exists or is in cooldown
                if (await this.isAlertInCooldown(event.entity_id, 'PATTERN_ANOMALY')) {
                    continue;
                }

                const entity = await Entity.findById(event.entity_id);
                if (!entity) continue;

                const alert = {
                    type: 'PATTERN_ANOMALY',
                    severity: event.risk_level.toUpperCase(),
                    entity_id: event.entity_id,
                    entity_name: entity.profile?.name || 'Unknown',
                    title: 'Behavioral Pattern Anomaly',
                    description: `Unusual behavior pattern detected for ${entity.profile?.name}`,
                    context: {
                        entity_id: event.entity_id,
                        entity_name: entity.profile?.name,
                        event_id: event._id,
                        anomaly_score: event.anomaly_score,
                        risk_level: event.risk_level,
                        location: event.location,
                        activity_type: event.activity_type,
                        timestamp: event.timestamp
                    },
                    rule: this.alertRules.PATTERN_ANOMALY,
                    auto_resolve: true
                };

                alerts.push(alert);
            }

            logger.debug(`Generated ${alerts.length} pattern anomaly alerts`);
            return alerts;

        } catch (error) {
            logger.error('Pattern anomaly alert check failed:', error);
            return [];
        }
    }

    /**
     * Process and save alert
     */
    async processAlert(alertData) {
        try {
            const alertId = `${alertData.type}_${alertData.entity_id}_${Date.now()}`;
            
            // Create alert in database
            const alert = await Alert.create({
                _id: alertId,
                ...alertData,
                triggered_at: new Date(),
                status: 'active'
            });

            // Send real-time notification
            if (this.socketService) {
                this.socketService.broadcastAlert(alert);
            }

            // Cache alert to prevent duplicates
            this.cacheAlert(alertData.entity_id, alertData.type);

            logger.info(`Alert generated: ${alertId}`, {
                type: alertData.type,
                severity: alertData.severity,
                entityId: alertData.entity_id
            });

            return alert;

        } catch (error) {
            logger.error('Alert processing failed:', error);
            throw error;
        }
    }

    /**
     * Check if alert is in cooldown period
     */
    async isAlertInCooldown(entityId, alertType) {
        const cacheKey = `${entityId}_${alertType}`;
        const cached = this.alertCache.get(cacheKey);
        
        if (!cached) return false;
        
        const cooldownPeriod = this.alertRules[alertType]?.cooldown || this.config.alertCooldownMinutes * 60 * 1000;
        const timeSinceLastAlert = Date.now() - cached.timestamp;
        
        return timeSinceLastAlert < cooldownPeriod;
    }

    /**
     * Cache alert to prevent duplicates
     */
    cacheAlert(entityId, alertType) {
        const cacheKey = `${entityId}_${alertType}`;
        this.alertCache.set(cacheKey, {
            timestamp: Date.now(),
            alertType
        });

        // Clean up old cache entries
        if (this.alertCache.size > 10000) {
            const oldestEntries = Array.from(this.alertCache.entries())
                .sort(([,a], [,b]) => a.timestamp - b.timestamp)
                .slice(0, 1000);
            
            oldestEntries.forEach(([key]) => this.alertCache.delete(key));
        }
    }

    // Utility methods
    async findInactiveEntities(thresholdTime) {
        try {
            // Get entities with their last seen time
            const pipeline = [
                {
                    $lookup: {
                        from: 'events',
                        localField: '_id',
                        foreignField: 'entity_id',
                        as: 'events'
                    }
                },
                {
                    $addFields: {
                        lastSeen: { $max: '$events.timestamp' }
                    }
                },
                {
                    $match: {
                        $or: [
                            { lastSeen: { $lt: thresholdTime } },
                            { lastSeen: { $exists: false } }
                        ],
                        'metadata.status': 'active'
                    }
                },
                {
                    $project: {
                        _id: 1,
                        name: '$profile.name',
                        entityType: '$profile.entity_type',
                        lastSeen: 1
                    }
                },
                { $limit: 100 } // Limit for performance
            ];

            return await Entity.aggregate(pipeline);

        } catch (error) {
            logger.error('Error finding inactive entities:', error);
            return [];
        }
    }

    calculateHoursSinceLastSeen(lastSeenDate) {
        if (!lastSeenDate) return 999; // Very high number for never seen
        
        const hoursDiff = (Date.now() - new Date(lastSeenDate)) / (1000 * 60 * 60);
        return Math.round(hoursDiff * 10) / 10; // Round to 1 decimal place
    }

    async getPredictedLocation(entityId) {
        try {
            // This would integrate with the location prediction service
            // For now, return a placeholder
            return {
                building: 'Academic Complex',
                confidence: 0.75,
                prediction_time: new Date()
            };
        } catch (error) {
            logger.error('Error getting predicted location:', error);
            return null;
        }
    }

    async checkLocationAuthorization(entity, location) {
        // Simplified authorization check
        // In production, this would check against access control lists
        
        if (location.access_level === 'public') return true;
        
        if (location.access_level === 'restricted') {
            // Faculty and staff can access restricted areas
            return ['faculty', 'staff'].includes(entity.profile?.entity_type);
        }
        
        if (location.access_level === 'private') {
            // Only specific authorization for private areas
            return entity.profile?.entity_type === 'staff' && 
                   location.building === 'Admin Block';
        }
        
        return false;
    }

    groupEventsByTimeWindows(events, windowMs) {
        const windows = [];
        const sortedEvents = events.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        
        let currentWindow = [];
        let windowStart = null;
        
        for (const event of sortedEvents) {
            const eventTime = new Date(event.timestamp);
            
            if (!windowStart || eventTime - windowStart > windowMs) {
                if (currentWindow.length > 0) {
                    windows.push(currentWindow);
                }
                currentWindow = [event];
                windowStart = eventTime;
            } else {
                currentWindow.push(event);
            }
        }
        
        if (currentWindow.length > 0) {
            windows.push(currentWindow);
        }
        
        return windows;
    }

    updateMetrics(alertCount, processingTime) {
        this.metrics.totalAlertsGenerated += alertCount;
        this.metrics.avgProcessingTime = (this.metrics.avgProcessingTime + processingTime) / 2;
        this.metrics.lastAlertTime = alertCount > 0 ? new Date() : this.metrics.lastAlertTime;
    }

    /**
     * Get alert generation metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            cacheSize: this.alertCache.size,
            enabledRules: Object.entries(this.alertRules)
                .filter(([_, rule]) => rule.enabled)
                .map(([type, rule]) => ({ type, name: rule.name }))
        };
    }

    /**
     * Enable/disable alert rule
     */
    toggleAlertRule(ruleType, enabled) {
        if (this.alertRules[ruleType]) {
            this.alertRules[ruleType].enabled = enabled;
            logger.info(`Alert rule ${ruleType} ${enabled ? 'enabled' : 'disabled'}`);
        }
    }

    /**
     * Update alert rule configuration
     */
    updateAlertRule(ruleType, config) {
        if (this.alertRules[ruleType]) {
            this.alertRules[ruleType] = { ...this.alertRules[ruleType], ...config };
            logger.info(`Alert rule ${ruleType} updated`, config);
        }
    }

    /**
     * Clear alert cache
     */
    clearCache() {
        this.alertCache.clear();
        logger.info('Alert cache cleared');
    }
}

module.exports = AlertGenerationService;