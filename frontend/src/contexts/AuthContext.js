import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../services/api';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(localStorage.getItem('token'));

  useEffect(() => {
    const initializeAuth = async () => {
      const storedToken = localStorage.getItem('token');
      const storedUser = localStorage.getItem('user');

      if (storedToken && storedUser) {
        try {
          // Set token in API headers
          api.defaults.headers.common['Authorization'] = `Bearer ${storedToken}`;
          
          // Parse stored user
          const parsedUser = JSON.parse(storedUser);
          setUser(parsedUser);
          setToken(storedToken);
        } catch (error) {
          console.error('Error parsing stored user:', error);
          logout();
        }
      }
      
      setLoading(false);
    };

    initializeAuth();
  }, []);

  const login = async (email, password) => {
    try {
      setLoading(true);
      
      const response = await api.post('/auth/login', {
        email,
        password
      });

      const { token: newToken, user: userData } = response.data;

      // Store in localStorage
      localStorage.setItem('token', newToken);
      localStorage.setItem('user', JSON.stringify(userData));

      // Set in API headers
      api.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;

      // Update state
      setToken(newToken);
      setUser(userData);

      return { success: true };
    } catch (error) {
      console.error('Login error:', error);
      
      const errorMessage = error.response?.data?.error || 'Login failed';
      return { 
        success: false, 
        error: errorMessage 
      };
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      // Call logout endpoint if token exists
      if (token) {
        await api.post('/auth/logout');
      }
    } catch (error) {
      console.error('Logout error:', error);
    } finally {
      // Clear local storage
      localStorage.removeItem('token');
      localStorage.removeItem('user');

      // Clear API headers
      delete api.defaults.headers.common['Authorization'];

      // Clear state
      setToken(null);
      setUser(null);
    }
  };

  const updateUser = (userData) => {
    const updatedUser = { ...user, ...userData };
    setUser(updatedUser);
    localStorage.setItem('user', JSON.stringify(updatedUser));
  };

  const hasPermission = (requiredRoles) => {
    if (!user) return false;
    if (!requiredRoles || requiredRoles.length === 0) return true;
    return requiredRoles.includes(user.role);
  };

  const isAdmin = () => {
    return user?.role === 'ADMIN';
  };

  const isSecurityOfficer = () => {
    return user?.role === 'SECURITY_OFFICER';
  };

  const canAccessAnalytics = () => {
    return hasPermission(['ADMIN', 'SECURITY_OFFICER', 'OPERATOR']);
  };

  const canManageUsers = () => {
    return hasPermission(['ADMIN', 'SECURITY_OFFICER']);
  };

  const canViewAuditLogs = () => {
    return hasPermission(['ADMIN', 'SECURITY_OFFICER']);
  };

  const canManagePrivacy = () => {
    return hasPermission(['ADMIN']);
  };

  const value = {
    user,
    token,
    loading,
    login,
    logout,
    updateUser,
    hasPermission,
    isAdmin,
    isSecurityOfficer,
    canAccessAnalytics,
    canManageUsers,
    canViewAuditLogs,
    canManagePrivacy
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};