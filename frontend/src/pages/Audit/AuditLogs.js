import React, { useState, useEffect } from 'react';
import { auditAPI, handleAPIError } from '../../services/api';
import { useAlert } from '../../contexts/AlertContext';
import LoadingSpinner from '../../components/Common/LoadingSpinner';
import {
  DocumentTextIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  CalendarIcon,
  UserIcon,
  ComputerDesktopIcon,
  ExclamationTriangleIcon,
  InformationCircleIcon,
  CheckCircleIcon,
  XCircleIcon,
  ClockIcon,
  EyeIcon,
  ArrowDownTrayIcon
} from '@heroicons/react/24/outline';

const AuditLogs = () => {
  const [auditLogs, setAuditLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    dateRange: '7d',
    action: '',
    user: '',
    resource: '',
    status: ''
  });
  const [searchTerm, setSearchTerm] = useState('');
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 50,
    total: 0,
    hasMore: false
  });
  const [selectedLog, setSelectedLog] = useState(null);

  const { showError } = useAlert();

  useEffect(() => {
    loadAuditLogs();
  }, [filters, searchTerm, pagination.page]);

  const loadAuditLogs = async () => {
    try {
      setLoading(true);
      const params = {
        page: pagination.page,
        limit: pagination.limit,
        dateRange: filters.dateRange,
        action: filters.action || undefined,
        user: filters.user || undefined,
        resource: filters.resource || undefined,
        status: filters.status || undefined,
        search: searchTerm || undefined
      };

      const response = await auditAPI.getLogs(params);
      const data = response.data.data || [];

      if (pagination.page === 1) {
        setAuditLogs(data);
      } else {
        setAuditLogs(prev => [...prev, ...data]);
      }

      setPagination(prev => ({
        ...prev,
        total: response.data.total || 0,
        hasMore: data.length === prev.limit
      }));
    } catch (error) {
      const errorInfo = handleAPIError(error);
      showError('Error Loading Audit Logs', errorInfo.message);
    } finally {
      setLoading(false);
    }
  };

  const generateMockAuditLogs = () => [
    {
      _id: '1',
      timestamp: new Date(Date.now() - 3600000),
      user: { email: 'admin@campus.edu', name: 'System Administrator' },
      action: 'LOGIN',
      resource: '/api/auth/login',
      ip_address: '192.168.1.100',
      user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      status: 'SUCCESS',
      details: { method: 'POST', response_time: 245 }
    },
    {
      _id: '2',
      timestamp: new Date(Date.now() - 7200000),
      user: { email: 'security@campus.edu', name: 'Security Officer' },
      action: 'VIEW_ENTITY',
      resource: '/api/entities/12345',
      ip_address: '192.168.1.101',
      user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      status: 'SUCCESS',
      details: { method: 'GET', response_time: 156, entity_id: '12345' }
    },
    {
      _id: '3',
      timestamp: new Date(Date.now() - 10800000),
      user: { email: 'operator@campus.edu', name: 'System Operator' },
      action: 'CREATE_ALERT',
      resource: '/api/alerts',
      ip_address: '192.168.1.102',
      user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      status: 'SUCCESS',
      details: { method: 'POST', response_time: 892, alert_type: 'MANUAL' }
    },
    {
      _id: '4',
      timestamp: new Date(Date.now() - 14400000),
      user: { email: 'unknown@campus.edu', name: 'Unknown User' },
      action: 'LOGIN',
      resource: '/api/auth/login',
      ip_address: '10.0.0.50',
      user_agent: 'curl/7.68.0',
      status: 'FAILED',
      details: { method: 'POST', response_time: 1200, error: 'Invalid credentials' }
    },
    {
      _id: '5',
      timestamp: new Date(Date.now() - 18000000),
      user: { email: 'admin@campus.edu', name: 'System Administrator' },
      action: 'DELETE_USER',
      resource: '/api/users/67890',
      ip_address: '192.168.1.100',
      user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      status: 'SUCCESS',
      details: { method: 'DELETE', response_time: 345, user_id: '67890' }
    }
  ];

  const getActionIcon = (action) => {
    const icons = {
      LOGIN: UserIcon,
      LOGOUT: UserIcon,
      VIEW_ENTITY: EyeIcon,
      CREATE_ALERT: ExclamationTriangleIcon,
      DELETE_USER: XCircleIcon,
      UPDATE_USER: UserIcon,
      EXPORT_DATA: ArrowDownTrayIcon,
      SYSTEM_ACCESS: ComputerDesktopIcon
    };
    return icons[action] || InformationCircleIcon;
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'SUCCESS':
        return 'text-green-600 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-900/30 dark:border-green-700';
      case 'FAILED':
        return 'text-red-600 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-900/30 dark:border-red-700';
      case 'WARNING':
        return 'text-yellow-600 bg-yellow-50 border-yellow-200 dark:text-yellow-400 dark:bg-yellow-900/30 dark:border-yellow-700';
      default:
        return 'text-gray-600 bg-gray-50 border-gray-200 dark:text-gray-400 dark:bg-gray-900/30 dark:border-gray-700';
    }
  };

  const getActionColor = (action) => {
    const colors = {
      LOGIN: 'text-blue-600 bg-blue-50 border-blue-200 dark:text-blue-400 dark:bg-blue-900/30 dark:border-blue-700',
      LOGOUT: 'text-gray-600 bg-gray-50 border-gray-200 dark:text-gray-400 dark:bg-gray-900/30 dark:border-gray-700',
      VIEW_ENTITY: 'text-green-600 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-900/30 dark:border-green-700',
      CREATE_ALERT: 'text-orange-600 bg-orange-50 border-orange-200 dark:text-orange-400 dark:bg-orange-900/30 dark:border-orange-700',
      DELETE_USER: 'text-red-600 bg-red-50 border-red-200 dark:text-red-400 dark:bg-red-900/30 dark:border-red-700',
      UPDATE_USER: 'text-purple-600 bg-purple-50 border-purple-200 dark:text-purple-400 dark:bg-purple-900/30 dark:border-purple-700',
      EXPORT_DATA: 'text-indigo-600 bg-indigo-50 border-indigo-200 dark:text-indigo-400 dark:bg-indigo-900/30 dark:border-indigo-700',
      SYSTEM_ACCESS: 'text-cyan-600 bg-cyan-50 border-cyan-200 dark:text-cyan-400 dark:bg-cyan-900/30 dark:border-cyan-700'
    };
    return colors[action] || 'text-gray-600 bg-gray-50 border-gray-200 dark:text-gray-400 dark:bg-gray-900/30 dark:border-gray-700';
  };

  const handleExport = async () => {
    try {
      const response = await auditAPI.exportLogs(filters);
      const blob = new Blob([response.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-logs-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      showError('Export Failed', 'Unable to export audit logs');
    }
  };

  const filteredLogs = auditLogs.filter(log => {
    if (searchTerm && !log.user.email.toLowerCase().includes(searchTerm.toLowerCase()) &&
      !log.action.toLowerCase().includes(searchTerm.toLowerCase()) &&
      !log.resource.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }
    if (filters.action && log.action !== filters.action) return false;
    if (filters.user && !log.user.email.includes(filters.user)) return false;
    if (filters.resource && !log.resource.includes(filters.resource)) return false;
    if (filters.status && log.status !== filters.status) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center space-x-3">
            <div className="flex-shrink-0">
              <DocumentTextIcon className="h-8 w-8 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Audit Logs
              </h1>
              <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                System access and activity audit trail
              </p>
            </div>
          </div>

          <div className="mt-4 sm:mt-0">
            <button
              onClick={handleExport}
              className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:bg-blue-500 dark:hover:bg-blue-600"
            >
              <ArrowDownTrayIcon className="h-4 w-4 mr-2" />
              Export Logs
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-gray-800 shadow-lg rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
          {/* Search */}
          <div className="lg:col-span-2">
            <div className="relative">
              <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search logs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2 w-full border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Date Range */}
          <div>
            <select
              value={filters.dateRange}
              onChange={(e) => setFilters(prev => ({ ...prev, dateRange: e.target.value }))}
              className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              <option value="1d">Last 24 Hours</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="90d">Last 90 Days</option>
            </select>
          </div>

          {/* Action Filter */}
          <div>
            <select
              value={filters.action}
              onChange={(e) => setFilters(prev => ({ ...prev, action: e.target.value }))}
              className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              <option value="">All Actions</option>
              <option value="LOGIN">Login</option>
              <option value="LOGOUT">Logout</option>
              <option value="VIEW_ENTITY">View Entity</option>
              <option value="CREATE_ALERT">Create Alert</option>
              <option value="DELETE_USER">Delete User</option>
              <option value="UPDATE_USER">Update User</option>
              <option value="EXPORT_DATA">Export Data</option>
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              value={filters.status}
              onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
              className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              <option value="">All Status</option>
              <option value="SUCCESS">Success</option>
              <option value="FAILED">Failed</option>
              <option value="WARNING">Warning</option>
            </select>
          </div>

          {/* Clear Filters */}
          <div>
            <button
              onClick={() => {
                setFilters({ dateRange: '7d', action: '', user: '', resource: '', status: '' });
                setSearchTerm('');
              }}
              className="w-full px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-600 border border-gray-300 dark:border-gray-500 rounded-md hover:bg-gray-50 dark:hover:bg-gray-500"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      {/* Audit Logs Table */}
      <div className="bg-white dark:bg-gray-800 shadow-lg rounded-xl border border-gray-200 dark:border-gray-700">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white flex items-center">
            <DocumentTextIcon className="h-5 w-5 mr-2" />
            Audit Trail ({filteredLogs.length})
          </h2>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner size="large" text="Loading audit logs..." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-s font-medium text-gray-500 dark:text-black uppercase tracking-wider">
                    Timestamp
                  </th>
                  <th className="px-6 py-3 text-left text-s font-medium text-gray-500 dark:text-black uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-6 py-3 text-left text-s font-medium text-gray-500 dark:text-black uppercase tracking-wider">
                    Action
                  </th>
                  <th className="px-6 py-3 text-left text-s font-medium text-gray-500 dark:text-black uppercase tracking-wider">
                    Resource
                  </th>
                  <th className="px-6 py-3 text-left text-s font-medium text-gray-500 dark:text-black uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-s font-medium text-gray-500 dark:text-black uppercase tracking-wider">
                    IP Address
                  </th>
                  <th className="px-6 py-3 text-right text-s font-medium text-gray-500 dark:text-black uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {filteredLogs.map((log) => {
                  const ActionIcon = getActionIcon(log.action);
                  return (
                    <tr key={log._id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                        <div className="flex items-center">
                          <ClockIcon className="h-4 w-4 text-gray-400 mr-2" />
                          <div>
                            <div>{new Date(log.timestamp).toLocaleDateString()}</div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {new Date(log.timestamp).toLocaleTimeString()}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="flex-shrink-0 h-8 w-8">
                            <div className="h-8 w-8 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center">
                              <UserIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
                            </div>
                          </div>
                          <div className="ml-3">
                            <div className="text-sm font-medium text-gray-900 dark:text-white">
                              {log.user.name}
                            </div>
                            <div className="text-sm text-gray-500 dark:text-gray-400">
                              {log.user.email}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getActionColor(log.action)}`}>
                          <ActionIcon className="h-3 w-3 mr-1" />
                          {log.action.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white font-mono">
                        {log.resource}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(log.status)}`}>
                          {log.status === 'SUCCESS' ? (
                            <CheckCircleIcon className="h-3 w-3 mr-1" />
                          ) : log.status === 'FAILED' ? (
                            <XCircleIcon className="h-3 w-3 mr-1" />
                          ) : (
                            <ExclamationTriangleIcon className="h-3 w-3 mr-1" />
                          )}
                          {log.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white font-mono">
                        {log.ip_address}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button
                          onClick={() => setSelectedLog(log)}
                          className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                        >
                          <EyeIcon className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {filteredLogs.length === 0 && !loading && (
              <div className="text-center py-12">
                <DocumentTextIcon className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">No audit logs found</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {searchTerm || Object.values(filters).some(f => f)
                    ? 'Try adjusting your search or filters.'
                    : 'No audit logs have been recorded yet.'
                  }
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Load More */}
      {pagination.hasMore && !loading && (
        <div className="text-center">
          <button
            onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
            className="px-6 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 bg-white dark:bg-gray-800 border border-blue-600 dark:border-blue-400 rounded-md hover:bg-blue-50 dark:hover:bg-gray-700"
          >
            Load More Logs
          </button>
        </div>
      )}

      {/* Log Detail Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={() => setSelectedLog(null)}></div>
            <div className="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-2xl sm:w-full sm:p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                  Audit Log Details
                </h3>
                <button
                  onClick={() => setSelectedLog(null)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <XCircleIcon className="h-6 w-6" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Timestamp</label>
                    <p className="text-sm text-gray-900 dark:text-white">{new Date(selectedLog.timestamp).toLocaleString()}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Status</label>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(selectedLog.status)}`}>
                      {selectedLog.status}
                    </span>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">User</label>
                    <p className="text-sm text-gray-900 dark:text-white">{selectedLog.user.name} ({selectedLog.user.email})</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Action</label>
                    <p className="text-sm text-gray-900 dark:text-white">{selectedLog.action.replace('_', ' ')}</p>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Resource</label>
                    <p className="text-sm text-gray-900 dark:text-white font-mono">{selectedLog.resource}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">IP Address</label>
                    <p className="text-sm text-gray-900 dark:text-white font-mono">{selectedLog.ip_address}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Response Time</label>
                    <p className="text-sm text-gray-900 dark:text-white">{selectedLog.details?.response_time}ms</p>
                  </div>
                </div>

                {selectedLog.user_agent && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">User Agent</label>
                    <p className="text-sm text-gray-900 dark:text-white break-all">{selectedLog.user_agent}</p>
                  </div>
                )}

                {selectedLog.details && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">Additional Details</label>
                    <pre className="text-sm text-gray-900 dark:text-white bg-gray-100 dark:bg-gray-700 p-3 rounded-md overflow-x-auto">
                      {JSON.stringify(selectedLog.details, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuditLogs;