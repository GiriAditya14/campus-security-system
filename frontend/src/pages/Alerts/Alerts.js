import React, { useState, useEffect } from 'react';
import { alertsAPI, handleAPIError } from '../../services/api';
import { useAlert } from '../../contexts/AlertContext';
import { useAuth } from '../../contexts/AuthContext';
import LoadingSpinner from '../../components/Common/LoadingSpinner';
import AlertStatistics from '../../components/Alerts/AlertStatistics';
import AlertHistory from '../../components/Alerts/AlertHistory';
import {
  ExclamationTriangleIcon,
  CheckCircleIcon,
  XMarkIcon,
  ClockIcon,
  MapPinIcon,
  UserIcon,
  FunnelIcon,
  ChartBarIcon,
  ArrowPathIcon
} from '@heroicons/react/24/outline';

const Alerts = () => {
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState({});
  const [filters, setFilters] = useState({
    status: 'active',
    severity: '',
    type: ''
  });
  const [stats, setStats] = useState(null);
  const [activeTab, setActiveTab] = useState('active');
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    hasMore: false
  });

  const { showError, showSuccess } = useAlert();
  const { user } = useAuth();

  // Load stats only once on component mount (independent of filters)
  useEffect(() => {
    loadStats();
  }, []);

  // Load alerts when filters change
  useEffect(() => {
    loadAlerts();
  }, [filters]);

  const loadAlerts = async (page = 1) => {
    try {
      setLoading(page === 1);

      const params = {
        page,
        limit: pagination.limit,
        ...filters
      };

      // Remove empty filters
      Object.keys(params).forEach(key => {
        if (!params[key]) delete params[key];
      });

      const response = await alertsAPI.getAll(params);
      const results = response.data.data || [];
      const paginationData = response.data.pagination || {};

      if (page === 1) {
        setAlerts(results);
      } else {
        setAlerts(prev => [...prev, ...results]);
      }

      setPagination({
        page: paginationData.page || 1,
        limit: paginationData.limit || 20,
        total: paginationData.total || 0,
        hasMore: paginationData.hasMore || false
      });

    } catch (error) {
      const errorInfo = handleAPIError(error);
      showError('Error Loading Alerts', errorInfo.message);

      // Set empty state when API fails
      if (page === 1) {
        setAlerts([]);
      }

      setPagination({
        page: 1,
        limit: 20,
        total: 0,
        hasMore: false
      });
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const response = await alertsAPI.getCardsStats();
      const statsData = response.data.data;

      // Use the direct backend data for cards
      setStats({
        active: statsData.active || 0,
        acknowledged: statsData.acknowledged || 0,
        resolved: statsData.resolved || 0,
        dismissed: statsData.dismissed || 0,
        critical: statsData.critical || 0,
        total: statsData.total || 0
      });
    } catch (error) {
      console.error('Error loading alert stats:', error);

      // Fallback to empty stats if API fails
      setStats({
        active: 0,
        acknowledged: 0,
        resolved: 0,
        dismissed: 0,
        critical: 0,
        total: 0
      });
    }
  };

  const handleAlertAction = async (alertId, action) => {
    try {
      setActionLoading(prev => ({ ...prev, [alertId]: action }));

      switch (action) {
        case 'acknowledge':
          await alertsAPI.acknowledge(alertId);
          break;
        case 'resolve':
          await alertsAPI.resolve(alertId);
          break;
        case 'dismiss':
          await alertsAPI.dismiss(alertId);
          break;
        default:
          throw new Error('Invalid action');
      }

      // Update the alert in the list
      setAlerts(prev => prev.map(alert =>
        alert._id === alertId
          ? { ...alert, status: action === 'dismiss' ? 'dismissed' : action === 'resolve' ? 'resolved' : 'acknowledged' }
          : alert
      ));

      showSuccess('Alert Updated', `Alert has been ${action}d successfully`);
      loadStats(); // Reload backend stats after action
      setRefreshTrigger(prev => prev + 1); // Trigger refresh for AlertStatistics component

    } catch (error) {
      const errorInfo = handleAPIError(error);
      showError('Action Failed', errorInfo.message);
    } finally {
      setActionLoading(prev => ({ ...prev, [alertId]: null }));
    }
  };

  const getSeverityColor = (severity) => {
    const colors = {
      LOW: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
      MEDIUM: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
      HIGH: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300',
      CRITICAL: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300'
    };
    return colors[severity] || colors.LOW;
  };

  const getStatusColor = (status) => {
    const colors = {
      active: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
      acknowledged: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
      resolved: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
      dismissed: 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300'
    };
    return colors[status] || colors.active;
  };

  const getAlertIcon = (type) => {
    const icons = {
      INACTIVITY: ClockIcon,
      UNUSUAL_LOCATION: MapPinIcon,
      MULTIPLE_PRESENCE: UserIcon,
      PATTERN_ANOMALY: ChartBarIcon,
      SECURITY_BREACH: ExclamationTriangleIcon,
      SYSTEM_ERROR: ExclamationTriangleIcon
    };
    const IconComponent = icons[type] || ExclamationTriangleIcon;
    return <IconComponent className="h-5 w-5" />;
  };

  const formatTimestamp = (timestamp) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString();
  };

  const canPerformAction = (alert, action) => {
    if (!user) return false;

    const rolePermissions = {
      ADMIN: ['acknowledge', 'resolve', 'dismiss'],
      SECURITY_OFFICER: ['acknowledge', 'resolve', 'dismiss'],
      OPERATOR: ['acknowledge'],
      VIEWER: []
    };

    const allowedActions = rolePermissions[user.role] || [];

    if (alert.status === 'resolved' || alert.status === 'dismissed') {
      return false;
    }

    return allowedActions.includes(action);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="flex-shrink-0">
              <ExclamationTriangleIcon className="h-8 w-8 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Security Alerts
              </h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Monitor and manage security alerts across the campus
              </p>
            </div>
          </div>

          {/* Stats Summary */}
          {stats && (
            <div className="flex items-center space-x-6">
              <div className="text-center">
                <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                  {stats.active || 0}
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  Active
                </div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                  {stats.critical || 0}
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  Critical
                </div>
              </div>
              <div className="flex space-x-2">
                <button
                  onClick={() => loadStats()}
                  className="inline-flex items-center px-3 py-2 border border-gray-300 dark:border-gray-600 shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  title="Refresh Statistics"
                >
                  <ChartBarIcon className="h-4 w-4 mr-1" />
                  Stats
                </button>
                <button
                  onClick={() => loadAlerts(1)}
                  className="inline-flex items-center px-3 py-2 border border-gray-300 dark:border-gray-600 shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  title="Refresh Alerts List"
                >
                  <ArrowPathIcon className="h-4 w-4 mr-1" />
                  Alerts
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
        <div className="border-b border-gray-200 dark:border-gray-700">
          <nav className="flex space-x-8 px-6">
            {[
              { id: 'active', name: 'Active Alerts', icon: ExclamationTriangleIcon },
              { id: 'statistics', name: 'Statistics', icon: ChartBarIcon },
              { id: 'history', name: 'History', icon: ClockIcon }
            ].map(tab => {
              const IconComponent = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center ${activeTab === tab.id
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                >
                  <IconComponent className="h-4 w-4 mr-2" />
                  {tab.name}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Tab Content */}
        {activeTab === 'statistics' && (
          <AlertStatistics timeRange="24h" refreshTrigger={refreshTrigger} />
        )}

        {activeTab === 'history' && (
          <AlertHistory />
        )}

        {activeTab === 'active' && (
          <div className="p-6 space-y-6">
            {/* Stats */}
            {stats && (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <div className="bg-white dark:bg-gray-800 overflow-hidden shadow-lg rounded-xl border border-gray-200 dark:border-gray-700 hover:shadow-xl transition-all duration-200 transform hover:-translate-y-1">
                  <div className="p-6">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-lg flex items-center justify-center">
                          <ExclamationTriangleIcon className="h-6 w-6 text-red-600 dark:text-red-400" />
                        </div>
                      </div>
                      <div className="ml-4 flex-1">
                        <dl>
                          <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
                            Active Alerts
                          </dt>
                          <dd className="text-2xl font-bold text-gray-900 dark:text-white">
                            {stats.active || 0}
                          </dd>
                        </dl>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white dark:bg-gray-800 overflow-hidden shadow-lg rounded-xl border border-gray-200 dark:border-gray-700 hover:shadow-xl transition-all duration-200 transform hover:-translate-y-1">
                  <div className="p-6">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <div className="w-12 h-12 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg flex items-center justify-center">
                          <ClockIcon className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
                        </div>
                      </div>
                      <div className="ml-4 flex-1">
                        <dl>
                          <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
                            Acknowledged
                          </dt>
                          <dd className="text-2xl font-bold text-gray-900 dark:text-white">
                            {stats.acknowledged || 0}
                          </dd>
                        </dl>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white dark:bg-gray-800 overflow-hidden shadow-lg rounded-xl border border-gray-200 dark:border-gray-700 hover:shadow-xl transition-all duration-200 transform hover:-translate-y-1">
                  <div className="p-6">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                          <CheckCircleIcon className="h-6 w-6 text-green-600 dark:text-green-400" />
                        </div>
                      </div>
                      <div className="ml-4 flex-1">
                        <dl>
                          <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
                            Resolved
                          </dt>
                          <dd className="text-2xl font-bold text-gray-900 dark:text-white">
                            {stats.resolved || 0}
                          </dd>
                        </dl>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white dark:bg-gray-800 overflow-hidden shadow-lg rounded-xl border border-gray-200 dark:border-gray-700 hover:shadow-xl transition-all duration-200 transform hover:-translate-y-1">
                  <div className="p-6">
                    <div className="flex items-center">
                      <div className="flex-shrink-0">
                        <div className="w-12 h-12 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center">
                          <ExclamationTriangleIcon className="h-6 w-6 text-orange-600 dark:text-orange-400" />
                        </div>
                      </div>
                      <div className="ml-4 flex-1">
                        <dl>
                          <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
                            Critical
                          </dt>
                          <dd className="text-2xl font-bold text-gray-900 dark:text-white">
                            {stats.critical || 0}
                          </dd>
                        </dl>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Filters */}
            <div className="bg-white dark:bg-gray-800 shadow-lg rounded-xl border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">Filter Alerts</h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <select
                  value={filters.status}
                  onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
                  className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">All Status</option>
                  <option value="active">Active</option>
                  <option value="acknowledged">Acknowledged</option>
                  <option value="resolved">Resolved</option>
                  <option value="dismissed">Dismissed</option>
                </select>

                <select
                  value={filters.severity}
                  onChange={(e) => setFilters(prev => ({ ...prev, severity: e.target.value }))}
                  className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">All Severities</option>
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="CRITICAL">Critical</option>
                </select>

                <select
                  value={filters.type}
                  onChange={(e) => setFilters(prev => ({ ...prev, type: e.target.value }))}
                  className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">All Types</option>
                  <option value="INACTIVITY">Inactivity</option>
                  <option value="UNUSUAL_LOCATION">Unusual Location</option>
                  <option value="MULTIPLE_PRESENCE">Multiple Presence</option>
                  <option value="PATTERN_ANOMALY">Pattern Anomaly</option>
                  <option value="SECURITY_BREACH">Security Breach</option>
                  <option value="SYSTEM_ERROR">System Error</option>
                </select>

                <button
                  onClick={() => setFilters({ status: 'active', severity: '', type: '' })}
                  className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <FunnelIcon className="h-4 w-4 mr-2 inline" />
                  Clear Filters
                </button>
              </div>
            </div>

            {/* Alerts List */}
            <div className="bg-white dark:bg-gray-800 shadow-lg rounded-xl border border-gray-200 dark:border-gray-700">
              {loading && (!alerts || alerts.length === 0) ? (
                <div className="p-8 text-center">
                  <LoadingSpinner size="large" text="Loading alerts..." />
                </div>
              ) : (!alerts || alerts.length === 0) ? (
                <div className="p-8 text-center">
                  <ExclamationTriangleIcon className="mx-auto h-12 w-12 text-gray-400" />
                  <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
                    No alerts found
                  </h3>
                  <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                    No alerts match your current filters
                  </p>
                </div>
              ) : (
                <>
                  <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      Found {pagination.total} alerts
                    </p>
                  </div>

                  <div className="divide-y divide-gray-200 dark:divide-gray-700">
                    {(alerts || []).map((alert) => (
                      <div key={alert._id} className="p-6 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center space-x-3">
                              <div className={`flex-shrink-0 p-2 rounded-full ${getSeverityColor(alert.severity)}`}>
                                {getAlertIcon(alert.type)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-gray-900 dark:text-white">
                                  {alert.title || `${alert.type} Alert`}
                                </p>
                                <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                  {alert.description || 'No description available'}
                                </p>
                              </div>
                            </div>

                            <div className="mt-3 flex items-center space-x-4 text-sm text-gray-500 dark:text-gray-400">
                              <span className="flex items-center">
                                <ClockIcon className="h-4 w-4 mr-1" />
                                {formatTimestamp(alert.triggered_at)}
                              </span>

                              {alert.context?.entity_name && (
                                <span className="flex items-center">
                                  <UserIcon className="h-4 w-4 mr-1" />
                                  {alert.context.entity_name}
                                </span>
                              )}

                              {alert.context?.location?.building && (
                                <span className="flex items-center">
                                  <MapPinIcon className="h-4 w-4 mr-1" />
                                  {alert.context.location.building}
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center space-x-3 ml-4">
                            <div className="flex flex-col items-end space-y-2">
                              <div className="flex items-center space-x-2">
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getSeverityColor(alert.severity)}`}>
                                  {alert.severity}
                                </span>
                                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(alert.status)}`}>
                                  {alert.status}
                                </span>
                              </div>

                              <div className="flex items-center space-x-2">
                                {canPerformAction(alert, 'acknowledge') && alert.status === 'active' && (
                                  <button
                                    onClick={() => handleAlertAction(alert._id, 'acknowledge')}
                                    disabled={actionLoading[alert._id] === 'acknowledge'}
                                    className="inline-flex items-center px-2 py-1 border border-yellow-300 dark:border-yellow-600 text-xs font-medium rounded text-yellow-700 dark:text-yellow-300 bg-yellow-50 dark:bg-yellow-900/30 hover:bg-yellow-100 dark:hover:bg-yellow-900/50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500 disabled:opacity-50"
                                  >
                                    {actionLoading[alert._id] === 'acknowledge' ? (
                                      <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-yellow-700 dark:border-yellow-300"></div>
                                    ) : (
                                      <>
                                        <ClockIcon className="h-3 w-3 mr-1" />
                                        Acknowledge
                                      </>
                                    )}
                                  </button>
                                )}

                                {canPerformAction(alert, 'resolve') && (
                                  <button
                                    onClick={() => handleAlertAction(alert._id, 'resolve')}
                                    disabled={actionLoading[alert._id] === 'resolve'}
                                    className="inline-flex items-center px-2 py-1 border border-green-300 dark:border-green-600 text-xs font-medium rounded text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/30 hover:bg-green-100 dark:hover:bg-green-900/50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500 disabled:opacity-50"
                                  >
                                    {actionLoading[alert._id] === 'resolve' ? (
                                      <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-green-700 dark:border-green-300"></div>
                                    ) : (
                                      <>
                                        <CheckCircleIcon className="h-3 w-3 mr-1" />
                                        Resolve
                                      </>
                                    )}
                                  </button>
                                )}

                                {canPerformAction(alert, 'dismiss') && (
                                  <button
                                    onClick={() => handleAlertAction(alert._id, 'dismiss')}
                                    disabled={actionLoading[alert._id] === 'dismiss'}
                                    className="inline-flex items-center px-2 py-1 border border-gray-300 dark:border-gray-600 text-xs font-medium rounded text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50"
                                  >
                                    {actionLoading[alert._id] === 'dismiss' ? (
                                      <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-gray-700 dark:border-gray-300"></div>
                                    ) : (
                                      <>
                                        <XMarkIcon className="h-3 w-3 mr-1" />
                                        Dismiss
                                      </>
                                    )}
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {pagination.hasMore && (
                    <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700">
                      <button
                        onClick={() => loadAlerts(pagination.page + 1)}
                        disabled={loading}
                        className="w-full flex justify-center items-center px-4 py-2 border border-gray-300 dark:border-gray-600 shadow-sm text-sm font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                      >
                        {loading ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-gray-900 dark:border-gray-300"></div>
                        ) : (
                          `Load More (${pagination.total - (alerts?.length || 0)} remaining)`
                        )}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Alerts;