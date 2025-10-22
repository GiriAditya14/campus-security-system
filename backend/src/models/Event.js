const mongoose = require('mongoose');

// Location schema for events
const LocationSchema = new mongoose.Schema({
    building: {
        type: String,
        required: true,
        index: true
    },
    room: {
        type: String,
        sparse: true
    },
    floor: {
        type: String,
        sparse: true
    },
    coordinates: {
        lat: {
            type: Number,
            min: -90,
            max: 90
        },
        lon: {
            type: Number,
            min: -180,
            max: 180
        }
    },
    zone: {
        type: String,
        enum: ['academic', 'residential', 'recreational', 'administrative', 'restricted'],
        default: 'academic'
    },
    access_level: {
        type: String,
        enum: ['public', 'restricted', 'private', 'emergency_only'],
        default: 'public'
    }
}, { _id: false });

// Source information schema
const SourceSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['card_swipe', 'wifi_log', 'cctv_frame', 'helpdesk', 'rsvp', 'asset'],
        required: true
    },
    id: {
        type: String,
        required: true
    },
    confidence: {
        type: Number,
        min: 0,
        max: 1,
        required: true
    },
    raw_data: {
        type: mongoose.Schema.Types.Mixed,
        sparse: true
    },
    processing_metadata: {
        algorithm_version: String,
        processing_time_ms: Number,
        quality_score: Number
    }
}, { _id: false });

// Provenance tracking schema
const ProvenanceSchema = new mongoose.Schema({
    fusion_algorithm: {
        type: String,
        enum: ['dempster_shafer', 'weighted_average', 'bayesian_fusion', 'majority_vote'],
        default: 'dempster_shafer'
    },
    processing_time: {
        type: String,
        required: true
    },
    conflicts_resolved: {
        type: Number,
        default: 0
    },
    data_lineage: [{
        source_id: String,
        transformation: String,
        timestamp: Date
    }],
    quality_metrics: {
        completeness: Number,
        accuracy: Number,
        consistency: Number,
        timeliness: Number
    }
}, { _id: false });

// Main Event schema
const EventSchema = new mongoose.Schema({
    _id: {
        type: String,
        required: true
    },
    entity_id: {
        type: String,
        required: true,
        index: true,
        ref: 'Entity'
    },
    timestamp: {
        type: Date,
        required: true,
        index: true
    },
    activity_type: {
        type: String,
        enum: ['access', 'connectivity', 'transaction', 'service', 'social', 'academic', 'maintenance'],
        required: true,
        index: true
    },
    activity_subtype: {
        type: String,
        sparse: true,
        index: true
    },
    location: {
        type: LocationSchema,
        required: true
    },
    sources: {
        type: [SourceSchema],
        required: true,
        validate: {
            validator: function(sources) {
                return sources && sources.length > 0;
            },
            message: 'At least one source is required'
        }
    },
    fused_confidence: {
        type: Number,
        min: 0,
        max: 1,
        required: true,
        index: true
    },
    provenance: {
        type: ProvenanceSchema,
        required: true
    },
    duration: {
        type: Number, // Duration in seconds
        min: 0,
        sparse: true
    },
    associated_entities: [{
        entity_id: String,
        relationship: String,
        confidence: Number
    }],
    tags: [{
        type: String,
        index: true
    }],
    anomaly_score: {
        type: Number,
        min: 0,
        max: 1,
        sparse: true,
        index: true
    },
    risk_level: {
        type: String,
        enum: ['low', 'medium', 'high', 'critical'],
        default: 'low',
        index: true
    }
}, {
    timestamps: true,
    collection: 'events'
});

// Compound indexes for performance optimization
EventSchema.index({ entity_id: 1, timestamp: -1 });
EventSchema.index({ timestamp: -1, activity_type: 1 });
EventSchema.index({ 'location.building': 1, timestamp: -1 });
EventSchema.index({ 'location.zone': 1, 'location.access_level': 1 });
EventSchema.index({ fused_confidence: -1, timestamp: -1 });
EventSchema.index({ anomaly_score: -1, risk_level: 1 });
EventSchema.index({ 'sources.type': 1, timestamp: -1 });

// Geospatial index for location-based queries
EventSchema.index({ 'location.coordinates': '2dsphere' });

// Text index for search functionality
EventSchema.index({
    activity_type: 'text',
    activity_subtype: 'text',
    'location.building': 'text',
    'location.room': 'text',
    tags: 'text'
});

// Pre-save middleware
EventSchema.pre('save', function(next) {
    // Calculate fused confidence if not provided
    if (!this.fused_confidence && this.sources && this.sources.length > 0) {
        this.fused_confidence = this.calculateFusedConfidence();
    }
    
    // Set risk level based on anomaly score
    if (this.anomaly_score !== undefined) {
        if (this.anomaly_score >= 0.8) {
            this.risk_level = 'critical';
        } else if (this.anomaly_score >= 0.6) {
            this.risk_level = 'high';
        } else if (this.anomaly_score >= 0.3) {
            this.risk_level = 'medium';
        } else {
            this.risk_level = 'low';
        }
    }
    
    next();
});

// Instance methods
EventSchema.methods.calculateFusedConfidence = function() {
    if (!this.sources || this.sources.length === 0) {
        return 0;
    }
    
    // Dempster-Shafer theory implementation for confidence fusion
    let belief = 0;
    let uncertainty = 1;
    
    for (const source of this.sources) {
        const sourceConfidence = source.confidence;
        const sourceBelief = sourceConfidence;
        const sourceUncertainty = 1 - sourceConfidence;
        
        // Combine beliefs using Dempster's rule
        const k = belief * sourceUncertainty + sourceBelief * uncertainty;
        
        if (k > 0) {
            belief = (belief * sourceBelief) / (1 - k);
            uncertainty = (uncertainty * sourceUncertainty) / (1 - k);
        }
    }
    
    return Math.min(0.99, Math.max(0.01, belief));
};

EventSchema.methods.addSource = function(sourceType, sourceId, confidence, rawData = null) {
    const source = {
        type: sourceType,
        id: sourceId,
        confidence: confidence,
        raw_data: rawData,
        processing_metadata: {
            algorithm_version: '1.0.0',
            processing_time_ms: Date.now() - this.createdAt,
            quality_score: confidence
        }
    };
    
    this.sources.push(source);
    this.fused_confidence = this.calculateFusedConfidence();
};

EventSchema.methods.updateProvenance = function(algorithm, processingTime, conflictsResolved = 0) {
    this.provenance.fusion_algorithm = algorithm;
    this.provenance.processing_time = processingTime;
    this.provenance.conflicts_resolved = conflictsResolved;
    
    // Add to data lineage
    this.provenance.data_lineage.push({
        source_id: 'fusion_engine',
        transformation: `${algorithm}_fusion`,
        timestamp: new Date()
    });
};

EventSchema.methods.calculateAnomalyScore = function(historicalPattern) {
    // Simplified anomaly detection based on location and time patterns
    let score = 0;
    
    // Time-based anomaly (unusual hours)
    const hour = this.timestamp.getHours();
    if (hour < 6 || hour > 22) {
        score += 0.3;
    }
    
    // Location-based anomaly (restricted areas)
    if (this.location.access_level === 'restricted' || this.location.access_level === 'private') {
        score += 0.4;
    }
    
    // Confidence-based anomaly (low confidence events)
    if (this.fused_confidence < 0.5) {
        score += 0.3;
    }
    
    return Math.min(1, score);
};

EventSchema.methods.toTimelineFormat = function() {
    return {
        id: this._id,
        timestamp: this.timestamp,
        activity: `${this.activity_type}${this.activity_subtype ? `:${this.activity_subtype}` : ''}`,
        location: `${this.location.building}${this.location.room ? `, ${this.location.room}` : ''}`,
        confidence: this.fused_confidence,
        sources: this.sources.map(s => s.type),
        risk_level: this.risk_level,
        duration: this.duration
    };
};

// Static methods
EventSchema.statics.getEntityTimeline = function(entityId, startDate, endDate, options = {}) {
    const {
        limit = 100,
        skip = 0,
        activityTypes = null,
        minConfidence = 0
    } = options;
    
    const query = {
        entity_id: entityId,
        timestamp: {
            $gte: startDate,
            $lte: endDate
        },
        fused_confidence: { $gte: minConfidence }
    };
    
    if (activityTypes && activityTypes.length > 0) {
        query.activity_type = { $in: activityTypes };
    }
    
    return this.find(query)
        .sort({ timestamp: -1 })
        .limit(limit)
        .skip(skip);
};

EventSchema.statics.getLocationActivity = function(building, startDate, endDate) {
    return this.aggregate([
        {
            $match: {
                'location.building': building,
                timestamp: {
                    $gte: startDate,
                    $lte: endDate
                }
            }
        },
        {
            $group: {
                _id: {
                    hour: { $hour: '$timestamp' },
                    activity_type: '$activity_type'
                },
                count: { $sum: 1 },
                avgConfidence: { $avg: '$fused_confidence' }
            }
        },
        {
            $sort: { '_id.hour': 1, count: -1 }
        }
    ]);
};

EventSchema.statics.detectAnomalies = function(entityId, lookbackHours = 24) {
    const startDate = new Date(Date.now() - lookbackHours * 60 * 60 * 1000);
    
    return this.find({
        entity_id: entityId,
        timestamp: { $gte: startDate },
        $or: [
            { anomaly_score: { $gte: 0.7 } },
            { risk_level: { $in: ['high', 'critical'] } },
            { fused_confidence: { $lt: 0.3 } }
        ]
    }).sort({ anomaly_score: -1, timestamp: -1 });
};

EventSchema.statics.getActivityHeatmap = function(startDate, endDate) {
    return this.aggregate([
        {
            $match: {
                timestamp: {
                    $gte: startDate,
                    $lte: endDate
                },
                'location.coordinates.lat': { $exists: true },
                'location.coordinates.lon': { $exists: true }
            }
        },
        {
            $group: {
                _id: {
                    lat: { $round: ['$location.coordinates.lat', 4] },
                    lon: { $round: ['$location.coordinates.lon', 4] },
                    building: '$location.building'
                },
                count: { $sum: 1 },
                unique_entities: { $addToSet: '$entity_id' },
                avg_confidence: { $avg: '$fused_confidence' }
            }
        },
        {
            $project: {
                _id: 1,
                count: 1,
                unique_entity_count: { $size: '$unique_entities' },
                avg_confidence: 1,
                intensity: { $multiply: ['$count', '$avg_confidence'] }
            }
        },
        {
            $sort: { intensity: -1 }
        }
    ]);
};

module.exports = mongoose.model('Event', EventSchema);