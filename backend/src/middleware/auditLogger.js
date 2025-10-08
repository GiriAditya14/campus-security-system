const winston = require('winston');
const mongoose = require('mongoose');

// Audit Log Schema
const auditLogSchema = new mongoose.Schema({
    _id: { type: String, required: true },
    user_id: { type: String, required: true },
    action: { type: String, required: true },
    resource: { type: String, required: true },
    resource_id: { type: String },
    method: { type: String, required: true },
    endpoint: { type: String, required: true },
    ip_address: { type: String, required: true },
    user_agent: { type: String },
    timestamp: { type: Date, default: Date.now },
    request_body: { type: mongoose.Schema.Types.Mixed },
    response_status: { type: Number },
    response_time: { type: Number },
    success: { type: Boolean, required: true },
    error_message: { type: String },
    metadata: {
        session_id: String,
        role: String,
        department: String,
        additional_context: mongoose.Schema.Types.Mixed
    }
}, {
    collection: 'audit_logs',
    timestamps: false
});

// Create indexes for performance
auditLogSchema.index({ user_id: 1, timestamp: -1 });
auditLogSchema.index({ action: 1, timestamp: -1 });
auditLogSchema.index({ resource: 1, timestamp: -1 });
auditLogSchema.index({ timestamp: -1 });
auditLogSchema.index({ ip_address: 1, timestamp: -1 });

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

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
        new winston.transports.File({ filename: 'logs/audit.log' }),
        new winston.transports.File({ 
            filename: 'logs/security.log',
            level: 'warn'
        })
    ]
});

/**
 * Audit logging middleware
 * Logs all API requests with user context and response details
 */
const auditLogger = (options = {}) => {
    const {
        excludePaths = ['/health', '/metrics'],
        excludeMethods = ['OPTIONS'],
        logRequestBody = true,
        logResponseBody = false,
        sensitiveFields = ['password', 'token', 'secret', 'key']
    } = options;

    return async (req, res, next) => {
        const startTime = Date.now();
        
        // Skip excluded paths and methods
        if (excludePaths.some(path => req.path.startsWith(path)) || 
            excludeMethods.includes(req.method)) {
            return next();
        }

        // Extract user information
        const userId = req.user?.id || 'anonymous';
        const userRole = req.user?.role || 'unknown';
        const userDepartment = req.user?.profile?.department || 'unknown';

        // Generate audit log ID
        const auditId = `AUDIT_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // Sanitize request body (remove sensitive fields)
        const sanitizedBody = logRequestBody ? sanitizeObject(req.body, sensitiveFields) : null;

        // Get client IP
        const clientIP = req.ip || 
                        req.connection.remoteAddress || 
                        req.socket.remoteAddress ||
                        (req.connection.socket ? req.connection.socket.remoteAddress : null) ||
                        req.headers['x-forwarded-for']?.split(',')[0] ||
                        'unknown';

        // Determine action and resource from the request
        const { action, resource, resourceId } = parseRequestContext(req);

        // Store original res.json to capture response
        const originalJson = res.json;
        let responseData = null;
        let responseStatus = null;

        res.json = function(data) {
            responseData = data;
            responseStatus = res.statusCode;
            return originalJson.call(this, data);
        };

        // Store original res.status to capture status changes
        const originalStatus = res.status;
        res.status = function(code) {
            responseStatus = code;
            return originalStatus.call(this, code);
        };

        // Continue with request processing
        next();

        // Log after response is sent
        res.on('finish', async () => {
            const endTime = Date.now();
            const responseTime = endTime - startTime;
            const success = responseStatus < 400;

            const auditLogEntry = {
                _id: auditId,
                user_id: userId,
                action: action,
                resource: resource,
                resource_id: resourceId,
                method: req.method,
                endpoint: req.originalUrl || req.url,
                ip_address: clientIP,
                user_agent: req.get('User-Agent') || 'unknown',
                timestamp: new Date(startTime),
                request_body: sanitizedBody,
                response_status: responseStatus,
                response_time: responseTime,
                success: success,
                error_message: success ? null : responseData?.error || responseData?.message,
                metadata: {
                    session_id: req.sessionID || req.headers['x-session-id'],
                    role: userRole,
                    department: userDepartment,
                    additional_context: {
                        query_params: req.query,
                        content_type: req.get('Content-Type'),
                        content_length: req.get('Content-Length'),
                        referer: req.get('Referer'),
                        response_size: JSON.stringify(responseData || {}).length
                    }
                }
            };

            try {
                // Save to database
                const auditLog = new AuditLog(auditLogEntry);
                await auditLog.save();

                // Log to file system
                const logLevel = success ? 'info' : 'warn';
                const logMessage = {
                    audit_id: auditId,
                    user_id: userId,
                    action: action,
                    resource: resource,
                    method: req.method,
                    endpoint: req.originalUrl,
                    ip_address: clientIP,
                    response_status: responseStatus,
                    response_time: responseTime,
                    success: success
                };

                logger.log(logLevel, 'API Request Audit', logMessage);

                // Log security events
                if (isSecurityEvent(req, responseStatus, action)) {
                    logger.warn('Security Event Detected', {
                        ...logMessage,
                        security_event: true,
                        event_type: getSecurityEventType(req, responseStatus, action)
                    });
                }

            } catch (error) {
                logger.error('Failed to save audit log:', {
                    audit_id: auditId,
                    error: error.message,
                    user_id: userId,
                    endpoint: req.originalUrl
                });
            }
        });
    };
};

/**
 * Parse request context to determine action and resource
 */
function parseRequestContext(req) {
    const path = req.path;
    const method = req.method;
    const pathParts = path.split('/').filter(part => part);

    let action = 'UNKNOWN';
    let resource = 'UNKNOWN';
    let resourceId = null;

    // Determine action based on HTTP method
    switch (method) {
        case 'GET':
            action = pathParts.length > 2 && !isNaN(pathParts[2]) ? 'READ' : 'list';
            break;
        case 'POST':
            action = 'create';
            break;
        case 'PUT':
        case 'PATCH':
            action = 'update';
            break;
        case 'DELETE':
            action = 'delete';
            break;
    }

    // Determine resource from path
    if (pathParts.length >= 2) {
        resource = pathParts[1]; // e.g., /api/entities -> 'entities'
        
        // Extract resource ID if present
        if (pathParts.length >= 3 && !isNaN(pathParts[2])) {
            resourceId = pathParts[2];
        } else if (pathParts.length >= 3) {
            // Handle nested resources like /api/entities/123/timeline
            if (!isNaN(pathParts[2])) {
                resourceId = pathParts[2];
            }
        }
    }

    // Handle special cases
    if (path.includes('/login')) {
        action = 'login';
        resource = 'authentication';
    } else if (path.includes('/logout')) {
        action = 'logout';
        resource = 'authentication';
    } else if (path.includes('/search')) {
        action = 'search';
    } else if (path.includes('/analytics')) {
        action = 'analytics';
        resource = 'analytics';
    }

    return { action, resource, resourceId };
}

/**
 * Sanitize object by removing sensitive fields
 */
function sanitizeObject(obj, sensitiveFields) {
    if (!obj || typeof obj !== 'object') {
        return obj;
    }

    const sanitized = { ...obj };
    
    for (const field of sensitiveFields) {
        if (sanitized[field]) {
            sanitized[field] = '[REDACTED]';
        }
    }

    // Recursively sanitize nested objects
    for (const key in sanitized) {
        if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
            sanitized[key] = sanitizeObject(sanitized[key], sensitiveFields);
        }
    }

    return sanitized;
}

/**
 * Determine if request represents a security event
 */
function isSecurityEvent(req, responseStatus, action) {
    // Failed authentication attempts
    if (action === 'login' && responseStatus >= 400) {
        return true;
    }

    // Unauthorized access attempts
    if (responseStatus === 401 || responseStatus === 403) {
        return true;
    }

    // Multiple failed requests from same IP
    // (This would require additional tracking logic)

    // Access to sensitive resources
    if (req.path.includes('/admin') || req.path.includes('/users')) {
        return true;
    }

    // Unusual request patterns
    if (req.method === 'DELETE' && responseStatus < 300) {
        return true;
    }

    return false;
}

/**
 * Get security event type
 */
function getSecurityEventType(req, responseStatus, action) {
    if (action === 'login' && responseStatus >= 400) {
        return 'FAILED_LOGIN';
    }
    
    if (responseStatus === 401) {
        return 'UNAUTHORIZED_ACCESS';
    }
    
    if (responseStatus === 403) {
        return 'FORBIDDEN_ACCESS';
    }
    
    if (req.method === 'DELETE') {
        return 'DATA_DELETION';
    }
    
    if (req.path.includes('/admin')) {
        return 'ADMIN_ACCESS';
    }
    
    return 'SECURITY_EVENT';
}

/**
 * Get audit logs with filtering and pagination
 */
const getAuditLogs = async (filters = {}, options = {}) => {
    try {
        const {
            userId,
            action,
            resource,
            startDate,
            endDate,
            ipAddress,
            success,
            limit = 100,
            offset = 0,
            sortBy = 'timestamp',
            sortOrder = -1
        } = { ...filters, ...options };

        // Build query
        const query = {};
        
        if (userId) query.user_id = userId;
        if (action) query.action = action;
        if (resource) query.resource = resource;
        if (ipAddress) query.ip_address = ipAddress;
        if (typeof success === 'boolean') query.success = success;
        
        if (startDate || endDate) {
            query.timestamp = {};
            if (startDate) query.timestamp.$gte = new Date(startDate);
            if (endDate) query.timestamp.$lte = new Date(endDate);
        }

        // Execute query
        const [logs, totalCount] = await Promise.all([
            AuditLog.find(query)
                .sort({ [sortBy]: sortOrder })
                .skip(offset)
                .limit(limit)
                .lean(),
            AuditLog.countDocuments(query)
        ]);

        return {
            logs,
            pagination: {
                total: totalCount,
                limit,
                offset,
                hasMore: offset + limit < totalCount
            }
        };

    } catch (error) {
        logger.error('Error retrieving audit logs:', error);
        throw error;
    }
};

/**
 * Get audit statistics
 */
const getAuditStatistics = async (timeRange = '24h') => {
    try {
        const now = new Date();
        let startTime;

        switch (timeRange) {
            case '1h':
                startTime = new Date(now.getTime() - 60 * 60 * 1000);
                break;
            case '24h':
                startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                break;
            case '7d':
                startTime = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
                break;
            case '30d':
                startTime = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
                break;
            default:
                startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        }

        const [
            totalRequests,
            successfulRequests,
            failedRequests,
            uniqueUsers,
            uniqueIPs,
            topActions,
            topResources,
            securityEvents
        ] = await Promise.all([
            AuditLog.countDocuments({ timestamp: { $gte: startTime } }),
            AuditLog.countDocuments({ timestamp: { $gte: startTime }, success: true }),
            AuditLog.countDocuments({ timestamp: { $gte: startTime }, success: false }),
            AuditLog.distinct('user_id', { timestamp: { $gte: startTime } }),
            AuditLog.distinct('ip_address', { timestamp: { $gte: startTime } }),
            AuditLog.aggregate([
                { $match: { timestamp: { $gte: startTime } } },
                { $group: { _id: '$action', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 10 }
            ]),
            AuditLog.aggregate([
                { $match: { timestamp: { $gte: startTime } } },
                { $group: { _id: '$resource', count: { $sum: 1 } } },
                { $sort: { count: -1 } },
                { $limit: 10 }
            ]),
            AuditLog.countDocuments({ 
                timestamp: { $gte: startTime },
                $or: [
                    { response_status: { $in: [401, 403] } },
                    { action: 'login', success: false }
                ]
            })
        ]);

        return {
            summary: {
                totalRequests,
                successfulRequests,
                failedRequests,
                successRate: totalRequests > 0 ? (successfulRequests / totalRequests) : 0,
                uniqueUsers: uniqueUsers.length,
                uniqueIPs: uniqueIPs.length,
                securityEvents
            },
            topActions,
            topResources,
            timeRange,
            generatedAt: new Date()
        };

    } catch (error) {
        logger.error('Error generating audit statistics:', error);
        throw error;
    }
};

module.exports = {
    auditLogger,
    getAuditLogs,
    getAuditStatistics,
    AuditLog
};