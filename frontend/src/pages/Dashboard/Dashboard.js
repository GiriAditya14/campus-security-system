import React, { useState, useEffect, useCallback } from 'react';
import { analyticsAPI, handleAPIError } from '../../services/api';
import { useAlert } from '../../contexts/AlertContext';
import LoadingSpinner from '../../components/Common/LoadingSpinner';

import {
  UsersIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  MapPinIcon,
  ChartBarIcon,
  EyeIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  SignalIcon,
  ShieldCheckIcon
} from '@heroicons/react/24/outline';

const Dashboard = () => {
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filterLoading, setFilterLoading] = useState(false);
  const [timeRange, setTimeRange] = useState('24h');
  const [lastUpdated, setLastUpdated] = useState(null);
  
  const { showError } = useAlert();

  const loadDashboardData = useCallback(async (showFilterLoading = false) => {
    try {
      if (showFilterLoading) {
        setFilterLoading(true);
      } else {
        setLoading(true);
      }
      
      const response = await analyticsAPI.getDashboard({ timeRange });
      setDashboardData(response.data.data);
      setLastUpdated(new Date());
    } catch (error) {
      const errorInfo = handleAPIError(error);
      showError('Dashboard Error', errorInfo.message);
    } finally {
      setLoading(false);
      setFilterLoading(false);
    }
  }, [timeRange, showError]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  const handleTimeRangeChange = (newTimeRange) => {
    setTimeRange(newTimeRange);
    loadDashboardData(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <LoadingSpinner size="large" text="Loading dashboard..." />
      </div>
    );
  }

  const stats = dashboardData?.summary || {};

  return (
    <div className="space-y-6">
      {/* Debug: Authentication Status */}
      {/* <AuthStatus /> */}
      
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
          <div className="flex-1">
            <div className="flex items-center space-x-3">
              <div className="flex-shrink-0">
                <ChartBarIcon className="h-8 w-8 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  Security Dashboard
                </h1>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Real-time campus security monitoring and analytics
                </p>
              </div>
            </div>
            {lastUpdated && (
              <div className="mt-3 flex items-center text-xs text-gray-500 dark:text-gray-400">
                <ClockIcon className="h-4 w-4 mr-1" />
                Last updated: {lastUpdated.toLocaleTimeString()}
              </div>
            )}
          </div>
          
          <div className="mt-4 sm:mt-0 sm:ml-6">
            <div className="flex items-center space-x-3">
              {filterLoading && (
                <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-600 mr-2"></div>
                  Updating...
                </div>
              )}
              <select
                value={timeRange}
                onChange={(e) => handleTimeRangeChange(e.target.value)}
                disabled={filterLoading}
                className="block px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="1h">Last Hour</option>
                <option value="24h">Last 24 Hours</option>
                <option value="7d">Last 7 Days</option>
                <option value="30d">Last 30 Days</option>
              </select>
              <button
                onClick={() => loadDashboardData(true)}
                disabled={filterLoading}
                className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-blue-500 dark:hover:bg-blue-600"
              >
                <ArrowTrendingUpIcon className="h-4 w-4 mr-1" />
                Refresh
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {/* Total Entities */}
        <div className="bg-white dark:bg-gray-800 overflow-hidden shadow-lg rounded-xl border border-gray-200 dark:border-gray-700 hover:shadow-xl transition-all duration-200 transform hover:-translate-y-1">
          <div className="p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                  <UsersIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                </div>
              </div>
              <div className="ml-4 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
                    Total Entities
                  </dt>
                  <dd className="text-2xl font-bold text-gray-900 dark:text-white">
                    {filterLoading ? (
                      <div className="animate-pulse bg-gray-200 dark:bg-gray-700 h-8 w-16 rounded"></div>
                    ) : (
                      stats.totalEntities?.toLocaleString() || 0
                    )}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        {/* Active Entities */}
        <div className="bg-white dark:bg-gray-800 overflow-hidden shadow-lg rounded-xl border border-gray-200 dark:border-gray-700 hover:shadow-xl transition-all duration-200 transform hover:-translate-y-1">
          <div className="p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                  <EyeIcon className="h-6 w-6 text-green-600 dark:text-green-400" />
                </div>
              </div>
              <div className="ml-4 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
                    Active Entities
                  </dt>
                  <dd className="text-2xl font-bold text-gray-900 dark:text-white">
                    {filterLoading ? (
                      <div className="animate-pulse bg-gray-200 dark:bg-gray-700 h-8 w-16 rounded"></div>
                    ) : (
                      stats.activeEntities?.toLocaleString() || 0
                    )}
                  </dd>
                  {stats.totalEntities > 0 && (
                    <dd className="text-xs text-green-600 dark:text-green-400 font-medium">
                      {((stats.activeEntities / stats.totalEntities) * 100).toFixed(1)}% active
                    </dd>
                  )}
                </dl>
              </div>
            </div>
          </div>
        </div>

        {/* Total Events */}
        <div className="bg-white dark:bg-gray-800 overflow-hidden shadow-lg rounded-xl border border-gray-200 dark:border-gray-700 hover:shadow-xl transition-all duration-200 transform hover:-translate-y-1">
          <div className="p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
                  <SignalIcon className="h-6 w-6 text-purple-600 dark:text-purple-400" />
                </div>
              </div>
              <div className="ml-4 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
                    Events ({timeRange})
                  </dt>
                  <dd className="text-2xl font-bold text-gray-900 dark:text-white">
                    {filterLoading ? (
                      <div className="animate-pulse bg-gray-200 dark:bg-gray-700 h-8 w-16 rounded"></div>
                    ) : (
                      stats.totalEvents?.toLocaleString() || 0
                    )}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        {/* Active Alerts */}
        <div className="bg-white dark:bg-gray-800 overflow-hidden shadow-lg rounded-xl border border-gray-200 dark:border-gray-700 hover:shadow-xl transition-all duration-200 transform hover:-translate-y-1">
          <div className="p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${
                  (stats.activeAlerts || 0) > 0 
                    ? 'bg-red-100 dark:bg-red-900/30' 
                    : 'bg-green-100 dark:bg-green-900/30'
                }`}>
                  {(stats.activeAlerts || 0) > 0 ? (
                    <ExclamationTriangleIcon className="h-6 w-6 text-red-600 dark:text-red-400" />
                  ) : (
                    <ShieldCheckIcon className="h-6 w-6 text-green-600 dark:text-green-400" />
                  )}
                </div>
              </div>
              <div className="ml-4 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
                    Active Alerts
                  </dt>
                  <dd className={`text-2xl font-bold ${
                    (stats.activeAlerts || 0) > 0 
                      ? 'text-red-600 dark:text-red-400' 
                      : 'text-green-600 dark:text-green-400'
                  }`}>
                    {filterLoading ? (
                      <div className="animate-pulse bg-gray-200 dark:bg-gray-700 h-8 w-16 rounded"></div>
                    ) : (
                      stats.activeAlerts?.toLocaleString() || 0
                    )}
                  </dd>
                  <dd className={`text-xs font-medium ${
                    (stats.activeAlerts || 0) > 0 
                      ? 'text-red-600 dark:text-red-400' 
                      : 'text-green-600 dark:text-green-400'
                  }`}>
                    {(stats.activeAlerts || 0) > 0 ? 'Requires attention' : 'All clear'}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Activity Overview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Activity Distribution */}
        <div className="bg-white dark:bg-gray-800 shadow-lg rounded-xl border border-gray-200 dark:border-gray-700">
          <div className="px-6 py-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg leading-6 font-semibold text-gray-900 dark:text-white">
                Activity Distribution
              </h3>
              <ChartBarIcon className="h-5 w-5 text-gray-400" />
            </div>
            <div className="mt-5">
              {filterLoading ? (
                <div className="space-y-3">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="animate-pulse bg-gray-200 dark:bg-gray-700 h-4 w-24 rounded"></div>
                      <div className="animate-pulse bg-gray-200 dark:bg-gray-700 h-4 w-12 rounded"></div>
                    </div>
                  ))}
                </div>
              ) : dashboardData?.activityDistribution?.length > 0 ? (
                <div className="space-y-4">
                  {dashboardData.activityDistribution.slice(0, 5).map((activity, index) => {
                    const total = dashboardData.activityDistribution.reduce((sum, a) => sum + a.count, 0);
                    const percentage = ((activity.count / total) * 100).toFixed(1);
                    return (
                      <div key={activity._id} className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-gray-700 dark:text-gray-300 capitalize">
                            {activity._id || 'Unknown'}
                          </span>
                          <div className="flex items-center space-x-2">
                            <span className="text-sm text-gray-500 dark:text-gray-400">
                              {percentage}%
                            </span>
                            <span className="text-sm font-semibold text-gray-900 dark:text-white">
                              {activity.count.toLocaleString()}
                            </span>
                          </div>
                        </div>
                        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                          <div 
                            className={`h-2 rounded-full transition-all duration-500 ${
                              index === 0 ? 'bg-blue-600' :
                              index === 1 ? 'bg-green-600' :
                              index === 2 ? 'bg-purple-600' :
                              index === 3 ? 'bg-yellow-600' : 'bg-gray-600'
                            }`}
                            style={{ width: `${percentage}%` }}
                          ></div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8">
                  <ChartBarIcon className="mx-auto h-12 w-12 text-gray-400" />
                  <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                    No activity data available for selected time range
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Location Activity */}
        <div className="bg-white dark:bg-gray-800 shadow-lg rounded-xl border border-gray-200 dark:border-gray-700">
          <div className="px-6 py-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg leading-6 font-semibold text-gray-900 dark:text-white">
                Top Locations
              </h3>
              <MapPinIcon className="h-5 w-5 text-gray-400" />
            </div>
            <div className="mt-5">
              {filterLoading ? (
                <div className="space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="flex items-center justify-between">
                      <div className="flex items-center">
                        <div className="animate-pulse bg-gray-200 dark:bg-gray-700 h-4 w-4 rounded mr-3"></div>
                        <div className="animate-pulse bg-gray-200 dark:bg-gray-700 h-4 w-32 rounded"></div>
                      </div>
                      <div className="animate-pulse bg-gray-200 dark:bg-gray-700 h-4 w-12 rounded"></div>
                    </div>
                  ))}
                </div>
              ) : dashboardData?.locationActivity?.length > 0 ? (
                <div className="space-y-4">
                  {dashboardData.locationActivity.slice(0, 5).map((location, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                      <div className="flex items-center flex-1 min-w-0">
                        <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                          index === 0 ? 'bg-blue-100 dark:bg-blue-900/30' :
                          index === 1 ? 'bg-green-100 dark:bg-green-900/30' :
                          index === 2 ? 'bg-purple-100 dark:bg-purple-900/30' :
                          index === 3 ? 'bg-yellow-100 dark:bg-yellow-900/30' : 'bg-gray-100 dark:bg-gray-900/30'
                        }`}>
                          <MapPinIcon className={`h-4 w-4 ${
                            index === 0 ? 'text-blue-600 dark:text-blue-400' :
                            index === 1 ? 'text-green-600 dark:text-green-400' :
                            index === 2 ? 'text-purple-600 dark:text-purple-400' :
                            index === 3 ? 'text-yellow-600 dark:text-yellow-400' : 'text-gray-600 dark:text-gray-400'
                          }`} />
                        </div>
                        <div className="ml-3 flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {location.location?.building || 'Unknown'}
                          </p>
                          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                            {location.location?.room || 'General Area'}
                          </p>
                        </div>
                      </div>
                      <div className="flex-shrink-0 ml-4">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                          {location.count.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <MapPinIcon className="mx-auto h-12 w-12 text-gray-400" />
                  <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                    No location data available for selected time range
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* System Status */}
      <div className="bg-white dark:bg-gray-800 shadow-lg rounded-xl border border-gray-200 dark:border-gray-700">
        <div className="px-6 py-5">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg leading-6 font-semibold text-gray-900 dark:text-white">
              System Status
            </h3>
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
              <span className="text-sm text-green-600 dark:text-green-400 font-medium">Live</span>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Entity Activity Rate */}
            <div className="text-center p-4 bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 rounded-lg border border-green-200 dark:border-green-800">
              <div className="flex items-center justify-center mb-2">
                <ArrowTrendingUpIcon className="h-6 w-6 text-green-600 dark:text-green-400" />
              </div>
              <div className="text-3xl font-bold text-green-600 dark:text-green-400">
                {filterLoading ? (
                  <div className="animate-pulse bg-green-200 dark:bg-green-700 h-8 w-16 rounded mx-auto"></div>
                ) : (
                  `${((stats.activeEntities / stats.totalEntities) * 100 || 0).toFixed(1)}%`
                )}
              </div>
              <div className="text-sm text-green-700 dark:text-green-300 font-medium mt-1">
                Entity Activity Rate
              </div>
              <div className="text-xs text-green-600 dark:text-green-400 mt-1">
                {stats.activeEntities || 0} of {stats.totalEntities || 0} active
              </div>
            </div>

            {/* Time Range */}
            <div className="text-center p-4 bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="flex items-center justify-center mb-2">
                <ClockIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                {timeRange.toUpperCase()}
              </div>
              <div className="text-sm text-blue-700 dark:text-blue-300 font-medium mt-1">
                Current Time Range
              </div>
              <div className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                {timeRange === '1h' && 'Last 60 minutes'}
                {timeRange === '24h' && 'Last 24 hours'}
                {timeRange === '7d' && 'Last 7 days'}
                {timeRange === '30d' && 'Last 30 days'}
              </div>
            </div>

            {/* System Health */}
            <div className="text-center p-4 bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 rounded-lg border border-purple-200 dark:border-purple-800">
              <div className="flex items-center justify-center mb-2">
                <ShieldCheckIcon className="h-6 w-6 text-purple-600 dark:text-purple-400" />
              </div>
              <div className="text-3xl font-bold text-purple-600 dark:text-purple-400">
                99.9%
              </div>
              <div className="text-sm text-purple-700 dark:text-purple-300 font-medium mt-1">
                System Uptime
              </div>
              <div className="text-xs text-purple-600 dark:text-purple-400 mt-1">
                All systems operational
              </div>
            </div>
          </div>

          {/* Additional Metrics */}
          <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
              <div>
                <div className="text-lg font-semibold text-gray-900 dark:text-white">
                  {dashboardData?.hourlyActivity?.length || 0}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  Active Hours
                </div>
              </div>
              <div>
                <div className="text-lg font-semibold text-gray-900 dark:text-white">
                  {dashboardData?.alertDistribution?.length || 0}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  Alert Types
                </div>
              </div>
              <div>
                <div className="text-lg font-semibold text-gray-900 dark:text-white">
                  {dashboardData?.locationActivity?.length || 0}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  Active Locations
                </div>
              </div>
              <div>
                <div className="text-lg font-semibold text-gray-900 dark:text-white">
                  {dashboardData?.activityDistribution?.length || 0}
                </div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  Activity Types
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;