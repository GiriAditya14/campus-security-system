const express = require('express');
const router = express.Router();
const spatialForecastingService = require('../services/spatialForecastingService');
const winston = require('winston');
const { authenticate } = require('../middleware/auth');

const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'logs/spatial-forecasting.log' })
    ]
});

/**
 * @route GET /api/spatial-forecasting
 * @desc Get comprehensive spatial forecasting analysis
 * @access Protected
 */
router.get('/', authenticate, async (req, res) => {
    try {
        const {
            timeRange = '7d',
            zones,
            includePredictions = 'true',
            includeHeatmap = 'true',
            granularity = 'hourly'
        } = req.query;

        const options = {
            timeRange,
            zones: zones ? zones.split(',') : undefined,
            includePredictions: includePredictions === 'true',
            includeHeatmap: includeHeatmap === 'true',
            granularity
        };

        logger.info('Spatial forecasting request', { options, user: req.user?.id });

        const data = await spatialForecastingService.getSpatialForecast(options);
        res.json({
            success: true,
            data: data,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Error in spatial forecasting:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate spatial forecast',
            error: error.message
        });
    }
});

/**
 * @route GET /api/spatial-forecasting/overview
 * @desc Get high-level spatial overview
 * @access Protected
 */
router.get('/overview', authenticate, async (req, res) => {
    try {
        logger.info('Getting spatial overview', { user: req.user?.id });
        
        const overview = await spatialForecastingService.getOverview();
        res.json({
            success: true,
            data: overview,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Error getting overview:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get overview',
            error: error.message
        });
    }
});

/**
 * @route GET /api/spatial-forecasting/zones
 * @desc Get all campus zones with current status
 * @access Protected
 */
router.get('/zones', authenticate, async (req, res) => {
    try {
        logger.info('Getting zones', { user: req.user?.id });
        
        const zones = await spatialForecastingService.getZones(req.query);
        res.json({
            success: true,
            data: zones,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Error getting zones:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get zones',
            error: error.message
        });
    }
});

/**
 * @route GET /api/spatial-forecasting/zone/:zoneId
 * @desc Get detailed information for a specific zone
 * @access Protected
 */
router.get('/zone/:zoneId', authenticate, async (req, res) => {
    try {
        const { zoneId } = req.params;
        logger.info('Getting zone details', { zoneId, user: req.user?.id });
        
        const zoneData = await spatialForecastingService.getZoneDetails(zoneId, req.query);
        res.json({
            success: true,
            data: zoneData,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Error getting zone details:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get zone details',
            error: error.message
        });
    }
});

/**
 * @route GET /api/spatial-forecasting/heatmap
 * @desc Get heatmap data for campus occupancy visualization
 * @access Protected
 */
router.get('/heatmap', authenticate, async (req, res) => {
    try {
        const { timeRange = '24h', intensity = 'medium' } = req.query;
        logger.info('Getting heatmap data', { timeRange, intensity, user: req.user?.id });
        
        const heatmapData = await spatialForecastingService.getHeatmapData({
            timeRange,
            intensity
        });
        
        res.json({
            success: true,
            data: heatmapData,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Error getting heatmap data:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get heatmap data',
            error: error.message
        });
    }
});

/**
 * @route GET /api/spatial-forecasting/predictions
 * @desc Get occupancy predictions for various time horizons
 * @access Protected
 */
router.get('/predictions', authenticate, async (req, res) => {
    try {
        const { horizon = 'next_hour', zones } = req.query;
        logger.info('Getting predictions', { horizon, zones, user: req.user?.id });
        
        const predictions = await spatialForecastingService.getPredictions({
            horizon,
            zones: zones ? zones.split(',') : undefined
        });
        
        res.json({
            success: true,
            data: predictions,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Error getting predictions:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get predictions',
            error: error.message
        });
    }
});

/**
 * @route GET /api/spatial-forecasting/insights
 * @desc Get automated insights and recommendations
 * @access Protected
 */
router.get('/insights', authenticate, async (req, res) => {
    try {
        const { timeRange = '7d' } = req.query;
        logger.info('Getting insights', { timeRange, user: req.user?.id });
        
        const insights = await spatialForecastingService.getInsights({
            timeRange
        });
        
        res.json({
            success: true,
            data: insights,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Error getting insights:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get insights',
            error: error.message
        });
    }
});

/**
 * @route GET /api/spatial-forecasting/patterns
 * @desc Get usage patterns and trends analysis
 * @access Protected
 */
router.get('/patterns', authenticate, async (req, res) => {
    try {
        const { timeRange = '30d', granularity = 'daily' } = req.query;
        logger.info('Getting patterns', { timeRange, granularity, user: req.user?.id });
        
        const patterns = await spatialForecastingService.getPatterns({
            timeRange,
            granularity
        });
        
        res.json({
            success: true,
            data: patterns,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Error getting patterns:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get patterns',
            error: error.message
        });
    }
});

module.exports = router;