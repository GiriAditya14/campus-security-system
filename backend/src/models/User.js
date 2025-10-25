const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// User preferences schema
const PreferencesSchema = new mongoose.Schema({
    theme: {
        type: String,
        enum: ['light', 'dark', 'auto'],
        default: 'dark'
    },
    language: {
        type: String,
        default: 'en'
    },
    timezone: {
        type: String,
        default: 'UTC'
    },
    notifications: {
        email: {
            type: Boolean,
            default: true
        },
        sms: {
            type: Boolean,
            default: false
        },
        push: {
            type: Boolean,
            default: true
        },
        alert_types: [{
            type: String,
            enum: ['INACTIVITY', 'UNUSUAL_LOCATION', 'MULTIPLE_PRESENCE', 'PATTERN_ANOMALY', 'SECURITY_BREACH', 'SYSTEM_ERROR']
        }]
    },
    dashboard: {
        default_view: {
            type: String,
            enum: ['overview', 'entities', 'alerts', 'analytics'],
            default: 'overview'
        },
        refresh_interval: {
            type: Number,
            default: 30000 // 30 seconds
        },
        items_per_page: {
            type: Number,
            default: 25
        }
    }
}, { _id: false });

// Session schema for tracking user sessions
const SessionSchema = new mongoose.Schema({
    token: {
        type: String,
        required: true
    },
    ip_address: {
        type: String,
        required: true
    },
    user_agent: {
        type: String,
        required: true
    },
    created_at: {
        type: Date,
        default: Date.now
    },
    last_activity: {
        type: Date,
        default: Date.now
    },
    expires_at: {
        type: Date,
        required: true
    },
    is_active: {
        type: Boolean,
        default: true
    }
}, { _id: false });

// Main User schema
const UserSchema = new mongoose.Schema({
    _id: {
        type: String,
        required: true
    },
    username: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        minlength: 3,
        maxlength: 50,
        index: true
    },
    email: {
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
        index: true,
        match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
    },
    password: {
        type: String,
        required: true,
        minlength: 8
    },
    role: {
        type: String,
        enum: ['ADMIN', 'SECURITY_OFFICER', 'OPERATOR', 'VIEWER'],
        required: true,
        index: true
    },
    profile: {
        first_name: {
            type: String,
            required: true,
            trim: true
        },
        last_name: {
            type: String,
            required: true,
            trim: true
        },
        phone: {
            type: String,
            sparse: true,
            match: [/^\+?[\d\s\-\(\)]+$/, 'Please enter a valid phone number']
        },
        department: {
            type: String,
            sparse: true
        },
        employee_id: {
            type: String,
            sparse: true,
            index: true
        },
        avatar_url: {
            type: String,
            sparse: true
        }
    },
    permissions: [{
        resource: {
            type: String,
            required: true
        },
        actions: [{
            type: String,
            enum: ['read', 'write', 'delete', 'manage']
        }]
    }],
    preferences: {
        type: PreferencesSchema,
        default: {}
    },
    sessions: {
        type: [SessionSchema],
        default: []
    },
    status: {
        type: String,
        enum: ['active', 'inactive', 'suspended', 'locked'],
        default: 'active',
        index: true
    },
    last_login: {
        type: Date,
        sparse: true
    },
    login_attempts: {
        type: Number,
        default: 0
    },
    locked_until: {
        type: Date,
        sparse: true
    },
    password_reset_token: {
        type: String,
        sparse: true
    },
    password_reset_expires: {
        type: Date,
        sparse: true
    },
    two_factor: {
        enabled: {
            type: Boolean,
            default: false
        },
        secret: {
            type: String,
            sparse: true
        },
        backup_codes: [{
            type: String
        }]
    },
    audit_log: [{
        action: String,
        resource: String,
        timestamp: {
            type: Date,
            default: Date.now
        },
        ip_address: String,
        user_agent: String,
        success: Boolean,
        details: mongoose.Schema.Types.Mixed
    }]
}, {
    timestamps: true,
    collection: 'users'
});

// Indexes
UserSchema.index({ email: 1, status: 1 });
UserSchema.index({ role: 1, status: 1 });
UserSchema.index({ 'profile.employee_id': 1 });
UserSchema.index({ 'sessions.token': 1 });
UserSchema.index({ 'sessions.expires_at': 1 }, { expireAfterSeconds: 0 });

// Pre-save middleware for password hashing
UserSchema.pre('save', async function(next) {
    // Only hash password if it's modified
    if (!this.isModified('password')) return next();
    
    try {
        // Hash password with cost of 12
        const salt = await bcrypt.genSalt(12);
        this.password = await bcrypt.hash(this.password, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Instance methods
UserSchema.methods.comparePassword = async function(candidatePassword) {
    return bcrypt.compare(candidatePassword, this.password);
};

UserSchema.methods.generateAuthToken = function() {
    const payload = {
        userId: this._id,
        username: this.username,
        role: this.role,
        permissions: this.getPermissions()
    };
    
    return jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRE || '7d'
    });
};

UserSchema.methods.getPermissions = function() {
    // Default role-based permissions
    const rolePermissions = {
        ADMIN: [
            { resource: 'all', actions: ['read', 'write', 'delete', 'manage'] }
        ],
        SECURITY_OFFICER: [
            { resource: 'entities', actions: ['read'] },
            { resource: 'events', actions: ['read'] },
            { resource: 'alerts', actions: ['read', 'write'] },
            { resource: 'predictions', actions: ['read'] },
            { resource: 'reports', actions: ['read', 'write'] }
        ],
        OPERATOR: [
            { resource: 'entities', actions: ['read'] },
            { resource: 'events', actions: ['read'] },
            { resource: 'alerts', actions: ['read', 'write'] },
            { resource: 'timeline', actions: ['read'] }
        ],
        VIEWER: [
            { resource: 'entities', actions: ['read'] },
            { resource: 'events', actions: ['read'] },
            { resource: 'timeline', actions: ['read'] }
        ]
    };
    
    // Merge role permissions with custom permissions
    const basePermissions = rolePermissions[this.role] || [];
    return [...basePermissions, ...this.permissions];
};

UserSchema.methods.hasPermission = function(resource, action) {
    const permissions = this.getPermissions();
    
    // Check for admin access
    const adminPerm = permissions.find(p => p.resource === 'all');
    if (adminPerm && adminPerm.actions.includes(action)) {
        return true;
    }
    
    // Check specific resource permission
    const resourcePerm = permissions.find(p => p.resource === resource);
    return resourcePerm && resourcePerm.actions.includes(action);
};

UserSchema.methods.createSession = function(ipAddress, userAgent) {
    const token = this.generateAuthToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days
    
    const session = {
        token: token,
        ip_address: ipAddress,
        user_agent: userAgent,
        expires_at: expiresAt,
        is_active: true
    };
    
    // Remove old sessions (keep only last 5)
    if (this.sessions.length >= 5) {
        this.sessions = this.sessions.slice(-4);
    }
    
    this.sessions.push(session);
    this.last_login = new Date();
    this.login_attempts = 0; // Reset login attempts on successful login
    
    return token;
};

UserSchema.methods.invalidateSession = function(token) {
    const session = this.sessions.find(s => s.token === token);
    if (session) {
        session.is_active = false;
    }
};

UserSchema.methods.invalidateAllSessions = function() {
    this.sessions.forEach(session => {
        session.is_active = false;
    });
};

UserSchema.methods.incrementLoginAttempts = function() {
    // If we have a previous lock that has expired, restart at 1
    if (this.locked_until && this.locked_until < Date.now()) {
        return this.updateOne({
            $unset: { locked_until: 1 },
            $set: { login_attempts: 1 }
        });
    }
    
    const updates = { $inc: { login_attempts: 1 } };
    
    // If we have 5 failed attempts and it's not locked yet, lock it
    if (this.login_attempts + 1 >= 5 && !this.isLocked) {
        updates.$set = { locked_until: Date.now() + 2 * 60 * 60 * 1000 }; // 2 hours
    }
    
    return this.updateOne(updates);
};

UserSchema.methods.addAuditLog = function(action, resource, ipAddress, userAgent, success = true, details = {}) {
    this.audit_log.push({
        action: action,
        resource: resource,
        ip_address: ipAddress,
        user_agent: userAgent,
        success: success,
        details: details
    });
    
    // Keep only last 100 audit entries
    if (this.audit_log.length > 100) {
        this.audit_log = this.audit_log.slice(-100);
    }
};

UserSchema.methods.updatePreferences = function(newPreferences) {
    this.preferences = { ...this.preferences.toObject(), ...newPreferences };
    return this.save();
};

UserSchema.methods.toSafeObject = function() {
    const obj = this.toObject();
    delete obj.password;
    delete obj.sessions;
    delete obj.password_reset_token;
    delete obj.two_factor.secret;
    delete obj.two_factor.backup_codes;
    return obj;
};

// Virtual for checking if account is locked
UserSchema.virtual('isLocked').get(function() {
    return !!(this.locked_until && this.locked_until > Date.now());
});

// Static methods
UserSchema.statics.findByCredentials = async function(email, password) {
    const user = await this.findOne({ 
        email: email.toLowerCase(),
        status: { $in: ['active', 'inactive'] }
    });
    
    if (!user) {
        throw new Error('Invalid login credentials');
    }
    
    if (user.isLocked) {
        throw new Error('Account temporarily locked due to too many failed login attempts');
    }
    
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
        await user.incrementLoginAttempts();
        throw new Error('Invalid login credentials');
    }
    
    return user;
};

UserSchema.statics.findByToken = async function(token) {
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await this.findOne({
            _id: decoded.userId,
            status: 'active',
            'sessions.token': token,
            'sessions.is_active': true
        });
        
        if (!user) {
            throw new Error('Invalid token');
        }
        
        // Update last activity
        const session = user.sessions.find(s => s.token === token);
        if (session) {
            session.last_activity = new Date();
            await user.save();
        }
        
        return user;
    } catch (error) {
        throw new Error('Invalid token');
    }
};

UserSchema.statics.getUserStats = function() {
    return this.aggregate([
        {
            $group: {
                _id: '$role',
                count: { $sum: 1 },
                active: {
                    $sum: {
                        $cond: [{ $eq: ['$status', 'active'] }, 1, 0]
                    }
                },
                lastLogin: { $max: '$last_login' }
            }
        },
        {
            $sort: { count: -1 }
        }
    ]);
};

UserSchema.statics.getActiveUsers = function(timeRange = '24h') {
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
    }
    
    return this.find({
        status: 'active',
        last_login: { $gte: startDate }
    }).select('username email role last_login');
};

module.exports = mongoose.model('User', UserSchema);