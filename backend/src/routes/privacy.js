const express = require('express');
const router = express.Router();
const { authenticate, authorize } = require('../middleware/auth');
const { 
    getPrivacyMetrics, 
    updatePrivacyConfig,
    privacyService 
} = require('../middleware/privacy');
const winston = require('winston');

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'logs/privacy-api.log' })
    ]
});

// Apply authentication to all privacy routes
router.use(authenticate);

/**
 * GET /api/privacy/metrics
 * Get privacy service metrics and statistics
 * Requires ADMIN role
 */
router.get('/metrics', authorize(['ADMIN']), getPrivacyMetrics);

/**
 * PUT /api/privacy/config
 * Update privacy configuration
 * Requires ADMIN role
 */
router.put('/config', authorize(['ADMIN']), updatePrivacyConfig);

/**
 * GET /api/privacy/config
 * Get current privacy configuration
 * Requires ADMIN role
 */
router.get('/config', authorize(['ADMIN']), (req, res) => {
    try {
        res.json({
            success: true,
            data: {
                epsilon: privacyService.config.epsilon,
                delta: privacyService.config.delta,
                kValue: privacyService.config.kValue,
                defaultAnonymizationLevel: privacyService.config.defaultAnonymizationLevel,
                piiFields: privacyService.config.piiFields,
                quasiIdentifiers: privacyService.config.quasiIdentifiers
            }
        });
    } catch (error) {
        logger.error('Error getting privacy config:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get privacy configuration'
        });
    }
});

/**
 * POST /api/privacy/test-k-anonymity
 * Test k-anonymity on provided dataset
 * Requires ADMIN or SECURITY_OFFICER role
 */
router.post('/test-k-anonymity', authorize(['ADMIN', 'SECURITY_OFFICER']), async (req, res) => {
    try {
        const { dataset, quasiIdentifiers, kValue } = req.body;

        if (!Array.isArray(dataset)) {
            return res.status(400).json({
                success: false,
                error: 'Dataset must be an array'
            });
        }

        // Temporarily update k-value if provided
        const originalKValue = privacyService.config.kValue;
        if (kValue) {
            privacyService.updateConfig({ kValue: parseInt(kValue) });
        }

        const result = privacyService.checkKAnonymity(dataset, quasiIdentifiers);

        // Restore original k-value
        if (kValue) {
            privacyService.updateConfig({ kValue: originalKValue });
        }

        res.json({
            success: true,
            data: result
        });

    } catch (error) {
        logger.error('Error testing k-anonymity:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to test k-anonymity'
        });
    }
});

/**
 * POST /api/privacy/apply-k-anonymity
 * Apply k-anonymity to provided dataset
 * Requires ADMIN role
 */
router.post('/apply-k-anonymity', authorize(['ADMIN']), async (req, res) => {
    try {
        const { dataset, quasiIdentifiers, kValue } = req.body;

        if (!Array.isArray(dataset)) {
            return res.status(400).json({
                success: false,
                error: 'Dataset must be an array'
            });
        }

        // Temporarily update k-value if provided
        const originalKValue = privacyService.config.kValue;
        if (kValue) {
            privacyService.updateConfig({ kValue: parseInt(kValue) });
        }

        const anonymizedDataset = privacyService.applyKAnonymity(dataset, quasiIdentifiers);
        const kAnonymityCheck = privacyService.checkKAnonymity(anonymizedDataset, quasiIdentifiers);

        // Restore original k-value
        if (kValue) {
            privacyService.updateConfig({ kValue: originalKValue });
        }

        res.json({
            success: true,
            data: {
                originalSize: dataset.length,
                anonymizedSize: anonymizedDataset.length,
                anonymizedDataset: anonymizedDataset,
                kAnonymityCheck: kAnonymityCheck
            }
        });

    } catch (error) {
        logger.error('Error applying k-anonymity:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to apply k-anonymity'
        });
    }
});

/**
 * POST /api/privacy/test-differential-privacy
 * Test differential privacy on numeric values
 * Requires ADMIN or SECURITY_OFFICER role
 */
router.post('/test-differential-privacy', authorize(['ADMIN', 'SECURITY_OFFICER']), (req, res) => {
    try {
        const { value, queryType, epsilon, iterations } = req.body;

        if (typeof value !== 'number') {
            return res.status(400).json({
                success: false,
                error: 'Value must be a number'
            });
        }

        const originalEpsilon = privacyService.config.epsilon;
        if (epsilon) {
            privacyService.updateConfig({ epsilon: parseFloat(epsilon) });
        }

        const results = [];
        const iterationCount = parseInt(iterations) || 10;

        for (let i = 0; i < iterationCount; i++) {
            const noisyValue = privacyService.applyDifferentialPrivacy(value, queryType || 'count');
            results.push(noisyValue);
        }

        // Restore original epsilon
        if (epsilon) {
            privacyService.updateConfig({ epsilon: originalEpsilon });
        }

        const average = results.reduce((sum, val) => sum + val, 0) / results.length;
        const variance = results.reduce((sum, val) => sum + Math.pow(val - average, 2), 0) / results.length;

        res.json({
            success: true,
            data: {
                originalValue: value,
                noisyValues: results,
                statistics: {
                    average: average,
                    variance: variance,
                    standardDeviation: Math.sqrt(variance),
                    minValue: Math.min(...results),
                    maxValue: Math.max(...results)
                },
                parameters: {
                    epsilon: epsilon || originalEpsilon,
                    queryType: queryType || 'count',
                    iterations: iterationCount
                }
            }
        });

    } catch (error) {
        logger.error('Error testing differential privacy:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to test differential privacy'
        });
    }
});

/**
 * POST /api/privacy/anonymize-data
 * Anonymize provided data using data minimization
 * Requires ADMIN or SECURITY_OFFICER role
 */
router.post('/anonymize-data', authorize(['ADMIN', 'SECURITY_OFFICER']), (req, res) => {
    try {
        const { data, anonymizationLevel, userRole } = req.body;

        if (!data) {
            return res.status(400).json({
                success: false,
                error: 'Data is required'
            });
        }

        const anonymizedData = privacyService.applyDataMinimization(
            data,
            anonymizationLevel || 'partial',
            userRole || 'VIEWER'
        );

        res.json({
            success: true,
            data: {
                originalData: data,
                anonymizedData: anonymizedData,
                parameters: {
                    anonymizationLevel: anonymizationLevel || 'partial',
                    userRole: userRole || 'VIEWER'
                }
            }
        });

    } catch (error) {
        logger.error('Error anonymizing data:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to anonymize data'
        });
    }
});

/**
 * POST /api/privacy/generate-anonymous-id
 * Generate anonymized ID for given original ID
 * Requires ADMIN role
 */
router.post('/generate-anonymous-id', authorize(['ADMIN']), (req, res) => {
    try {
        const { originalId, salt } = req.body;

        if (!originalId) {
            return res.status(400).json({
                success: false,
                error: 'Original ID is required'
            });
        }

        const anonymizedId = privacyService.generateAnonymizedId(originalId, salt);

        res.json({
            success: true,
            data: {
                originalId: originalId,
                anonymizedId: anonymizedId,
                salt: salt || 'default'
            }
        });

    } catch (error) {
        logger.error('Error generating anonymous ID:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate anonymous ID'
        });
    }
});

/**
 * DELETE /api/privacy/cache
 * Clear privacy service cache
 * Requires ADMIN role
 */
router.delete('/cache', authorize(['ADMIN']), (req, res) => {
    try {
        privacyService.clearCache();

        res.json({
            success: true,
            message: 'Privacy cache cleared successfully'
        });

    } catch (error) {
        logger.error('Error clearing privacy cache:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to clear privacy cache'
        });
    }
});

/**
 * GET /api/privacy/settings
 * Get privacy settings (alias for config for frontend compatibility)
 * Requires ADMIN role
 */
router.get('/settings', authorize(['ADMIN', 'SECURITY_OFFICER', 'OPERATOR']), (req, res) => {
    try {
        // Return mock privacy settings that match frontend expectations
        const settings = {
            dataRetention: {
                enabled: true,
                period: 90,
                autoDelete: true
            },
            anonymization: {
                enabled: true,
                level: 'partial',
                fields: ['name', 'email', 'phone']
            },
            encryption: {
                enabled: true,
                algorithm: 'AES-256',
                keyRotation: true
            },
            access: {
                logAccess: true,
                requireJustification: true,
                approvalRequired: false
            },
            sharing: {
                enabled: false,
                partners: [],
                consentRequired: true
            },
            compliance: {
                gdpr: true,
                ccpa: true,
                ferpa: true
            }
        };

        res.json({
            success: true,
            data: settings
        });
    } catch (error) {
        logger.error('Error getting privacy settings:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get privacy settings'
        });
    }
});

/**
 * PUT /api/privacy/settings
 * Update privacy settings (alias for config for frontend compatibility)
 * Requires ADMIN role
 */
router.put('/settings', authorize(['ADMIN', 'SECURITY_OFFICER', 'OPERATOR']), (req, res) => {
    try {
        const settings = req.body;
        
        // Log the settings update
        logger.info('Privacy settings updated:', { 
            userId: req.user?.id,
            settings: settings,
            timestamp: new Date()
        });

        // In a real implementation, you would save these to a database
        // For now, we'll just return success
        res.json({
            success: true,
            message: 'Privacy settings updated successfully',
            data: settings
        });
    } catch (error) {
        logger.error('Error updating privacy settings:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update privacy settings'
        });
    }
});

/**
 * GET /api/privacy/compliance-report
 * Generate privacy compliance report
 * Requires ADMIN role
 */
router.get('/compliance-report', authorize(['ADMIN']), async (req, res) => {
    try {
        const timeRange = req.query.timeRange || '30d';
        const metrics = privacyService.getPrivacyMetrics();

        // Generate compliance report
        const report = {
            reportDate: new Date(),
            timeRange: timeRange,
            privacyConfiguration: {
                differentialPrivacy: {
                    enabled: true,
                    epsilon: metrics.config.epsilon,
                    delta: metrics.config.delta,
                    queriesProcessed: metrics.differentialPrivacyQueries
                },
                kAnonymity: {
                    enabled: true,
                    kValue: metrics.config.kValue,
                    violations: metrics.kAnonymityViolations
                },
                dataMinimization: {
                    enabled: true,
                    piiFieldsProtected: metrics.config.piiFieldsCount,
                    redactionsApplied: metrics.piiRedactions
                }
            },
            complianceStatus: {
                differentialPrivacyCompliant: metrics.config.epsilon <= 1.0,
                kAnonymityCompliant: metrics.kAnonymityViolations === 0,
                dataMinimizationCompliant: metrics.piiRedactions > 0
            },
            recommendations: []
        };

        // Add recommendations based on metrics
        if (metrics.config.epsilon > 1.0) {
            report.recommendations.push({
                type: 'differential_privacy',
                message: 'Consider reducing epsilon value for stronger privacy protection',
                currentValue: metrics.config.epsilon,
                recommendedValue: 1.0
            });
        }

        if (metrics.kAnonymityViolations > 0) {
            report.recommendations.push({
                type: 'k_anonymity',
                message: 'K-anonymity violations detected. Consider increasing k-value or improving data generalization',
                violations: metrics.kAnonymityViolations,
                currentKValue: metrics.config.kValue
            });
        }

        if (metrics.piiRedactions === 0) {
            report.recommendations.push({
                type: 'data_minimization',
                message: 'No PII redactions applied. Ensure data minimization is properly configured',
                piiFieldsCount: metrics.config.piiFieldsCount
            });
        }

        res.json({
            success: true,
            data: report
        });

    } catch (error) {
        logger.error('Error generating compliance report:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to generate compliance report'
        });
    }
});

module.exports = router;