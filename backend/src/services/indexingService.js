const winston = require('winston');
const Entity = require('../models/Entity');
const natural = require('natural');

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
        new winston.transports.File({ filename: 'logs/indexing.log' })
    ]
});

/**
 * Indexing Service for Entity Resolution
 * Manages efficient indexing and retrieval of entity records for blocking and similarity computation
 */
class IndexingService {
    constructor(cacheService = null) {
        this.cache = cacheService;
        this.indexes = {
            phonetic: new Map(),
            email: new Map(),
            phone: new Map(),
            cardId: new Map(),
            deviceHash: new Map(),
            name: new Map(),
            department: new Map(),
            studentId: new Map(),
            employeeId: new Map(),
            faceEmbedding: new Map()
        };
        
        // Performance metrics
        this.metrics = {
            indexSize: 0,
            lookupCount: 0,
            hitRate: 0,
            avgLookupTime: 0,
            lastUpdated: null
        };
        
        // Initialize phonetic algorithms
        this.soundex = natural.SoundEx;
        this.metaphone = natural.Metaphone;
        this.doubleMetaphone = natural.DoubleMetaphone;
    }

    /**
     * Build indexes from existing entities
     */
    async buildIndexes() {
        const startTime = Date.now();
        logger.info('Starting index build process...');
        
        try {
            // Clear existing indexes
            this.clearIndexes();
            
            // Get all entities from database
            const entities = await Entity.find({}).lean();
            logger.info(`Found ${entities.length} entities to index`);
            
            // Build indexes for each entity
            for (const entity of entities) {
                await this.indexEntity(entity);
            }
            
            this.metrics.indexSize = entities.length;
            this.metrics.lastUpdated = new Date();
            
            const buildTime = Date.now() - startTime;
            logger.info(`Index build completed in ${buildTime}ms. Indexed ${entities.length} entities`);
            
            return {
                success: true,
                entitiesIndexed: entities.length,
                buildTime: buildTime,
                indexSizes: this.getIndexSizes()
            };
            
        } catch (error) {
            logger.error('Index build failed:', error);
            throw error;
        }
    }

    /**
     * Index a single entity
     */
    async indexEntity(entity) {
        try {
            const entityId = entity._id;
            
            // Index by phonetic keys (for name blocking)
            if (entity.profile?.name) {
                const nameTokens = entity.profile.name.toLowerCase().split(' ');
                for (const token of nameTokens) {
                    if (token.length > 1) {
                        // Soundex
                        const soundexKey = this.soundex.process(token);
                        this.addToIndex('phonetic', `soundex_${soundexKey}`, entityId);
                        
                        // Metaphone
                        const metaphoneKey = this.metaphone.process(token);
                        this.addToIndex('phonetic', `metaphone_${metaphoneKey}`, entityId);
                        
                        // Double Metaphone
                        const doubleMetaphoneKeys = this.doubleMetaphone.process(token);
                        for (const key of doubleMetaphoneKeys) {
                            if (key) {
                                this.addToIndex('phonetic', `dmetaphone_${key}`, entityId);
                            }
                        }
                    }
                }
                
                // Index full name
                this.addToIndex('name', entity.profile.name.toLowerCase(), entityId);
            }
            
            // Index by email prefix
            if (entity.identifiers?.email) {
                const email = entity.identifiers.email;
                if (typeof email === 'string') {
                    const emailPrefix = email.split('@')[0].toLowerCase();
                    this.addToIndex('email', emailPrefix, entityId);
                    this.addToIndex('email', emailPrefix.substring(0, 3), entityId); // First 3 chars
                }
            }
            
            // Index by phone suffix
            if (entity.identifiers?.phone) {
                const phone = entity.identifiers.phone;
                if (typeof phone === 'string') {
                    const phoneDigits = phone.replace(/\D/g, '');
                    if (phoneDigits.length >= 4) {
                        this.addToIndex('phone', phoneDigits.slice(-4), entityId); // Last 4 digits
                    }
                }
            }
            
            // Index by card ID
            if (entity.identifiers?.card_id) {
                this.addToIndex('cardId', entity.identifiers.card_id, entityId);
            }
            
            // Index by device hashes
            if (entity.identifiers?.device_hashes) {
                for (const deviceHash of entity.identifiers.device_hashes) {
                    this.addToIndex('deviceHash', deviceHash, entityId);
                }
            }
            
            // Index by student ID
            if (entity.identifiers?.student_id) {
                this.addToIndex('studentId', entity.identifiers.student_id, entityId);
                // Index by ID prefix (first 4 characters)
                if (entity.identifiers.student_id.length >= 4) {
                    this.addToIndex('studentId', entity.identifiers.student_id.substring(0, 4), entityId);
                }
            }
            
            // Index by employee ID
            if (entity.identifiers?.employee_id) {
                this.addToIndex('employeeId', entity.identifiers.employee_id, entityId);
            }
            
            // Index by department
            if (entity.profile?.department) {
                this.addToIndex('department', entity.profile.department.toLowerCase(), entityId);
            }
            
            // Index face embeddings (simplified - in production would use vector similarity)
            if (entity.identifiers?.face_embedding) {
                // Create a hash of the embedding for exact matches
                const embeddingHash = this.hashFaceEmbedding(entity.identifiers.face_embedding);
                this.addToIndex('faceEmbedding', embeddingHash, entityId);
            }
            
        } catch (error) {
            logger.error(`Error indexing entity ${entity._id}:`, error);
        }
    }

    /**
     * Add entity to index
     */
    addToIndex(indexType, key, entityId) {
        if (!this.indexes[indexType]) {
            this.indexes[indexType] = new Map();
        }
        
        if (!this.indexes[indexType].has(key)) {
            this.indexes[indexType].set(key, new Set());
        }
        
        this.indexes[indexType].get(key).add(entityId);
    }

    /**
     * Get candidate entities for blocking
     */
    async getCandidates(entity, blockingStrategy = 'multi_pass') {
        const startTime = Date.now();
        const candidates = new Set();
        
        try {
            switch (blockingStrategy) {
                case 'phonetic':
                    await this.getPhoneticCandidates(entity, candidates);
                    break;
                case 'identifier':
                    await this.getIdentifierCandidates(entity, candidates);
                    break;
                case 'multi_pass':
                default:
                    await this.getPhoneticCandidates(entity, candidates);
                    await this.getIdentifierCandidates(entity, candidates);
                    await this.getDepartmentCandidates(entity, candidates);
                    break;
            }
            
            // Update metrics
            this.metrics.lookupCount++;
            const lookupTime = Date.now() - startTime;
            this.metrics.avgLookupTime = (this.metrics.avgLookupTime + lookupTime) / 2;
            
            const candidateArray = Array.from(candidates);
            logger.debug(`Found ${candidateArray.length} candidates for entity using ${blockingStrategy} strategy`);
            
            return candidateArray;
            
        } catch (error) {
            logger.error('Error getting candidates:', error);
            return [];
        }
    }

    /**
     * Get candidates using phonetic blocking
     */
    async getPhoneticCandidates(entity, candidates) {
        if (!entity.profile?.name) return;
        
        const nameTokens = entity.profile.name.toLowerCase().split(' ');
        
        for (const token of nameTokens) {
            if (token.length > 1) {
                // Soundex candidates
                const soundexKey = this.soundex.process(token);
                const soundexCandidates = this.indexes.phonetic.get(`soundex_${soundexKey}`);
                if (soundexCandidates) {
                    soundexCandidates.forEach(id => candidates.add(id));
                }
                
                // Metaphone candidates
                const metaphoneKey = this.metaphone.process(token);
                const metaphoneCandidates = this.indexes.phonetic.get(`metaphone_${metaphoneKey}`);
                if (metaphoneCandidates) {
                    metaphoneCandidates.forEach(id => candidates.add(id));
                }
                
                // Double Metaphone candidates
                const doubleMetaphoneKeys = this.doubleMetaphone.process(token);
                for (const key of doubleMetaphoneKeys) {
                    if (key) {
                        const dMetaphoneCandidates = this.indexes.phonetic.get(`dmetaphone_${key}`);
                        if (dMetaphoneCandidates) {
                            dMetaphoneCandidates.forEach(id => candidates.add(id));
                        }
                    }
                }
            }
        }
    }

    /**
     * Get candidates using identifier blocking
     */
    async getIdentifierCandidates(entity, candidates) {
        // Email prefix candidates
        if (entity.identifiers?.email && typeof entity.identifiers.email === 'string') {
            const emailPrefix = entity.identifiers.email.split('@')[0].toLowerCase();
            const emailCandidates = this.indexes.email.get(emailPrefix);
            if (emailCandidates) {
                emailCandidates.forEach(id => candidates.add(id));
            }
            
            // First 3 characters of email
            const emailPrefix3 = emailPrefix.substring(0, 3);
            const emailPrefix3Candidates = this.indexes.email.get(emailPrefix3);
            if (emailPrefix3Candidates) {
                emailPrefix3Candidates.forEach(id => candidates.add(id));
            }
        }
        
        // Phone suffix candidates
        if (entity.identifiers?.phone && typeof entity.identifiers.phone === 'string') {
            const phoneDigits = entity.identifiers.phone.replace(/\D/g, '');
            if (phoneDigits.length >= 4) {
                const phoneSuffix = phoneDigits.slice(-4);
                const phoneCandidates = this.indexes.phone.get(phoneSuffix);
                if (phoneCandidates) {
                    phoneCandidates.forEach(id => candidates.add(id));
                }
            }
        }
        
        // Card ID candidates
        if (entity.identifiers?.card_id) {
            const cardCandidates = this.indexes.cardId.get(entity.identifiers.card_id);
            if (cardCandidates) {
                cardCandidates.forEach(id => candidates.add(id));
            }
        }
        
        // Device hash candidates
        if (entity.identifiers?.device_hashes) {
            for (const deviceHash of entity.identifiers.device_hashes) {
                const deviceCandidates = this.indexes.deviceHash.get(deviceHash);
                if (deviceCandidates) {
                    deviceCandidates.forEach(id => candidates.add(id));
                }
            }
        }
        
        // Student ID candidates
        if (entity.identifiers?.student_id) {
            const studentCandidates = this.indexes.studentId.get(entity.identifiers.student_id);
            if (studentCandidates) {
                studentCandidates.forEach(id => candidates.add(id));
            }
            
            // ID prefix candidates
            if (entity.identifiers.student_id.length >= 4) {
                const idPrefix = entity.identifiers.student_id.substring(0, 4);
                const prefixCandidates = this.indexes.studentId.get(idPrefix);
                if (prefixCandidates) {
                    prefixCandidates.forEach(id => candidates.add(id));
                }
            }
        }
        
        // Employee ID candidates
        if (entity.identifiers?.employee_id) {
            const employeeCandidates = this.indexes.employeeId.get(entity.identifiers.employee_id);
            if (employeeCandidates) {
                employeeCandidates.forEach(id => candidates.add(id));
            }
        }
    }

    /**
     * Get candidates using department blocking
     */
    async getDepartmentCandidates(entity, candidates) {
        if (!entity.profile?.department) return;
        
        const department = entity.profile.department.toLowerCase();
        const deptCandidates = this.indexes.department.get(department);
        if (deptCandidates) {
            deptCandidates.forEach(id => candidates.add(id));
        }
    }

    /**
     * Remove entity from indexes
     */
    async removeEntity(entityId) {
        try {
            for (const [indexType, index] of Object.entries(this.indexes)) {
                for (const [key, entitySet] of index.entries()) {
                    if (entitySet.has(entityId)) {
                        entitySet.delete(entityId);
                        // Remove empty keys
                        if (entitySet.size === 0) {
                            index.delete(key);
                        }
                    }
                }
            }
            
            logger.debug(`Removed entity ${entityId} from all indexes`);
            
        } catch (error) {
            logger.error(`Error removing entity ${entityId} from indexes:`, error);
        }
    }

    /**
     * Update entity in indexes
     */
    async updateEntity(entity) {
        try {
            // Remove old version
            await this.removeEntity(entity._id);
            
            // Add updated version
            await this.indexEntity(entity);
            
            logger.debug(`Updated entity ${entity._id} in indexes`);
            
        } catch (error) {
            logger.error(`Error updating entity ${entity._id} in indexes:`, error);
        }
    }

    /**
     * Clear all indexes
     */
    clearIndexes() {
        for (const index of Object.values(this.indexes)) {
            index.clear();
        }
        
        this.metrics.indexSize = 0;
        logger.info('All indexes cleared');
    }

    /**
     * Get index statistics
     */
    getIndexSizes() {
        const sizes = {};
        for (const [indexType, index] of Object.entries(this.indexes)) {
            sizes[indexType] = {
                keys: index.size,
                entities: Array.from(index.values()).reduce((total, set) => total + set.size, 0)
            };
        }
        return sizes;
    }

    /**
     * Get performance metrics
     */
    getMetrics() {
        return {
            ...this.metrics,
            indexSizes: this.getIndexSizes()
        };
    }

    /**
     * Hash face embedding for indexing
     */
    hashFaceEmbedding(embedding) {
        if (!Array.isArray(embedding)) return null;
        
        // Simple hash - in production would use locality-sensitive hashing
        const rounded = embedding.map(val => Math.round(val * 1000) / 1000);
        return Buffer.from(JSON.stringify(rounded)).toString('base64').substring(0, 16);
    }

    /**
     * Rebuild indexes incrementally
     */
    async incrementalRebuild(batchSize = 1000) {
        logger.info('Starting incremental index rebuild...');
        
        try {
            let skip = 0;
            let processed = 0;
            
            while (true) {
                const entities = await Entity.find({})
                    .skip(skip)
                    .limit(batchSize)
                    .lean();
                
                if (entities.length === 0) break;
                
                for (const entity of entities) {
                    await this.indexEntity(entity);
                    processed++;
                }
                
                skip += batchSize;
                logger.info(`Processed ${processed} entities...`);
            }
            
            this.metrics.indexSize = processed;
            this.metrics.lastUpdated = new Date();
            
            logger.info(`Incremental rebuild completed. Processed ${processed} entities`);
            
            return { success: true, entitiesProcessed: processed };
            
        } catch (error) {
            logger.error('Incremental rebuild failed:', error);
            throw error;
        }
    }

    /**
     * Optimize indexes by removing empty keys and compacting
     */
    optimizeIndexes() {
        let removedKeys = 0;
        
        for (const [indexType, index] of Object.entries(this.indexes)) {
            const keysToRemove = [];
            
            for (const [key, entitySet] of index.entries()) {
                if (entitySet.size === 0) {
                    keysToRemove.push(key);
                }
            }
            
            for (const key of keysToRemove) {
                index.delete(key);
                removedKeys++;
            }
        }
        
        logger.info(`Index optimization completed. Removed ${removedKeys} empty keys`);
        return { removedKeys };
    }
}

module.exports = IndexingService;
      