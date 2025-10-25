const redis = require('redis');
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
        new winston.transports.File({ filename: 'logs/cache.log' })
    ]
});

class CacheService {
    constructor(redisClient) {
        this.client = redisClient;
        this.defaultTTL = parseInt(process.env.CACHE_TTL) || 300; // 5 minutes
        this.keyPrefix = 'campus_security:';
        
        // Cache key patterns
        this.keys = {
            entity: (id) => `${this.keyPrefix}entity:${id}`,
            entitySearch: (query, filters) => `${this.keyPrefix}search:entities:${this.hashObject({query, ...filters})}`,
            entityTimeline: (id, startDate, endDate) => `${this.keyPrefix}timeline:${id}:${startDate}:${endDate}`,
            predictions: (id) => `${this.keyPrefix}predictions:${id}`,
            locationActivity: (locationId, timeRange) => `${this.keyPrefix}location:${locationId}:${timeRange}`,
            alerts: (filters) => `${this.keyPrefix}alerts:${this.hashObject(filters)}`,
            userSession: (userId, sessionId) => `${this.keyPrefix}session:${userId}:${sessionId}`,
            apiRateLimit: (ip, endpoint) => `${this.keyPrefix}ratelimit:${ip}:${endpoint}`,
            stats: (type, timeRange) => `${this.keyPrefix}stats:${type}:${timeRange}`,
            heatmap: (startDate, endDate, resolution) => `${this.keyPrefix}heatmap:${startDate}:${endDate}:${resolution}`
        };
        
        // TTL configurations for different data types
        this.ttlConfig = {
            entity: 300,           // 5 minutes
            entitySearch: 180,     // 3 minutes
            entityTimeline: 600,   // 10 minutes
            predictions: 600,      // 10 minutes
            locationActivity: 300, // 5 minutes
            alerts: 60,           // 1 minute
            userSession: 86400,   // 24 hours
            apiRateLimit: 900,    // 15 minutes
            stats: 1800,          // 30 minutes
            heatmap: 3600         // 1 hour
        };
    }

    // Utility methods
    hashObject(obj) {
        return Buffer.from(JSON.stringify(obj)).toString('base64').slice(0, 16);
    }

    isConnected() {
        return this.client && this.client.isReady;
    }

    // Generic cache operations
    async set(key, value, ttl = null) {
        if (!this.isConnected()) {
            logger.warn('Redis not connected, skipping cache set');
            return false;
        }

        try {
            const serializedValue = JSON.stringify({
                data: value,
                timestamp: Date.now(),
                ttl: ttl || this.defaultTTL
            });
            
            const actualTTL = ttl || this.defaultTTL;
            await this.client.setEx(key, actualTTL, serializedValue);
            
            logger.debug(`Cache set: ${key} (TTL: ${actualTTL}s)`);
            return true;
        } catch (error) {
            logger.error('Cache set error:', error);
            return false;
        }
    }

    async get(key) {
        if (!this.isConnected()) {
            return null;
        }

        try {
            const value = await this.client.get(key);
            if (!value) {
                return null;
            }

            const parsed = JSON.parse(value);
            
            // Check if data is still fresh (additional validation)
            const age = Date.now() - parsed.timestamp;
            if (age > parsed.ttl * 1000) {
                await this.delete(key);
                return null;
            }

            logger.debug(`Cache hit: ${key}`);
            return parsed.data;
        } catch (error) {
            logger.error('Cache get error:', error);
            return null;
        }
    }

    async delete(key) {
        if (!this.isConnected()) {
            return false;
        }

        try {
            await this.client.del(key);
            logger.debug(`Cache delete: ${key}`);
            return true;
        } catch (error) {
            logger.error('Cache delete error:', error);
            return false;
        }
    }

    async exists(key) {
        if (!this.isConnected()) {
            return false;
        }

        try {
            const result = await this.client.exists(key);
            return result === 1;
        } catch (error) {
            logger.error('Cache exists error:', error);
            return false;
        }
    }

    async expire(key, ttl) {
        if (!this.isConnected()) {
            return false;
        }

        try {
            await this.client.expire(key, ttl);
            return true;
        } catch (error) {
            logger.error('Cache expire error:', error);
            return false;
        }
    }

    // Entity caching
    async cacheEntity(entityId, entityData) {
        const key = this.keys.entity(entityId);
        return await this.set(key, entityData, this.ttlConfig.entity);
    }

    async getEntity(entityId) {
        const key = this.keys.entity(entityId);
        return await this.get(key);
    }

    async invalidateEntity(entityId) {
        const key = this.keys.entity(entityId);
        await this.delete(key);
        
        // Also invalidate related caches
        await this.invalidateEntityRelated(entityId);
    }

    async invalidateEntityRelated(entityId) {
        // Invalidate timeline cache
        const timelinePattern = `${this.keyPrefix}timeline:${entityId}:*`;
        await this.deletePattern(timelinePattern);
        
        // Invalidate predictions cache
        const predictionsKey = this.keys.predictions(entityId);
        await this.delete(predictionsKey);
        
        // Invalidate search caches (this is expensive, consider more targeted approach)
        const searchPattern = `${this.keyPrefix}search:entities:*`;
        await this.deletePattern(searchPattern);
    }

    // Search result caching
    async cacheEntitySearch(query, filters, results) {
        const key = this.keys.entitySearch(query, filters);
        return await this.set(key, results, this.ttlConfig.entitySearch);
    }

    async getEntitySearch(query, filters) {
        const key = this.keys.entitySearch(query, filters);
        return await this.get(key);
    }

    // Timeline caching
    async cacheEntityTimeline(entityId, startDate, endDate, timeline) {
        const key = this.keys.entityTimeline(entityId, startDate.toISOString(), endDate.toISOString());
        return await this.set(key, timeline, this.ttlConfig.entityTimeline);
    }

    async getEntityTimeline(entityId, startDate, endDate) {
        const key = this.keys.entityTimeline(entityId, startDate.toISOString(), endDate.toISOString());
        return await this.get(key);
    }

    // Predictions caching
    async cachePredictions(entityId, predictions) {
        const key = this.keys.predictions(entityId);
        return await this.set(key, predictions, this.ttlConfig.predictions);
    }

    async getPredictions(entityId) {
        const key = this.keys.predictions(entityId);
        return await this.get(key);
    }

    async invalidatePredictions(entityId) {
        const key = this.keys.predictions(entityId);
        await this.delete(key);
    }

    // Location activity caching
    async cacheLocationActivity(locationId, timeRange, activity) {
        const key = this.keys.locationActivity(locationId, timeRange);
        return await this.set(key, activity, this.ttlConfig.locationActivity);
    }

    async getLocationActivity(locationId, timeRange) {
        const key = this.keys.locationActivity(locationId, timeRange);
        return await this.get(key);
    }

    // Alerts caching
    async cacheAlerts(filters, alerts) {
        const key = this.keys.alerts(filters);
        return await this.set(key, alerts, this.ttlConfig.alerts);
    }

    async getAlerts(filters) {
        const key = this.keys.alerts(filters);
        return await this.get(key);
    }

    async invalidateAlerts() {
        const pattern = `${this.keyPrefix}alerts:*`;
        await this.deletePattern(pattern);
    }

    // User session caching
    async cacheUserSession(userId, sessionId, sessionData) {
        const key = this.keys.userSession(userId, sessionId);
        return await this.set(key, sessionData, this.ttlConfig.userSession);
    }

    async getUserSession(userId, sessionId) {
        const key = this.keys.userSession(userId, sessionId);
        return await this.get(key);
    }

    async invalidateUserSession(userId, sessionId) {
        const key = this.keys.userSession(userId, sessionId);
        await this.delete(key);
    }

    async invalidateAllUserSessions(userId) {
        const pattern = `${this.keyPrefix}session:${userId}:*`;
        await this.deletePattern(pattern);
    }

    // Rate limiting
    async checkRateLimit(ip, endpoint, limit = 100, windowMs = 900000) {
        const key = this.keys.apiRateLimit(ip, endpoint);
        
        try {
            const current = await this.client.get(key);
            
            if (!current) {
                // First request in window
                await this.client.setEx(key, Math.ceil(windowMs / 1000), '1');
                return { allowed: true, remaining: limit - 1, resetTime: Date.now() + windowMs };
            }
            
            const count = parseInt(current);
            
            if (count >= limit) {
                const ttl = await this.client.ttl(key);
                return { 
                    allowed: false, 
                    remaining: 0, 
                    resetTime: Date.now() + (ttl * 1000) 
                };
            }
            
            await this.client.incr(key);
            const ttl = await this.client.ttl(key);
            
            return { 
                allowed: true, 
                remaining: limit - count - 1, 
                resetTime: Date.now() + (ttl * 1000) 
            };
        } catch (error) {
            logger.error('Rate limit check error:', error);
            // Fail open - allow request if cache is down
            return { allowed: true, remaining: limit - 1, resetTime: Date.now() + windowMs };
        }
    }

    // Statistics caching
    async cacheStats(type, timeRange, stats) {
        const key = this.keys.stats(type, timeRange);
        return await this.set(key, stats, this.ttlConfig.stats);
    }

    async getStats(type, timeRange) {
        const key = this.keys.stats(type, timeRange);
        return await this.get(key);
    }

    async invalidateStats() {
        const pattern = `${this.keyPrefix}stats:*`;
        await this.deletePattern(pattern);
    }

    // Heatmap caching
    async cacheHeatmap(startDate, endDate, resolution, heatmapData) {
        const key = this.keys.heatmap(startDate.toISOString(), endDate.toISOString(), resolution);
        return await this.set(key, heatmapData, this.ttlConfig.heatmap);
    }

    async getHeatmap(startDate, endDate, resolution) {
        const key = this.keys.heatmap(startDate.toISOString(), endDate.toISOString(), resolution);
        return await this.get(key);
    }

    // Bulk operations
    async mget(keys) {
        if (!this.isConnected() || keys.length === 0) {
            return [];
        }

        try {
            const values = await this.client.mGet(keys);
            return values.map((value, index) => {
                if (!value) return null;
                
                try {
                    const parsed = JSON.parse(value);
                    const age = Date.now() - parsed.timestamp;
                    
                    if (age > parsed.ttl * 1000) {
                        // Async delete expired key
                        this.delete(keys[index]).catch(err => 
                            logger.error('Error deleting expired key:', err)
                        );
                        return null;
                    }
                    
                    return parsed.data;
                } catch (error) {
                    logger.error('Error parsing cached value:', error);
                    return null;
                }
            });
        } catch (error) {
            logger.error('Bulk get error:', error);
            return new Array(keys.length).fill(null);
        }
    }

    async mset(keyValuePairs, ttl = null) {
        if (!this.isConnected() || keyValuePairs.length === 0) {
            return false;
        }

        try {
            const pipeline = this.client.multi();
            const actualTTL = ttl || this.defaultTTL;
            
            for (const [key, value] of keyValuePairs) {
                const serializedValue = JSON.stringify({
                    data: value,
                    timestamp: Date.now(),
                    ttl: actualTTL
                });
                
                pipeline.setEx(key, actualTTL, serializedValue);
            }
            
            await pipeline.exec();
            return true;
        } catch (error) {
            logger.error('Bulk set error:', error);
            return false;
        }
    }

    // Pattern-based operations
    async deletePattern(pattern) {
        if (!this.isConnected()) {
            return false;
        }

        try {
            const keys = await this.client.keys(pattern);
            if (keys.length > 0) {
                await this.client.del(keys);
                logger.debug(`Deleted ${keys.length} keys matching pattern: ${pattern}`);
            }
            return true;
        } catch (error) {
            logger.error('Pattern delete error:', error);
            return false;
        }
    }

    async getKeysByPattern(pattern) {
        if (!this.isConnected()) {
            return [];
        }

        try {
            return await this.client.keys(pattern);
        } catch (error) {
            logger.error('Get keys by pattern error:', error);
            return [];
        }
    }

    // Cache warming
    async warmEntityCache(entityIds) {
        logger.info(`Warming cache for ${entityIds.length} entities`);
        
        // This would typically fetch from database and cache
        // Implementation depends on your data access layer
        const warmedCount = 0;
        
        for (const entityId of entityIds) {
            try {
                // Check if already cached
                if (await this.exists(this.keys.entity(entityId))) {
                    continue;
                }
                
                // Fetch from database (placeholder)
                // const entityData = await entityService.getById(entityId);
                // await this.cacheEntity(entityId, entityData);
                // warmedCount++;
                
            } catch (error) {
                logger.error(`Error warming cache for entity ${entityId}:`, error);
            }
        }
        
        logger.info(`Cache warming completed: ${warmedCount} entities cached`);
        return warmedCount;
    }

    // Cache statistics and monitoring
    async getCacheStats() {
        if (!this.isConnected()) {
            return null;
        }

        try {
            const info = await this.client.info('memory');
            const keyspace = await this.client.info('keyspace');
            
            // Parse Redis info
            const memoryInfo = {};
            info.split('\r\n').forEach(line => {
                if (line.includes(':')) {
                    const [key, value] = line.split(':');
                    memoryInfo[key] = value;
                }
            });
            
            // Get our application keys count
            const appKeys = await this.client.keys(`${this.keyPrefix}*`);
            
            return {
                connected: true,
                memory_used: memoryInfo.used_memory_human,
                memory_peak: memoryInfo.used_memory_peak_human,
                total_keys: appKeys.length,
                keyspace_info: keyspace,
                uptime: memoryInfo.uptime_in_seconds
            };
        } catch (error) {
            logger.error('Error getting cache stats:', error);
            return { connected: false, error: error.message };
        }
    }

    // Cache cleanup and maintenance
    async cleanup() {
        logger.info('Starting cache cleanup...');
        
        try {
            // Get all our application keys
            const keys = await this.client.keys(`${this.keyPrefix}*`);
            let expiredCount = 0;
            
            // Check each key for expiration (this is expensive, use sparingly)
            for (const key of keys) {
                try {
                    const value = await this.client.get(key);
                    if (value) {
                        const parsed = JSON.parse(value);
                        const age = Date.now() - parsed.timestamp;
                        
                        if (age > parsed.ttl * 1000) {
                            await this.client.del(key);
                            expiredCount++;
                        }
                    }
                } catch (error) {
                    // Invalid JSON or other error, delete the key
                    await this.client.del(key);
                    expiredCount++;
                }
            }
            
            logger.info(`Cache cleanup completed: ${expiredCount} expired keys removed`);
            return expiredCount;
        } catch (error) {
            logger.error('Cache cleanup error:', error);
            return 0;
        }
    }

    async flushAll() {
        if (!this.isConnected()) {
            return false;
        }

        try {
            // Only flush our application keys
            const keys = await this.client.keys(`${this.keyPrefix}*`);
            if (keys.length > 0) {
                await this.client.del(keys);
            }
            
            logger.info(`Flushed ${keys.length} application cache keys`);
            return true;
        } catch (error) {
            logger.error('Cache flush error:', error);
            return false;
        }
    }

    // Health check
    async healthCheck() {
        try {
            if (!this.isConnected()) {
                return { status: 'disconnected', latency: null };
            }
            
            const start = Date.now();
            await this.client.ping();
            const latency = Date.now() - start;
            
            return { status: 'healthy', latency };
        } catch (error) {
            return { status: 'unhealthy', error: error.message, latency: null };
        }
    }
}

module.exports = CacheService;