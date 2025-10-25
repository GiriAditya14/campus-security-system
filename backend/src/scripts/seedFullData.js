#!/usr/bin/env node

/**
 * Comprehensive Data Seeding Script - Real CSV Data
 * Seeds the database with real campus security data from CSV files
 */

const mongoose = require('mongoose');
const crypto = require('crypto');
const csv = require('fast-csv');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Import models
const Entity = require('../models/Entity');
const Event = require('../models/Event');
const Alert = require('../models/Alert');

// CSV file paths
const CSV_DATA_PATH = path.join(__dirname, '../data');

// Location mapping for building names
const LOCATION_MAPPING = {
    'LAB_101': { building: 'Computer Center', room: 'Lab 101', zone: 'academic', access_level: 'public' },
    'LAB_305': { building: 'Computer Center', room: 'Lab 305', zone: 'academic', access_level: 'public' },
    'LIB_ENT': { building: 'Library', room: 'Main Entrance', zone: 'academic', access_level: 'public' },
    'ADMIN_LOBBY': { building: 'Admin Block', room: 'Lobby', zone: 'administrative', access_level: 'restricted' },
    'AUDITORIUM': { building: 'Auditorium', room: 'Main Hall', zone: 'academic', access_level: 'public' },
    'GYM': { building: 'Sports Complex', room: 'Gymnasium', zone: 'recreational', access_level: 'public' },
    'SEM_01': { building: 'Main Academic Block', room: 'Seminar Room 1', zone: 'academic', access_level: 'public' },
    'ROOM_A2': { building: 'Main Academic Block', room: 'Room A2', zone: 'academic', access_level: 'public' }
};

// Access Point mapping for WiFi locations
const AP_MAPPING = {
    'AP_LIB_1': { building: 'Library', room: 'Reading Hall', zone: 'academic' },
    'AP_LIB_2': { building: 'Library', room: 'Reference Section', zone: 'academic' },
    'AP_LIB_3': { building: 'Library', room: 'Digital Library', zone: 'academic' },
    'AP_LIB_4': { building: 'Library', room: 'Study Room 1', zone: 'academic' },
    'AP_LIB_5': { building: 'Library', room: 'Study Room 2', zone: 'academic' },
    'AP_ENG_1': { building: 'Computer Center', room: 'Lab 1', zone: 'academic' },
    'AP_ENG_2': { building: 'Computer Center', room: 'Lab 2', zone: 'academic' },
    'AP_ENG_3': { building: 'Computer Center', room: 'Lab 3', zone: 'academic' },
    'AP_ENG_4': { building: 'Computer Center', room: 'Lab 4', zone: 'academic' },
    'AP_ENG_5': { building: 'Computer Center', room: 'Lab 5', zone: 'academic' },
    'AP_AUD_1': { building: 'Auditorium', room: 'Main Hall', zone: 'academic' },
    'AP_AUD_2': { building: 'Auditorium', room: 'Green Room', zone: 'academic' },
    'AP_AUD_3': { building: 'Auditorium', room: 'Control Room', zone: 'academic' },
    'AP_CAF_1': { building: 'Cafeteria', room: 'Main Hall', zone: 'recreational' },
    'AP_CAF_2': { building: 'Cafeteria', room: 'Seating Area 1', zone: 'recreational' },
    'AP_CAF_3': { building: 'Cafeteria', room: 'Seating Area 2', zone: 'recreational' },
    'AP_CAF_4': { building: 'Cafeteria', room: 'Counter Area', zone: 'recreational' },
    'AP_LAB_1': { building: 'Research Center', room: 'Lab A', zone: 'academic' },
    'AP_LAB_2': { building: 'Research Center', room: 'Lab B', zone: 'academic' },
    'AP_LAB_3': { building: 'Research Center', room: 'Lab C', zone: 'academic' },
    'AP_LAB_4': { building: 'Research Center', room: 'Conference Room', zone: 'academic' },
    'AP_LAB_5': { building: 'Research Center', room: 'Equipment Room', zone: 'academic' }
};

// Utility functions
function randomChoice(array) {
    return array[Math.floor(Math.random() * array.length)];
}

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomFloat(min, max) {
    return Math.random() * (max - min) + min;
}

function parseDate(dateString) {
    // Handle various date formats from CSV
    if (dateString.includes('/')) {
        // Format: 9/16/2025 19:22 or similar
        return new Date(dateString);
    } else if (dateString.includes('-')) {
        // Format: 2025-09-13 14:02:40 or similar
        return new Date(dateString);
    }
    return new Date(dateString);
}

function getCoordinates(building) {
    // Simulate campus coordinates (around IIT campus coordinates)
    const baseCoords = {
        'Main Academic Block': { lat: 26.5123, lon: 80.2329 },
        'Computer Center': { lat: 26.5125, lon: 80.2331 },
        'Library': { lat: 26.5121, lon: 80.2327 },
        'Admin Block': { lat: 26.5127, lon: 80.2325 },
        'Auditorium': { lat: 26.5125, lon: 80.2335 },
        'Sports Complex': { lat: 26.5110, lon: 80.2350 },
        'Cafeteria': { lat: 26.5120, lon: 80.2330 },
        'Research Center': { lat: 26.5128, lon: 80.2338 },
        'Workshop': { lat: 26.5112, lon: 80.2322 },
        'Server Room': { lat: 26.5126, lon: 80.2332 },
        'Medical Center': { lat: 26.5118, lon: 80.2326 },
        'Guest House': { lat: 26.5132, lon: 80.2318 },
        'Security Office': { lat: 26.5124, lon: 80.2324 },
        'Parking Area': { lat: 26.5114, lon: 80.2346 }
    };
    
    const base = baseCoords[building] || { lat: 26.5120, lon: 80.2330 };
    return {
        lat: base.lat + randomFloat(-0.0005, 0.0005),
        lon: base.lon + randomFloat(-0.0005, 0.0005)
    };
}

// CSV Reading Helper Function
function readCSV(filePath) {
    return new Promise((resolve, reject) => {
        const results = [];
        fs.createReadStream(filePath)
            .pipe(csv.parse({ headers: true, trim: true }))
            .on('error', reject)
            .on('data', row => results.push(row))
            .on('end', () => resolve(results));
    });
}

async function seedEntities() {
    console.log('🧑‍🎓 Loading entities from CSV...');
    
    try {
        // Read student/staff profiles CSV
        const profilesPath = path.join(CSV_DATA_PATH, 'student or staff profiles.csv');
        const profilesData = await readCSV(profilesPath);
        
        console.log(`📄 Found ${profilesData.length} profiles in CSV`);
        
        const entities = [];
        
        for (const row of profilesData) {
            // Extract name parts
            const fullName = row.name || '';
            const nameParts = fullName.split(' ');
            const firstName = nameParts[0] || 'Unknown';
            const lastName = nameParts.slice(1).join(' ') || 'User';
            
            // Generate additional fields based on role
            const isStudent = row.role === 'student';
            const isStaff = row.role === 'staff';
            
            // Map departments from CSV abbreviations to full names
            const departmentMapping = {
                'CIVIL': 'Civil Engineering',
                'MECH': 'Mechanical Engineering',
                'ECE': 'Electrical Engineering',
                'CSE': 'Computer Science',
                'Physics': 'Physics',
                'BIO': 'Biology',
                'Admin': 'Administration'
            };
            
            const department = departmentMapping[row.department] || row.department || 'General';
            
            const entity = {
                _id: row.entity_id,
                identifiers: {
                    email: row.email,
                    card_id: row.card_id,
                    device_hashes: row.device_hash ? [row.device_hash] : [],
                    face_id: row.face_id || null
                },
                profile: {
                    name: fullName,
                    first_name: firstName,
                    last_name: lastName,
                    entity_type: row.role,
                    department: department
                },
                metadata: {
                    confidence: randomFloat(0.85, 0.98),
                    source_records: [`csv_import_${row.entity_id}`],
                    status: 'active',
                    tags: [row.role]
                }
            };
            
            // Add student-specific fields
            if (isStudent && row.student_id) {
                entity.identifiers.student_id = row.student_id;
                entity.profile.year = randomInt(1, 4);
                entity.profile.hostel = randomChoice(['Hostel A', 'Hostel B', 'Hostel C']);
                entity.profile.room_number = `${randomChoice(['1', '2', '3'])}${String(randomInt(1, 50)).padStart(2, '0')}`;
                entity.metadata.tags.push('undergraduate');
            }
            
            // Add staff-specific fields
            if (isStaff && row.staff_id) {
                entity.identifiers.employee_id = row.staff_id;
                entity.profile.role = randomChoice(['Administrator', 'Technician', 'Security Guard', 'Maintenance', 'Librarian', 'Accountant']);
                entity.profile.office_location = `${department} Office, Ground Floor`;
                entity.metadata.tags.push('support');
            }
            
            // Add common additional fields
            entity.profile.date_of_birth = new Date(1990 + randomInt(0, 15), randomInt(0, 11), randomInt(1, 28));
            entity.profile.gender = randomChoice(['Male', 'Female']);
            entity.metadata.joining_date = new Date(2020 + randomInt(0, 5), randomInt(0, 11), randomInt(1, 28));
            
            entities.push(entity);
        }
        
        // Clear existing entities
        await Entity.deleteMany({});
        console.log('🧹 Cleared existing entities');
        
        // Insert entities in batches
        const batchSize = 100;
        for (let i = 0; i < entities.length; i += batchSize) {
            const batch = entities.slice(i, i + batchSize);
            await Entity.insertMany(batch);
            process.stdout.write(`\r✅ Inserted entities: ${Math.min(i + batchSize, entities.length)}/${entities.length}`);
        }
        
        console.log(`\n🎉 Created ${entities.length} entities`);
        console.log(`   ├── Students: ${entities.filter(e => e.profile.entity_type === 'student').length}`);
        console.log(`   └── Staff: ${entities.filter(e => e.profile.entity_type === 'staff').length}`);
        
        return entities;
        
    } catch (error) {
        console.error('❌ Error loading entities from CSV:', error);
        throw error;
    }
}

async function seedEvents(entities) {
    console.log('📊 Loading events from CSV files...');
    
    try {
        const events = [];
        let eventCounter = 0;
        
        // Create entity lookup for faster access
        const entityLookup = {};
        entities.forEach(entity => {
            entityLookup[entity.identifiers.card_id] = entity._id;
            if (entity.identifiers.device_hashes) {
                entity.identifiers.device_hashes.forEach(hash => {
                    entityLookup[hash] = entity._id;
                });
            }
        });
        
        // 1. Load Card Swipe Events
        console.log('📋 Loading card swipe events...');
        const cardSwipesPath = path.join(CSV_DATA_PATH, 'campus card_swipes.csv');
        const cardSwipes = await readCSV(cardSwipesPath);
        
        for (const swipe of cardSwipes) {
            const entityId = entityLookup[swipe.card_id];
            if (!entityId) continue;
            
            const locationInfo = LOCATION_MAPPING[swipe.location_id] || {
                building: 'Unknown Building',
                room: swipe.location_id,
                zone: 'academic',
                access_level: 'public'
            };
            
            const timestamp = parseDate(swipe.timestamp);
            const confidence = randomFloat(0.85, 0.98);
            
            const event = {
                _id: `event_${++eventCounter}`,
                entity_id: entityId,
                timestamp: timestamp,
                activity_type: 'access',
                activity_subtype: 'card_swipe',
                location: {
                    building: locationInfo.building,
                    room: locationInfo.room,
                    floor: randomChoice(['Ground Floor', 'First Floor', 'Second Floor']),
                    coordinates: getCoordinates(locationInfo.building),
                    zone: locationInfo.zone,
                    access_level: locationInfo.access_level
                },
                sources: [{
                    type: 'card_swipe',
                    id: `swipe_${swipe.card_id}_${eventCounter}`,
                    confidence: confidence,
                    raw_data: {
                        card_id: swipe.card_id,
                        location_id: swipe.location_id,
                        reader_id: `reader_${swipe.location_id}`
                    }
                }],
                fused_confidence: confidence,
                provenance: {
                    fusion_algorithm: 'dempster_shafer',
                    processing_time: `${randomInt(5, 50)}ms`,
                    conflicts_resolved: 0,
                    data_lineage: [{
                        source_id: 'card_reader_system',
                        transformation: 'csv_import',
                        timestamp: timestamp
                    }],
                    quality_metrics: {
                        completeness: 1.0,
                        accuracy: confidence,
                        consistency: randomFloat(0.9, 1.0),
                        timeliness: randomFloat(0.95, 1.0)
                    }
                },
                duration: randomInt(60, 300), // 1-5 minutes
                tags: ['access', 'card_swipe'],
                anomaly_score: randomFloat(0, 0.2),
                risk_level: 'low'
            };
            
            events.push(event);
        }
        
        // 2. Load WiFi Association Events
        console.log('📶 Loading WiFi association events...');
        const wifiLogsPath = path.join(CSV_DATA_PATH, 'wifi_associations_logs.csv');
        const wifiLogs = await readCSV(wifiLogsPath);
        
        for (const wifi of wifiLogs) {
            const entityId = entityLookup[wifi.device_hash];
            if (!entityId) continue;
            
            const apInfo = AP_MAPPING[wifi.ap_id] || {
                building: 'Campus WiFi',
                room: wifi.ap_id,
                zone: 'academic'
            };
            
            const timestamp = parseDate(wifi.timestamp);
            const confidence = randomFloat(0.75, 0.92);
            
            const event = {
                _id: `event_${++eventCounter}`,
                entity_id: entityId,
                timestamp: timestamp,
                activity_type: 'connectivity',
                activity_subtype: 'wifi_connect',
                location: {
                    building: apInfo.building,
                    room: apInfo.room,
                    floor: randomChoice(['Ground Floor', 'First Floor', 'Second Floor']),
                    coordinates: getCoordinates(apInfo.building),
                    zone: apInfo.zone,
                    access_level: 'public'
                },
                sources: [{
                    type: 'wifi_log',
                    id: `wifi_${wifi.device_hash}_${eventCounter}`,
                    confidence: confidence,
                    raw_data: {
                        device_hash: wifi.device_hash,
                        ap_id: wifi.ap_id,
                        signal_strength: randomInt(-80, -30)
                    }
                }],
                fused_confidence: confidence,
                provenance: {
                    fusion_algorithm: 'dempster_shafer',
                    processing_time: `${randomInt(10, 80)}ms`,
                    conflicts_resolved: 0,
                    data_lineage: [{
                        source_id: 'wifi_infrastructure',
                        transformation: 'csv_import',
                        timestamp: timestamp
                    }],
                    quality_metrics: {
                        completeness: randomFloat(0.85, 1.0),
                        accuracy: confidence,
                        consistency: randomFloat(0.8, 0.95),
                        timeliness: randomFloat(0.9, 1.0)
                    }
                },
                duration: randomInt(300, 7200), // 5 minutes to 2 hours
                tags: ['connectivity', 'wifi'],
                anomaly_score: randomFloat(0, 0.25),
                risk_level: 'low'
            };
            
            events.push(event);
        }
        
        // 3. Load CCTV Frame Events (facial recognition)
        console.log('📹 Loading CCTV frame events...');
        const cctvFramesPath = path.join(CSV_DATA_PATH, 'cctv_frames.csv');
        const cctvFrames = await readCSV(cctvFramesPath);
        
        for (const frame of cctvFrames) {
            // Only process frames with face detection
            if (!frame.face_id) continue;
            
            // Find entity by face_id
            const entity = entities.find(e => e.identifiers.face_id === frame.face_id);
            if (!entity) continue;
            
            const locationInfo = LOCATION_MAPPING[frame.location_id] || {
                building: 'Unknown Building',
                room: frame.location_id,
                zone: 'academic',
                access_level: 'public'
            };
            
            const timestamp = parseDate(frame.timestamp);
            const confidence = randomFloat(0.65, 0.88); // Lower confidence for facial recognition
            
            const event = {
                _id: `event_${++eventCounter}`,
                entity_id: entity._id,
                timestamp: timestamp,
                activity_type: 'access',
                activity_subtype: 'facial_recognition',
                location: {
                    building: locationInfo.building,
                    room: locationInfo.room,
                    floor: randomChoice(['Ground Floor', 'First Floor', 'Second Floor']),
                    coordinates: getCoordinates(locationInfo.building),
                    zone: locationInfo.zone,
                    access_level: locationInfo.access_level
                },
                sources: [{
                    type: 'cctv_frame',
                    id: frame.frame_id,
                    confidence: confidence,
                    raw_data: {
                        frame_id: frame.frame_id,
                        face_id: frame.face_id,
                        location_id: frame.location_id,
                        camera_id: `cam_${frame.location_id}`
                    }
                }],
                fused_confidence: confidence,
                provenance: {
                    fusion_algorithm: 'bayesian_fusion',
                    processing_time: `${randomInt(50, 200)}ms`,
                    conflicts_resolved: 0,
                    data_lineage: [{
                        source_id: 'cctv_system',
                        transformation: 'face_detection_ml',
                        timestamp: timestamp
                    }],
                    quality_metrics: {
                        completeness: randomFloat(0.7, 0.9),
                        accuracy: confidence,
                        consistency: randomFloat(0.65, 0.85),
                        timeliness: randomFloat(0.8, 0.95)
                    }
                },
                duration: randomInt(30, 180), // 30 seconds to 3 minutes
                tags: ['detection', 'facial_recognition', 'cctv'],
                anomaly_score: randomFloat(0, 0.3),
                risk_level: 'low'
            };
            
            events.push(event);
        }
        
        // 4. Load Library Checkout Events
        console.log('📚 Loading library checkout events...');
        const libraryCheckoutsPath = path.join(CSV_DATA_PATH, 'library_checkouts.csv');
        const libraryCheckouts = await readCSV(libraryCheckoutsPath);
        
        for (const checkout of libraryCheckouts) {
            const timestamp = parseDate(checkout.timestamp);
            const confidence = randomFloat(0.95, 1.0);
            
            const event = {
                _id: `event_${++eventCounter}`,
                entity_id: checkout.entity_id,
                timestamp: timestamp,
                activity_type: 'transaction',
                activity_subtype: 'library_checkout',
                location: {
                    building: 'Library',
                    room: 'Circulation Desk',
                    floor: 'Ground Floor',
                    coordinates: getCoordinates('Library'),
                    zone: 'academic',
                    access_level: 'public'
                },
                sources: [{
                    type: 'asset',
                    id: checkout.checkout_id,
                    confidence: confidence,
                    raw_data: {
                        checkout_id: checkout.checkout_id,
                        book_id: checkout.book_id,
                        entity_id: checkout.entity_id
                    }
                }],
                fused_confidence: confidence,
                provenance: {
                    fusion_algorithm: 'weighted_average',
                    processing_time: `${randomInt(5, 30)}ms`,
                    conflicts_resolved: 0,
                    data_lineage: [{
                        source_id: 'library_management_system',
                        transformation: 'csv_import',
                        timestamp: timestamp
                    }],
                    quality_metrics: {
                        completeness: 1.0,
                        accuracy: confidence,
                        consistency: 1.0,
                        timeliness: randomFloat(0.95, 1.0)
                    }
                },
                duration: randomInt(120, 600), // 2-10 minutes
                tags: ['transaction', 'library'],
                anomaly_score: randomFloat(0, 0.1),
                risk_level: 'low'
            };
            
            events.push(event);
        }
        
        // 5. Load Lab Booking Events
        console.log('🔬 Loading lab booking events...');
        const labBookingsPath = path.join(CSV_DATA_PATH, 'lab_bookings.csv');
        const labBookings = await readCSV(labBookingsPath);
        
        for (const booking of labBookings) {
            const startTime = parseDate(booking.start_time);
            const endTime = parseDate(booking.end_time);
            const attended = booking['attended (YES/NO)'] === 'YES';
            
            const locationInfo = LOCATION_MAPPING[booking.room_id] || {
                building: 'Academic Block',
                room: booking.room_id,
                zone: 'academic',
                access_level: 'public'
            };
            
            const confidence = attended ? randomFloat(0.9, 1.0) : randomFloat(0.3, 0.6);
            
            const event = {
                _id: `event_${++eventCounter}`,
                entity_id: booking.entity_id,
                timestamp: startTime,
                activity_type: 'academic',
                activity_subtype: attended ? 'lab_session_attended' : 'lab_session_missed',
                location: {
                    building: locationInfo.building,
                    room: locationInfo.room,
                    floor: randomChoice(['Ground Floor', 'First Floor', 'Second Floor']),
                    coordinates: getCoordinates(locationInfo.building),
                    zone: locationInfo.zone,
                    access_level: locationInfo.access_level
                },
                sources: [{
                    type: 'rsvp',
                    id: booking.booking_id,
                    confidence: confidence,
                    raw_data: {
                        booking_id: booking.booking_id,
                        room_id: booking.room_id,
                        start_time: booking.start_time,
                        end_time: booking.end_time,
                        attended: attended
                    }
                }],
                fused_confidence: confidence,
                provenance: {
                    fusion_algorithm: 'majority_vote',
                    processing_time: `${randomInt(10, 60)}ms`,
                    conflicts_resolved: 0,
                    data_lineage: [{
                        source_id: 'lab_booking_system',
                        transformation: 'csv_import',
                        timestamp: startTime
                    }],
                    quality_metrics: {
                        completeness: 1.0,
                        accuracy: confidence,
                        consistency: randomFloat(0.9, 1.0),
                        timeliness: randomFloat(0.85, 1.0)
                    }
                },
                duration: Math.abs(endTime - startTime) / 1000, // Duration in seconds
                tags: ['academic', 'lab_booking', attended ? 'attended' : 'missed'],
                anomaly_score: attended ? randomFloat(0, 0.1) : randomFloat(0.4, 0.7),
                risk_level: attended ? 'low' : 'medium'
            };
            
            events.push(event);
        }
        
        // Clear existing events
        await Event.deleteMany({});
        console.log('🧹 Cleared existing events');
        
        // Insert events in batches
        const batchSize = 200;
        for (let i = 0; i < events.length; i += batchSize) {
            const batch = events.slice(i, i + batchSize);
            await Event.insertMany(batch);
            process.stdout.write(`\r✅ Inserted events: ${Math.min(i + batchSize, events.length)}/${events.length}`);
        }
        
        console.log(`\n🎉 Created ${events.length} events`);
        console.log(`   ├── Card Swipes: ${events.filter(e => e.activity_subtype === 'card_swipe').length}`);
        console.log(`   ├── WiFi Connections: ${events.filter(e => e.activity_subtype === 'wifi_connect').length}`);
        console.log(`   ├── CCTV Detections: ${events.filter(e => e.activity_subtype === 'facial_recognition').length}`);
        console.log(`   ├── Library Checkouts: ${events.filter(e => e.activity_subtype === 'library_checkout').length}`);
        console.log(`   └── Lab Sessions: ${events.filter(e => e.activity_subtype.includes('lab_session')).length}`);
        
        return events;
        
    } catch (error) {
        console.error('❌ Error loading events from CSV:', error);
        throw error;
    }
}

async function seedAlerts(entities, events) {
    console.log('🚨 Generating smart alerts from real data patterns...');
    
    try {
        const alerts = [];
        let alertCounter = 0;
        
        // Group events by entity for pattern analysis
        const eventsByEntity = {};
        events.forEach(event => {
            if (!eventsByEntity[event.entity_id]) {
                eventsByEntity[event.entity_id] = [];
            }
            eventsByEntity[event.entity_id].push(event);
        });
        
        // 1. Generate inactivity alerts based on real data gaps
        console.log('🔍 Analyzing inactivity patterns...');
        for (const entity of entities.slice(0, 20)) { // Sample 20 entities
            const entityEvents = eventsByEntity[entity._id] || [];
            if (entityEvents.length === 0) continue;
            
            // Sort events by timestamp
            entityEvents.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
            
            // Find large gaps (more than 24 hours)
            for (let i = 1; i < entityEvents.length; i++) {
                const timeDiff = new Date(entityEvents[i].timestamp) - new Date(entityEvents[i-1].timestamp);
                const hoursDiff = timeDiff / (1000 * 60 * 60);
                
                if (hoursDiff > 24 && Math.random() < 0.3) { // 30% chance to create alert
                    const alert = {
                        _id: `alert_${++alertCounter}`,
                        type: 'INACTIVITY',
                        severity: hoursDiff > 48 ? 'HIGH' : 'MEDIUM',
                        status: randomChoice(['active', 'acknowledged', 'resolved']),
                        title: 'Extended Inactivity Detected',
                        description: `${entity.profile.name} has been inactive for ${Math.floor(hoursDiff)} hours`,
                        rule: {
                            name: 'inactivity_detection',
                            condition: 'hours_since_last_seen > 24',
                            threshold: 24,
                            parameters: { 
                                hours: Math.floor(hoursDiff),
                                last_seen: entityEvents[i-1].timestamp,
                                next_seen: entityEvents[i].timestamp
                            }
                        },
                        context: {
                            entity_id: entity._id,
                            entity_name: entity.profile.name,
                            related_events: [{
                                event_id: entityEvents[i-1]._id,
                                timestamp: entityEvents[i-1].timestamp,
                                activity_type: entityEvents[i-1].activity_type
                            }]
                        },
                        actions: [{
                            type: 'email',
                            target: 'security_team',
                            status: 'sent',
                            attempted_at: new Date(entityEvents[i-1].timestamp),
                            completed_at: new Date(entityEvents[i-1].timestamp)
                        }],
                        triggered_at: new Date(entityEvents[i-1].timestamp.getTime() + (24 * 60 * 60 * 1000)),
                        auto_resolve: true,
                        metadata: {
                            confidence_score: randomFloat(0.8, 0.95),
                            false_positive_probability: randomFloat(0.1, 0.25)
                        }
                    };
                    
                    if (alert.status !== 'active') {
                        alert.acknowledged_at = new Date(alert.triggered_at.getTime() + randomInt(1, 12) * 60 * 60 * 1000);
                        alert.acknowledged_by = 'security_officer_001';
                    }
                    
                    if (alert.status === 'resolved') {
                        alert.resolved_at = new Date(entityEvents[i].timestamp);
                        alert.resolved_by = 'auto_system';
                        alert.resolution_notes = 'Entity activity resumed - normal pattern detected';
                    }
                    
                    alerts.push(alert);
                }
            }
        }
        
        // 2. Generate unusual location alerts for restricted areas
        console.log('🏢 Analyzing location access patterns...');
        const restrictedEvents = events.filter(e => 
            e.location.access_level === 'restricted' || 
            e.location.building === 'Admin Block'
        );
        
        for (const event of restrictedEvents.slice(0, 15)) {
            if (Math.random() < 0.4) { // 40% chance to create alert
                const entity = entities.find(e => e._id === event.entity_id);
                if (!entity) continue;
                
                const alert = {
                    _id: `alert_${++alertCounter}`,
                    type: 'UNUSUAL_LOCATION',
                    severity: entity.profile.entity_type === 'student' ? 'HIGH' : 'MEDIUM',
                    status: randomChoice(['active', 'acknowledged', 'resolved']),
                    title: 'Restricted Area Access',
                    description: `${entity.profile.name} (${entity.profile.entity_type}) accessed restricted area: ${event.location.building}`,
                    rule: {
                        name: 'restricted_area_detection',
                        condition: 'entity_in_restricted_area',
                        parameters: { 
                            access_level: 'restricted',
                            entity_type: entity.profile.entity_type,
                            building: event.location.building
                        }
                    },
                    context: {
                        entity_id: entity._id,
                        entity_name: entity.profile.name,
                        location: event.location,
                        related_events: [{
                            event_id: event._id,
                            timestamp: event.timestamp,
                            activity_type: event.activity_type
                        }]
                    },
                    actions: [{
                        type: 'dashboard',
                        target: 'security_dashboard',
                        status: 'sent',
                        attempted_at: event.timestamp,
                        completed_at: event.timestamp
                    }],
                    triggered_at: event.timestamp,
                    auto_resolve: false,
                    metadata: {
                        confidence_score: randomFloat(0.85, 0.98),
                        false_positive_probability: randomFloat(0.02, 0.15)
                    }
                };
                
                alerts.push(alert);
            }
        }
        
        // 3. Generate pattern anomaly alerts for missed lab sessions
        console.log('📊 Analyzing academic attendance patterns...');
        const missedSessions = events.filter(e => e.activity_subtype === 'lab_session_missed');
        
        for (const event of missedSessions.slice(0, 10)) {
            const entity = entities.find(e => e._id === event.entity_id);
            if (!entity || entity.profile.entity_type !== 'student') continue;
            
            const alert = {
                _id: `alert_${++alertCounter}`,
                type: 'PATTERN_ANOMALY',
                severity: 'MEDIUM',
                status: randomChoice(['active', 'acknowledged']),
                title: 'Academic Attendance Issue',
                description: `${entity.profile.name} missed scheduled lab session`,
                rule: {
                    name: 'attendance_monitoring',
                    condition: 'missed_scheduled_session',
                    parameters: { 
                        session_type: 'lab_session',
                        room: event.location.room,
                        scheduled_time: event.timestamp
                    }
                },
                context: {
                    entity_id: entity._id,
                    entity_name: entity.profile.name,
                    location: event.location,
                    related_events: [{
                        event_id: event._id,
                        timestamp: event.timestamp,
                        activity_type: event.activity_type
                    }]
                },
                actions: [{
                    type: 'email',
                    target: 'academic_coordinator',
                    status: 'sent',
                    attempted_at: event.timestamp,
                    completed_at: event.timestamp
                }],
                triggered_at: event.timestamp,
                auto_resolve: true,
                metadata: {
                    confidence_score: randomFloat(0.9, 0.98),
                    false_positive_probability: randomFloat(0.05, 0.15)
                }
            };
            
            alerts.push(alert);
        }
        
        // 4. Process free text notes for incident alerts
        console.log('📝 Processing free text incidents...');
        try {
            const freeTextNotesPath = path.join(CSV_DATA_PATH, 'free_text_notes.csv');
            const freeTextNotes = await readCSV(freeTextNotesPath);
            
            const incidentKeywords = ['broken', 'not working', 'maintenance', 'issue', 'problem', 'help', 'urgent'];
            
            for (const note of freeTextNotes.slice(0, 20)) {
                const hasIncidentKeyword = incidentKeywords.some(keyword => 
                    note.text.toLowerCase().includes(keyword)
                );
                
                if (hasIncidentKeyword && Math.random() < 0.6) {
                    const entity = entities.find(e => e._id === note.entity_id);
                    if (!entity) continue;
                    
                    const severity = note.text.toLowerCase().includes('urgent') ? 'HIGH' : 
                                   note.category === 'maintenance' ? 'MEDIUM' : 'LOW';
                    
                    const alert = {
                        _id: `alert_${++alertCounter}`,
                        type: 'SYSTEM_ERROR',
                        severity: severity,
                        status: randomChoice(['active', 'acknowledged', 'resolved']),
                        title: `Incident Report - ${note.category}`,
                        description: note.text,
                        rule: {
                            name: 'incident_text_analysis',
                            condition: 'incident_keywords_detected',
                            parameters: { 
                                category: note.category,
                                keywords_matched: incidentKeywords.filter(k => 
                                    note.text.toLowerCase().includes(k)
                                )
                            }
                        },
                        context: {
                            entity_id: entity._id,
                            entity_name: entity.profile.name,
                            note_details: {
                                note_id: note.note_id,
                                category: note.category,
                                text: note.text
                            }
                        },
                        actions: [{
                            type: 'webhook',
                            target: note.category === 'maintenance' ? 'maintenance_team' : 'helpdesk',
                            status: 'sent',
                            attempted_at: parseDate(note.timestamp),
                            completed_at: parseDate(note.timestamp)
                        }],
                        triggered_at: parseDate(note.timestamp),
                        auto_resolve: false,
                        metadata: {
                            confidence_score: randomFloat(0.7, 0.9),
                            false_positive_probability: randomFloat(0.1, 0.3)
                        }
                    };
                    
                    alerts.push(alert);
                }
            }
        } catch (error) {
            console.log('⚠️  Could not process free text notes:', error.message);
        }
        
        // 5. Generate system health alerts
        console.log('🖥️  Adding system monitoring alerts...');
        const currentTime = new Date();
        
        // System performance alert
        const systemAlert = {
            _id: `alert_${++alertCounter}`,
            type: 'SYSTEM_ERROR',
            severity: 'MEDIUM',
            status: 'active',
            title: 'Data Processing Performance',
            description: 'CSV data ingestion completed with high processing load',
            rule: {
                name: 'system_performance_monitoring',
                condition: 'processing_load > threshold',
                parameters: { 
                    records_processed: events.length,
                    processing_time: `${randomInt(5, 15)} minutes`,
                    memory_usage: `${randomInt(60, 85)}%`
                }
            },
            context: {
                system_stats: {
                    entities_processed: entities.length,
                    events_processed: events.length,
                    processing_start: new Date(currentTime.getTime() - 10 * 60 * 1000),
                    processing_end: currentTime
                }
            },
            actions: [{
                type: 'dashboard',
                target: 'system_dashboard',
                status: 'sent',
                attempted_at: currentTime,
                completed_at: currentTime
            }],
            triggered_at: currentTime,
            auto_resolve: true,
            metadata: {
                confidence_score: 1.0,
                false_positive_probability: 0.0
            }
        };
        
        alerts.push(systemAlert);
        
        // Clear existing alerts
        await Alert.deleteMany({});
        console.log('🧹 Cleared existing alerts');
        
        // Insert alerts
        if (alerts.length > 0) {
            await Alert.insertMany(alerts);
        }
        
        console.log(`🎉 Created ${alerts.length} alerts`);
        console.log(`   ├── Inactivity: ${alerts.filter(a => a.type === 'INACTIVITY').length}`);
        console.log(`   ├── Restricted Access: ${alerts.filter(a => a.type === 'UNUSUAL_LOCATION').length}`);
        console.log(`   ├── Pattern Anomalies: ${alerts.filter(a => a.type === 'PATTERN_ANOMALY').length}`);
        console.log(`   └── System Issues: ${alerts.filter(a => a.type === 'SYSTEM_ERROR').length}`);
        
        return alerts;
        
    } catch (error) {
        console.error('❌ Error generating alerts:', error);
        throw error;
    }
}

async function seedFullData() {
    try {
        console.log('🌱 Starting comprehensive data seeding with REAL CSV data...');
        console.log('� Reading from CSV files in:', CSV_DATA_PATH);
        
        // Connect to MongoDB
        const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/campus_security';
        await mongoose.connect(mongoUri, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
        });
        console.log('✅ Connected to MongoDB');
        
        // Seed data in order
        const entities = await seedEntities();
        const events = await seedEvents(entities);
        const alerts = await seedAlerts(entities, events);
        
        console.log('\n🎉 Real data seeding completed successfully!');
        console.log('\n📊 Summary:');
        console.log(`├── Entities: ${entities.length}`);
        console.log(`│   ├── Students: ${entities.filter(e => e.profile.entity_type === 'student').length}`);
        console.log(`│   └── Staff: ${entities.filter(e => e.profile.entity_type === 'staff').length}`);
        console.log(`├── Events: ${events.length}`);
        console.log(`│   ├── Card Swipes: ${events.filter(e => e.activity_subtype === 'card_swipe').length}`);
        console.log(`│   ├── WiFi Connections: ${events.filter(e => e.activity_subtype === 'wifi_connect').length}`);
        console.log(`│   ├── CCTV Detections: ${events.filter(e => e.activity_subtype === 'facial_recognition').length}`);
        console.log(`│   ├── Library Checkouts: ${events.filter(e => e.activity_subtype === 'library_checkout').length}`);
        console.log(`│   └── Lab Sessions: ${events.filter(e => e.activity_subtype.includes('lab_session')).length}`);
        console.log(`└── Alerts: ${alerts.length}`);
        console.log(`    ├── Active: ${alerts.filter(a => a.status === 'active').length}`);
        console.log(`    ├── Acknowledged: ${alerts.filter(a => a.status === 'acknowledged').length}`);
        console.log(`    └── Resolved: ${alerts.filter(a => a.status === 'resolved').length}`);
        
        console.log('\n🚀 Your campus security system is ready with REAL data!');
        console.log('📊 Data Sources Integrated:');
        console.log('   • Student/Staff Profiles ✓');
        console.log('   • Campus Card Swipes ✓');
        console.log('   • WiFi Association Logs ✓');
        console.log('   • CCTV Frame Analysis ✓');
        console.log('   • Library Checkouts ✓');
        console.log('   • Lab Bookings ✓');
        console.log('   • Free Text Incident Reports ✓');
        console.log('\n🎯 You can now explore:');
        console.log('   • Real entity tracking and profiles');
        console.log('   • Actual event timelines from your data');
        console.log('   • Smart alerts generated from patterns');
        console.log('   • Multi-source data fusion analytics');
        console.log('   • Live security monitoring dashboard');
        
    } catch (error) {
        console.error('❌ Error seeding data:', error);
        console.error('💡 Make sure all CSV files are present in:', CSV_DATA_PATH);
        process.exit(1);
    } finally {
        await mongoose.connection.close();
        console.log('📝 Database connection closed');
        process.exit(0);
    }
}

// Handle Ctrl+C
process.on('SIGINT', async () => {
    console.log('\n👋 Seeding interrupted');
    await mongoose.connection.close();
    process.exit(0);
});

// Run the seeding
seedFullData();