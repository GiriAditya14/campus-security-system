const PrivacyService = require('../services/privacyService');
const winston = require('winston');

// Logger setup
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'logs/privacy-middleware.log' })
    ]
});

// Initialize privacy service
const privacyService = new PrivacyService({
    epsilon: parseFloat(process.env.PRIVACY_EPSILON) || 1.0,
    kValue: parseInt(process.env.PRIVACY_K_VALUE) || 5,
    defaultAnonymizationLevel: process.env.DEFAULT_ANONYMIZATION_LEVEL || 'partial'
});

/**
 * Privacy middleware for automatic data anonymization
 */
const privacyMiddleware = (options = {}) => {
    const {
        applyDifferentialPrivacy = false,
        applyKAnonymity = false,
        applyDataMinimization = true,
        anonymizationLevel = null,
        exemptRoles = ['ADMIN'],
        exemptPaths = ['/health', '/auth'],
        numericFields = ['count', 'total', 'sum', 'average']
    } = options;

    return (req, res, next) => {
        // Skip privacy for exempt paths
        if (exemptPaths.some(path => req.path.startsWith(path))) {
            return next();
        }

        // Skip privacy for exempt roles
        if (req.user && exemptRoles.includes(req.user.role)) {
            return next();
        }

        // Store original res.json to intercept response
        const originalJson = res.json;

        res.json = function(data) {
            try {
                let processedData = data;

                // Apply privacy transformations based on configuration
                if (data && typeof data === 'object') {
                    processedData = applyPrivacyTransformations(
                        data,
                        req.user?.role || 'VIEWER',
                        {
                            applyDifferentialPrivacy,
                            applyKAnonymity,
                            applyDataMinimization,
                            anonymizationLevel,
                            numericFields
                        }
                    );
                }

                return originalJson.call(this, processedData);

            } catch (error) {
                logger.error('Privacy middleware error:', error);
                // Return original data on error to avoid breaking the API
                return originalJson.call(this, data);
            }
        };

        next();
    };
};

/**
 * Apply privacy transformations to response data
 */
function applyPrivacyTransformations(data, userRole, options) {
    const {
        applyDifferentialPrivacy,
        applyKAnonymity,
        applyDataMinimization,
        anonymizationLevel,
        numericFields
    } = options;

    let processedData = data;

    // Apply differential privacy to numeric aggregations
    if (applyDifferentialPrivacy && data.success && data.data) {
        processedData = applyDifferentialPrivacyToData(processedData, numericFields);
    }

    // Apply k-anonymity to datasets
    if (applyKAnonymity && Array.isArray(data.data)) {
        processedData.data = privacyService.applyKAnonymity(data.data);
    }

    // Apply data minimization and PII redaction
    if (applyDataMinimization) {
        if (data.data) {
            processedData.data = privacyService.applyDataMinimization(
                data.data,
                anonymizationLevel,
                userRole
            );
        }
    }

    return processedData;
}

/**
 * Apply differential privacy to numeric fields
 */
function applyDifferentialPrivacyToData(data, numericFields) {
    if (!data.data || typeof data.data !== 'object') {
        return data;
    }

    const processedData = { ...data };

    // Apply to summary statistics
    if (data.data.summary) {
        processedData.data.summary = { ...data.data.summary };
        
        for (const field of numericFields) {
            if (typeof data.data.summary[field] === 'number') {
                processedData.data.summary[field] = privacyService.applyDifferentialPrivacy(
                    data.data.summary[field],
                    'count'
                );
            }
        }
    }

    // Apply to aggregation results
    if (Array.isArray(data.data.activityDistribution)) {
        processedData.data.activityDistribution = data.data.activityDistribution.map(item => ({
            ...item,
            count: privacyService.applyDifferentialPrivacy(item.count, 'count')
        }));
    }

    if (Array.isArray(data.data.locationActivity)) {
        processedData.data.locationActivity = data.data.locationActivity.map(item => ({
            ...item,
            count: privacyService.applyDifferentialPrivacy(item.count, 'count'),
            unique_entities: privacyService.applyDifferentialPrivacy(item.unique_entities, 'count')
        }));
    }

    if (Array.isArray(data.data.hourlyActivity)) {
        processedData.data.hourlyActivity = data.data.hourlyActivity.map(item => ({
            ...item,
            count: privacyService.applyDifferentialPrivacy(item.count, 'count')
        }));
    }

    return processedData;
}

/**
 * Middleware for enforcing k-anonymity on query results
 */
const kAnonymityMiddleware = (quasiIdentifiers = null) => {
    return (req, res, next) => {
        const originalJson = res.json;

        res.json = function(data) {
            try {
                if (data && data.data && Array.isArray(data.data)) {
                    const kAnonymityCheck = privacyService.checkKAnonymity(data.data, quasiIdentifiers);
                    
                    if (!kAnonymityCheck.satisfiesKAnonymity) {
                        logger.warn('K-anonymity violation detected', {
                            violations: kAnonymityCheck.violations,
                            totalGroups: kAnonymityCheck.totalGroups,
                            minGroupSize: kAnonymityCheck.minGroupSize
                        });

                        // Apply k-anonymity transformation
                        data.data = privacyService.applyKAnonymity(data.data, quasiIdentifiers);
                        
                        // Add privacy notice to response
                        data.privacy_notice = {
                            k_anonymity_applied: true,
                            k_value: privacyService.config.kValue,
                            original_violations: kAnonymityCheck.violations
                        };
                    }
                }

                return originalJson.call(this, data);

            } catch (error) {
                logger.error('K-anonymity middleware error:', error);
                return originalJson.call(this, data);
            }
        };

        next();
    };
};

/**
 * Middleware for applying differential privacy to analytics endpoints
 */
const differentialPrivacyMiddleware = (epsilon = null) => {
    return (req, res, next) => {
        // Update epsilon if provided
        if (epsilon) {
            privacyService.updateConfig({ epsilon });
        }

        const originalJson = res.json;

        res.json = function(data) {
            try {
                if (data && data.data) {
                    const processedData = applyDifferentialPrivacyToData(data, [
                        'count', 'total', 'sum', 'average', 'totalEntities', 
                        'activeEntities', 'totalEvents', 'activeAlerts'
                    ]);

                    // Add privacy notice
                    processedData.privacy_notice = {
                        differential_privacy_applied: true,
                        epsilon: privacyService.config.epsilon,
                        noise_added: true
                    };

                    return originalJson.call(this, processedData);
                }

                return originalJson.call(this, data);

            } catch (error) {
                logger.error('Differential privacy middleware error:', error);
                return originalJson.call(this, data);
            }
        };

        next();
    };
};

/**
 * Middleware for data export with enhanced privacy
 */
const exportPrivacyMiddleware = (options = {}) => {
    const {
        anonymizeIds = true,
        maxRecords = 10000,
        requiredRole = 'ADMIN'
    } = options;

    return (req, res, next) => {
        // Check role permissions
        if (req.user?.role !== requiredRole) {
            return res.status(403).json({
                error: 'Insufficient permissions for data export',
                required_role: requiredRole
            });
        }

        // Limit export size
        if (req.query.limit && parseInt(req.query.limit) > maxRecords) {
            req.query.limit = maxRecords.toString();
        }

        const originalSend = res.send;

        res.send = function(data) {
            try {
                if (typeof data === 'string' && data.includes(',')) {
                    // Assume CSV data
                    let processedData = data;

                    if (anonymizeIds) {
                        // Replace IDs with anonymized versions
                        const lines = data.split('\n');
                        const processedLines = lines.map((line, index) => {
                            if (index === 0) return line; // Keep header

                            const columns = line.split(',');
                            if (columns.length > 0) {
                                // Anonymize first column (assumed to be ID)
                                columns[0] = privacyService.generateAnonymizedId(columns[0]);
                            }
                            return columns.join(',');
                        });
                        processedData = processedLines.join('\n');
                    }

                    return originalSend.call(this, processedData);
                }

                return originalSend.call(this, data);

            } catch (error) {
                logger.error('Export privacy middleware error:', error);
                return originalSend.call(this, data);
            }
        };

        next();
    };
};

/**
 * Get privacy service metrics
 */
const getPrivacyMetrics = (req, res) => {
    try {
        const metrics = privacyService.getPrivacyMetrics();
        res.json({
            success: true,
            data: metrics
        });
    } catch (error) {
        logger.error('Error getting privacy metrics:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get privacy metrics'
        });
    }
};

/**
 * Update privacy configuration
 */
const updatePrivacyConfig = (req, res) => {
    try {
        const { epsilon, kValue, defaultAnonymizationLevel } = req.body;
        
        const updates = {};
        if (epsilon !== undefined) updates.epsilon = parseFloat(epsilon);
        if (kValue !== undefined) updates.kValue = parseInt(kValue);
        if (defaultAnonymizationLevel !== undefined) {
            updates.defaultAnonymizationLevel = defaultAnonymizationLevel;
        }

        privacyService.updateConfig(updates);

        res.json({
            success: true,
            message: 'Privacy configuration updated',
            config: updates
        });

    } catch (error) {
        logger.error('Error updating privacy config:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update privacy configuration'
        });
    }
};

module.exports = {
    privacyMiddleware,
    kAnonymityMiddleware,
    differentialPrivacyMiddleware,
    exportPrivacyMiddleware,
    getPrivacyMetrics,
    updatePrivacyConfig,
    privacyService
};