import React from 'react';
import { 
  ExclamationTriangleIcon,
  ShieldCheckIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  ClockIcon
} from '@heroicons/react/24/outline';

const RiskScoring = ({ riskData, className = '' }) => {
  if (!riskData) {
    return (
      <div className={`bg-gray-50 rounded-lg p-4 ${className}`}>
        <div className="text-center text-gray-500">
          <ShieldCheckIcon className="h-8 w-8 mx-auto mb-2" />
          <p className="text-sm">No risk data available</p>
        </div>
      </div>
    );
  }

  const getRiskColor = (level) => {
    switch (level?.toLowerCase()) {
      case 'critical':
        return {
          bg: 'bg-red-100',
          text: 'text-red-800',
          border: 'border-red-200',
          icon: 'text-red-600',
          bar: 'bg-red-500'
        };
      case 'high':
        return {
          bg: 'bg-orange-100',
          text: 'text-orange-800',
          border: 'border-orange-200',
          icon: 'text-orange-600',
          bar: 'bg-orange-500'
        };
      case 'medium':
        return {
          bg: 'bg-yellow-100',
          text: 'text-yellow-800',
          border: 'border-yellow-200',
          icon: 'text-yellow-600',
          bar: 'bg-yellow-500'
        };
      case 'low':
        return {
          bg: 'bg-green-100',
          text: 'text-green-800',
          border: 'border-green-200',
          icon: 'text-green-600',
          bar: 'bg-green-500'
        };
      default:
        return {
          bg: 'bg-gray-100',
          text: 'text-gray-800',
          border: 'border-gray-200',
          icon: 'text-gray-600',
          bar: 'bg-gray-500'
        };
    }
  };

  const colors = getRiskColor(riskData.level);
  const riskScore = riskData.score || 0;
  const riskPercentage = Math.min((riskScore / 10) * 100, 100);

  return (
    <div className={`bg-white rounded-lg border ${colors.border} ${className}`}>
      {/* Header */}
      <div className={`px-4 py-3 ${colors.bg} border-b ${colors.border} rounded-t-lg`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <ExclamationTriangleIcon className={`h-5 w-5 ${colors.icon} mr-2`} />
            <h3 className={`font-medium ${colors.text}`}>Risk Assessment</h3>
          </div>
          <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium ${colors.bg} ${colors.text} border ${colors.border} capitalize`}>
            {riskData.level || 'Unknown'} Risk
          </span>
        </div>
      </div>

      {/* Risk Score */}
      <div className="p-4">
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Risk Score</span>
            <span className="text-lg font-bold text-gray-900">
              {riskScore.toFixed(1)}/10
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3">
            <div 
              className={`h-3 rounded-full transition-all duration-300 ${colors.bar}`}
              style={{ width: `${riskPercentage}%` }}
            ></div>
          </div>
          <div className="flex justify-between text-xs text-gray-500 mt-1">
            <span>Low</span>
            <span>Medium</span>
            <span>High</span>
            <span>Critical</span>
          </div>
        </div>

        {/* Risk Factors */}
        {riskData.factors && riskData.factors.length > 0 && (
          <div className="mb-4">
            <h4 className="text-sm font-medium text-gray-700 mb-3">Risk Factors</h4>
            <div className="space-y-2">
              {riskData.factors.slice(0, 5).map((factor, index) => {
                const factorColors = getRiskColor(factor.impact);
                return (
                  <div key={index} className="flex items-center justify-between p-2 bg-gray-50 rounded-md">
                    <div className="flex items-center flex-1">
                      {factor.trend === 'increasing' ? (
                        <ArrowTrendingUpIcon className={`h-4 w-4 ${factorColors.icon} mr-2 flex-shrink-0`} />
                      ) : factor.trend === 'decreasing' ? (
                        <ArrowTrendingDownIcon className="h-4 w-4 text-green-600 mr-2 flex-shrink-0" />
                      ) : (
                        <div className={`w-2 h-2 rounded-full ${factorColors.bar} mr-3 flex-shrink-0`}></div>
                      )}
                      <span className="text-sm text-gray-700 truncate">{factor.description}</span>
                    </div>
                    <div className="flex items-center ml-2">
                      <span className={`text-xs font-medium px-2 py-1 rounded ${factorColors.bg} ${factorColors.text} capitalize`}>
                        {factor.impact}
                      </span>
                      {factor.weight && (
                        <span className="text-xs text-gray-500 ml-2">
                          {(factor.weight * 100).toFixed(0)}%
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Trend Analysis */}
        {riskData.trend && (
          <div className="mb-4">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Risk Trend</h4>
            <div className="flex items-center p-2 bg-gray-50 rounded-md">
              {riskData.trend.direction === 'increasing' ? (
                <ArrowTrendingUpIcon className="h-4 w-4 text-red-600 mr-2" />
              ) : riskData.trend.direction === 'decreasing' ? (
                <ArrowTrendingDownIcon className="h-4 w-4 text-green-600 mr-2" />
              ) : (
                <div className="w-4 h-0.5 bg-gray-400 mr-2"></div>
              )}
              <span className="text-sm text-gray-700">
                {riskData.trend.description || `Risk is ${riskData.trend.direction}`}
              </span>
              {riskData.trend.change && (
                <span className={`ml-auto text-xs font-medium ${
                  riskData.trend.direction === 'increasing' ? 'text-red-600' : 'text-green-600'
                }`}>
                  {riskData.trend.direction === 'increasing' ? '+' : ''}{riskData.trend.change}%
                </span>
              )}
            </div>
          </div>
        )}

        {/* Time-based Risk */}
        {riskData.timeBasedRisk && (
          <div className="mb-4">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Time-based Risk</h4>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(riskData.timeBasedRisk).map(([period, risk]) => {
                const periodColors = getRiskColor(risk.level);
                return (
                  <div key={period} className={`p-2 rounded-md border ${periodColors.border} ${periodColors.bg}`}>
                    <div className="text-center">
                      <div className={`text-xs font-medium ${periodColors.text} capitalize`}>
                        {period.replace('_', ' ')}
                      </div>
                      <div className={`text-sm font-bold ${periodColors.text}`}>
                        {risk.score?.toFixed(1) || 'N/A'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Recommendations */}
        {riskData.recommendations && riskData.recommendations.length > 0 && (
          <div className="mb-4">
            <h4 className="text-sm font-medium text-gray-700 mb-2">Recommendations</h4>
            <div className="space-y-1">
              {riskData.recommendations.slice(0, 3).map((recommendation, index) => (
                <div key={index} className="flex items-start p-2 bg-blue-50 rounded-md">
                  <div className="w-1.5 h-1.5 bg-blue-500 rounded-full mt-2 mr-2 flex-shrink-0"></div>
                  <span className="text-sm text-blue-800">{recommendation}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Last Updated */}
        {riskData.lastUpdated && (
          <div className="flex items-center text-xs text-gray-500 pt-2 border-t border-gray-200">
            <ClockIcon className="h-3 w-3 mr-1" />
            <span>Last updated: {new Date(riskData.lastUpdated).toLocaleString()}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default RiskScoring;