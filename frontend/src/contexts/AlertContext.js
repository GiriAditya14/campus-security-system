import React, { createContext, useContext, useState, useCallback } from 'react';

const AlertContext = createContext();

export const useAlert = () => {
  const context = useContext(AlertContext);
  if (!context) {
    throw new Error('useAlert must be used within an AlertProvider');
  }
  return context;
};

export const AlertProvider = ({ children }) => {
  const [alerts, setAlerts] = useState([]);

  const addAlert = useCallback((alert) => {
    const id = Date.now() + Math.random();
    const newAlert = {
      id,
      type: alert.type || 'info', // success, error, warning, info
      title: alert.title || '',
      message: alert.message || '',
      timestamp: alert.timestamp || new Date(),
      persistent: alert.persistent || false, // If true, won't auto-dismiss
      duration: alert.duration || 5000, // Auto-dismiss duration in ms
      actions: alert.actions || [] // Array of action buttons
    };

    setAlerts(prev => [...prev, newAlert]);

    // Auto-dismiss non-persistent alerts
    if (!newAlert.persistent) {
      setTimeout(() => {
        removeAlert(id);
      }, newAlert.duration);
    }

    return id;
  }, []);

  const removeAlert = useCallback((id) => {
    setAlerts(prev => prev.filter(alert => alert.id !== id));
  }, []);

  const clearAllAlerts = useCallback(() => {
    setAlerts([]);
  }, []);

  const updateAlert = useCallback((id, updates) => {
    setAlerts(prev => prev.map(alert => 
      alert.id === id ? { ...alert, ...updates } : alert
    ));
  }, []);

  // Convenience methods for different alert types
  const showSuccess = useCallback((title, message, options = {}) => {
    return addAlert({
      type: 'success',
      title,
      message,
      ...options
    });
  }, [addAlert]);

  const showError = useCallback((title, message, options = {}) => {
    return addAlert({
      type: 'error',
      title,
      message,
      persistent: true, // Errors are persistent by default
      ...options
    });
  }, [addAlert]);

  const showWarning = useCallback((title, message, options = {}) => {
    return addAlert({
      type: 'warning',
      title,
      message,
      ...options
    });
  }, [addAlert]);

  const showInfo = useCallback((title, message, options = {}) => {
    return addAlert({
      type: 'info',
      title,
      message,
      ...options
    });
  }, [addAlert]);

  // Security-specific alert methods
  const showSecurityAlert = useCallback((title, message, severity = 'HIGH') => {
    const alertType = severity === 'CRITICAL' ? 'error' : 'warning';
    
    return addAlert({
      type: alertType,
      title: `🚨 ${title}`,
      message,
      persistent: severity === 'CRITICAL',
      duration: severity === 'CRITICAL' ? 0 : 10000,
      actions: [
        {
          label: 'View Details',
          action: () => {
            // Navigate to alerts page or show details modal
            window.location.href = '/alerts';
          }
        }
      ]
    });
  }, [addAlert]);

  const showSystemAlert = useCallback((title, message, options = {}) => {
    return addAlert({
      type: 'info',
      title: `⚙️ ${title}`,
      message,
      ...options
    });
  }, [addAlert]);

  const showConnectionAlert = useCallback((connected) => {
    if (connected) {
      return showSuccess(
        'Connected',
        'Real-time updates are now available.',
        { duration: 3000 }
      );
    } else {
      return showWarning(
        'Connection Lost',
        'Real-time updates are temporarily unavailable.',
        { persistent: true }
      );
    }
  }, [showSuccess, showWarning]);

  // Alert statistics
  const getAlertStats = useCallback(() => {
    const stats = {
      total: alerts.length,
      byType: {
        success: 0,
        error: 0,
        warning: 0,
        info: 0
      },
      persistent: 0
    };

    alerts.forEach(alert => {
      stats.byType[alert.type]++;
      if (alert.persistent) {
        stats.persistent++;
      }
    });

    return stats;
  }, [alerts]);

  const value = {
    alerts,
    addAlert,
    removeAlert,
    clearAllAlerts,
    updateAlert,
    showSuccess,
    showError,
    showWarning,
    showInfo,
    showSecurityAlert,
    showSystemAlert,
    showConnectionAlert,
    getAlertStats
  };

  return (
    <AlertContext.Provider value={value}>
      {children}
    </AlertContext.Provider>
  );
};