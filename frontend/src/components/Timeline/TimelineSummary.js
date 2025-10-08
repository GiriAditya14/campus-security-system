import React from 'react';
import { format, parseISO, isToday, isYesterday } from 'date-fns';
import { 
  ClockIcon, 
  MapPinIcon, 
  ChartBarIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline';

const TimelineSummary = ({ events = [], entityName = 'Entity' }) => {
  // Generate natural language summary
  const generateSummary = () => {
    if (events.length === 0) {
      return `No recent activity recorded for ${entityName}.`;
    }

    const today = new Date();
    const todayEvents = events.filter(event => isToday(parseISO(event.timestamp)));
    const yesterdayEvents = events.filter(event => isYesterday(parseISO(event.timestamp)));

    // Activity patterns
    const activityCounts = events.reduce((acc, event) => {
      acc[event.activity_type] = (acc[event.activity_type] || 0) + 1;
      return acc;
    }, {});

    const mostCommonActivity = Object.entries(activityCounts)
      .sort(([,a], [,b]) => b - a)[0];

    // Location patterns
    const locationCounts = events.reduce((acc, event) => {
      const location = event.location.building;
      acc[location] = (acc[location] || 0) + 1;
      return acc;
    }, {});

    const mostCommonLocation = Object.entries(locationCounts)
      .sort(([,a], [,b]) => b - a)[0];

    // Time patterns
    const hourCounts = events.reduce((acc, event) => {
      const hour = parseISO(event.timestamp).getHours();
      acc[hour] = (acc[hour] || 0) + 1;
      return acc;
    }, {});

    const peakHour = Object.entries(hourCounts)
      .sort(([,a], [,b]) => b - a)[0];

    // Risk analysis
    const highRiskEvents = events.filter(event => 
      event.risk_level === 'high' || event.risk_level === 'critical'
    );

    const anomalousEvents = events.filter(event => 
      event.anomaly_score && event.anomaly_score > 0.5
    );

    // Build summary
    let summary = `${entityName} has been active with ${events.length} recorded events. `;

    if (todayEvents.length > 0) {
      summary += `Today, there were ${todayEvents.length} activities. `;
    }

    if (yesterdayEvents.length > 0) {
      summary += `Yesterday, there were ${yesterdayEvents.length} activities. `;
    }

    if (mostCommonActivity) {
      summary += `The most frequent activity type is ${mostCommonActivity[0]} (${mostCommonActivity[1]} times). `;
    }

    if (mostCommonLocation) {
      summary += `Most activities occurred at ${mostCommonLocation[0]} (${mostCommonLocation[1]} visits). `;
    }

    if (peakHour) {
      const hour = parseInt(peakHour[0]);
      const timeStr = hour < 12 ? `${hour}:00 AM` : `${hour - 12 || 12}:00 PM`;
      summary += `Peak activity time is around ${timeStr}. `;
    }

    if (highRiskEvents.length > 0) {
      summary += `⚠️ ${highRiskEvents.length} high-risk events detected. `;
    }

    if (anomalousEvents.length > 0) {
      summary += `🔍 ${anomalousEvents.length} anomalous patterns identified. `;
    }

    return summary;
  };

  // Calculate statistics
  const stats = {
    totalEvents: events.length,
    todayEvents: events.filter(event => isToday(parseISO(event.timestamp))).length,
    averageConfidence: events.length > 0 
      ? (events.reduce((sum, event) => sum + event.fused_confidence, 0) / events.length * 100).toFixed(1)
      : 0,
    uniqueLocations: new Set(events.map(event => event.location.building)).size,
    riskEvents: events.filter(event => 
      event.risk_level === 'high' || event.risk_level === 'critical'
    ).length
  };

  // Recent activity (last 5 events)
  const recentEvents = events
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
    .slice(0, 5);

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 space-y-6">
      {/* Summary Text */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Activity Summary</h3>
        <p className="text-gray-700 dark:text-gray-300 leading-relaxed">
          {generateSummary()}
        </p>
      </div>

      {/* Statistics Grid */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <div className="text-center">
          <div className="text-2xl font-bold text-blue-600">{stats.totalEvents}</div>
          <div className="text-sm text-gray-500 dark:text-gray-400">Total Events</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-green-600">{stats.todayEvents}</div>
          <div className="text-sm text-gray-500 dark:text-gray-400">Today</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-purple-600">{stats.averageConfidence}%</div>
          <div className="text-sm text-gray-500 dark:text-gray-400">Avg Confidence</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-indigo-600">{stats.uniqueLocations}</div>
          <div className="text-sm text-gray-500 dark:text-gray-400">Locations</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-red-600">{stats.riskEvents}</div>
          <div className="text-sm text-gray-500 dark:text-gray-400">Risk Events</div>
        </div>
      </div>

      {/* Recent Activity */}
      {recentEvents.length > 0 && (
        <div>
          <h4 className="text-md font-medium text-gray-900 dark:text-white mb-3 flex items-center">
            <ClockIcon className="h-5 w-5 mr-2" />
            Recent Activity
          </h4>
          <div className="space-y-2">
            {recentEvents.map((event, index) => (
              <div key={event._id} className="flex items-center justify-between py-2 px-3 bg-gray-50 dark:bg-gray-700 rounded-md">
                <div className="flex items-center space-x-3">
                  <div className="flex-shrink-0">
                    <div className={`w-2 h-2 rounded-full ${
                      event.risk_level === 'critical' ? 'bg-red-500' :
                      event.risk_level === 'high' ? 'bg-orange-500' :
                      event.risk_level === 'medium' ? 'bg-yellow-500' :
                      'bg-green-500'
                    }`}></div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-gray-900 dark:text-white capitalize">
                      {event.activity_type}
                      {event.activity_subtype && `: ${event.activity_subtype}`}
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center space-x-2">
                      <span className="flex items-center">
                        <MapPinIcon className="h-3 w-3 mr-1" />
                        {event.location.building}
                      </span>
                      <span>•</span>
                      <span>{format(parseISO(event.timestamp), 'MMM dd, HH:mm')}</span>
                    </div>
                  </div>
                </div>
                <div className="flex-shrink-0">
                  <span className={`text-xs font-medium ${
                    event.fused_confidence >= 0.9 ? 'text-green-600' :
                    event.fused_confidence >= 0.7 ? 'text-yellow-600' :
                    'text-red-600'
                  }`}>
                    {(event.fused_confidence * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Activity Pattern Insights */}
      {events.length > 0 && (
        <div>
          <h4 className="text-md font-medium text-gray-900 dark:text-white mb-3 flex items-center">
            <ChartBarIcon className="h-5 w-5 mr-2" />
            Pattern Insights
          </h4>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Activity Distribution */}
            <div className="bg-gray-50 dark:bg-gray-700 rounded-md p-3">
              <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Activity Types</h5>
              {Object.entries(
                events.reduce((acc, event) => {
                  acc[event.activity_type] = (acc[event.activity_type] || 0) + 1;
                  return acc;
                }, {})
              )
                .sort(([,a], [,b]) => b - a)
                .slice(0, 3)
                .map(([type, count]) => (
                  <div key={type} className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400 capitalize">{type}</span>
                    <span className="font-medium text-gray-900 dark:text-white">{count}</span>
                  </div>
                ))}
            </div>

            {/* Location Distribution */}
            <div className="bg-gray-50 dark:bg-gray-700 rounded-md p-3">
              <h5 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Top Locations</h5>
              {Object.entries(
                events.reduce((acc, event) => {
                  acc[event.location.building] = (acc[event.location.building] || 0) + 1;
                  return acc;
                }, {})
              )
                .sort(([,a], [,b]) => b - a)
                .slice(0, 3)
                .map(([location, count]) => (
                  <div key={location} className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400 truncate">{location}</span>
                    <span className="font-medium text-gray-900 dark:text-white">{count}</span>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Alerts and Warnings */}
      {stats.riskEvents > 0 && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-4">
          <div className="flex items-center">
            <ExclamationTriangleIcon className="h-5 w-5 text-red-600 dark:text-red-400 mr-2" />
            <h4 className="text-sm font-medium text-red-800 dark:text-red-300">Security Alerts</h4>
          </div>
          <p className="mt-1 text-sm text-red-700 dark:text-red-400">
            {stats.riskEvents} high-risk events detected. Review timeline for details and take appropriate action.
          </p>
        </div>
      )}
    </div>
  );
};

export default TimelineSummary;