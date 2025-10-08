import { useState, useEffect } from 'react';
import { privacyAPI, handleAPIError } from '../../services/api';
import { useAlert } from '../../contexts/AlertContext';
import LoadingSpinner from '../../components/Common/LoadingSpinner';
import {
  ShieldCheckIcon,
  EyeSlashIcon,
  DocumentTextIcon,
  ExclamationTriangleIcon,
  KeyIcon,
  UserGroupIcon,
  ClockIcon,
  ChartBarIcon
} from '@heroicons/react/24/outline';

const Privacy = () => {
  const [privacySettings, setPrivacySettings] = useState(null);
  const [complianceReport, setComplianceReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('settings');
  const [saving, setSaving] = useState(false);

  const { showError, showSuccess } = useAlert();

  useEffect(() => {
    loadPrivacyData();
  }, []);

  const loadPrivacyData = async () => {
    try {
      setLoading(true);
      const [settingsResponse, reportResponse] = await Promise.all([
        privacyAPI.getSettings(),
        privacyAPI.getComplianceReport()
      ]);

      setPrivacySettings(settingsResponse.data.data);
      setComplianceReport(reportResponse.data.data);
    } catch (error) {
      const errorInfo = handleAPIError(error);
      showError('Error Loading Privacy Data', errorInfo.message);
    } finally {
      setLoading(false);
    }
  };



  const handleSettingChange = async (category, key, value) => {
    try {
      setSaving(true);
      const updatedSettings = {
        ...privacySettings,
        [category]: {
          ...privacySettings[category],
          [key]: value
        }
      };

      await privacyAPI.updateSettings(updatedSettings);
      setPrivacySettings(updatedSettings);
      showSuccess('Settings Updated', 'Privacy settings have been updated successfully');
    } catch (error) {
      const errorInfo = handleAPIError(error);
      showError('Error Updating Settings', errorInfo.message);
    } finally {
      setSaving(false);
    }
  };

  const getComplianceColor = (score) => {
    if (score >= 95) return 'text-green-600 bg-green-50 border-green-200';
    if (score >= 85) return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    return 'text-red-600 bg-red-50 border-red-200';
  };

  const getRiskColor = (level) => {
    switch (level) {
      case 'high': return 'text-red-600 bg-red-50 border-red-200';
      case 'medium': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'low': return 'text-green-600 bg-green-50 border-green-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <LoadingSpinner size="large" text="Loading privacy settings..." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
        <div className="flex items-center space-x-3">
          <div className="flex-shrink-0">
            <ShieldCheckIcon className="h-8 w-8 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              Privacy & Data Protection
            </h1>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
              Manage data privacy settings and compliance monitoring
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-gray-700">
        <nav className="flex space-x-8">
          {[
            { id: 'settings', name: 'Privacy Settings', icon: ShieldCheckIcon },
            { id: 'compliance', name: 'Compliance Report', icon: DocumentTextIcon },
            { id: 'data-flow', name: 'Data Flow', icon: ChartBarIcon }
          ].map(tab => {
            const IconComponent = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center ${activeTab === tab.id
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300 dark:text-gray-400 dark:hover:text-gray-300'
                  }`}
              >
                <IconComponent className="h-4 w-4 mr-2" />
                {tab.name}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Content */}
      {activeTab === 'settings' && privacySettings && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Data Retention */}
          <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4 flex items-center">
              <ClockIcon className="h-5 w-5 mr-2" />
              Data Retention
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Enable Data Retention Policy
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Automatically delete old data based on retention period
                  </p>
                </div>
                <button
                  onClick={() => handleSettingChange('dataRetention', 'enabled', !privacySettings.dataRetention.enabled)}
                  disabled={saving}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${privacySettings.dataRetention.enabled ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-600'
                    }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${privacySettings.dataRetention.enabled ? 'translate-x-5' : 'translate-x-0'
                      }`}
                  />
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Retention Period (days)
                </label>
                <select
                  value={privacySettings.dataRetention.period}
                  onChange={(e) => handleSettingChange('dataRetention', 'period', parseInt(e.target.value))}
                  disabled={!privacySettings.dataRetention.enabled || saving}
                  className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 disabled:opacity-50"
                >
                  <option value="30">30 days</option>
                  <option value="90">90 days</option>
                  <option value="180">180 days</option>
                  <option value="365">1 year</option>
                </select>
              </div>
            </div>
          </div>

          {/* Data Anonymization */}
          <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4 flex items-center">
              <EyeSlashIcon className="h-5 w-5 mr-2" />
              Data Anonymization
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Enable Anonymization
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Automatically anonymize sensitive data fields
                  </p>
                </div>
                <button
                  onClick={() => handleSettingChange('anonymization', 'enabled', !privacySettings.anonymization.enabled)}
                  disabled={saving}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${privacySettings.anonymization.enabled ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-600'
                    }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${privacySettings.anonymization.enabled ? 'translate-x-5' : 'translate-x-0'
                      }`}
                  />
                </button>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Anonymization Level
                </label>
                <select
                  value={privacySettings.anonymization.level}
                  onChange={(e) => handleSettingChange('anonymization', 'level', e.target.value)}
                  disabled={!privacySettings.anonymization.enabled || saving}
                  className="w-full rounded-md border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm focus:border-blue-500 focus:ring-blue-500 disabled:opacity-50"
                >
                  <option value="partial">Partial (Names, IDs)</option>
                  <option value="full">Full (All PII)</option>
                  <option value="custom">Custom Fields</option>
                </select>
              </div>
            </div>
          </div>

          {/* Encryption */}
          <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4 flex items-center">
              <KeyIcon className="h-5 w-5 mr-2" />
              Data Encryption
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Enable Encryption
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Encrypt sensitive data at rest and in transit
                  </p>
                </div>
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200">
                  Enabled
                </span>
              </div>

              <div className="text-sm text-gray-600 dark:text-gray-400">
                <p><strong>Algorithm:</strong> {privacySettings.encryption.algorithm}</p>
                <p><strong>Key Rotation:</strong> {privacySettings.encryption.keyRotation ? 'Enabled' : 'Disabled'}</p>
              </div>
            </div>
          </div>

          {/* Access Control */}
          <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4 flex items-center">
              <UserGroupIcon className="h-5 w-5 mr-2" />
              Access Control
            </h3>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Log Data Access
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Track all access to sensitive data
                  </p>
                </div>
                <button
                  onClick={() => handleSettingChange('access', 'logAccess', !privacySettings.access.logAccess)}
                  disabled={saving}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${privacySettings.access.logAccess ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-600'
                    }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${privacySettings.access.logAccess ? 'translate-x-5' : 'translate-x-0'
                      }`}
                  />
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    Require Access Justification
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Users must provide reason for accessing data
                  </p>
                </div>
                <button
                  onClick={() => handleSettingChange('access', 'requireJustification', !privacySettings.access.requireJustification)}
                  disabled={saving}
                  className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 ${privacySettings.access.requireJustification ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-600'
                    }`}
                >
                  <span
                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${privacySettings.access.requireJustification ? 'translate-x-5' : 'translate-x-0'
                      }`}
                  />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'compliance' && complianceReport && (
        <div className="space-y-6">
          {/* Compliance Overview */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {Object.entries(complianceReport.compliance).map(([standard, data]) => (
              <div key={standard} className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-medium text-gray-900 dark:text-white uppercase">
                    {standard}
                  </h3>
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${getComplianceColor(data.score)}`}>
                    {data.status}
                  </span>
                </div>
                <div className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="text-gray-600 dark:text-gray-400">Compliance Score</span>
                      <span className="font-medium">{data.score.toFixed(1)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full transition-all duration-300 ${data.score >= 95 ? 'bg-green-500' :
                          data.score >= 85 ? 'bg-yellow-500' :
                            'bg-red-500'
                          }`}
                        style={{ width: `${data.score}%` }}
                      ></div>
                    </div>
                  </div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">
                    <p><strong>Issues:</strong> {data.issues}</p>
                    <p><strong>Last Audit:</strong> {new Date(data.lastAudit).toLocaleDateString()}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Risk Assessment */}
          {complianceReport.risks && complianceReport.risks.length > 0 && (
            <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-6">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4 flex items-center">
                <ExclamationTriangleIcon className="h-5 w-5 mr-2" />
                Risk Assessment
              </h3>
              <div className="space-y-4">
                {complianceReport.risks.map((risk, index) => (
                  <div key={index} className={`border rounded-lg p-4 ${getRiskColor(risk.level)}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center mb-2">
                          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium capitalize ${getRiskColor(risk.level)}`}>
                            {risk.level} Risk
                          </span>
                          <span className="ml-2 text-xs text-gray-500">Priority: {risk.priority}</span>
                        </div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">
                          {risk.description}
                        </p>
                        <p className="text-xs text-gray-600 dark:text-gray-400">
                          <strong>Recommendation:</strong> {risk.recommendation}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'data-flow' && complianceReport && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
          {Object.entries(complianceReport.dataFlow).map(([stage, count]) => (
            <div key={stage} className="bg-white dark:bg-gray-800 shadow rounded-lg p-6 text-center">
              <div className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
                {count.toLocaleString()}
              </div>
              <div className="text-sm text-gray-600 dark:text-gray-400 capitalize">
                {stage}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Save Button */}
      {activeTab === 'settings' && (
        <div className="flex justify-end">
          <button
            onClick={() => showSuccess('Settings Saved', 'All privacy settings have been saved successfully')}
            disabled={saving}
            className="px-6 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save All Settings'}
          </button>
        </div>
      )}
    </div>
  );
};

export default Privacy;