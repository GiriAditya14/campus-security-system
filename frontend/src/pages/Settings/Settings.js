import { useState, useEffect } from 'react';
import { useTheme } from '../../contexts/ThemeContext';
import { settingsAPI, handleAPIError } from '../../services/api';
import { useAlert } from '../../contexts/AlertContext';
import AccessibilitySettings from '../../components/Accessibility/AccessibilitySettings';
import LoadingSpinner from '../../components/Common/LoadingSpinner';
import {
  Cog6ToothIcon,
  BellIcon,
  ShieldCheckIcon,
  ServerIcon,
  ChartBarIcon
} from '@heroicons/react/24/outline';

const Settings = () => {
  const [activeTab, setActiveTab] = useState('general');
  const [showAccessibilityModal, setShowAccessibilityModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({
    notifications: {
      email: true,
      push: true,
      alerts: true,
      reports: false
    },
    privacy: {
      dataRetention: '90',
      anonymization: true,
      auditLogging: true
    },
    system: {
      autoRefresh: true,
      refreshInterval: '30',
      maxResults: '100',
      timezone: 'UTC'
    },
    alerts: {
      threshold: '0.8',
      cooldown: '300',
      escalation: true
    }
  });

  const { theme } = useTheme();
  const { showError, showSuccess } = useAlert();

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setLoading(true);
      const response = await settingsAPI.getSettings();
      setSettings(response.data.data);
    } catch (error) {
      const errorInfo = handleAPIError(error);
      showError('Error Loading Settings', errorInfo.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSettingChange = async (category, key, value) => {
    try {
      setSaving(true);
      
      // Update local state immediately for better UX
      const updatedSettings = {
        ...settings,
        [category]: {
          ...settings[category],
          [key]: value
        }
      };
      setSettings(updatedSettings);

      // Save to backend
      await settingsAPI.updateSettings(updatedSettings);
      showSuccess('Settings Updated', 'Your settings have been saved successfully');
    } catch (error) {
      const errorInfo = handleAPIError(error);
      showError('Error Updating Settings', errorInfo.message);
      
      // Revert local state on error
      loadSettings();
    } finally {
      setSaving(false);
    }
  };

  const handleResetSettings = async () => {
    try {
      setSaving(true);
      const response = await settingsAPI.resetSettings();
      setSettings(response.data.data);
      showSuccess('Settings Reset', 'All settings have been reset to defaults');
    } catch (error) {
      const errorInfo = handleAPIError(error);
      showError('Error Resetting Settings', errorInfo.message);
    } finally {
      setSaving(false);
    }
  };

  const handleSaveAllSettings = async () => {
    try {
      setSaving(true);
      await settingsAPI.updateSettings(settings);
      showSuccess('Settings Saved', 'All settings have been saved successfully');
    } catch (error) {
      const errorInfo = handleAPIError(error);
      showError('Error Saving Settings', errorInfo.message);
    } finally {
      setSaving(false);
    }
  };

  const tabs = [
    { id: 'general', name: 'General', icon: Cog6ToothIcon },
    { id: 'notifications', name: 'Notifications', icon: BellIcon },
    { id: 'privacy', name: 'Privacy', icon: ShieldCheckIcon },
    { id: 'system', name: 'System', icon: ServerIcon },
    { id: 'alerts', name: 'Alerts', icon: ChartBarIcon }
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <LoadingSpinner size="large" text="Loading settings..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <div className="flex items-center space-x-3">
          <div className="flex-shrink-0">
            <Cog6ToothIcon className="h-8 w-8 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Settings
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Manage your application preferences and system configuration
            </p>
          </div>
        </div>
      </div>

      <div>
        {/* Horizontal tabs (matches EntitySearch / Users style) */}
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg">
          <div className="px-6 pt-4">
            <div className="flex -mb-px space-x-1 overflow-auto">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`py-2 px-4 text-sm font-medium rounded-t-md ${activeTab === tab.id ? 'bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-200' : 'text-gray-500 hover:text-gray-700 dark:text-gray-300'}`}>
                  {tab.name}
                </button>
              ))}
            </div>
          </div>
          <div className="p-6 bg-white dark:bg-gray-800 rounded-b-lg">
            {activeTab === 'general' && (
              <div>
                <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-6">
                  General Settings
                </h2>

                <div className="space-y-6">
                  {/* Theme */}
                  <div>
                    <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">
                      Appearance
                    </h3>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-700 dark:text-gray-300">Theme</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Current theme: {theme === 'dark' ? 'Dark' : 'Light'}
                        </p>
                      </div>
                      <button
                        onClick={() => setShowAccessibilityModal(true)}
                        className="px-4 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                      >
                        Accessibility Settings
                      </button>
                    </div>
                  </div>

                  {/* Language */}
                  <div>
                    <h3 className="text-sm font-medium text-gray-900 dark:text-white mb-3">
                      Language & Region
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm text-gray-700 dark:text-gray-300 mb-2">
                          Language
                        </label>
                        <select className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500">
                          <option>English (US)</option>
                          <option>English (UK)</option>
                          <option>Spanish</option>
                          <option>French</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm text-gray-700 dark:text-gray-300 mb-2">
                          Timezone
                        </label>
                        <select
                          value={settings.system.timezone}
                          onChange={(e) => handleSettingChange('system', 'timezone', e.target.value)}
                          disabled={saving}
                          className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 disabled:opacity-50"
                        >
                          <option value="UTC">UTC</option>
                          <option value="America/New_York">Eastern Time</option>
                          <option value="America/Chicago">Central Time</option>
                          <option value="America/Denver">Mountain Time</option>
                          <option value="America/Los_Angeles">Pacific Time</option>
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'notifications' && (
              <div className="p-6">
                <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-6">
                  Notification Preferences
                </h2>

                <div className="space-y-6">
                  {Object.entries(settings.notifications).map(([key, value]) => (
                    <div key={key} className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 capitalize">
                          {key.replace(/([A-Z])/g, ' $1')} Notifications
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Receive {key} notifications via your preferred method
                        </p>
                      </div>
                      <button
                        onClick={() => handleSettingChange('notifications', key, !value)}
                        disabled={saving}
                        className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 ${value ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-600'
                          }`}
                      >
                        <span
                          className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${value ? 'translate-x-5' : 'translate-x-0'
                            }`}
                        />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {activeTab === 'privacy' && (
              <div className="p-6">
                <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-6">
                  Privacy & Security
                </h2>

                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Data Retention Period (days)
                    </label>
                    <select
                      value={settings.privacy.dataRetention}
                      onChange={(e) => handleSettingChange('privacy', 'dataRetention', e.target.value)}
                      disabled={saving}
                      className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 disabled:opacity-50"
                    >
                      <option value="30">30 days</option>
                      <option value="90">90 days</option>
                      <option value="180">180 days</option>
                      <option value="365">1 year</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Data Anonymization
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Automatically anonymize personal data in exports
                      </p>
                    </div>
                    <button
                      onClick={() => handleSettingChange('privacy', 'anonymization', !settings.privacy.anonymization)}
                      disabled={saving}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 ${settings.privacy.anonymization ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-600'
                        }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${settings.privacy.anonymization ? 'translate-x-5' : 'translate-x-0'
                          }`}
                      />
                    </button>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Audit Logging
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Log all user actions for security auditing
                      </p>
                    </div>
                    <button
                      onClick={() => handleSettingChange('privacy', 'auditLogging', !settings.privacy.auditLogging)}
                      disabled={saving}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 ${settings.privacy.auditLogging ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-600'
                        }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${settings.privacy.auditLogging ? 'translate-x-5' : 'translate-x-0'
                          }`}
                      />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'system' && (
              <div className="p-6">
                <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-6">
                  System Configuration
                </h2>

                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Auto Refresh
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Automatically refresh data in real-time
                      </p>
                    </div>
                    <button
                      onClick={() => handleSettingChange('system', 'autoRefresh', !settings.system.autoRefresh)}
                      disabled={saving}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 ${settings.system.autoRefresh ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-600'
                        }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${settings.system.autoRefresh ? 'translate-x-5' : 'translate-x-0'
                          }`}
                      />
                    </button>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Refresh Interval (seconds)
                    </label>
                    <select
                      value={settings.system.refreshInterval}
                      onChange={(e) => handleSettingChange('system', 'refreshInterval', e.target.value)}
                      disabled={!settings.system.autoRefresh || saving}
                      className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 disabled:opacity-50"
                    >
                      <option value="10">10 seconds</option>
                      <option value="30">30 seconds</option>
                      <option value="60">1 minute</option>
                      <option value="300">5 minutes</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Maximum Results Per Page
                    </label>
                    <select
                      value={settings.system.maxResults}
                      onChange={(e) => handleSettingChange('system', 'maxResults', e.target.value)}
                      disabled={saving}
                      className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 disabled:opacity-50"
                    >
                      <option value="25">25</option>
                      <option value="50">50</option>
                      <option value="100">100</option>
                      <option value="200">200</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'alerts' && (
              <div className="p-6">
                <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-6">
                  Alert Configuration
                </h2>

                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Alert Threshold
                    </label>
                    <div className="flex items-center space-x-4">
                      <input
                        type="range"
                        min="0.1"
                        max="1.0"
                        step="0.1"
                        value={settings.alerts.threshold}
                        onChange={(e) => handleSettingChange('alerts', 'threshold', e.target.value)}
                        disabled={saving}
                        className="flex-1 disabled:opacity-50"
                      />
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        {(parseFloat(settings.alerts.threshold) * 100).toFixed(0)}%
                      </span>
                    </div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Minimum confidence level to trigger alerts
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Alert Cooldown (seconds)
                    </label>
                    <select
                      value={settings.alerts.cooldown}
                      onChange={(e) => handleSettingChange('alerts', 'cooldown', e.target.value)}
                      disabled={saving}
                      className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 disabled:opacity-50"
                    >
                      <option value="60">1 minute</option>
                      <option value="300">5 minutes</option>
                      <option value="600">10 minutes</option>
                      <option value="1800">30 minutes</option>
                    </select>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      Minimum time between similar alerts
                    </p>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                        Alert Escalation
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        Escalate unacknowledged critical alerts
                      </p>
                    </div>
                    <button
                      onClick={() => handleSettingChange('alerts', 'escalation', !settings.alerts.escalation)}
                      disabled={saving}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 ${settings.alerts.escalation ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-600'
                        }`}
                    >
                      <span
                        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${settings.alerts.escalation ? 'translate-x-5' : 'translate-x-0'
                          }`}
                      />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Save Button */}
            <div className="px-6 py-4  border-t border-gray-200 dark:border-gray-600 rounded-b-lg">
              <div className="flex items-center justify-end space-x-3">
                <button
                  onClick={handleResetSettings}
                  disabled={saving}
                  className="h-10 px-4 text-sm font-medium text-gray-700 dark:text-gray-200 bg-transparent dark:bg-transparent border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
                >
                  {saving ? 'Resetting...' : 'Reset'}
                </button>
                <button
                  onClick={handleSaveAllSettings}
                  disabled={saving}
                  className="h-10 px-5 text-sm font-semibold text-white bg-blue-600 dark:bg-blue-600 rounded-lg shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Accessibility Modal */}
      <AccessibilitySettings
        isOpen={showAccessibilityModal}
        onClose={() => setShowAccessibilityModal(false)}
      />
    </div>
  );
};

export default Settings;