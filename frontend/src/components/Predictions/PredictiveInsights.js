import React, { useState, useEffect } from 'react';
import { 
  ChartBarIcon, 
  LightBulbIcon, 
  ExclamationTriangleIcon,
  InformationCircleIcon,
  ClockIcon,
  MapPinIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  QuestionMarkCircleIcon
} from '@heroicons/react/24/outline';
import { analyticsAPI, handleAPIError } from '../../services/api';
import { useAlert } from '../../contexts/AlertContext';

const PredictiveInsights = ({ entityId, entityName }) => {
  const [predictions, setPredictions] = useState(null);
  const [explanations, setExplanations] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('location');
  
  const { showError } = useAlert();

  useEffect(() => {
    if (entityId) {
      loadPredictions();
    }
  }, [entityId]);

  const loadPredictions = async () => {
    try {
      setLoading(true);
      // Only load predictions for now, explanations can be loaded separately if needed
      const predictionsResponse = await analyticsAPI.getPredictions(entityId);
      
      setPredictions(predictionsResponse.data.data);
      // Set explanations to null for now since the API method doesn't exist
      setExplanations(null);
    } catch (error) {
      const errorInfo = handleAPIError(error);
      showError('Error Loading Predictions', errorInfo.message);
    } finally {
      setLoading(false);
    }
  };

  const getConfidenceColor = (confidence) => {
    if (confidence >= 0.9) return 'text-green-600 bg-green-50 border-green-200';
    if (confidence >= 0.7) return 'text-yellow-600 bg-yellow-50 border-yellow-200';
    return 'text-red-600 bg-red-50 border-red-200';
  };

  const getRiskColor = (risk) => {
    switch (risk) {
      case 'high': return 'text-red-600 bg-red-50 border-red-200';
      case 'medium': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
      case 'low': return 'text-green-600 bg-green-50 border-green-200';
      default: return 'text-gray-600 bg-gray-50 border-gray-200';
    }
  };

  const formatTimeEstimate = (minutes) => {
    if (minutes < 60) return `${minutes}m`;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 rounded w-1/3"></div>
          <div className="space-y-3">
            <div className="h-4 bg-gray-200 rounded"></div>
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          </div>
        </div>
      </div>
    );
  }

  if (!predictions) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="text-center py-8">
          <ChartBarIcon className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No Predictions Available</h3>
          <p className="mt-1 text-sm text-gray-500">
            Insufficient data to generate predictions for this entity.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center">
            <LightBulbIcon className="h-5 w-5 mr-2 text-yellow-500" />
            Predictive Insights
          </h2>
          <span className="text-sm text-gray-500">
            for {entityName}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="flex space-x-8 px-6">
          {[
            { id: 'location', name: 'Location', icon: MapPinIcon },
            { id: 'activity', name: 'Activity', icon: ClockIcon },
            { id: 'risk', name: 'Risk Analysis', icon: ExclamationTriangleIcon }
          ].map(tab => {
            const IconComponent = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`py-4 px-1 border-b-2 font-medium text-sm flex items-center ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
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
      <div className="p-6">
        {activeTab === 'location' && (
          <div className="space-y-6">
            {/* Current Location Prediction */}
            {predictions.location && (
              <div>
                <h3 className="text-md font-medium text-gray-900 mb-4">Predicted Current Location</h3>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h4 className="font-medium text-gray-900">{predictions.location.building}</h4>
                      {predictions.location.room && (
                        <p className="text-sm text-gray-600">Room: {predictions.location.room}</p>
                      )}
                      {predictions.location.zone && (
                        <p className="text-xs text-gray-500 capitalize">Zone: {predictions.location.zone}</p>
                      )}
                    </div>
                    <div className="text-right">
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${getConfidenceColor(predictions.location.confidence)}`}>
                        {(predictions.location.confidence * 100).toFixed(1)}% confident
                      </span>
                      {predictions.location.last_seen && (
                        <p className="text-xs text-gray-500 mt-1">
                          Last seen: {new Date(predictions.location.last_seen).toLocaleString()}
                        </p>
                      )}
                    </div>
                  </div>
                  
                  {predictions.location.coordinates && (
                    <div className="text-xs text-gray-500 mb-3">
                      Coordinates: {predictions.location.coordinates.lat.toFixed(4)}, {predictions.location.coordinates.lng.toFixed(4)}
                    </div>
                  )}

                  {explanations?.location && (
                    <div className="border-t border-gray-200 pt-3">
                      <h5 className="text-sm font-medium text-gray-700 mb-2 flex items-center">
                        <InformationCircleIcon className="h-4 w-4 mr-1" />
                        Why this prediction?
                      </h5>
                      <p className="text-sm text-gray-600 mb-3">{explanations.location.explanation}</p>
                      
                      {explanations.location.factors && (
                        <div>
                          <h6 className="text-xs font-medium text-gray-700 mb-2">Key Factors:</h6>
                          <div className="space-y-1">
                            {explanations.location.factors.slice(0, 3).map((factor, index) => (
                              <div key={index} className="flex items-center justify-between text-xs">
                                <span className="text-gray-600">{factor.name}</span>
                                <div className="flex items-center">
                                  <div className="w-16 bg-gray-200 rounded-full h-1.5 mr-2">
                                    <div 
                                      className="bg-blue-600 h-1.5 rounded-full" 
                                      style={{ width: `${Math.abs(factor.importance) * 100}%` }}
                                    ></div>
                                  </div>
                                  <span className={`font-medium ${factor.importance > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {factor.importance > 0 ? '+' : ''}{(factor.importance * 100).toFixed(1)}%
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Alternative Locations */}
            {predictions.location?.alternatives && predictions.location.alternatives.length > 0 && (
              <div>
                <h3 className="text-md font-medium text-gray-900 mb-4">Alternative Locations</h3>
                <div className="space-y-2">
                  {predictions.location.alternatives.slice(0, 3).map((alt, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                      <div>
                        <span className="font-medium text-gray-900">{alt.building}</span>
                        {alt.room && <span className="text-sm text-gray-600 ml-2">({alt.room})</span>}
                      </div>
                      <span className={`text-sm font-medium ${getConfidenceColor(alt.confidence)}`}>
                        {(alt.confidence * 100).toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'activity' && (
          <div className="space-y-6">
            {/* Next Activity Prediction */}
            {predictions.activity && (
              <div>
                <h3 className="text-md font-medium text-gray-900 mb-4">Predicted Next Activity</h3>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h4 className="font-medium text-gray-900 capitalize">{predictions.activity.type}</h4>
                      {predictions.activity.subtype && (
                        <p className="text-sm text-gray-600 capitalize">{predictions.activity.subtype}</p>
                      )}
                      {predictions.activity.estimated_duration && (
                        <p className="text-xs text-gray-500">
                          Estimated duration: {formatTimeEstimate(predictions.activity.estimated_duration)}
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border ${getConfidenceColor(predictions.activity.confidence)}`}>
                        {(predictions.activity.confidence * 100).toFixed(1)}% confident
                      </span>
                      {predictions.activity.estimated_time && (
                        <p className="text-xs text-gray-500 mt-1">
                          ETA: {predictions.activity.estimated_time}
                        </p>
                      )}
                    </div>
                  </div>

                  {explanations?.activity && (
                    <div className="border-t border-gray-200 pt-3">
                      <h5 className="text-sm font-medium text-gray-700 mb-2 flex items-center">
                        <InformationCircleIcon className="h-4 w-4 mr-1" />
                        Prediction Basis
                      </h5>
                      <p className="text-sm text-gray-600 mb-3">{explanations.activity.explanation}</p>
                      
                      {explanations.activity.historical_pattern && (
                        <div className="text-xs text-gray-600">
                          <strong>Historical Pattern:</strong> {explanations.activity.historical_pattern}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Activity Sequence */}
            {predictions.activity?.sequence && predictions.activity.sequence.length > 0 && (
              <div>
                <h3 className="text-md font-medium text-gray-900 mb-4">Predicted Activity Sequence</h3>
                <div className="space-y-2">
                  {predictions.activity.sequence.map((activity, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-md">
                      <div className="flex items-center">
                        <span className="w-6 h-6 bg-blue-100 text-blue-800 rounded-full text-xs font-medium flex items-center justify-center mr-3">
                          {index + 1}
                        </span>
                        <div>
                          <span className="font-medium text-gray-900 capitalize">{activity.type}</span>
                          {activity.location && (
                            <span className="text-sm text-gray-600 ml-2">at {activity.location}</span>
                          )}
                        </div>
                      </div>
                      <div className="text-right text-xs text-gray-500">
                        {activity.estimated_time && <div>{activity.estimated_time}</div>}
                        <div className="font-medium">{(activity.confidence * 100).toFixed(0)}%</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'risk' && (
          <div className="space-y-6">
            {/* Risk Assessment */}
            {predictions.risk && (
              <div>
                <h3 className="text-md font-medium text-gray-900 mb-4">Risk Assessment</h3>
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h4 className="font-medium text-gray-900">Overall Risk Level</h4>
                      <p className="text-sm text-gray-600">Based on current patterns and predictions</p>
                    </div>
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium border capitalize ${getRiskColor(predictions.risk.level)}`}>
                      {predictions.risk.level} Risk
                    </span>
                  </div>

                  {predictions.risk.score && (
                    <div className="mb-3">
                      <div className="flex items-center justify-between text-sm mb-1">
                        <span className="text-gray-600">Risk Score</span>
                        <span className="font-medium">{predictions.risk.score.toFixed(1)}/10</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className={`h-2 rounded-full ${
                            predictions.risk.score >= 7 ? 'bg-red-500' :
                            predictions.risk.score >= 4 ? 'bg-yellow-500' :
                            'bg-green-500'
                          }`}
                          style={{ width: `${(predictions.risk.score / 10) * 100}%` }}
                        ></div>
                      </div>
                    </div>
                  )}

                  {predictions.risk.factors && predictions.risk.factors.length > 0 && (
                    <div className="border-t border-gray-200 pt-3">
                      <h5 className="text-sm font-medium text-gray-700 mb-2">Risk Factors</h5>
                      <div className="space-y-2">
                        {predictions.risk.factors.map((factor, index) => (
                          <div key={index} className="flex items-center justify-between">
                            <div className="flex items-center">
                              {factor.impact === 'high' ? (
                                <ArrowTrendingUpIcon className="h-4 w-4 text-red-500 mr-2" />
                              ) : factor.impact === 'medium' ? (
                                <ArrowTrendingUpIcon className="h-4 w-4 text-yellow-500 mr-2" />
                              ) : (
                                <ArrowTrendingDownIcon className="h-4 w-4 text-green-500 mr-2" />
                              )}
                              <span className="text-sm text-gray-700">{factor.description}</span>
                            </div>
                            <span className={`text-xs font-medium capitalize ${getRiskColor(factor.impact)}`}>
                              {factor.impact}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {explanations?.risk && (
                    <div className="border-t border-gray-200 pt-3 mt-3">
                      <h5 className="text-sm font-medium text-gray-700 mb-2 flex items-center">
                        <InformationCircleIcon className="h-4 w-4 mr-1" />
                        Risk Analysis
                      </h5>
                      <p className="text-sm text-gray-600">{explanations.risk.explanation}</p>
                      
                      {explanations.risk.recommendations && explanations.risk.recommendations.length > 0 && (
                        <div className="mt-3">
                          <h6 className="text-xs font-medium text-gray-700 mb-2">Recommendations:</h6>
                          <ul className="text-xs text-gray-600 space-y-1">
                            {explanations.risk.recommendations.map((rec, index) => (
                              <li key={index} className="flex items-start">
                                <span className="w-1 h-1 bg-gray-400 rounded-full mt-2 mr-2 flex-shrink-0"></span>
                                {rec}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Anomaly Detection */}
            {predictions.anomalies && predictions.anomalies.length > 0 && (
              <div>
                <h3 className="text-md font-medium text-gray-900 mb-4">Detected Anomalies</h3>
                <div className="space-y-3">
                  {predictions.anomalies.map((anomaly, index) => (
                    <div key={index} className="border border-orange-200 bg-orange-50 rounded-lg p-4">
                      <div className="flex items-start">
                        <ExclamationTriangleIcon className="h-5 w-5 text-orange-600 mt-0.5 mr-3 flex-shrink-0" />
                        <div className="flex-1">
                          <h4 className="font-medium text-orange-900">{anomaly.type}</h4>
                          <p className="text-sm text-orange-800 mt-1">{anomaly.description}</p>
                          <div className="flex items-center justify-between mt-2">
                            <span className="text-xs text-orange-700">
                              Detected: {new Date(anomaly.detected_at).toLocaleString()}
                            </span>
                            <span className="text-xs font-medium text-orange-900">
                              Severity: {anomaly.severity}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 rounded-b-lg">
        <div className="flex items-center justify-between text-sm text-gray-600">
          <div className="flex items-center">
            <InformationCircleIcon className="h-4 w-4 mr-1" />
            <span>Predictions updated every 5 minutes</span>
          </div>
          <div className="flex items-center">
            <QuestionMarkCircleIcon className="h-4 w-4 mr-1" />
            <button className="text-blue-600 hover:text-blue-800">
              Learn about predictions
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PredictiveInsights;