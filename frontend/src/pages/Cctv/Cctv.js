import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { getToken } from '../../services/api';
import LoadingSpinner from '../../components/Common/LoadingSpinner';
import { useAlert } from '../../contexts/AlertContext';
import { CameraIcon, EyeIcon, CalendarIcon, MapPinIcon } from '@heroicons/react/24/outline';

const Cctv = ({ initialTab, embedded = false } = {}) => {
  const navigate = useNavigate();
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [photoUrl, setPhotoUrl] = useState(null);
  const [activeTab, setActiveTab] = useState(initialTab || 'recognition'); // 'recognition' or 'frames'
  
  // CCTV Frames state
  const [frames, setFrames] = useState([]);
  const [framesLoading, setFramesLoading] = useState(false);
  const [filters, setFilters] = useState({
    location: '',
    date_from: '',
    date_to: '',
    has_face: ''
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    pages: 0
  });
  
  const { showError, showSuccess } = useAlert();

  const onFileChange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setResult(null);
    setPhotoUrl(null); // Reset photo URL when changing files
  };

  // Load CCTV frames
  const loadFrames = async (resetPage = false) => {
    setFramesLoading(true);
    try {
      const token = getToken();
      const currentPage = resetPage ? 1 : pagination.page;
      
      const queryParams = new URLSearchParams({
        page: currentPage,
        limit: pagination.limit,
        ...filters
      });
      
      const apiBase = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
      const response = await fetch(`${apiBase}/cctv/frames?${queryParams}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to load CCTV frames');
      }
      
      const data = await response.json();
      setFrames(data.frames);
      setPagination(prev => ({
        ...prev,
        page: currentPage,
        total: data.total,
        pages: data.pages
      }));
      
      if (resetPage) {
        setPagination(prev => ({ ...prev, page: 1 }));
      }
    } catch (error) {
      console.error('Error loading frames:', error);
      showError('Failed to load CCTV frames');
    } finally {
      setFramesLoading(false);
    }
  };

  // Handle filter changes
  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  // Apply filters
  const applyFilters = () => {
    loadFrames(true);
  };

  // Reset filters
  const resetFilters = () => {
    setFilters({
      location: '',
      date_from: '',
      date_to: '',
      has_face: ''
    });
    setPagination(prev => ({ ...prev, page: 1 }));
    loadFrames(true);
  };

  // Change page
  const changePage = (newPage) => {
    setPagination(prev => ({ ...prev, page: newPage }));
    setTimeout(() => loadFrames(), 0);
  };

  // Load frames when component mounts
  useEffect(() => {
    if (activeTab === 'frames') {
      loadFrames();
    }
  }, [activeTab]);

  // respond to prop changes
  useEffect(() => {
    if (initialTab && initialTab !== activeTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab]);

  const loadEntityPhoto = async (entityId) => {
    try {
      const token = getToken();
      if (!token) return;

      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3001/api'}/photos/entity/${entityId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        setPhotoUrl(url);
      }
    } catch (error) {
      console.warn('Failed to load entity photo:', error);
    }
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    if (!file) return showError('No file', 'Please select an image to upload');

    setLoading(true);
    setResult(null);

    try {
      const token = getToken();
      if (!token) return showError('Not authenticated', 'Please log in first');

      const fd = new FormData();
      fd.append('image', file);

      const response = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:3001/api'}/cctv/recognize`, {
        method: 'POST',
        body: fd,
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await response.json();

      if (!response.ok) {
        showError('Recognition failed', data.message || JSON.stringify(data));
        setLoading(false);
        return;
      }

      setResult(data);
      // Scroll to the result area after rendering so the user sees the match
      setTimeout(() => {
        if (resultRef.current) {
          resultRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } else {
          window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
        }
      }, 100);
      
      // Load the photo with authentication if entity is found
      if (data.entity && data.confidence > 0) {
        loadEntityPhoto(data.entity._id);
        showSuccess('Recognition complete', `Match found with ${(data.confidence * 100).toFixed(1)}% confidence`);
      } else {
        showSuccess('Recognition complete', 'No matching face found in database');
      }
    } catch (err) {
      console.error(err);
      showError('Upload error', err.message || String(err));
    } finally {
      setLoading(false);
    }
  };

  const resultRef = useRef(null);

  return (
    <div className="space-y-6">
      {/* Tab Navigation (hidden when embedded to avoid duplicate tabs) */}
      {!embedded && (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg">
          <div className="border-b border-gray-200 dark:border-gray-700">
            <nav className="-mb-px flex">
              <button
                onClick={() => setActiveTab('recognition')}
                className={`py-4 px-6 text-sm font-medium border-b-2 ${
                  activeTab === 'recognition'
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <CameraIcon className="w-4 h-4" />
                  <span>Face Recognition</span>
                </div>
              </button>
              <button
                onClick={() => setActiveTab('frames')}
                className={`py-4 px-6 text-sm font-medium border-b-2 ${
                  activeTab === 'frames'
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <EyeIcon className="w-4 h-4" />
                  <span>CCTV Frames</span>
                </div>
              </button>
            </nav>
          </div>
        </div>
      )}

      {/* Face Recognition Tab */}
      {activeTab === 'recognition' && (
        <>
          <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
            <h2 className="text-lg font-medium text-gray-900 dark:text-white">CCTV Face Recognition</h2>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">Upload an image from CCTV and try to match against known faces.</p>

            <form onSubmit={onSubmit} className="mt-4 space-y-4">
              <div>
                <input type="file" accept="image/*" onChange={onFileChange} />
              </div>

              {preview && (
                <div className="mt-2">
                  <img src={preview} alt="preview" className="max-w-xs rounded-lg" />
                </div>
              )}

              <div className="flex items-center space-x-2">
                <button type="submit" disabled={loading} className="px-4 py-2 bg-blue-600 text-white rounded-md">
                  {loading ? <span className="flex items-center"><LoadingSpinner size="small" /> Processing...</span> : 'Find Match'}
                </button>
                <button type="button" onClick={() => { 
                  if (photoUrl) {
                    URL.revokeObjectURL(photoUrl);
                    setPhotoUrl(null);
                  }
                  setFile(null); 
                  setPreview(null); 
                  setResult(null); 
                }} className="px-4 py-2 border rounded-md text-gray-700 dark:text-gray-300">Clear</button>
              </div>
            </form>
          </div>

          {result && (
            <div ref={resultRef} className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
              <h3 className="text-md font-medium text-gray-900 dark:text-white">Result</h3>
              {result.entity ? (
                <div className="mt-4">
                  <div className="flex items-center space-x-4">
                    <div className="w-16 h-16 rounded-full overflow-hidden bg-gray-200">
                      {photoUrl ? (
                        <img 
                          src={photoUrl} 
                          alt="matched person" 
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full bg-gray-300 flex items-center justify-center text-gray-600 text-xs">
                          No Photo
                        </div>
                      )}
                    </div>
                    <div>
                      <p className="text-lg font-semibold">{result.entity.profile?.name || 'Unknown Person'}</p>
                      <p className="text-sm text-gray-500">ID: {result.entity._id}</p>
                      <p className="text-sm text-gray-500">Face ID: {result.match?.face_id || 'N/A'}</p>
                      <p className="text-sm text-gray-500">Confidence: {(result.confidence * 100).toFixed(1)}%</p>
                      <button
                        onClick={() => navigate(
                          `/entities/${result.entity._id}`,
                          { state: { from: embedded ? '/entities' : '/cctv', fromTab: activeTab } }
                        )}
                        className="text-sm text-blue-600 hover:underline"
                      >
                        View Details
                      </button>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="mt-4 text-sm text-gray-500">No matching entity found.</div>
              )}
            </div>
          )}
        </>
      )}

      {/* CCTV Frames Tab */}
      {activeTab === 'frames' && (
        <>
          {/* Filters */}
          <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
            <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">CCTV Frames</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  <MapPinIcon className="w-4 h-4 inline mr-1" />
                  Location
                </label>
                <input
                  type="text"
                  value={filters.location}
                  onChange={(e) => handleFilterChange('location', e.target.value)}
                  placeholder="e.g., Building A"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  <CalendarIcon className="w-4 h-4 inline mr-1" />
                  From Date
                </label>
                <input
                  type="date"
                  value={filters.date_from}
                  onChange={(e) => handleFilterChange('date_from', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  <CalendarIcon className="w-4 h-4 inline mr-1" />
                  To Date
                </label>
                <input
                  type="date"
                  value={filters.date_to}
                  onChange={(e) => handleFilterChange('date_to', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  <EyeIcon className="w-4 h-4 inline mr-1" />
                  Face Detection
                </label>
                <select
                  value={filters.has_face}
                  onChange={(e) => handleFilterChange('has_face', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                >
                  <option value="">All Frames</option>
                  <option value="true">With Face</option>
                  <option value="false">Without Face</option>
                </select>
              </div>
            </div>
            <div className="mt-4 flex space-x-2">
              <button
                onClick={applyFilters}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Apply Filters
              </button>
              <button
                onClick={resetFilters}
                className="px-4 py-2 border border-gray-300 text-gray-800 rounded-md hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700"
              >
                Reset
              </button>
            </div>
          </div>

          {/* Frames Data */}
          <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
            {framesLoading ? (
              <div className="flex justify-center py-8">
                <LoadingSpinner />
              </div>
            ) : (
              <>
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-md font-medium text-gray-900 dark:text-white">
                    CCTV Frames ({pagination.total} total)
                  </h3>
                </div>

                {frames.length > 0 ? (
                  <>
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                        <thead className="bg-gray-50 dark:bg-gray-700">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                              Frame ID
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                              Location
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                              Timestamp
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                              Face Detected
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                              Face ID
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                          {frames.map((frame) => (
                            <tr key={frame.frame_id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                                {frame.frame_id}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                                {frame.location_id}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                                {new Date(frame.timestamp).toLocaleString()}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                {frame.face_id ? (
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100">
                                    Yes
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
                                    No
                                  </span>
                                )}
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                                {frame.face_id || 'N/A'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination */}
                    {pagination.pages > 1 && (
                      <div className="mt-6 flex items-center justify-between">
            <div className="text-sm text-gray-900 dark:text-gray-300">
              Showing page {pagination.page} of {pagination.pages}
            </div>
                        <div className="flex space-x-1">
                          <button
                            onClick={() => changePage(pagination.page - 1)}
                            disabled={pagination.page === 1}
                            className="px-3 py-2 text-sm border rounded-md text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700"
                          >
                            Previous
                          </button>
                          {[...Array(Math.min(5, pagination.pages))].map((_, i) => {
                            const pageNum = Math.max(1, pagination.page - 2) + i;
                            if (pageNum > pagination.pages) return null;
                              return (
                              <button
                                key={pageNum}
                                onClick={() => changePage(pageNum)}
                                className={`px-3 py-2 text-sm border rounded-md ${
                                  pageNum === pagination.page
                                    ? 'bg-blue-600 text-white border-blue-600'
                                    : 'text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700'
                                }`}
                              >
                                {pageNum}
                              </button>
                            );
                          })}
                          <button
                            onClick={() => changePage(pagination.page + 1)}
                            disabled={pagination.page === pagination.pages}
                            className="px-3 py-2 text-sm border rounded-md text-gray-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700"
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-center py-8">
                    <EyeIcon className="mx-auto h-12 w-12 text-gray-400" />
                    <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">No frames found</h3>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      Try adjusting your filters to see more results.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default Cctv;
