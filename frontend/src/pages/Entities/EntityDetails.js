import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { entitiesAPI, analyticsAPI, handleAPIError } from '../../services/api';
import { useAlert } from '../../contexts/AlertContext';
import LoadingSpinner from '../../components/Common/LoadingSpinner';
import Timeline from '../../components/Timeline/Timeline';
import TimelineSummary from '../../components/Timeline/TimelineSummary';
import PredictiveInsights from '../../components/Predictions/PredictiveInsights';
import {
  UserIcon,
  MapPinIcon,
  PhoneIcon,
  EnvelopeIcon,
  BuildingOfficeIcon,
  CalendarIcon,
  ArrowLeftIcon,
  ShieldCheckIcon
} from '@heroicons/react/24/outline';

const EntityDetails = () => {
  const { id } = useParams();
  const [entity, setEntity] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [predictions, setPredictions] = useState(null);
  const [loading, setLoading] = useState(true);
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timeRange] = useState('7d');
  const [activityFilter] = useState('');

  const { showError, showSuccess } = useAlert();

  useEffect(() => {
    loadEntityData();
  }, [id]);

  useEffect(() => {
    if (entity) {
      loadTimeline();
    }
  }, [entity, timeRange, activityFilter]);

  const loadEntityData = async () => {
    try {
      setLoading(true);
      const [entityResponse, predictionsResponse] = await Promise.all([
        entitiesAPI.getById(id),
        analyticsAPI.getPredictions(id).catch(() => null) // Don't fail if predictions aren't available
      ]);

      // Handle both old and new response formats
      const entityData = entityResponse.data.data || entityResponse.data;
      const predictionsData = predictionsResponse.data.data || predictionsResponse.data;

      setEntity(entityData);
      setPredictions(predictionsData);
    } catch (error) {
      const errorInfo = handleAPIError(error);
      showError('Error Loading Entity', errorInfo.message);
    } finally {
      setLoading(false);
    }
  };

  const loadTimeline = async () => {
    try {
      setTimelineLoading(true);
      const params = {
        timeRange,
        activityType: activityFilter || undefined
      };

      const response = await entitiesAPI.getTimeline(id, params);
      // Handle both old and new response formats
      const timelineData = response.data.data?.events || response.data.events || [];
      setTimeline(timelineData);
    } catch (error) {
      const errorInfo = handleAPIError(error);
      showError('Error Loading Timeline', errorInfo.message);
    } finally {
      setTimelineLoading(false);
    }
  };





  const getConfidenceColor = (confidence) => {
    if (confidence >= 0.9) return 'text-green-600 dark:text-green-400';
    if (confidence >= 0.7) return 'text-yellow-600 dark:text-yellow-400';
    return 'text-red-600 dark:text-red-400';
  };



  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <LoadingSpinner size="large" text="Loading entity details..." />
      </div>
    );
  }

  if (!entity) {
    return (
      <div className="text-center py-12">
        <UserIcon className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-sm font-medium text-gray-900 dark:text-white">Entity not found</h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          The entity you're looking for doesn't exist or you don't have permission to view it.
        </p>
        <div className="mt-6">
          <Link
            to="/entities"
            className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <ArrowLeftIcon className="h-4 w-4 mr-2" />
            Back to Search
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Link
          to="/entities"
          className="inline-flex items-center text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
        >
          <ArrowLeftIcon className="h-4 w-4 mr-1" />
          Back to Search
        </Link>
      </div>

      {/* Entity Profile */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-4">
            <div className="flex-shrink-0">
              <UserIcon className="h-12 w-12 text-gray-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                {entity.profile?.name || 'Unknown Name'}
              </h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                ID: {entity._id}
              </p>
            </div>
            <div className="flex items-center space-x-2">
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${entity.metadata?.status === 'active'
                ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                : 'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
                }`}>
                {entity.metadata?.status || 'unknown'}
              </span>
              {entity.metadata?.confidence && (
                <span className={`text-sm font-medium ${getConfidenceColor(entity.metadata.confidence)}`}>
                  {(entity.metadata.confidence * 100).toFixed(1)}% confidence
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="px-6 py-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Basic Info */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-gray-900 dark:text-white">Basic Information</h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center">
                  <UserIcon className="h-4 w-4 text-gray-400 mr-2" />
                  <span className="text-gray-600 dark:text-gray-400">Type:</span>
                  <span className="ml-2 text-gray-900 dark:text-white capitalize">
                    {entity.profile?.entity_type || 'Unknown'}
                  </span>
                </div>
                <div className="flex items-center">
                  <BuildingOfficeIcon className="h-4 w-4 text-gray-400 mr-2" />
                  <span className="text-gray-600 dark:text-gray-400">Department:</span>
                  <span className="ml-2 text-gray-900 dark:text-white">
                    {entity.profile?.department || 'N/A'}
                  </span>
                </div>
                {entity.profile?.role && (
                  <div className="flex items-center">
                    <ShieldCheckIcon className="h-4 w-4 text-gray-400 mr-2" />
                    <span className="text-gray-600 dark:text-gray-400">Role:</span>
                    <span className="ml-2 text-gray-900 dark:text-white">
                      {entity.profile.role}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Contact Info */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-gray-900 dark:text-white">Contact Information</h3>
              <div className="space-y-2 text-sm">
                {entity.identifiers?.email && (
                  <div className="flex items-center">
                    <EnvelopeIcon className="h-4 w-4 text-gray-400 mr-2" />
                    <span className="text-gray-900 dark:text-white">
                      {entity.identifiers.email}
                    </span>
                  </div>
                )}
                {entity.identifiers?.phone && (
                  <div className="flex items-center">
                    <PhoneIcon className="h-4 w-4 text-gray-400 mr-2" />
                    <span className="text-gray-900 dark:text-white">
                      {entity.identifiers.phone}
                    </span>
                  </div>
                )}
                {entity.profile?.office_location && (
                  <div className="flex items-center">
                    <MapPinIcon className="h-4 w-4 text-gray-400 mr-2" />
                    <span className="text-gray-900 dark:text-white">
                      {entity.profile.office_location}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* System Info */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-gray-900 dark:text-white">System Information</h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center">
                  <CalendarIcon className="h-4 w-4 text-gray-400 mr-2" />
                  <span className="text-gray-600 dark:text-gray-400">Resolved:</span>
                  <span className="ml-2 text-gray-900 dark:text-white">
                    {new Date(entity.resolved_at).toLocaleDateString()}
                  </span>
                </div>
                {entity.identifiers?.card_id && (
                  <div className="flex items-center">
                    <span className="text-gray-600 dark:text-gray-400">Card ID:</span>
                    <span className="ml-2 text-gray-900 dark:text-white font-mono text-xs">
                      {entity.identifiers.card_id}
                    </span>
                  </div>
                )}
                {entity.metadata?.source_records?.length > 0 && (
                  <div className="flex items-center">
                    <span className="text-gray-600 dark:text-gray-400">Sources:</span>
                    <span className="ml-2 text-gray-900 dark:text-white">
                      {entity.metadata.source_records.length} records
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Predictions Panel */}
      {predictions && (
        <div className="bg-white dark:bg-gray-800 shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
            <h2 className="text-lg font-medium text-gray-900 dark:text-white">
              Predictive Insights
            </h2>
          </div>
          <div className="px-6 py-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {predictions.location && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                    Predicted Location
                  </h3>
                  <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {predictions.location.building}
                        </p>
                        {predictions.location.room && (
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Room: {predictions.location.room}
                          </p>
                        )}
                      </div>
                      <span className={`text-sm font-medium ${getConfidenceColor(predictions.location.confidence)}`}>
                        {(predictions.location.confidence * 100).toFixed(1)}%
                      </span>
                    </div>
                    {predictions.location.explanation && (
                      <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                        {predictions.location.explanation}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {predictions.activity && (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium text-gray-900 dark:text-white">
                    Next Activity
                  </h3>
                  <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">
                          {predictions.activity.type}
                        </p>
                        {predictions.activity.estimated_time && (
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            ETA: {predictions.activity.estimated_time}
                          </p>
                        )}
                      </div>
                      <span className={`text-sm font-medium ${getConfidenceColor(predictions.activity.confidence)}`}>
                        {(predictions.activity.confidence * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Predictive Insights */}
      <PredictiveInsights
        entityId={id}
        entityName={entity.profile?.name || 'Entity'}
      />

      {/* Timeline Summary */}
      <TimelineSummary
        events={timeline}
        entityName={entity.profile?.name || 'Entity'}
      />

      {/* Timeline */}
      <div className="bg-white dark:bg-gray-800 shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">
            Activity Timeline
          </h2>
        </div>
        <div className="p-6">
          <Timeline
            events={timeline}
            loading={timelineLoading}
            onLoadMore={() => {
              // Implement load more functionality if needed
              console.log('Load more events');
            }}
          />
        </div>
      </div>
    </div>
  );
};

export default EntityDetails;