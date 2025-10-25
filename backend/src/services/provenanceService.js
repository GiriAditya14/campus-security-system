const winston = require('winston');
const crypto = require('crypto');
const Event = require('../models/Event');

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
        new winston.transports.File({ filename: 'logs/provenance.log' })
    ]
});

class ProvenanceService {
    constructor() {
        this.config = {
            enableDetailedTracking: process.env.PROVENANCE_DETAILED_TRACKING !== 'false',
            maxProvenanceDepth: parseInt(process.env.MAX_PROVENANCE_DEPTH) || 10,
            retentionPeriodDays: parseInt(process.env.PROVENANCE_RETENTION_DAYS) || 90,
            enableIntegrityChecks: process.env.PROVENANCE_INTEGRITY_CHECKS !== 'false',
            compressionEnabled: process.env.PROVENANCE_COMPRESSION === 'true'
        };

        // Provenance graph storage
        this.provenanceGraph = new Map();
        
        // Activity types for provenance tracking
        this.activityTypes = {
            DATA_INGESTION: 'data_ingestion',
            ENTITY_RESOLUTION: 'entity_resolution',
            DATA_FUSION: 'data_fusion',
            PREDICTION: 'prediction',
            ALERT_GENERATION: 'alert_generation',
            USER_ACTION: 'user_action',
            SYSTEM_PROCESS: 'system_process'
        };

        // Entity types in provenance
        this.entityTypes = {
            RAW_DATA: 'raw_data',
            PROCESSED_DATA: 'processed_data',
            ENTITY_RECORD: 'entity_record',
            FUSED_EVENT: 'fused_event',
            PREDICTION: 'prediction',
            ALERT: 'alert',
            USER: 'user',
            ALGORITHM: 'algorithm'
        };
    }
}    /**
  
   * Create provenance record for data processing activity
     * @param {Object} activity - Activity details
     * @param {Array} inputs - Input entities/data
     * @param {Array} outputs - Output entities/data
     * @param {Object} agent - Processing agent (user, algorithm, system)
     */
    async createProvenanceRecord(activity, inputs = [], outputs = [], agent = null) {
        const startTime = Date.now();
        
        try {
            const provenanceId = this.generateProvenanceId();
            
            const record = {
                id: provenanceId,
                activity: {
                    type: activity.type,
                    name: activity.name || activity.type,
                    description: activity.description,
                    startTime: activity.startTime || new Date(),
                    endTime: activity.endTime || new Date(),
                    duration: activity.duration || 0,
                    parameters: activity.parameters || {},
                    version: activity.version || '1.0.0'
                },
                inputs: inputs.map(input => this.normalizeEntity(input)),
                outputs: outputs.map(output => this.normalizeEntity(output)),
                agent: agent ? this.normalizeAgent(agent) : null,
                environment: {
                    system: process.platform,
                    nodeVersion: process.version,
                    timestamp: new Date(),
                    hostname: require('os').hostname(),
                    processId: process.pid
                },
                integrity: this.config.enableIntegrityChecks ? 
                    this.calculateIntegrityHash(activity, inputs, outputs) : null,
                metadata: {
                    createdAt: new Date(),
                    createdBy: 'provenance_service',
                    version: '1.0.0',
                    compressed: false
                }
            };

            // Store in provenance graph
            this.provenanceGraph.set(provenanceId, record);

            // Create relationships in graph
            await this.createProvenanceRelationships(record);

            // Log provenance creation
            logger.debug('Provenance record created', {
                provenanceId,
                activityType: activity.type,
                inputCount: inputs.length,
                outputCount: outputs.length,
                processingTime: Date.now() - startTime
            });

            return provenanceId;

        } catch (error) {
            logger.error('Error creating provenance record:', error);
            throw error;
        }
    }

    /**
     * Track data lineage for an entity
     * @param {string} entityId - Entity identifier
     * @param {Object} options - Tracking options
     */
    async trackDataLineage(entityId, options = {}) {
        try {
            const {
                maxDepth = this.config.maxProvenanceDepth,
                includeTransformations = true,
                includeMetadata = true,
                direction = 'backward' // 'backward', 'forward', 'both'
            } = options;

            logger.debug(`Tracking data lineage for entity: ${entityId}`, {
                maxDepth,
                direction
            });

            const lineage = {
                entityId,
                lineageGraph: new Map(),
                transformations: [],
                sources: new Set(),
                derivations: new Set(),
                depth: 0
            };

            // Build lineage graph
            if (direction === 'backward' || direction === 'both') {
                await this.traceBackwardLineage(entityId, lineage, 0, maxDepth);
            }
            
            if (direction === 'forward' || direction === 'both') {
                await this.traceForwardLineage(entityId, lineage, 0, maxDepth);
            }

            // Extract transformations if requested
            if (includeTransformations) {
                lineage.transformations = this.extractTransformations(lineage.lineageGraph);
            }

            // Add metadata if requested
            if (includeMetadata) {
                lineage.metadata = await this.gatherLineageMetadata(lineage);
            }

            return this.formatLineageResult(lineage);

        } catch (error) {
            logger.error('Error tracking data lineage:', error);
            throw error;
        }
    }

    /**
     * Query provenance information
     * @param {Object} query - Query parameters
     */
    async queryProvenance(query) {
        try {
            const {
                entityId = null,
                activityType = null,
                agentId = null,
                timeRange = null,
                limit = 100,
                offset = 0
            } = query;

            logger.debug('Querying provenance', query);

            let results = Array.from(this.provenanceGraph.values());

            // Apply filters
            if (entityId) {
                results = results.filter(record => 
                    record.inputs.some(input => input.id === entityId) ||
                    record.outputs.some(output => output.id === entityId)
                );
            }

            if (activityType) {
                results = results.filter(record => record.activity.type === activityType);
            }

            if (agentId) {
                results = results.filter(record => 
                    record.agent && record.agent.id === agentId
                );
            }

            if (timeRange) {
                const startTime = new Date(timeRange.start);
                const endTime = new Date(timeRange.end);
                results = results.filter(record => 
                    record.activity.startTime >= startTime && 
                    record.activity.startTime <= endTime
                );
            }

            // Sort by timestamp (most recent first)
            results.sort((a, b) => 
                new Date(b.activity.startTime) - new Date(a.activity.startTime)
            );

            // Apply pagination
            const paginatedResults = results.slice(offset, offset + limit);

            return {
                results: paginatedResults,
                totalCount: results.length,
                limit,
                offset,
                hasMore: offset + limit < results.length
            };

        } catch (error) {
            logger.error('Error querying provenance:', error);
            throw error;
        }
    }

    /**
     * Generate audit trail for compliance
     * @param {Object} auditQuery - Audit query parameters
     */
    async generateAuditTrail(auditQuery) {
        try {
            const {
                entityId,
                startDate,
                endDate,
                includeUserActions = true,
                includeSystemActions = true,
                format = 'detailed' // 'detailed', 'summary', 'compliance'
            } = auditQuery;

            logger.info('Generating audit trail', {
                entityId,
                startDate,
                endDate,
                format
            });

            // Query relevant provenance records
            const provenanceQuery = {
                entityId,
                timeRange: { start: startDate, end: endDate },
                limit: 1000
            };

            const provenanceData = await this.queryProvenance(provenanceQuery);

            // Filter by action types
            let filteredRecords = provenanceData.results;
            
            if (!includeUserActions) {
                filteredRecords = filteredRecords.filter(record => 
                    !record.agent || record.agent.type !== 'user'
                );
            }
            
            if (!includeSystemActions) {
                filteredRecords = filteredRecords.filter(record => 
                    !record.agent || record.agent.type !== 'system'
                );
            }

            // Format audit trail based on requested format
            let auditTrail;
            switch (format) {
                case 'summary':
                    auditTrail = this.formatSummaryAuditTrail(filteredRecords);
                    break;
                case 'compliance':
                    auditTrail = this.formatComplianceAuditTrail(filteredRecords);
                    break;
                default:
                    auditTrail = this.formatDetailedAuditTrail(filteredRecords);
            }

            // Add audit metadata
            auditTrail.metadata = {
                generatedAt: new Date(),
                generatedBy: 'provenance_service',
                query: auditQuery,
                recordCount: filteredRecords.length,
                timeRange: { startDate, endDate },
                integrityHash: this.calculateAuditIntegrityHash(filteredRecords)
            };

            return auditTrail;

        } catch (error) {
            logger.error('Error generating audit trail:', error);
            throw error;
        }
    }    /
**
     * Verify data integrity using provenance
     * @param {string} entityId - Entity to verify
     */
    async verifyDataIntegrity(entityId) {
        try {
            logger.debug(`Verifying data integrity for entity: ${entityId}`);

            const lineage = await this.trackDataLineage(entityId, {
                includeMetadata: true,
                direction: 'backward'
            });

            const integrityReport = {
                entityId,
                isValid: true,
                issues: [],
                verificationTime: new Date(),
                checksPerformed: []
            };

            // Check 1: Verify provenance chain completeness
            const completenessCheck = this.checkProvenanceCompleteness(lineage);
            integrityReport.checksPerformed.push(completenessCheck);
            if (!completenessCheck.passed) {
                integrityReport.isValid = false;
                integrityReport.issues.push(...completenessCheck.issues);
            }

            // Check 2: Verify integrity hashes
            if (this.config.enableIntegrityChecks) {
                const hashCheck = await this.verifyIntegrityHashes(lineage);
                integrityReport.checksPerformed.push(hashCheck);
                if (!hashCheck.passed) {
                    integrityReport.isValid = false;
                    integrityReport.issues.push(...hashCheck.issues);
                }
            }

            // Check 3: Verify temporal consistency
            const temporalCheck = this.checkTemporalConsistency(lineage);
            integrityReport.checksPerformed.push(temporalCheck);
            if (!temporalCheck.passed) {
                integrityReport.isValid = false;
                integrityReport.issues.push(...temporalCheck.issues);
            }

            // Check 4: Verify agent authenticity
            const agentCheck = this.checkAgentAuthenticity(lineage);
            integrityReport.checksPerformed.push(agentCheck);
            if (!agentCheck.passed) {
                integrityReport.isValid = false;
                integrityReport.issues.push(...agentCheck.issues);
            }

            return integrityReport;

        } catch (error) {
            logger.error('Error verifying data integrity:', error);
            throw error;
        }
    }

    /**
     * Export provenance data for external systems
     * @param {Object} exportOptions - Export configuration
     */
    async exportProvenance(exportOptions = {}) {
        try {
            const {
                format = 'json', // 'json', 'rdf', 'prov-json', 'csv'
                entityIds = null,
                timeRange = null,
                includeMetadata = true,
                compress = false
            } = exportOptions;

            logger.info('Exporting provenance data', {
                format,
                entityCount: entityIds?.length || 'all',
                timeRange
            });

            // Query provenance data
            let query = { limit: 10000 };
            if (timeRange) query.timeRange = timeRange;

            let provenanceData = await this.queryProvenance(query);
            let records = provenanceData.results;

            // Filter by entity IDs if specified
            if (entityIds && entityIds.length > 0) {
                records = records.filter(record =>
                    record.inputs.some(input => entityIds.includes(input.id)) ||
                    record.outputs.some(output => entityIds.includes(output.id))
                );
            }

            // Format data based on requested format
            let exportData;
            switch (format) {
                case 'rdf':
                    exportData = this.formatAsRDF(records);
                    break;
                case 'prov-json':
                    exportData = this.formatAsProvJSON(records);
                    break;
                case 'csv':
                    exportData = this.formatAsCSV(records);
                    break;
                default:
                    exportData = this.formatAsJSON(records, includeMetadata);
            }

            // Compress if requested
            if (compress && format !== 'csv') {
                exportData = this.compressData(exportData);
            }

            return {
                data: exportData,
                format,
                recordCount: records.length,
                exportedAt: new Date(),
                compressed: compress
            };

        } catch (error) {
            logger.error('Error exporting provenance data:', error);
            throw error;
        }
    }

    // Private helper methods

    generateProvenanceId() {
        return `prov_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
    }

    normalizeEntity(entity) {
        return {
            id: entity.id || entity._id,
            type: entity.type || this.entityTypes.RAW_DATA,
            name: entity.name || entity.id,
            attributes: entity.attributes || {},
            checksum: entity.checksum || this.calculateEntityChecksum(entity)
        };
    }

    normalizeAgent(agent) {
        return {
            id: agent.id || agent._id,
            type: agent.type || 'system', // 'user', 'system', 'algorithm'
            name: agent.name || agent.id,
            version: agent.version || '1.0.0',
            attributes: agent.attributes || {}
        };
    }

    calculateIntegrityHash(activity, inputs, outputs) {
        const data = {
            activity: activity.type,
            inputs: inputs.map(i => i.id).sort(),
            outputs: outputs.map(o => o.id).sort(),
            timestamp: activity.startTime
        };
        
        return crypto.createHash('sha256')
            .update(JSON.stringify(data))
            .digest('hex');
    }

    calculateEntityChecksum(entity) {
        const data = {
            id: entity.id,
            type: entity.type,
            attributes: entity.attributes
        };
        
        return crypto.createHash('md5')
            .update(JSON.stringify(data))
            .digest('hex');
    }

    async createProvenanceRelationships(record) {
        // Create relationships between inputs, activity, and outputs
        record.inputs.forEach(input => {
            record.outputs.forEach(output => {
                const relationshipId = `${input.id}_${record.activity.type}_${output.id}`;
                // Store relationship for graph traversal
                // This would typically be stored in a graph database
            });
        });
    }

    async traceBackwardLineage(entityId, lineage, currentDepth, maxDepth) {
        if (currentDepth >= maxDepth) return;

        // Find provenance records where this entity is an output
        const records = Array.from(this.provenanceGraph.values()).filter(record =>
            record.outputs.some(output => output.id === entityId)
        );

        for (const record of records) {
            lineage.lineageGraph.set(record.id, record);
            lineage.depth = Math.max(lineage.depth, currentDepth + 1);

            // Add sources
            record.inputs.forEach(input => lineage.sources.add(input.id));

            // Recursively trace inputs
            for (const input of record.inputs) {
                await this.traceBackwardLineage(input.id, lineage, currentDepth + 1, maxDepth);
            }
        }
    }

    async traceForwardLineage(entityId, lineage, currentDepth, maxDepth) {
        if (currentDepth >= maxDepth) return;

        // Find provenance records where this entity is an input
        const records = Array.from(this.provenanceGraph.values()).filter(record =>
            record.inputs.some(input => input.id === entityId)
        );

        for (const record of records) {
            lineage.lineageGraph.set(record.id, record);
            lineage.depth = Math.max(lineage.depth, currentDepth + 1);

            // Add derivations
            record.outputs.forEach(output => lineage.derivations.add(output.id));

            // Recursively trace outputs
            for (const output of record.outputs) {
                await this.traceForwardLineage(output.id, lineage, currentDepth + 1, maxDepth);
            }
        }
    }

    extractTransformations(lineageGraph) {
        const transformations = [];
        
        lineageGraph.forEach(record => {
            transformations.push({
                id: record.id,
                type: record.activity.type,
                name: record.activity.name,
                inputs: record.inputs.map(i => i.id),
                outputs: record.outputs.map(o => o.id),
                agent: record.agent?.name || 'system',
                timestamp: record.activity.startTime,
                duration: record.activity.duration,
                parameters: record.activity.parameters
            });
        });

        return transformations.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    }

    async gatherLineageMetadata(lineage) {
        return {
            totalRecords: lineage.lineageGraph.size,
            maxDepth: lineage.depth,
            sourceCount: lineage.sources.size,
            derivationCount: lineage.derivations.size,
            activityTypes: [...new Set(Array.from(lineage.lineageGraph.values())
                .map(record => record.activity.type))],
            agents: [...new Set(Array.from(lineage.lineageGraph.values())
                .map(record => record.agent?.name).filter(Boolean))],
            timeSpan: this.calculateTimeSpan(lineage.lineageGraph)
        };
    }

    calculateTimeSpan(lineageGraph) {
        const timestamps = Array.from(lineageGraph.values())
            .map(record => new Date(record.activity.startTime));
        
        if (timestamps.length === 0) return null;
        
        return {
            earliest: new Date(Math.min(...timestamps)),
            latest: new Date(Math.max(...timestamps)),
            duration: Math.max(...timestamps) - Math.min(...timestamps)
        };
    }

    formatLineageResult(lineage) {
        return {
            entityId: lineage.entityId,
            sources: Array.from(lineage.sources),
            derivations: Array.from(lineage.derivations),
            transformations: lineage.transformations,
            metadata: lineage.metadata,
            graph: {
                nodes: this.extractGraphNodes(lineage.lineageGraph),
                edges: this.extractGraphEdges(lineage.lineageGraph)
            }
        };
    }

    extractGraphNodes(lineageGraph) {
        const nodes = new Map();
        
        lineageGraph.forEach(record => {
            // Add activity node
            nodes.set(record.id, {
                id: record.id,
                type: 'activity',
                label: record.activity.name,
                activityType: record.activity.type,
                timestamp: record.activity.startTime
            });
            
            // Add entity nodes
            [...record.inputs, ...record.outputs].forEach(entity => {
                if (!nodes.has(entity.id)) {
                    nodes.set(entity.id, {
                        id: entity.id,
                        type: 'entity',
                        label: entity.name,
                        entityType: entity.type
                    });
                }
            });
        });
        
        return Array.from(nodes.values());
    }

    extractGraphEdges(lineageGraph) {
        const edges = [];
        
        lineageGraph.forEach(record => {
            // Input edges
            record.inputs.forEach(input => {
                edges.push({
                    source: input.id,
                    target: record.id,
                    type: 'used'
                });
            });
            
            // Output edges
            record.outputs.forEach(output => {
                edges.push({
                    source: record.id,
                    target: output.id,
                    type: 'generated'
                });
            });
        });
        
        return edges;
    } 
   // Integrity verification methods

    checkProvenanceCompleteness(lineage) {
        const issues = [];
        let passed = true;

        // Check for orphaned entities (entities without provenance)
        const allEntities = new Set();
        const entitiesWithProvenance = new Set();

        lineage.lineageGraph.forEach(record => {
            record.inputs.forEach(input => {
                allEntities.add(input.id);
                entitiesWithProvenance.add(input.id);
            });
            record.outputs.forEach(output => {
                allEntities.add(output.id);
            });
        });

        const orphanedEntities = [...allEntities].filter(id => !entitiesWithProvenance.has(id));
        if (orphanedEntities.length > 0) {
            passed = false;
            issues.push({
                type: 'orphaned_entities',
                message: `Found ${orphanedEntities.length} entities without provenance`,
                entities: orphanedEntities
            });
        }

        return {
            checkType: 'provenance_completeness',
            passed,
            issues,
            checkedAt: new Date()
        };
    }

    async verifyIntegrityHashes(lineage) {
        const issues = [];
        let passed = true;

        for (const record of lineage.lineageGraph.values()) {
            if (record.integrity) {
                const recalculatedHash = this.calculateIntegrityHash(
                    record.activity,
                    record.inputs,
                    record.outputs
                );

                if (recalculatedHash !== record.integrity) {
                    passed = false;
                    issues.push({
                        type: 'integrity_hash_mismatch',
                        message: `Integrity hash mismatch for record ${record.id}`,
                        recordId: record.id,
                        expectedHash: record.integrity,
                        actualHash: recalculatedHash
                    });
                }
            }
        }

        return {
            checkType: 'integrity_hashes',
            passed,
            issues,
            checkedAt: new Date()
        };
    }

    checkTemporalConsistency(lineage) {
        const issues = [];
        let passed = true;

        lineage.lineageGraph.forEach(record => {
            // Check that activity end time is after start time
            if (record.activity.endTime < record.activity.startTime) {
                passed = false;
                issues.push({
                    type: 'invalid_time_range',
                    message: `Activity end time before start time for record ${record.id}`,
                    recordId: record.id
                });
            }

            // Check that outputs are generated after inputs are used
            // This is a simplified check - in practice, you'd need more sophisticated temporal reasoning
            const inputTime = record.activity.startTime;
            const outputTime = record.activity.endTime;

            if (outputTime <= inputTime) {
                passed = false;
                issues.push({
                    type: 'temporal_inconsistency',
                    message: `Outputs generated before or at the same time as inputs for record ${record.id}`,
                    recordId: record.id
                });
            }
        });

        return {
            checkType: 'temporal_consistency',
            passed,
            issues,
            checkedAt: new Date()
        };
    }

    checkAgentAuthenticity(lineage) {
        const issues = [];
        let passed = true;

        lineage.lineageGraph.forEach(record => {
            if (record.agent) {
                // Check for suspicious agent patterns
                if (!record.agent.id || !record.agent.type) {
                    passed = false;
                    issues.push({
                        type: 'incomplete_agent_info',
                        message: `Incomplete agent information for record ${record.id}`,
                        recordId: record.id
                    });
                }

                // Check for impossible agent activities (e.g., user actions during system maintenance)
                if (record.agent.type === 'user' && record.activity.type === 'system_process') {
                    passed = false;
                    issues.push({
                        type: 'agent_activity_mismatch',
                        message: `User agent performing system process in record ${record.id}`,
                        recordId: record.id
                    });
                }
            }
        });

        return {
            checkType: 'agent_authenticity',
            passed,
            issues,
            checkedAt: new Date()
        };
    }

    // Audit trail formatting methods

    formatDetailedAuditTrail(records) {
        return {
            type: 'detailed_audit_trail',
            entries: records.map(record => ({
                timestamp: record.activity.startTime,
                activityType: record.activity.type,
                activityName: record.activity.name,
                agent: record.agent ? {
                    id: record.agent.id,
                    type: record.agent.type,
                    name: record.agent.name
                } : null,
                inputs: record.inputs.map(input => ({
                    id: input.id,
                    type: input.type,
                    name: input.name
                })),
                outputs: record.outputs.map(output => ({
                    id: output.id,
                    type: output.type,
                    name: output.name
                })),
                parameters: record.activity.parameters,
                duration: record.activity.duration,
                integrity: record.integrity
            }))
        };
    }

    formatSummaryAuditTrail(records) {
        const summary = {
            type: 'summary_audit_trail',
            totalActivities: records.length,
            activityTypes: {},
            agents: {},
            timeRange: null
        };

        if (records.length > 0) {
            const timestamps = records.map(r => new Date(r.activity.startTime));
            summary.timeRange = {
                start: new Date(Math.min(...timestamps)),
                end: new Date(Math.max(...timestamps))
            };
        }

        records.forEach(record => {
            // Count activity types
            const activityType = record.activity.type;
            summary.activityTypes[activityType] = (summary.activityTypes[activityType] || 0) + 1;

            // Count agents
            if (record.agent) {
                const agentKey = `${record.agent.type}:${record.agent.name}`;
                summary.agents[agentKey] = (summary.agents[agentKey] || 0) + 1;
            }
        });

        return summary;
    }

    formatComplianceAuditTrail(records) {
        return {
            type: 'compliance_audit_trail',
            complianceStandard: 'GDPR', // This could be configurable
            entries: records.map(record => ({
                auditId: record.id,
                timestamp: record.activity.startTime,
                dataSubject: this.extractDataSubject(record),
                processingPurpose: record.activity.description || record.activity.type,
                legalBasis: this.determineLegalBasis(record),
                dataCategories: this.extractDataCategories(record),
                recipients: this.extractRecipients(record),
                retentionPeriod: this.determineRetentionPeriod(record),
                securityMeasures: this.extractSecurityMeasures(record)
            }))
        };
    }

    // Export formatting methods

    formatAsJSON(records, includeMetadata) {
        const data = {
            provenance: records
        };

        if (includeMetadata) {
            data.metadata = {
                exportedAt: new Date(),
                recordCount: records.length,
                version: '1.0.0',
                format: 'json'
            };
        }

        return JSON.stringify(data, null, 2);
    }

    formatAsProvJSON(records) {
        // Format according to PROV-JSON specification
        const provDocument = {
            prefix: {
                prov: 'http://www.w3.org/ns/prov#',
                campus: 'http://campus-security.example.org/'
            },
            entity: {},
            activity: {},
            agent: {},
            used: {},
            wasGeneratedBy: {},
            wasAssociatedWith: {}
        };

        records.forEach(record => {
            // Add activity
            provDocument.activity[record.id] = {
                'prov:type': record.activity.type,
                'prov:startTime': record.activity.startTime,
                'prov:endTime': record.activity.endTime
            };

            // Add entities and relationships
            record.inputs.forEach(input => {
                provDocument.entity[input.id] = {
                    'prov:type': input.type
                };
                provDocument.used[`${record.id}_used_${input.id}`] = {
                    'prov:activity': record.id,
                    'prov:entity': input.id
                };
            });

            record.outputs.forEach(output => {
                provDocument.entity[output.id] = {
                    'prov:type': output.type
                };
                provDocument.wasGeneratedBy[`${output.id}_generated_by_${record.id}`] = {
                    'prov:entity': output.id,
                    'prov:activity': record.id
                };
            });

            // Add agent if present
            if (record.agent) {
                provDocument.agent[record.agent.id] = {
                    'prov:type': record.agent.type
                };
                provDocument.wasAssociatedWith[`${record.id}_associated_with_${record.agent.id}`] = {
                    'prov:activity': record.id,
                    'prov:agent': record.agent.id
                };
            }
        });

        return JSON.stringify(provDocument, null, 2);
    }

    formatAsCSV(records) {
        const headers = [
            'ProvenanceID', 'Timestamp', 'ActivityType', 'ActivityName',
            'AgentID', 'AgentType', 'InputEntities', 'OutputEntities',
            'Duration', 'Parameters'
        ];

        const rows = records.map(record => [
            record.id,
            record.activity.startTime,
            record.activity.type,
            record.activity.name,
            record.agent?.id || '',
            record.agent?.type || '',
            record.inputs.map(i => i.id).join(';'),
            record.outputs.map(o => o.id).join(';'),
            record.activity.duration || 0,
            JSON.stringify(record.activity.parameters || {})
        ]);

        return [headers, ...rows].map(row => row.join(',')).join('\n');
    }

    formatAsRDF(records) {
        // Simplified RDF/Turtle format
        let rdf = '@prefix prov: <http://www.w3.org/ns/prov#> .\n';
        rdf += '@prefix campus: <http://campus-security.example.org/> .\n\n';

        records.forEach(record => {
            rdf += `campus:${record.id} a prov:Activity ;\n`;
            rdf += `    prov:startedAtTime "${record.activity.startTime}"^^xsd:dateTime ;\n`;
            rdf += `    prov:endedAtTime "${record.activity.endTime}"^^xsd:dateTime .\n\n`;

            record.inputs.forEach(input => {
                rdf += `campus:${record.id} prov:used campus:${input.id} .\n`;
            });

            record.outputs.forEach(output => {
                rdf += `campus:${output.id} prov:wasGeneratedBy campus:${record.id} .\n`;
            });

            if (record.agent) {
                rdf += `campus:${record.id} prov:wasAssociatedWith campus:${record.agent.id} .\n`;
            }

            rdf += '\n';
        });

        return rdf;
    }

    // Utility methods for compliance formatting

    extractDataSubject(record) {
        // Extract data subject information from record
        const entityIds = [...record.inputs, ...record.outputs].map(e => e.id);
        const entityId = entityIds.find(id => id.startsWith('E'));
        return entityId || 'unknown';
    }

    determineLegalBasis(record) {
        // Determine legal basis for processing based on activity type
        const legalBasisMap = {
            'data_ingestion': 'legitimate_interest',
            'entity_resolution': 'legitimate_interest',
            'alert_generation': 'vital_interests',
            'user_action': 'consent'
        };
        return legalBasisMap[record.activity.type] || 'legitimate_interest';
    }

    extractDataCategories(record) {
        // Extract data categories from record
        const categories = new Set();
        [...record.inputs, ...record.outputs].forEach(entity => {
            if (entity.type === 'entity_record') categories.add('identity_data');
            if (entity.type === 'fused_event') categories.add('location_data');
        });
        return Array.from(categories);
    }

    extractRecipients(record) {
        // Extract data recipients
        return record.agent ? [record.agent.name] : ['system'];
    }

    determineRetentionPeriod(record) {
        // Determine retention period based on data type
        return `${this.config.retentionPeriodDays} days`;
    }

    extractSecurityMeasures(record) {
        // Extract security measures applied
        const measures = ['encryption'];
        if (record.integrity) measures.push('integrity_verification');
        return measures;
    }

    calculateAuditIntegrityHash(records) {
        const data = records.map(record => ({
            id: record.id,
            timestamp: record.activity.startTime,
            type: record.activity.type
        }));
        
        return crypto.createHash('sha256')
            .update(JSON.stringify(data))
            .digest('hex');
    }

    compressData(data) {
        // Simple compression placeholder - in production, use proper compression
        return Buffer.from(data).toString('base64');
    }

    // Cache and cleanup methods

    async cleanupOldProvenance() {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionPeriodDays);

        let removedCount = 0;
        this.provenanceGraph.forEach((record, id) => {
            if (new Date(record.metadata.createdAt) < cutoffDate) {
                this.provenanceGraph.delete(id);
                removedCount++;
            }
        });

        if (removedCount > 0) {
            logger.info(`Cleaned up ${removedCount} old provenance records`);
        }

        return removedCount;
    }

    getProvenanceStats() {
        const stats = {
            totalRecords: this.provenanceGraph.size,
            activityTypes: {},
            agentTypes: {},
            oldestRecord: null,
            newestRecord: null
        };

        let oldestTime = Infinity;
        let newestTime = 0;

        this.provenanceGraph.forEach(record => {
            // Count activity types
            const activityType = record.activity.type;
            stats.activityTypes[activityType] = (stats.activityTypes[activityType] || 0) + 1;

            // Count agent types
            if (record.agent) {
                const agentType = record.agent.type;
                stats.agentTypes[agentType] = (stats.agentTypes[agentType] || 0) + 1;
            }

            // Track time range
            const recordTime = new Date(record.activity.startTime).getTime();
            if (recordTime < oldestTime) {
                oldestTime = recordTime;
                stats.oldestRecord = record.activity.startTime;
            }
            if (recordTime > newestTime) {
                newestTime = recordTime;
                stats.newestRecord = record.activity.startTime;
            }
        });

        return stats;
    }

    // Configuration methods

    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        logger.info('Provenance service configuration updated', newConfig);
    }

    getConfig() {
        return { ...this.config };
    }
}

module.exports = ProvenanceService;