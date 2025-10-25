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
        new winston.transports.File({ filename: 'logs/performance.log' })
    ]
});

class PerformanceMonitor extends EventEmitter {
    constructor() {
        super();
        this.metrics = {
            blocking: {
                totalRecords: 0,
                totalComparisons: 0,
                blockedComparisons: 0,
                averageBlockSize: 0,
                blockingEfficiency: 0,
                processingTime: 0
            },
            similarity: {
                totalCalculations: 0,
                averageCalculationTime: 0,
                cacheHitRate: 0,
                accuracyScore: 0
            },
            entityResolution: {
                totalResolutions: 0,
                matches: 0,
                newEntities: 0,
                manualReviews: 0,
                averageConfidence: 0,
                processingRate: 0
            },
            system: {
                memoryUsage: 0,
                cpuUsage: 0,
                diskUsage: 0,
                networkLatency: 0
            }
        };
        
        this.timers = new Map();
        this.counters = new Map();
        this.histograms = new Map();
        
        // Start system monitoring
        this.startSystemMonitoring();
    }

    /**
     * Start timing an operation
     */
    startTimer(operationName, metadata = {}) {
        const timerId = `${operationName}_${Date.now()}_${Math.random()}`;
        this.timers.set(timerId, {
            name: operationName,
            startTime: process.hrtime.bigint(),
            metadata: metadata
        });
        return timerId;
    }

    /**
     * End timing an operation
     */
    endTimer(timerId) {
        const timer = this.timers.get(timerId);
        if (!timer) {
            logger.warn(`Timer ${timerId} not found`);
            return null;
        }

        const endTime = process.hrtime.bigint();
        const duration = Number(endTime - timer.startTime) / 1000000; // Convert to milliseconds
        
        this.timers.delete(timerId);
        
        // Update metrics
        this.updateTimingMetrics(timer.name, duration, timer.metadata);
        
        // Emit event for real-time monitoring
        this.emit('timing', {
            operation: timer.name,
            duration: duration,
            metadata: timer.metadata
        });

        return duration;
    }

    /**
     * Increment a counter
     */
    incrementCounter(counterName, value = 1, tags = {}) {
        const key = `${counterName}_${JSON.stringify(tags)}`;
        const current = this.counters.get(key) || 0;
        this.counters.set(key, current + value);
        
        this.emit('counter', {
            name: counterName,
            value: current + value,
            increment: value,
            tags: tags
        });
    }

    /**
     * Record a histogram value
     */
    recordHistogram(histogramName, value, tags = {}) {
        const key = `${histogramName}_${JSON.stringify(tags)}`;
        if (!this.histograms.has(key)) {
            this.histograms.set(key, []);
        }
        
        const values = this.histograms.get(key);
        values.push(value);
        
        // Keep only last 1000 values to prevent memory issues
        if (values.length > 1000) {
            values.shift();
        }
        
        this.emit('histogram', {
            name: histogramName,
            value: value,
            tags: tags
        });
    }

    /**
     * Update timing metrics based on operation type
     */
    updateTimingMetrics(operationName, duration, metadata) {
        switch (operationName) {
            case 'blocking':
                this.metrics.blocking.processingTime += duration;
                this.metrics.blocking.totalRecords++;
                if (metadata.comparisons) {
                    this.metrics.blocking.totalComparisons += metadata.comparisons;
                }
                if (metadata.blockedComparisons) {
                    this.metrics.blocking.blockedComparisons += metadata.blockedComparisons;
                }
                this.calculateBlockingEfficiency();
                break;
                
            case 'similarity':
                this.metrics.similarity.totalCalculations++;
                this.metrics.similarity.averageCalculationTime = 
                    (this.metrics.similarity.averageCalculationTime * (this.metrics.similarity.totalCalculations - 1) + duration) 
                    / this.metrics.similarity.totalCalculations;
                break;
                
            case 'entity_resolution':
                this.metrics.entityResolution.totalResolutions++;
                if (metadata.decision === 'MATCH') {
                    this.metrics.entityResolution.matches++;
                } else if (metadata.decision === 'CREATE_NEW') {
                    this.metrics.entityResolution.newEntities++;
                } else if (metadata.decision === 'MANUAL_REVIEW') {
                    this.metrics.entityResolution.manualReviews++;
                }
                
                if (metadata.confidence) {
                    this.metrics.entityResolution.averageConfidence = 
                        (this.metrics.entityResolution.averageConfidence * (this.metrics.entityResolution.totalResolutions - 1) + metadata.confidence) 
                        / this.metrics.entityResolution.totalResolutions;
                }
                
                // Calculate processing rate (resolutions per second)
                this.metrics.entityResolution.processingRate = 
                    this.metrics.entityResolution.totalResolutions / (this.getTotalProcessingTime() / 1000);
                break;
        }
    }

    /**
     * Calculate blocking efficiency
     */
    calculateBlockingEfficiency() {
        if (this.metrics.blocking.totalComparisons === 0) return;
        
        // Theoretical comparisons without blocking (n*(n-1)/2)
        const n = this.metrics.blocking.totalRecords;
        const theoreticalComparisons = n * (n - 1) / 2;
        
        if (theoreticalComparisons > 0) {
            this.metrics.blocking.blockingEfficiency = 
                1 - (this.metrics.blocking.blockedComparisons / theoreticalComparisons);
        }
        
        this.metrics.blocking.averageBlockSize = 
            this.metrics.blocking.blockedComparisons / Math.max(1, this.metrics.blocking.totalRecords);
    }

    /**
     * Get total processing time across all operations
     */
    getTotalProcessingTime() {
        return this.metrics.blocking.processingTime + 
               (this.metrics.similarity.averageCalculationTime * this.metrics.similarity.totalCalculations);
    }

    /**
     * Start system resource monitoring
     */
    startSystemMonitoring() {
        setInterval(() => {
            this.updateSystemMetrics();
        }, 30000); // Update every 30 seconds
    }

    /**
     * Update system resource metrics
     */
    updateSystemMetrics() {
        try {
            // Memory usage
            const memUsage = process.memoryUsage();
            this.metrics.system.memoryUsage = {
                rss: memUsage.rss,
                heapTotal: memUsage.heapTotal,
                heapUsed: memUsage.heapUsed,
                external: memUsage.external
            };

            // CPU usage (simplified)
            const cpuUsage = process.cpuUsage();
            this.metrics.system.cpuUsage = {
                user: cpuUsage.user,
                system: cpuUsage.system
            };

            this.emit('system_metrics', this.metrics.system);
            
        } catch (error) {
            logger.error('Error updating system metrics:', error);
        }
    }

    /**
     * Get current performance metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            timestamp: new Date().toISOString(),
            uptime: process.uptime()
        };
    }

    /**
     * Get counter values
     */
    getCounters() {
        const counters = {};
        for (const [key, value] of this.counters.entries()) {
            counters[key] = value;
        }
        return counters;
    }

    /**
     * Get histogram statistics
     */
    getHistogramStats(histogramName, tags = {}) {
        const key = `${histogramName}_${JSON.stringify(tags)}`;
        const values = this.histograms.get(key) || [];
        
        if (values.length === 0) {
            return {
                count: 0,
                min: 0,
                max: 0,
                mean: 0,
                median: 0,
                p95: 0,
                p99: 0
            };
        }

        const sorted = [...values].sort((a, b) => a - b);
        const count = sorted.length;
        const sum = sorted.reduce((a, b) => a + b, 0);
        
        return {
            count: count,
            min: sorted[0],
            max: sorted[count - 1],
            mean: sum / count,
            median: sorted[Math.floor(count / 2)],
            p95: sorted[Math.floor(count * 0.95)],
            p99: sorted[Math.floor(count * 0.99)]
        };
    }

    /**
     * Reset all metrics
     */
    resetMetrics() {
        this.metrics = {
            blocking: {
                totalRecords: 0,
                totalComparisons: 0,
                blockedComparisons: 0,
                averageBlockSize: 0,
                blockingEfficiency: 0,
                processingTime: 0
            },
            similarity: {
                totalCalculations: 0,
                averageCalculationTime: 0,
                cacheHitRate: 0,
                accuracyScore: 0
            },
            entityResolution: {
                totalResolutions: 0,
                matches: 0,
                newEntities: 0,
                manualReviews: 0,
                averageConfidence: 0,
                processingRate: 0
            },
            system: {
                memoryUsage: 0,
                cpuUsage: 0,
                diskUsage: 0,
                networkLatency: 0
            }
        };
        
        this.counters.clear();
        this.histograms.clear();
        
        logger.info('Performance metrics reset');
    }

    /**
     * Generate performance report
     */
    generateReport() {
        const metrics = this.getMetrics();
        const counters = this.getCounters();
        
        const report = {
            summary: {
                totalOperations: metrics.entityResolution.totalResolutions,
                averageProcessingTime: this.getTotalProcessingTime() / Math.max(1, metrics.entityResolution.totalResolutions),
                blockingEfficiency: metrics.blocking.blockingEfficiency,
                matchRate: metrics.entityResolution.matches / Math.max(1, metrics.entityResolution.totalResolutions),
                averageConfidence: metrics.entityResolution.averageConfidence
            },
            performance: {
                processingRate: metrics.entityResolution.processingRate,
                memoryUsage: metrics.system.memoryUsage,
                cpuUsage: metrics.system.cpuUsage
            },
            quality: {
                manualReviewRate: metrics.entityResolution.manualReviews / Math.max(1, metrics.entityResolution.totalResolutions),
                similarityAccuracy: metrics.similarity.accuracyScore,
                cacheHitRate: metrics.similarity.cacheHitRate
            },
            counters: counters,
            histograms: {
                blockingTime: this.getHistogramStats('blocking_time'),
                similarityTime: this.getHistogramStats('similarity_time'),
                resolutionTime: this.getHistogramStats('resolution_time')
            },
            timestamp: new Date().toISOString()
        };

        return report;
    }

    /**
     * Log performance warning if metrics exceed thresholds
     */
    checkPerformanceThresholds() {
        const metrics = this.getMetrics();
        
        // Check processing rate
        if (metrics.entityResolution.processingRate < 10) { // Less than 10 resolutions per second
            logger.warn('Low processing rate detected', {
                currentRate: metrics.entityResolution.processingRate,
                threshold: 10
            });
        }
        
        // Check memory usage
        if (metrics.system.memoryUsage.heapUsed > 1024 * 1024 * 1024) { // More than 1GB
            logger.warn('High memory usage detected', {
                heapUsed: metrics.system.memoryUsage.heapUsed,
                threshold: 1024 * 1024 * 1024
            });
        }
        
        // Check blocking efficiency
        if (metrics.blocking.blockingEfficiency < 0.8) { // Less than 80% efficiency
            logger.warn('Low blocking efficiency detected', {
                efficiency: metrics.blocking.blockingEfficiency,
                threshold: 0.8
            });
        }
        
        // Check manual review rate
        const manualReviewRate = metrics.entityResolution.manualReviews / Math.max(1, metrics.entityResolution.totalResolutions);
        if (manualReviewRate > 0.2) { // More than 20% manual reviews
            logger.warn('High manual review rate detected', {
                rate: manualReviewRate,
                threshold: 0.2
            });
        }
    }

    /**
     * Start automatic performance monitoring
     */
    startPerformanceMonitoring() {
        // Check thresholds every 5 minutes
        setInterval(() => {
            this.checkPerformanceThresholds();
        }, 5 * 60 * 1000);
        
        // Generate hourly reports
        setInterval(() => {
            const report = this.generateReport();
            logger.info('Hourly performance report', report);
            this.emit('performance_report', report);
        }, 60 * 60 * 1000);
    }
}

// Create singleton instance
const performanceMonitor = new PerformanceMonitor();

module.exports = performanceMonitor;