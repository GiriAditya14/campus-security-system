import React, { useState, useEffect } from 'react';
import {
  ChartBarIcon,
  MapPinIcon,
  ClockIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  ExclamationTriangleIcon,
  LightBulbIcon,
  BuildingOfficeIcon,
  UserGroupIcon,
  CalendarIcon,
  ArrowPathIcon,
  XMarkIcon,
  CheckCircleIcon
} from '@heroicons/react/24/outline';
import { useAlert } from '../../contexts/AlertContext';
import LoadingSpinner from '../Common/LoadingSpinner';
import api, { handleAPIError } from '../../services/api';

const SpatialForecasting = ({ isOpen, onClose, selectedZone = null, embedded = false }) => {
  const [loading, setLoading] = useState(true);
  const [dataLoading, setDataLoading] = useState(false);
  const [forecastData, setForecastData] = useState(null);
  const [overview, setOverview] = useState(null);
  const [selectedTimeRange, setSelectedTimeRange] = useState('24h');
  const [activeTab, setActiveTab] = useState('overview');
  const [refreshing, setRefreshing] = useState(false);

  // Pagination state for insights
  const [insightsPagination, setInsightsPagination] = useState({
    anomaliesPage: 1,
    recommendationsPage: 1,
    itemsPerPage: 5
  });

  // Pagination state for zones
  const [zonesPagination, setZonesPagination] = useState({
    page: 1,
    itemsPerPage: 3
  });

  const { showError, showSuccess } = useAlert();

  const timeRanges = [
    { value: '1h', label: '1 Hour' },
    { value: '24h', label: '24 Hours' },
    { value: '7d', label: '7 Days' },
    { value: '30d', label: '30 Days' }
  ];

  const tabs = [
    { id: 'overview', label: 'Overview', icon: ChartBarIcon },
    { id: 'zones', label: 'Zone Analysis', icon: BuildingOfficeIcon },
    { id: 'patterns', label: 'Patterns', icon: ClockIcon },
    { id: 'predictions', label: 'Predictions', icon: ArrowTrendingUpIcon },
    { id: 'insights', label: 'Insights', icon: LightBulbIcon }
  ];

  useEffect(() => {
    if (isOpen) {
      loadForecastData();
      loadOverview();
    }
  }, [isOpen, selectedTimeRange, selectedZone]);

  const loadForecastData = async () => {
    try {
      setDataLoading(true);
      const params = {
        timeRange: selectedTimeRange,
        includePredictions: 'true',
        includeHeatmap: 'true'
      };

      if (selectedZone) {
        params.zones = selectedZone;
      }

      const response = await api.get('/spatial-forecasting', { params });
      setForecastData(response.data.data);
    } catch (error) {
      const errorInfo = handleAPIError(error);
      showError('Failed to load spatial forecast', errorInfo.message);
    } finally {
      setDataLoading(false);
      setLoading(false);
    }
  };

  const loadOverview = async () => {
    try {
      const response = await api.get('/spatial-forecasting/overview');
      setOverview(response.data.data);
    } catch (error) {
      console.warn('Failed to load overview:', error);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadForecastData(), loadOverview()]);
    setRefreshing(false);
    showSuccess('Data refreshed', 'Spatial forecasting data updated');
  };

  const getUtilizationColor = (rate) => {
    const numRate = parseFloat(rate);
    if (numRate >= 80) return 'text-red-600 bg-red-100 dark:bg-red-900/20 dark:text-red-400';
    if (numRate >= 60) return 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/20 dark:text-yellow-400';
    if (numRate >= 30) return 'text-green-600 bg-green-100 dark:bg-green-900/20 dark:text-green-400';
    return 'text-gray-600 bg-gray-100 dark:bg-gray-900/20 dark:text-gray-400';
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'high': return <ExclamationTriangleIcon className="h-4 w-4 text-red-500" />;
      case 'medium': return <ClockIcon className="h-4 w-4 text-yellow-500" />;
      case 'low': return <CheckCircleIcon className="h-4 w-4 text-green-500" />;
      default: return <BuildingOfficeIcon className="h-4 w-4 text-gray-500" />;
    }
  };

  const renderOverviewTab = () => (
    <div className="space-y-6">
      {/* Quick Stats */}
      {overview && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex items-center">
              <UserGroupIcon className="h-8 w-8 text-blue-600 dark:text-blue-400" />
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Current Occupancy</p>
                <p className="text-2xl font-semibold text-gray-900 dark:text-white">{overview.currentOccupancy}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex items-center">
              <ChartBarIcon className="h-8 w-8 text-green-600 dark:text-green-400" />
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Utilization Rate</p>
                <p className="text-2xl font-semibold text-gray-900 dark:text-white">{overview.utilizationRate}%</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex items-center">
              <BuildingOfficeIcon className="h-8 w-8 text-purple-600 dark:text-purple-400" />
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Active Zones</p>
                <p className="text-2xl font-semibold text-gray-900 dark:text-white">{overview.activeZones}/{overview.totalZones}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="flex items-center">
              <CalendarIcon className="h-8 w-8 text-orange-600 dark:text-orange-400" />
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Recent Bookings</p>
                <p className="text-2xl font-semibold text-gray-900 dark:text-white">{overview.recentBookings}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Trends Summary */}
      {overview?.trends && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Utilization Trends</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="text-center">
              <div className="flex items-center justify-center mb-2">
                <ArrowTrendingUpIcon className="h-6 w-6 text-green-600 dark:text-green-400 mr-2" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Daily Growth</span>
              </div>
              <p className="text-2xl font-bold text-green-600 dark:text-green-400">+{overview.trends.dailyBookings}%</p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center mb-2">
                <CalendarIcon className="h-6 w-6 text-blue-600 dark:text-blue-400 mr-2" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Weekly Pattern</span>
              </div>
              <p className="text-lg text-gray-900 dark:text-white">
                {overview.trends.weeklyPattern.weekdays}% Weekdays
              </p>
            </div>
            <div className="text-center">
              <div className="flex items-center justify-center mb-2">
                <ArrowTrendingUpIcon className="h-6 w-6 text-purple-600 dark:text-purple-400 mr-2" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Monthly Growth</span>
              </div>
              <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">+{overview.trends.monthlyGrowth}%</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  const renderZonesTab = () => {
    const zones = forecastData?.zones ? Object.entries(forecastData.zones) : [];
    const { page, itemsPerPage } = zonesPagination;
    
    // Paginate zones
    const totalZones = zones.length;
    const startIndex = (page - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginatedZones = zones.slice(startIndex, endIndex);
    const totalPages = Math.ceil(totalZones / itemsPerPage);

    return (
    <div className="space-y-4">
      {/* Zones Header */}
      {totalZones > 0 && (
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            Campus Zones ({totalZones} total)
          </h3>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            Page {page} of {totalPages}
          </span>
        </div>
      )}
      
      {paginatedZones.map(([zoneId, zone]) => (
        <div key={zoneId} className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center">
              {getStatusIcon(zone.status)}
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white ml-2">{zone.name}</h3>
            </div>
            <div className="flex items-center space-x-4">
              <span className={`px-2 py-1 rounded-full text-xs font-medium ${getUtilizationColor(zone.utilizationRate)}`}>
                {zone.utilizationRate}% utilized
              </span>
              <span className="text-sm text-gray-500 dark:text-gray-400">
                {zone.currentOccupancy}/{zone.capacity} occupied
              </span>
            </div>
          </div>
          
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-gray-500 dark:text-gray-400">Peak Hours</p>
              <p className="font-medium text-gray-900 dark:text-white">{zone.peakHours}</p>
            </div>
            <div>
              <p className="text-gray-500 dark:text-gray-400">Avg Duration</p>
              <p className="font-medium text-gray-900 dark:text-white">{zone.avgDuration}</p>
            </div>
            <div>
              <p className="text-gray-500 dark:text-gray-400">Next Available</p>
              <p className="font-medium text-gray-900 dark:text-white">{zone.nextAvailable}</p>
            </div>
          </div>
        </div>
      ))}
      
      {/* Zones Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setZonesPagination(prev => ({ 
                ...prev, 
                page: Math.max(1, prev.page - 1) 
              }))}
              disabled={page === 1}
              className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Page {page} of {totalPages}
            </span>
            <button
              onClick={() => setZonesPagination(prev => ({ 
                ...prev, 
                page: Math.min(totalPages, prev.page + 1) 
              }))}
              disabled={page === totalPages}
              className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Showing {startIndex + 1}-{Math.min(endIndex, totalZones)} of {totalZones} zones
          </span>
        </div>
      )}
      
      {totalZones === 0 && (
        <div className="text-center py-12">
          <BuildingOfficeIcon className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" />
          <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">No zone data available</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Zone analysis will appear when data is available.
          </p>
        </div>
      )}
    </div>
    );
  };

  const renderPatternsTab = () => (
    <div className="space-y-6">
      {forecastData?.patterns ? (
        <>
          {/* Daily Patterns */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Daily Usage Patterns</h3>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{forecastData.patterns.busiest_hour}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Busiest Hour</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-green-600 dark:text-green-400">{forecastData.patterns.quietest_hour}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Quietest Hour</p>
              </div>
              <div className="text-center">
                <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{forecastData.patterns.avg_session_duration}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">Avg Session</p>
              </div>
            </div>
          </div>

          {/* Weekly Patterns */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Weekly Patterns</h3>
            <div className="grid grid-cols-2 gap-6">
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Weekday vs Weekend Usage</p>
                <div className="flex items-center space-x-4">
                  <div className="flex items-center">
                    <div className="w-3 h-3 bg-blue-500 rounded-full mr-2"></div>
                    <span className="text-sm text-gray-700 dark:text-gray-300">Weekdays: {forecastData.patterns.weekday_percentage}%</span>
                  </div>
                  <div className="flex items-center">
                    <div className="w-3 h-3 bg-purple-500 rounded-full mr-2"></div>
                    <span className="text-sm text-gray-700 dark:text-gray-300">Weekends: {forecastData.patterns.weekend_percentage}%</span>
                  </div>
                </div>
              </div>
              <div>
                <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Peak Day</p>
                <p className="text-lg font-semibold text-gray-900 dark:text-white">{forecastData.patterns.peak_day}</p>
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="text-center py-12">
          <ClockIcon className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" />
          <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">No pattern data available</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Usage patterns will appear as data accumulates.
          </p>
        </div>
      )}
    </div>
  );

  const renderPredictionsTab = () => (
    <div className="space-y-6">
      {forecastData?.predictions ? (
        <>
          {/* Next Hour Predictions */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Next Hour Forecast</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {forecastData.predictions.next_hour_predictions?.map((pred, index) => (
                <div key={index} className="border border-gray-200 dark:border-gray-600 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{pred.zone}</span>
                    <span className={`text-xs px-2 py-1 rounded-full ${getUtilizationColor(pred.predicted_utilization)}`}>
                      {pred.predicted_utilization}%
                    </span>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Confidence: {pred.confidence}%
                  </p>
                </div>
              )) || (
                <p className="text-gray-500 dark:text-gray-400 col-span-full">No hourly predictions available</p>
              )}
            </div>
          </div>

          {/* Daily Predictions */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Daily Forecast</h3>
            <div className="space-y-3">
              {forecastData.predictions.daily_predictions?.map((pred, index) => (
                <div key={index} className="flex items-center justify-between p-3 border border-gray-200 dark:border-gray-600 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <CalendarIcon className="h-5 w-5 text-gray-400" />
                    <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{pred.date}</span>
                  </div>
                  <div className="flex items-center space-x-4">
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      Expected: {pred.expected_bookings} bookings
                    </span>
                    <span className={`text-xs px-2 py-1 rounded-full ${getUtilizationColor(pred.predicted_utilization)}`}>
                      {pred.predicted_utilization}%
                    </span>
                  </div>
                </div>
              )) || (
                <p className="text-gray-500 dark:text-gray-400">No daily predictions available</p>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="text-center py-12">
          <ArrowTrendingUpIcon className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" />
          <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">No predictions available</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Predictions will appear as the system learns from usage patterns.
          </p>
        </div>
      )}
    </div>
  );

  const renderInsightsTab = () => {
    const { itemsPerPage, anomaliesPage, recommendationsPage } = insightsPagination;
    
    // Paginate anomalies
    const anomalies = forecastData?.insights?.anomalies || [];
    const totalAnomalies = anomalies.length;
    const startAnomalies = (anomaliesPage - 1) * itemsPerPage;
    const endAnomalies = startAnomalies + itemsPerPage;
    const paginatedAnomalies = anomalies.slice(startAnomalies, endAnomalies);
    const totalAnomaliesPages = Math.ceil(totalAnomalies / itemsPerPage);
    
    // Paginate recommendations
    const recommendations = forecastData?.insights?.recommendations || [];
    const totalRecommendations = recommendations.length;
    const startRecommendations = (recommendationsPage - 1) * itemsPerPage;
    const endRecommendations = startRecommendations + itemsPerPage;
    const paginatedRecommendations = recommendations.slice(startRecommendations, endRecommendations);
    const totalRecommendationsPages = Math.ceil(totalRecommendations / itemsPerPage);

    return (
    <div className="space-y-6">
      {forecastData?.insights ? (
        <>
          {/* Anomalies */}
          {anomalies.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Detected Anomalies</h3>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {totalAnomalies} total anomalies
                </span>
              </div>
              <div className="space-y-3">
                {paginatedAnomalies.map((anomaly, index) => (
                  <div key={index} className="flex items-start space-x-3 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                    <ExclamationTriangleIcon className="h-5 w-5 text-yellow-600 dark:text-yellow-400 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{anomaly.zone}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-300">{anomaly.description}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{anomaly.timestamp}</p>
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Anomalies Pagination */}
              {totalAnomaliesPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setInsightsPagination(prev => ({ 
                        ...prev, 
                        anomaliesPage: Math.max(1, prev.anomaliesPage - 1) 
                      }))}
                      disabled={anomaliesPage === 1}
                      className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      Page {anomaliesPage} of {totalAnomaliesPages}
                    </span>
                    <button
                      onClick={() => setInsightsPagination(prev => ({ 
                        ...prev, 
                        anomaliesPage: Math.min(totalAnomaliesPages, prev.anomaliesPage + 1) 
                      }))}
                      disabled={anomaliesPage === totalAnomaliesPages}
                      className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    Showing {startAnomalies + 1}-{Math.min(endAnomalies, totalAnomalies)} of {totalAnomalies}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Recommendations */}
          {recommendations.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Recommendations</h3>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {totalRecommendations} recommendations
                </span>
              </div>
              <div className="space-y-3">
                {paginatedRecommendations.map((rec, index) => (
                  <div key={index} className="flex items-start space-x-3 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                    <LightBulbIcon className="h-5 w-5 text-blue-600 dark:text-blue-400 mt-0.5" />
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{rec.title}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-300">{rec.description}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Priority: {rec.priority}</p>
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Recommendations Pagination */}
              {totalRecommendationsPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => setInsightsPagination(prev => ({ 
                        ...prev, 
                        recommendationsPage: Math.max(1, prev.recommendationsPage - 1) 
                      }))}
                      disabled={recommendationsPage === 1}
                      className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      Page {recommendationsPage} of {totalRecommendationsPages}
                    </span>
                    <button
                      onClick={() => setInsightsPagination(prev => ({ 
                        ...prev, 
                        recommendationsPage: Math.min(totalRecommendationsPages, prev.recommendationsPage + 1) 
                      }))}
                      disabled={recommendationsPage === totalRecommendationsPages}
                      className="px-3 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    Showing {startRecommendations + 1}-{Math.min(endRecommendations, totalRecommendations)} of {totalRecommendations}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* Trends */}
          {forecastData.insights.trends && (
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Key Trends</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                  <div className="flex items-center">
                    <ArrowTrendingUpIcon className="h-5 w-5 text-green-600 dark:text-green-400 mr-2" />
                    <span className="text-sm font-medium text-gray-900 dark:text-white">Growth Trend</span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                    {forecastData.insights.trends.growth_description}
                  </p>
                </div>
                <div className="p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg">
                  <div className="flex items-center">
                    <ClockIcon className="h-5 w-5 text-purple-600 dark:text-purple-400 mr-2" />
                    <span className="text-sm font-medium text-gray-900 dark:text-white">Usage Pattern</span>
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-300 mt-1">
                    {forecastData.insights.trends.pattern_description}
                  </p>
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="text-center py-12">
          <LightBulbIcon className="mx-auto h-12 w-12 text-gray-400 dark:text-gray-500" />
          <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">No insights available</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Insights will appear as patterns emerge from the data.
          </p>
        </div>
      )}
    </div>
    );
  };

  if (!isOpen && !embedded) return null;

  // If embedded, render without modal wrapper
  if (embedded) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
              <ChartBarIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Spatial Forecasting
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Campus occupancy analysis and predictions
              </p>
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            {/* Time Range Selector */}
            <select
              value={selectedTimeRange}
              onChange={(e) => setSelectedTimeRange(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              {timeRanges.map(range => (
                <option key={range.value} value={range.value}>{range.label}</option>
              ))}
            </select>
            
            {/* Refresh Button */}
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
            >
              <ArrowPathIcon className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>
        
        {/* Tabs */}
        <div className="flex space-x-1">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                  activeTab === tab.id
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                }`}
              >
                <Icon className="h-4 w-4" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Content */}
        <div className="space-y-6">
          {loading || dataLoading ? (
            <div className="flex items-center justify-center py-12">
              <LoadingSpinner size="large" text="Loading spatial forecast data..." />
            </div>
          ) : (
            <>
              {activeTab === 'overview' && renderOverviewTab()}
              {activeTab === 'zones' && renderZonesTab()}
              {activeTab === 'patterns' && renderPatternsTab()}
              {activeTab === 'predictions' && renderPredictionsTab()}
              {activeTab === 'insights' && renderInsightsTab()}
            </>
          )}
        </div>
      </div>
    );
  }

  // Modal mode (original)
  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div className="absolute inset-0 bg-black bg-opacity-50 dark:bg-opacity-70" onClick={onClose} />
      
      <div className="absolute right-0 top-0 h-full w-full max-w-4xl bg-white dark:bg-gray-900 shadow-xl overflow-hidden">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <ChartBarIcon className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                  Spatial Forecasting
                </h2>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Campus occupancy analysis and predictions
                </p>
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              {/* Time Range Selector */}
              <select
                value={selectedTimeRange}
                onChange={(e) => setSelectedTimeRange(e.target.value)}
                className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              >
                {timeRanges.map(range => (
                  <option key={range.value} value={range.value}>{range.label}</option>
                ))}
              </select>
              
              {/* Refresh Button */}
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
              >
                <ArrowPathIcon className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
              </button>
              
              {/* Close Button */}
              <button
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
              >
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
          </div>
          
          {/* Tabs */}
          <div className="flex space-x-1 mt-4">
            {tabs.map(tab => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    activeTab === tab.id
                      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="h-full overflow-y-auto pb-20">
          <div className="p-6">
            {loading || dataLoading ? (
              <div className="flex items-center justify-center py-12">
                <LoadingSpinner size="large" text="Loading spatial forecast data..." />
              </div>
            ) : (
              <>
                {activeTab === 'overview' && renderOverviewTab()}
                {activeTab === 'zones' && renderZonesTab()}
                {activeTab === 'patterns' && renderPatternsTab()}
                {activeTab === 'predictions' && renderPredictionsTab()}
                {activeTab === 'insights' && renderInsightsTab()}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SpatialForecasting;