const mongoose = require('mongoose');
const redis = require('redis');
const neo4j = require('neo4j-driver');
const winston = require('winston');

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
        new winston.transports.File({ filename: 'logs/database.log' })
    ]
});

class DatabaseManager {
    constructor() {
        this.mongoConnection = null;
        this.redisClient = null;
        this.neo4jDriver = null;
        this.isConnected = {
            mongodb: false,
            redis: false,
            neo4j: false
        };
        // store mongo URI and options for reconnects and fallbacks
        this.mongoUri = null;
        this.mongoOptions = null;
    }

    // MongoDB Connection
    async connectMongoDB() {
        try {
            // pick up configured URI (may be mongodb+srv) and keep for reconnect attempts
            this.mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/campus_security';

            const options = {
                maxPoolSize: parseInt(process.env.DB_POOL_SIZE) || 10,
                serverSelectionTimeoutMS: 5000,
                socketTimeoutMS: 45000,
                connectTimeoutMS: 10000,
                useNewUrlParser: true,
                useUnifiedTopology: true
            };

            // store options for reconnect attempts
            this.mongoOptions = options;

            this.mongoConnection = await mongoose.connect(this.mongoUri, options);
            
            // Connection event handlers
            mongoose.connection.on('connected', () => {
                this.isConnected.mongodb = true;
                logger.info('MongoDB connected successfully');
            });

            mongoose.connection.on('error', (err) => {
                this.isConnected.mongodb = false;
                logger.error('MongoDB connection error:', err);
            });

            mongoose.connection.on('disconnected', () => {
                this.isConnected.mongodb = false;
                logger.warn('MongoDB disconnected');
                this.reconnectMongoDB();
            });

            // Graceful shutdown
            process.on('SIGINT', async () => {
                await mongoose.connection.close();
                logger.info('MongoDB connection closed through app termination');
            });

            return this.mongoConnection;
        } catch (error) {
            // Handle SRV DNS lookup refusal (common when running offline but MONGODB_URI points to Atlas)
            logger.error('MongoDB connection failed:', error);

            const isSrvQueryRefused = error && (error.code === 'ECONNREFUSED' && error.syscall === 'querySrv')
                || (error.message && error.message.includes('querySrv'));

            if (isSrvQueryRefused) {
                const fallback = 'mongodb://localhost:27017/campus_security';
                if (this.mongoUri !== fallback) {
                    logger.warn('SRV DNS lookup refused for configured MongoDB URI. Attempting fallback to local MongoDB at', fallback);
                    try {
                        // try fallback using same options if available
                        const opts = this.mongoOptions || {
                            maxPoolSize: parseInt(process.env.DB_POOL_SIZE) || 10,
                            serverSelectionTimeoutMS: 5000,
                            socketTimeoutMS: 45000,
                            connectTimeoutMS: 10000,
                            useNewUrlParser: true,
                            useUnifiedTopology: true
                        };
                        this.mongoUri = fallback;
                        this.mongoOptions = opts;
                        this.mongoConnection = await mongoose.connect(this.mongoUri, opts);
                        logger.info('MongoDB connected successfully using fallback local URI');
                        return this.mongoConnection;
                    } catch (fallbackError) {
                        logger.error('Fallback MongoDB connection failed:', fallbackError);
                        throw fallbackError;
                    }
                }
            }

            throw error;
        }
    }

    async reconnectMongoDB() {
        let retryCount = 0;
        const maxRetries = 5;
        
        const reconnect = async () => {
            if (retryCount < maxRetries && !this.isConnected.mongodb) {
                const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
                logger.info(`Attempting MongoDB reconnection in ${delay}ms (attempt ${retryCount + 1}/${maxRetries})`);
                
                setTimeout(async () => {
                    try {
                        // use stored URI and options from initial connect attempt
                        const uri = this.mongoUri || process.env.MONGODB_URI || 'mongodb://localhost:27017/campus_security';
                        const opts = this.mongoOptions || {
                            maxPoolSize: parseInt(process.env.DB_POOL_SIZE) || 10,
                            serverSelectionTimeoutMS: 5000,
                            socketTimeoutMS: 45000,
                            bufferCommands: false,
                            bufferMaxEntries: 0,
                            useNewUrlParser: true,
                            useUnifiedTopology: true
                        };
                        await mongoose.connect(uri, opts);
                        logger.info('MongoDB reconnected successfully');
                    } catch (error) {
                        retryCount++;
                        logger.error(`MongoDB reconnection attempt ${retryCount} failed:`, error);
                        reconnect();
                    }
                }, delay);
            } else if (retryCount >= maxRetries) {
                logger.error('Max MongoDB reconnection attempts reached');
                process.exit(1);
            }
        };
        
        reconnect();
    }

    // Redis Connection
    async connectRedis() {
        try {
            const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
            
            this.redisClient = redis.createClient({
                url: redisUrl,
                socket: {
                    connectTimeout: 5000,
                    lazyConnect: true,
                    reconnectStrategy: (retries) => {
                        if (retries > 5) {
                            logger.error('Max Redis reconnection attempts reached');
                            return new Error('Max reconnection attempts reached');
                        }
                        return Math.min(retries * 50, 1000);
                    }
                }
            });

            // Redis event handlers
            this.redisClient.on('connect', () => {
                logger.info('Redis connecting...');
            });

            this.redisClient.on('ready', () => {
                this.isConnected.redis = true;
                logger.info('Redis connected and ready');
            });

            this.redisClient.on('error', (err) => {
                this.isConnected.redis = false;
                logger.error('Redis connection error:', err);
            });

            this.redisClient.on('end', () => {
                this.isConnected.redis = false;
                logger.warn('Redis connection ended');
            });

            this.redisClient.on('reconnecting', () => {
                logger.info('Redis reconnecting...');
            });

            await this.redisClient.connect();
            return this.redisClient;
        } catch (error) {
            logger.error('Redis connection failed:', error);
            throw error;
        }
    }

    // Neo4j Connection
    async connectNeo4j() {
        try {
            const neo4jUri = process.env.NEO4J_URI || 'bolt://localhost:7687';
            const neo4jUser = process.env.NEO4J_USERNAME || 'neo4j';
            const neo4jPassword = process.env.NEO4J_PASSWORD || 'password';

            this.neo4jDriver = neo4j.driver(
                neo4jUri,
                neo4j.auth.basic(neo4jUser, neo4jPassword),
                {
                    maxConnectionLifetime: 3 * 60 * 60 * 1000, // 3 hours
                    maxConnectionPoolSize: 50,
                    connectionAcquisitionTimeout: 2 * 60 * 1000, // 2 minutes
                    disableLosslessIntegers: true
                }
            );

            // Verify connectivity
            const session = this.neo4jDriver.session();
            try {
                await session.run('RETURN 1');
                this.isConnected.neo4j = true;
                logger.info('Neo4j connected successfully');
            } finally {
                await session.close();
            }

            return this.neo4jDriver;
        } catch (error) {
            logger.error('Neo4j connection failed:', error);
            throw error;
        }
    }

    // Connect to all databases
    async connectAll() {
        try {
            logger.info('Initializing database connections...');
            
            const connections = await Promise.allSettled([
                this.connectMongoDB(),
                this.connectRedis(),
                this.connectNeo4j()
            ]);

            const results = {
                mongodb: connections[0],
                redis: connections[1],
                neo4j: connections[2]
            };

            // Log connection results
            Object.entries(results).forEach(([db, result]) => {
                if (result.status === 'fulfilled') {
                    logger.info(`${db.toUpperCase()} connection successful`);
                } else {
                    logger.error(`${db.toUpperCase()} connection failed:`, result.reason);
                }
            });

            // Check if critical databases are connected
            const criticalDbs = ['mongodb'];
            const failedCritical = criticalDbs.filter(db => 
                results[db].status === 'rejected'
            );

            if (failedCritical.length > 0) {
                throw new Error(`Critical database connections failed: ${failedCritical.join(', ')}`);
            }

            return {
                mongodb: this.mongoConnection,
                redis: this.redisClient,
                neo4j: this.neo4jDriver
            };
        } catch (error) {
            logger.error('Database initialization failed:', error);
            throw error;
        }
    }

    // Health check for all databases
    async healthCheck() {
        const health = {
            mongodb: { status: 'unknown', latency: null, error: null },
            redis: { status: 'unknown', latency: null, error: null },
            neo4j: { status: 'unknown', latency: null, error: null }
        };

        // MongoDB health check
        try {
            const start = Date.now();
            await mongoose.connection.db.admin().ping();
            health.mongodb = {
                status: 'healthy',
                latency: Date.now() - start,
                error: null
            };
        } catch (error) {
            health.mongodb = {
                status: 'unhealthy',
                latency: null,
                error: error.message
            };
        }

        // Redis health check
        if (this.redisClient && this.redisClient.isReady) {
            try {
                const start = Date.now();
                await this.redisClient.ping();
                health.redis = {
                    status: 'healthy',
                    latency: Date.now() - start,
                    error: null
                };
            } catch (error) {
                health.redis = {
                    status: 'unhealthy',
                    latency: null,
                    error: error.message
                };
            }
        } else {
            health.redis = {
                status: 'disconnected',
                latency: null,
                error: 'Redis client not ready'
            };
        }

        // Neo4j health check
        if (this.neo4jDriver) {
            const session = this.neo4jDriver.session();
            try {
                const start = Date.now();
                await session.run('RETURN 1');
                health.neo4j = {
                    status: 'healthy',
                    latency: Date.now() - start,
                    error: null
                };
            } catch (error) {
                health.neo4j = {
                    status: 'unhealthy',
                    latency: null,
                    error: error.message
                };
            } finally {
                await session.close();
            }
        } else {
            health.neo4j = {
                status: 'disconnected',
                latency: null,
                error: 'Neo4j driver not initialized'
            };
        }

        return health;
    }

    // Get database connections
    getConnections() {
        return {
            mongodb: this.mongoConnection,
            redis: this.redisClient,
            neo4j: this.neo4jDriver
        };
    }

    // Close all connections
    async closeAll() {
        logger.info('Closing all database connections...');
        
        const closePromises = [];

        if (this.mongoConnection) {
            closePromises.push(mongoose.connection.close());
        }

        if (this.redisClient) {
            closePromises.push(this.redisClient.quit());
        }

        if (this.neo4jDriver) {
            closePromises.push(this.neo4jDriver.close());
        }

        try {
            await Promise.all(closePromises);
            logger.info('All database connections closed successfully');
        } catch (error) {
            logger.error('Error closing database connections:', error);
        }
    }

    // Cache utilities for Redis
    async setCache(key, value, ttl = 300) {
        if (!this.redisClient || !this.redisClient.isReady) {
            logger.warn('Redis not available for caching');
            return false;
        }

        try {
            const serializedValue = JSON.stringify(value);
            await this.redisClient.setEx(key, ttl, serializedValue);
            return true;
        } catch (error) {
            logger.error('Cache set error:', error);
            return false;
        }
    }

    async getCache(key) {
        if (!this.redisClient || !this.redisClient.isReady) {
            return null;
        }

        try {
            const value = await this.redisClient.get(key);
            return value ? JSON.parse(value) : null;
        } catch (error) {
            logger.error('Cache get error:', error);
            return null;
        }
    }

    async deleteCache(key) {
        if (!this.redisClient || !this.redisClient.isReady) {
            return false;
        }

        try {
            await this.redisClient.del(key);
            return true;
        } catch (error) {
            logger.error('Cache delete error:', error);
            return false;
        }
    }

    async clearCache(pattern = '*') {
        if (!this.redisClient || !this.redisClient.isReady) {
            return false;
        }

        try {
            const keys = await this.redisClient.keys(pattern);
            if (keys.length > 0) {
                await this.redisClient.del(keys);
            }
            return true;
        } catch (error) {
            logger.error('Cache clear error:', error);
            return false;
        }
    }
}

// Create singleton instance
const databaseManager = new DatabaseManager();

module.exports = databaseManager;