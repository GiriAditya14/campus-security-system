import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
  HomeIcon,
  UsersIcon,
  MapIcon,
  ChartBarIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  Cog6ToothIcon,
  ShieldCheckIcon,
  DocumentTextIcon,
  EyeSlashIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';

const Sidebar = ({ isOpen, onClose }) => {
  const location = useLocation();
  const { user, canAccessAnalytics, canManageUsers, canViewAuditLogs, canManagePrivacy } = useAuth();

  const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: HomeIcon, current: location.pathname === '/dashboard' },
    { name: 'Entity Search', href: '/entities', icon: UsersIcon, current: location.pathname === '/entities' },
    { name: 'Timeline', href: '/timeline', icon: ClockIcon, current: location.pathname === '/timeline' },
    { name: 'Campus Map', href: '/map', icon: MapIcon, current: location.pathname === '/map' },
    { name: 'Alerts', href: '/alerts', icon: ExclamationTriangleIcon, current: location.pathname === '/alerts' },
  ];

  // Add conditional navigation items based on permissions
  if (canAccessAnalytics()) {
    navigation.push({
      name: 'Analytics',
      href: '/analytics',
      icon: ChartBarIcon,
      current: location.pathname === '/analytics'
    });
  }

  if (canManageUsers()) {
    navigation.push({
      name: 'User Management',
      href: '/users',
      icon: ShieldCheckIcon,
      current: location.pathname === '/users'
    });
  }

  if (canViewAuditLogs()) {
    navigation.push({
      name: 'Audit Logs',
      href: '/audit',
      icon: DocumentTextIcon,
      current: location.pathname === '/audit'
    });
  }

  if (canManagePrivacy()) {
    navigation.push({
      name: 'Privacy Settings',
      href: '/privacy',
      icon: EyeSlashIcon,
      current: location.pathname === '/privacy'
    });
  }

  navigation.push({
    name: 'Settings',
    href: '/settings',
    icon: Cog6ToothIcon,
    current: location.pathname === '/settings'
  });

  return (
    <>
      {/* Mobile sidebar overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="fixed inset-0 bg-gray-600 bg-opacity-75" onClick={onClose} />
        </div>
      )}

      {/* Sidebar */}
      <div className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-gray-800 shadow-lg transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex items-center justify-between h-16 px-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Navigation
          </h2>
          <button
            onClick={onClose}
            className="lg:hidden p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        <nav className="mt-5 px-2 space-y-1">
          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.name}
                to={item.href}
                onClick={onClose}
                className={`
                  group flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors
                  ${item.current
                    ? 'bg-blue-100 text-blue-900 dark:bg-blue-900 dark:text-blue-200'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:text-white'
                  }
                `}
              >
                <Icon
                  className={`
                    mr-3 flex-shrink-0 h-6 w-6
                    ${item.current
                      ? 'text-blue-500 dark:text-blue-300'
                      : 'text-gray-400 group-hover:text-gray-500 dark:group-hover:text-gray-300'
                    }
                  `}
                />
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* User info at bottom */}
        <div className="absolute bottom-0 left-0 right-0 p-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                <span className="text-sm font-medium text-white">
                  {user?.profile?.name?.charAt(0) || user?.email?.charAt(0) || 'U'}
                </span>
              </div>
            </div>
            <div className="ml-3 flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                {user?.profile?.name || 'User'}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                {user?.role}
              </p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Sidebar;