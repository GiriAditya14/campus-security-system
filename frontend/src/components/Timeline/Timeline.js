import React, { useState } from 'react';
import { format, parseISO, isToday, isYesterday, subDays } from 'date-fns';
import {
    ClockIcon,
    MapPinIcon,
    UserIcon,
    ExclamationTriangleIcon,
    InformationCircleIcon,
    ChevronDownIcon,
    ChevronRightIcon
} from '@heroicons/react/24/outline';

const Timeline = ({ events = [], loading = false, onLoadMore }) => {
    const [expandedEvents, setExpandedEvents] = useState(new Set());

    const activityTypeColors = {
        access: 'bg-blue-100 text-blue-800 border-blue-200',
        connectivity: 'bg-green-100 text-green-800 border-green-200',
        transaction: 'bg-purple-100 text-purple-800 border-purple-200',
        service: 'bg-orange-100 text-orange-800 border-orange-200',
        social: 'bg-pink-100 text-pink-800 border-pink-200',
        academic: 'bg-indigo-100 text-indigo-800 border-indigo-200',
        maintenance: 'bg-gray-100 text-gray-800 border-gray-200'
    };

    const activityTypeIcons = {
        access: MapPinIcon,
        connectivity: ClockIcon,
        transaction: UserIcon,
        service: InformationCircleIcon,
        social: UserIcon,
        academic: InformationCircleIcon,
        maintenance: ExclamationTriangleIcon
    };

    const toggleEventExpansion = (eventId) => {
        const newExpanded = new Set(expandedEvents);
        if (newExpanded.has(eventId)) {
            newExpanded.delete(eventId);
        } else {
            newExpanded.add(eventId);
        }
        setExpandedEvents(newExpanded);
    };



    const getConfidenceColor = (confidence) => {
        if (confidence >= 0.9) return 'text-green-600';
        if (confidence >= 0.7) return 'text-yellow-600';
        return 'text-red-600';
    };

    const getRiskLevelColor = (riskLevel) => {
        switch (riskLevel) {
            case 'critical': return 'text-red-600 bg-red-50 border-red-200';
            case 'high': return 'text-orange-600 bg-orange-50 border-orange-200';
            case 'medium': return 'text-yellow-600 bg-yellow-50 border-yellow-200';
            case 'low': return 'text-green-600 bg-green-50 border-green-200';
            default: return 'text-gray-600 bg-gray-50 border-gray-200';
        }
    };

    // Use events directly since filtering is handled at the page level
    const filteredEvents = events;

    const groupedEvents = filteredEvents.reduce((groups, event) => {
        const date = format(parseISO(event.timestamp), 'yyyy-MM-dd');
        if (!groups[date]) {
            groups[date] = [];
        }
        groups[date].push(event);
        return groups;
    }, {});

    const formatDateGroup = (dateStr) => {
        const date = parseISO(dateStr);
        if (isToday(date)) return 'Today';
        if (isYesterday(date)) return 'Yesterday';
        return format(date, 'EEEE, MMMM dd, yyyy');
    };

    if (loading) {
        return (
            <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                    <div key={i} className="animate-pulse">
                        <div className="flex space-x-4">
                            <div className="w-10 h-10 bg-gray-200 rounded-full"></div>
                            <div className="flex-1 space-y-2">
                                <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                                <div className="h-3 bg-gray-200 rounded w-1/2"></div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Timeline */}
            <div className="space-y-6">
                {Object.entries(groupedEvents)
                    .sort(([a], [b]) => new Date(b) - new Date(a))
                    .map(([date, dayEvents]) => (
                        <div key={date} className="space-y-4">
                            {/* Date Header */}
                            <div className="flex items-center space-x-4">
                                <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                                    {formatDateGroup(date)}
                                </h3>
                                <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700"></div>
                                <span className="text-sm text-gray-500 dark:text-gray-400">
                                    {dayEvents.length} event{dayEvents.length !== 1 ? 's' : ''}
                                </span>
                            </div>

                            {/* Events for this date */}
                            <div className="space-y-3">
                                {dayEvents
                                    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                                    .map((event) => {
                                        const IconComponent = activityTypeIcons[event.activity_type] || InformationCircleIcon;
                                        const isExpanded = expandedEvents.has(event._id);

                                        return (
                                            <div
                                                key={event._id}
                                                className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
                                            >
                                                <div
                                                    className="p-4 cursor-pointer"
                                                    onClick={() => toggleEventExpansion(event._id)}
                                                >
                                                    <div className="flex items-start space-x-4">
                                                        {/* Icon */}
                                                        <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${activityTypeColors[event.activity_type] || activityTypeColors.access}`}>
                                                            <IconComponent className="h-5 w-5" />
                                                        </div>

                                                        {/* Event Details */}
                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex items-center justify-between">
                                                                <div className="flex items-center space-x-2">
                                                                    <h4 className="text-sm font-medium text-gray-900 dark:text-white capitalize">
                                                                        {event.activity_type}
                                                                        {event.activity_subtype && `: ${event.activity_subtype}`}
                                                                    </h4>
                                                                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${activityTypeColors[event.activity_type] || activityTypeColors.access}`}>
                                                                        {event.activity_type}
                                                                    </span>
                                                                </div>
                                                                <div className="flex items-center space-x-2">
                                                                    <span className={`text-xs font-medium ${getConfidenceColor(event.fused_confidence)}`}>
                                                                        {(event.fused_confidence * 100).toFixed(1)}%
                                                                    </span>
                                                                    {isExpanded ? (
                                                                        <ChevronDownIcon className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                                                                    ) : (
                                                                        <ChevronRightIcon className="h-4 w-4 text-gray-400 dark:text-gray-500" />
                                                                    )}
                                                                </div>
                                                            </div>

                                                            <div className="mt-1 flex items-center space-x-4 text-sm text-gray-500 dark:text-gray-400">
                                                                <span className="flex items-center space-x-1">
                                                                    <ClockIcon className="h-4 w-4" />
                                                                    <span>{format(parseISO(event.timestamp), 'HH:mm')}</span>
                                                                </span>
                                                                <span className="flex items-center space-x-1">
                                                                    <MapPinIcon className="h-4 w-4" />
                                                                    <span>
                                                                        {event.location.building}
                                                                        {event.location.room && `, ${event.location.room}`}
                                                                    </span>
                                                                </span>
                                                                {event.duration && (
                                                                    <span>Duration: {Math.round(event.duration / 60)}m</span>
                                                                )}
                                                            </div>

                                                            {event.risk_level && event.risk_level !== 'low' && (
                                                                <div className="mt-2">
                                                                    <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-medium border ${getRiskLevelColor(event.risk_level)}`}>
                                                                        Risk: {event.risk_level}
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>

                                                {/* Expanded Details */}
                                                {isExpanded && (
                                                    <div className="border-t border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-700">
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                            {/* Location Details */}
                                                            <div>
                                                                <h5 className="text-sm font-medium text-gray-900 dark:text-white mb-2">Location Details</h5>
                                                                <div className="space-y-1 text-sm text-gray-600 dark:text-gray-300">
                                                                    <div>Building: {event.location.building}</div>
                                                                    {event.location.room && <div>Room: {event.location.room}</div>}
                                                                    {event.location.floor && <div>Floor: {event.location.floor}</div>}
                                                                    <div>Zone: {event.location.zone}</div>
                                                                    <div>Access Level: {event.location.access_level}</div>
                                                                    {event.location.coordinates && (
                                                                        <div>
                                                                            Coordinates: {event.location.coordinates.lat.toFixed(4)}, {event.location.coordinates.lon.toFixed(4)}
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            {/* Data Sources */}
                                                            <div>
                                                                <h5 className="text-sm font-medium text-gray-900 dark:text-white mb-2">Data Sources</h5>
                                                                <div className="space-y-2">
                                                                    {event.sources.map((source, index) => (
                                                                        <div key={index} className="flex items-center justify-between text-sm">
                                                                            <span className="text-gray-600 dark:text-gray-300 capitalize">
                                                                                {source.type.replace('_', ' ')}
                                                                            </span>
                                                                            <span className={`font-medium ${getConfidenceColor(source.confidence)}`}>
                                                                                {(source.confidence * 100).toFixed(1)}%
                                                                            </span>
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            </div>

                                                            {/* Provenance */}
                                                            {event.provenance && (
                                                                <div className="md:col-span-2">
                                                                    <h5 className="text-sm font-medium text-gray-900 dark:text-white mb-2">Processing Details</h5>
                                                                    <div className="grid grid-cols-2 gap-4 text-sm text-gray-600">
                                                                        <div>Algorithm: {event.provenance.fusion_algorithm}</div>
                                                                        <div>Processing Time: {event.provenance.processing_time}</div>
                                                                        {event.provenance.conflicts_resolved > 0 && (
                                                                            <div>Conflicts Resolved: {event.provenance.conflicts_resolved}</div>
                                                                        )}
                                                                        {event.provenance.quality_metrics && (
                                                                            <>
                                                                                <div>Completeness: {(event.provenance.quality_metrics.completeness * 100).toFixed(1)}%</div>
                                                                                <div>Accuracy: {(event.provenance.quality_metrics.accuracy * 100).toFixed(1)}%</div>
                                                                            </>
                                                                        )}
                                                                    </div>
                                                                </div>
                                                            )}

                                                            {/* Tags */}
                                                            {event.tags && event.tags.length > 0 && (
                                                                <div className="md:col-span-2">
                                                                    <h5 className="text-sm font-medium text-gray-900 mb-2">Tags</h5>
                                                                    <div className="flex flex-wrap gap-2">
                                                                        {event.tags.map((tag, index) => (
                                                                            <span
                                                                                key={index}
                                                                                className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800"
                                                                            >
                                                                                {tag}
                                                                            </span>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                            </div>
                        </div>
                    ))}



                {/* Empty State */}
                {filteredEvents.length === 0 && !loading && (
                    <div className="text-center py-12">
                        <ClockIcon className="mx-auto h-12 w-12 text-gray-400" />
                        <h3 className="mt-2 text-sm font-medium text-gray-900">No events found</h3>
                        <p className="mt-1 text-sm text-gray-500">
                            {events.length === 0
                                ? "No events have been recorded for this entity yet."
                                : "No events match the current filters. Try adjusting your filter criteria."
                            }
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default Timeline;