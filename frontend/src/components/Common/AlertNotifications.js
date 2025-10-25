import React from 'react';
import { useAlert } from '../../contexts/AlertContext';
import { 
  CheckCircleIcon, 
  ExclamationCircleIcon, 
  ExclamationTriangleIcon, 
  InformationCircleIcon,
  XMarkIcon 
} from '@heroicons/react/24/outline';

const AlertNotifications = () => {
  const { alerts, removeAlert } = useAlert();

  if (alerts.length === 0) {
    return null;
  }

  const getAlertIcon = (type) => {
    const iconClass = "w-5 h-5";
    
    switch (type) {
      case 'success':
        return <CheckCircleIcon className={`${iconClass} text-green-500`} />;
      case 'error':
        return <ExclamationCircleIcon className={`${iconClass} text-red-500`} />;
      case 'warning':
        return <ExclamationTriangleIcon className={`${iconClass} text-yellow-500`} />;
      case 'info':
      default:
        return <InformationCircleIcon className={`${iconClass} text-blue-500`} />;
    }
  };

  const getAlertStyles = (type) => {
    const baseStyles = "border-l-4 p-4 shadow-lg rounded-r-lg";
    
    switch (type) {
      case 'success':
        return `${baseStyles} bg-green-50 border-green-400 dark:bg-green-900 dark:border-green-600`;
      case 'error':
        return `${baseStyles} bg-red-50 border-red-400 dark:bg-red-900 dark:border-red-600`;
      case 'warning':
        return `${baseStyles} bg-yellow-50 border-yellow-400 dark:bg-yellow-900 dark:border-yellow-600`;
      case 'info':
      default:
        return `${baseStyles} bg-blue-50 border-blue-400 dark:bg-blue-900 dark:border-blue-600`;
    }
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString();
  };

  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-sm w-full">
      {alerts.map((alert) => (
        <div
          key={alert.id}
          className={`${getAlertStyles(alert.type)} transform transition-all duration-300 ease-in-out`}
        >
          <div className="flex items-start">
            <div className="flex-shrink-0">
              {getAlertIcon(alert.type)}
            </div>
            
            <div className="ml-3 flex-1">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium text-gray-900 dark:text-gray-100">
                  {alert.title}
                </h4>
                
                <div className="flex items-center space-x-2">
                  {alert.timestamp && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {formatTimestamp(alert.timestamp)}
                    </span>
                  )}
                  
                  <button
                    onClick={() => removeAlert(alert.id)}
                    className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                  >
                    <XMarkIcon className="w-4 h-4" />
                  </button>
                </div>
              </div>
              
              {alert.message && (
                <p className="mt-1 text-sm text-gray-700 dark:text-gray-300">
                  {alert.message}
                </p>
              )}
              
              {alert.actions && alert.actions.length > 0 && (
                <div className="mt-2 flex space-x-2">
                  {alert.actions.map((action, index) => (
                    <button
                      key={index}
                      onClick={() => {
                        action.action();
                        if (!alert.persistent) {
                          removeAlert(alert.id);
                        }
                      }}
                      className="text-xs bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded px-2 py-1 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

export default AlertNotifications;