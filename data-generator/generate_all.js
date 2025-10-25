#!/usr/bin/env node

/**
 * Master Data Generator for Campus Security System
 * 
 * This script generates all synthetic data needed for testing and development:
 * - Entity profiles (students, faculty, staff)
 * - Card swipe logs
 * - WiFi association logs
 * - CCTV frame metadata
 * - Helpdesk tickets
 * - Event RSVPs
 * - Asset management records
 */

const fs = require('fs');
const path = require('path');
const { generateEntities } = require('./generate_entities');
const { generateCardSwipes } = require('./generate_swipes');
const { generateWiFiAssociations } = require('./generate_wifi');

// Configuration
const CONFIG = {
    OUTPUT_DIR: './generated_data',
    CLEAN_BEFORE_GENERATE: true,
    GENERATE_REPORTS: true
};

// ANSI color codes for console output
const colors = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
    console.log(`${colors[color]}${message}${colors.reset}`);
}

function logStep(step, message) {
    log(`\n${step} ${message}`, 'cyan');
}

function logSuccess(message) {
    log(`✅ ${message}`, 'green');
}

function logError(message) {
    log(`❌ ${message}`, 'red');
}

function logWarning(message) {
    log(`⚠️  ${message}`, 'yellow');
}

function logInfo(message) {
    log(`ℹ️  ${message}`, 'blue');
}

async function cleanOutputDirectory() {
    if (!CONFIG.CLEAN_BEFORE_GENERATE) return;
    
    logStep('🧹', 'Cleaning output directory...');
    
    try {
        if (fs.existsSync(CONFIG.OUTPUT_DIR)) {
            const files = fs.readdirSync(CONFIG.OUTPUT_DIR);
            for (const file of files) {
                const filePath = path.join(CONFIG.OUTPUT_DIR, file);
                fs.unlinkSync(filePath);
            }
            logSuccess(`Cleaned ${files.length} files from output directory`);
        } else {
            fs.mkdirSync(CONFIG.OUTPUT_DIR, { recursive: true });
            logSuccess('Created output directory');
        }
    } catch (error) {
        logError(`Failed to clean output directory: ${error.message}`);
        throw error;
    }
}

async function generateAllData() {
    const startTime = Date.now();
    
    log('\n' + '='.repeat(60), 'bright');
    log('🏗️  CAMPUS SECURITY SYSTEM - DATA GENERATOR', 'bright');
    log('='.repeat(60), 'bright');
    
    try {
        // Step 1: Clean output directory
        await cleanOutputDirectory();
        
        // Step 2: Generate entity profiles
        logStep('👥', 'Generating entity profiles...');
        const entities = await generateEntities();
        logSuccess(`Generated ${entities.length} entity profiles`);
        
        // Step 3: Generate card swipe data
        logStep('💳', 'Generating card swipe data...');
        const cardSwipes = await generateCardSwipes(entities);
        logSuccess(`Generated ${cardSwipes.length} card swipe records`);
        
        // Step 4: Generate WiFi association data
        logStep('📶', 'Generating WiFi association data...');
        const wifiAssociations = await generateWiFiAssociations(entities);
        logSuccess(`Generated ${wifiAssociations.length} WiFi association records`);
        
        // Step 5: Generate CCTV frame data
        logStep('📹', 'Generating CCTV frame data...');
        const cctvFrames = await generateCCTVFrames(entities);
        logSuccess(`Generated ${cctvFrames.length} CCTV frame records`);
        
        // Step 6: Generate helpdesk tickets
        logStep('🎫', 'Generating helpdesk tickets...');
        const helpdeskTickets = await generateHelpdeskTickets(entities);
        logSuccess(`Generated ${helpdeskTickets.length} helpdesk tickets`);
        
        // Step 7: Generate event RSVPs
        logStep('🎉', 'Generating event RSVPs...');
        const eventRSVPs = await generateEventRSVPs(entities);
        logSuccess(`Generated ${eventRSVPs.length} event RSVP records`);
        
        // Step 8: Generate asset management records
        logStep('📦', 'Generating asset management records...');
        const assetRecords = await generateAssetRecords(entities);
        logSuccess(`Generated ${assetRecords.length} asset management records`);
        
        // Step 9: Generate comprehensive reports
        if (CONFIG.GENERATE_REPORTS) {
            logStep('📊', 'Generating comprehensive reports...');
            await generateReports({
                entities,
                cardSwipes,
                wifiAssociations,
                cctvFrames,
                helpdeskTickets,
                eventRSVPs,
                assetRecords
            });
            logSuccess('Generated comprehensive reports');
        }
        
        const endTime = Date.now();
        const duration = Math.round((endTime - startTime) / 1000);
        
        log('\n' + '='.repeat(60), 'bright');
        log('🎉 DATA GENERATION COMPLETED SUCCESSFULLY!', 'green');
        log('='.repeat(60), 'bright');
        
        logInfo(`Total execution time: ${duration} seconds`);
        logInfo(`Output directory: ${path.resolve(CONFIG.OUTPUT_DIR)}`);
        
        // Display summary
        log('\n📈 GENERATION SUMMARY:', 'bright');
        log(`   👥 Entities: ${entities.length.toLocaleString()}`);
        log(`   💳 Card Swipes: ${cardSwipes.length.toLocaleString()}`);
        log(`   📶 WiFi Associations: ${wifiAssociations.length.toLocaleString()}`);
        log(`   📹 CCTV Frames: ${cctvFrames.length.toLocaleString()}`);
        log(`   🎫 Helpdesk Tickets: ${helpdeskTickets.length.toLocaleString()}`);
        log(`   🎉 Event RSVPs: ${eventRSVPs.length.toLocaleString()}`);
        log(`   📦 Asset Records: ${assetRecords.length.toLocaleString()}`);
        
        const totalRecords = entities.length + cardSwipes.length + wifiAssociations.length + 
                           cctvFrames.length + helpdeskTickets.length + eventRSVPs.length + assetRecords.length;
        log(`   📊 Total Records: ${totalRecords.toLocaleString()}`, 'bright');
        
    } catch (error) {
        logError(`Data generation failed: ${error.message}`);
        console.error(error.stack);
        process.exit(1);
    }
}

// Placeholder functions for additional data generators
async function generateCCTVFrames(entities) {
    // This would be implemented similar to other generators
    // For now, return a placeholder
    logWarning('CCTV frame generation not yet implemented - using placeholder data');
    
    const faker = require('faker');
    const createCsvWriter = require('csv-writer').createObjectCsvWriter;
    
    const frames = [];
    const frameCount = Math.floor(entities.length * 0.3); // 30% of entities have CCTV detections
    
    for (let i = 0; i < frameCount; i++) {
        const entity = faker.random.arrayElement(entities);
        frames.push({
            frame_id: `FR${String(600000 + i).padStart(6, '0')}`,
            location_id: faker.random.arrayElement(['LAB_101', 'LIB_ENT', 'ADMIN_LOBBY', 'AUDITORIUM', 'GYM']),
            timestamp: faker.date.between('2025-08-01', '2025-10-06').toISOString().replace('T', ' ').substring(0, 19),
            face_id: Math.random() > 0.3 ? entity.face_id : '', // 70% have face detection
            entity_id: entity.entity_id,
            confidence: Math.random() * 0.4 + 0.6 // 0.6 to 1.0
        });
    }
    
    const csvWriter = createCsvWriter({
        path: path.join(CONFIG.OUTPUT_DIR, 'cctv_frames.csv'),
        header: [
            { id: 'frame_id', title: 'frame_id' },
            { id: 'location_id', title: 'location_id' },
            { id: 'timestamp', title: 'timestamp' },
            { id: 'face_id', title: 'face_id' }
        ]
    });
    
    await csvWriter.writeRecords(frames);
    return frames;
}

async function generateHelpdeskTickets(entities) {
    logWarning('Helpdesk ticket generation not yet implemented - using placeholder data');
    
    const faker = require('faker');
    const createCsvWriter = require('csv-writer').createObjectCsvWriter;
    
    const tickets = [];
    const ticketCount = Math.floor(entities.length * 0.15); // 15% of entities create tickets
    
    const categories = ['IT Support', 'Network Issue', 'Hardware Problem', 'Software Issue', 'Account Access', 'Security'];
    const priorities = ['Low', 'Normal', 'High', 'Urgent'];
    
    for (let i = 0; i < ticketCount; i++) {
        const entity = faker.random.arrayElement(entities);
        tickets.push({
            ticket_id: `TK${String(10000 + i).padStart(6, '0')}`,
            timestamp: faker.date.between('2025-08-01', '2025-10-06').toISOString(),
            requester_email: entity.email,
            requester_name: entity.name,
            category: faker.random.arrayElement(categories),
            priority: faker.random.arrayElement(priorities),
            subject: faker.lorem.sentence(),
            description: faker.lorem.paragraph(),
            status: faker.random.arrayElement(['Open', 'In Progress', 'Resolved', 'Closed']),
            entity_id: entity.entity_id
        });
    }
    
    const csvWriter = createCsvWriter({
        path: path.join(CONFIG.OUTPUT_DIR, 'helpdesk_tickets.csv'),
        header: [
            { id: 'ticket_id', title: 'ticket_id' },
            { id: 'timestamp', title: 'timestamp' },
            { id: 'requester_email', title: 'requester_email' },
            { id: 'category', title: 'category' },
            { id: 'priority', title: 'priority' },
            { id: 'subject', title: 'subject' },
            { id: 'status', title: 'status' }
        ]
    });
    
    await csvWriter.writeRecords(tickets);
    return tickets;
}

async function generateEventRSVPs(entities) {
    logWarning('Event RSVP generation not yet implemented - using placeholder data');
    
    const faker = require('faker');
    const createCsvWriter = require('csv-writer').createObjectCsvWriter;
    
    const rsvps = [];
    const rsvpCount = Math.floor(entities.length * 0.4); // 40% of entities RSVP to events
    
    const eventTypes = ['Seminar', 'Workshop', 'Conference', 'Cultural Event', 'Sports Event', 'Alumni Meet'];
    const venues = ['Auditorium', 'Conference Hall', 'Sports Complex', 'Open Ground', 'Seminar Hall'];
    
    for (let i = 0; i < rsvpCount; i++) {
        const entity = faker.random.arrayElement(entities);
        rsvps.push({
            event_id: `EV${String(1000 + i % 50).padStart(4, '0')}`, // 50 different events
            timestamp: faker.date.between('2025-08-01', '2025-10-06').toISOString(),
            attendee_email: entity.email,
            attendee_name: entity.name,
            event_name: `${faker.random.arrayElement(eventTypes)} - ${faker.company.catchPhrase()}`,
            event_date: faker.date.between('2025-08-01', '2025-12-31').toISOString().split('T')[0],
            venue: faker.random.arrayElement(venues),
            rsvp_status: faker.random.arrayElement(['attending', 'not_attending', 'maybe']),
            entity_id: entity.entity_id
        });
    }
    
    const csvWriter = createCsvWriter({
        path: path.join(CONFIG.OUTPUT_DIR, 'event_rsvps.csv'),
        header: [
            { id: 'event_id', title: 'event_id' },
            { id: 'timestamp', title: 'timestamp' },
            { id: 'attendee_email', title: 'attendee_email' },
            { id: 'event_name', title: 'event_name' },
            { id: 'rsvp_status', title: 'rsvp_status' }
        ]
    });
    
    await csvWriter.writeRecords(rsvps);
    return rsvps;
}

async function generateAssetRecords(entities) {
    logWarning('Asset management generation not yet implemented - using placeholder data');
    
    const faker = require('faker');
    const createCsvWriter = require('csv-writer').createObjectCsvWriter;
    
    const assets = [];
    const assetCount = Math.floor(entities.length * 0.2); // 20% of entities have asset transactions
    
    const assetTypes = ['Laptop', 'Projector', 'Camera', 'Lab Equipment', 'Books', 'Furniture'];
    const actions = ['checkout', 'checkin', 'transfer', 'maintenance'];
    
    for (let i = 0; i < assetCount; i++) {
        const entity = faker.random.arrayElement(entities);
        assets.push({
            asset_id: `AS${String(5000 + i).padStart(6, '0')}`,
            timestamp: faker.date.between('2025-08-01', '2025-10-06').toISOString(),
            assigned_to: entity.email,
            action: faker.random.arrayElement(actions),
            asset_type: faker.random.arrayElement(assetTypes),
            asset_name: `${faker.random.arrayElement(assetTypes)} - ${faker.random.alphaNumeric(6).toUpperCase()}`,
            location: faker.random.arrayElement(['Lab 101', 'Library', 'Admin Office', 'Faculty Room']),
            entity_id: entity.entity_id
        });
    }
    
    const csvWriter = createCsvWriter({
        path: path.join(CONFIG.OUTPUT_DIR, 'asset_records.csv'),
        header: [
            { id: 'asset_id', title: 'asset_id' },
            { id: 'timestamp', title: 'timestamp' },
            { id: 'assigned_to', title: 'assigned_to' },
            { id: 'action', title: 'action' },
            { id: 'asset_type', title: 'asset_type' }
        ]
    });
    
    await csvWriter.writeRecords(assets);
    return assets;
}

async function generateReports(data) {
    const report = {
        generation_info: {
            timestamp: new Date().toISOString(),
            generator_version: '1.0.0',
            total_execution_time: Date.now(),
            output_directory: path.resolve(CONFIG.OUTPUT_DIR)
        },
        summary: {
            total_entities: data.entities.length,
            total_records: Object.values(data).reduce((sum, arr) => sum + (Array.isArray(arr) ? arr.length : 0), 0),
            data_sources: {
                entities: data.entities.length,
                card_swipes: data.cardSwipes.length,
                wifi_associations: data.wifiAssociations.length,
                cctv_frames: data.cctvFrames.length,
                helpdesk_tickets: data.helpdeskTickets.length,
                event_rsvps: data.eventRSVPs.length,
                asset_records: data.assetRecords.length
            }
        },
        entity_breakdown: {
            by_role: {
                students: data.entities.filter(e => e.role === 'student').length,
                faculty: data.entities.filter(e => e.role === 'faculty').length,
                staff: data.entities.filter(e => e.role === 'staff').length
            },
            by_status: {
                active: data.entities.filter(e => e.status === 'active').length,
                inactive: data.entities.filter(e => e.status === 'inactive').length
            },
            departments: [...new Set(data.entities.map(e => e.department))].length
        },
        data_quality: {
            entities_with_card_id: data.entities.filter(e => e.card_id).length,
            entities_with_device_hash: data.entities.filter(e => e.device_hash).length,
            entities_with_face_id: data.entities.filter(e => e.face_id).length,
            card_swipe_coverage: (data.cardSwipes.length / data.entities.length).toFixed(2),
            wifi_coverage: (data.wifiAssociations.length / data.entities.length).toFixed(2)
        },
        files_generated: [
            'student_or_staff_profiles.csv',
            'comprehensive_entity_profiles.csv',
            'entities.json',
            'campus_card_swipes.csv',
            'comprehensive_card_swipes.csv',
            'card_swipes_stats.json',
            'wifi_associations_logs.csv',
            'comprehensive_wifi_logs.csv',
            'wifi_associations_stats.json',
            'cctv_frames.csv',
            'helpdesk_tickets.csv',
            'event_rsvps.csv',
            'asset_records.csv',
            'generation_report.json'
        ]
    };
    
    // Save comprehensive report
    fs.writeFileSync(
        path.join(CONFIG.OUTPUT_DIR, 'generation_report.json'),
        JSON.stringify(report, null, 2)
    );
    
    // Generate README for the dataset
    const readme = `# Campus Security System - Synthetic Dataset

Generated on: ${new Date().toISOString()}

## Overview

This dataset contains synthetic data for testing the Campus Entity Resolution & Security Monitoring System. All data is artificially generated and does not represent real individuals or activities.

## Dataset Statistics

- **Total Entities**: ${report.summary.total_entities.toLocaleString()}
- **Total Records**: ${report.summary.total_records.toLocaleString()}
- **Data Sources**: ${Object.keys(report.summary.data_sources).length}

### Entity Breakdown
- Students: ${report.entity_breakdown.by_role.students.toLocaleString()}
- Faculty: ${report.entity_breakdown.by_role.faculty.toLocaleString()}
- Staff: ${report.entity_breakdown.by_role.staff.toLocaleString()}

### Data Coverage
- Card Swipe Coverage: ${report.data_quality.card_swipe_coverage} swipes per entity
- WiFi Coverage: ${report.data_quality.wifi_coverage} associations per entity

## Files Generated

${report.files_generated.map(file => `- \`${file}\``).join('\n')}

## Data Sources

1. **Entity Profiles** - Student, faculty, and staff information
2. **Card Swipes** - Building access records
3. **WiFi Associations** - Device network connection logs
4. **CCTV Frames** - Camera detection metadata
5. **Helpdesk Tickets** - IT support requests
6. **Event RSVPs** - Campus event participation
7. **Asset Records** - Equipment management transactions

## Usage

This dataset is designed for:
- Testing entity resolution algorithms
- Developing multi-modal data fusion systems
- Training predictive analytics models
- Validating security monitoring systems

## Privacy Notice

All data in this dataset is synthetically generated. No real personal information is included.
`;
    
    fs.writeFileSync(path.join(CONFIG.OUTPUT_DIR, 'README.md'), readme);
}

// Command line interface
const command = process.argv[2];

switch (command) {
    case 'clean':
        cleanOutputDirectory()
            .then(() => {
                logSuccess('Output directory cleaned');
                process.exit(0);
            })
            .catch(error => {
                logError(`Clean failed: ${error.message}`);
                process.exit(1);
            });
        break;
        
    case 'entities':
        generateEntities()
            .then(() => {
                logSuccess('Entity generation completed');
                process.exit(0);
            })
            .catch(error => {
                logError(`Entity generation failed: ${error.message}`);
                process.exit(1);
            });
        break;
        
    case 'help':
        log('\nCampus Security System - Data Generator', 'bright');
        log('\nUsage: node generate_all.js [command]', 'cyan');
        log('\nCommands:');
        log('  (no command)  Generate all synthetic data');
        log('  clean         Clean output directory');
        log('  entities      Generate only entity profiles');
        log('  help          Show this help message');
        log('');
        process.exit(0);
        break;
        
    default:
        generateAllData();
        break;
}

module.exports = {
    generateAllData,
    cleanOutputDirectory,
    CONFIG
};