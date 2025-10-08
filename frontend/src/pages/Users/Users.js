import React, { useState, useEffect, useCallback } from 'react';
import { usersAPI, handleAPIError } from '../../services/api';
import { useAlert } from '../../contexts/AlertContext';
import { useAuth } from '../../contexts/AuthContext';
import LoadingSpinner from '../../components/Common/LoadingSpinner';
import {
  UserIcon,
  PlusIcon,
  PencilIcon,
  TrashIcon,
  MagnifyingGlassIcon,
  FunnelIcon,
  ShieldCheckIcon,
  EyeIcon,
  EyeSlashIcon,
  ClockIcon,
  ArrowPathIcon,
  UsersIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';

const Users = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterLoading, setFilterLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [stats, setStats] = useState(null);
  const [saving, setSaving] = useState(false);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    hasMore: false
  });

  const { showError, showSuccess } = useAlert();
  const { user: currentUser } = useAuth();

  const loadUsers = useCallback(async (showFilterLoading = false) => {
    try {
      if (showFilterLoading) {
        setFilterLoading(true);
      } else {
        setLoading(true);
      }

      const params = {
        page: pagination.page,
        limit: pagination.limit,
        search: searchTerm || undefined,
        role: roleFilter !== 'all' ? roleFilter : undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined
      };

      const response = await usersAPI.getAll(params);
      const data = response.data.data || [];
      
      if (pagination.page === 1) {
        setUsers(data);
      } else {
        setUsers(prev => [...prev, ...data]);
      }
      
      setPagination(prev => ({
        ...prev,
        total: response.data.total || 0,
        hasMore: data.length === prev.limit
      }));

      setLastUpdated(new Date());
      
      // Calculate stats from loaded data
      const userStats = {
        total: response.data.total || 0,
        active: data.filter(u => u.status === 'active').length,
        inactive: data.filter(u => u.status === 'inactive').length,
        byRole: data.reduce((acc, user) => {
          acc[user.role] = (acc[user.role] || 0) + 1;
          return acc;
        }, {})
      };
      setStats(userStats);

    } catch (error) {
      const errorInfo = handleAPIError(error);
      showError('Error Loading Users', errorInfo.message);
    } finally {
      setLoading(false);
      setFilterLoading(false);
    }
  }, [pagination.page, pagination.limit, searchTerm, roleFilter, statusFilter, showError]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);



  const handleCreateUser = async (userData) => {
    try {
      setSaving(true);
      await usersAPI.create(userData);
      showSuccess('User Created', 'User has been created successfully');
      setShowCreateModal(false);
      loadUsers();
    } catch (error) {
      const errorInfo = handleAPIError(error);
      showError('Error Creating User', errorInfo.message);
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateUser = async (userId, userData) => {
    try {
      setSaving(true);
      await usersAPI.update(userId, userData);
      showSuccess('User Updated', 'User has been updated successfully');
      setEditingUser(null);
      loadUsers();
    } catch (error) {
      const errorInfo = handleAPIError(error);
      showError('Error Updating User', errorInfo.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!window.confirm('Are you sure you want to delete this user?')) return;
    
    try {
      await usersAPI.delete(userId);
      showSuccess('User Deleted', 'User has been deleted successfully');
      loadUsers();
    } catch (error) {
      const errorInfo = handleAPIError(error);
      showError('Error Deleting User', errorInfo.message);
    }
  };

  const getRoleColor = (role) => {
    const colors = {
      ADMIN: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-700',
      SECURITY_OFFICER: 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-700',
      OPERATOR: 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-700',
      VIEWER: 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-900/30 dark:text-gray-300 dark:border-gray-700'
    };
    return colors[role] || colors.VIEWER;
  };

  const getStatusColor = (status) => {
    return status === 'active' 
      ? 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-700'
      : 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-900/30 dark:text-gray-300 dark:border-gray-700';
  };

  const filteredUsers = users.filter(user => {
    if (searchTerm && !user.profile?.name?.toLowerCase().includes(searchTerm.toLowerCase()) && 
        !user.email.toLowerCase().includes(searchTerm.toLowerCase())) {
      return false;
    }
    if (roleFilter !== 'all' && user.role !== roleFilter) return false;
    if (statusFilter !== 'all' && user.status !== statusFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between">
          <div className="flex-1">
            <div className="flex items-center space-x-3">
              <div className="flex-shrink-0">
                <UsersIcon className="h-8 w-8 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  User Management
                </h1>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  Manage system users and their permissions
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
              <button
                onClick={() => loadUsers(true)}
                disabled={filterLoading}
                className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-lg text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-blue-500 dark:hover:bg-blue-600"
              >
                <ArrowPathIcon className="h-4 w-4 mr-1" />
                Refresh
              </button>
              <button
                onClick={() => setShowCreateModal(true)}
                className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-lg text-white bg-green-600 hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
              >
                <PlusIcon className="h-4 w-4 mr-2" />
                Add User
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {/* Total Users */}
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
                      Total Users
                    </dt>
                    <dd className="text-2xl font-bold text-gray-900 dark:text-white">
                      {filterLoading ? (
                        <div className="animate-pulse bg-gray-200 dark:bg-gray-700 h-8 w-16 rounded"></div>
                      ) : (
                        stats.total?.toLocaleString() || '0'
                      )}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          {/* Active Users */}
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
                      Active Users
                    </dt>
                    <dd className="text-2xl font-bold text-gray-900 dark:text-white">
                      {filterLoading ? (
                        <div className="animate-pulse bg-gray-200 dark:bg-gray-700 h-8 w-16 rounded"></div>
                      ) : (
                        stats.active?.toLocaleString() || '0'
                      )}
                    </dd>
                    {stats.total > 0 && (
                      <dd className="text-xs text-green-600 dark:text-green-400 font-medium">
                        {((stats.active / stats.total) * 100).toFixed(1)}% active
                      </dd>
                    )}
                  </dl>
                </div>
              </div>
            </div>
          </div>

          {/* Inactive Users */}
          <div className="bg-white dark:bg-gray-800 overflow-hidden shadow-lg rounded-xl border border-gray-200 dark:border-gray-700 hover:shadow-xl transition-all duration-200 transform hover:-translate-y-1">
            <div className="p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 bg-gray-100 dark:bg-gray-900/30 rounded-lg flex items-center justify-center">
                    <EyeSlashIcon className="h-6 w-6 text-gray-600 dark:text-gray-400" />
                  </div>
                </div>
                <div className="ml-4 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
                      Inactive Users
                    </dt>
                    <dd className="text-2xl font-bold text-gray-900 dark:text-white">
                      {filterLoading ? (
                        <div className="animate-pulse bg-gray-200 dark:bg-gray-700 h-8 w-16 rounded"></div>
                      ) : (
                        stats.inactive?.toLocaleString() || '0'
                      )}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>

          {/* Admin Users */}
          <div className="bg-white dark:bg-gray-800 overflow-hidden shadow-lg rounded-xl border border-gray-200 dark:border-gray-700 hover:shadow-xl transition-all duration-200 transform hover:-translate-y-1">
            <div className="p-6">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="w-12 h-12 bg-red-100 dark:bg-red-900/30 rounded-lg flex items-center justify-center">
                    <ShieldCheckIcon className="h-6 w-6 text-red-600 dark:text-red-400" />
                  </div>
                </div>
                <div className="ml-4 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 dark:text-gray-400 truncate">
                      Admin Users
                    </dt>
                    <dd className="text-2xl font-bold text-gray-900 dark:text-white">
                      {filterLoading ? (
                        <div className="animate-pulse bg-gray-200 dark:bg-gray-700 h-8 w-16 rounded"></div>
                      ) : (
                        (stats.byRole?.ADMIN || 0).toLocaleString()
                      )}
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
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">Filter Users</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Search */}
          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <MagnifyingGlassIcon className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Search users..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md leading-5 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          
          {/* Role Filter */}
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">All Roles</option>
            <option value="ADMIN">Admin</option>
            <option value="SECURITY_OFFICER">Security Officer</option>
            <option value="OPERATOR">Operator</option>
            <option value="VIEWER">Viewer</option>
          </select>
          
          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="all">All Status</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>

          {/* Clear Filters */}
          <button
            onClick={() => {
              setSearchTerm('');
              setRoleFilter('all');
              setStatusFilter('all');
            }}
            className="px-4 py-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <FunnelIcon className="h-4 w-4 mr-2 inline" />
            Clear Filters
          </button>
        </div>
      </div>

      {/* Users List */}
      <div className="bg-white dark:bg-gray-800 shadow-lg rounded-xl border border-gray-200 dark:border-gray-700">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">
            Users ({filteredUsers.length})
          </h2>
        </div>
        
        {loading && users.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <LoadingSpinner size="large" text="Loading users..." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th className="px-6 py-3 text-left text-s font-medium text-gray-500 dark:text-black uppercase tracking-wider">
                    User
                  </th>
                  <th className="px-6 py-3 text-left text-s font-medium text-gray-500 dark:text-black uppercase tracking-wider">
                    Role
                  </th>
                  <th className="px-6 py-3 text-left text-s font-medium text-gray-500 dark:text-black uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-s font-medium text-gray-500 dark:text-black uppercase tracking-wider">
                    Last Login
                  </th>
                  <th className="px-6 py-3 text-left text-s font-medium text-gray-500 dark:text-black uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-3 text-right text-s font-medium text-gray-500 dark:text-black uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {filteredUsers.map((user) => (
                  <tr key={user._id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-10 w-10">
                          <div className="h-10 w-10 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center">
                            <UserIcon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
                          </div>
                        </div>
                        <div className="ml-4">
                          <div className="text-sm font-medium text-gray-900 dark:text-white">
                            {user.profile?.name || 'Unknown'}
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400">
                            {user.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getRoleColor(user.role)}`}>
                        <ShieldCheckIcon className="h-3 w-3 mr-1" />
                        {user.role.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getStatusColor(user.status)}`}>
                        {user.status === 'active' ? (
                          <EyeIcon className="h-3 w-3 mr-1" />
                        ) : (
                          <EyeSlashIcon className="h-3 w-3 mr-1" />
                        )}
                        {user.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {user.lastLogin ? new Date(user.lastLogin).toLocaleDateString() : 'Never'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          onClick={() => setEditingUser(user)}
                          className="text-blue-600 hover:text-blue-900 dark:text-blue-400 dark:hover:text-blue-300"
                        >
                          <PencilIcon className="h-4 w-4" />
                        </button>
                        {currentUser?._id !== user._id && (
                          <button
                            onClick={() => handleDeleteUser(user._id)}
                            className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-300"
                          >
                            <TrashIcon className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            
            {filteredUsers.length === 0 && !loading && (
              <div className="text-center py-12">
                <UserIcon className="mx-auto h-12 w-12 text-gray-400" />
                <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">No users found</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {searchTerm || roleFilter !== 'all' || statusFilter !== 'all'
                    ? 'Try adjusting your search or filters.'
                    : 'Get started by creating a new user.'
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
            Load More Users
          </button>
        </div>
      )}

      {/* Create/Edit Modal */}
      {(showCreateModal || editingUser) && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
            <div className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity" onClick={() => {
              setShowCreateModal(false);
              setEditingUser(null);
            }}></div>
            <div className="inline-block align-bottom bg-white dark:bg-gray-800 rounded-xl px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6 border border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                  {editingUser ? 'Edit User' : 'Create User'}
                </h3>
                <button
                  onClick={() => {
                    setShowCreateModal(false);
                    setEditingUser(null);
                  }}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  <XMarkIcon className="h-6 w-6" />
                </button>
              </div>
              
              <UserForm
                user={editingUser}
                onSave={editingUser ? handleUpdateUser : handleCreateUser}
                onCancel={() => {
                  setShowCreateModal(false);
                  setEditingUser(null);
                }}
                saving={saving}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// UserForm Component
const UserForm = ({ user, onSave, onCancel, saving }) => {
  const [formData, setFormData] = useState({
    email: user?.email || '',
    name: user?.profile?.name || '',
    role: user?.role || 'VIEWER',
    status: user?.status || 'active',
    password: '',
    confirmPassword: ''
  });
  const [errors, setErrors] = useState({});

  const validateForm = () => {
    const newErrors = {};

    if (!formData.email) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Email is invalid';
    }

    if (!formData.name) {
      newErrors.name = 'Name is required';
    }

    if (!user && !formData.password) {
      newErrors.password = 'Password is required for new users';
    }

    if (formData.password && formData.password.length < 6) {
      newErrors.password = 'Password must be at least 6 characters';
    }

    if (formData.password && formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (validateForm()) {
      const userData = {
        email: formData.email,
        profile: { name: formData.name },
        role: formData.role,
        status: formData.status
      };

      if (formData.password) {
        userData.password = formData.password;
      }

      if (user) {
        onSave(user._id, userData);
      } else {
        onSave(userData);
      }
    }
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Name Field */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Full Name *
        </label>
        <input
          type="text"
          value={formData.name}
          onChange={(e) => handleChange('name', e.target.value)}
          className={`w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            errors.name ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
          }`}
          placeholder="Enter full name"
        />
        {errors.name && <p className="mt-1 text-sm text-red-600">{errors.name}</p>}
      </div>

      {/* Email Field */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Email Address *
        </label>
        <input
          type="email"
          value={formData.email}
          onChange={(e) => handleChange('email', e.target.value)}
          className={`w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${
            errors.email ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
          }`}
          placeholder="Enter email address"
        />
        {errors.email && <p className="mt-1 text-sm text-red-600">{errors.email}</p>}
      </div>

      {/* Role Field */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Role *
        </label>
        <select
          value={formData.role}
          onChange={(e) => handleChange('role', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="VIEWER">Viewer</option>
          <option value="OPERATOR">Operator</option>
          <option value="SECURITY_OFFICER">Security Officer</option>
          <option value="ADMIN">Admin</option>
        </select>
      </div>

      {/* Status Field */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Status
        </label>
        <select
          value={formData.status}
          onChange={(e) => handleChange('status', e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
        </select>
      </div>

      {/* Password Fields (only for new users or when changing password) */}
      {(!user || formData.password) && (
        <>
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Password {!user && '*'}
            </label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) => handleChange('password', e.target.value)}
              className={`w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                errors.password ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
              }`}
              placeholder={user ? "Leave blank to keep current password" : "Enter password"}
            />
            {errors.password && <p className="mt-1 text-sm text-red-600">{errors.password}</p>}
          </div>

          {formData.password && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Confirm Password *
              </label>
              <input
                type="password"
                value={formData.confirmPassword}
                onChange={(e) => handleChange('confirmPassword', e.target.value)}
                className={`w-full px-3 py-2 border rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                  errors.confirmPassword ? 'border-red-500' : 'border-gray-300 dark:border-gray-600'
                }`}
                placeholder="Confirm password"
              />
              {errors.confirmPassword && <p className="mt-1 text-sm text-red-600">{errors.confirmPassword}</p>}
            </div>
          )}
        </>
      )}

      {/* Action Buttons */}
      <div className="flex justify-end space-x-3 pt-4 border-t border-gray-200 dark:border-gray-700">
        <button
          type="button"
          onClick={onCancel}
          disabled={saving}
          className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 flex items-center"
        >
          {saving && (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
          )}
          {user ? 'Update User' : 'Create User'}
        </button>
      </div>
    </form>
  );
};

export default Users;