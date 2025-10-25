#!/usr/bin/env node

/**
 * Neo4j Database Initialization Script
 * 
 * This script initializes the Neo4j database with:
 * - Schema constraints and indexes
 * - Sample data for testing
 * - Graph algorithms setup
 */

const neo4j = require('neo4j-driver');
const Neo4jService = require('../services/neo4jService');
require('dotenv').config();

// Configuration
const NEO4J_URI = process.env.NEO4J_URI || 'bolt://localhost:7687';
const NEO4J_USERNAME = process.env.NEO4J_USERNAME || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'password';

// Sample data for initialization
const SAMPLE_ENTITIES = [
    {
        id: 'E00001',
        name: 'John Smith',
        type: 'student',
        department: 'Computer Science',
        confidence: 0.95
    },
    {
        id: 'E00002',
        name: 'Jane Doe',
        type: 'faculty',
        department: 'Computer Science',
        confidence: 0.98
    },
    {
        id: 'E00003',
        name: 'Bob Johnson',
        type: 'staff',
        department: 'Administration',
        confidence: 0.92
    }
];

const SAMPLE_LOCATIONS = [
    {
        id: 'LOC_001',
        building: 'Academic Complex',
        room: '301',
        floor: '3',
        zone: 'academic',
        access_level: 'public',
        coordinates: { lat: 26.1882, lon: 91.6920 }
    },
    {
        id: 'LOC_002',
        building: 'Library',
        room: 'Reading Hall',
        floor: '2',
        zone: 'academic',
        access_level: 'public',
        coordinates: { lat: 26.1885, lon: 91.6925 }
    },
    {
        id: 'LOC_003',
        building: 'Admin Block',
        room: 'Server Room',
        floor: '1',
        zone: 'administrative',
        access_level: 'restricted',
        coordinates: { lat: 26.1880, lon: 91.6915 }
    },
    {
        id: 'LOC_004',
        building: 'Hostel A',
        room: '205',
        floor: '2',
        zone: 'residential',
        access_level: 'private',
        coordinates: { lat: 26.1890, lon: 91.6930 }
    }
];

const SAMPLE_VISITS = [
    {
        entityId: 'E00001',
        locationId: 'LOC_001',
        timestamp: new Date('2025-10-06T09:00:00Z'),
        confidence: 0.95,
        duration: 3600,
        activity_type: 'class',
        source_types: ['card_swipe', 'wifi_log']
    },
    {
        entityId: 'E00001',
        locationId: 'LOC_002',
        timestamp: new Date('2025-10-06T14:30:00Z'),
        confidence: 0.88,
        duration: 7200,
        activity_type: 'study',
        source_types: ['wifi_log', 'cctv_frame']
    },
    {
        entityId: 'E00002',
        locationId: 'LOC_001',
        timestamp: new Date('2025-10-06T09:00:00Z'),
        confidence: 0.98,
        duration: 3600,
        activity_type: 'teaching',
        source_types: ['card_swipe']
    },
    {
        entityId: 'E00003',
        locationId: 'LOC_003',
        timestamp: new Date('2025-10-06T10:15:00Z'),
        confidence: 0.92,
        duration: 1800,
        activity_type: 'maintenance',
        source_types: ['card_swipe', 'cctv_frame']
    }
];

const SAMPLE_ASSOCIATIONS = [
    {
        entityId1: 'E00001',
        entityId2: 'E00002',
        strength: 0.7,
        last_seen_together: new Date('2025-10-06T09:00:00Z'),
        relationship_type: 'student_teacher',
        confidence: 0.85
    }
];

async function initializeNeo4j() {
    let driver;
    
    try {
        console.log('🚀 Starting Neo4j initialization...');
        
        // Create driver
        driver = neo4j.driver(
            NEO4J_URI,
            neo4j.auth.basic(NEO4J_USERNAME, NEO4J_PASSWORD),
            {
                disableLosslessIntegers: true
            }
        );
        
        // Test connection
        const session = driver.session();
        try {
            await session.run('RETURN 1');
            console.log('✅ Neo4j connection successful');
        } catch (error) {
            console.error('❌ Neo4j connection failed:', error.message);
            process.exit(1);
        } finally {
            await session.close();
        }
        
        // Initialize service
        const neo4jService = new Neo4jService(driver);
        
        // Initialize schema
        console.log('📋 Initializing schema...');
        await neo4jService.initializeSchema();
        console.log('✅ Schema initialization completed');
        
        // Create sample entities
        console.log('👥 Creating sample entities...');
        for (const entity of SAMPLE_ENTITIES) {
            await neo4jService.createEntity(entity);
            console.log(`   Created entity: ${entity.name} (${entity.id})`);
        }
        
        // Create sample locations
        console.log('📍 Creating sample locations...');
        for (const location of SAMPLE_LOCATIONS) {
            await neo4jService.createLocation(location);
            console.log(`   Created location: ${location.building} - ${location.room} (${location.id})`);
        }
        
        // Create sample visits
        console.log('🚶 Creating sample visits...');
        for (const visit of SAMPLE_VISITS) {
            await neo4jService.createVisitedRelationship(
                visit.entityId,
                visit.locationId,
                visit
            );
            console.log(`   Created visit: ${visit.entityId} -> ${visit.locationId}`);
        }
        
        // Create sample associations
        console.log('🤝 Creating sample associations...');
        for (const association of SAMPLE_ASSOCIATIONS) {
            await neo4jService.createAssociationRelationship(
                association.entityId1,
                association.entityId2,
                association
            );
            console.log(`   Created association: ${association.entityId1} <-> ${association.entityId2}`);
        }
        
        // Get and display stats
        console.log('📊 Getting graph statistics...');
        const stats = await neo4jService.getGraphStats();
        console.log('   Graph Statistics:');
        console.log(`   - Entities: ${stats.entity_count}`);
        console.log(`   - Locations: ${stats.location_count}`);
        console.log(`   - Visits: ${stats.visit_count}`);
        console.log(`   - Associations: ${stats.association_count}`);
        
        console.log('🎉 Neo4j initialization completed successfully!');
        
    } catch (error) {
        console.error('💥 Neo4j initialization failed:', error);
        process.exit(1);
    } finally {
        if (driver) {
            await driver.close();
        }
    }
}

// Additional utility functions for testing
async function testQueries() {
    let driver;
    
    try {
        console.log('🧪 Running test queries...');
        
        driver = neo4j.driver(
            NEO4J_URI,
            neo4j.auth.basic(NEO4J_USERNAME, NEO4J_PASSWORD),
            {
                disableLosslessIntegers: true
            }
        );
        
        const neo4jService = new Neo4jService(driver);
        
        // Test entity relationships
        console.log('🔍 Testing entity relationships...');
        const relationships = await neo4jService.getEntityRelationships('E00001');
        console.log(`   Found ${relationships.length} relationships for E00001`);
        
        // Test timeline query
        console.log('📅 Testing timeline query...');
        const startDate = new Date('2025-10-06T00:00:00Z');
        const endDate = new Date('2025-10-06T23:59:59Z');
        const timeline = await neo4jService.getEntityTimeline('E00001', startDate, endDate);
        console.log(`   Found ${timeline.length} timeline entries for E00001`);
        
        // Test location activity
        console.log('🏢 Testing location activity...');
        const activity = await neo4jService.getLocationActivity('LOC_001', startDate, endDate);
        console.log(`   Location LOC_001 had ${activity.visit_count} visits by ${activity.unique_visitors} unique visitors`);
        
        // Test similarity detection
        console.log('🔄 Testing similarity detection...');
        const similar = await neo4jService.findSimilarEntities('E00001', 0.1, 5);
        console.log(`   Found ${similar.length} similar entities to E00001`);
        
        console.log('✅ All test queries completed successfully!');
        
    } catch (error) {
        console.error('❌ Test queries failed:', error);
    } finally {
        if (driver) {
            await driver.close();
        }
    }
}

async function clearDatabase() {
    let driver;
    
    try {
        console.log('🗑️  Clearing Neo4j database...');
        
        driver = neo4j.driver(
            NEO4J_URI,
            neo4j.auth.basic(NEO4J_USERNAME, NEO4J_PASSWORD),
            {
                disableLosslessIntegers: true
            }
        );
        
        const neo4jService = new Neo4jService(driver);
        await neo4jService.clearAllData();
        
        console.log('✅ Database cleared successfully!');
        
    } catch (error) {
        console.error('❌ Database clear failed:', error);
    } finally {
        if (driver) {
            await driver.close();
        }
    }
}

// Command line interface
const command = process.argv[2];

switch (command) {
    case 'init':
        initializeNeo4j();
        break;
    case 'test':
        testQueries();
        break;
    case 'clear':
        clearDatabase();
        break;
    case 'reset':
        clearDatabase().then(() => initializeNeo4j());
        break;
    default:
        console.log('Usage: node initNeo4j.js [init|test|clear|reset]');
        console.log('');
        console.log('Commands:');
        console.log('  init   - Initialize schema and sample data');
        console.log('  test   - Run test queries');
        console.log('  clear  - Clear all data');
        console.log('  reset  - Clear and reinitialize');
        process.exit(1);
}

module.exports = {
    initializeNeo4j,
    testQueries,
    clearDatabase
};