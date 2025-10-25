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
        new winston.transports.File({ filename: 'logs/alerting.log' })
    ]
});

/**
 * Alerting Engine
 * Handles real-time alert generation and notification
 */
class AlertingEngine extends EventEmitter {
    constructor(socketIO = null) {
        super();
        
        this.io = socketIO;
        this.config = {
            inactivityThreshold: 12 * 60 * 60 * 1000, // 12 hours
            anomalyScoreThreshold: 0.8,
            alertCheckInterval: 5 * 60 * 1000, // 5 minutes
            maxRetries: 3
        };

        this.metrics = {
            totalAlerts: 0,
            alertsByType: {},
            alertsBySeverity: {},
            notificationsSent: 0,
            notificationFailures: 0
        };

        // Start alert monitoring
        this.startAlertMonitoring();
        
        logger.info('Alerting Engine initialized');
    }

    /**
     * Start continuous alert monitoring
     */
    startAlertMonitoring() {
        setInterval(() => {
            this.checkForAlerts().catch(error => {
                logger.error('Alert monitoring error:', error);
            });
        }, this.config.alertCheckInterval);
    }

    /**
     * Check for alert conditions
     */
    async checkForAlerts() {
        try {
            // Check for inactivity alerts
            await this.checkInactivityAlerts();
            
            // Check for unusual location alerts
            await this.checkUnusualLocationAlerts();
            
            // Check for multiple presence alerts
            await this.checkMultiplePresenceAlerts();
            
            // Check for pattern anomaly alerts
            await this.checkPatternAnomalyAlerts();
            
        } catch (error) {
            logger.error('Alert checking failed:', error);
        }
    }

    /**
     * Check for entity inactivity alerts
     */
    async checkInactivityAlerts() {
        // Mock implementation - would integrate with actual data
        const inactiveEntities = []; // Would query database
        
        for (const entity of inactiveEntities) {
            await this.createAlert({
                type: 'INACTIVITY',
                severity: 'MEDIUM',
                title: 'Entity Inactivity Detected',
                description: `Entity ${entity.name} has been inactive for over 12 hours`,
                context: {
                    entity_id: entity.id,
                    entity_name: entity.name,
                    last_seen: entity.last_seen
                }
            });
        }
    }

    /**
     * Check for unusual location alerts
     */
    async checkUnusualLocationAlerts() {
        // Mock implementation
        logger.debug('Checking unusual location alerts');
    }

    /**
     * Check for multiple presence alerts
     */
    async checkMultiplePresenceAlerts() {
        // Mock implementation
        logger.debug('Checking multiple presence alerts');
    }

    /**
     * Check for pattern anomaly alerts
     */
    async checkPatternAnomalyAlerts() {
        // Mock implementation
        logger.debug('Checking pattern anomaly alerts');
    }

    /**
     * Create a new alert
     */
    async createAlert(alertData) {
        try {
            const alert = {
                _id: `ALERT_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                type: alertData.type,
                severity: alertData.severity,
                title: alertData.title,
                description: alertData.description,
                context: alertData.context || {},
                triggered_at: new Date(),
                status: 'active',
                auto_resolve: alertData.auto_resolve || false
            };

            // Update metrics
            this.updateMetrics(alert);

            // Emit event
            this.emit('alert_created', alert);

            // Send real-time notification
            if (this.io) {
                this.io.emit('new_alert', {
                    id: alert._id,
                    type: alert.type,
                    severity: alert.severity,
                    title: alert.title,
                    description: alert.description,
                    timestamp: alert.triggered_at,
                    entity_id: alert.context?.entity_id
                });
            }

            logger.info(`Alert created: ${alert._id}`, {
                type: alert.type,
                severity: alert.severity
            });

            return alert;

        } catch (error) {
            logger.error('Error creating alert:', error);
            throw error;
        }
    }

    /**
     * Create manual alert
     */
    async createManualAlert(alertData) {
        return await this.createAlert({
            ...alertData,
            type: alertData.type || 'MANUAL',
            severity: alertData.severity || 'MEDIUM'
        });
    }

    /**
     * Update metrics
     */
    updateMetrics(alert) {
        this.metrics.totalAlerts++;
        
        // Update by type
        if (!this.metrics.alertsByType[alert.type]) {
            this.metrics.alertsByType[alert.type] = 0;
        }
        this.metrics.alertsByType[alert.type]++;
        
        // Update by severity
        if (!this.metrics.alertsBySeverity[alert.severity]) {
            this.metrics.alertsBySeverity[alert.severity] = 0;
        }
        this.metrics.alertsBySeverity[alert.severity]++;
    }

    /**
     * Get alerting metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            timestamp: new Date()
        };
    }
}

module.exports = AlertingEngine;