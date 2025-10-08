import React, { useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { useSocket } from '../../contexts/SocketContext';
import AccessibilitySettings from '../Accessibility/AccessibilitySettings';
import { 
  Bars3Icon,
  BellIcon,
  MoonIcon,
  SunIcon,
  UserCircleIcon,
  Cog6ToothIcon,
  ArrowRightOnRectangleIcon,
  AdjustmentsHorizontalIcon
} from '@heroicons/react/24/outline';

const Navbar = ({ onMenuClick }) => {
  const { user, logout } = useAuth();
  const { isDarkMode, toggleTheme } = useTheme();
  const { connected } = useSocket();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showAccessibilitySettings, setShowAccessibilitySettings] = useState(false);

  const handleLogout = async () => {
    await logout();
    setShowUserMenu(false);
  };

  return (
    <nav className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-16">
          {/* Left side */}
          <div className="flex items-center">
            <button
              onClick={onMenuClick}
              className="p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500 lg:hidden"
            >
              <Bars3Icon className="h-6 w-6" />
            </button>
            
            <div className="flex-shrink-0 flex items-center ml-4 lg:ml-0">
              <h1 className="text-xl font-semibold text-gray-900 dark:text-white">
                Campus Security System
              </h1>
            </div>
          </div>

          {/* Right side */}
          <div className="flex items-center space-x-4">
            {/* Connection status */}
            <div className="flex items-center">
              <div 
                className={`w-2 h-2 rounded-full ${
                  connected ? 'bg-green-500' : 'bg-red-500'
                }`}
                title={connected ? 'Connected' : 'Disconnected'}
              />
              <span className="ml-2 text-sm text-gray-500 dark:text-gray-400 hidden sm:block">
                {connected ? 'Live' : 'Offline'}
              </span>
            </div>

            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              className="p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
              title={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              {isDarkMode ? (
                <SunIcon className="h-5 w-5" />
              ) : (
                <MoonIcon className="h-5 w-5" />
              )}
            </button>

            {/* Accessibility settings */}
            <button
              onClick={() => setShowAccessibilitySettings(true)}
              className="p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
              title="Accessibility settings"
              aria-label="Open accessibility settings"
            >
              <AdjustmentsHorizontalIcon className="h-5 w-5" />
            </button>

            {/* Notifications */}
            <button className="p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500">
              <BellIcon className="h-5 w-5" />
            </button>

            {/* User menu */}
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-blue-500"
              >
                <UserCircleIcon className="h-6 w-6" />
                <span className="ml-2 text-sm font-medium text-gray-700 dark:text-gray-300 hidden sm:block">
                  {user?.profile?.name || user?.email}
                </span>
              </button>

              {showUserMenu && (
                <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-md shadow-lg py-1 z-50 border border-gray-200 dark:border-gray-700">
                  <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {user?.profile?.name || 'User'}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {user?.email}
                    </p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                      Role: {user?.role}
                    </p>
                  </div>
                  
                  <a
                    href="/settings"
                    className="flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                    onClick={() => setShowUserMenu(false)}
                  >
                    <Cog6ToothIcon className="h-4 w-4 mr-2" />
                    Settings
                  </a>
                  
                  <button
                    onClick={handleLogout}
                    className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                  >
                    <ArrowRightOnRectangleIcon className="h-4 w-4 mr-2" />
                    Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Click outside to close user menu */}
      {showUserMenu && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowUserMenu(false)}
        />
      )}

      {/* Accessibility Settings Modal */}
      <AccessibilitySettings 
        isOpen={showAccessibilitySettings}
        onClose={() => setShowAccessibilitySettings(false)}
      />
    </nav>
  );
};

export default Navbar;