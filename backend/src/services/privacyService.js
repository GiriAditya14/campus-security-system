const crypto = require('crypto');
const winston = require('winston');

// Logger setup
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console(),
        new winston.transports.File({ filename: 'logs/privacy.log' })
    ]
});

/**
 * Privacy-Preserving Service
 * Implements differential privacy, k-anonymity, and data minimization
 */
class PrivacyService {
    constructor(options = {}) {
        this.config = {
            // Differential Privacy parameters
            epsilon: parseFloat(options.epsilon) || 1.0, // Privacy budget
            delta: parseFloat(options.delta) || 1e-5, // Failure probability
            sensitivity: parseFloat(options.sensitivity) || 1.0, // Global sensitivity
            
            // K-Anonymity parameters
            kValue: parseInt(options.kValue) || 5, // Minimum group size
            
            // Data minimization
            defaultAnonymizationLevel: options.defaultAnonymizationLevel || 'partial',
            
            // PII fields that need special handling
            piiFields: options.piiFields || [
                'email', 'phone', 'address', 'ssn', 'face_embedding',
                'device_id', 'card_number', 'full_name', 'date_of_birth'
            ],
            
            // Quasi-identifiers for k-anonymity
            quasiIdentifiers: options.quasiIdentifiers || [
                'age_group', 'department', 'role', 'building_access'
            ]
        };

        // Cache for anonymized data
        this.anonymizationCache = new Map();
        
        // Statistics for privacy metrics
        this.privacyMetrics = {
            totalQueries: 0,
            anonymizedQueries: 0,
            differentialPrivacyQueries: 0,
            kAnonymityViolations: 0,
            piiRedactions: 0
        };

        logger.info('Privacy service initialized', {
            epsilon: this.config.epsilon,
            kValue: this.config.kValue,
            piiFields: this.config.piiFields.length
        });
    }

    /**
     * Apply differential privacy to numerical data
     */
    applyDifferentialPrivacy(value, queryType = 'count') {
        try {
            let sensitivity = this.config.sensitivity;
            
            // Adjust sensitivity based on query type
            switch (queryType) {
                case 'count':
                    sensitivity = 1;
                    break;
                case 'sum':
                    sensitivity = this.config.sensitivity;
                    break;
                case 'average':
                    sensitivity = this.config.sensitivity / this.config.kValue;
                    break;
                case 'max':
                case 'min':
                    sensitivity = this.config.sensitivity;
                    break;
            }

            // Generate Laplace noise
            const noise = this.generateLaplaceNoise(sensitivity / this.config.epsilon);
            const noisyValue = value + noise;

            this.privacyMetrics.differentialPrivacyQueries++;
            
            logger.debug('Applied differential privacy', {
                originalValue: value,
                noise: noise,
                noisyValue: noisyValue,
                queryType: queryType,
                epsilon: this.config.epsilon
            });

            return Math.max(0, Math.round(noisyValue)); // Ensure non-negative integers
            
        } catch (error) {
            logger.error('Error applying differential privacy:', error);
            return value; // Return original value on error
        }
    }

    /**
     * Generate Laplace noise for differential privacy
     */
    generateLaplaceNoise(scale) {
        // Generate uniform random number in (-0.5, 0.5)
        const u = Math.random() - 0.5;
        
        // Apply inverse CDF of Laplace distribution
        const noise = -scale * Math.sign(u) * Math.log(1 - 2 * Math.abs(u));
        
        return noise;
    }

    /**
     * Apply k-anonymity to dataset
     */
    applyKAnonymity(dataset, quasiIdentifiers = null) {
        try {
            const qids = quasiIdentifiers || this.config.quasiIdentifiers;
            
            if (!Array.isArray(dataset) || dataset.length === 0) {
                return dataset;
            }

            // Group records by quasi-identifier combinations
            const groups = this.groupByQuasiIdentifiers(dataset, qids);
            
            // Filter out groups smaller than k
            const anonymizedDataset = [];
            let violationCount = 0;

            for (const [groupKey, records] of groups.entries()) {
                if (records.length >= this.config.kValue) {
                    // Group satisfies k-anonymity
                    anonymizedDataset.push(...records);
                } else {
                    // Group violates k-anonymity - suppress or generalize
                    violationCount++;
                    const generalizedRecords = this.generalizeGroup(records, qids);
                    anonymizedDataset.push(...generalizedRecords);
                }
            }

            this.privacyMetrics.kAnonymityViolations += violationCount;

            logger.debug('Applied k-anonymity', {
                originalSize: dataset.length,
                anonymizedSize: anonymizedDataset.length,
                groups: groups.size,
                violations: violationCount,
                kValue: this.config.kValue
            });

            return anonymizedDataset;

        } catch (error) {
            logger.error('Error applying k-anonymity:', error);
            return dataset;
        }
    }

    /**
     * Group records by quasi-identifier combinations
     */
    groupByQuasiIdentifiers(dataset, quasiIdentifiers) {
        const groups = new Map();

        for (const record of dataset) {
            // Create key from quasi-identifier values
            const key = quasiIdentifiers
                .map(qid => this.getNestedValue(record, qid))
                .join('|');

            if (!groups.has(key)) {
                groups.set(key, []);
            }
            groups.get(key).push(record);
        }

        return groups;
    }

    /**
     * Generalize group that violates k-anonymity
     */
    generalizeGroup(records, quasiIdentifiers) {
        return records.map(record => {
            const generalizedRecord = { ...record };
            
            // Generalize quasi-identifiers
            for (const qid of quasiIdentifiers) {
                const value = this.getNestedValue(record, qid);
                const generalizedValue = this.generalizeValue(value, qid);
                this.setNestedValue(generalizedRecord, qid, generalizedValue);
            }
            
            return generalizedRecord;
        });
    }

    /**
     * Generalize a single value
     */
    generalizeValue(value, fieldName) {
        if (value === null || value === undefined) {
            return value;
        }

        switch (fieldName) {
            case 'age_group':
                // Generalize age groups to broader ranges
                if (typeof value === 'string') {
                    if (value.includes('18-25') || value.includes('26-35')) {
                        return '18-35';
                    } else if (value.includes('36-45') || value.includes('46-55')) {
                        return '36-55';
                    } else {
                        return '55+';
                    }
                }
                return 'Unknown';
                
            case 'department':
                // Generalize to broader categories
                const deptCategories = {
                    'Computer Science': 'Engineering',
                    'Electrical Engineering': 'Engineering',
                    'Mechanical Engineering': 'Engineering',
                    'Mathematics': 'Sciences',
                    'Physics': 'Sciences',
                    'Chemistry': 'Sciences',
                    'English': 'Liberal Arts',
                    'History': 'Liberal Arts',
                    'Psychology': 'Liberal Arts'
                };
                return deptCategories[value] || 'Other';
                
            case 'role':
                // Generalize roles
                const roleCategories = {
                    'Professor': 'Faculty',
                    'Associate Professor': 'Faculty',
                    'Assistant Professor': 'Faculty',
                    'Graduate Student': 'Student',
                    'Undergraduate Student': 'Student',
                    'Research Assistant': 'Staff',
                    'Administrative Assistant': 'Staff'
                };
                return roleCategories[value] || 'Other';
                
            case 'building_access':
                // Generalize building access to zones
                if (Array.isArray(value)) {
                    const zones = value.map(building => {
                        if (['Library', 'Student Center'].includes(building)) {
                            return 'Public';
                        } else if (['Lab Building', 'Research Center'].includes(building)) {
                            return 'Research';
                        } else {
                            return 'Academic';
                        }
                    });
                    return [...new Set(zones)]; // Remove duplicates
                }
                return value;
                
            default:
                return '*'; // Suppress unknown fields
        }
    }

    /**
     * Apply data minimization and PII redaction
     */
    applyDataMinimization(data, anonymizationLevel = null, userRole = 'VIEWER') {
        try {
            const level = anonymizationLevel || this.config.defaultAnonymizationLevel;
            
            if (Array.isArray(data)) {
                return data.map(item => this.anonymizeRecord(item, level, userRole));
            } else if (typeof data === 'object' && data !== null) {
                return this.anonymizeRecord(data, level, userRole);
            }
            
            return data;

        } catch (error) {
            logger.error('Error applying data minimization:', error);
            return data;
        }
    }

    /**
     * Anonymize a single record
     */
    anonymizeRecord(record, level, userRole) {
        const anonymized = { ...record };
        
        // Create cache key
        const cacheKey = `${JSON.stringify(record)}_${level}_${userRole}`;
        
        // Check cache first
        if (this.anonymizationCache.has(cacheKey)) {
            return this.anonymizationCache.get(cacheKey);
        }

        // Apply anonymization based on level and user role
        for (const field of this.config.piiFields) {
            if (this.hasNestedField(record, field)) {
                const anonymizedValue = this.anonymizeField(
                    this.getNestedValue(record, field),
                    field,
                    level,
                    userRole
                );
                this.setNestedValue(anonymized, field, anonymizedValue);
                this.privacyMetrics.piiRedactions++;
            }
        }

        // Apply role-based field filtering
        this.applyRoleBasedFiltering(anonymized, userRole);

        // Cache the result
        this.anonymizationCache.set(cacheKey, anonymized);
        
        // Limit cache size
        if (this.anonymizationCache.size > 10000) {
            const firstKey = this.anonymizationCache.keys().next().value;
            this.anonymizationCache.delete(firstKey);
        }

        return anonymized;
    }

    /**
     * Anonymize a specific field
     */
    anonymizeField(value, fieldName, level, userRole) {
        if (value === null || value === undefined) {
            return value;
        }

        // Admin users see more data
        if (userRole === 'ADMIN') {
            if (level === 'none') {
                return value;
            }
        }

        switch (fieldName) {
            case 'email':
                return this.anonymizeEmail(value, level);
                
            case 'phone':
                return this.anonymizePhone(value, level);
                
            case 'address':
                return this.anonymizeAddress(value, level);
                
            case 'full_name':
                return this.anonymizeName(value, level);
                
            case 'ssn':
                return level === 'none' ? value : '***-**-****';
                
            case 'face_embedding':
                return level === 'none' ? value : null;
                
            case 'device_id':
                return this.anonymizeDeviceId(value, level);
                
            case 'card_number':
                return this.anonymizeCardNumber(value, level);
                
            case 'date_of_birth':
                return this.anonymizeDateOfBirth(value, level);
                
            default:
                return level === 'full' ? '[REDACTED]' : value;
        }
    }

    /**
     * Anonymize email address
     */
    anonymizeEmail(email, level) {
        if (typeof email !== 'string') return email;
        
        switch (level) {
            case 'none':
                return email;
            case 'partial':
                const [username, domain] = email.split('@');
                if (username.length <= 2) {
                    return `${username[0]}*@${domain}`;
                }
                return `${username.substring(0, 2)}***@${domain}`;
            case 'full':
                return '[EMAIL_REDACTED]';
            default:
                return email;
        }
    }

    /**
     * Anonymize phone number
     */
    anonymizePhone(phone, level) {
        if (typeof phone !== 'string') return phone;
        
        switch (level) {
            case 'none':
                return phone;
            case 'partial':
                return phone.replace(/\d(?=\d{4})/g, '*');
            case 'full':
                return '[PHONE_REDACTED]';
            default:
                return phone;
        }
    }

    /**
     * Anonymize address
     */
    anonymizeAddress(address, level) {
        if (typeof address !== 'string') return address;
        
        switch (level) {
            case 'none':
                return address;
            case 'partial':
                // Keep only city and state
                const parts = address.split(',');
                if (parts.length >= 2) {
                    return `[STREET_REDACTED], ${parts.slice(-2).join(',')}`;
                }
                return '[ADDRESS_REDACTED]';
            case 'full':
                return '[ADDRESS_REDACTED]';
            default:
                return address;
        }
    }

    /**
     * Anonymize name
     */
    anonymizeName(name, level) {
        if (typeof name !== 'string') return name;
        
        switch (level) {
            case 'none':
                return name;
            case 'partial':
                const parts = name.split(' ');
                if (parts.length === 1) {
                    return `${parts[0][0]}***`;
                }
                return `${parts[0]} ${parts[parts.length - 1][0]}***`;
            case 'full':
                return '[NAME_REDACTED]';
            default:
                return name;
        }
    }

    /**
     * Anonymize device ID
     */
    anonymizeDeviceId(deviceId, level) {
        if (typeof deviceId !== 'string') return deviceId;
        
        switch (level) {
            case 'none':
                return deviceId;
            case 'partial':
                return deviceId.length > 8 
                    ? `${deviceId.substring(0, 4)}****${deviceId.substring(deviceId.length - 4)}`
                    : '****';
            case 'full':
                return '[DEVICE_REDACTED]';
            default:
                return deviceId;
        }
    }

    /**
     * Anonymize card number
     */
    anonymizeCardNumber(cardNumber, level) {
        if (typeof cardNumber !== 'string') return cardNumber;
        
        switch (level) {
            case 'none':
                return cardNumber;
            case 'partial':
                return cardNumber.length > 4 
                    ? `****${cardNumber.substring(cardNumber.length - 4)}`
                    : '****';
            case 'full':
                return '[CARD_REDACTED]';
            default:
                return cardNumber;
        }
    }

    /**
     * Anonymize date of birth
     */
    anonymizeDateOfBirth(dob, level) {
        if (!dob) return dob;
        
        switch (level) {
            case 'none':
                return dob;
            case 'partial':
                // Return only year
                const date = new Date(dob);
                return date.getFullYear().toString();
            case 'full':
                return '[DOB_REDACTED]';
            default:
                return dob;
        }
    }

    /**
     * Apply role-based field filtering
     */
    applyRoleBasedFiltering(record, userRole) {
        const restrictedFields = {
            'VIEWER': [
                'face_embedding', 'ssn', 'full_address', 'personal_phone',
                'emergency_contact', 'medical_info', 'financial_info'
            ],
            'OPERATOR': [
                'ssn', 'medical_info', 'financial_info'
            ],
            'SECURITY_OFFICER': [
                'medical_info', 'financial_info'
            ],
            'ADMIN': [] // Admin can see all fields
        };

        const fieldsToRemove = restrictedFields[userRole] || restrictedFields['VIEWER'];
        
        for (const field of fieldsToRemove) {
            if (this.hasNestedField(record, field)) {
                this.setNestedValue(record, field, '[RESTRICTED]');
            }
        }
    }

    /**
     * Generate anonymized ID for export
     */
    generateAnonymizedId(originalId, salt = null) {
        const saltValue = salt || this.config.epsilon.toString();
        const hash = crypto.createHash('sha256');
        hash.update(originalId + saltValue);
        return hash.digest('hex').substring(0, 16);
    }

    /**
     * Check if dataset satisfies k-anonymity
     */
    checkKAnonymity(dataset, quasiIdentifiers = null) {
        try {
            const qids = quasiIdentifiers || this.config.quasiIdentifiers;
            const groups = this.groupByQuasiIdentifiers(dataset, qids);
            
            let violations = 0;
            let minGroupSize = Infinity;
            let maxGroupSize = 0;
            
            for (const records of groups.values()) {
                const groupSize = records.length;
                minGroupSize = Math.min(minGroupSize, groupSize);
                maxGroupSize = Math.max(maxGroupSize, groupSize);
                
                if (groupSize < this.config.kValue) {
                    violations++;
                }
            }

            return {
                satisfiesKAnonymity: violations === 0,
                violations: violations,
                totalGroups: groups.size,
                minGroupSize: minGroupSize === Infinity ? 0 : minGroupSize,
                maxGroupSize: maxGroupSize,
                kValue: this.config.kValue
            };

        } catch (error) {
            logger.error('Error checking k-anonymity:', error);
            return {
                satisfiesKAnonymity: false,
                error: error.message
            };
        }
    }

    /**
     * Get privacy metrics
     */
    getPrivacyMetrics() {
        return {
            ...this.privacyMetrics,
            config: {
                epsilon: this.config.epsilon,
                delta: this.config.delta,
                kValue: this.config.kValue,
                piiFieldsCount: this.config.piiFields.length
            },
            cacheSize: this.anonymizationCache.size,
            timestamp: new Date()
        };
    }

    /**
     * Clear anonymization cache
     */
    clearCache() {
        this.anonymizationCache.clear();
        logger.info('Anonymization cache cleared');
    }

    /**
     * Update privacy configuration
     */
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        this.clearCache(); // Clear cache when config changes
        
        logger.info('Privacy configuration updated', newConfig);
    }

    // Utility methods for nested object access
    getNestedValue(obj, path) {
        return path.split('.').reduce((current, key) => current?.[key], obj);
    }

    setNestedValue(obj, path, value) {
        const keys = path.split('.');
        const lastKey = keys.pop();
        const target = keys.reduce((current, key) => {
            if (!current[key]) current[key] = {};
            return current[key];
        }, obj);
        target[lastKey] = value;
    }

    hasNestedField(obj, path) {
        return this.getNestedValue(obj, path) !== undefined;
    }
}

module.exports = PrivacyService;