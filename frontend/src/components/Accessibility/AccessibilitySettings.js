import React, { useState } from 'react';
import { 
  SunIcon, 
  MoonIcon, 
  EyeIcon,
  AdjustmentsHorizontalIcon,
  SpeakerWaveIcon,
  CommandLineIcon,
  XMarkIcon
} from '@heroicons/react/24/outline';
import { useTheme } from '../../contexts/ThemeContext';

const AccessibilitySettings = ({ isOpen, onClose }) => {
  const { 
    theme, 
    toggleTheme, 
    highContrast, 
    toggleHighContrast, 
    fontSize, 
    changeFontSize,
    reducedMotion,
    setReducedMotion
  } = useTheme();

  const [announcements, setAnnouncements] = useState(() => {
    return localStorage.getItem('announcements') !== 'false';
  });

  const [keyboardNavigation, setKeyboardNavigation] = useState(() => {
    return localStorage.getItem('keyboardNavigation') !== 'false';
  });

  const handleAnnouncementsChange = (enabled) => {
    setAnnouncements(enabled);
    localStorage.setItem('announcements', enabled.toString());
  };

  const handleKeyboardNavigationChange = (enabled) => {
    setKeyboardNavigation(enabled);
    localStorage.setItem('keyboardNavigation', enabled.toString());
    
    // Add/remove keyboard navigation styles
    if (enabled) {
      document.body.classList.add('keyboard-navigation');
    } else {
      document.body.classList.remove('keyboard-navigation');
    }
  };

  const handleReducedMotionChange = (enabled) => {
    setReducedMotion(enabled);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto" role="dialog" aria-modal="true" aria-labelledby="accessibility-title">
      <div className="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0">
        {/* Background overlay */}
        <div 
          className="fixed inset-0 bg-gray-500 bg-opacity-75 transition-opacity"
          aria-hidden="true"
          onClick={onClose}
        ></div>

        {/* Modal panel */}
        <div className="inline-block align-bottom bg-white dark:bg-gray-800 rounded-lg px-4 pt-5 pb-4 text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full sm:p-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <h2 id="accessibility-title" className="text-lg font-semibold text-gray-900 dark:text-white">
              Accessibility Settings
            </h2>
            <button
              onClick={onClose}
              className="rounded-md text-gray-400 hover:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              aria-label="Close accessibility settings"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          {/* Settings */}
          <div className="space-y-6">
            {/* Theme */}
            <div>
              <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3 flex items-center">
                {theme === 'dark' ? (
                  <MoonIcon className="h-4 w-4 mr-2" />
                ) : (
                  <SunIcon className="h-4 w-4 mr-2" />
                )}
                Theme
              </h3>
              <div className="space-y-2">
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="theme"
                    value="light"
                    checked={theme === 'light'}
                    onChange={() => toggleTheme()}
                    className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300"
                  />
                  <span className="ml-3 text-sm text-gray-700 dark:text-gray-300">Light mode</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="theme"
                    value="dark"
                    checked={theme === 'dark'}
                    onChange={() => toggleTheme()}
                    className="focus:ring-blue-500 h-4 w-4 text-blue-600 border-gray-300"
                  />
                  <span className="ml-3 text-sm text-gray-700 dark:text-gray-300">Dark mode</span>
                </label>
              </div>
            </div>

            {/* High Contrast */}
            <div>
              <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3 flex items-center">
                <EyeIcon className="h-4 w-4 mr-2" />
                Visual
              </h3>
              <div className="space-y-3">
                <label className="flex items-center justify-between">
                  <span className="text-sm text-gray-700 dark:text-gray-300">High contrast mode</span>
                  <button
                    onClick={toggleHighContrast}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                      highContrast ? 'bg-blue-600' : 'bg-gray-200'
                    }`}
                    role="switch"
                    aria-checked={highContrast}
                    aria-labelledby="high-contrast-label"
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                        highContrast ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </label>

                <div>
                  <label className="block text-sm text-gray-700 dark:text-gray-300 mb-2">
                    Font size
                  </label>
                  <select
                    value={fontSize}
                    onChange={(e) => changeFontSize(e.target.value)}
                    className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                  >
                    <option value="small">Small</option>
                    <option value="normal">Normal</option>
                    <option value="large">Large</option>
                    <option value="extra-large">Extra Large</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Motion */}
            <div>
              <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3 flex items-center">
                <AdjustmentsHorizontalIcon className="h-4 w-4 mr-2" />
                Motion
              </h3>
              <label className="flex items-center justify-between">
                <span className="text-sm text-gray-700 dark:text-gray-300">Reduce motion</span>
                <button
                  onClick={() => handleReducedMotionChange(!reducedMotion)}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                    reducedMotion ? 'bg-blue-600' : 'bg-gray-200'
                  }`}
                  role="switch"
                  aria-checked={reducedMotion}
                  aria-labelledby="reduced-motion-label"
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      reducedMotion ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </label>
            </div>

            {/* Audio */}
            <div>
              <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3 flex items-center">
                <SpeakerWaveIcon className="h-4 w-4 mr-2" />
                Audio
              </h3>
              <label className="flex items-center justify-between">
                <span className="text-sm text-gray-700 dark:text-gray-300">Screen reader announcements</span>
                <button
                  onClick={() => handleAnnouncementsChange(!announcements)}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                    announcements ? 'bg-blue-600' : 'bg-gray-200'
                  }`}
                  role="switch"
                  aria-checked={announcements}
                  aria-labelledby="announcements-label"
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      announcements ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </label>
            </div>

            {/* Keyboard Navigation */}
            <div>
              <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3 flex items-center">
                <CommandLineIcon className="h-4 w-4 mr-2" />
                Navigation
              </h3>
              <label className="flex items-center justify-between">
                <span className="text-sm text-gray-700 dark:text-gray-300">Enhanced keyboard navigation</span>
                <button
                  onClick={() => handleKeyboardNavigationChange(!keyboardNavigation)}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${
                    keyboardNavigation ? 'bg-blue-600' : 'bg-gray-200'
                  }`}
                  role="switch"
                  aria-checked={keyboardNavigation}
                  aria-labelledby="keyboard-navigation-label"
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                      keyboardNavigation ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </label>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
            <p className="text-xs text-gray-500 dark:text-gray-400">
              These settings are saved locally and will persist across sessions.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AccessibilitySettings;