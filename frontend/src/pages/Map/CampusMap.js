import React, { useState, useEffect, useRef } from 'react';
import { 
  MapPinIcon, 
  UserGroupIcon, 
  FunnelIcon,
  MagnifyingGlassIcon,
  ClockIcon,
  BuildingOfficeIcon,
  EyeIcon,
  ChartBarIcon,
  AdjustmentsHorizontalIcon,
  XMarkIcon,
  PresentationChartLineIcon
} from '@heroicons/react/24/outline';
import { analyticsAPI, entitiesAPI, handleAPIError } from '../../services/api';
import { useAlert } from '../../contexts/AlertContext';
import LoadingSpinner from '../../components/Common/LoadingSpinner';
import SpatialForecasting from '../../components/SpatialForecasting/SpatialForecasting';

const CampusMap = () => {
  const mapRef = useRef(null);
  const [entities, setEntities] = useState([]);
  const [heatmapData, setHeatmapData] = useState([]);
  const [selectedEntity, setSelectedEntity] = useState(null);
  const [loading, setLoading] = useState(true);
  const [heatmapLoading, setHeatmapLoading] = useState(false);
  const [stats, setStats] = useState({
    totalEntities: 0,
    activeEntities: 0,
    buildingsActive: 0
  });
  const [filters, setFilters] = useState({
    entityTypes: ['student', 'faculty', 'staff'],
    timeRange: '1h',
    showHeatmap: true,
    showClusters: true,
    minActivity: 1
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [mapCenter, setMapCenter] = useState({ lat: 26.1882, lng: 91.6920 }); // IIT Guwahati coordinates
  const [zoom, setZoom] = useState(16);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [spatialForecastingOpen, setSpatialForecastingOpen] = useState(false);
  
  // Tab navigation state
  const [activeTab, setActiveTab] = useState('map'); // 'map' | 'forecasting'
  
  // Pagination state for entities
  const [entitiesPagination, setEntitiesPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    hasMore: false
  });
  
  // Map interaction state
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [mapOffset, setMapOffset] = useState({ x: 0, y: 0 });

  const { showError } = useAlert();

  // IIT Guwahati Campus buildings with accurate coordinates
  const campusBuildings = [
    // Academic Buildings
    { id: 'academic_complex', name: 'Academic Complex', lat: 26.1882, lng: 91.6920, type: 'academic' },
    { id: 'computer_center', name: 'Computer Center', lat: 26.1885, lng: 91.6925, type: 'academic' },
    { id: 'central_library', name: 'Central Library', lat: 26.1878, lng: 91.6915, type: 'academic' },
    { id: 'lecture_hall_complex', name: 'Lecture Hall Complex', lat: 26.1890, lng: 91.6930, type: 'academic' },
    { id: 'cse_department', name: 'CSE Department', lat: 26.1888, lng: 91.6922, type: 'academic' },
    { id: 'ece_department', name: 'ECE Department', lat: 26.1884, lng: 91.6918, type: 'academic' },
    { id: 'mechanical_dept', name: 'Mechanical Engineering', lat: 26.1880, lng: 91.6912, type: 'academic' },
    { id: 'civil_dept', name: 'Civil Engineering', lat: 26.1876, lng: 91.6908, type: 'academic' },
    { id: 'chemistry_dept', name: 'Chemistry Department', lat: 26.1892, lng: 91.6935, type: 'academic' },
    { id: 'physics_dept', name: 'Physics Department', lat: 26.1894, lng: 91.6938, type: 'academic' },
    { id: 'mathematics_dept', name: 'Mathematics Department', lat: 26.1886, lng: 91.6928, type: 'academic' },
    
    // Administrative Buildings
    { id: 'admin_building', name: 'Administrative Building', lat: 26.1875, lng: 91.6905, type: 'administrative' },
    { id: 'directors_office', name: "Director's Office", lat: 26.1873, lng: 91.6903, type: 'administrative' },
    { id: 'registrar_office', name: 'Registrar Office', lat: 26.1877, lng: 91.6907, type: 'administrative' },
    { id: 'accounts_office', name: 'Accounts Office', lat: 26.1879, lng: 91.6909, type: 'administrative' },
    
    // Hostels (Residential)
    { id: 'brahmaputra_hostel', name: 'Brahmaputra Hostel', lat: 26.1865, lng: 91.6890, type: 'residential' },
    { id: 'dihing_hostel', name: 'Dihing Hostel', lat: 26.1868, lng: 91.6895, type: 'residential' },
    { id: 'subansiri_hostel', name: 'Subansiri Hostel', lat: 26.1870, lng: 91.6900, type: 'residential' },
    { id: 'manas_hostel', name: 'Manas Hostel', lat: 26.1863, lng: 91.6885, type: 'residential' },
    { id: 'kameng_hostel', name: 'Kameng Hostel', lat: 26.1860, lng: 91.6880, type: 'residential' },
    { id: 'umiam_hostel', name: 'Umiam Hostel', lat: 26.1858, lng: 91.6875, type: 'residential' },
    { id: 'married_scholars', name: 'Married Scholars Housing', lat: 26.1855, lng: 91.6870, type: 'residential' },
    { id: 'faculty_quarters', name: 'Faculty Quarters', lat: 26.1900, lng: 91.6950, type: 'residential' },
    
    // Recreational & Sports
    { id: 'sports_complex', name: 'Sports Complex', lat: 26.1850, lng: 91.6860, type: 'recreational' },
    { id: 'swimming_pool', name: 'Swimming Pool', lat: 26.1848, lng: 91.6858, type: 'recreational' },
    { id: 'gymnasium', name: 'Gymnasium', lat: 26.1852, lng: 91.6862, type: 'recreational' },
    { id: 'student_activity_center', name: 'Student Activity Center', lat: 26.1872, lng: 91.6898, type: 'recreational' },
    { id: 'auditorium', name: 'Auditorium', lat: 26.1874, lng: 91.6902, type: 'recreational' },
    
    // Dining & Services
    { id: 'central_mess', name: 'Central Mess', lat: 26.1866, lng: 91.6892, type: 'service' },
    { id: 'food_court', name: 'Food Court', lat: 26.1881, lng: 91.6917, type: 'service' },
    { id: 'medical_center', name: 'Medical Center', lat: 26.1883, lng: 91.6913, type: 'service' },
    { id: 'guest_house', name: 'Guest House', lat: 26.1898, lng: 91.6945, type: 'service' },
    { id: 'post_office', name: 'Post Office', lat: 26.1887, lng: 91.6923, type: 'service' },
    { id: 'bank_atm', name: 'Bank & ATM', lat: 26.1889, lng: 91.6927, type: 'service' },
    
    // Research & Labs
    { id: 'research_park', name: 'Research Park', lat: 26.1895, lng: 91.6940, type: 'academic' },
    { id: 'central_workshop', name: 'Central Workshop', lat: 26.1871, lng: 91.6896, type: 'academic' },
    { id: 'central_instrumentation', name: 'Central Instrumentation Facility', lat: 26.1893, lng: 91.6933, type: 'academic' },
    
    // Restricted Areas
    { id: 'server_room', name: 'Server Room', lat: 26.1891, lng: 91.6931, type: 'restricted' },
    { id: 'security_office', name: 'Security Office', lat: 26.1876, lng: 91.6904, type: 'restricted' },
    { id: 'electrical_substation', name: 'Electrical Substation', lat: 26.1897, lng: 91.6943, type: 'restricted' },
    { id: 'water_treatment', name: 'Water Treatment Plant', lat: 26.1853, lng: 91.6865, type: 'restricted' },
    
    // Utilities & Infrastructure
    { id: 'main_gate', name: 'Main Gate', lat: 26.1899, lng: 91.6948, type: 'service' },
    { id: 'parking_academic', name: 'Academic Parking', lat: 26.1885, lng: 91.6910, type: 'service' },
    { id: 'parking_hostel', name: 'Hostel Parking', lat: 26.1862, lng: 91.6888, type: 'service' },
    { id: 'transport_hub', name: 'Transport Hub', lat: 26.1901, lng: 91.6952, type: 'service' }
  ];

  useEffect(() => {
    loadMapData();
  }, []);

  useEffect(() => {
    loadHeatmapData();
  }, [filters.timeRange, filters.entityTypes, filters.showHeatmap]);

  // Handle global mouse events for better drag behavior
  useEffect(() => {
    const handleGlobalMouseMove = (e) => {
      if (isDragging) {
        handleMouseMove(e);
      }
    };

    const handleGlobalMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
      }
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleGlobalMouseMove);
      document.addEventListener('mouseup', handleGlobalMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleGlobalMouseMove);
      document.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isDragging, dragStart, mapOffset]);

  const loadMapData = async (page = 1, isLoadMore = false) => {
    try {
      if (!isLoadMore) setLoading(true);
      
      // Load entities from backend with pagination
      const [entitiesResponse, analyticsResponse] = await Promise.all([
        entitiesAPI.search({ 
          page,
          limit: entitiesPagination.limit,
          status: 'active'
        }),
        analyticsAPI.getDashboard()
      ]);

      const entitiesData = entitiesResponse.data.data || [];
      const paginationData = entitiesResponse.data.pagination || {};
      const analyticsData = analyticsResponse.data.data || {};

      // Process entities with location data
      const processedEntities = entitiesData
        .filter(entity => entity.profile && entity.metadata?.status === 'active')
        .map(entity => ({
          id: entity._id,
          name: entity.profile.name || 'Unknown',
          type: entity.profile.entity_type || 'unknown',
          location: generateLocationForEntity(entity),
          lastSeen: new Date(entity.metadata?.last_seen || entity.updated_at || Date.now()),
          confidence: entity.metadata?.confidence || 0.8,
          activity: entity.metadata?.current_activity || 'unknown',
          department: entity.profile.department,
          status: entity.metadata.status
        }));

      if (page === 1 && !isLoadMore) {
        setEntities(processedEntities);
      } else {
        setEntities(prev => [...prev, ...processedEntities]);
      }

      // Update pagination
      setEntitiesPagination({
        page: paginationData.page || 1,
        limit: paginationData.limit || 20,
        total: paginationData.total || 0,
        hasMore: paginationData.hasMore || false
      });
      
      // Update stats
      setStats({
        totalEntities: paginationData.total || entitiesData.length,
        activeEntities: processedEntities.length,
        buildingsActive: new Set(processedEntities.map(e => e.location.building)).size
      });

    } catch (error) {
      const errorInfo = handleAPIError(error);
      showError('Error Loading Map Data', errorInfo.message);
    } finally {
      setLoading(false);
    }
  };

  const loadHeatmapData = async () => {
    if (!filters.showHeatmap) {
      setHeatmapData([]);
      return;
    }

    try {
      setHeatmapLoading(true);
      const heatmapResponse = await analyticsAPI.getHeatmap({
        timeRange: filters.timeRange,
        entityTypes: filters.entityTypes
      });
      setHeatmapData(heatmapResponse.data.data || []);
    } catch (error) {
      console.warn('Heatmap data not available:', error.message);
    } finally {
      setHeatmapLoading(false);
    }
  };

  const loadMoreEntities = () => {
    if (!loading && entitiesPagination.hasMore) {
      loadMapData(entitiesPagination.page + 1, true);
    }
  };

  // Generate location for entity based on their profile
  const generateLocationForEntity = (entity) => {
    const department = entity.profile?.department;
    const entityType = entity.profile?.entity_type;
    
    // Map departments to IIT Guwahati buildings
    const departmentBuildings = {
      'Computer Science': 'CSE Department',
      'Computer Science and Engineering': 'CSE Department',
      'Electronics and Communication Engineering': 'ECE Department',
      'Electronics and Electrical Engineering': 'ECE Department',
      'Mechanical Engineering': 'Mechanical Engineering',
      'Civil Engineering': 'Civil Engineering',
      'Chemical Engineering': 'Academic Complex',
      'Mathematics': 'Mathematics Department',
      'Physics': 'Physics Department',
      'Chemistry': 'Chemistry Department',
      'Biosciences and Bioengineering': 'Academic Complex',
      'Design': 'Academic Complex',
      'Humanities and Social Sciences': 'Academic Complex',
      'Management': 'Academic Complex'
    };

    // Map entity types to likely IIT Guwahati buildings
    const typeBuildings = {
      'student': ['Central Library', 'Academic Complex', 'Computer Center', 'Lecture Hall Complex', 'Brahmaputra Hostel', 'Dihing Hostel', 'Subansiri Hostel', 'Manas Hostel'],
      'faculty': ['Academic Complex', 'CSE Department', 'ECE Department', 'Research Park', 'Faculty Quarters', 'Central Library'],
      'staff': ['Administrative Building', 'Academic Complex', 'Security Office', 'Medical Center', 'Central Workshop']
    };

    let buildingName = departmentBuildings[department] || 
                      (typeBuildings[entityType] ? 
                       typeBuildings[entityType][Math.floor(Math.random() * typeBuildings[entityType].length)] : 
                       'Academic Complex');

    const building = campusBuildings.find(b => b.name === buildingName) || campusBuildings[0];
    
    return {
      building: building.name,
      lat: building.lat + (Math.random() - 0.5) * 0.0002,
      lng: building.lng + (Math.random() - 0.5) * 0.0002,
      room: `Room ${Math.floor(Math.random() * 300) + 100}`
    };
  };



  // Load real active entities from API
  const loadActiveEntities = async () => {
    try {
      const response = await entitiesAPI.search({ 
        limit: 100,
        status: 'active'
      });
      
      const entities = response.data.data || response.data.entities || [];
      
      return entities
        .filter(entity => {
          // Filter by entity type if specified
          const entityType = entity.profile?.entity_type;
          return !filters.entityTypes.length || filters.entityTypes.includes(entityType);
        })
        .map(entity => ({
          id: entity._id,
          name: entity.profile?.name || 'Unknown',
          type: entity.profile?.entity_type || 'unknown',
          location: generateLocationForEntity(entity),
          lastSeen: new Date(entity.metadata?.last_seen || Date.now() - Math.random() * 3600000),
          confidence: entity.metadata?.confidence || 0.8 + Math.random() * 0.2,
          activity: ['access', 'connectivity', 'academic', 'social'][Math.floor(Math.random() * 4)],
          email: entity.identifiers?.email,
          department: entity.profile?.department,
          status: entity.metadata?.status
        }));
    } catch (error) {
      console.error('Error loading active entities:', error);
      return [];
    }
  };

  const getBuildingColor = (type) => {
    const colors = {
      academic: '#3B82F6',      // Blue
      administrative: '#8B5CF6', // Purple
      residential: '#10B981',    // Green
      recreational: '#F59E0B',   // Orange
      restricted: '#EF4444',     // Red
      service: '#6B7280'         // Gray
    };
    return colors[type] || colors.service;
  };

  const getEntityColor = (type) => {
    const colors = {
      student: '#3B82F6',   // Blue
      faculty: '#8B5CF6',   // Purple
      staff: '#10B981'      // Green
    };
    return colors[type] || colors.student;
  };

  const filteredEntities = entities.filter(entity => {
    if (searchTerm && !entity.name.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }
    return filters.entityTypes.includes(entity.type);
  });

  const handleEntityClick = (entity) => {
    setSelectedEntity(entity);
    setMapCenter({ lat: entity.location.lat, lng: entity.location.lng });
    setZoom(18);
  };

  const handleBuildingClick = (building) => {
    setMapCenter({ lat: building.lat, lng: building.lng });
    setZoom(17);
    setSelectedEntity(null);
  };

  // Cluster entities by proximity
  const clusterEntities = (entities) => {
    if (!filters.showClusters) return entities.map(e => ({ ...e, cluster: null }));
    
    const clusters = [];
    const processed = new Set();
    
    entities.forEach((entity, index) => {
      if (processed.has(index)) return;
      
      const cluster = [entity];
      processed.add(index);
      
      entities.forEach((other, otherIndex) => {
        if (processed.has(otherIndex) || index === otherIndex) return;
        
        const distance = Math.sqrt(
          Math.pow(entity.location.lat - other.location.lat, 2) +
          Math.pow(entity.location.lng - other.location.lng, 2)
        );
        
        if (distance < 0.0001) { // Very close entities
          cluster.push(other);
          processed.add(otherIndex);
        }
      });
      
      clusters.push(cluster);
    });
    
    return clusters;
  };

  const entityClusters = clusterEntities(filteredEntities);

  // Map interaction handlers
  const handleMouseDown = (e) => {
    setIsDragging(true);
    setDragStart({
      x: e.clientX - mapOffset.x,
      y: e.clientY - mapOffset.y
    });
  };

  const handleMouseMove = (e) => {
    if (!isDragging) return;
    
    const newOffset = {
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    };
    setMapOffset(newOffset);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -1 : 1;
    const newZoom = Math.max(10, Math.min(20, zoom + delta));
    setZoom(newZoom);
  };

  const handleTouchStart = (e) => {
    if (e.touches.length === 1) {
      const touch = e.touches[0];
      setIsDragging(true);
      setDragStart({
        x: touch.clientX - mapOffset.x,
        y: touch.clientY - mapOffset.y
      });
    }
  };

  const handleTouchMove = (e) => {
    if (!isDragging || e.touches.length !== 1) return;
    
    e.preventDefault();
    const touch = e.touches[0];
    const newOffset = {
      x: touch.clientX - dragStart.x,
      y: touch.clientY - dragStart.y
    };
    setMapOffset(newOffset);
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  // Reset map to center
  const resetMapView = () => {
    setMapCenter({ lat: 26.1882, lng: 91.6920 });
    setZoom(16);
    setMapOffset({ x: 0, y: 0 });
  };

  // Convert lat/lng to screen coordinates
  const latLngToScreen = (lat, lng) => {
    const mapWidth = 800;
    const mapHeight = 600;
    
    // Calculate relative position from map center
    const latDiff = (lat - mapCenter.lat) * 100000 * zoom;
    const lngDiff = (lng - mapCenter.lng) * 100000 * zoom;
    
    return {
      x: (mapWidth / 2) + lngDiff + mapOffset.x,
      y: (mapHeight / 2) - latDiff + mapOffset.y
    };
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="flex-shrink-0">
              <MapPinIcon className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                IIT Guwahati Campus Map
              </h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                Real-time entity tracking and security monitoring across campus
              </p>
            </div>
          </div>
          
          {/* Stats */}
          <div className="flex items-center space-x-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {stats.activeEntities}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                Active Entities
              </div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                {stats.buildingsActive}
              </div>
              <div className="text-sm text-gray-500 dark:text-gray-400">
                Buildings Active
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4">
        <nav className="-mb-px flex space-x-2">
          <button
            onClick={() => setActiveTab('map')}
            className={`py-2 px-4 text-sm font-medium rounded-t-md ${
              activeTab === 'map' 
                ? 'bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-200' 
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-300'
            }`}
          >
            Campus Map
          </button>
          <button
            onClick={() => setActiveTab('forecasting')}
            className={`py-2 px-4 text-sm font-medium rounded-t-md ${
              activeTab === 'forecasting' 
                ? 'bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-200' 
                : 'text-gray-500 hover:text-gray-700 dark:text-gray-300'
            }`}
          >
            Spatial Forecasting
          </button>
        </nav>
      </div>

      {/* Tab Content */}
      {activeTab === 'map' ? (
        <>
      {/* Controls */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white flex items-center">
            <AdjustmentsHorizontalIcon className="h-5 w-5 mr-2" />
            Map Controls
          </h2>
          <button
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
            className="inline-flex items-center px-3 py-2 border border-gray-300 dark:border-gray-600 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 mr-3"
          >
            <EyeIcon className="h-4 w-4 mr-1" />
            {sidebarCollapsed ? 'Show' : 'Hide'} Sidebar
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Search */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md leading-5 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              placeholder="Search entities..."
            />
          </div>

          {/* Time Range */}
          <select
            value={filters.timeRange}
            onChange={(e) => setFilters(prev => ({ ...prev, timeRange: e.target.value }))}
            className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="1h">Last Hour</option>
            <option value="6h">Last 6 Hours</option>
            <option value="24h">Last 24 Hours</option>
            <option value="7d">Last 7 Days</option>
          </select>

          {/* Entity Types */}
          <div className="flex items-center space-x-4">
            {['student', 'faculty', 'staff'].map(type => (
              <label key={type} className="flex items-center">
                <input
                  type="checkbox"
                  checked={filters.entityTypes.includes(type)}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setFilters(prev => ({
                        ...prev,
                        entityTypes: [...prev.entityTypes, type]
                      }));
                    } else {
                      setFilters(prev => ({
                        ...prev,
                        entityTypes: prev.entityTypes.filter(t => t !== type)
                      }));
                    }
                  }}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="ml-2 text-sm text-gray-700 dark:text-gray-300 capitalize">{type}</span>
              </label>
            ))}
          </div>

          {/* Display Options */}
          <div className="flex items-center space-x-4">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={filters.showHeatmap}
                onChange={(e) => setFilters(prev => ({ ...prev, showHeatmap: e.target.checked }))}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">Heatmap</span>
            </label>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={filters.showClusters}
                onChange={(e) => setFilters(prev => ({ ...prev, showClusters: e.target.checked }))}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">Clusters</span>
            </label>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar */}
        {!sidebarCollapsed && (
          <div className="lg:col-span-1">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
              {/* Legend */}
              <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3 flex items-center">
                  <ChartBarIcon className="h-4 w-4 mr-2" />
                  Legend
                </h3>
                
                {/* Building Types */}
                <div className="space-y-2 mb-4">
                  <h4 className="text-xs font-medium text-gray-700 dark:text-gray-300">Building Types</h4>
                  {Object.entries({
                    academic: 'Academic',
                    administrative: 'Administrative', 
                    residential: 'Residential',
                    recreational: 'Recreational',
                    restricted: 'Restricted',
                    service: 'Service'
                  }).map(([type, label]) => (
                    <div key={type} className="flex items-center">
                      <div 
                        className="w-3 h-3 rounded-full mr-2"
                        style={{ backgroundColor: getBuildingColor(type) }}
                      ></div>
                      <span className="text-xs text-gray-600 dark:text-gray-400">{label}</span>
                    </div>
                  ))}
                </div>

                {/* Entity Types */}
                <div className="space-y-2">
                  <h4 className="text-xs font-medium text-gray-700 dark:text-gray-300">Entity Types</h4>
                  {Object.entries({
                    student: 'Students',
                    faculty: 'Faculty',
                    staff: 'Staff'
                  }).map(([type, label]) => (
                    <div key={type} className="flex items-center">
                      <div 
                        className="w-3 h-3 rounded-full mr-2"
                        style={{ backgroundColor: getEntityColor(type) }}
                      ></div>
                      <span className="text-xs text-gray-600 dark:text-gray-400">{label}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Entity List */}
              <div className="p-4">
                <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3 flex items-center">
                  <UserGroupIcon className="h-4 w-4 mr-2" />
                  Active Entities ({entitiesPagination.total || filteredEntities.length})
                </h3>
                
                {loading && entities.length === 0 ? (
                  <div className="space-y-3">
                    {[...Array(5)].map((_, i) => (
                      <div key={i} className="animate-pulse">
                        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2"></div>
                        <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <>
                    <div className="space-y-2 max-h-96 overflow-y-auto">
                      {filteredEntities.map(entity => (
                        <div
                          key={entity.id}
                          onClick={() => handleEntityClick(entity)}
                          className={`p-3 rounded-md cursor-pointer transition-colors border ${
                            selectedEntity?.id === entity.id
                              ? 'bg-blue-50 dark:bg-blue-900 border-blue-300 dark:border-blue-600'
                              : 'hover:bg-gray-50 dark:hover:bg-gray-700 border-transparent'
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <div 
                                className="w-2 h-2 rounded-full"
                                style={{ backgroundColor: getEntityColor(entity.type) }}
                              ></div>
                              <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                {entity.name}
                              </span>
                            </div>
                            <span className="text-xs text-gray-500 dark:text-gray-400">
                              {(entity.confidence * 100).toFixed(0)}%
                            </span>
                          </div>
                          <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                            <div className="flex items-center">
                              <MapPinIcon className="h-3 w-3 mr-1" />
                              {entity.location.building}
                            </div>
                            <div className="flex items-center mt-1">
                              <ClockIcon className="h-3 w-3 mr-1" />
                              {entity.lastSeen.toLocaleTimeString()}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    
                    {/* Pagination Info and Load More */}
                    {entitiesPagination.total > 0 && (
                      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                        <div className="flex items-center justify-between text-sm text-gray-500 dark:text-gray-400 mb-3">
                          <span>
                            Showing {filteredEntities.length} of {entitiesPagination.total} entities
                          </span>
                          <span>
                            Page {entitiesPagination.page}
                          </span>
                        </div>
                        
                        {entitiesPagination.hasMore && (
                          <button
                            onClick={loadMoreEntities}
                            disabled={loading}
                            className="w-full flex justify-center items-center px-4 py-2 border border-gray-300 dark:border-gray-600 shadow-sm text-sm font-medium rounded-md text-gray-800 dark:text-gray-300 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
                          >
                            {loading ? (
                              <LoadingSpinner size="small" />
                            ) : (
                              `Load More (${entitiesPagination.total - filteredEntities.length} remaining)`
                            )}
                          </button>
                        )}
                      </div>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Map Container */}
        <div className={`${sidebarCollapsed ? 'lg:col-span-4' : 'lg:col-span-3'}`}>
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
            {/* Map Header */}
            <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-medium text-gray-900 dark:text-white">
                  IIT Guwahati Campus Layout
                </h2>
                <div className="flex items-center space-x-2">
                  {heatmapLoading && (
                    <div className="flex items-center text-sm text-gray-500 dark:text-gray-400">
                      <LoadingSpinner size="small" />
                      <span className="ml-2">Loading heatmap...</span>
                    </div>
                  )}
                  <div className="flex items-center space-x-4 text-sm text-gray-500 dark:text-gray-400">
                    <span>Zoom: {zoom}x</span>
                    <span>Center: {mapCenter.lat.toFixed(4)}, {mapCenter.lng.toFixed(4)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Map */}
            <div className="relative">
              <div 
                ref={mapRef}
                className="w-full h-96 relative overflow-hidden cursor-grab select-none"
                style={{
                  background: `
                    linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 25%, #bae6fd 50%, #7dd3fc 75%, #38bdf8 100%),
                    radial-gradient(circle at 30% 20%, rgba(34, 197, 94, 0.3) 0%, transparent 50%),
                    radial-gradient(circle at 70% 80%, rgba(34, 197, 94, 0.2) 0%, transparent 40%),
                    radial-gradient(circle at 20% 60%, rgba(34, 197, 94, 0.25) 0%, transparent 35%),
                    radial-gradient(circle at 80% 30%, rgba(34, 197, 94, 0.15) 0%, transparent 45%)
                  `,
                  cursor: isDragging ? 'grabbing' : 'grab'
                }}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onWheel={handleWheel}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleTouchEnd}
              >
                {/* Campus Infrastructure Layer */}
                <div 
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    transform: `translate(${mapOffset.x}px, ${mapOffset.y}px) scale(${zoom / 16})`,
                    transformOrigin: 'center center'
                  }}
                >
                  {/* Main Roads */}
                  <div className="absolute bg-gray-300 dark:bg-gray-600" style={{
                    left: '10%', top: '20%', width: '80%', height: '8px',
                    borderRadius: '4px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                  }}></div>
                  <div className="absolute bg-gray-300 dark:bg-gray-600" style={{
                    left: '20%', top: '10%', width: '8px', height: '80%',
                    borderRadius: '4px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                  }}></div>
                  <div className="absolute bg-gray-300 dark:bg-gray-600" style={{
                    left: '60%', top: '10%', width: '8px', height: '80%',
                    borderRadius: '4px', boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                  }}></div>
                  
                  {/* Campus Pathways */}
                  <div className="absolute bg-yellow-200 dark:bg-yellow-700" style={{
                    left: '25%', top: '35%', width: '30%', height: '4px',
                    borderRadius: '2px', opacity: '0.8'
                  }}></div>
                  <div className="absolute bg-yellow-200 dark:bg-yellow-700" style={{
                    left: '35%', top: '25%', width: '4px', height: '40%',
                    borderRadius: '2px', opacity: '0.8'
                  }}></div>
                  <div className="absolute bg-yellow-200 dark:bg-yellow-700" style={{
                    left: '65%', top: '45%', width: '25%', height: '4px',
                    borderRadius: '2px', opacity: '0.8'
                  }}></div>
                  
                  {/* Green Areas (Parks & Gardens) */}
                  <div className="absolute bg-green-200 dark:bg-green-800 rounded-full opacity-60" style={{
                    left: '15%', top: '40%', width: '120px', height: '80px'
                  }}></div>
                  <div className="absolute bg-green-200 dark:bg-green-800 rounded-full opacity-60" style={{
                    left: '70%', top: '25%', width: '100px', height: '100px'
                  }}></div>
                  <div className="absolute bg-green-200 dark:bg-green-800 rounded-full opacity-60" style={{
                    left: '45%', top: '65%', width: '140px', height: '90px'
                  }}></div>
                  
                  {/* Water Bodies */}
                  <div className="absolute bg-blue-300 dark:bg-blue-700 rounded-full opacity-70" style={{
                    left: '75%', top: '60%', width: '80px', height: '60px'
                  }}></div>
                  <div className="absolute bg-blue-300 dark:bg-blue-700 opacity-50" style={{
                    left: '10%', top: '70%', width: '200px', height: '20px',
                    borderRadius: '10px'
                  }}></div>
                  
                  {/* Parking Areas */}
                  <div className="absolute bg-gray-200 dark:bg-gray-700 opacity-80" style={{
                    left: '30%', top: '15%', width: '60px', height: '40px',
                    borderRadius: '4px'
                  }}></div>
                  <div className="absolute bg-gray-200 dark:bg-gray-700 opacity-80" style={{
                    left: '65%', top: '75%', width: '80px', height: '50px',
                    borderRadius: '4px'
                  }}></div>
                  
                  {/* Sports Fields */}
                  <div className="absolute bg-green-300 dark:bg-green-700 opacity-70" style={{
                    left: '5%', top: '50%', width: '100px', height: '120px',
                    borderRadius: '8px', border: '2px solid rgba(34, 197, 94, 0.5)'
                  }}></div>
                  
                  {/* Trees and Vegetation */}
                  <div className="absolute bg-green-400 dark:bg-green-600 rounded-full opacity-40" style={{
                    left: '25%', top: '30%', width: '8px', height: '8px'
                  }}></div>
                  <div className="absolute bg-green-400 dark:bg-green-600 rounded-full opacity-40" style={{
                    left: '35%', top: '45%', width: '6px', height: '6px'
                  }}></div>
                  <div className="absolute bg-green-400 dark:bg-green-600 rounded-full opacity-40" style={{
                    left: '55%', top: '35%', width: '10px', height: '10px'
                  }}></div>
                  <div className="absolute bg-green-400 dark:bg-green-600 rounded-full opacity-40" style={{
                    left: '75%', top: '50%', width: '7px', height: '7px'
                  }}></div>
                  <div className="absolute bg-green-400 dark:bg-green-600 rounded-full opacity-40" style={{
                    left: '40%', top: '70%', width: '9px', height: '9px'
                  }}></div>
                  
                  {/* Building Shadows/Footprints */}
                  {campusBuildings.map(building => {
                    const shadowOffset = 3;
                    const screenPos = latLngToScreen(building.lat, building.lng);
                    
                    if (screenPos.x < -150 || screenPos.x > 950 || screenPos.y < -150 || screenPos.y > 750) return null;
                    
                    return (
                      <div
                        key={`shadow-${building.id}`}
                        className="absolute rounded-lg opacity-15"
                        style={{
                          left: screenPos.x - 18 + shadowOffset,
                          top: screenPos.y - 18 + shadowOffset,
                          width: '36px',
                          height: '36px',
                          background: 'radial-gradient(ellipse, rgba(0,0,0,0.3) 0%, transparent 70%)',
                          transform: 'translate(-50%, -50%)'
                        }}
                      ></div>
                    );
                  })}
                  
                  {/* Campus Boundaries */}
                  <div className="absolute border-2 border-dashed border-gray-400 dark:border-gray-500 opacity-30 rounded-lg" style={{
                    left: '5%', top: '5%', width: '90%', height: '90%'
                  }}></div>
                </div>
                {/* Campus Buildings */}
                {campusBuildings.map(building => {
                  const screenPos = latLngToScreen(building.lat, building.lng);
                  
                  // Only render if within visible area (with some padding)
                  if (screenPos.x < -100 || screenPos.x > 900 || screenPos.y < -100 || screenPos.y > 700) return null;
                  
                  return (
                    <div
                      key={building.id}
                      onClick={() => handleBuildingClick(building)}
                      className="absolute transform -translate-x-1/2 -translate-y-1/2 cursor-pointer group"
                      style={{ left: screenPos.x, top: screenPos.y }}
                    >
                      <div 
                        className="relative w-10 h-10 rounded-lg shadow-xl border-2 border-white flex items-center justify-center transform transition-transform hover:scale-110"
                        style={{ 
                          backgroundColor: getBuildingColor(building.type),
                          boxShadow: '0 4px 12px rgba(0,0,0,0.15), 0 2px 4px rgba(0,0,0,0.1)'
                        }}
                      >
                        <BuildingOfficeIcon className="h-5 w-5 text-white drop-shadow-sm" />
                        {/* Building indicator dot */}
                        <div 
                          className="absolute -top-1 -right-1 w-3 h-3 rounded-full border border-white"
                          style={{ backgroundColor: getBuildingColor(building.type) }}
                        ></div>
                      </div>
                      <div className="absolute top-10 left-1/2 transform -translate-x-1/2 bg-black bg-opacity-75 text-white text-xs px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap">
                        {building.name}
                      </div>
                    </div>
                  );
                })}

                {/* Entity Clusters */}
                {entityClusters.map((cluster, clusterIndex) => {
                  if (cluster.length === 0) return null;
                  
                  const centerEntity = cluster[0];
                  const screenPos = latLngToScreen(centerEntity.location.lat, centerEntity.location.lng);
                  
                  // Only render if within visible area
                  if (screenPos.x < -100 || screenPos.x > 900 || screenPos.y < -100 || screenPos.y > 700) return null;
                  
                  return (
                    <div
                      key={`cluster-${clusterIndex}`}
                      className="absolute transform -translate-x-1/2 -translate-y-1/2"
                      style={{ left: screenPos.x, top: screenPos.y }}
                    >
                      {cluster.length > 1 ? (
                        // Cluster marker
                        <div 
                          className="w-10 h-10 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center shadow-xl border-3 border-white cursor-pointer transform transition-transform hover:scale-110"
                          onClick={() => handleEntityClick(centerEntity)}
                          style={{
                            boxShadow: '0 6px 16px rgba(59, 130, 246, 0.4), 0 2px 4px rgba(0,0,0,0.1)',
                            background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)'
                          }}
                        >
                          {cluster.length}
                          <div className="absolute inset-0 rounded-full bg-white opacity-20 animate-pulse"></div>
                        </div>
                      ) : (
                        // Single entity marker
                        <div
                          onClick={() => handleEntityClick(centerEntity)}
                          className={`w-6 h-6 rounded-full shadow-lg border-2 border-white cursor-pointer transform transition-all hover:scale-125 ${
                            selectedEntity?.id === centerEntity.id ? 'ring-4 ring-blue-400 ring-opacity-60' : ''
                          }`}
                          style={{ 
                            backgroundColor: getEntityColor(centerEntity.type),
                            boxShadow: `0 4px 12px ${getEntityColor(centerEntity.type)}40, 0 2px 4px rgba(0,0,0,0.1)`
                          }}
                        >
                          <div className="absolute inset-0 rounded-full bg-white opacity-30 animate-ping"></div>
                        </div>
                      )}
                    </div>
                  );
                })}

                {/* Heatmap Overlay */}
                {filters.showHeatmap && heatmapData.length > 0 && (
                  <div className="absolute inset-0 pointer-events-none">
                    {heatmapData.map((point, index) => {
                      const screenPos = latLngToScreen(point.lat, point.lng);
                      
                      if (screenPos.x < -100 || screenPos.x > 900 || screenPos.y < -100 || screenPos.y > 700) return null;
                      
                      const intensity = Math.min(point.intensity / 10, 1);
                      
                      return (
                        <div
                          key={index}
                          className="absolute rounded-full animate-pulse"
                          style={{
                            left: screenPos.x - 30,
                            top: screenPos.y - 30,
                            width: 60,
                            height: 60,
                            background: `radial-gradient(circle, rgba(239, 68, 68, ${intensity * 0.4}) 0%, rgba(239, 68, 68, ${intensity * 0.2}) 50%, transparent 100%)`,
                            border: `1px solid rgba(239, 68, 68, ${intensity * 0.8})`,
                            boxShadow: `0 0 20px rgba(239, 68, 68, ${intensity * 0.3})`
                          }}
                        ></div>
                      );
                    })}
                  </div>
                )}
              </div>

            {/* Map Controls */}
            <div className="absolute top-4 right-4 space-y-2">
              <button
                onClick={() => setZoom(Math.min(zoom + 2, 20))}
                className="w-8 h-8 bg-white shadow-lg rounded border flex items-center justify-center hover:bg-gray-50"
              >
                +
              </button>
              <button
                onClick={() => setZoom(Math.max(zoom - 2, 10))}
                className="w-8 h-8 bg-white shadow-lg rounded border flex items-center justify-center hover:bg-gray-50"
              >
                -
              </button>
            </div>

              {/* Map Controls */}
              <div className="absolute top-4 right-4 space-y-2">
                <button
                  onClick={() => setZoom(Math.min(zoom + 2, 20))}
                  className="w-8 h-8 bg-white dark:bg-gray-700 shadow-lg rounded border border-gray-200 dark:border-gray-600 flex items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-bold"
                  title="Zoom In"
                >
                  +
                </button>
                <button
                  onClick={() => setZoom(Math.max(zoom - 2, 10))}
                  className="w-8 h-8 bg-white dark:bg-gray-700 shadow-lg rounded border border-gray-200 dark:border-gray-600 flex items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 font-bold"
                  title="Zoom Out"
                >
                  -
                </button>
                <button
                  onClick={resetMapView}
                  className="w-8 h-8 bg-white dark:bg-gray-700 shadow-lg rounded border border-gray-200 dark:border-gray-600 flex items-center justify-center hover:bg-gray-50 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 text-xs"
                  title="Reset View"
                >
                  ⌂
                </button>
              </div>
              
              {/* Compass */}
              <div className="absolute top-4 left-4 bg-white dark:bg-gray-800 rounded-full shadow-lg border border-gray-200 dark:border-gray-700 p-2 w-12 h-12 flex items-center justify-center">
                <div className="text-red-500 font-bold text-sm transform rotate-0">N</div>
              </div>
              
              {/* Scale Indicator */}
              <div className="absolute bottom-16 left-4 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-2">
                <div className="flex items-center space-x-2 text-xs text-gray-600 dark:text-gray-400">
                  <div className="w-16 h-1 bg-gray-400 relative">
                    <div className="absolute left-0 top-0 w-1 h-3 bg-gray-400"></div>
                    <div className="absolute right-0 top-0 w-1 h-3 bg-gray-400"></div>
                  </div>
                  <span>{Math.round(100 / (zoom / 16))}m</span>
                </div>
              </div>

              {/* Map Instructions */}
              <div className="absolute bottom-4 right-4 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-3 text-xs text-gray-600 dark:text-gray-400">
                <div className="space-y-1">
                  <div className="flex items-center"><span className="mr-2">🖱️</span>Drag to pan</div>
                  <div className="flex items-center"><span className="mr-2">🔍</span>Scroll to zoom</div>
                  <div className="flex items-center"><span className="mr-2">📱</span>Touch & drag on mobile</div>
                </div>
              </div>

              {/* Selected Entity Info */}
              {selectedEntity && (
                <div className="absolute bottom-4 left-4 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-4 max-w-sm">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-medium text-gray-900 dark:text-white">{selectedEntity.name}</h3>
                    <button
                      onClick={() => setSelectedEntity(null)}
                      className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                    >
                      <XMarkIcon className="h-4 w-4" />
                    </button>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center text-gray-600 dark:text-gray-400">
                      <span className="w-2 h-2 rounded-full mr-2" style={{ backgroundColor: getEntityColor(selectedEntity.type) }}></span>
                      <span className="capitalize">{selectedEntity.type}</span>
                      {selectedEntity.department && (
                        <span className="ml-2 text-gray-500">• {selectedEntity.department}</span>
                      )}
                    </div>
                    <div className="flex items-center text-gray-600 dark:text-gray-400">
                      <MapPinIcon className="h-4 w-4 mr-2" />
                      <span>{selectedEntity.location.building}</span>
                    </div>
                    {selectedEntity.location.room && (
                      <div className="flex items-center text-gray-600 dark:text-gray-400">
                        <BuildingOfficeIcon className="h-4 w-4 mr-2" />
                        <span>{selectedEntity.location.room}</span>
                      </div>
                    )}
                    <div className="flex items-center text-gray-600 dark:text-gray-400">
                      <ClockIcon className="h-4 w-4 mr-2" />
                      <span>Last seen: {selectedEntity.lastSeen.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-600">
                      <div className="flex items-center text-gray-600 dark:text-gray-400">
                        <span className="mr-2">Confidence:</span>
                        <span className="font-medium text-gray-900 dark:text-white">{(selectedEntity.confidence * 100).toFixed(1)}%</span>
                      </div>
                      <div className="flex items-center text-gray-600 dark:text-gray-400">
                        <span className="mr-2">Activity:</span>
                        <span className="capitalize font-medium text-gray-900 dark:text-white">{selectedEntity.activity}</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Loading Overlay */}
      {loading && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 flex items-center space-x-3">
            <LoadingSpinner size="large" />
            <span className="text-gray-900 dark:text-white">Loading campus map data...</span>
          </div>
        </div>
      )}
        </>
      ) : (
        /* Spatial Forecasting Tab Content */
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-6">
          <SpatialForecasting
            isOpen={true}
            onClose={() => setActiveTab('map')}
            embedded={true}
          />
        </div>
      )}
    </div>
  );
};

export default CampusMap;