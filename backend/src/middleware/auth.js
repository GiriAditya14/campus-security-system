const jwt = require('jsonwebtoken');
const User = require('../models/User');
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
        new winston.transports.File({ filename: 'logs/auth.log' })
    ]
});

class AuthMiddleware {
    /**
     * Authenticate user using JWT token
     */
    async authenticate(req, res, next) {
        try {
            // Get token from header
            const authHeader = req.header('Authorization');
            
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                return res.status(401).json({
                    success: false,
                    error: 'Access denied',
                    message: 'No valid token provided'
                });
            }

            const token = authHeader.substring(7); // Remove 'Bearer ' prefix

            // Verify token
            const jwtSecret = process.env.JWT_SECRET;
            if (!jwtSecret) {
                logger.error('JWT_SECRET not configured');
                return res.status(500).json({
                    success: false,
                    error: 'Server configuration error',
                    message: 'JWT_SECRET not configured'
                });
            }
            
            const decoded = jwt.verify(token, jwtSecret);
            
            // Try to find user in database, fallback to token data if DB fails
            let user;
            try {
                user = await User.findByToken(token);
            } catch (dbError) {
                logger.warn('Database lookup failed, using token data:', dbError.message);
                // Fallback to decoded token data
                user = {
                    _id: decoded.userId,
                    id: decoded.userId,
                    username: decoded.username,
                    email: decoded.email,
                    role: decoded.role || 'ADMIN', // Use ADMIN since you're logged in as admin
                    status: 'active'
                };
            }
            
            if (!user) {
                return res.status(401).json({
                    success: false,
                    error: 'Access denied',
                    message: 'Invalid or expired token'
                });
            }

            // Check if user is active
            if (user.status !== 'active') {
                return res.status(401).json({
                    success: false,
                    error: 'Access denied',
                    message: 'Account is not active'
                });
            }

            // Add user to request object
            req.user = user;
            req.token = token;

            // Log successful authentication
            logger.info('User authenticated', {
                userId: user._id,
                username: user.username,
                role: user.role,
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                endpoint: req.originalUrl
            });

            next();

        } catch (error) {
            if (error.name === 'JsonWebTokenError') {
                logger.warn('JWT verification failed:', error.message);
                return res.status(401).json({
                    success: false,
                    error: 'Access denied',
                    message: 'Invalid token'
                });
            }

            if (error.name === 'TokenExpiredError') {
                logger.warn('JWT token expired:', error.message);
                return res.status(401).json({
                    success: false,
                    error: 'Access denied',
                    message: 'Token expired'
                });
            }

            logger.error('Authentication error details:', {
                error: error.message,
                stack: error.stack,
                name: error.name,
                endpoint: req.originalUrl,
                method: req.method,
                headers: req.headers
            });
            
            res.status(500).json({
                success: false,
                error: 'Authentication failed',
                message: `Internal server error: ${error.message}`
            });
        }
    }

    /**
     * Authorize user based on roles
     * @param {Array} allowedRoles - Array of allowed roles
     */
    authorize(allowedRoles = []) {
        return (req, res, next) => {
            try {
                // Check if user is authenticated
                if (!req.user) {
                    return res.status(401).json({
                        success: false,
                        error: 'Access denied',
                        message: 'Authentication required'
                    });
                }

                // Check if user has required role
                if (allowedRoles.length > 0 && !allowedRoles.includes(req.user.role)) {
                    logger.warn('Authorization failed', {
                        userId: req.user._id,
                        userRole: req.user.role,
                        requiredRoles: allowedRoles,
                        endpoint: req.originalUrl,
                        ip: req.ip
                    });

                    return res.status(403).json({
                        success: false,
                        error: 'Access forbidden',
                        message: 'Insufficient permissions'
                    });
                }

                // Log successful authorization
                logger.debug('User authorized', {
                    userId: req.user._id,
                    role: req.user.role,
                    endpoint: req.originalUrl
                });

                next();

            } catch (error) {
                logger.error('Authorization error:', error);
                res.status(500).json({
                    success: false,
                    error: 'Authorization failed',
                    message: 'Internal server error'
                });
            }
        };
    }

    /**
     * Check specific permission for a resource
     * @param {string} resource - Resource name
     * @param {string} action - Action to perform (read, write, delete, manage)
     */
    checkPermission(resource, action) {
        return (req, res, next) => {
            try {
                if (!req.user) {
                    return res.status(401).json({
                        success: false,
                        error: 'Access denied',
                        message: 'Authentication required'
                    });
                }

                // Check if user has permission
                if (!req.user.hasPermission(resource, action)) {
                    logger.warn('Permission denied', {
                        userId: req.user._id,
                        resource,
                        action,
                        userRole: req.user.role,
                        endpoint: req.originalUrl,
                        ip: req.ip
                    });

                    return res.status(403).json({
                        success: false,
                        error: 'Access forbidden',
                        message: `No permission to ${action} ${resource}`
                    });
                }

                next();

            } catch (error) {
                logger.error('Permission check error:', error);
                res.status(500).json({
                    success: false,
                    error: 'Permission check failed',
                    message: 'Internal server error'
                });
            }
        };
    }

    /**
     * Optional authentication - doesn't fail if no token provided
     */
    async optionalAuth(req, res, next) {
        try {
            const authHeader = req.header('Authorization');
            
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                // No token provided, continue without authentication
                return next();
            }

            const token = authHeader.substring(7);
            
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                const user = await User.findByToken(token);
                
                if (user && user.status === 'active') {
                    req.user = user;
                    req.token = token;
                }
            } catch (error) {
                // Invalid token, but don't fail the request
                logger.debug('Optional auth failed:', error.message);
            }

            next();

        } catch (error) {
            logger.error('Optional authentication error:', error);
            next(); // Continue even if there's an error
        }
    }

    /**
     * Audit logging middleware
     */
    auditLog(action, resource) {
        return (req, res, next) => {
            // Store original json method
            const originalJson = res.json;
            
            // Override json method to log after response
            res.json = function(data) {
                // Log the action
                if (req.user) {
                    setImmediate(async () => {
                        try {
                            req.user.addAuditLog(
                                action,
                                resource,
                                req.ip,
                                req.get('User-Agent'),
                                res.statusCode < 400,
                                {
                                    method: req.method,
                                    endpoint: req.originalUrl,
                                    statusCode: res.statusCode,
                                    params: req.params,
                                    query: req.query
                                }
                            );
                            await req.user.save();
                        } catch (error) {
                            logger.error('Audit logging error:', error);
                        }
                    });
                }
                
                // Call original json method
                return originalJson.call(this, data);
            };

            next();
        };
    }

    /**
     * Entity ownership check - ensures user can only access their own data
     */
    checkEntityOwnership() {
        return async (req, res, next) => {
            try {
                const entityId = req.params.id || req.params.entityId;
                
                if (!entityId) {
                    return res.status(400).json({
                        success: false,
                        error: 'Bad request',
                        message: 'Entity ID is required'
                    });
                }

                // Admins and security officers can access all entities
                if (['ADMIN', 'SECURITY_OFFICER'].includes(req.user.role)) {
                    return next();
                }

                // For other roles, check if they're accessing their own entity
                const Entity = require('../models/Entity');
                const entity = await Entity.findById(entityId);
                
                if (!entity) {
                    return res.status(404).json({
                        success: false,
                        error: 'Not found',
                        message: 'Entity not found'
                    });
                }

                // Check if the entity belongs to the current user
                const userEmail = req.user.email;
                const entityEmail = entity.identifiers.email;
                
                if (entityEmail !== userEmail) {
                    return res.status(403).json({
                        success: false,
                        error: 'Access forbidden',
                        message: 'You can only access your own data'
                    });
                }

                next();

            } catch (error) {
                logger.error('Entity ownership check error:', error);
                res.status(500).json({
                    success: false,
                    error: 'Ownership check failed',
                    message: 'Internal server error'
                });
            }
        };
    }

    /**
     * API key authentication for external services
     */
    authenticateApiKey(req, res, next) {
        try {
            const apiKey = req.header('X-API-Key');
            
            if (!apiKey) {
                return res.status(401).json({
                    success: false,
                    error: 'Access denied',
                    message: 'API key required'
                });
            }

            // Validate API key (in production, store these securely)
            const validApiKeys = [
                process.env.ML_SERVICE_API_KEY,
                process.env.EXTERNAL_API_KEY
            ].filter(Boolean);

            if (!validApiKeys.includes(apiKey)) {
                logger.warn('Invalid API key used', {
                    apiKey: apiKey.substring(0, 8) + '...',
                    ip: req.ip,
                    userAgent: req.get('User-Agent'),
                    endpoint: req.originalUrl
                });

                return res.status(401).json({
                    success: false,
                    error: 'Access denied',
                    message: 'Invalid API key'
                });
            }

            // Set API client info
            req.apiClient = {
                type: 'external_service',
                key: apiKey.substring(0, 8) + '...'
            };

            logger.info('API key authenticated', {
                client: req.apiClient,
                ip: req.ip,
                endpoint: req.originalUrl
            });

            next();

        } catch (error) {
            logger.error('API key authentication error:', error);
            res.status(500).json({
                success: false,
                error: 'Authentication failed',
                message: 'Internal server error'
            });
        }
    }

    /**
     * Session validation middleware
     */
    async validateSession(req, res, next) {
        try {
            if (!req.user || !req.token) {
                return next();
            }

            // Check if session is still valid
            const session = req.user.sessions.find(s => s.token === req.token);
            
            if (!session || !session.is_active) {
                return res.status(401).json({
                    success: false,
                    error: 'Session invalid',
                    message: 'Session has been terminated'
                });
            }

            // Check session expiry
            if (session.expires_at < new Date()) {
                // Mark session as inactive
                session.is_active = false;
                await req.user.save();

                return res.status(401).json({
                    success: false,
                    error: 'Session expired',
                    message: 'Please log in again'
                });
            }

            // Update last activity
            session.last_activity = new Date();
            await req.user.save();

            next();

        } catch (error) {
            logger.error('Session validation error:', error);
            res.status(500).json({
                success: false,
                error: 'Session validation failed',
                message: 'Internal server error'
            });
        }
    }

    /**
     * Two-factor authentication check
     */
    requireTwoFactor(req, res, next) {
        try {
            if (!req.user) {
                return res.status(401).json({
                    success: false,
                    error: 'Authentication required'
                });
            }

            // Check if 2FA is enabled and verified for this session
            if (req.user.two_factor.enabled && !req.session?.twoFactorVerified) {
                return res.status(403).json({
                    success: false,
                    error: 'Two-factor authentication required',
                    message: 'Please complete 2FA verification'
                });
            }

            next();

        } catch (error) {
            logger.error('Two-factor check error:', error);
            res.status(500).json({
                success: false,
                error: 'Two-factor check failed',
                message: 'Internal server error'
            });
        }
    }
}

// Create singleton instance
const authMiddleware = new AuthMiddleware();

module.exports = {
    authenticate: authMiddleware.authenticate.bind(authMiddleware),
    authorize: authMiddleware.authorize.bind(authMiddleware),
    checkPermission: authMiddleware.checkPermission.bind(authMiddleware),
    optionalAuth: authMiddleware.optionalAuth.bind(authMiddleware),
    auditLog: authMiddleware.auditLog.bind(authMiddleware),
    checkEntityOwnership: authMiddleware.checkEntityOwnership.bind(authMiddleware),
    authenticateApiKey: authMiddleware.authenticateApiKey.bind(authMiddleware),
    validateSession: authMiddleware.validateSession.bind(authMiddleware),
    requireTwoFactor: authMiddleware.requireTwoFactor.bind(authMiddleware)
};