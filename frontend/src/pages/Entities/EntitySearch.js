import React, { useState, useEffect, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { entitiesAPI, handleAPIError } from '../../services/api';
import { useAlert } from '../../contexts/AlertContext';
import LoadingSpinner from '../../components/Common/LoadingSpinner';
import ProfilePhoto from '../../components/Common/ProfilePhoto';
import { 
  MagnifyingGlassIcon,
  UserIcon,
  ClockIcon,
  MapPinIcon,
  FunnelIcon,
  EyeIcon
} from '@heroicons/react/24/outline';
import Cctv from '../Cctv/Cctv';
import Notes from '../Notes/Notes';

const EntitySearch = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [entities, setEntities] = useState([]);
  const [loading, setLoading] = useState(true); // Start with loading true for initial load
  const [filters, setFilters] = useState({
    type: '',
    status: '',
    department: '',
    role: ''
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    hasMore: false
  });
  const [searchHistory, setSearchHistory] = useState([]);
  const [initialLoad, setInitialLoad] = useState(true);
  const [activeTab, setActiveTab] = useState('entities'); // 'entities' | 'recognition' | 'frames'
  const location = useLocation();

  const { showError } = useAlert();

  // Search function (no longer debounced for initial load)
  const searchEntities = useCallback(async (query, currentFilters, page = 1, isInitialLoad = false, isLoadMore = false, forceSearch = false) => {
    // For initial load or forced search, always fetch entities even without query/filters
    if (!isInitialLoad && !isLoadMore && !forceSearch && !query.trim() && !Object.values(currentFilters).some(v => v)) {
      setEntities([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    
    try {
      const params = {
        page,
        limit: pagination.limit,
        ...currentFilters
      };

      // Only add query if it exists
      if (query.trim()) {
        params.q = query.trim();
      }

      // Remove empty filters
      Object.keys(params).forEach(key => {
        if (!params[key]) delete params[key];
      });

      const response = await entitiesAPI.search(params);
      console.log('API Response:', response.data); // Debug log
      const results = response.data.data || [];
      const paginationData = response.data.pagination || {};
      
      console.log('Results:', results.length, 'Pagination:', paginationData, 'IsLoadMore:', isLoadMore); // Debug log

      if (page === 1 && !isLoadMore) {
        setEntities(results);
      } else {
        setEntities(prev => [...prev, ...results]);
      }

      setPagination({
        page: paginationData.page || 1,
        limit: paginationData.limit || 20,
        total: paginationData.total || 0,
        hasMore: paginationData.hasMore || false
      });

      // Add to search history
      if (query.trim()) {
        setSearchHistory(prev => {
          const newHistory = [query.trim(), ...prev.filter(item => item !== query.trim())];
          return newHistory.slice(0, 5); // Keep only last 5 searches
        });
      }

    } catch (error) {
      const errorInfo = handleAPIError(error);
      showError('Search Error', errorInfo.message);
    } finally {
      setLoading(false);
      if (isInitialLoad) {
        setInitialLoad(false);
      }
    }
  }, [pagination.limit, showError]);

  // Debounced search function for user input
  const debouncedSearch = useCallback(
    debounce((query, currentFilters, page = 1) => {
      searchEntities(query, currentFilters, page, false, false, false);
    }, 300),
    [searchEntities]
  );

  // Single effect to handle all search scenarios
  useEffect(() => {
    // If navigation state set an active tab (e.g., returning from an embedded CCTV view), apply it
    if (location?.state?.activeTab) {
      setActiveTab(location.state.activeTab);
    }

    if (initialLoad) {
      // Initial load - fetch entities without query/filters
      searchEntities('', {
        type: '',
        status: '',
        department: '',
        role: ''
      }, 1, true, false, false);
    } else {
      // Only search if there's a query or active filters
      if (searchQuery.trim() || Object.values(filters).some(v => v)) {
        debouncedSearch(searchQuery, filters, 1);
      }
      // If no query and no filters, keep the existing entities (don't clear them)
    }
  }, [searchQuery, filters, initialLoad]);

  const handleFilterChange = (filterName, value) => {
    setFilters(prev => ({
      ...prev,
      [filterName]: value
    }));
    // Reset pagination when filters change
    setPagination(prev => ({
      ...prev,
      page: 1
    }));
  };

  const clearFilters = () => {
    setSearchQuery(''); // Clear search query too
    setFilters({
      type: '',
      status: '',
      department: '',
      role: ''
    });
    // Reset pagination when filters are cleared
    setPagination(prev => ({
      ...prev,
      page: 1
    }));
    // Reload entities with cleared filters - force search to show all entities
    searchEntities('', {
      type: '',
      status: '',
      department: '',
      role: ''
    }, 1, false, false, true);
  };

  const loadMore = () => {
    if (!loading && pagination.hasMore) {
      searchEntities(searchQuery, filters, pagination.page + 1, false, true, false);
    }
  };

  const formatLastSeen = (timestamp) => {
    if (!timestamp) return 'Never';
    
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

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200';
      case 'inactive': return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
      case 'suspended': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200';
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="flex-shrink-0">
              <UserIcon className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Entity Search
              </h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Search and discover entities across the campus security system
              </p>
            </div>
          </div>
          {!loading && pagination.total > 0 && (
            <div className="text-right">
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {pagination.total.toLocaleString()}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                Total Entities
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tab navigation */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4">
        <nav className="-mb-px flex space-x-2">
          <button
            onClick={() => setActiveTab('entities')}
            className={`py-2 px-4 text-sm font-medium rounded-t-md ${activeTab === 'entities' ? 'bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-200' : 'text-gray-500 hover:text-gray-700 dark:text-gray-300'}`}>
            Entities
          </button>
          <button
            onClick={() => setActiveTab('recognition')}
            className={`py-2 px-4 text-sm font-medium rounded-t-md ${activeTab === 'recognition' ? 'bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-200' : 'text-gray-500 hover:text-gray-700 dark:text-gray-300'}`}>
            Face Recognition
          </button>
          <button
            onClick={() => setActiveTab('frames')}
            className={`py-2 px-4 text-sm font-medium rounded-t-md ${activeTab === 'frames' ? 'bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-200' : 'text-gray-500 hover:text-gray-700 dark:text-gray-300'}`}>
            CCTV Frames
          </button>
          <button
            onClick={() => setActiveTab('notes')}
            className={`py-2 px-4 text-sm font-medium rounded-t-md ${activeTab === 'notes' ? 'bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-200' : 'text-gray-500 hover:text-gray-700 dark:text-gray-300'}`}>
            Tickets
          </button>
        </nav>
      </div>

      {/* Search Bar (only for Entities tab) */}
      {activeTab === 'entities' && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="relative">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
          </div>
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              // Reset pagination when search query changes
              setPagination(prev => ({
                ...prev,
                page: 1
              }));
            }}
            className="block w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md leading-5 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            placeholder="Search by name, ID, email, device hash, or card number..."
          />
        </div>

        {/* Search History */}
        {searchHistory.length > 0 && !searchQuery && (
          <div className="mt-4">
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-2">Recent searches:</p>
            <div className="flex flex-wrap gap-2">
              {searchHistory.map((query, index) => (
                <button
                  key={index}
                  onClick={() => setSearchQuery(query)}
                  className="px-3 py-1 text-sm bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  {query}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-4">
          <select
            value={filters.type}
            onChange={(e) => handleFilterChange('type', e.target.value)}
            className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">All Types</option>
            <option value="student">Student</option>
            <option value="faculty">Faculty</option>
            <option value="staff">Staff</option>
            <option value="visitor">Visitor</option>
          </select>

          <select
            value={filters.status}
            onChange={(e) => handleFilterChange('status', e.target.value)}
            className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="suspended">Suspended</option>
          </select>

          <input
            type="text"
            value={filters.department}
            onChange={(e) => handleFilterChange('department', e.target.value)}
            placeholder="Department"
            className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          />

          <div className="flex space-x-2">
            <input
              type="text"
              value={filters.role}
              onChange={(e) => handleFilterChange('role', e.target.value)}
              placeholder="Role"
              className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            />
            <button
              onClick={clearFilters}
              className="px-4 py-2 text-sm text-gray-800 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              <FunnelIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
        </div>
      )}

      {/* Results */}
      {activeTab !== 'entities' ? (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-6">
          {activeTab === 'recognition' || activeTab === 'frames' ? (
            <Cctv initialTab={activeTab === 'recognition' ? 'recognition' : 'frames'} embedded={true} />
          ) : activeTab === 'notes' ? (
            <Notes embedded={true} />
          ) : null}
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
          {loading && (!entities || entities.length === 0) ? (
            <div className="p-8 text-center">
              <LoadingSpinner size="large" text={initialLoad ? "Loading entities..." : "Searching entities..."} />
            </div>
          ) : (!entities || entities.length === 0) ? (
            <div className="p-8 text-center">
              <UserIcon className="mx-auto h-12 w-12 text-gray-400" />
              <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">
                {searchQuery || Object.values(filters).some(v => v) ? 'No entities found' : 'No entities available'}
              </h3>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                {searchQuery || Object.values(filters).some(v => v) 
                  ? 'Try adjusting your search query or filters' 
                  : 'No entities have been registered in the system yet'}
              </p>
              {!searchQuery && !Object.values(filters).some(v => v) && (
                <div className="mt-4">
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    Entities will appear here once they are added to the campus security system
                  </p>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Results header */}
              <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    {searchQuery || Object.values(filters).some(v => v) 
                      ? `Found ${pagination.total} entities` 
                      : `Showing ${entities.length} of ${pagination.total} entities`}
                  </p>
                  {entities.length > 0 && (
                    <div className="flex items-center space-x-4 text-xs text-gray-500 dark:text-gray-400">
                      {/* Quick type counts */}
                      {(() => {
                        const typeCounts = entities.reduce((acc, entity) => {
                          const type = entity.type || entity.profile?.entity_type || 'unknown';
                          acc[type] = (acc[type] || 0) + 1;
                          return acc;
                        }, {});
                        
                        return Object.entries(typeCounts).map(([type, count]) => (
                          <span key={type} className="capitalize">
                            {type}: {count}
                          </span>
                        ));
                      })()}
                    </div>
                  )}
                </div>
              </div>

              {/* Results list */}
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {(entities || []).map((entity) => (
                  <div key={entity._id} className="p-6 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-3">
                          <div className="flex-shrink-0">
                            <ProfilePhoto
                              entityId={entity._id}
                              size="sm"
                              className="h-8 w-8"
                              alt={`${entity.profile?.name || 'Entity'} profile photo`}
                              fallbackIcon={UserIcon}
                            />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                              {entity.profile?.name || 'Unknown Name'}
                            </p>
                            <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                              ID: {entity._id}
                            </p>
                          </div>
                        </div>
                        
                        <div className="mt-2 flex items-center space-x-4 text-sm text-gray-500 dark:text-gray-400">
                          <span className="flex items-center">
                            <UserIcon className="h-4 w-4 mr-1" />
                            {entity.profile?.entity_type || entity.type || 'Unknown'}
                          </span>
                          
                          {entity.profile?.department && (
                            <span className="flex items-center">
                              <MapPinIcon className="h-4 w-4 mr-1" />
                              {entity.profile.department}
                            </span>
                          )}
                          
                          <span className="flex items-center">
                            <ClockIcon className="h-4 w-4 mr-1" />
                            Last seen: {formatLastSeen(entity.metadata?.last_seen || entity.last_seen)}
                          </span>
                        </div>
                      </div>
                      
                      <div className="flex items-center space-x-3">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(entity.metadata?.status)}`}>
                          {entity.metadata?.status || 'unknown'}
                        </span>
                        
                        <Link
                          to={`/entities/${entity._id}`}
                          state={{ from: '/entities' }}
                          className="inline-flex items-center px-3 py-2 border border-gray-300 dark:border-gray-600 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-800 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                        >
                          <EyeIcon className="h-4 w-4 mr-1" />
                          View Details
                        </Link>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Load more */}
              {pagination.hasMore && (
                <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700">
                          <button
                            onClick={loadMore}
                            disabled={loading}
                            className="w-full flex justify-center items-center px-4 py-2 border border-gray-300 dark:border-gray-600 shadow-sm text-sm font-medium rounded-md text-gray-800 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                          >
                    {loading ? (
                      <LoadingSpinner size="small" />
                    ) : (
                      `Load More (${pagination.total - (entities?.length || 0)} remaining)`
                    )}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

// Debounce utility function
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

export default EntitySearch;