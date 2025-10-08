import { useState, useEffect } from 'react';
import { 
  ChartBarIcon, 
  ArrowTrendingUpIcon, 
  ArrowTrendingDownIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  CalendarIcon
} from '@heroicons/react/24/outline';
import { alertsAPI, handleAPIError } from '../../services/api';
import { useAlert } from '../../contexts/AlertContext';

const AlertStatistics = ({ timeRange = '24h', className = '', refreshTrigger }) => {
  const [stats, setStats] = useState(null);
  const [trends, setTrends] = useState(null);
  const [loading, setLoading] = useState(true);
  
  const { showError } = useAlert();

  useEffect(() => {
    loadStatistics();
  }, [timeRange, refreshTrigger]);

  const loadStatistics = async () => {
    try {
      setLoading(true);
      
      // Use both endpoints to get comprehensive data
      const [statsResponse, cardsResponse, trendsResponse] = await Promise.all([
        alertsAPI.getStats(),
        alertsAPI.getCardsStats(),
        alertsAPI.getTrends({ timeRange })
      ]);
      
      const backendStats = statsResponse.data.data;
      const cardsStats = cardsResponse.data.data;
      
      console.log('Backend Stats:', backendStats);
      console.log('Cards Stats:', cardsStats);
      
      // Transform backend data to match component expectations
      const transformedStats = {
        totals: {
          total: cardsStats?.total || backendStats?.totals?.total || 0,
          active: cardsStats?.active || backendStats?.totals?.active || 0,
          last24h: backendStats?.totals?.last24h || 0,
          last7d: backendStats?.totals?.last7d || 0
        },
        resolution: {
          totalResolved: cardsStats?.resolved || backendStats?.resolution?.totalResolved || 0,
          avgResolutionTime: backendStats?.resolution?.avgResolutionTime || 0
        },
        distribution: backendStats?.distribution || { severity: {}, type: [] },
        // Add computed properties for easier access
        byType: backendStats?.distribution?.type?.reduce((acc, item) => {
          acc[item._id] = item.count;
          return acc;
        }, {}) || {},
        bySeverity: backendStats?.distribution?.severity || {},
        total: cardsStats?.total || backendStats?.totals?.total || 0,
        // Add cards data for direct access
        cards: cardsStats || {}
      };
      
      console.log('Transformed Stats:', transformedStats);
      
      setStats(transformedStats);
      setTrends(trendsResponse.data.data);
    } catch (error) {
      console.error('Error loading statistics:', error);
      const errorInfo = handleAPIError(error);
      showError('Error Loading Statistics', errorInfo.message);
      
      // Set empty stats on error
      setStats({
        totals: { total: 0, active: 0, last24h: 0, last7d: 0 },
        resolution: { totalResolved: 0, avgResolutionTime: 0 },
        distribution: { severity: {}, type: [] },
        byType: {},
        bySeverity: {},
        total: 0,
        cards: {}
      });
    } finally {
      setLoading(false);
    }
  };

  const formatTrend = (trend) => {
    if (!trend) return { icon: null, color: 'text-gray-500', text: 'No data' };
    
    const percentage = Math.abs(trend.percentage || 0);
    const isIncrease = trend.direction === 'up';
    
    return {
      icon: isIncrease ? ArrowTrendingUpIcon : ArrowTrendingDownIcon,
      color: isIncrease ? 'text-red-600' : 'text-green-600',
      text: `${isIncrease ? '+' : '-'}${percentage.toFixed(1)}%`
    };
  };

  const getTimeRangeLabel = (range) => {
    const labels = {
      '1h': 'Last Hour',
      '24h': 'Last 24 Hours',
      '7d': 'Last 7 Days',
      '30d': 'Last 30 Days'
    };
    return labels[range] || range;
  };

  if (loading) {
    return (
      <div className={`bg-white rounded-lg border border-gray-200 p-6 ${className}`}>
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/3"></div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="h-4 bg-gray-200 rounded"></div>
                <div className="h-8 bg-gray-200 rounded"></div>
                <div className="h-3 bg-gray-200 rounded w-2/3"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className={`bg-white rounded-lg border border-gray-200 p-6 ${className}`}>
        <div className="text-center text-gray-500">
          <ChartBarIcon className="h-8 w-8 mx-auto mb-2" />
          <p className="text-sm">No statistics available</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 ${className}`}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center">
            <ChartBarIcon className="h-5 w-5 mr-2" />
            Alert Statistics
          </h3>
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-500 dark:text-gray-400 flex items-center">
              <CalendarIcon className="h-4 w-4 mr-1" />
              {getTimeRangeLabel(timeRange)}
            </span>
            {/* Debug info - remove in production */}
            <span className="text-xs text-gray-400 bg-gray-100 dark:bg-gray-700 px-2 py-1 rounded">
              Debug: {stats?.totals?.total || 0} total, {stats?.totals?.active || 0} active
            </span>
          </div>
        </div>
      </div>

      {/* Main Statistics */}
      <div className="p-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 mb-6">
          {/* Total Alerts */}
          <div className="text-center">
            <div className="flex items-center justify-center w-12 h-12 bg-blue-100 dark:bg-blue-900/30 rounded-lg mx-auto mb-3">
              <ExclamationTriangleIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.totals?.total || 0}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">Total Alerts</div>
            {trends?.total && (
              <div className="flex items-center justify-center mt-1">
                {(() => {
                  const trend = formatTrend(trends.total);
                  const IconComponent = trend.icon;
                  return IconComponent ? (
                    <>
                      <IconComponent className={`h-3 w-3 mr-1 ${trend.color}`} />
                      <span className={`text-xs ${trend.color}`}>{trend.text}</span>
                    </>
                  ) : null;
                })()}
              </div>
            )}
          </div>

          {/* Active Alerts */}
          <div className="text-center">
            <div className="flex items-center justify-center w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-lg mx-auto mb-3">
              <ExclamationTriangleIcon className="h-6 w-6 text-red-600 dark:text-red-400" />
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.totals?.active || 0}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">Active</div>
            {trends?.active && (
              <div className="flex items-center justify-center mt-1">
                {(() => {
                  const trend = formatTrend(trends.active);
                  const IconComponent = trend.icon;
                  return IconComponent ? (
                    <>
                      <IconComponent className={`h-3 w-3 mr-1 ${trend.color}`} />
                      <span className={`text-xs ${trend.color}`}>{trend.text}</span>
                    </>
                  ) : null;
                })()}
              </div>
            )}
          </div>

          {/* Resolved Alerts */}
          <div className="text-center">
            <div className="flex items-center justify-center w-12 h-12 bg-green-100 dark:bg-green-900/30 rounded-lg mx-auto mb-3">
              <CheckCircleIcon className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.resolution?.totalResolved || 0}</div>
            <div className="text-sm text-gray-500 dark:text-gray-400">Resolved</div>
            {trends?.resolved && (
              <div className="flex items-center justify-center mt-1">
                {(() => {
                  const trend = formatTrend(trends.resolved);
                  const IconComponent = trend.icon;
                  return IconComponent ? (
                    <>
                      <IconComponent className={`h-3 w-3 mr-1 ${trend.color}`} />
                      <span className={`text-xs ${trend.color}`}>{trend.text}</span>
                    </>
                  ) : null;
                })()}
              </div>
            )}
          </div>

          {/* Average Resolution Time */}
          <div className="text-center">
            <div className="flex items-center justify-center w-12 h-12 bg-purple-100 dark:bg-purple-900/30 rounded-lg mx-auto mb-3">
              <ClockIcon className="h-6 w-6 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">
              {stats.resolution?.avgResolutionTime ? `${Math.round(stats.resolution.avgResolutionTime)}m` : 'N/A'}
            </div>
            <div className="text-sm text-gray-500 dark:text-gray-400">Avg Resolution</div>
            {trends?.avgResolutionTime && (
              <div className="flex items-center justify-center mt-1">
                {(() => {
                  const trend = formatTrend(trends.avgResolutionTime);
                  const IconComponent = trend.icon;
                  return IconComponent ? (
                    <>
                      <IconComponent className={`h-3 w-3 mr-1 ${trend.color}`} />
                      <span className={`text-xs ${trend.color}`}>{trend.text}</span>
                    </>
                  ) : null;
                })()}
              </div>
            )}
          </div>
        </div>

        {/* Alert Types Breakdown */}
        {stats.byType && Object.keys(stats.byType).length > 0 && (
          <div className="mb-6">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Alert Types</h4>
            <div className="space-y-2">
              {Object.entries(stats.byType)
                .sort(([,a], [,b]) => b - a)
                .map(([type, count]) => {
                  const percentage = stats.total > 0 ? (count / stats.total) * 100 : 0;
                  return (
                    <div key={type} className="flex items-center justify-between">
                      <div className="flex items-center flex-1">
                        <span className="text-sm text-gray-700 dark:text-gray-300 capitalize w-32">
                          {type.replace('_', ' ').toLowerCase()}
                        </span>
                        <div className="flex-1 mx-3">
                          <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                            <div 
                              className="bg-blue-600 dark:bg-blue-500 h-2 rounded-full transition-all duration-300"
                              style={{ width: `${percentage}%` }}
                            ></div>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm font-medium text-gray-900 dark:text-white">{count}</span>
                        <span className="text-xs text-gray-500 dark:text-gray-400">({percentage.toFixed(1)}%)</span>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* Severity Breakdown */}
        {stats.bySeverity && Object.keys(stats.bySeverity).length > 0 && (
          <div className="mb-6">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Severity Distribution</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {Object.entries(stats.bySeverity).map(([severity, count]) => {
                const colors = {
                  CRITICAL: 'bg-red-100 text-red-800 border-red-200',
                  HIGH: 'bg-orange-100 text-orange-800 border-orange-200',
                  MEDIUM: 'bg-yellow-100 text-yellow-800 border-yellow-200',
                  LOW: 'bg-blue-100 text-blue-800 border-blue-200'
                };
                const colorClass = colors[severity] || colors.LOW;
                
                return (
                  <div key={severity} className={`p-3 rounded-lg border ${colorClass}`}>
                    <div className="text-center">
                      <div className="text-lg font-bold">{count}</div>
                      <div className="text-xs capitalize">{severity.toLowerCase()}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Performance Metrics */}
        {stats.performance && (
          <div>
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Performance Metrics</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                <div className="text-sm text-gray-600 dark:text-gray-400">Response Rate</div>
                <div className="text-lg font-semibold text-gray-900 dark:text-white">
                  {stats.performance.responseRate ? `${(stats.performance.responseRate * 100).toFixed(1)}%` : 'N/A'}
                </div>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                <div className="text-sm text-gray-600 dark:text-gray-400">False Positive Rate</div>
                <div className="text-lg font-semibold text-gray-900 dark:text-white">
                  {stats.performance.falsePositiveRate ? `${(stats.performance.falsePositiveRate * 100).toFixed(1)}%` : 'N/A'}
                </div>
              </div>
              <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3">
                <div className="text-sm text-gray-600 dark:text-gray-400">Escalation Rate</div>
                <div className="text-lg font-semibold text-gray-900 dark:text-white">
                  {stats.performance.escalationRate ? `${(stats.performance.escalationRate * 100).toFixed(1)}%` : 'N/A'}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-6 py-3 bg-gray-50 dark:bg-gray-700 border-t border-gray-200 dark:border-gray-600 rounded-b-lg">
        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <span>Last updated: {new Date().toLocaleTimeString()}</span>
          <button 
            onClick={loadStatistics}
            className="text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
          >
            Refresh
          </button>
        </div>
      </div>
    </div>
  );
};

export default AlertStatistics;