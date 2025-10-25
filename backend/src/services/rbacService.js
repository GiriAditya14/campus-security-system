const winston = require('winston');
const User = require('../models/User');

// Logger setup
const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'logs/rbac.log' })
    ]
});

/**
 * Role-Based Access Control Service
 * Manages permissions for ADMIN, SECURITY_OFFICER, OPERATOR, VIEWER roles
 */
class RBACService {
    constructor() {
        // Define role hierarchy (higher number = more permissions)
        this.roleHierarchy = {
            'VIEWER': 1,
            'OPERATOR': 2,
            'SECURITY_OFFICER': 3,
            'ADMIN': 4
        };

        // Define comprehensive permission matrix
        this.permissions = {
            // Entity permissions
            'entities:read': ['ADMIN', 'SECURITY_OFFICER', 'OPERATOR', 'VIEWER'],
            'entities:write': ['ADMIN', 'SECURITY_OFFICER'],
            'entities:delete': ['ADMIN'],
            'entities:manage': ['ADMIN'],
            'entities:search': ['ADMIN', 'SECURITY_OFFICER', 'OPERATOR', 'VIEWER'],
            'entities:export': ['ADMIN', 'SECURITY_OFFICER'],

            // Event permissions
            'events:read': ['ADMIN', 'SECURITY_OFFICER', 'OPERATOR', 'VIEWER'],
            'events:write': ['ADMIN', 'SECURITY_OFFICER'],
            'events:delete': ['ADMIN'],
            'events:timeline': ['ADMIN', 'SECURITY_OFFICER', 'OPERATOR', 'VIEWER'],
            'events:export': ['ADMIN', 'SECURITY_OFFICER'],

            // Alert permissions
            'alerts:read': ['ADMIN', 'SECURITY_OFFICER', 'OPERATOR'],
            'alerts:write': ['ADMIN', 'SECURITY_OFFICER', 'OPERATOR'],
            'alerts:delete': ['ADMIN', 'SECURITY_OFFICER'],
            'alerts:acknowledge': ['ADMIN', 'SECURITY_OFFICER', 'OPERATOR'],
            'alerts:resolve': ['ADMIN', 'SECURITY_OFFICER', 'OPERATOR'],
            'alerts:manage': ['ADMIN', 'SECURITY_OFFICER'],

            // Prediction permissions
            'predictions:read': ['ADMIN', 'SECURITY_OFFICER'],
            'predictions:location': ['ADMIN', 'SECURITY_OFFICER'],
            'predictions:activity': ['ADMIN', 'SECURITY_OFFICER'],
            'predictions:explanations': ['ADMIN', 'SECURITY_OFFICER'],

            // Analytics permissions
            'analytics:read': ['ADMIN', 'SECURITY_OFFICER'],
            'analytics:anomalies': ['ADMIN', 'SECURITY_OFFICER'],
            'analytics:patterns': ['ADMIN', 'SECURITY_OFFICER'],
            'analytics:reports': ['ADMIN', 'SECURITY_OFFICER'],

            // System permissions
            'system:health': ['ADMIN'],
            'system:metrics': ['ADMIN', 'SECURITY_OFFICER'],
            'system:logs': ['ADMIN'],
            'system:config': ['ADMIN'],

            // User management permissions
            'users:read': ['ADMIN'],
            'users:write': ['ADMIN'],
            'users:delete': ['ADMIN'],
            'users:manage': ['ADMIN'],
            'users:roles': ['ADMIN'],

            // Data ingestion permissions
            'ingestion:read': ['ADMIN', 'SECURITY_OFFICER', 'OPERATOR'],
            'ingestion:write': ['ADMIN', 'SECURITY_OFFICER', 'OPERATOR'],
            'ingestion:status': ['ADMIN', 'SECURITY_OFFICER', 'OPERATOR'],
            'ingestion:metrics': ['ADMIN', 'SECURITY_OFFICER'],

            // Dashboard permissions
            'dashboard:overview': ['ADMIN', 'SECURITY_OFFICER', 'OPERATOR', 'VIEWER'],
            'dashboard:map': ['ADMIN', 'SECURITY_OFFICER', 'OPERATOR', 'VIEWER'],
            'dashboard:timeline': ['ADMIN', 'SECURITY_OFFICER', 'OPERATOR', 'VIEWER'],
            'dashboard:alerts': ['ADMIN', 'SECURITY_OFFICER', 'OPERATOR'],
            'dashboard:analytics': ['ADMIN', 'SECURITY_OFFICER'],

            // Export permissions
            'export:entities': ['ADMIN', 'SECURITY_OFFICER'],
            'export:events': ['ADMIN', 'SECURITY_OFFICER'],
            'export:reports': ['ADMIN', 'SECURITY_OFFICER'],
            'export:audit': ['ADMIN']
        };

        // Define resource-specific access rules
        this.resourceRules = {
            // Entity access rules
            entities: {
                'own_data_only': ['VIEWER'], // Viewers can only see their own data
                'department_data': ['OPERATOR'], // Operators can see their department data
                'all_data': ['SECURITY_OFFICER', 'ADMIN'] // Full access
            },

            // Alert access rules
            alerts: {
                'assigned_only': ['OPERATOR'], // Operators see assigned alerts
                'all_alerts': ['SECURITY_OFFICER', 'ADMIN'] // Full alert access
            },

            // Sensitive data access
            sensitive_data: {
                'encrypted_fields': ['ADMIN'], // Only admins can see encrypted fields
                'anonymized_view': ['SECURITY_OFFICER', 'OPERATOR', 'VIEWER'] // Others see anonymized data
            }
        };

        // Define time-based access restrictions
        this.timeRestrictions = {
            'VIEWER': {
                allowed_hours: { start: 6, end: 22 }, // 6 AM to 10 PM
                max_session_duration: 8 * 60 * 60 * 1000 // 8 hours
            },
            'OPERATOR': {
                allowed_hours: { start: 0, end: 24 }, // 24/7 access
                max_session_duration: 12 * 60 * 60 * 1000 // 12 hours
            },
            'SECURITY_OFFICER': {
                allowed_hours: { start: 0, end: 24 }, // 24/7 access
                max_session_duration: 24 * 60 * 60 * 1000 // 24 hours
            },
            'ADMIN': {
                allowed_hours: { start: 0, end: 24 }, // 24/7 access
                max_session_duration: 24 * 60 * 60 * 1000 // 24 hours
            }
        };

        // Cache for permission checks
        this.permissionCache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    }  
  /**
     * Check if user has permission for a specific action on a resource
     */
    hasPermission(user, action, resource = null, context = {}) {
        try {
            // Generate cache key
            const cacheKey = `${user._id}_${action}_${resource}_${JSON.stringify(context)}`;
            
            // Check cache first
            const cached = this.permissionCache.get(cacheKey);
            if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
                return cached.result;
            }

            // Perform permission check
            const result = this.performPermissionCheck(user, action, resource, context);
            
            // Cache the result
            this.permissionCache.set(cacheKey, {
                result,
                timestamp: Date.now()
            });

            // Log permission check for audit
            this.logPermissionCheck(user, action, resource, result, context);

            return result;

        } catch (error) {
            logger.error('Permission check failed:', error);
            return false; // Fail secure
        }
    }

    /**
     * Perform the actual permission check
     */
    performPermissionCheck(user, action, resource, context) {
        // Check if user is active
        if (user.status !== 'active') {
            return false;
        }

        // Check time restrictions
        if (!this.checkTimeRestrictions(user)) {
            return false;
        }

        // Check session validity
        if (!this.checkSessionValidity(user, context.sessionStart)) {
            return false;
        }

        // Check basic permission
        const permission = `${resource}:${action}`;
        if (!this.hasBasicPermission(user.role, permission)) {
            return false;
        }

        // Check resource-specific rules
        if (resource && !this.checkResourceAccess(user, resource, context)) {
            return false;
        }

        // Check context-specific rules
        if (!this.checkContextualAccess(user, action, resource, context)) {
            return false;
        }

        return true;
    }

    /**
     * Check basic permission against role matrix
     */
    hasBasicPermission(userRole, permission) {
        const allowedRoles = this.permissions[permission];
        return allowedRoles && allowedRoles.includes(userRole);
    }

    /**
     * Check time-based access restrictions
     */
    checkTimeRestrictions(user) {
        const restrictions = this.timeRestrictions[user.role];
        if (!restrictions) return true;

        const now = new Date();
        const currentHour = now.getHours();
        
        // Check allowed hours
        const { start, end } = restrictions.allowed_hours;
        if (start <= end) {
            // Normal range (e.g., 6 AM to 10 PM)
            if (currentHour < start || currentHour >= end) {
                return false;
            }
        } else {
            // Overnight range (e.g., 10 PM to 6 AM)
            if (currentHour < start && currentHour >= end) {
                return false;
            }
        }

        return true;
    }

    /**
     * Check session validity and duration
     */
    checkSessionValidity(user, sessionStart) {
        if (!sessionStart) return true; // No session tracking

        const restrictions = this.timeRestrictions[user.role];
        if (!restrictions) return true;

        const sessionDuration = Date.now() - new Date(sessionStart).getTime();
        return sessionDuration <= restrictions.max_session_duration;
    }

    /**
     * Check resource-specific access rules
     */
    checkResourceAccess(user, resource, context) {
        const rules = this.resourceRules[resource];
        if (!rules) return true; // No specific rules

        // Check entity access rules
        if (resource === 'entities') {
            if (rules.own_data_only.includes(user.role)) {
                // Viewers can only access their own entity data
                return context.entityId === user.profile?.employee_id || 
                       context.entityEmail === user.email;
            }
            
            if (rules.department_data.includes(user.role)) {
                // Operators can access their department data
                return !context.entityDepartment || 
                       context.entityDepartment === user.profile?.department;
            }
        }

        // Check alert access rules
        if (resource === 'alerts') {
            if (rules.assigned_only.includes(user.role)) {
                // Operators can only see alerts assigned to them or their department
                return !context.alertAssignee || 
                       context.alertAssignee === user._id ||
                       context.alertDepartment === user.profile?.department;
            }
        }

        // Check sensitive data access
        if (context.sensitiveData) {
            const sensitiveRules = this.resourceRules.sensitive_data;
            if (!sensitiveRules.encrypted_fields.includes(user.role)) {
                return false; // Cannot access encrypted fields
            }
        }

        return true;
    }

    /**
     * Check contextual access rules
     */
    checkContextualAccess(user, action, resource, context) {
        // Check IP restrictions if configured
        if (context.ipAddress && user.profile?.allowedIPs) {
            if (!user.profile.allowedIPs.includes(context.ipAddress)) {
                return false;
            }
        }

        // Check location-based restrictions
        if (context.location && user.profile?.allowedLocations) {
            if (!user.profile.allowedLocations.includes(context.location)) {
                return false;
            }
        }

        // Check data classification restrictions
        if (context.dataClassification) {
            const userClearance = user.profile?.securityClearance || 'public';
            const requiredClearance = context.dataClassification;
            
            const clearanceLevels = {
                'public': 1,
                'internal': 2,
                'confidential': 3,
                'restricted': 4
            };

            if (clearanceLevels[userClearance] < clearanceLevels[requiredClearance]) {
                return false;
            }
        }

        return true;
    }

    /**
     * Get user permissions for a specific resource
     */
    getUserPermissions(user, resource = null) {
        const userPermissions = [];

        for (const [permission, allowedRoles] of Object.entries(this.permissions)) {
            if (allowedRoles.includes(user.role)) {
                // Check if this permission applies to the requested resource
                if (!resource || permission.startsWith(`${resource}:`)) {
                    userPermissions.push(permission);
                }
            }
        }

        return userPermissions;
    }

    /**
     * Check if user can access specific entity
     */
    canAccessEntity(user, entityId, entityData = {}) {
        const context = {
            entityId,
            entityEmail: entityData.email,
            entityDepartment: entityData.department,
            entityType: entityData.entity_type
        };

        return this.hasPermission(user, 'read', 'entities', context);
    }

    /**
     * Filter entities based on user permissions
     */
    filterEntitiesForUser(user, entities) {
        return entities.filter(entity => {
            return this.canAccessEntity(user, entity._id, {
                email: entity.identifiers?.email,
                department: entity.profile?.department,
                entity_type: entity.profile?.entity_type
            });
        });
    }

    /**
     * Get data view level for user (full, anonymized, restricted)
     */
    getDataViewLevel(user, dataType = 'general') {
        // Admins get full access to all data
        if (user.role === 'ADMIN') {
            return 'full';
        }

        // Security officers get full access to most data
        if (user.role === 'SECURITY_OFFICER') {
            return dataType === 'sensitive' ? 'anonymized' : 'full';
        }

        // Operators get anonymized view of sensitive data
        if (user.role === 'OPERATOR') {
            return dataType === 'sensitive' ? 'restricted' : 'anonymized';
        }

        // Viewers get restricted access
        return 'restricted';
    }

    /**
     * Sanitize data based on user permissions
     */
    sanitizeDataForUser(user, data, dataType = 'general') {
        const viewLevel = this.getDataViewLevel(user, dataType);
        
        if (viewLevel === 'full') {
            return data;
        }

        // Create a copy to avoid modifying original data
        const sanitizedData = JSON.parse(JSON.stringify(data));

        if (viewLevel === 'anonymized') {
            // Anonymize sensitive fields
            if (sanitizedData.identifiers) {
                if (sanitizedData.identifiers.email) {
                    sanitizedData.identifiers.email = this.anonymizeEmail(sanitizedData.identifiers.email);
                }
                if (sanitizedData.identifiers.phone) {
                    sanitizedData.identifiers.phone = this.anonymizePhone(sanitizedData.identifiers.phone);
                }
                if (sanitizedData.identifiers.face_embedding) {
                    sanitizedData.identifiers.face_embedding = '[REDACTED]';
                }
            }
            
            if (sanitizedData.profile) {
                if (sanitizedData.profile.address) {
                    sanitizedData.profile.address = '[REDACTED]';
                }
                if (sanitizedData.profile.emergency_contact) {
                    sanitizedData.profile.emergency_contact = '[REDACTED]';
                }
            }
        }

        if (viewLevel === 'restricted') {
            // Remove all sensitive information
            if (sanitizedData.identifiers) {
                delete sanitizedData.identifiers.email;
                delete sanitizedData.identifiers.phone;
                delete sanitizedData.identifiers.face_embedding;
            }
            
            if (sanitizedData.profile) {
                delete sanitizedData.profile.address;
                delete sanitizedData.profile.emergency_contact;
                delete sanitizedData.profile.date_of_birth;
            }
        }

        return sanitizedData;
    }

    /**
     * Check if user can perform bulk operations
     */
    canPerformBulkOperation(user, operation, resourceCount) {
        // Define bulk operation limits by role
        const bulkLimits = {
            'ADMIN': { max: 10000, operations: ['read', 'write', 'delete', 'export'] },
            'SECURITY_OFFICER': { max: 5000, operations: ['read', 'write', 'export'] },
            'OPERATOR': { max: 1000, operations: ['read', 'write'] },
            'VIEWER': { max: 100, operations: ['read'] }
        };

        const userLimits = bulkLimits[user.role];
        if (!userLimits) return false;

        // Check if operation is allowed
        if (!userLimits.operations.includes(operation)) {
            return false;
        }

        // Check resource count limit
        if (resourceCount > userLimits.max) {
            return false;
        }

        return true;
    }

    /**
     * Generate permission summary for user
     */
    getPermissionSummary(user) {
        const summary = {
            role: user.role,
            roleLevel: this.roleHierarchy[user.role] || 0,
            permissions: this.getUserPermissions(user),
            restrictions: {
                timeRestrictions: this.timeRestrictions[user.role],
                dataViewLevel: {
                    general: this.getDataViewLevel(user, 'general'),
                    sensitive: this.getDataViewLevel(user, 'sensitive')
                }
            },
            capabilities: {
                canAccessAllEntities: this.hasBasicPermission(user.role, 'entities:manage'),
                canManageAlerts: this.hasBasicPermission(user.role, 'alerts:manage'),
                canViewAnalytics: this.hasBasicPermission(user.role, 'analytics:read'),
                canManageUsers: this.hasBasicPermission(user.role, 'users:manage'),
                canAccessSystem: this.hasBasicPermission(user.role, 'system:health')
            }
        };

        return summary;
    }

    /**
     * Log permission check for audit purposes
     */
    logPermissionCheck(user, action, resource, granted, context) {
        // Only log denied permissions and sensitive operations
        if (!granted || this.isSensitiveOperation(action, resource)) {
            logger.info('Permission check', {
                userId: user._id,
                username: user.username,
                role: user.role,
                action,
                resource,
                granted,
                context: {
                    ipAddress: context.ipAddress,
                    userAgent: context.userAgent,
                    timestamp: new Date().toISOString()
                }
            });
        }
    }

    /**
     * Check if operation is considered sensitive
     */
    isSensitiveOperation(action, resource) {
        const sensitiveOperations = [
            'users:write', 'users:delete', 'users:manage',
            'system:config', 'system:logs',
            'entities:delete', 'events:delete',
            'export:audit'
        ];

        return sensitiveOperations.includes(`${resource}:${action}`);
    }

    // Utility methods
    anonymizeEmail(email) {
        if (!email || typeof email !== 'string') return '[REDACTED]';
        
        const [local, domain] = email.split('@');
        if (!domain) return '[REDACTED]';
        
        const anonymizedLocal = local.length > 2 ? 
            local.substring(0, 2) + '*'.repeat(local.length - 2) : 
            '*'.repeat(local.length);
        
        return `${anonymizedLocal}@${domain}`;
    }

    anonymizePhone(phone) {
        if (!phone || typeof phone !== 'string') return '[REDACTED]';
        
        const digits = phone.replace(/\D/g, '');
        if (digits.length < 4) return '[REDACTED]';
        
        return '*'.repeat(digits.length - 4) + digits.slice(-4);
    }

    /**
     * Clear permission cache
     */
    clearCache() {
        this.permissionCache.clear();
        logger.info('RBAC permission cache cleared');
    }

    /**
     * Get cache statistics
     */
    getCacheStats() {
        return {
            cacheSize: this.permissionCache.size,
            cacheTimeout: this.cacheTimeout
        };
    }

    /**
     * Validate role hierarchy
     */
    isHigherRole(role1, role2) {
        const level1 = this.roleHierarchy[role1] || 0;
        const level2 = this.roleHierarchy[role2] || 0;
        return level1 > level2;
    }

    /**
     * Get all available roles
     */
    getAvailableRoles() {
        return Object.keys(this.roleHierarchy).sort((a, b) => 
            this.roleHierarchy[a] - this.roleHierarchy[b]
        );
    }

    /**
     * Get role permissions matrix
     */
    getRolePermissionsMatrix() {
        const matrix = {};
        
        for (const role of this.getAvailableRoles()) {
            matrix[role] = [];
            
            for (const [permission, allowedRoles] of Object.entries(this.permissions)) {
                if (allowedRoles.includes(role)) {
                    matrix[role].push(permission);
                }
            }
        }
        
        return matrix;
    }

    /**
     * Simple role-based permission check (for compatibility)
     */
    checkPermission(userRole, requiredPermissions) {
        try {
            // Define role permissions
            const rolePermissions = {
                'ADMIN': ['entities:read', 'events:read', 'alerts:read', 'users:read', 'analytics:read', 'data:write'],
                'SECURITY_OFFICER': ['entities:read', 'events:read', 'alerts:read', 'analytics:read'],
                'OPERATOR': ['entities:read', 'events:read', 'alerts:read'],
                'VIEWER': ['entities:read', 'events:read']
            };

            const userPermissions = rolePermissions[userRole] || [];
            
            // Check if user has any of the required permissions
            return requiredPermissions.some(permission => 
                userPermissions.includes(permission)
            );
        } catch (error) {
            logger.error('Simple permission check failed:', error);
            return false;
        }
    }

    /**
     * Get available roles
     */
    getRoles() {
        return this.getAvailableRoles();
    }

    /**
     * Get permissions for a specific role
     */
    getRolePermissions(role) {
        const rolePermissions = {
            'ADMIN': ['entities:read', 'events:read', 'alerts:read', 'users:read', 'analytics:read', 'data:write'],
            'SECURITY_OFFICER': ['entities:read', 'events:read', 'alerts:read', 'analytics:read'],
            'OPERATOR': ['entities:read', 'events:read', 'alerts:read'],
            'VIEWER': ['entities:read', 'events:read']
        };

        return rolePermissions[role] || [];
    }
}

module.exports = RBACService;