const mongoose = require('mongoose');
const crypto = require('crypto');

// Encryption utilities
const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'your-32-character-encryption-key-here';
const ALGORITHM = 'aes-256-gcm';

function encrypt(text) {
    if (!text) return null;
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipher(ALGORITHM, ENCRYPTION_KEY);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    return {
        iv: iv.toString('hex'),
        encryptedData: encrypted,
        authTag: authTag.toString('hex')
    };
}

function decrypt(hash) {
    if (!hash || !hash.encryptedData) return null;
    try {
        const decipher = crypto.createDecipher(ALGORITHM, ENCRYPTION_KEY);
        decipher.setAuthTag(Buffer.from(hash.authTag, 'hex'));
        let decrypted = decipher.update(hash.encryptedData, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        return decrypted;
    } catch (error) {
        console.error('Decryption error:', error);
        return null;
    }
}

// Entity identifiers schema
const IdentifiersSchema = new mongoose.Schema({
    student_id: {
        type: String,
        sparse: true,
        index: true
    },
    employee_id: {
        type: String,
        sparse: true,
        index: true
    },
    email: {
        type: mongoose.Schema.Types.Mixed, // Encrypted field
        required: true
    },
    phone: {
        type: mongoose.Schema.Types.Mixed, // Encrypted field
        sparse: true
    },
    card_id: {
        type: String,
        required: true,
        index: true
    },
    device_hashes: [{
        type: String,
        index: true
    }],
    face_embedding: {
        type: mongoose.Schema.Types.Mixed, // Encrypted field
        sparse: true
    },
    face_id: {
        type: String,
        sparse: true,
        index: true
    },
    system_user_email: {
        type: String,
        sparse: true,
        index: true
    }
}, { _id: false });

// Entity profile schema
const ProfileSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        index: 'text'
    },
    first_name: {
        type: String,
        required: true
    },
    last_name: {
        type: String,
        required: true
    },
    entity_type: {
        type: String,
        enum: ['student', 'faculty', 'staff', 'visitor'],
        required: true,
        index: true
    },
    department: {
        type: String,
        required: true,
        index: true
    },
    year: {
        type: Number,
        min: 1,
        max: 5,
        sparse: true // Only for students
    },
    role: {
        type: String,
        sparse: true // For faculty/staff
    },
    date_of_birth: {
        type: Date,
        sparse: true
    },
    gender: {
        type: String,
        enum: ['Male', 'Female', 'Other'],
        sparse: true
    },
    address: {
        type: mongoose.Schema.Types.Mixed, // Encrypted field
        sparse: true
    },
    emergency_contact: {
        type: mongoose.Schema.Types.Mixed, // Encrypted field
        sparse: true
    },
    blood_group: {
        type: String,
        enum: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
        sparse: true
    },
    hostel: {
        type: String,
        sparse: true
    },
    room_number: {
        type: String,
        sparse: true
    },
    office_location: {
        type: String,
        sparse: true
    }
}, { _id: false });

// Entity metadata schema
const MetadataSchema = new mongoose.Schema({
    confidence: {
        type: Number,
        min: 0,
        max: 1,
        default: 1.0
    },
    source_records: [{
        type: String
    }],
    resolution_algorithm: {
        type: String,
        default: 'hybrid_probabilistic_ml'
    },
    last_updated_by: {
        type: String,
        default: 'system'
    },
    status: {
        type: String,
        enum: ['active', 'inactive', 'suspended', 'graduated', 'terminated'],
        default: 'active',
        index: true
    },
    joining_date: {
        type: Date,
        sparse: true
    },
    leaving_date: {
        type: Date,
        sparse: true
    },
    tags: [{
        type: String,
        index: true
    }],
    notes: {
        type: String,
        sparse: true
    }
}, { _id: false });

// Main Entity schema
const EntitySchema = new mongoose.Schema({
    _id: {
        type: String,
        required: true
    },
    resolved_at: {
        type: Date,
        default: Date.now,
        index: true
    },
    identifiers: {
        type: IdentifiersSchema,
        required: true
    },
    profile: {
        type: ProfileSchema,
        required: true
    },
    metadata: {
        type: MetadataSchema,
        required: true
    }
}, {
    timestamps: true,
    collection: 'entities'
});

// Compound indexes for performance
EntitySchema.index({ 'identifiers.email': 1, 'metadata.status': 1 });
EntitySchema.index({ 'identifiers.card_id': 1, 'metadata.status': 1 });
EntitySchema.index({ 'identifiers.device_hashes': 1, 'metadata.status': 1 });
EntitySchema.index({ 'profile.entity_type': 1, 'profile.department': 1 });
EntitySchema.index({ 'profile.name': 'text', 'identifiers.student_id': 'text', 'identifiers.employee_id': 'text' });
EntitySchema.index({ 'metadata.confidence': -1, 'resolved_at': -1 });

// Pre-save middleware for encryption
EntitySchema.pre('save', function(next) {
    // Encrypt sensitive fields
    if (this.identifiers.email && typeof this.identifiers.email === 'string') {
        this.identifiers.email = encrypt(this.identifiers.email);
    }
    if (this.identifiers.phone && typeof this.identifiers.phone === 'string') {
        this.identifiers.phone = encrypt(this.identifiers.phone);
    }
    if (this.identifiers.face_embedding && Array.isArray(this.identifiers.face_embedding)) {
        this.identifiers.face_embedding = encrypt(JSON.stringify(this.identifiers.face_embedding));
    }
    if (this.profile.address && typeof this.profile.address === 'string') {
        this.profile.address = encrypt(this.profile.address);
    }
    if (this.profile.emergency_contact && typeof this.profile.emergency_contact === 'string') {
        this.profile.emergency_contact = encrypt(this.profile.emergency_contact);
    }
    
    next();
});

// Post-find middleware for decryption
EntitySchema.post(['find', 'findOne', 'findOneAndUpdate'], function(docs) {
    if (!docs) return;
    
    const decryptEntity = (entity) => {
        if (entity.identifiers) {
            if (entity.identifiers.email && typeof entity.identifiers.email === 'object') {
                entity.identifiers.email = decrypt(entity.identifiers.email);
            }
            if (entity.identifiers.phone && typeof entity.identifiers.phone === 'object') {
                entity.identifiers.phone = decrypt(entity.identifiers.phone);
            }
            if (entity.identifiers.face_embedding && typeof entity.identifiers.face_embedding === 'object') {
                const decrypted = decrypt(entity.identifiers.face_embedding);
                entity.identifiers.face_embedding = decrypted ? JSON.parse(decrypted) : null;
            }
        }
        if (entity.profile) {
            if (entity.profile.address && typeof entity.profile.address === 'object') {
                entity.profile.address = decrypt(entity.profile.address);
            }
            if (entity.profile.emergency_contact && typeof entity.profile.emergency_contact === 'object') {
                entity.profile.emergency_contact = decrypt(entity.profile.emergency_contact);
            }
        }
    };
    
    if (Array.isArray(docs)) {
        docs.forEach(decryptEntity);
    } else {
        decryptEntity(docs);
    }
});

// Instance methods
EntitySchema.methods.toSafeObject = function(includeEncrypted = false) {
    const obj = this.toObject();
    
    if (!includeEncrypted) {
        // Remove or anonymize sensitive data
        if (obj.identifiers) {
            obj.identifiers.email = obj.identifiers.email ? '***@***.***' : null;
            obj.identifiers.phone = obj.identifiers.phone ? '***-***-****' : null;
            obj.identifiers.face_embedding = obj.identifiers.face_embedding ? '[REDACTED]' : null;
        }
        if (obj.profile) {
            obj.profile.address = obj.profile.address ? '[REDACTED]' : null;
            obj.profile.emergency_contact = obj.profile.emergency_contact ? '***-***-****' : null;
        }
    }
    
    return obj;
};

EntitySchema.methods.getConfidenceScore = function() {
    return this.metadata.confidence || 0;
};

EntitySchema.methods.addSourceRecord = function(recordId) {
    if (!this.metadata.source_records.includes(recordId)) {
        this.metadata.source_records.push(recordId);
    }
};

EntitySchema.methods.updateConfidence = function(newConfidence, algorithm = 'manual') {
    this.metadata.confidence = Math.max(0, Math.min(1, newConfidence));
    this.metadata.resolution_algorithm = algorithm;
    this.metadata.last_updated_by = 'system';
};

// Static methods
EntitySchema.statics.findByIdentifier = function(identifier, value) {
    const query = {};
    query[`identifiers.${identifier}`] = value;
    return this.findOne(query);
};

EntitySchema.statics.searchEntities = function(searchTerm, options = {}) {
    const {
        limit = 50,
        skip = 0,
        entityType = null,
        department = null,
        status = 'active'
    } = options;
    
    const query = {
        'metadata.status': status,
        $or: [
            { 'profile.name': { $regex: searchTerm, $options: 'i' } },
            { 'identifiers.student_id': { $regex: searchTerm, $options: 'i' } },
            { 'identifiers.employee_id': { $regex: searchTerm, $options: 'i' } },
            { 'identifiers.card_id': { $regex: searchTerm, $options: 'i' } }
        ]
    };
    
    if (entityType) {
        query['profile.entity_type'] = entityType;
    }
    
    if (department) {
        query['profile.department'] = department;
    }
    
    return this.find(query)
        .limit(limit)
        .skip(skip)
        .sort({ 'metadata.confidence': -1, 'resolved_at': -1 });
};

EntitySchema.statics.getEntityStats = function() {
    return this.aggregate([
        {
            $group: {
                _id: '$profile.entity_type',
                count: { $sum: 1 },
                avgConfidence: { $avg: '$metadata.confidence' }
            }
        },
        {
            $sort: { count: -1 }
        }
    ]);
};

module.exports = mongoose.model('Entity', EntitySchema);