const winston = require('winston');
const EventEmitter = require('events');

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
        new winston.transports.File({ filename: 'logs/monitoring.log' })
    ]
});

class MonitoringService extends EventEmitter {
    constructor() {
        super();
        this.metrics = {
            system: {
                startTime: Date.now(),
                uptime: 0,
                memoryUsage: {},
                cpuUsage: {},
                processCount: 0
            },
            ingestion: {
                totalRecords: 0,
                successfulRecords: 0,
                failedRecords: 0,
                recordsPerSecond: 0,
                averageProcessingTime: 0,
                errorRate: 0,
                lastProcessedAt: null
            },
            queues: {},
            workers: {},
            alerts: {
                totalGenerated: 0,
                activeAlerts: 0,
                resolvedAlerts: 0,
                averageResolutionTime: 0
            },
            database: {
                mongodb: { status: 'unknown', latency: 0, connections: 0 },
                redis: { status: 'unknown', latency: 0, memory: 0 },
                neo4j: { status: 'unknown', latency: 0, nodes: 0 }
            },
            api: {
                totalRequests: 0,
                successfulRequests: 0,
                failedRequests: 0,
                averageResponseTime: 0,
                requestsPerSecond: 0
            }
        };
        
        this.thresholds = {
            memoryUsage: 0.8, // 80% memory usage
            cpuUsage: 0.8, // 80% CPU usage
            errorRate: 0.05, // 5% error rate
            responseTime: 1000, // 1 second response time
            queueBacklog: 1000, // 1000 jobs in queue
            diskUsage: 0.9 // 90% disk usage
        };
        
        this.alerts = new Map();
        this.setupMetricsCollection();
        this.setupAlertRules();
    }

    setupMetricsCollection() {
        // Collect system metrics every 30 seconds
        setInterval(() => {
            this.collectSystemMetrics();
        }, 30000);

        // Collect queue metrics every 10 seconds
        setInterval(() => {
            this.collectQueueMetrics();
        }, 10000);

        // Collect database metrics every 60 seconds
        setInterval(() => {
            this.collectDatabaseMetrics();
        }, 60000);

        // Calculate rates every minute
        setInterval(() => {
            this.calculateRates();
        }, 60000);

        // Clean up old metrics every hour
        setInterval(() => {
            this.cleanupOldMetrics();
        }, 3600000);
    }

    setupAlertRules() {
        // High memory usage alert
        this.on('high_memory_usage', (data) => {
            this.createAlert('HIGH_MEMORY_USAGE', 'HIGH', 
                `Memory usage is ${(data.usage * 100).toFixed(1)}%`, data);
        });

        // High CPU usage alert
        this.on('high_cpu_usage', (data) => {
            this.createAlert('HIGH_CPU_USAGE', 'HIGH', 
                `CPU usage is ${(data.usage * 100).toFixed(1)}%`, data);
        });

        // High error rate alert
        this.on('high_error_rate', (data) => {
            this.createAlert('HIGH_ERROR_RATE', 'CRITICAL', 
                `Error rate is ${(data.rate * 100).toFixed(1)}%`, data);
        });

        // Queue backlog alert
        this.on('queue_backlog', (data) => {
            this.createAlert('QUEUE_BACKLOG', 'MEDIUM', 
                `Queue ${data.queue} has ${data.count} pending jobs`, data);
        });

        // Database connection alert
        this.on('database_connection_error', (data) => {
            this.createAlert('DATABASE_CONNECTION_ERROR', 'CRITICAL', 
                `Database ${data.database} connection failed: ${data.error}`, data);
        });

        // Worker failure alert
        this.on('worker_failure', (data) => {
            this.createAlert('WORKER_FAILURE', 'HIGH', 
                `Worker ${data.workerId} failed: ${data.reason}`, data);
        });
    }

    collectSystemMetrics() {
        try {
            // Update uptime
            this.metrics.system.uptime = Date.now() - this.metrics.system.startTime;

            // Memory usage
            const memUsage = process.memoryUsage();
            this.metrics.system.memoryUsage = {
                rss: memUsage.rss,
                heapTotal: memUsage.heapTotal,
                heapUsed: memUsage.heapUsed,
                external: memUsage.external,
                arrayBuffers: memUsage.arrayBuffers,
                heapUsedPercentage: memUsage.heapUsed / memUsage.heapTotal
            };

            // CPU usage
            const cpuUsage = process.cpuUsage();
            this.metrics.system.cpuUsage = {
                user: cpuUsage.user,
                system: cpuUsage.system,
                total: cpuUsage.user + cpuUsage.system
            };

            // Check thresholds
            if (this.metrics.system.memoryUsage.heapUsedPercentage > this.thresholds.memoryUsage) {
                this.emit('high_memory_usage', {
                    usage: this.metrics.system.memoryUsage.heapUsedPercentage,
                    threshold: this.thresholds.memoryUsage
                });
            }

            logger.debug('System metrics collected', this.metrics.system);

        } catch (error) {
            logger.error('Error collecting system metrics:', error);
        }
    }

    async collectQueueMetrics() {
        try {
            // This would integrate with the actual queue system
            // For now, we'll simulate queue metrics
            const queueNames = ['cardSwipe', 'wifiLog', 'cctvFrame', 'helpdesk', 'rsvp', 'asset'];
            
            for (const queueName of queueNames) {
                // Simulate queue metrics
                const queueMetrics = {
                    waiting: Math.floor(Math.random() * 100),
                    active: Math.floor(Math.random() * 10),
                    completed: Math.floor(Math.random() * 1000),
                    failed: Math.floor(Math.random() * 50),
                    delayed: Math.floor(Math.random() * 20),
                    paused: false
                };

                this.metrics.queues[queueName] = queueMetrics;

                // Check for queue backlog
                if (queueMetrics.waiting > this.thresholds.queueBacklog) {
                    this.emit('queue_backlog', {
                        queue: queueName,
                        count: queueMetrics.waiting,
                        threshold: this.thresholds.queueBacklog
                    });
                }
            }

            logger.debug('Queue metrics collected', this.metrics.queues);

        } catch (error) {
            logger.error('Error collecting queue metrics:', error);
        }
    }

    async collectDatabaseMetrics() {
        try {
            // MongoDB metrics
            await this.collectMongoDBMetrics();
            
            // Redis metrics
            await this.collectRedisMetrics();
            
            // Neo4j metrics
            await this.collectNeo4jMetrics();

            logger.debug('Database metrics collected', this.metrics.database);

        } catch (error) {
            logger.error('Error collecting database metrics:', error);
        }
    }

    async collectMongoDBMetrics() {
        try {
            const mongoose = require('mongoose');
            
            if (mongoose.connection.readyState === 1) {
                const startTime = Date.now();
                await mongoose.connection.db.admin().ping();
                const latency = Date.now() - startTime;

                // Get connection count
                const serverStatus = await mongoose.connection.db.admin().serverStatus();
                
                this.metrics.database.mongodb = {
                    status: 'healthy',
                    latency: latency,
                    connections: serverStatus.connections.current,
                    uptime: serverStatus.uptime,
                    version: serverStatus.version
                };
            } else {
                this.metrics.database.mongodb.status = 'disconnected';
                this.emit('database_connection_error', {
                    database: 'mongodb',
                    error: 'Connection not ready'
                });
            }
        } catch (error) {
            this.metrics.database.mongodb.status = 'error';
            this.emit('database_connection_error', {
                database: 'mongodb',
                error: error.message
            });
        }
    }

    async collectRedisMetrics() {
        try {
            // This would integrate with the actual Redis client
            // For now, simulate Redis metrics
            this.metrics.database.redis = {
                status: 'healthy',
                latency: Math.floor(Math.random() * 10) + 1,
                memory: Math.floor(Math.random() * 100) * 1024 * 1024, // Random memory usage
                connections: Math.floor(Math.random() * 50) + 10,
                keyspace: Math.floor(Math.random() * 10000) + 1000
            };
        } catch (error) {
            this.metrics.database.redis.status = 'error';
            this.emit('database_connection_error', {
                database: 'redis',
                error: error.message
            });
        }
    }

    async collectNeo4jMetrics() {
        try {
            // This would integrate with the actual Neo4j driver
            // For now, simulate Neo4j metrics
            this.metrics.database.neo4j = {
                status: 'healthy',
                latency: Math.floor(Math.random() * 20) + 5,
                nodes: Math.floor(Math.random() * 50000) + 10000,
                relationships: Math.floor(Math.random() * 100000) + 50000,
                queries_per_second: Math.floor(Math.random() * 100) + 10
            };
        } catch (error) {
            this.metrics.database.neo4j.status = 'error';
            this.emit('database_connection_error', {
                database: 'neo4j',
                error: error.message
            });
        }
    }

    calculateRates() {
        try {
            // Calculate ingestion rate
            const now = Date.now();
            const timeWindow = 60000; // 1 minute
            
            // This would use actual historical data
            this.metrics.ingestion.recordsPerSecond = 
                Math.floor(this.metrics.ingestion.successfulRecords / 60);

            // Calculate error rate
            const totalRecords = this.metrics.ingestion.successfulRecords + this.metrics.ingestion.failedRecords;
            this.metrics.ingestion.errorRate = totalRecords > 0 ? 
                this.metrics.ingestion.failedRecords / totalRecords : 0;

            // Check error rate threshold
            if (this.metrics.ingestion.errorRate > this.thresholds.errorRate) {
                this.emit('high_error_rate', {
                    rate: this.metrics.ingestion.errorRate,
                    threshold: this.thresholds.errorRate,
                    failed: this.metrics.ingestion.failedRecords,
                    total: totalRecords
                });
            }

            // Calculate API request rate
            this.metrics.api.requestsPerSecond = 
                Math.floor(this.metrics.api.totalRequests / 60);

            logger.debug('Rates calculated', {
                recordsPerSecond: this.metrics.ingestion.recordsPerSecond,
                errorRate: this.metrics.ingestion.errorRate,
                requestsPerSecond: this.metrics.api.requestsPerSecond
            });

        } catch (error) {
            logger.error('Error calculating rates:', error);
        }
    }

    createAlert(type, severity, message, data) {
        const alertId = `${type}_${Date.now()}`;
        const alert = {
            id: alertId,
            type: type,
            severity: severity,
            message: message,
            data: data,
            timestamp: new Date(),
            acknowledged: false,
            resolved: false
        };

        this.alerts.set(alertId, alert);
        this.metrics.alerts.totalGenerated++;
        this.metrics.alerts.activeAlerts++;

        logger.warn(`Alert generated: ${type}`, alert);
        
        // Emit alert event for external handlers
        this.emit('alert_generated', alert);

        return alertId;
    }

    acknowledgeAlert(alertId, userId) {
        const alert = this.alerts.get(alertId);
        if (alert && !alert.acknowledged) {
            alert.acknowledged = true;
            alert.acknowledgedBy = userId;
            alert.acknowledgedAt = new Date();
            
            logger.info(`Alert acknowledged: ${alertId} by ${userId}`);
            this.emit('alert_acknowledged', alert);
        }
        return alert;
    }

    resolveAlert(alertId, userId, resolution) {
        const alert = this.alerts.get(alertId);
        if (alert && !alert.resolved) {
            alert.resolved = true;
            alert.resolvedBy = userId;
            alert.resolvedAt = new Date();
            alert.resolution = resolution;
            
            this.metrics.alerts.activeAlerts--;
            this.metrics.alerts.resolvedAlerts++;
            
            // Calculate resolution time
            const resolutionTime = alert.resolvedAt - alert.timestamp;
            this.metrics.alerts.averageResolutionTime = 
                (this.metrics.alerts.averageResolutionTime + resolutionTime) / 2;
            
            logger.info(`Alert resolved: ${alertId} by ${userId}`);
            this.emit('alert_resolved', alert);
        }
        return alert;
    }

    getActiveAlerts() {
        return Array.from(this.alerts.values()).filter(alert => !alert.resolved);
    }

    getAlertHistory(limit = 100) {
        return Array.from(this.alerts.values())
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, limit);
    }

    // API metrics tracking
    recordAPIRequest(method, endpoint, statusCode, responseTime) {
        this.metrics.api.totalRequests++;
        
        if (statusCode >= 200 && statusCode < 400) {
            this.metrics.api.successfulRequests++;
        } else {
            this.metrics.api.failedRequests++;
        }
        
        // Update average response time
        this.metrics.api.averageResponseTime = 
            (this.metrics.api.averageResponseTime + responseTime) / 2;
        
        // Check response time threshold
        if (responseTime > this.thresholds.responseTime) {
            this.emit('slow_response', {
                method: method,
                endpoint: endpoint,
                responseTime: responseTime,
                threshold: this.thresholds.responseTime
            });
        }
    }

    // Ingestion metrics tracking
    recordIngestionSuccess(processingTime) {
        this.metrics.ingestion.successfulRecords++;
        this.metrics.ingestion.totalRecords++;
        this.metrics.ingestion.lastProcessedAt = new Date();
        
        // Update average processing time
        this.metrics.ingestion.averageProcessingTime = 
            (this.metrics.ingestion.averageProcessingTime + processingTime) / 2;
    }

    recordIngestionFailure(error) {
        this.metrics.ingestion.failedRecords++;
        this.metrics.ingestion.totalRecords++;
        
        logger.error('Ingestion failure recorded:', error);
    }

    // Worker metrics tracking
    updateWorkerMetrics(workerId, metrics) {
        this.metrics.workers[workerId] = {
            ...metrics,
            lastUpdated: new Date()
        };
    }

    removeWorkerMetrics(workerId) {
        delete this.metrics.workers[workerId];
    }

    // Health check
    getHealthStatus() {
        const health = {
            status: 'healthy',
            timestamp: new Date(),
            uptime: this.metrics.system.uptime,
            checks: {
                memory: this.metrics.system.memoryUsage.heapUsedPercentage < this.thresholds.memoryUsage,
                database: {
                    mongodb: this.metrics.database.mongodb.status === 'healthy',
                    redis: this.metrics.database.redis.status === 'healthy',
                    neo4j: this.metrics.database.neo4j.status === 'healthy'
                },
                queues: Object.values(this.metrics.queues).every(q => q.waiting < this.thresholds.queueBacklog),
                errorRate: this.metrics.ingestion.errorRate < this.thresholds.errorRate
            }
        };
        
        // Determine overall health status
        const allChecks = [
            health.checks.memory,
            ...Object.values(health.checks.database),
            health.checks.queues,
            health.checks.errorRate
        ];
        
        if (allChecks.every(check => check)) {
            health.status = 'healthy';
        } else if (allChecks.some(check => check)) {
            health.status = 'degraded';
        } else {
            health.status = 'unhealthy';
        }
        
        return health;
    }

    // Get comprehensive metrics
    getAllMetrics() {
        return {
            ...this.metrics,
            health: this.getHealthStatus(),
            activeAlerts: this.getActiveAlerts().length,
            timestamp: new Date()
        };
    }

    // Export metrics for external monitoring systems
    exportMetricsForPrometheus() {
        const metrics = [];
        
        // System metrics
        metrics.push(`campus_security_uptime_seconds ${Math.floor(this.metrics.system.uptime / 1000)}`);
        metrics.push(`campus_security_memory_usage_ratio ${this.metrics.system.memoryUsage.heapUsedPercentage}`);
        
        // Ingestion metrics
        metrics.push(`campus_security_records_processed_total ${this.metrics.ingestion.totalRecords}`);
        metrics.push(`campus_security_records_successful_total ${this.metrics.ingestion.successfulRecords}`);
        metrics.push(`campus_security_records_failed_total ${this.metrics.ingestion.failedRecords}`);
        metrics.push(`campus_security_error_rate ${this.metrics.ingestion.errorRate}`);
        metrics.push(`campus_security_processing_time_avg_ms ${this.metrics.ingestion.averageProcessingTime}`);
        
        // Queue metrics
        for (const [queueName, queueMetrics] of Object.entries(this.metrics.queues)) {
            metrics.push(`campus_security_queue_waiting{queue="${queueName}"} ${queueMetrics.waiting}`);
            metrics.push(`campus_security_queue_active{queue="${queueName}"} ${queueMetrics.active}`);
            metrics.push(`campus_security_queue_completed{queue="${queueName}"} ${queueMetrics.completed}`);
            metrics.push(`campus_security_queue_failed{queue="${queueName}"} ${queueMetrics.failed}`);
        }
        
        // Database metrics
        metrics.push(`campus_security_db_latency_ms{database="mongodb"} ${this.metrics.database.mongodb.latency}`);
        metrics.push(`campus_security_db_latency_ms{database="redis"} ${this.metrics.database.redis.latency}`);
        metrics.push(`campus_security_db_latency_ms{database="neo4j"} ${this.metrics.database.neo4j.latency}`);
        
        // Alert metrics
        metrics.push(`campus_security_alerts_total ${this.metrics.alerts.totalGenerated}`);
        metrics.push(`campus_security_alerts_active ${this.metrics.alerts.activeAlerts}`);
        metrics.push(`campus_security_alerts_resolved ${this.metrics.alerts.resolvedAlerts}`);
        
        return metrics.join('\n');
    }

    cleanupOldMetrics() {
        try {
            // Clean up old alerts (keep last 1000)
            const alertsArray = Array.from(this.alerts.entries());
            if (alertsArray.length > 1000) {
                const sortedAlerts = alertsArray.sort((a, b) => b[1].timestamp - a[1].timestamp);
                const toKeep = sortedAlerts.slice(0, 1000);
                
                this.alerts.clear();
                toKeep.forEach(([id, alert]) => this.alerts.set(id, alert));
                
                logger.info(`Cleaned up old alerts, kept ${toKeep.length} most recent`);
            }
            
            // Reset counters if they get too large
            if (this.metrics.api.totalRequests > 1000000) {
                this.metrics.api.totalRequests = 0;
                this.metrics.api.successfulRequests = 0;
                this.metrics.api.failedRequests = 0;
                logger.info('Reset API request counters');
            }
            
        } catch (error) {
            logger.error('Error cleaning up old metrics:', error);
        }
    }
}

// Create singleton instance
const monitoringService = new MonitoringService();

module.exports = monitoringService;