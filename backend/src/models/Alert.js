const mongoose = require('mongoose');

// Alert rule schema
const AlertRuleSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    condition: {
        type: String,
        required: true
    },
    threshold: {
        type: Number,
        sparse: true
    },
    parameters: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    }
}, { _id: false });

// Alert context schema
const AlertContextSchema = new mongoose.Schema({
    entity_id: {
        type: String,
        sparse: true,
        ref: 'Entity'
    },
    entity_name: {
        type: String,
        sparse: true
    },
    location: {
        building: String,
        room: String,
        coordinates: {
            lat: Number,
            lon: Number
        }
    },
    related_events: [{
        event_id: String,
        timestamp: Date,
        activity_type: String
    }],
    historical_pattern: {
        type: mongoose.Schema.Types.Mixed,
        sparse: true
    },
    prediction_data: {
        type: mongoose.Schema.Types.Mixed,
        sparse: true
    }
}, { _id: false });

// Alert action schema
const AlertActionSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['email', 'sms', 'webhook', 'dashboard', 'log'],
        required: true
    },
    target: {
        type: String,
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'sent', 'failed', 'delivered'],
        default: 'pending'
    },
    attempted_at: {
        type: Date,
        sparse: true
    },
    completed_at: {
        type: Date,
        sparse: true
    },
    error_message: {
        type: String,
        sparse: true
    },
    retry_count: {
        type: Number,
        default: 0
    }
}, { _id: false });

// Main Alert schema
const AlertSchema = new mongoose.Schema({
    _id: {
        type: String,
        required: true
    },
    type: {
        type: String,
        enum: ['INACTIVITY', 'UNUSUAL_LOCATION', 'MULTIPLE_PRESENCE', 'PATTERN_ANOMALY', 'SECURITY_BREACH', 'SYSTEM_ERROR'],
        required: true,
        index: true
    },
    severity: {
        type: String,
        enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
        required: true,
        index: true
    },
    status: {
        type: String,
        enum: ['active', 'acknowledged', 'resolved', 'dismissed', 'escalated'],
        default: 'active',
        index: true
    },
    title: {
        type: String,
        required: true
    },
    description: {
        type: String,
        required: true
    },
    rule: {
        type: AlertRuleSchema,
        required: true
    },
    context: {
        type: AlertContextSchema,
        required: true
    },
    actions: {
        type: [AlertActionSchema],
        default: []
    },
    triggered_at: {
        type: Date,
        default: Date.now,
        index: true
    },
    acknowledged_at: {
        type: Date,
        sparse: true
    },
    acknowledged_by: {
        type: String,
        sparse: true
    },
    resolved_at: {
        type: Date,
        sparse: true
    },
    resolved_by: {
        type: String,
        sparse: true
    },
    resolution_notes: {
        type: String,
        sparse: true
    },
    escalation_level: {
        type: Number,
        default: 0,
        min: 0,
        max: 5
    },
    auto_resolve: {
        type: Boolean,
        default: false
    },
    expiry_time: {
        type: Date,
        sparse: true,
        index: true
    },
    tags: [{
        type: String,
        index: true
    }],
    metadata: {
        confidence_score: {
            type: Number,
            min: 0,
            max: 1,
            sparse: true
        },
        false_positive_probability: {
            type: Number,
            min: 0,
            max: 1,
            sparse: true
        },
        impact_score: {
            type: Number,
            min: 0,
            max: 10,
            sparse: true
        },
        urgency_score: {
            type: Number,
            min: 0,
            max: 10,
            sparse: true
        }
    }
}, {
    timestamps: true,
    collection: 'alerts'
});

// Compound indexes
AlertSchema.index({ type: 1, severity: 1, status: 1 });
AlertSchema.index({ 'context.entity_id': 1, triggered_at: -1 });
AlertSchema.index({ status: 1, triggered_at: -1 });
AlertSchema.index({ severity: 1, triggered_at: -1 });
AlertSchema.index({ expiry_time: 1 }, { expireAfterSeconds: 0 });

// Text index for search
AlertSchema.index({
    title: 'text',
    description: 'text',
    'context.entity_name': 'text',
    tags: 'text'
});

// Pre-save middleware
AlertSchema.pre('save', function(next) {
    // Set expiry time for auto-resolving alerts
    if (this.auto_resolve && !this.expiry_time) {
        const expiryHours = this.getExpiryHours();
        this.expiry_time = new Date(Date.now() + expiryHours * 60 * 60 * 1000);
    }
    
    // Calculate impact and urgency scores
    if (!this.metadata.impact_score) {
        this.metadata.impact_score = this.calculateImpactScore();
    }
    
    if (!this.metadata.urgency_score) {
        this.metadata.urgency_score = this.calculateUrgencyScore();
    }
    
    next();
});

// Instance methods
AlertSchema.methods.getExpiryHours = function() {
    const expiryMap = {
        'INACTIVITY': 24,
        'UNUSUAL_LOCATION': 4,
        'MULTIPLE_PRESENCE': 1,
        'PATTERN_ANOMALY': 12,
        'SECURITY_BREACH': 72,
        'SYSTEM_ERROR': 6
    };
    
    return expiryMap[this.type] || 12;
};

AlertSchema.methods.calculateImpactScore = function() {
    let score = 0;
    
    // Base score by severity
    const severityScores = {
        'LOW': 2,
        'MEDIUM': 4,
        'HIGH': 7,
        'CRITICAL': 10
    };
    score += severityScores[this.severity] || 0;
    
    // Adjust by alert type
    const typeMultipliers = {
        'SECURITY_BREACH': 1.5,
        'MULTIPLE_PRESENCE': 1.3,
        'UNUSUAL_LOCATION': 1.2,
        'PATTERN_ANOMALY': 1.0,
        'INACTIVITY': 0.8,
        'SYSTEM_ERROR': 0.6
    };
    score *= (typeMultipliers[this.type] || 1.0);
    
    // Adjust by confidence
    if (this.metadata.confidence_score) {
        score *= this.metadata.confidence_score;
    }
    
    return Math.min(10, Math.max(0, Math.round(score)));
};

AlertSchema.methods.calculateUrgencyScore = function() {
    let score = 0;
    
    // Base urgency by type
    const typeUrgency = {
        'SECURITY_BREACH': 10,
        'MULTIPLE_PRESENCE': 8,
        'UNUSUAL_LOCATION': 6,
        'PATTERN_ANOMALY': 4,
        'INACTIVITY': 3,
        'SYSTEM_ERROR': 5
    };
    score = typeUrgency[this.type] || 5;
    
    // Adjust by time of day (higher urgency during off-hours)
    const hour = new Date().getHours();
    if (hour < 6 || hour > 22) {
        score += 2;
    }
    
    // Adjust by location sensitivity
    if (this.context.location && this.context.location.building) {
        const sensitiveBuildings = ['Server Room', 'Admin Block', 'Research Center'];
        if (sensitiveBuildings.includes(this.context.location.building)) {
            score += 2;
        }
    }
    
    return Math.min(10, Math.max(0, score));
};

AlertSchema.methods.acknowledge = function(userId, notes = '') {
    this.status = 'acknowledged';
    this.acknowledged_at = new Date();
    this.acknowledged_by = userId;
    if (notes) {
        this.resolution_notes = notes;
    }
    return this.save();
};

AlertSchema.methods.resolve = function(userId, notes = '') {
    this.status = 'resolved';
    this.resolved_at = new Date();
    this.resolved_by = userId;
    if (notes) {
        this.resolution_notes = notes;
    }
    return this.save();
};

AlertSchema.methods.dismiss = function(userId, notes = '') {
    this.status = 'dismissed';
    this.resolved_at = new Date();
    this.resolved_by = userId;
    if (notes) {
        this.resolution_notes = notes;
    }
    return this.save();
};

AlertSchema.methods.escalate = function(reason = '') {
    this.escalation_level += 1;
    this.status = 'escalated';
    
    if (this.escalation_level >= 3) {
        this.severity = 'CRITICAL';
    }
    
    // Add escalation action
    this.actions.push({
        type: 'escalation',
        target: `level_${this.escalation_level}`,
        status: 'pending',
        attempted_at: new Date()
    });
    
    return this.save();
};

AlertSchema.methods.addAction = function(type, target) {
    const action = {
        type: type,
        target: target,
        status: 'pending',
        attempted_at: new Date()
    };
    
    this.actions.push(action);
    return this.save();
};

AlertSchema.methods.updateActionStatus = function(actionIndex, status, errorMessage = null) {
    if (this.actions[actionIndex]) {
        this.actions[actionIndex].status = status;
        this.actions[actionIndex].completed_at = new Date();
        
        if (errorMessage) {
            this.actions[actionIndex].error_message = errorMessage;
            this.actions[actionIndex].retry_count += 1;
        }
    }
    
    return this.save();
};

AlertSchema.methods.shouldRetry = function(actionIndex) {
    const action = this.actions[actionIndex];
    if (!action || action.status !== 'failed') {
        return false;
    }
    
    const maxRetries = {
        'email': 3,
        'sms': 2,
        'webhook': 5,
        'dashboard': 1,
        'log': 1
    };
    
    return action.retry_count < (maxRetries[action.type] || 1);
};

// Static methods
AlertSchema.statics.createInactivityAlert = function(entityId, entityName, lastSeenHours, predictedLocation = null) {
    const alertId = `INACT_${entityId}_${Date.now()}`;
    
    return new this({
        _id: alertId,
        type: 'INACTIVITY',
        severity: lastSeenHours > 24 ? 'HIGH' : 'MEDIUM',
        title: `Entity Inactivity Detected`,
        description: `${entityName} has not been observed for ${lastSeenHours} hours`,
        rule: {
            name: 'inactivity_detection',
            condition: 'hours_since_last_seen > threshold',
            threshold: 12,
            parameters: { hours: lastSeenHours }
        },
        context: {
            entity_id: entityId,
            entity_name: entityName,
            prediction_data: predictedLocation ? { predicted_location: predictedLocation } : {}
        },
        auto_resolve: true,
        metadata: {
            confidence_score: Math.min(1, lastSeenHours / 24),
            false_positive_probability: Math.max(0, 1 - (lastSeenHours / 48))
        }
    });
};

AlertSchema.statics.createUnusualLocationAlert = function(entityId, entityName, location, accessLevel) {
    const alertId = `ULOC_${entityId}_${Date.now()}`;
    
    return new this({
        _id: alertId,
        type: 'UNUSUAL_LOCATION',
        severity: accessLevel === 'restricted' ? 'HIGH' : 'MEDIUM',
        title: `Unusual Location Access`,
        description: `${entityName} detected in ${accessLevel} area: ${location.building}`,
        rule: {
            name: 'unusual_location_detection',
            condition: 'entity_in_restricted_area',
            parameters: { access_level: accessLevel }
        },
        context: {
            entity_id: entityId,
            entity_name: entityName,
            location: location
        },
        auto_resolve: true,
        metadata: {
            confidence_score: 0.9,
            false_positive_probability: 0.1
        }
    });
};

AlertSchema.statics.createMultiplePresenceAlert = function(entityId, entityName, locations) {
    const alertId = `MPRES_${entityId}_${Date.now()}`;
    
    return new this({
        _id: alertId,
        type: 'MULTIPLE_PRESENCE',
        severity: 'CRITICAL',
        title: `Multiple Presence Detected`,
        description: `${entityName} appears at multiple locations simultaneously`,
        rule: {
            name: 'multiple_presence_detection',
            condition: 'simultaneous_locations > 1',
            parameters: { locations: locations }
        },
        context: {
            entity_id: entityId,
            entity_name: entityName,
            related_events: locations.map(loc => ({
                location: loc,
                timestamp: new Date()
            }))
        },
        auto_resolve: false,
        metadata: {
            confidence_score: 0.95,
            false_positive_probability: 0.05
        }
    });
};

AlertSchema.statics.getActiveAlerts = function(options = {}) {
    const {
        severity = null,
        type = null,
        entityId = null,
        limit = 50,
        skip = 0
    } = options;
    
    const query = { status: { $in: ['active', 'acknowledged'] } };
    
    if (severity) query.severity = severity;
    if (type) query.type = type;
    if (entityId) query['context.entity_id'] = entityId;
    
    return this.find(query)
        .sort({ severity: -1, triggered_at: -1 })
        .limit(limit)
        .skip(skip);
};

AlertSchema.statics.getAlertStats = function(timeRange = '24h') {
    const startDate = new Date();
    
    switch (timeRange) {
        case '1h':
            startDate.setHours(startDate.getHours() - 1);
            break;
        case '24h':
            startDate.setDate(startDate.getDate() - 1);
            break;
        case '7d':
            startDate.setDate(startDate.getDate() - 7);
            break;
        case '30d':
            startDate.setDate(startDate.getDate() - 30);
            break;
    }
    
    return this.aggregate([
        {
            $match: {
                triggered_at: { $gte: startDate }
            }
        },
        {
            $group: {
                _id: {
                    type: '$type',
                    severity: '$severity',
                    status: '$status'
                },
                count: { $sum: 1 },
                avgResolutionTime: {
                    $avg: {
                        $cond: {
                            if: { $ne: ['$resolved_at', null] },
                            then: { $subtract: ['$resolved_at', '$triggered_at'] },
                            else: null
                        }
                    }
                }
            }
        },
        {
            $sort: { count: -1 }
        }
    ]);
};

module.exports = mongoose.model('Alert', AlertSchema);