import axios from 'axios';

// Create axios instance with base configuration
const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5000/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle common errors
api.interceptors.response.use(
  (response) => {
    return response;
  },
  (error) => {
    if (error.response?.status === 401) {
      // Unauthorized - clear token and redirect to login
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    
    return Promise.reject(error);
  }
);

// API service methods
export const authAPI = {
  login: (credentials) => api.post('/auth/login', credentials),
  logout: () => api.post('/auth/logout'),
};

export const entitiesAPI = {
  search: (params) => api.get('/entities/search', { params }),
  getById: (id) => api.get(`/entities/${id}`),
  getTimeline: (id, params) => api.get(`/entities/${id}/timeline`, { params }),
  calculateSimilarity: (entity1Id, entity2Id, algorithm = 'composite') => 
    api.post('/entities/similarity', { entity1Id, entity2Id, algorithm }),
  update: (id, data) => api.put(`/entities/${id}`, data),
  merge: (data) => api.post('/entities/merge', data),
  getStats: () => api.get('/entities/stats'),
};

export const eventsAPI = {
  getAll: (params) => api.get('/events', { params }),
  getById: (id) => api.get(`/events/${id}`),
  create: (data) => api.post('/events', data),
  update: (id, data) => api.put(`/events/${id}`, data),
  delete: (id) => api.delete(`/events/${id}`),
  getStats: (params) => api.get('/events/stats', { params }),
};

export const alertsAPI = {
  getAll: (params) => api.get('/alerts', { params }),
  getById: (id) => api.get(`/alerts/${id}`),
  acknowledge: (id) => api.post(`/alerts/${id}/acknowledge`),
  dismiss: (id) => api.post(`/alerts/${id}/dismiss`),
  resolve: (id) => api.post(`/alerts/${id}/resolve`),
  create: (data) => api.post('/alerts', data),
  getStats: () => api.get('/alerts/stats'),
  getCardsStats: () => api.get('/alerts/cards-stats'),
  getTrends: (params) => api.get('/alerts/trends', { params }),
  getHistory: (params) => api.get('/alerts/history', { params }),
  exportHistory: (params) => api.get('/alerts/export', { 
    params,
    responseType: 'blob'
  }),
  getMetrics: () => api.get('/services/alerts/metrics'),
};

export const usersAPI = {
  getAll: (params) => api.get('/users', { params }),
  getById: (id) => api.get(`/users/${id}`),
  create: (data) => api.post('/users', data),
  update: (id, data) => api.put(`/users/${id}`, data),
  delete: (id) => api.delete(`/users/${id}`),
  updateProfile: (id, data) => api.put(`/users/${id}/profile`, data),
  changePassword: (id, data) => api.put(`/users/${id}/password`, data),
};

export const analyticsAPI = {
  getDashboard: (params) => api.get('/analytics/dashboard', { params }),
  getAnalytics: (params) => api.get('/analytics', { params }),
  getEntityTimeline: (id, params) => api.get(`/analytics/entity/${id}/timeline`, { params }),
  getPredictions: (entityId) => api.get(`/analytics/predictions/${entityId}`),
  getHeatmap: (params) => api.get('/analytics/locations/heatmap', { params }),
  getAnomalies: (params) => api.get('/analytics/anomalies', { params }),
  getPerformance: (params) => api.get('/analytics/performance', { params }),
};

export const auditAPI = {
  getLogs: (params) => api.get('/audit/logs', { params }),
  getStatistics: (params) => api.get('/audit/statistics', { params }),
  getSecurityEvents: (params) => api.get('/audit/security-events', { params }),
  getUserLogs: (userId, params) => api.get(`/audit/user/${userId}`, { params }),
  exportLogs: (params) => api.get('/audit/export', { 
    params,
    responseType: 'blob'
  }),
};

export const privacyAPI = {
  getMetrics: () => api.get('/privacy/metrics'),
  getConfig: () => api.get('/privacy/config'),
  updateConfig: (data) => api.put('/privacy/config', data),
  testKAnonymity: (data) => api.post('/privacy/test-k-anonymity', data),
  applyKAnonymity: (data) => api.post('/privacy/apply-k-anonymity', data),
  testDifferentialPrivacy: (data) => api.post('/privacy/test-differential-privacy', data),
  anonymizeData: (data) => api.post('/privacy/anonymize-data', data),
  generateAnonymousId: (data) => api.post('/privacy/generate-anonymous-id', data),
  clearCache: () => api.delete('/privacy/cache'),
  getComplianceReport: (params) => api.get('/privacy/compliance-report', { params }),
  getSettings: () => api.get('/privacy/settings'),
  updateSettings: (data) => api.put('/privacy/settings', data),
  exportData: (params) => api.get('/privacy/export', { 
    params,
    responseType: 'blob'
  }),
  purgeExpiredData: () => api.post('/privacy/purge-expired'),
};

export const settingsAPI = {
  getSettings: () => api.get('/settings'),
  updateSettings: (data) => api.put('/settings', data),
  updateCategory: (category, data) => api.patch(`/settings/${category}`, data),
  resetSettings: () => api.post('/settings/reset')
};

export const ingestionAPI = {
  ingestCardSwipes: (data) => api.post('/ingestion/card-swipes', data),
  ingestWifiLogs: (data) => api.post('/ingestion/wifi-logs', data),
  ingestCCTVFrames: (data) => api.post('/ingestion/cctv-frames', data),
  ingestHelpdeskTickets: (data) => api.post('/ingestion/helpdesk-tickets', data),
  ingestRSVPs: (data) => api.post('/ingestion/rsvps', data),
  ingestAssetTracking: (data) => api.post('/ingestion/asset-tracking', data),
  getStatus: () => api.get('/ingestion/status'),
  getMetrics: () => api.get('/ingestion/metrics'),
};

export const servicesAPI = {
  // Entity Resolution
  resolveEntities: (data) => api.post('/services/entity-resolution/resolve', data),
  
  // Data Fusion
  fuseData: (data) => api.post('/services/data-fusion/fuse', data),
  
  // Predictions
  predictLocation: (data) => api.post('/services/prediction/location', data),
  predictActivity: (data) => api.post('/services/prediction/activity', data),
  
  // Explainability
  explainPrediction: (data) => api.post('/services/explainability/explain', data),
  
  // RBAC
  getRoles: () => api.get('/services/rbac/roles'),
  getRolePermissions: (role) => api.get(`/services/rbac/permissions/${role}`),
  
  // Manual alerts
  createManualAlert: (data) => api.post('/services/alerts/manual', data),
};

// Utility functions
export const handleAPIError = (error) => {
  if (error.response) {
    // Server responded with error status
    const { status, data } = error.response;
    
    switch (status) {
      case 400:
        return { 
          message: data.error || 'Bad request', 
          type: 'validation' 
        };
      case 401:
        return { 
          message: 'Authentication required', 
          type: 'auth' 
        };
      case 403:
        return { 
          message: 'Access denied', 
          type: 'permission' 
        };
      case 404:
        return { 
          message: 'Resource not found', 
          type: 'notfound' 
        };
      case 429:
        return { 
          message: 'Too many requests. Please try again later.', 
          type: 'ratelimit' 
        };
      case 500:
        return { 
          message: 'Server error. Please try again later.', 
          type: 'server' 
        };
      default:
        return { 
          message: data.error || 'An error occurred', 
          type: 'unknown' 
        };
    }
  } else if (error.request) {
    // Network error
    return { 
      message: 'Network error. Please check your connection.', 
      type: 'network' 
    };
  } else {
    // Other error
    return { 
      message: error.message || 'An unexpected error occurred', 
      type: 'unknown' 
    };
  }
};

export const downloadFile = (blob, filename) => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};

export default api;