import React, { useState, useEffect } from 'react';
import { eventsAPI, handleAPIError } from '../../services/api';
import { useAlert } from '../../contexts/AlertContext';
import Timeline from '../../components/Timeline/Timeline';
import TimelineSummary from '../../components/Timeline/TimelineSummary';
import LoadingSpinner from '../../components/Common/LoadingSpinner';
import {
  ClockIcon,
  FunnelIcon,
  CalendarIcon
} from '@heroicons/react/24/outline';

const TimelinePage = () => {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    timeRange: '7d',
    activityTypes: [],
    locations: [],
    minConfidence: 0
  });
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  const { showError } = useAlert();

  useEffect(() => {
    loadEvents(true);
  }, [filters]);

  const loadEvents = async (reset = false) => {
    try {
      setLoading(true);
      const currentPage = reset ? 1 : page;
      
      // Convert frontend filters to backend format
      const params = {
        page: currentPage,
        limit: 50
      };

      // Convert timeRange to startDate
      if (filters.timeRange !== 'all') {
        const now = new Date();
        let startDate;
        
        switch (filters.timeRange) {
          case '1d':
            startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            break;
          case '3d':
            startDate = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
            break;
          case '7d':
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
          case '30d':
            startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
        }
        
        if (startDate) {
          params.startDate = startDate.toISOString();
        }
      }

      // Add minConfidence filter
      if (filters.minConfidence > 0) {
        params.minConfidence = filters.minConfidence;
      }

      // Note: Backend doesn't support multiple activityTypes or locations yet
      // We'll filter these on the frontend for now
      
      const response = await eventsAPI.getAll(params);
      let newEvents = response.data.events || [];
      
      // Apply client-side filtering for activity types and locations
      if (filters.activityTypes.length > 0) {
        newEvents = newEvents.filter(event => 
          filters.activityTypes.includes(event.activity_type)
        );
      }
      
      if (filters.locations.length > 0) {
        newEvents = newEvents.filter(event => 
          filters.locations.includes(event.location.building)
        );
      }
      
      if (reset) {
        setEvents(newEvents);
        setPage(2);
      } else {
        setEvents(prev => [...prev, ...newEvents]);
        setPage(prev => prev + 1);
      }
      
      setHasMore(newEvents.length === params.limit);
    } catch (error) {
      const errorInfo = handleAPIError(error);
      showError('Error Loading Timeline', errorInfo.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLoadMore = () => {
    if (!loading && hasMore) {
      loadEvents(false);
    }
  };

  const handleFilterChange = (newFilters) => {
    setFilters(prev => ({ ...prev, ...newFilters }));
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center space-x-3">
            <div className="flex-shrink-0">
              <ClockIcon className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Campus Timeline
              </h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                View all campus activities and events in chronological order
              </p>
            </div>
          </div>
          
          <div className="mt-4 sm:mt-0 flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400">
            <ClockIcon className="h-4 w-4" />
            <span>{events.length} events loaded</span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <div className="flex items-center mb-4">
          <FunnelIcon className="h-5 w-5 text-gray-400 mr-2" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white">Filters</h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Time Range Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Time Range
            </label>
            <select
              value={filters.timeRange}
              onChange={(e) => handleFilterChange({ timeRange: e.target.value })}
              className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm px-3 py-2"
            >
              <option value="1d">Last 24 Hours</option>
              <option value="3d">Last 3 Days</option>
              <option value="7d">Last Week</option>
              <option value="30d">Last Month</option>
              <option value="all">All Time</option>
            </select>
          </div>

          {/* Activity Type Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Activity Type
            </label>
            <select
              value={filters.activityTypes.length > 0 ? filters.activityTypes[0] : ''}
              onChange={(e) => {
                const value = e.target.value;
                handleFilterChange({ 
                  activityTypes: value ? [value] : [] 
                });
              }}
              className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm px-3 py-2"
            >
              <option value="">All Activities</option>
              <option value="access">Access</option>
              <option value="connectivity">Connectivity</option>
              <option value="transaction">Transaction</option>
              <option value="service">Service</option>
              <option value="social">Social</option>
              <option value="academic">Academic</option>
              <option value="maintenance">Maintenance</option>
            </select>
          </div>

          {/* Confidence Filter */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Min Confidence: {(filters.minConfidence * 100).toFixed(0)}%
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={filters.minConfidence}
              onChange={(e) => handleFilterChange({ minConfidence: parseFloat(e.target.value) })}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700"
            />
            <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
              <span>0%</span>
              <span>50%</span>
              <span>100%</span>
            </div>
          </div>

          {/* Clear Filters */}
          <div className="flex items-end">
            <button
              onClick={() => setFilters({
                timeRange: '7d',
                activityTypes: [],
                locations: [],
                minConfidence: 0
              })}
              className="w-full px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-200 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
            >
              Clear All
            </button>
          </div>
        </div>

        {/* Active Filters Display */}
        {(filters.activityTypes.length > 0 || filters.minConfidence > 0 || filters.timeRange !== '7d') && (
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex flex-wrap gap-2">
              <span className="text-sm text-gray-500 dark:text-gray-400">Active filters:</span>
              
              {filters.timeRange !== '7d' && (
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                  {filters.timeRange === '1d' && 'Last 24 Hours'}
                  {filters.timeRange === '3d' && 'Last 3 Days'}
                  {filters.timeRange === '30d' && 'Last Month'}
                  {filters.timeRange === 'all' && 'All Time'}
                </span>
              )}
              
              {filters.activityTypes.map(type => (
                <span key={type} className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 capitalize">
                  {type}
                </span>
              ))}
              
              {filters.minConfidence > 0 && (
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                  {(filters.minConfidence * 100).toFixed(0)}%+ Confidence
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Timeline Summary */}
      <TimelineSummary 
        events={events} 
        entityName="Campus-wide" 
      />

      {/* Main Timeline */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium text-gray-900 dark:text-white">
              Activity Timeline
            </h2>
            <div className="flex items-center space-x-2 text-sm text-gray-500 dark:text-gray-400">
              <CalendarIcon className="h-4 w-4" />
              <span>
                {filters.timeRange === '1d' && 'Last 24 Hours'}
                {filters.timeRange === '3d' && 'Last 3 Days'}
                {filters.timeRange === '7d' && 'Last Week'}
                {filters.timeRange === '30d' && 'Last Month'}
                {filters.timeRange === 'all' && 'All Time'}
              </span>
            </div>
          </div>
        </div>
        
        <div className="p-6">
          {loading && events.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <LoadingSpinner size="large" text="Loading timeline events..." />
            </div>
          ) : (
            <Timeline 
              events={events}
              loading={loading && events.length === 0}
              onLoadMore={hasMore ? handleLoadMore : undefined}
            />
          )}
        </div>
      </div>

      {/* Load More Button */}
      {hasMore && events.length > 0 && !loading && (
        <div className="text-center">
          <button
            onClick={handleLoadMore}
            className="px-6 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 bg-white dark:bg-gray-800 border border-blue-600 dark:border-blue-400 rounded-md hover:bg-blue-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-800"
          >
            Load More Events
          </button>
        </div>
      )}
    </div>
  );
};

export default TimelinePage;