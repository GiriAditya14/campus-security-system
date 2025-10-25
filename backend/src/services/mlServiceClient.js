const axios = require('axios');
const logger = require('../utils/logger');

class MLServiceClient {
  constructor() {
    this.baseURL = process.env.ML_SERVICE_URL || 'http://localhost:8001';
    this.timeout = parseInt(process.env.ML_SERVICE_TIMEOUT) || 30000;
    this.retries = parseInt(process.env.ML_SERVICE_RETRIES) || 3;
    
    this.client = axios.create({
      baseURL: this.baseURL,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Add request/response interceptors for logging
    this.client.interceptors.request.use(
      (config) => {
        logger.info(`ML Service Request: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        logger.error('ML Service Request Error:', error);
        return Promise.reject(error);
      }
    );

    this.client.interceptors.response.use(
      (response) => {
        logger.info(`ML Service Response: ${response.status} ${response.config.url}`);
        return response;
      },
      (error) => {
        logger.error('ML Service Response Error:', {
          url: error.config?.url,
          status: error.response?.status,
          message: error.message
        });
        return Promise.reject(error);
      }
    );
  }

  /**
   * Check if ML service is healthy
   */
  async healthCheck() {
    try {
      const response = await this.client.get('/health');
      return {
        healthy: true,
        data: response.data
      };
    } catch (error) {
      logger.error('ML Service health check failed:', error.message);
      return {
        healthy: false,
        error: error.message
      };
    }
  }

  /**
   * Calculate similarity between two entity records
   */
  async calculateSimilarity(record1, record2, algorithm = 'composite') {
    try {
      const response = await this.client.post('/similarity/calculate', {
        record1,
        record2,
        algorithm
      });
      
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      logger.error('Similarity calculation failed:', error.message);
      return {
        success: false,
        error: error.message,
        data: null
      };
    }
  }

  /**
   * Predict next location for an entity
   */
  async predictLocation(entityId, currentTime, historicalData) {
    try {
      const response = await this.client.post('/prediction/location', {
        entity_id: entityId,
        current_time: currentTime,
        historical_data: historicalData
      });
      
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      logger.error('Location prediction failed:', error.message);
      return {
        success: false,
        error: error.message,
        data: null
      };
    }
  }

  /**
   * Predict current activity based on context
   */
  async predictActivity(entityId, currentTime, location, historicalPatterns = []) {
    try {
      const response = await this.client.post('/prediction/activity', {
        entity_id: entityId,
        current_time: currentTime,
        location,
        historical_patterns: historicalPatterns
      });
      
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      logger.error('Activity prediction failed:', error.message);
      return {
        success: false,
        error: error.message,
        data: null
      };
    }
  }

  /**
   * Match face embedding against known faces
   */
  async matchFace(faceEmbedding, threshold = 0.8) {
    try {
      const response = await this.client.post('/face/match', {
        face_embedding: faceEmbedding,
        threshold
      });
      
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      logger.error('Face matching failed:', error.message);
      return {
        success: false,
        error: error.message,
        data: null
      };
    }
  }

  /**
   * Batch entity resolution for multiple records
   */
  async batchEntityResolution(entities) {
    try {
      const response = await this.client.post('/batch/entity-resolution', entities);
      
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      logger.error('Batch entity resolution failed:', error.message);
      return {
        success: false,
        error: error.message,
        data: null
      };
    }
  }

  /**
   * Get model performance metrics
   */
  async getModelPerformance() {
    try {
      const response = await this.client.get('/analytics/model-performance');
      
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      logger.error('Failed to get model performance:', error.message);
      return {
        success: false,
        error: error.message,
        data: null
      };
    }
  }

  /**
   * Retry mechanism for failed requests
   */
  async withRetry(operation, maxRetries = this.retries) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        if (attempt === maxRetries) {
          break;
        }
        
        // Exponential backoff
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        logger.warn(`ML Service request failed (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms...`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  }

  /**
   * Enhanced similarity calculation with retry
   */
  async calculateSimilarityWithRetry(record1, record2, algorithm = 'composite') {
    return this.withRetry(() => this.calculateSimilarity(record1, record2, algorithm));
  }

  /**
   * Enhanced location prediction with retry
   */
  async predictLocationWithRetry(entityId, currentTime, historicalData) {
    return this.withRetry(() => this.predictLocation(entityId, currentTime, historicalData));
  }

  /**
   * Enhanced activity prediction with retry
   */
  async predictActivityWithRetry(entityId, currentTime, location, historicalPatterns) {
    return this.withRetry(() => this.predictActivity(entityId, currentTime, location, historicalPatterns));
  }

  /**
   * Enhanced face matching with retry
   */
  async matchFaceWithRetry(faceEmbedding, threshold = 0.8) {
    return this.withRetry(() => this.matchFace(faceEmbedding, threshold));
  }

  /**
   * Enhanced batch processing with retry
   */
  async batchEntityResolutionWithRetry(entities) {
    return this.withRetry(() => this.batchEntityResolution(entities));
  }
}

// Create singleton instance
const mlServiceClient = new MLServiceClient();

module.exports = mlServiceClient;