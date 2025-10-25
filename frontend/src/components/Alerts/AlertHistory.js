import React, { useState, useEffect } from 'react';
import { 
  ClockIcon, 
  UserIcon, 
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XMarkIcon,
  MagnifyingGlassIcon,
  CalendarIcon,
  FunnelIcon,
  DocumentArrowDownIcon
} from '@heroicons/react/24/outline';
import { alertsAPI, handleAPIError } from '../../services/api';
import { useAlert } from '../../contexts/AlertContext';
import { format, parseISO, isToday, isYesterday } from 'date-fns';

const AlertHistory = ({ entityId = null, className = '' }) => {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    dateRange: '7d',
    status: '',
    severity: '',
    type: '',
    search: ''
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    hasMore: false
  });
  const [selectedAlert, setSelectedAlert] = useState(null);

  const { showError, showSuccess } = useAlert();

  useEffect(() => {
    loadAlertHistory();
  }, [filters, entityId]);

  const loadAlertHistory = async (page = 1) => {
    try {
      setLoading(page === 1);
      
      const params = {
        page,
        limit: pagination.limit,
        ...filters,
        entityId: entityId || undefined
      };

      // Remove empty filters
      Object.keys(params).forEach(key => {
        if (!params[key]) delete params[key];
      });

      const response = await alertsAPI.getHistory(params);
      const { alerts: results, pagination: paginationData } = response.data.data;

      if (page === 1) {
        setAlerts(results);
      } else {
        setAlerts(prev => [...prev, ...results]);
      }

      setPagination({
        page: paginationData.page,
        limit: paginationData.limit,
        total: paginationData.total,
        hasMore: paginationData.hasMore
      });

    } catch (error) {
      const errorInfo = handleAPIError(error);
      showError('Error Loading Alert History', errorInfo.message);
    } finally {
      setLoading(false);
    }
  };

  const exportHistory = async () => {
    try {
      const params = {
        ...filters,
        entityId: entityId || undefined,
        format: 'csv'
      };

      const response = await alertsAPI.exportHistory(params);
      
      // Create download link
      const blob = new Blob([response.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `alert-history-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

    } catch (error) {
      const errorInfo = handleAPIError(error);
      
      // If export endpoint doesn't exist, create a simple CSV from current data
      if (error.response?.status === 404 || errorInfo.message.includes('not a function')) {
        try {
          // Generate CSV from current alerts data
          const csvContent = generateCSVFromAlerts(alerts);
          const blob = new Blob([csvContent], { type: 'text/csv' });
          const url = window.URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `alert-history-${new Date().toISOString().split('T')[0]}.csv`;
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          window.URL.revokeObjectURL(url);
          
          showSuccess('Export Successful', 'Alert history exported as CSV');
        } catch (csvError) {
          showError('Export Failed', 'Unable to export alert history');
        }
      } else {
        showError('Export Failed', errorInfo.message);
      }
    }
  };

  const generateCSVFromAlerts = (alertsData) => {
    const headers = ['ID', 'Title', 'Description', 'Type', 'Severity', 'Status', 'Triggered At', 'Entity', 'Location'];
    const csvRows = [headers.join(',')];
    
    alertsData.forEach(alert => {
      const row = [
        alert._id || '',
        `"${(alert.title || '').replace(/"/g, '""')}"`,
        `"${(alert.description || '').replace(/"/g, '""')}"`,
        alert.type || '',
        alert.severity || '',
        alert.status || '',
        alert.triggered_at ? new Date(alert.triggered_at).toISOString() : '',
        alert.context?.entity_name || '',
        alert.context?.location?.building || ''
      ];
      csvRows.push(row.join(','));
    });
    
    return csvRows.join('\n');
  };

  const getSeverityColor = (severity) => {
    const colors = {
      LOW: 'bg-blue-100 text-blue-800 border-blue-200',
      MEDIUM: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      HIGH: 'bg-orange-100 text-orange-800 border-orange-200',
      CRITICAL: 'bg-red-100 text-red-800 border-red-200'
    };
    return colors[severity] || colors.LOW;
  };

  const getStatusColor = (status) => {
    const colors = {
      active: 'bg-red-100 text-red-800 border-red-200',
      acknowledged: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      resolved: 'bg-green-100 text-green-800 border-green-200',
      dismissed: 'bg-gray-100 text-gray-800 border-gray-200'
    };
    return colors[status] || colors.active;
  };

  const getStatusIcon = (status) => {
    const icons = {
      active: ExclamationTriangleIcon,
      acknowledged: ClockIcon,
      resolved: CheckCircleIcon,
      dismissed: XMarkIcon
    };
    return icons[status] || ExclamationTriangleIcon;
  };

  const formatDate = (dateString) => {
    const date = parseISO(dateString);
    if (isToday(date)) return `Today at ${format(date, 'HH:mm')}`;
    if (isYesterday(date)) return `Yesterday at ${format(date, 'HH:mm')}`;
    return format(date, 'MMM dd, yyyy HH:mm');
  };

  const groupAlertsByDate = (alerts) => {
    const groups = {};
    alerts.forEach(alert => {
      const date = format(parseISO(alert.triggered_at), 'yyyy-MM-dd');
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(alert);
    });
    return groups;
  };

  const formatDateGroup = (dateStr) => {
    const date = parseISO(dateStr);
    if (isToday(date)) return 'Today';
    if (isYesterday(date)) return 'Yesterday';
    return format(date, 'EEEE, MMMM dd, yyyy');
  };

  const groupedAlerts = groupAlertsByDate(alerts);

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 ${className}`}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Alert History
            {entityId && <span className="text-sm font-normal text-gray-500 dark:text-gray-400 ml-2">(Entity Specific)</span>}
          </h3>
          <button
            onClick={exportHistory}
            className="inline-flex items-center px-3 py-2 border border-gray-300 dark:border-gray-600 shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <DocumentArrowDownIcon className="h-4 w-4 mr-2" />
            Export
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {/* Search */}
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search alerts..."
              value={filters.search}
              onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
              className="pl-10 w-full rounded-md border-gray-300 dark:border-gray-600 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
          </div>

          {/* Date Range */}
          <select
            value={filters.dateRange}
            onChange={(e) => setFilters(prev => ({ ...prev, dateRange: e.target.value }))}
            className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-white text-gray-900 dark:bg-gray-700 dark:text-white dark:border-gray-600"
          >
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
            <option value="30d">Last 30 Days</option>
            <option value="90d">Last 90 Days</option>
          </select>

          {/* Status */}
          <select
            value={filters.status}
            onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
            className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-white text-gray-900 dark:bg-gray-700 dark:text-white dark:border-gray-600"
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="acknowledged">Acknowledged</option>
            <option value="resolved">Resolved</option>
            <option value="dismissed">Dismissed</option>
          </select>

          {/* Severity */}
          <select
            value={filters.severity}
            onChange={(e) => setFilters(prev => ({ ...prev, severity: e.target.value }))}
            className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 bg-white text-gray-900 dark:bg-gray-700 dark:text-white dark:border-gray-600"
          >
            <option value="">All Severities</option>
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
            <option value="CRITICAL">Critical</option>
          </select>

          {/* Clear Filters */}
          <button
            onClick={() => setFilters({
              dateRange: '7d',
              status: '',
              severity: '',
              type: '',
              search: ''
            })}
            className="inline-flex items-center px-3 py-2 border border-gray-300 dark:border-gray-600 shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600"
          >
            <FunnelIcon className="h-4 w-4 mr-2" />
            Clear
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="max-h-96 overflow-y-auto">
        {loading ? (
          <div className="p-6">
            <div className="animate-pulse space-y-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex space-x-4">
                  <div className="w-10 h-10 bg-gray-200 rounded-full"></div>
                  <div className="flex-1 space-y-2">
                    <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                    <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : alerts.length === 0 ? (
          <div className="p-6 text-center">
            <ExclamationTriangleIcon className="mx-auto h-12 w-12 text-gray-400" />
            <h3 className="mt-2 text-sm font-medium text-gray-900">No alerts found</h3>
            <p className="mt-1 text-sm text-gray-500">
              No alerts match your current filters
            </p>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {Object.entries(groupedAlerts)
              .sort(([a], [b]) => new Date(b) - new Date(a))
              .map(([date, dayAlerts]) => (
                <div key={date}>
                  {/* Date Header */}
                  <div className="px-6 py-3 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                        {formatDateGroup(date)}
                      </h4>
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {dayAlerts.length} alert{dayAlerts.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>

                  {/* Alerts for this date */}
                  <div className="divide-y divide-gray-100 dark:divide-gray-600">
                    {dayAlerts
                      .sort((a, b) => new Date(b.triggered_at) - new Date(a.triggered_at))
                      .map(alert => {
                        const StatusIcon = getStatusIcon(alert.status);
                        const isSelected = selectedAlert?._id === alert._id;

                        return (
                          <div
                            key={alert._id}
                            className={`px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors ${
                              isSelected ? 'bg-blue-50 dark:bg-blue-900/30 border-l-4 border-blue-500' : ''
                            }`}
                            onClick={() => setSelectedAlert(isSelected ? null : alert)}
                          >
                            <div className="flex items-start space-x-4">
                              {/* Status Icon */}
                              <div className={`flex-shrink-0 p-2 rounded-full ${getSeverityColor(alert.severity)}`}>
                                <StatusIcon className="h-4 w-4" />
                              </div>

                              {/* Alert Content */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between">
                                  <h4 className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                    {alert.title}
                                  </h4>
                                  <div className="flex items-center space-x-2 ml-4">
                                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${getSeverityColor(alert.severity)}`}>
                                      {alert.severity}
                                    </span>
                                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${getStatusColor(alert.status)}`}>
                                      {alert.status}
                                    </span>
                                  </div>
                                </div>

                                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1 truncate">
                                  {alert.description}
                                </p>

                                <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500 dark:text-gray-400">
                                  <span className="flex items-center">
                                    <ClockIcon className="h-3 w-3 mr-1" />
                                    {formatDate(alert.triggered_at)}
                                  </span>
                                  
                                  {alert.context?.entity_name && (
                                    <span className="flex items-center">
                                      <UserIcon className="h-3 w-3 mr-1" />
                                      {alert.context.entity_name}
                                    </span>
                                  )}

                                  {alert.resolved_at && (
                                    <span className="flex items-center">
                                      <CheckCircleIcon className="h-3 w-3 mr-1" />
                                      Resolved: {formatDate(alert.resolved_at)}
                                    </span>
                                  )}
                                </div>

                                {/* Expanded Details */}
                                {isSelected && (
                                  <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                      {/* Alert Details */}
                                      <div>
                                        <h5 className="text-sm font-medium text-gray-900 mb-2">Alert Details</h5>
                                        <div className="space-y-1 text-sm text-gray-600">
                                          <div>Type: {alert.type}</div>
                                          <div>Triggered: {formatDate(alert.triggered_at)}</div>
                                          {alert.acknowledged_at && (
                                            <div>Acknowledged: {formatDate(alert.acknowledged_at)}</div>
                                          )}
                                          {alert.resolved_at && (
                                            <div>Resolved: {formatDate(alert.resolved_at)}</div>
                                          )}
                                          {alert.metadata?.confidence_score && (
                                            <div>Confidence: {(alert.metadata.confidence_score * 100).toFixed(1)}%</div>
                                          )}
                                        </div>
                                      </div>

                                      {/* Context */}
                                      {alert.context && (
                                        <div>
                                          <h5 className="text-sm font-medium text-gray-900 mb-2">Context</h5>
                                          <div className="space-y-1 text-sm text-gray-600">
                                            {alert.context.entity_name && (
                                              <div>Entity: {alert.context.entity_name}</div>
                                            )}
                                            {alert.context.location?.building && (
                                              <div>Location: {alert.context.location.building}</div>
                                            )}
                                            {alert.context.related_events?.length > 0 && (
                                              <div>Related Events: {alert.context.related_events.length}</div>
                                            )}
                                          </div>
                                        </div>
                                      )}
                                    </div>

                                    {/* Actions Taken */}
                                    {alert.actions && alert.actions.length > 0 && (
                                      <div className="mt-4">
                                        <h5 className="text-sm font-medium text-gray-900 mb-2">Actions Taken</h5>
                                        <div className="space-y-1">
                                          {alert.actions.map((action, index) => (
                                            <div key={index} className="flex items-center justify-between text-sm">
                                              <span className="text-gray-600 capitalize">
                                                {action.type}: {action.target}
                                              </span>
                                              <span className={`text-xs font-medium ${
                                                action.status === 'delivered' ? 'text-green-600' :
                                                action.status === 'failed' ? 'text-red-600' :
                                                'text-yellow-600'
                                              }`}>
                                                {action.status}
                                              </span>
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}

                                    {/* Resolution Notes */}
                                    {alert.resolution_notes && (
                                      <div className="mt-4">
                                        <h5 className="text-sm font-medium text-gray-900 mb-2">Resolution Notes</h5>
                                        <p className="text-sm text-gray-600">{alert.resolution_notes}</p>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              ))}

            {/* Load More */}
            {pagination.hasMore && (
              <div className="px-6 py-4 border-t border-gray-200">
                <button
                  onClick={() => loadAlertHistory(pagination.page + 1)}
                  disabled={loading}
                  className="w-full flex justify-center items-center px-4 py-2 border border-gray-300 shadow-sm text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                >
                  {loading ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900"></div>
                  ) : (
                    `Load More (${pagination.total - alerts.length} remaining)`
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AlertHistory;