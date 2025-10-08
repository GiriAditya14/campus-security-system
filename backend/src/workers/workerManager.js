const cluster = require('cluster');
const os = require('os');
const winston = require('winston');
const dataProcessor = require('./dataProcessor');

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
        new winston.transports.File({ filename: 'logs/worker-manager.log' })
    ]
});

class WorkerManager {
    constructor() {
        this.workers = new Map();
        this.maxWorkers = parseInt(process.env.MAX_WORKERS) || Math.min(os.cpus().length, 4);
        this.restartDelay = 5000; // 5 seconds
        this.maxRestarts = 5;
        this.workerRestarts = new Map();
        this.isShuttingDown = false;
        
        this.setupCluster();
        this.setupSignalHandlers();
    }

    setupCluster() {
        if (cluster.isMaster) {
            logger.info(`Master process ${process.pid} starting with ${this.maxWorkers} workers`);
            
            // Fork workers
            for (let i = 0; i < this.maxWorkers; i++) {
                this.forkWorker();
            }

            // Handle worker events
            cluster.on('exit', (worker, code, signal) => {
                this.handleWorkerExit(worker, code, signal);
            });

            cluster.on('online', (worker) => {
                logger.info(`Worker ${worker.process.pid} is online`);
                this.workers.set(worker.id, {
                    worker: worker,
                    startTime: Date.now(),
                    restarts: this.workerRestarts.get(worker.id) || 0
                });
            });

            cluster.on('disconnect', (worker) => {
                logger.warn(`Worker ${worker.process.pid} disconnected`);
            });

            // Setup health monitoring
            this.setupHealthMonitoring();
            
            // Setup graceful shutdown
            this.setupGracefulShutdown();

        } else {
            // Worker process
            this.startWorkerProcess();
        }
    }

    forkWorker() {
        const worker = cluster.fork();
        
        // Set up worker-specific environment variables
        worker.send({
            type: 'config',
            workerId: worker.id,
            maxMemory: process.env.WORKER_MAX_MEMORY || '512MB'
        });

        return worker;
    }

    handleWorkerExit(worker, code, signal) {
        const workerInfo = this.workers.get(worker.id);
        this.workers.delete(worker.id);

        if (this.isShuttingDown) {
            logger.info(`Worker ${worker.process.pid} exited during shutdown`);
            return;
        }

        logger.error(`Worker ${worker.process.pid} died with code ${code} and signal ${signal}`);

        // Check restart count
        const restarts = this.workerRestarts.get(worker.id) || 0;
        
        if (restarts < this.maxRestarts) {
            logger.info(`Restarting worker ${worker.id} (restart ${restarts + 1}/${this.maxRestarts})`);
            
            setTimeout(() => {
                const newWorker = this.forkWorker();
                this.workerRestarts.set(newWorker.id, restarts + 1);
            }, this.restartDelay);
        } else {
            logger.error(`Worker ${worker.id} exceeded max restarts (${this.maxRestarts}), not restarting`);
            
            // If we have no workers left, exit the master process
            if (this.workers.size === 0) {
                logger.error('No workers remaining, shutting down master process');
                process.exit(1);
            }
        }
    }

    startWorkerProcess() {
        logger.info(`Worker process ${process.pid} starting`);
        
        // Initialize data processor in worker
        try {
            // The dataProcessor will automatically start processing jobs
            logger.info(`Worker ${process.pid} initialized data processor`);
            
            // Handle messages from master
            process.on('message', (message) => {
                this.handleMasterMessage(message);
            });

            // Monitor memory usage
            this.monitorWorkerMemory();

            // Send ready signal to master
            process.send({ type: 'ready', pid: process.pid });

        } catch (error) {
            logger.error(`Worker ${process.pid} initialization failed:`, error);
            process.exit(1);
        }
    }

    handleMasterMessage(message) {
        switch (message.type) {
            case 'config':
                logger.info(`Worker ${process.pid} received config:`, message);
                break;
                
            case 'shutdown':
                logger.info(`Worker ${process.pid} received shutdown signal`);
                this.gracefulWorkerShutdown();
                break;
                
            case 'pause':
                if (message.queue) {
                    dataProcessor.pauseQueue(message.queue);
                }
                break;
                
            case 'resume':
                if (message.queue) {
                    dataProcessor.resumeQueue(message.queue);
                }
                break;
                
            case 'stats':
                this.sendWorkerStats();
                break;
                
            default:
                logger.warn(`Worker ${process.pid} received unknown message type: ${message.type}`);
        }
    }

    monitorWorkerMemory() {
        const maxMemory = parseInt(process.env.WORKER_MAX_MEMORY) || 512 * 1024 * 1024; // 512MB default
        
        setInterval(() => {
            const memUsage = process.memoryUsage();
            
            if (memUsage.heapUsed > maxMemory) {
                logger.warn(`Worker ${process.pid} memory usage high: ${Math.round(memUsage.heapUsed / 1024 / 1024)}MB`);
                
                // Force garbage collection if available
                if (global.gc) {
                    global.gc();
                    logger.info(`Worker ${process.pid} forced garbage collection`);
                }
                
                // If memory is still high, restart worker
                const memUsageAfterGC = process.memoryUsage();
                if (memUsageAfterGC.heapUsed > maxMemory * 1.2) {
                    logger.error(`Worker ${process.pid} memory usage critical, restarting`);
                    process.exit(1);
                }
            }
        }, 30000); // Check every 30 seconds
    }

    sendWorkerStats() {
        const stats = {
            pid: process.pid,
            memory: process.memoryUsage(),
            uptime: process.uptime(),
            processor_metrics: dataProcessor.getMetrics()
        };
        
        process.send({ type: 'stats', data: stats });
    }

    setupHealthMonitoring() {
        if (!cluster.isMaster) return;

        setInterval(async () => {
            const healthChecks = [];
            
            for (const [workerId, workerInfo] of this.workers) {
                const healthCheck = new Promise((resolve) => {
                    const timeout = setTimeout(() => {
                        resolve({ workerId, healthy: false, reason: 'timeout' });
                    }, 5000);
                    
                    workerInfo.worker.send({ type: 'health_check' });
                    
                    const messageHandler = (message) => {
                        if (message.type === 'health_response') {
                            clearTimeout(timeout);
                            workerInfo.worker.removeListener('message', messageHandler);
                            resolve({ workerId, healthy: true, data: message.data });
                        }
                    };
                    
                    workerInfo.worker.on('message', messageHandler);
                });
                
                healthChecks.push(healthCheck);
            }
            
            const results = await Promise.all(healthChecks);
            const unhealthyWorkers = results.filter(r => !r.healthy);
            
            if (unhealthyWorkers.length > 0) {
                logger.warn(`Unhealthy workers detected:`, unhealthyWorkers);
                
                // Restart unhealthy workers
                for (const { workerId } of unhealthyWorkers) {
                    const workerInfo = this.workers.get(workerId);
                    if (workerInfo) {
                        logger.info(`Restarting unhealthy worker ${workerId}`);
                        workerInfo.worker.kill();
                    }
                }
            }
            
        }, 60000); // Health check every minute
    }

    setupSignalHandlers() {
        // Handle SIGTERM (graceful shutdown)
        process.on('SIGTERM', () => {
            logger.info('Received SIGTERM, initiating graceful shutdown');
            this.gracefulShutdown();
        });

        // Handle SIGINT (Ctrl+C)
        process.on('SIGINT', () => {
            logger.info('Received SIGINT, initiating graceful shutdown');
            this.gracefulShutdown();
        });

        // Handle uncaught exceptions
        process.on('uncaughtException', (error) => {
            logger.error('Uncaught exception:', error);
            this.emergencyShutdown();
        });

        // Handle unhandled promise rejections
        process.on('unhandledRejection', (reason, promise) => {
            logger.error('Unhandled promise rejection:', reason);
            this.emergencyShutdown();
        });
    }

    setupGracefulShutdown() {
        if (!cluster.isMaster) return;

        // Handle worker health check responses
        cluster.on('message', (worker, message) => {
            if (message.type === 'health_check') {
                // Worker is requesting health check
                worker.send({ type: 'health_response', data: { status: 'ok' } });
            }
        });
    }

    async gracefulShutdown() {
        if (this.isShuttingDown) return;
        
        this.isShuttingDown = true;
        logger.info('Starting graceful shutdown...');

        if (cluster.isMaster) {
            // Master process shutdown
            const shutdownPromises = [];
            
            for (const [workerId, workerInfo] of this.workers) {
                const shutdownPromise = new Promise((resolve) => {
                    const timeout = setTimeout(() => {
                        logger.warn(`Worker ${workerId} shutdown timeout, killing forcefully`);
                        workerInfo.worker.kill('SIGKILL');
                        resolve();
                    }, 30000); // 30 second timeout
                    
                    workerInfo.worker.on('exit', () => {
                        clearTimeout(timeout);
                        resolve();
                    });
                    
                    workerInfo.worker.send({ type: 'shutdown' });
                });
                
                shutdownPromises.push(shutdownPromise);
            }
            
            await Promise.all(shutdownPromises);
            logger.info('All workers shut down, exiting master process');
            process.exit(0);
            
        } else {
            // Worker process shutdown
            await this.gracefulWorkerShutdown();
        }
    }

    async gracefulWorkerShutdown() {
        logger.info(`Worker ${process.pid} starting graceful shutdown`);
        
        try {
            // Stop accepting new jobs
            const queues = Object.values(dataProcessor.queues);
            await Promise.all(queues.map(queue => queue.pause()));
            
            // Wait for active jobs to complete (with timeout)
            const timeout = 25000; // 25 seconds
            const startTime = Date.now();
            
            while (Date.now() - startTime < timeout) {
                const activeJobs = await Promise.all(
                    queues.map(queue => queue.getActive())
                );
                
                const totalActiveJobs = activeJobs.reduce((sum, jobs) => sum + jobs.length, 0);
                
                if (totalActiveJobs === 0) {
                    logger.info(`Worker ${process.pid} completed all active jobs`);
                    break;
                }
                
                logger.info(`Worker ${process.pid} waiting for ${totalActiveJobs} active jobs to complete`);
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            
            // Close queue connections
            await Promise.all(queues.map(queue => queue.close()));
            
            logger.info(`Worker ${process.pid} shutdown complete`);
            process.exit(0);
            
        } catch (error) {
            logger.error(`Worker ${process.pid} shutdown error:`, error);
            process.exit(1);
        }
    }

    emergencyShutdown() {
        logger.error('Emergency shutdown initiated');
        
        if (cluster.isMaster) {
            // Kill all workers immediately
            for (const [workerId, workerInfo] of this.workers) {
                workerInfo.worker.kill('SIGKILL');
            }
        }
        
        process.exit(1);
    }

    // Public API methods for master process
    getWorkerStats() {
        if (!cluster.isMaster) return null;
        
        const stats = {
            master_pid: process.pid,
            worker_count: this.workers.size,
            max_workers: this.maxWorkers,
            workers: []
        };
        
        for (const [workerId, workerInfo] of this.workers) {
            stats.workers.push({
                id: workerId,
                pid: workerInfo.worker.process.pid,
                state: workerInfo.worker.state,
                start_time: workerInfo.startTime,
                uptime: Date.now() - workerInfo.startTime,
                restarts: workerInfo.restarts
            });
        }
        
        return stats;
    }

    async pauseAllQueues() {
        if (!cluster.isMaster) return;
        
        for (const [workerId, workerInfo] of this.workers) {
            workerInfo.worker.send({ type: 'pause' });
        }
        
        logger.info('Paused all queues across all workers');
    }

    async resumeAllQueues() {
        if (!cluster.isMaster) return;
        
        for (const [workerId, workerInfo] of this.workers) {
            workerInfo.worker.send({ type: 'resume' });
        }
        
        logger.info('Resumed all queues across all workers');
    }

    async pauseQueue(queueName) {
        if (!cluster.isMaster) return;
        
        for (const [workerId, workerInfo] of this.workers) {
            workerInfo.worker.send({ type: 'pause', queue: queueName });
        }
        
        logger.info(`Paused queue ${queueName} across all workers`);
    }

    async resumeQueue(queueName) {
        if (!cluster.isMaster) return;
        
        for (const [workerId, workerInfo] of this.workers) {
            workerInfo.worker.send({ type: 'resume', queue: queueName });
        }
        
        logger.info(`Resumed queue ${queueName} across all workers`);
    }

    async getAllWorkerStats() {
        if (!cluster.isMaster) return null;
        
        const statsPromises = [];
        
        for (const [workerId, workerInfo] of this.workers) {
            const statsPromise = new Promise((resolve) => {
                const timeout = setTimeout(() => {
                    resolve({ workerId, error: 'timeout' });
                }, 5000);
                
                const messageHandler = (message) => {
                    if (message.type === 'stats') {
                        clearTimeout(timeout);
                        workerInfo.worker.removeListener('message', messageHandler);
                        resolve({ workerId, stats: message.data });
                    }
                };
                
                workerInfo.worker.on('message', messageHandler);
                workerInfo.worker.send({ type: 'stats' });
            });
            
            statsPromises.push(statsPromise);
        }
        
        return await Promise.all(statsPromises);
    }
}

// Create and export singleton instance
const workerManager = new WorkerManager();

module.exports = workerManager;