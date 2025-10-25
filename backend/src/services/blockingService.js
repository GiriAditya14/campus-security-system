const natural = require('natural');
const winston = require('winston');

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
        new winston.transports.File({ filename: 'logs/blocking.log' })
    ]
});

/**
 * Blocking Service for Entity Resolution
 * Implements multi-pass blocking with phonetic keys to reduce O(n²) complexity to O(n log n)
 */
class BlockingService {
    constructor() {
        this.blockingStrategies = {
            phonetic: this.phoneticBlocking.bind(this),
            email_prefix: this.emailPrefixBlocking.bind(this),
            id_prefix: this.idPrefixBlocking.bind(this),
            phone_suffix: this.phoneSuffixBlocking.bind(this),
            name_tokens: this.nameTokenBlocking.bind(this),
            department: this.departmentBlocking.bind(this),
            card_prefix: this.cardPrefixBlocking.bind(this)
        };
        
        this.blockingThreshold = parseFloat(process.env.BLOCKING_THRESHOLD) || 0.6;
        this.maxBlockSize = parseInt(process.env.MAX_BLOCK_SIZE) || 1000;
        
        // Performance metrics
        this.metrics = {
            totalRecords: 0,
            totalBlocks: 0,
            averageBlockSize: 0,
            reductionRatio: 0,
            processingTime: 0
        };
    }

    /**
     * Main blocking function - applies multiple blocking strategies
     * @param {Array} records - Array of entity records
     * @param {Array} strategies - Blocking strategies to apply
     * @returns {Object} Blocking results with candidate pairs
     */
    async performBlocking(records, strategies = ['phonetic', 'email_prefix', 'id_prefix']) {
        const startTime = Date.now();
        
        try {
            logger.info(`Starting blocking process for ${records.length} records`);
            
            // Initialize blocking index
            const blockingIndex = new Map();
            const candidatePairs = new Set();
            
            // Apply each blocking strategy
            for (const strategy of strategies) {
                if (!this.blockingStrategies[strategy]) {
                    logger.warn(`Unknown blocking strategy: ${strategy}`);
                    continue;
                }
                
                logger.debug(`Applying blocking strategy: ${strategy}`);
                const strategyBlocks = await this.blockingStrategies[strategy](records);
                
                // Merge blocks into main index
                this.mergeBlocks(blockingIndex, strategyBlocks, strategy);
            }
            
            // Generate candidate pairs from blocks
            const pairs = this.generateCandidatePairs(blockingIndex);
            
            // Calculate metrics
            const processingTime = Date.now() - startTime;
            this.updateMetrics(records.length, blockingIndex.size, pairs.size, processingTime);
            
            logger.info(`Blocking completed: ${pairs.size} candidate pairs from ${records.length} records`);
            
            return {
                candidatePairs: Array.from(pairs),
                blockingIndex: blockingIndex,
                metrics: this.metrics,
                processingTime
            };
            
        } catch (error) {
            logger.error('Blocking process failed:', error);
            throw error;
        }
    }

    /**
     * Phonetic blocking using Soundex and Metaphone algorithms
     */
    async phoneticBlocking(records) {
        const blocks = new Map();
        
        for (const record of records) {
            if (!record.profile?.name) continue;
            
            const name = record.profile.name.toLowerCase().trim();
            const nameParts = name.split(/\s+/);
            
            // Generate phonetic keys for each name part
            for (const part of nameParts) {
                if (part.length < 2) continue;
                
                // Soundex key
                const soundexKey = `soundex_${natural.SoundEx.process(part)}`;
                this.addToBlock(blocks, soundexKey, record);
                
                // Metaphone key
                const metaphoneKey = `metaphone_${natural.Metaphone.process(part)}`;
                this.addToBlock(blocks, metaphoneKey, record);
                
                // Double Metaphone for better accuracy
                const doubleMetaphone = natural.DoubleMetaphone.process(part);
                if (doubleMetaphone[0]) {
                    this.addToBlock(blocks, `dmetaphone1_${doubleMetaphone[0]}`, record);
                }
                if (doubleMetaphone[1]) {
                    this.addToBlock(blocks, `dmetaphone2_${doubleMetaphone[1]}`, record);
                }
            }
        }
        
        return blocks;
    }

    /**
     * Email prefix blocking
     */
    async emailPrefixBlocking(records) {
        const blocks = new Map();
        
        for (const record of records) {
            const email = record.identifiers?.email;
            if (!email || typeof email !== 'string') continue;
            
            // Extract email prefix (before @)
            const emailPrefix = email.split('@')[0].toLowerCase();
            
            // Create blocks for different prefix lengths
            if (emailPrefix.length >= 3) {
                const key3 = `email_prefix_3_${emailPrefix.substring(0, 3)}`;
                this.addToBlock(blocks, key3, record);
            }
            
            if (emailPrefix.length >= 4) {
                const key4 = `email_prefix_4_${emailPrefix.substring(0, 4)}`;
                this.addToBlock(blocks, key4, record);
            }
            
            if (emailPrefix.length >= 5) {
                const key5 = `email_prefix_5_${emailPrefix.substring(0, 5)}`;
                this.addToBlock(blocks, key5, record);
            }
        }
        
        return blocks;
    }

    /**
     * ID prefix blocking (student_id, employee_id)
     */
    async idPrefixBlocking(records) {
        const blocks = new Map();
        
        for (const record of records) {
            const studentId = record.identifiers?.student_id;
            const employeeId = record.identifiers?.employee_id;
            
            // Student ID blocking
            if (studentId && studentId.length >= 4) {
                const prefix = studentId.substring(0, 4);
                this.addToBlock(blocks, `student_id_prefix_${prefix}`, record);
            }
            
            // Employee ID blocking
            if (employeeId && employeeId.length >= 3) {
                const prefix = employeeId.substring(0, 3);
                this.addToBlock(blocks, `employee_id_prefix_${prefix}`, record);
            }
        }
        
        return blocks;
    }

    /**
     * Phone suffix blocking
     */
    async phoneSuffixBlocking(records) {
        const blocks = new Map();
        
        for (const record of records) {
            const phone = record.identifiers?.phone;
            if (!phone || typeof phone !== 'string') continue;
            
            // Extract digits only
            const digits = phone.replace(/\D/g, '');
            
            if (digits.length >= 4) {
                const suffix4 = digits.slice(-4);
                this.addToBlock(blocks, `phone_suffix_4_${suffix4}`, record);
            }
            
            if (digits.length >= 6) {
                const suffix6 = digits.slice(-6);
                this.addToBlock(blocks, `phone_suffix_6_${suffix6}`, record);
            }
        }
        
        return blocks;
    }

    /**
     * Name token blocking
     */
    async nameTokenBlocking(records) {
        const blocks = new Map();
        
        for (const record of records) {
            if (!record.profile?.name) continue;
            
            const name = record.profile.name.toLowerCase().trim();
            const tokens = name.split(/\s+/).filter(token => token.length >= 2);
            
            // Create blocks for each token
            for (const token of tokens) {
                this.addToBlock(blocks, `name_token_${token}`, record);
                
                // Also create blocks for token prefixes
                if (token.length >= 3) {
                    this.addToBlock(blocks, `name_token_prefix_${token.substring(0, 3)}`, record);
                }
            }
            
            // Create blocks for first and last name combinations
            if (tokens.length >= 2) {
                const firstLast = `${tokens[0]}_${tokens[tokens.length - 1]}`;
                this.addToBlock(blocks, `name_first_last_${firstLast}`, record);
            }
        }
        
        return blocks;
    }

    /**
     * Department blocking
     */
    async departmentBlocking(records) {
        const blocks = new Map();
        
        for (const record of records) {
            const department = record.profile?.department;
            if (!department) continue;
            
            const deptKey = department.toLowerCase().replace(/\s+/g, '_');
            this.addToBlock(blocks, `department_${deptKey}`, record);
        }
        
        return blocks;
    }

    /**
     * Card ID prefix blocking
     */
    async cardPrefixBlocking(records) {
        const blocks = new Map();
        
        for (const record of records) {
            const cardId = record.identifiers?.card_id;
            if (!cardId) continue;
            
            if (cardId.length >= 2) {
                const prefix2 = cardId.substring(0, 2);
                this.addToBlock(blocks, `card_prefix_2_${prefix2}`, record);
            }
            
            if (cardId.length >= 3) {
                const prefix3 = cardId.substring(0, 3);
                this.addToBlock(blocks, `card_prefix_3_${prefix3}`, record);
            }
        }
        
        return blocks;
    }

    /**
     * Add record to a block
     */
    addToBlock(blocks, key, record) {
        if (!blocks.has(key)) {
            blocks.set(key, []);
        }
        
        const block = blocks.get(key);
        
        // Prevent blocks from becoming too large
        if (block.length < this.maxBlockSize) {
            block.push(record);
        }
    }

    /**
     * Merge blocks from different strategies
     */
    mergeBlocks(mainIndex, strategyBlocks, strategyName) {
        for (const [key, records] of strategyBlocks) {
            const mergedKey = `${strategyName}_${key}`;
            
            if (!mainIndex.has(mergedKey)) {
                mainIndex.set(mergedKey, []);
            }
            
            const existingBlock = mainIndex.get(mergedKey);
            
            // Merge records, avoiding duplicates
            for (const record of records) {
                const exists = existingBlock.some(existing => existing._id === record._id);
                if (!exists && existingBlock.length < this.maxBlockSize) {
                    existingBlock.push(record);
                }
            }
        }
    }

    /**
     * Generate candidate pairs from blocks
     */
    generateCandidatePairs(blockingIndex) {
        const candidatePairs = new Set();
        
        for (const [blockKey, records] of blockingIndex) {
            if (records.length < 2) continue;
            
            // Generate all pairs within the block
            for (let i = 0; i < records.length; i++) {
                for (let j = i + 1; j < records.length; j++) {
                    const record1 = records[i];
                    const record2 = records[j];
                    
                    // Create a canonical pair key (smaller ID first)
                    const pairKey = record1._id < record2._id 
                        ? `${record1._id}|${record2._id}`
                        : `${record2._id}|${record1._id}`;
                    
                    candidatePairs.add(pairKey);
                }
            }
        }
        
        return candidatePairs;
    }

    /**
     * Update performance metrics
     */
    updateMetrics(totalRecords, totalBlocks, candidatePairs, processingTime) {
        this.metrics.totalRecords = totalRecords;
        this.metrics.totalBlocks = totalBlocks;
        this.metrics.candidatePairs = candidatePairs;
        this.metrics.processingTime = processingTime;
        
        // Calculate average block size
        this.metrics.averageBlockSize = totalRecords > 0 ? totalRecords / totalBlocks : 0;
        
        // Calculate reduction ratio (how much we reduced the comparison space)
        const totalPossiblePairs = (totalRecords * (totalRecords - 1)) / 2;
        this.metrics.reductionRatio = totalPossiblePairs > 0 
            ? (1 - (candidatePairs / totalPossiblePairs)) * 100 
            : 0;
        
        logger.info('Blocking metrics updated', this.metrics);
    }

    /**
     * Get blocking statistics
     */
    getBlockingStats(blockingIndex) {
        const stats = {
            totalBlocks: blockingIndex.size,
            blockSizes: [],
            largestBlock: 0,
            smallestBlock: Infinity,
            emptyBlocks: 0
        };
        
        for (const [key, records] of blockingIndex) {
            const size = records.length;
            stats.blockSizes.push(size);
            
            if (size > stats.largestBlock) {
                stats.largestBlock = size;
            }
            
            if (size < stats.smallestBlock) {
                stats.smallestBlock = size;
            }
            
            if (size === 0) {
                stats.emptyBlocks++;
            }
        }
        
        // Calculate statistics
        if (stats.blockSizes.length > 0) {
            stats.averageBlockSize = stats.blockSizes.reduce((a, b) => a + b, 0) / stats.blockSizes.length;
            stats.medianBlockSize = this.calculateMedian(stats.blockSizes);
            stats.standardDeviation = this.calculateStandardDeviation(stats.blockSizes, stats.averageBlockSize);
        }
        
        return stats;
    }

    /**
     * Calculate median of an array
     */
    calculateMedian(arr) {
        const sorted = [...arr].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        
        return sorted.length % 2 !== 0 
            ? sorted[mid] 
            : (sorted[mid - 1] + sorted[mid]) / 2;
    }

    /**
     * Calculate standard deviation
     */
    calculateStandardDeviation(arr, mean) {
        const squaredDiffs = arr.map(value => Math.pow(value - mean, 2));
        const avgSquaredDiff = squaredDiffs.reduce((a, b) => a + b, 0) / arr.length;
        return Math.sqrt(avgSquaredDiff);
    }

    /**
     * Optimize blocking parameters based on data characteristics
     */
    async optimizeBlocking(sampleRecords) {
        logger.info('Optimizing blocking parameters...');
        
        const sampleSize = Math.min(1000, sampleRecords.length);
        const sample = sampleRecords.slice(0, sampleSize);
        
        // Test different strategy combinations
        const strategyCombinations = [
            ['phonetic'],
            ['email_prefix'],
            ['phonetic', 'email_prefix'],
            ['phonetic', 'email_prefix', 'id_prefix'],
            ['phonetic', 'email_prefix', 'id_prefix', 'name_tokens'],
            ['phonetic', 'email_prefix', 'id_prefix', 'name_tokens', 'department']
        ];
        
        let bestCombination = null;
        let bestScore = 0;
        
        for (const strategies of strategyCombinations) {
            try {
                const result = await this.performBlocking(sample, strategies);
                
                // Calculate optimization score (balance between reduction and coverage)
                const reductionScore = result.metrics.reductionRatio / 100;
                const coverageScore = result.candidatePairs.length > 0 ? 1 : 0;
                const efficiencyScore = 1 / (result.processingTime / 1000); // Inverse of processing time
                
                const totalScore = (reductionScore * 0.5) + (coverageScore * 0.3) + (efficiencyScore * 0.2);
                
                if (totalScore > bestScore) {
                    bestScore = totalScore;
                    bestCombination = {
                        strategies,
                        score: totalScore,
                        metrics: result.metrics
                    };
                }
                
                logger.debug(`Strategy combination ${strategies.join(', ')} scored ${totalScore.toFixed(3)}`);
                
            } catch (error) {
                logger.error(`Error testing strategy combination ${strategies.join(', ')}:`, error);
            }
        }
        
        if (bestCombination) {
            logger.info(`Best blocking strategy combination: ${bestCombination.strategies.join(', ')} (score: ${bestCombination.score.toFixed(3)})`);
        }
        
        return bestCombination;
    }

    /**
     * Create blocking index for fast lookups
     */
    createBlockingIndex(records, strategies = ['phonetic', 'email_prefix', 'id_prefix']) {
        const index = {
            byPhonetic: new Map(),
            byEmailPrefix: new Map(),
            byIdPrefix: new Map(),
            byNameToken: new Map(),
            byDepartment: new Map(),
            byCardPrefix: new Map()
        };
        
        for (const record of records) {
            // Phonetic index
            if (record.profile?.name) {
                const name = record.profile.name.toLowerCase().trim();
                const nameParts = name.split(/\s+/);
                
                for (const part of nameParts) {
                    if (part.length >= 2) {
                        const soundexKey = natural.SoundEx.process(part);
                        this.addToIndex(index.byPhonetic, soundexKey, record);
                    }
                }
            }
            
            // Email prefix index
            if (record.identifiers?.email) {
                const emailPrefix = record.identifiers.email.split('@')[0].toLowerCase();
                if (emailPrefix.length >= 3) {
                    this.addToIndex(index.byEmailPrefix, emailPrefix.substring(0, 3), record);
                }
            }
            
            // ID prefix index
            if (record.identifiers?.student_id) {
                const prefix = record.identifiers.student_id.substring(0, 4);
                this.addToIndex(index.byIdPrefix, prefix, record);
            }
            
            if (record.identifiers?.employee_id) {
                const prefix = record.identifiers.employee_id.substring(0, 3);
                this.addToIndex(index.byIdPrefix, prefix, record);
            }
        }
        
        return index;
    }

    /**
     * Add record to index
     */
    addToIndex(index, key, record) {
        if (!index.has(key)) {
            index.set(key, []);
        }
        index.get(key).push(record);
    }

    /**
     * Find candidate matches for a single record
     */
    findCandidates(record, blockingIndex) {
        const candidates = new Set();
        
        // Generate blocking keys for the record
        const keys = this.generateBlockingKeys(record);
        
        // Find all records in the same blocks
        for (const key of keys) {
            if (blockingIndex.has(key)) {
                const blockRecords = blockingIndex.get(key);
                for (const candidate of blockRecords) {
                    if (candidate._id !== record._id) {
                        candidates.add(candidate);
                    }
                }
            }
        }
        
        return Array.from(candidates);
    }

    /**
     * Generate all blocking keys for a record
     */
    generateBlockingKeys(record) {
        const keys = [];
        
        // Phonetic keys
        if (record.profile?.name) {
            const name = record.profile.name.toLowerCase().trim();
            const nameParts = name.split(/\s+/);
            
            for (const part of nameParts) {
                if (part.length >= 2) {
                    keys.push(`phonetic_soundex_${natural.SoundEx.process(part)}`);
                    keys.push(`phonetic_metaphone_${natural.Metaphone.process(part)}`);
                }
            }
        }
        
        // Email prefix keys
        if (record.identifiers?.email) {
            const emailPrefix = record.identifiers.email.split('@')[0].toLowerCase();
            if (emailPrefix.length >= 3) {
                keys.push(`email_prefix_email_prefix_3_${emailPrefix.substring(0, 3)}`);
            }
        }
        
        // ID prefix keys
        if (record.identifiers?.student_id && record.identifiers.student_id.length >= 4) {
            keys.push(`id_prefix_student_id_prefix_${record.identifiers.student_id.substring(0, 4)}`);
        }
        
        if (record.identifiers?.employee_id && record.identifiers.employee_id.length >= 3) {
            keys.push(`id_prefix_employee_id_prefix_${record.identifiers.employee_id.substring(0, 3)}`);
        }
        
        return keys;
    }

    /**
     * Get current metrics
     */
    getMetrics() {
        return { ...this.metrics };
    }

    /**
     * Reset metrics
     */
    resetMetrics() {
        this.metrics = {
            totalRecords: 0,
            totalBlocks: 0,
            averageBlockSize: 0,
            reductionRatio: 0,
            processingTime: 0
        };
    }
}

module.exports = BlockingService;