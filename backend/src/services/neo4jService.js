const neo4j = require('neo4j-driver');
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
        new winston.transports.File({ filename: 'logs/neo4j.log' })
    ]
});

class Neo4jService {
    constructor(driver) {
        this.driver = driver;
    }

    // Initialize database schema and constraints
    async initializeSchema() {
        const session = this.driver.session();
        
        try {
            logger.info('Initializing Neo4j schema...');
            
            // Create constraints for unique identifiers
            const constraints = [
                'CREATE CONSTRAINT entity_id_unique IF NOT EXISTS FOR (e:Entity) REQUIRE e.id IS UNIQUE',
                'CREATE CONSTRAINT location_id_unique IF NOT EXISTS FOR (l:Location) REQUIRE l.id IS UNIQUE',
                'CREATE CONSTRAINT event_id_unique IF NOT EXISTS FOR (ev:Event) REQUIRE ev.id IS UNIQUE'
            ];

            for (const constraint of constraints) {
                try {
                    await session.run(constraint);
                    logger.info(`Created constraint: ${constraint}`);
                } catch (error) {
                    if (!error.message.includes('already exists')) {
                        logger.error(`Error creating constraint: ${constraint}`, error);
                    }
                }
            }

            // Create indexes for performance
            const indexes = [
                'CREATE INDEX entity_name_index IF NOT EXISTS FOR (e:Entity) ON (e.name)',
                'CREATE INDEX entity_type_index IF NOT EXISTS FOR (e:Entity) ON (e.type)',
                'CREATE INDEX entity_department_index IF NOT EXISTS FOR (e:Entity) ON (e.department)',
                'CREATE INDEX location_building_index IF NOT EXISTS FOR (l:Location) ON (l.building)',
                'CREATE INDEX location_zone_index IF NOT EXISTS FOR (l:Location) ON (l.zone)',
                'CREATE INDEX event_timestamp_index IF NOT EXISTS FOR (ev:Event) ON (ev.timestamp)',
                'CREATE INDEX event_activity_index IF NOT EXISTS FOR (ev:Event) ON (ev.activity_type)',
                'CREATE INDEX visited_timestamp_index IF NOT EXISTS FOR ()-[r:VISITED]-() ON (r.timestamp)',
                'CREATE INDEX associated_strength_index IF NOT EXISTS FOR ()-[r:ASSOCIATED_WITH]-() ON (r.strength)'
            ];

            for (const index of indexes) {
                try {
                    await session.run(index);
                    logger.info(`Created index: ${index}`);
                } catch (error) {
                    if (!error.message.includes('already exists')) {
                        logger.error(`Error creating index: ${index}`, error);
                    }
                }
            }

            logger.info('Neo4j schema initialization completed');
        } catch (error) {
            logger.error('Error initializing Neo4j schema:', error);
            throw error;
        } finally {
            await session.close();
        }
    }

    // Entity operations
    async createEntity(entityData) {
        const session = this.driver.session();
        
        try {
            const query = `
                MERGE (e:Entity {id: $id})
                SET e.name = $name,
                    e.type = $type,
                    e.department = $department,
                    e.confidence = $confidence,
                    e.created_at = datetime(),
                    e.updated_at = datetime()
                RETURN e
            `;
            
            const result = await session.run(query, {
                id: entityData.id,
                name: entityData.name,
                type: entityData.type,
                department: entityData.department,
                confidence: entityData.confidence || 1.0
            });
            
            return result.records[0]?.get('e').properties;
        } catch (error) {
            logger.error('Error creating entity:', error);
            throw error;
        } finally {
            await session.close();
        }
    }

    async updateEntity(entityId, updateData) {
        const session = this.driver.session();
        
        try {
            const setClause = Object.keys(updateData)
                .map(key => `e.${key} = $${key}`)
                .join(', ');
            
            const query = `
                MATCH (e:Entity {id: $entityId})
                SET ${setClause}, e.updated_at = datetime()
                RETURN e
            `;
            
            const result = await session.run(query, {
                entityId,
                ...updateData
            });
            
            return result.records[0]?.get('e').properties;
        } catch (error) {
            logger.error('Error updating entity:', error);
            throw error;
        } finally {
            await session.close();
        }
    }

    // Location operations
    async createLocation(locationData) {
        const session = this.driver.session();
        
        try {
            const query = `
                MERGE (l:Location {id: $id})
                SET l.building = $building,
                    l.room = $room,
                    l.floor = $floor,
                    l.zone = $zone,
                    l.access_level = $access_level,
                    l.coordinates = point({latitude: $lat, longitude: $lon}),
                    l.created_at = datetime(),
                    l.updated_at = datetime()
                RETURN l
            `;
            
            const result = await session.run(query, {
                id: locationData.id,
                building: locationData.building,
                room: locationData.room || null,
                floor: locationData.floor || null,
                zone: locationData.zone || 'academic',
                access_level: locationData.access_level || 'public',
                lat: locationData.coordinates?.lat || 0,
                lon: locationData.coordinates?.lon || 0
            });
            
            return result.records[0]?.get('l').properties;
        } catch (error) {
            logger.error('Error creating location:', error);
            throw error;
        } finally {
            await session.close();
        }
    }

    // Relationship operations
    async createVisitedRelationship(entityId, locationId, visitData) {
        const session = this.driver.session();
        
        try {
            const query = `
                MATCH (e:Entity {id: $entityId})
                MATCH (l:Location {id: $locationId})
                MERGE (e)-[r:VISITED]->(l)
                SET r.timestamp = datetime($timestamp),
                    r.confidence = $confidence,
                    r.duration = $duration,
                    r.activity_type = $activity_type,
                    r.source_types = $source_types
                RETURN r
            `;
            
            const result = await session.run(query, {
                entityId,
                locationId,
                timestamp: visitData.timestamp,
                confidence: visitData.confidence || 1.0,
                duration: visitData.duration || null,
                activity_type: visitData.activity_type || 'access',
                source_types: visitData.source_types || []
            });
            
            return result.records[0]?.get('r').properties;
        } catch (error) {
            logger.error('Error creating visited relationship:', error);
            throw error;
        } finally {
            await session.close();
        }
    }

    async createAssociationRelationship(entityId1, entityId2, associationData) {
        const session = this.driver.session();
        
        try {
            const query = `
                MATCH (e1:Entity {id: $entityId1})
                MATCH (e2:Entity {id: $entityId2})
                MERGE (e1)-[r:ASSOCIATED_WITH]-(e2)
                SET r.strength = $strength,
                    r.last_seen_together = datetime($last_seen_together),
                    r.interaction_count = coalesce(r.interaction_count, 0) + 1,
                    r.relationship_type = $relationship_type,
                    r.confidence = $confidence
                RETURN r
            `;
            
            const result = await session.run(query, {
                entityId1,
                entityId2,
                strength: associationData.strength || 0.5,
                last_seen_together: associationData.last_seen_together,
                relationship_type: associationData.relationship_type || 'co_location',
                confidence: associationData.confidence || 0.8
            });
            
            return result.records[0]?.get('r').properties;
        } catch (error) {
            logger.error('Error creating association relationship:', error);
            throw error;
        } finally {
            await session.close();
        }
    }

    // Query operations
    async getEntityRelationships(entityId, relationshipType = null, limit = 50) {
        const session = this.driver.session();
        
        try {
            let query = `
                MATCH (e:Entity {id: $entityId})-[r]->(target)
                ${relationshipType ? 'WHERE type(r) = $relationshipType' : ''}
                RETURN e, r, target, type(r) as relationship_type
                ORDER BY r.timestamp DESC
                LIMIT $limit
            `;
            
            const result = await session.run(query, {
                entityId,
                relationshipType,
                limit: neo4j.int(limit)
            });
            
            return result.records.map(record => ({
                entity: record.get('e').properties,
                relationship: record.get('r').properties,
                target: record.get('target').properties,
                relationship_type: record.get('relationship_type')
            }));
        } catch (error) {
            logger.error('Error getting entity relationships:', error);
            throw error;
        } finally {
            await session.close();
        }
    }

    async getEntityTimeline(entityId, startDate, endDate, limit = 100) {
        const session = this.driver.session();
        
        try {
            const query = `
                MATCH (e:Entity {id: $entityId})-[r:VISITED]->(l:Location)
                WHERE r.timestamp >= datetime($startDate) AND r.timestamp <= datetime($endDate)
                RETURN e, r, l
                ORDER BY r.timestamp DESC
                LIMIT $limit
            `;
            
            const result = await session.run(query, {
                entityId,
                startDate: startDate.toISOString(),
                endDate: endDate.toISOString(),
                limit: neo4j.int(limit)
            });
            
            return result.records.map(record => ({
                entity: record.get('e').properties,
                visit: record.get('r').properties,
                location: record.get('l').properties
            }));
        } catch (error) {
            logger.error('Error getting entity timeline:', error);
            throw error;
        } finally {
            await session.close();
        }
    }

    async getLocationActivity(locationId, startDate, endDate) {
        const session = this.driver.session();
        
        try {
            const query = `
                MATCH (e:Entity)-[r:VISITED]->(l:Location {id: $locationId})
                WHERE r.timestamp >= datetime($startDate) AND r.timestamp <= datetime($endDate)
                RETURN 
                    count(r) as visit_count,
                    count(DISTINCT e) as unique_visitors,
                    collect(DISTINCT e.type) as visitor_types,
                    avg(r.confidence) as avg_confidence,
                    min(r.timestamp) as first_visit,
                    max(r.timestamp) as last_visit
            `;
            
            const result = await session.run(query, {
                locationId,
                startDate: startDate.toISOString(),
                endDate: endDate.toISOString()
            });
            
            const record = result.records[0];
            return {
                visit_count: record.get('visit_count').toNumber(),
                unique_visitors: record.get('unique_visitors').toNumber(),
                visitor_types: record.get('visitor_types'),
                avg_confidence: record.get('avg_confidence'),
                first_visit: record.get('first_visit'),
                last_visit: record.get('last_visit')
            };
        } catch (error) {
            logger.error('Error getting location activity:', error);
            throw error;
        } finally {
            await session.close();
        }
    }

    // Community detection and clustering
    async detectCommunities(algorithm = 'louvain', minCommunitySize = 3) {
        const session = this.driver.session();
        
        try {
            // First, project the graph
            const projectQuery = `
                CALL gds.graph.project(
                    'entityGraph',
                    'Entity',
                    {
                        ASSOCIATED_WITH: {
                            orientation: 'UNDIRECTED',
                            properties: 'strength'
                        }
                    }
                )
            `;
            
            try {
                await session.run(projectQuery);
            } catch (error) {
                // Graph might already exist, drop and recreate
                if (error.message.includes('already exists')) {
                    await session.run('CALL gds.graph.drop("entityGraph")');
                    await session.run(projectQuery);
                } else {
                    throw error;
                }
            }
            
            // Run community detection
            let communityQuery;
            switch (algorithm) {
                case 'louvain':
                    communityQuery = `
                        CALL gds.louvain.stream('entityGraph', {
                            relationshipWeightProperty: 'strength'
                        })
                        YIELD nodeId, communityId
                        RETURN gds.util.asNode(nodeId).id as entityId, 
                               gds.util.asNode(nodeId).name as entityName,
                               communityId
                        ORDER BY communityId, entityId
                    `;
                    break;
                case 'leiden':
                    communityQuery = `
                        CALL gds.leiden.stream('entityGraph', {
                            relationshipWeightProperty: 'strength'
                        })
                        YIELD nodeId, communityId
                        RETURN gds.util.asNode(nodeId).id as entityId, 
                               gds.util.asNode(nodeId).name as entityName,
                               communityId
                        ORDER BY communityId, entityId
                    `;
                    break;
                default:
                    throw new Error(`Unsupported algorithm: ${algorithm}`);
            }
            
            const result = await session.run(communityQuery);
            
            // Group results by community
            const communities = {};
            result.records.forEach(record => {
                const communityId = record.get('communityId').toNumber();
                const entityId = record.get('entityId');
                const entityName = record.get('entityName');
                
                if (!communities[communityId]) {
                    communities[communityId] = [];
                }
                
                communities[communityId].push({
                    entityId,
                    entityName
                });
            });
            
            // Filter by minimum community size
            const filteredCommunities = Object.entries(communities)
                .filter(([_, members]) => members.length >= minCommunitySize)
                .map(([communityId, members]) => ({
                    communityId: parseInt(communityId),
                    size: members.length,
                    members
                }));
            
            // Clean up the projected graph
            await session.run('CALL gds.graph.drop("entityGraph")');
            
            return filteredCommunities;
        } catch (error) {
            logger.error('Error detecting communities:', error);
            throw error;
        } finally {
            await session.close();
        }
    }

    async findSimilarEntities(entityId, similarityThreshold = 0.7, limit = 10) {
        const session = this.driver.session();
        
        try {
            const query = `
                MATCH (e1:Entity {id: $entityId})-[r1:VISITED]->(l:Location)<-[r2:VISITED]-(e2:Entity)
                WHERE e1 <> e2
                WITH e1, e2, 
                     count(l) as common_locations,
                     collect(DISTINCT l.building) as common_buildings
                WHERE common_locations >= 3
                
                OPTIONAL MATCH (e1)-[assoc:ASSOCIATED_WITH]-(e2)
                
                WITH e1, e2, common_locations, common_buildings, assoc,
                     (common_locations * 1.0) / 
                     ((size((e1)-[:VISITED]->()) + size((e2)-[:VISITED]->()) - common_locations)) as jaccard_similarity
                
                WHERE jaccard_similarity >= $similarityThreshold
                
                RETURN e2.id as similar_entity_id,
                       e2.name as similar_entity_name,
                       e2.type as similar_entity_type,
                       jaccard_similarity,
                       common_locations,
                       common_buildings,
                       coalesce(assoc.strength, 0) as association_strength
                ORDER BY jaccard_similarity DESC, association_strength DESC
                LIMIT $limit
            `;
            
            const result = await session.run(query, {
                entityId,
                similarityThreshold,
                limit: neo4j.int(limit)
            });
            
            return result.records.map(record => ({
                entity_id: record.get('similar_entity_id'),
                entity_name: record.get('similar_entity_name'),
                entity_type: record.get('similar_entity_type'),
                jaccard_similarity: record.get('jaccard_similarity'),
                common_locations: record.get('common_locations').toNumber(),
                common_buildings: record.get('common_buildings'),
                association_strength: record.get('association_strength')
            }));
        } catch (error) {
            logger.error('Error finding similar entities:', error);
            throw error;
        } finally {
            await session.close();
        }
    }

    // Anomaly detection queries
    async detectLocationAnomalies(entityId, timeWindow = '7 days') {
        const session = this.driver.session();
        
        try {
            const query = `
                MATCH (e:Entity {id: $entityId})-[r:VISITED]->(l:Location)
                WHERE r.timestamp >= datetime() - duration($timeWindow)
                
                WITH e, l, count(r) as visit_count, 
                     collect(r.timestamp) as visit_times
                
                // Calculate historical frequency for this location
                MATCH (e)-[hist:VISITED]->(l)
                WHERE hist.timestamp < datetime() - duration($timeWindow)
                WITH e, l, visit_count, visit_times,
                     count(hist) as historical_count,
                     duration.between(
                         min(hist.timestamp), 
                         max(hist.timestamp)
                     ).days as historical_days
                
                WITH e, l, visit_count, visit_times,
                     CASE WHEN historical_days > 0 
                          THEN (historical_count * 1.0) / historical_days * 7
                          ELSE 0 END as expected_weekly_visits
                
                WHERE visit_count > expected_weekly_visits * 2 OR 
                      (expected_weekly_visits > 0 AND visit_count = 0)
                
                RETURN l.id as location_id,
                       l.building as building,
                       l.room as room,
                       visit_count,
                       expected_weekly_visits,
                       CASE WHEN visit_count > expected_weekly_visits * 2 
                            THEN 'unusual_increase'
                            ELSE 'unusual_absence' END as anomaly_type,
                       visit_times
                ORDER BY abs(visit_count - expected_weekly_visits) DESC
            `;
            
            const result = await session.run(query, {
                entityId,
                timeWindow
            });
            
            return result.records.map(record => ({
                location_id: record.get('location_id'),
                building: record.get('building'),
                room: record.get('room'),
                visit_count: record.get('visit_count').toNumber(),
                expected_weekly_visits: record.get('expected_weekly_visits'),
                anomaly_type: record.get('anomaly_type'),
                visit_times: record.get('visit_times')
            }));
        } catch (error) {
            logger.error('Error detecting location anomalies:', error);
            throw error;
        } finally {
            await session.close();
        }
    }

    // Utility methods
    async getGraphStats() {
        const session = this.driver.session();
        
        try {
            const query = `
                MATCH (e:Entity) 
                OPTIONAL MATCH (l:Location)
                OPTIONAL MATCH ()-[r:VISITED]->()
                OPTIONAL MATCH ()-[a:ASSOCIATED_WITH]-()
                
                RETURN 
                    count(DISTINCT e) as entity_count,
                    count(DISTINCT l) as location_count,
                    count(r) as visit_count,
                    count(a) as association_count
            `;
            
            const result = await session.run(query);
            const record = result.records[0];
            
            return {
                entity_count: record.get('entity_count').toNumber(),
                location_count: record.get('location_count').toNumber(),
                visit_count: record.get('visit_count').toNumber(),
                association_count: record.get('association_count').toNumber()
            };
        } catch (error) {
            logger.error('Error getting graph stats:', error);
            throw error;
        } finally {
            await session.close();
        }
    }

    async clearAllData() {
        const session = this.driver.session();
        
        try {
            await session.run('MATCH (n) DETACH DELETE n');
            logger.info('All Neo4j data cleared');
        } catch (error) {
            logger.error('Error clearing Neo4j data:', error);
            throw error;
        } finally {
            await session.close();
        }
    }
}

module.exports = Neo4jService;