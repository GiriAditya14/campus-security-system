const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const compression = require('compression');
const winston = require('winston');
const mongoose = require('mongoose');
const redis = require('redis');
const neo4j = require('neo4j-driver');
const databaseManager = require('./config/database');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Import services
const EntityResolutionService = require('./services/entityResolutionService');
const DataFusionService = require('./services/dataFusionService');
const ActivityPredictionService = require('./services/activityPredictionService');
const ExplainabilityService = require('./services/explainabilityService');
const AlertingEngine = require('./services/alertingEngine');
const NotificationService = require('./services/notificationService');
const RBACService = require('./services/rbacService');
const IndexingService = require('./services/indexingService');

// Import models
const Entity = require('./models/Entity');
const Event = require('./models/Event');
const Alert = require('./models/Alert');
const User = require('./models/User');

// Import routes
const entityRoutes = require('./routes/entities');
const eventRoutes = require('./routes/events');
const alertRoutes = require('./routes/alerts');
const userRoutes = require('./routes/users');
const analyticsRoutes = require('./routes/analytics');
const ingestionRoutes = require('./routes/ingestion');
const auditRoutes = require('./routes/audit');
const privacyRoutes = require('./routes/privacy');
const settingsRoutes = require('./routes/settings');
const photosRoutes = require('./routes/photos');
const simpleCctvRoutes = require('./routes/simple_cctv');
const notesRoutes = require('./routes/notes');

// Import middleware
const { auditLogger } = require('./middleware/auditLogger');
const { privacyMiddleware, differentialPrivacyMiddleware } = require('./middleware/privacy');

// Logger setup
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        }),
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' })
    ]
});

/**
 * Campus Security System Main Server
 * Integrates all services and provides unified API
 */
class CampusSecurityServer {
    constructor() {
        this.app = express();
        this.server = http.createServer(this.app);
        this.io = socketIo(this.server, {
            cors: {
                origin: process.env.FRONTEND_URL || "http://localhost:3000",
                methods: ["GET", "POST"]
            }
        });

        this.config = {
            port: process.env.PORT || 5000,
            mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/campus_security',
            redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
            neo4jUri: process.env.NEO4J_URI || 'bolt://localhost:7687',
            neo4jUser: process.env.NEO4J_USER || 'neo4j',
            neo4jPassword: process.env.NEO4J_PASSWORD || 'password',
            jwtSecret: process.env.JWT_SECRET || 'your-secret-key',
            jwtExpiration: process.env.JWT_EXPIRATION || '24h'
        };

        // Service instances
        this.services = {};
        this.databases = {};
        
        // Initialize server
        this.initializeMiddleware();
        this.initializeDatabases();
        this.initializeServices();
        this.initializeRoutes();
        this.initializeWebSocket();
        this.initializeErrorHandling();
    }

    /**
     * Initialize Express middleware
     */
    initializeMiddleware() {
        // Security middleware
        this.app.use(helmet({
            contentSecurityPolicy: {
                directives: {
                    defaultSrc: ["'self'"],
                    styleSrc: ["'self'", "'unsafe-inline'"],
                    scriptSrc: ["'self'", "'unsafe-inline'"],
                    imgSrc: ["'self'", "data:", "https:"],
                    manifestSrc: ["'self'"],
                }
            }
        }));

        // CORS configuration
        this.app.use(cors({
            origin: process.env.FRONTEND_URL || "http://localhost:3000",
            credentials: true
        }));

        // Rate limiting
        const limiter = rateLimit({
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: 1000, // limit each IP to 1000 requests per windowMs
            message: 'Too many requests from this IP, please try again later.',
            standardHeaders: true,
            legacyHeaders: false,
        });
        this.app.use('/api/', limiter);

        // Compression and parsing
        this.app.use(compression());
        this.app.use(express.json({ limit: '10mb' }));
        this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));
        
        // Serve static files from the frontend/build directory
        this.app.use(express.static(path.join(__dirname, '../../frontend/build')));

        // Request logging
        this.app.use((req, res, next) => {
            logger.info(`${req.method} ${req.path}`, {
                ip: req.ip,
                userAgent: req.get('User-Agent'),
                timestamp: new Date().toISOString()
            });
            next();
        });

        // Audit logging middleware
        this.app.use(auditLogger({
            excludePaths: ['/health', '/metrics', '/favicon.ico'],
            excludeMethods: ['OPTIONS'],
            logRequestBody: true,
            sensitiveFields: ['password', 'token', 'secret', 'key', 'authorization']
        }));

        // Privacy middleware for automatic data anonymization
        this.app.use('/api/', privacyMiddleware({
            applyDataMinimization: true,
            anonymizationLevel: 'partial',
            exemptRoles: ['ADMIN'],
            exemptPaths: ['/health', '/auth', '/privacy']
        }));

        logger.info('Middleware initialized successfully');
    }

    /**
     * Initialize database connections
     */
    async initializeDatabases() {
        try {
            logger.info('Initializing database connections via databaseManager...');
            const connections = await databaseManager.connectAll();

            // connections contains mongodb, redis, neo4j
            this.databases.redis = connections.redis;
            this.databases.neo4j = connections.neo4j;
            // mongoose connection is global and managed by databaseManager

            logger.info('Databases initialized via databaseManager');
        } catch (error) {
            logger.error('Database initialization failed:', error);
            throw error;
        }
    }

    /**
     * Initialize all services
     */
    async initializeServices() {
        try {
            // Initialize indexing service first
            this.services.indexing = new IndexingService(this.databases.redis);
            
            // Initialize entity resolution service
            this.services.entityResolution = new EntityResolutionService(
                this.databases.redis,
                this.services.indexing
            );

            // Initialize data fusion service
            this.services.dataFusion = new DataFusionService(
                this.databases.neo4j,
                this.databases.redis
            );

            // Initialize activity prediction service
            this.services.activityPrediction = new ActivityPredictionService(
                this.databases.redis
            );

            // Initialize explainability service
            this.services.explainability = new ExplainabilityService();

            // Initialize notification service
            this.services.notification = new NotificationService(this.io);

            // Initialize alerting engine
            this.services.alerting = new AlertingEngine(this.io);

            // Initialize RBAC service
            this.services.rbac = new RBACService();

            logger.info('All services initialized successfully');

        } catch (error) {
            logger.error('Service initialization failed:', error);
            throw error;
        }
    }

    /**
     * Initialize API routes
     */
    initializeRoutes() {
        // Health check endpoint
        this.app.get('/health', (req, res) => {
            res.json({
                status: 'healthy',
                timestamp: new Date().toISOString(),
                services: {
                    mongodb: mongoose.connection.readyState === 1,
                    redis: this.databases.redis.isReady,
                    neo4j: this.databases.neo4j !== null
                }
            });
        });

        // Lightweight unauthenticated ping for CCTV route debugging
        this.app.get('/api/cctv/ping', (req, res) => {
            res.json({ ok: true, path: '/api/cctv' });
        });

        // Authentication middleware
        const authenticateToken = async (req, res, next) => {
            try {
                const authHeader = req.headers['authorization'];
                const token = authHeader && authHeader.split(' ')[1];

                if (!token) {
                    return res.status(401).json({ error: 'Access token required' });
                }

                const decoded = jwt.verify(token, this.config.jwtSecret);
                const user = await User.findById(decoded.userId).select('-password');
                
                if (!user || user.status !== 'active') {
                    return res.status(401).json({ error: 'Invalid or inactive user' });
                }

                req.user = user;
                next();
            } catch (error) {
                logger.error('Authentication error:', error);
                return res.status(403).json({ error: 'Invalid token' });
            }
        };

        // Authorization middleware
        const authorize = (permissions) => {
            return async (req, res, next) => {
                try {
                    // Simple role-based authorization for now
                    const userRole = req.user.role;
                    
                    // Define role permissions
                    const rolePermissions = {
                        'ADMIN': ['entities:read', 'events:read', 'alerts:read', 'users:read', 'analytics:read', 'data:write'],
                        'SECURITY_OFFICER': ['entities:read', 'events:read', 'alerts:read', 'analytics:read'],
                        'OPERATOR': ['entities:read', 'events:read', 'alerts:read'],
                        'VIEWER': ['entities:read', 'events:read']
                    };

                    const userPermissions = rolePermissions[userRole] || [];
                    
                    // Check if user has any of the required permissions
                    const hasPermission = permissions.some(permission => 
                        userPermissions.includes(permission)
                    );

                    if (!hasPermission) {
                        return res.status(403).json({ 
                            error: 'Insufficient permissions',
                            required: permissions,
                            userRole: req.user.role
                        });
                    }

                    next();
                } catch (error) {
                    logger.error('Authorization error:', error);
                    return res.status(500).json({ error: 'Authorization check failed' });
                }
            };
        };

        // Authentication routes
        this.app.post('/api/auth/login', async (req, res) => {
            try {
                const { email, password } = req.body;

                if (!email || !password) {
                    return res.status(400).json({ error: 'Email and password required' });
                }

                const user = await User.findOne({ email, status: 'active' });
                if (!user) {
                    return res.status(401).json({ error: 'Invalid credentials' });
                }

                const isValidPassword = await bcrypt.compare(password, user.password);
                if (!isValidPassword) {
                    return res.status(401).json({ error: 'Invalid credentials' });
                }

                const token = jwt.sign(
                    { userId: user._id, role: user.role },
                    this.config.jwtSecret,
                    { expiresIn: this.config.jwtExpiration }
                );

                // Update last login
                user.last_login = new Date();
                await user.save();

                res.json({
                    token,
                    user: {
                        id: user._id,
                        email: user.email,
                        role: user.role,
                        profile: user.profile
                    }
                });

                logger.info(`User logged in: ${user.email}`);

            } catch (error) {
                logger.error('Login error:', error);
                res.status(500).json({ error: 'Login failed' });
            }
        });

        this.app.post('/api/auth/logout', authenticateToken, (req, res) => {
            // In a production system, you might want to blacklist the token
            res.json({ message: 'Logged out successfully' });
            logger.info(`User logged out: ${req.user.email}`);
        });

        // API routes with authentication and authorization
        this.app.use('/api/entities', authenticateToken, authorize(['entities:read']), entityRoutes);
        this.app.use('/api/events', authenticateToken, authorize(['events:read']), eventRoutes);
        this.app.use('/api/alerts', authenticateToken, authorize(['alerts:read']), alertRoutes);
        this.app.use('/api/users', authenticateToken, authorize(['users:read']), userRoutes);
        this.app.use('/api/analytics', authenticateToken, authorize(['analytics:read']), 
            differentialPrivacyMiddleware(), analyticsRoutes);
        this.app.use('/api/photos', authenticateToken, photosRoutes); // Profile photos routes
        this.app.use('/api/cctv', authenticateToken, authorize(['entities:read']), simpleCctvRoutes); // Simplified CCTV image recognition
    this.app.use('/api/notes', authenticateToken, authorize(['entities:read']), notesRoutes); // Free text notes
        this.app.use('/api/ingestion', authenticateToken, authorize(['data:write']), ingestionRoutes);
        this.app.use('/api/audit', authenticateToken, auditRoutes); // Apply authentication to audit routes
        this.app.use('/api/privacy', privacyRoutes); // Privacy routes have their own auth middleware
        this.app.use('/api/settings', settingsRoutes); // Settings routes have their own auth middleware

        // Service-specific endpoints
        this.initializeServiceEndpoints(authenticateToken, authorize);

        logger.info('Routes initialized successfully');
    }

    /**
     * Initialize service-specific endpoints
     */
    initializeServiceEndpoints(authenticateToken, authorize) {
        // Entity resolution endpoints
        this.app.post('/api/services/entity-resolution/resolve', 
            authenticateToken, 
            authorize(['entities:write']), 
            async (req, res) => {
                try {
                    const { entities } = req.body;
                    const result = await this.services.entityResolution.resolveEntities(entities);
                    res.json(result);
                } catch (error) {
                    logger.error('Entity resolution error:', error);
                    res.status(500).json({ error: 'Entity resolution failed' });
                }
            }
        );

        // Data fusion endpoints
        this.app.post('/api/services/data-fusion/fuse', 
            authenticateToken, 
            authorize(['data:write']), 
            async (req, res) => {
                try {
                    const { entityId, events } = req.body;
                    const result = await this.services.dataFusion.fuseEntityData(entityId, events);
                    res.json(result);
                } catch (error) {
                    logger.error('Data fusion error:', error);
                    res.status(500).json({ error: 'Data fusion failed' });
                }
            }
        );

        // Prediction endpoints
        this.app.post('/api/services/prediction/location', 
            authenticateToken, 
            authorize(['analytics:read']), 
            async (req, res) => {
                try {
                    const { entityId } = req.body;
                    const result = await this.services.activityPrediction.predictLocation(entityId);
                    res.json(result);
                } catch (error) {
                    logger.error('Location prediction error:', error);
                    res.status(500).json({ error: 'Location prediction failed' });
                }
            }
        );

        this.app.post('/api/services/prediction/activity', 
            authenticateToken, 
            authorize(['analytics:read']), 
            async (req, res) => {
                try {
                    const { entityId } = req.body;
                    const result = await this.services.activityPrediction.predictNextActivity(entityId);
                    res.json(result);
                } catch (error) {
                    logger.error('Activity prediction error:', error);
                    res.status(500).json({ error: 'Activity prediction failed' });
                }
            }
        );

        // Explainability endpoints
        this.app.post('/api/services/explainability/explain', 
            authenticateToken, 
            authorize(['analytics:read']), 
            async (req, res) => {
                try {
                    const { prediction, entityId } = req.body;
                    const result = await this.services.explainability.explainPrediction(prediction, entityId);
                    res.json(result);
                } catch (error) {
                    logger.error('Explainability error:', error);
                    res.status(500).json({ error: 'Explanation generation failed' });
                }
            }
        );

        // Alert management endpoints
        this.app.get('/api/services/alerts/metrics', 
            authenticateToken, 
            authorize(['alerts:read']), 
            (req, res) => {
                try {
                    const metrics = this.services.alerting.getMetrics();
                    res.json(metrics);
                } catch (error) {
                    logger.error('Alert metrics error:', error);
                    res.status(500).json({ error: 'Failed to get alert metrics' });
                }
            }
        );

        this.app.post('/api/services/alerts/manual', 
            authenticateToken, 
            authorize(['alerts:write']), 
            async (req, res) => {
                try {
                    const alertData = req.body;
                    const alert = await this.services.alerting.createManualAlert(alertData);
                    res.json(alert);
                } catch (error) {
                    logger.error('Manual alert creation error:', error);
                    res.status(500).json({ error: 'Failed to create manual alert' });
                }
            }
        );

        // RBAC management endpoints
        this.app.get('/api/services/rbac/roles', 
            authenticateToken, 
            authorize(['users:read']), 
            (req, res) => {
                try {
                    const roles = this.services.rbac.getRoles();
                    res.json(roles);
                } catch (error) {
                    logger.error('RBAC roles error:', error);
                    res.status(500).json({ error: 'Failed to get roles' });
                }
            }
        );

        this.app.get('/api/services/rbac/permissions/:role', 
            authenticateToken, 
            authorize(['users:read']), 
            (req, res) => {
                try {
                    const { role } = req.params;
                    const permissions = this.services.rbac.getRolePermissions(role);
                    res.json(permissions);
                } catch (error) {
                    logger.error('RBAC permissions error:', error);
                    res.status(500).json({ error: 'Failed to get permissions' });
                }
            }
        );
    }   
 /**
     * Initialize WebSocket connections
     */
    initializeWebSocket() {
        this.io.on('connection', (socket) => {
            logger.info(`Client connected: ${socket.id}`);

            // Handle authentication for WebSocket
            socket.on('authenticate', async (token) => {
                try {
                    const decoded = jwt.verify(token, this.config.jwtSecret);
                    const user = await User.findById(decoded.userId).select('-password');
                    
                    if (user && user.status === 'active') {
                        socket.user = user;
                        socket.join(`role_${user.role}`);
                        socket.emit('authenticated', { success: true, user: user.profile });
                        logger.info(`Socket authenticated for user: ${user.email}`);
                    } else {
                        socket.emit('authentication_error', { error: 'Invalid user' });
                    }
                } catch (error) {
                    socket.emit('authentication_error', { error: 'Invalid token' });
                }
            });

            // Handle real-time subscriptions
            socket.on('subscribe_alerts', () => {
                if (socket.user) {
                    socket.join('alerts');
                    logger.debug(`User ${socket.user.email} subscribed to alerts`);
                }
            });

            socket.on('subscribe_entity_updates', (entityId) => {
                if (socket.user) {
                    socket.join(`entity_${entityId}`);
                    logger.debug(`User ${socket.user.email} subscribed to entity ${entityId}`);
                }
            });

            socket.on('unsubscribe_alerts', () => {
                socket.leave('alerts');
                logger.debug(`User ${socket.user?.email} unsubscribed from alerts`);
            });

            socket.on('unsubscribe_entity_updates', (entityId) => {
                socket.leave(`entity_${entityId}`);
                logger.debug(`User ${socket.user?.email} unsubscribed from entity ${entityId}`);
            });

            socket.on('disconnect', () => {
                logger.info(`Client disconnected: ${socket.id}`);
            });
        });

        // Set up service event listeners
        this.setupServiceEventListeners();

        logger.info('WebSocket server initialized successfully');
    }

    /**
     * Set up event listeners for services
     */
    setupServiceEventListeners() {
        // Alert events
        this.services.alerting.on('alert_created', (alert) => {
            this.io.to('alerts').emit('new_alert', {
                id: alert._id,
                type: alert.type,
                severity: alert.severity,
                title: alert.title,
                description: alert.description,
                timestamp: alert.triggered_at,
                entity_id: alert.context?.entity_id
            });
        });

        // Entity resolution events
        this.services.entityResolution.on('entities_merged', (data) => {
            this.io.emit('entities_updated', {
                type: 'merge',
                entities: data.entities,
                timestamp: new Date()
            });
        });

        // Data fusion events
        this.services.dataFusion.on('entity_updated', (entityId) => {
            this.io.to(`entity_${entityId}`).emit('entity_data_updated', {
                entity_id: entityId,
                timestamp: new Date()
            });
        });

        // Prediction events
        this.services.activityPrediction.on('prediction_completed', (data) => {
            this.io.to(`entity_${data.entityId}`).emit('prediction_update', {
                entity_id: data.entityId,
                prediction: data.prediction,
                timestamp: new Date()
            });
        });
    }

    /**
     * Initialize error handling
     */
    initializeErrorHandling() {
        // 404 handler
        this.app.use('*', (req, res) => {
            res.status(404).json({
                error: 'Route not found',
                path: req.originalUrl,
                method: req.method
            });
        });

        // Global error handler
        this.app.use((error, req, res, next) => {
            logger.error('Unhandled error:', {
                error: error.message,
                stack: error.stack,
                url: req.url,
                method: req.method,
                ip: req.ip
            });

            // Don't leak error details in production
            const isDevelopment = process.env.NODE_ENV === 'development';
            
            res.status(error.status || 500).json({
                error: isDevelopment ? error.message : 'Internal server error',
                ...(isDevelopment && { stack: error.stack })
            });
        });

        // Handle unhandled promise rejections
        process.on('unhandledRejection', (reason, promise) => {
            logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
        });

        // Handle uncaught exceptions
        process.on('uncaughtException', (error) => {
            logger.error('Uncaught Exception:', error);
            process.exit(1);
        });

        // Graceful shutdown
        process.on('SIGTERM', () => {
            logger.info('SIGTERM received, shutting down gracefully');
            this.shutdown();
        });

        process.on('SIGINT', () => {
            logger.info('SIGINT received, shutting down gracefully');
            this.shutdown();
        });

        logger.info('Error handling initialized successfully');
    }

    /**
     * Start the server
     */
    async start() {
        try {
            await this.initializeDatabases();
            await this.initializeServices();

            this.server.listen(this.config.port, () => {
                logger.info(`Campus Security System server running on port ${this.config.port}`);
                logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
                logger.info(`Frontend URL: ${process.env.FRONTEND_URL || 'http://localhost:3000'}`);
                
                // Log service status
                logger.info('Services initialized:', {
                    entityResolution: !!this.services.entityResolution,
                    dataFusion: !!this.services.dataFusion,
                    activityPrediction: !!this.services.activityPrediction,
                    explainability: !!this.services.explainability,
                    alerting: !!this.services.alerting,
                    notification: !!this.services.notification,
                    rbac: !!this.services.rbac,
                    indexing: !!this.services.indexing
                });
            });

        } catch (error) {
            logger.error('Failed to start server:', error);
            process.exit(1);
        }
    }

    /**
     * Graceful shutdown
     */
    async shutdown() {
        try {
            logger.info('Starting graceful shutdown...');

            // Close server
            this.server.close(() => {
                logger.info('HTTP server closed');
            });

            // Close database connections
            if (this.databases.redis) {
                await this.databases.redis.quit();
                logger.info('Redis connection closed');
            }

            if (this.databases.neo4j) {
                await this.databases.neo4j.close();
                logger.info('Neo4j connection closed');
            }

            await mongoose.connection.close();
            logger.info('MongoDB connection closed');

            logger.info('Graceful shutdown completed');
            process.exit(0);

        } catch (error) {
            logger.error('Error during shutdown:', error);
            process.exit(1);
        }
    }

    /**
     * Get server status and metrics
     */
    getStatus() {
        return {
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            connections: {
                mongodb: mongoose.connection.readyState === 1,
                redis: this.databases.redis?.isReady || false,
                neo4j: this.databases.neo4j !== null
            },
            services: {
                entityResolution: !!this.services.entityResolution,
                dataFusion: !!this.services.dataFusion,
                activityPrediction: !!this.services.activityPrediction,
                explainability: !!this.services.explainability,
                alerting: !!this.services.alerting,
                notification: !!this.services.notification,
                rbac: !!this.services.rbac,
                indexing: !!this.services.indexing
            },
            timestamp: new Date().toISOString()
        };
    }
}

// Create and start server if this file is run directly
if (require.main === module) {
    const server = new CampusSecurityServer();
    server.start().catch(error => {
        logger.error('Failed to start server:', error);
        process.exit(1);
    });
}

module.exports = CampusSecurityServer;