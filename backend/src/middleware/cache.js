const CacheService = require('../services/cacheService');

/**
 * Cache middleware for Express.js
 * Provides caching functionality for API endpoints
 */

class CacheMiddleware {
    constructor(cacheService) {
        this.cache = cacheService;
    }

    /**
     * Generic cache middleware
     * @param {Object} options - Cache options
     * @param {number} options.ttl - Time to live in seconds
     * @param {Function} options.keyGenerator - Function to generate cache key
     * @param {Function} options.condition - Function to determine if response should be cached
     * @param {Array} options.varyBy - Request properties to vary cache by
     */
    middleware(options = {}) {
        const {
            ttl = 300,
            keyGenerator = this.defaultKeyGenerator,
            condition = this.defaultCondition,
            varyBy = ['url', 'query']
        } = options;

        return async (req, res, next) => {
            // Skip caching for non-GET requests
            if (req.method !== 'GET') {
                return next();
            }

            try {
                // Generate cache key
                const cacheKey = keyGenerator(req, varyBy);
                
                // Try to get from cache
                const cachedData = await this.cache.get(cacheKey);
                
                if (cachedData) {
                    // Cache hit
                    res.set('X-Cache', 'HIT');
                    res.set('X-Cache-Key', cacheKey);
                    return res.json(cachedData);
                }

                // Cache miss - intercept response
                res.set('X-Cache', 'MISS');
                res.set('X-Cache-Key', cacheKey);

                // Store original json method
                const originalJson = res.json;
                
                // Override json method to cache response
                res.json = function(data) {
                    // Check if response should be cached
                    if (condition(req, res, data)) {
                        // Cache the response asynchronously
                        setImmediate(async () => {
                            try {
                                await this.cache.set(cacheKey, data, ttl);
                            } catch (error) {
                                console.error('Error caching response:', error);
                            }
                        });
                    }
                    
                    // Call original json method
                    return originalJson.call(this, data);
                }.bind(this);

                next();
            } catch (error) {
                console.error('Cache middleware error:', error);
                next();
            }
        };
    }

    /**
     * Entity-specific cache middleware
     */
    entityCache(ttl = 300) {
        return this.middleware({
            ttl,
            keyGenerator: (req) => {
                const entityId = req.params.id || req.params.entityId;
                return this.cache.keys.entity(entityId);
            },
            condition: (req, res, data) => {
                return res.statusCode === 200 && data && !data.error;
            }
        });
    }

    /**
     * Search results cache middleware
     */
    searchCache(ttl = 180) {
        return this.middleware({
            ttl,
            keyGenerator: (req) => {
                const query = req.query.q || req.query.search || '';
                const filters = {
                    type: req.query.type,
                    department: req.query.department,
                    status: req.query.status,
                    limit: req.query.limit,
                    skip: req.query.skip
                };
                return this.cache.keys.entitySearch(query, filters);
            },
            condition: (req, res, data) => {
                return res.statusCode === 200 && data && data.results;
            }
        });
    }

    /**
     * Timeline cache middleware
     */
    timelineCache(ttl = 600) {
        return this.middleware({
            ttl,
            keyGenerator: (req) => {
                const entityId = req.params.id || req.params.entityId;
                const startDate = req.query.startDate || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
                const endDate = req.query.endDate || new Date().toISOString();
                return this.cache.keys.entityTimeline(entityId, startDate, endDate);
            },
            condition: (req, res, data) => {
                return res.statusCode === 200 && data && Array.isArray(data.timeline);
            }
        });
    }

    /**
     * Predictions cache middleware
     */
    predictionsCache(ttl = 600) {
        return this.middleware({
            ttl,
            keyGenerator: (req) => {
                const entityId = req.params.id || req.params.entityId;
                return this.cache.keys.predictions(entityId);
            },
            condition: (req, res, data) => {
                return res.statusCode === 200 && data && data.predictions;
            }
        });
    }

    /**
     * Location activity cache middleware
     */
    locationActivityCache(ttl = 300) {
        return this.middleware({
            ttl,
            keyGenerator: (req) => {
                const locationId = req.params.locationId;
                const timeRange = req.query.timeRange || '24h';
                return this.cache.keys.locationActivity(locationId, timeRange);
            },
            condition: (req, res, data) => {
                return res.statusCode === 200 && data;
            }
        });
    }

    /**
     * Alerts cache middleware
     */
    alertsCache(ttl = 60) {
        return this.middleware({
            ttl,
            keyGenerator: (req) => {
                const filters = {
                    severity: req.query.severity,
                    type: req.query.type,
                    status: req.query.status,
                    entityId: req.query.entityId,
                    limit: req.query.limit,
                    skip: req.query.skip
                };
                return this.cache.keys.alerts(filters);
            },
            condition: (req, res, data) => {
                return res.statusCode === 200 && data && Array.isArray(data.alerts);
            }
        });
    }

    /**
     * Statistics cache middleware
     */
    statsCache(ttl = 1800) {
        return this.middleware({
            ttl,
            keyGenerator: (req) => {
                const type = req.params.type || 'general';
                const timeRange = req.query.timeRange || '24h';
                return this.cache.keys.stats(type, timeRange);
            },
            condition: (req, res, data) => {
                return res.statusCode === 200 && data;
            }
        });
    }

    /**
     * Heatmap cache middleware
     */
    heatmapCache(ttl = 3600) {
        return this.middleware({
            ttl,
            keyGenerator: (req) => {
                const startDate = req.query.startDate || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
                const endDate = req.query.endDate || new Date().toISOString();
                const resolution = req.query.resolution || 'medium';
                return this.cache.keys.heatmap(startDate, endDate, resolution);
            },
            condition: (req, res, data) => {
                return res.statusCode === 200 && data && Array.isArray(data.heatmap);
            }
        });
    }

    /**
     * Cache invalidation middleware
     * Invalidates relevant caches when data is modified
     */
    invalidateOnModify() {
        return async (req, res, next) => {
            // Store original methods
            const originalJson = res.json;
            const originalSend = res.send;

            // Override response methods to trigger cache invalidation
            const invalidateCache = async () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try {
                        await this.invalidateRelevantCaches(req);
                    } catch (error) {
                        console.error('Error invalidating cache:', error);
                    }
                }
            };

            res.json = function(data) {
                setImmediate(invalidateCache);
                return originalJson.call(this, data);
            };

            res.send = function(data) {
                setImmediate(invalidateCache);
                return originalSend.call(this, data);
            };

            next();
        };
    }

    /**
     * Invalidate relevant caches based on the request
     */
    async invalidateRelevantCaches(req) {
        const method = req.method;
        const path = req.path;

        // Entity-related invalidations
        if (path.includes('/entities/')) {
            const entityId = req.params.id || req.params.entityId;
            
            if (entityId && (method === 'PUT' || method === 'PATCH' || method === 'DELETE')) {
                await this.cache.invalidateEntity(entityId);
            }
            
            // Invalidate search caches for any entity modifications
            if (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE') {
                await this.cache.deletePattern(`${this.cache.keyPrefix}search:entities:*`);
            }
        }

        // Alert-related invalidations
        if (path.includes('/alerts/') && (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE')) {
            await this.cache.invalidateAlerts();
        }

        // Statistics invalidations
        if (method === 'POST' || method === 'PUT' || method === 'PATCH' || method === 'DELETE') {
            await this.cache.invalidateStats();
        }

        // Event-related invalidations
        if (path.includes('/events/') && method === 'POST') {
            // Invalidate timeline and location activity caches
            await this.cache.deletePattern(`${this.cache.keyPrefix}timeline:*`);
            await this.cache.deletePattern(`${this.cache.keyPrefix}location:*`);
            await this.cache.deletePattern(`${this.cache.keyPrefix}heatmap:*`);
        }
    }

    /**
     * Default key generator
     */
    defaultKeyGenerator(req, varyBy = ['url', 'query']) {
        const parts = [];
        
        if (varyBy.includes('url')) {
            parts.push(req.originalUrl || req.url);
        }
        
        if (varyBy.includes('query')) {
            parts.push(JSON.stringify(req.query));
        }
        
        if (varyBy.includes('user')) {
            parts.push(req.user?.id || 'anonymous');
        }
        
        if (varyBy.includes('role')) {
            parts.push(req.user?.role || 'guest');
        }

        return `${this.cache.keyPrefix}generic:${Buffer.from(parts.join('|')).toString('base64')}`;
    }

    /**
     * Default condition for caching
     */
    defaultCondition(req, res, data) {
        return res.statusCode === 200 && data && !data.error;
    }

    /**
     * Rate limiting middleware using cache
     */
    rateLimit(options = {}) {
        const {
            windowMs = 15 * 60 * 1000, // 15 minutes
            max = 100,
            keyGenerator = (req) => req.ip,
            skipSuccessfulRequests = false,
            skipFailedRequests = false
        } = options;

        return async (req, res, next) => {
            try {
                const key = keyGenerator(req);
                const endpoint = req.route?.path || req.path;
                
                const result = await this.cache.checkRateLimit(key, endpoint, max, windowMs);
                
                // Set rate limit headers
                res.set({
                    'X-RateLimit-Limit': max,
                    'X-RateLimit-Remaining': result.remaining,
                    'X-RateLimit-Reset': new Date(result.resetTime).toISOString()
                });

                if (!result.allowed) {
                    return res.status(429).json({
                        error: 'Too Many Requests',
                        message: 'Rate limit exceeded',
                        retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000)
                    });
                }

                // Track the request completion for conditional counting
                if (skipSuccessfulRequests || skipFailedRequests) {
                    const originalJson = res.json;
                    const originalSend = res.send;

                    const shouldSkip = () => {
                        if (skipSuccessfulRequests && res.statusCode < 400) return true;
                        if (skipFailedRequests && res.statusCode >= 400) return true;
                        return false;
                    };

                    res.json = function(data) {
                        if (shouldSkip()) {
                            // Decrement the counter
                            setImmediate(async () => {
                                try {
                                    const rateLimitKey = this.cache.keys.apiRateLimit(key, endpoint);
                                    await this.cache.client.decr(rateLimitKey);
                                } catch (error) {
                                    console.error('Error adjusting rate limit counter:', error);
                                }
                            });
                        }
                        return originalJson.call(this, data);
                    }.bind(this);

                    res.send = function(data) {
                        if (shouldSkip()) {
                            // Decrement the counter
                            setImmediate(async () => {
                                try {
                                    const rateLimitKey = this.cache.keys.apiRateLimit(key, endpoint);
                                    await this.cache.client.decr(rateLimitKey);
                                } catch (error) {
                                    console.error('Error adjusting rate limit counter:', error);
                                }
                            });
                        }
                        return originalSend.call(this, data);
                    }.bind(this);
                }

                next();
            } catch (error) {
                console.error('Rate limit middleware error:', error);
                // Fail open - allow request if rate limiting fails
                next();
            }
        };
    }

    /**
     * Cache warming middleware
     * Pre-loads frequently accessed data into cache
     */
    warmCache() {
        return async (req, res, next) => {
            // This could be triggered by specific routes or conditions
            // For now, it's a placeholder for cache warming logic
            next();
        };
    }

    /**
     * Cache health check middleware
     */
    healthCheck() {
        return async (req, res, next) => {
            try {
                const health = await this.cache.healthCheck();
                req.cacheHealth = health;
                next();
            } catch (error) {
                req.cacheHealth = { status: 'error', error: error.message };
                next();
            }
        };
    }
}

module.exports = CacheMiddleware;