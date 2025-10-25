import React, { createContext, useContext, useEffect, useState } from 'react';
import io from 'socket.io-client';
import { useAuth } from './AuthContext';
import { useAlert } from './AlertContext';

const SocketContext = createContext();

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const { user, token } = useAuth();
  const { addAlert } = useAlert();

  useEffect(() => {
    if (!user || !token) {
      return;
    }

    // Create socket connection
    const newSocket = io(process.env.REACT_APP_API_URL || 'http://localhost:3001', {
      transports: ['websocket'],
      upgrade: true,
      rememberUpgrade: true,
      timeout: 20000,
      forceNew: true
    });

    // Connection event handlers
    newSocket.on('connect', () => {
      console.log('Socket connected:', newSocket.id);
      setConnected(true);
      setReconnecting(false);
      
      // Authenticate with the server
      newSocket.emit('authenticate', token);
    });

    newSocket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
      setConnected(false);
      
      if (reason === 'io server disconnect') {
        // Server disconnected, need to reconnect manually
        newSocket.connect();
      }
    });

    newSocket.on('reconnect', (attemptNumber) => {
      console.log('Socket reconnected after', attemptNumber, 'attempts');
      setConnected(true);
      setReconnecting(false);
    });

    newSocket.on('reconnect_attempt', (attemptNumber) => {
      console.log('Socket reconnection attempt:', attemptNumber);
      setReconnecting(true);
    });

    newSocket.on('reconnect_error', (error) => {
      console.error('Socket reconnection error:', error);
    });

    newSocket.on('reconnect_failed', () => {
      console.error('Socket reconnection failed');
      setReconnecting(false);
      addAlert({
        type: 'error',
        title: 'Connection Failed',
        message: 'Unable to connect to real-time updates. Please refresh the page.'
      });
    });

    // Authentication response
    newSocket.on('authenticated', (data) => {
      console.log('Socket authenticated:', data);
      
      // Subscribe to alerts by default
      newSocket.emit('subscribe_alerts');
    });

    newSocket.on('authentication_error', (error) => {
      console.error('Socket authentication error:', error);
      addAlert({
        type: 'error',
        title: 'Authentication Error',
        message: 'Failed to authenticate real-time connection.'
      });
    });

    // Real-time event handlers
    newSocket.on('new_alert', (alertData) => {
      console.log('New alert received:', alertData);
      
      addAlert({
        type: getSeverityType(alertData.severity),
        title: alertData.title,
        message: alertData.description,
        timestamp: alertData.timestamp,
        persistent: alertData.severity === 'CRITICAL'
      });
    });

    newSocket.on('alert_notification', (notification) => {
      console.log('Alert notification received:', notification);
      
      // Handle different types of alert notifications
      if (notification.type === 'SECURITY_BREACH') {
        addAlert({
          type: 'error',
          title: 'Security Breach Detected',
          message: notification.description,
          persistent: true
        });
      }
    });

    newSocket.on('entity_data_updated', (data) => {
      console.log('Entity data updated:', data);
      
      // Emit custom event for components to listen to
      window.dispatchEvent(new CustomEvent('entityUpdated', {
        detail: data
      }));
    });

    newSocket.on('entities_updated', (data) => {
      console.log('Entities updated:', data);
      
      if (data.type === 'merge') {
        addAlert({
          type: 'info',
          title: 'Entities Merged',
          message: `${data.entities.length} entities have been merged.`
        });
      }
      
      // Emit custom event
      window.dispatchEvent(new CustomEvent('entitiesUpdated', {
        detail: data
      }));
    });

    newSocket.on('prediction_update', (data) => {
      console.log('Prediction update received:', data);
      
      // Emit custom event
      window.dispatchEvent(new CustomEvent('predictionUpdated', {
        detail: data
      }));
    });

    // Error handling
    newSocket.on('error', (error) => {
      console.error('Socket error:', error);
      addAlert({
        type: 'error',
        title: 'Connection Error',
        message: 'Real-time connection error occurred.'
      });
    });

    setSocket(newSocket);

    // Cleanup on unmount
    return () => {
      console.log('Cleaning up socket connection');
      newSocket.disconnect();
      setSocket(null);
      setConnected(false);
    };
  }, [user, token, addAlert]);

  // Helper function to convert severity to alert type
  const getSeverityType = (severity) => {
    switch (severity) {
      case 'CRITICAL':
        return 'error';
      case 'HIGH':
        return 'warning';
      case 'MEDIUM':
        return 'info';
      case 'LOW':
        return 'success';
      default:
        return 'info';
    }
  };

  // Socket utility functions
  const subscribeToEntityUpdates = (entityId) => {
    if (socket && connected) {
      socket.emit('subscribe_entity_updates', entityId);
    }
  };

  const unsubscribeFromEntityUpdates = (entityId) => {
    if (socket && connected) {
      socket.emit('unsubscribe_entity_updates', entityId);
    }
  };

  const subscribeToAlerts = () => {
    if (socket && connected) {
      socket.emit('subscribe_alerts');
    }
  };

  const unsubscribeFromAlerts = () => {
    if (socket && connected) {
      socket.emit('unsubscribe_alerts');
    }
  };

  // Send custom events
  const emitEvent = (eventName, data) => {
    if (socket && connected) {
      socket.emit(eventName, data);
    }
  };

  // Listen to custom events
  const onEvent = (eventName, callback) => {
    if (socket) {
      socket.on(eventName, callback);
      
      // Return cleanup function
      return () => {
        socket.off(eventName, callback);
      };
    }
  };

  const value = {
    socket,
    connected,
    reconnecting,
    subscribeToEntityUpdates,
    unsubscribeFromEntityUpdates,
    subscribeToAlerts,
    unsubscribeFromAlerts,
    emitEvent,
    onEvent
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
};