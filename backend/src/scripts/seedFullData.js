#!/usr/bin/env node

/**
 * Comprehensive Data Seeding Script
 * Seeds the database with realistic campus security data
 */

const mongoose = require('mongoose');
const crypto = require('crypto');
require('dotenv').config();

// Import models
const Entity = require('../models/Entity');
const Event = require('../models/Event');
const Alert = require('../models/Alert');

// Sample data arrays
const departments = [
    'Computer Science', 'Electrical Engineering', 'Mechanical Engineering', 
    'Civil Engineering', 'Mathematics', 'Physics', 'Chemistry', 'Biology',
    'Economics', 'Management', 'Architecture', 'Design', 'Administration',
    'Security', 'Maintenance', 'Library', 'Cafeteria', 'Sports'
];

const buildings = [
    'Main Academic Block', 'Computer Center', 'Library', 'Admin Block',
    'Hostel A', 'Hostel B', 'Hostel C', 'Faculty Quarters', 'Sports Complex',
    'Cafeteria', 'Auditorium', 'Research Center', 'Workshop', 'Server Room',
    'Medical Center', 'Guest House', 'Security Office', 'Parking Area'
];

const rooms = {
    'Main Academic Block': ['101', '102', '103', '201', '202', '203', '301', '302', '303'],
    'Computer Center': ['Lab1', 'Lab2', 'Lab3', 'Server Room', 'Faculty Room'],
    'Library': ['Reading Hall', 'Reference Section', 'Digital Library', 'Study Room 1', 'Study Room 2'],
    'Admin Block': ['Dean Office', 'Registrar', 'Accounts', 'HR', 'Reception'],
    'Hostel A': ['101', '102', '103', '201', '202', '203', 'Common Room', 'Mess'],
    'Hostel B': ['101', '102', '103', '201', '202', '203', 'Common Room', 'Mess'],
    'Hostel C': ['101', '102', '103', '201', '202', '203', 'Common Room', 'Mess'],
    'Faculty Quarters': ['FQ1', 'FQ2', 'FQ3', 'FQ4', 'FQ5'],
    'Sports Complex': ['Gym', 'Basketball Court', 'Tennis Court', 'Swimming Pool'],
    'Cafeteria': ['Main Hall', 'Kitchen', 'Storage'],
    'Auditorium': ['Main Hall', 'Green Room', 'Control Room'],
    'Research Center': ['Lab A', 'Lab B', 'Lab C', 'Conference Room'],
    'Workshop': ['Mechanical', 'Electrical', 'Civil', 'Storage'],
    'Server Room': ['Main Server', 'Backup Server', 'Network Room'],
    'Medical Center': ['OPD', 'Emergency', 'Pharmacy'],
    'Guest House': ['Room 1', 'Room 2', 'Room 3', 'Reception'],
    'Security Office': ['Main Office', 'Control Room', 'Storage'],
    'Parking Area': ['Faculty', 'Student', 'Visitor', 'Two Wheeler']
};

const firstNames = [
    'Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Sai', 'Reyansh', 'Ayaan',
    'Krishna', 'Ishaan', 'Shaurya', 'Atharv', 'Advik', 'Pranav', 'Rishabh',
    'Ananya', 'Diya', 'Priya', 'Kavya', 'Anika', 'Ira', 'Myra', 'Sara',
    'Zara', 'Kiara', 'Aadhya', 'Saanvi', 'Avni', 'Pari', 'Riya'
];

const lastNames = [
    'Sharma', 'Verma', 'Gupta', 'Singh', 'Kumar', 'Agarwal', 'Jain', 'Patel',
    'Shah', 'Mehta', 'Reddy', 'Nair', 'Iyer', 'Rao', 'Pillai', 'Menon',
    'Chopra', 'Malhotra', 'Kapoor', 'Bansal', 'Mittal', 'Joshi', 'Saxena'
];

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

function generateId(prefix, length = 8) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = prefix;
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function generateEmail(firstName, lastName, domain = 'campus.edu') {
    return `${firstName.toLowerCase()}.${lastName.toLowerCase()}@${domain}`;
}

function generatePhone() {
    return `+91-${randomInt(70000, 99999)}-${randomInt(10000, 99999)}`;
}

function getRandomDate(daysBack) {
    const now = new Date();
    const pastDate = new Date(now.getTime() - (daysBack * 24 * 60 * 60 * 1000));
    return new Date(pastDate.getTime() + Math.random() * (now.getTime() - pastDate.getTime()));
}

function getCoordinates(building) {
    // Simulate campus coordinates (around IIT campus coordinates)
    const baseCoords = {
        'Main Academic Block': { lat: 26.5123, lon: 80.2329 },
        'Computer Center': { lat: 26.5125, lon: 80.2331 },
        'Library': { lat: 26.5121, lon: 80.2327 },
        'Admin Block': { lat: 26.5127, lon: 80.2325 },
        'Hostel A': { lat: 26.5115, lon: 80.2340 },
        'Hostel B': { lat: 26.5117, lon: 80.2342 },
        'Hostel C': { lat: 26.5119, lon: 80.2344 },
        'Faculty Quarters': { lat: 26.5130, lon: 80.2320 },
        'Sports Complex': { lat: 26.5110, lon: 80.2350 },
        'Cafeteria': { lat: 26.5120, lon: 80.2330 },
        'Auditorium': { lat: 26.5125, lon: 80.2335 },
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

async function seedEntities() {
    console.log('🧑‍🎓 Seeding entities...');
    
    const entities = [];
    
    // Generate students (60%)
    for (let i = 0; i < 300; i++) {
        const firstName = randomChoice(firstNames);
        const lastName = randomChoice(lastNames);
        const studentId = `STU${String(i + 1).padStart(6, '0')}`;
        
        entities.push({
            _id: `entity_student_${i + 1}`,
            identifiers: {
                student_id: studentId,
                email: generateEmail(firstName, lastName),
                phone: generatePhone(),
                card_id: `CARD_${studentId}`,
                device_hashes: [
                    crypto.createHash('md5').update(`${firstName}_device1`).digest('hex'),
                    crypto.createHash('md5').update(`${firstName}_device2`).digest('hex')
                ]
            },
            profile: {
                name: `${firstName} ${lastName}`,
                first_name: firstName,
                last_name: lastName,
                entity_type: 'student',
                department: randomChoice(departments.slice(0, 12)), // Academic departments only
                year: randomInt(1, 4),
                date_of_birth: new Date(2000 + randomInt(0, 5), randomInt(0, 11), randomInt(1, 28)),
                gender: randomChoice(['Male', 'Female']),
                blood_group: randomChoice(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']),
                hostel: randomChoice(['Hostel A', 'Hostel B', 'Hostel C']),
                room_number: `${randomChoice(['1', '2', '3'])}${String(randomInt(1, 50)).padStart(2, '0')}`
            },
            metadata: {
                confidence: randomFloat(0.85, 1.0),
                source_records: [`admission_${studentId}`, `hostel_${studentId}`],
                status: randomChoice(['active', 'active', 'active', 'inactive']), // 75% active
                joining_date: getRandomDate(365 * 4), // Within last 4 years
                tags: ['student', randomChoice(['undergraduate', 'postgraduate'])]
            }
        });
    }
    
    // Generate faculty (25%)
    for (let i = 0; i < 125; i++) {
        const firstName = randomChoice(firstNames);
        const lastName = randomChoice(lastNames);
        const empId = `FAC${String(i + 1).padStart(4, '0')}`;
        
        entities.push({
            _id: `entity_faculty_${i + 1}`,
            identifiers: {
                employee_id: empId,
                email: generateEmail(firstName, lastName),
                phone: generatePhone(),
                card_id: `CARD_${empId}`,
                device_hashes: [
                    crypto.createHash('md5').update(`${firstName}_faculty_device`).digest('hex')
                ]
            },
            profile: {
                name: `Dr. ${firstName} ${lastName}`,
                first_name: firstName,
                last_name: lastName,
                entity_type: 'faculty',
                department: randomChoice(departments.slice(0, 12)),
                role: randomChoice(['Assistant Professor', 'Associate Professor', 'Professor', 'Head of Department']),
                date_of_birth: new Date(1970 + randomInt(0, 25), randomInt(0, 11), randomInt(1, 28)),
                gender: randomChoice(['Male', 'Female']),
                office_location: `${randomChoice(['Main Academic Block', 'Research Center'])}, ${randomChoice(['201', '202', '203', '301', '302'])}`
            },
            metadata: {
                confidence: randomFloat(0.90, 1.0),
                source_records: [`hr_${empId}`, `payroll_${empId}`],
                status: 'active',
                joining_date: getRandomDate(365 * 10), // Within last 10 years
                tags: ['faculty', 'academic']
            }
        });
    }
    
    // Generate staff (15%)
    for (let i = 0; i < 75; i++) {
        const firstName = randomChoice(firstNames);
        const lastName = randomChoice(lastNames);
        const empId = `STF${String(i + 1).padStart(4, '0')}`;
        
        entities.push({
            _id: `entity_staff_${i + 1}`,
            identifiers: {
                employee_id: empId,
                email: generateEmail(firstName, lastName),
                phone: generatePhone(),
                card_id: `CARD_${empId}`,
                device_hashes: [
                    crypto.createHash('md5').update(`${firstName}_staff_device`).digest('hex')
                ]
            },
            profile: {
                name: `${firstName} ${lastName}`,
                first_name: firstName,
                last_name: lastName,
                entity_type: 'staff',
                department: randomChoice(departments.slice(12)), // Non-academic departments
                role: randomChoice(['Administrator', 'Technician', 'Security Guard', 'Maintenance', 'Librarian', 'Accountant']),
                date_of_birth: new Date(1975 + randomInt(0, 20), randomInt(0, 11), randomInt(1, 28)),
                gender: randomChoice(['Male', 'Female']),
                office_location: `${randomChoice(buildings)}, ${randomChoice(['Ground Floor', 'First Floor'])}`
            },
            metadata: {
                confidence: randomFloat(0.88, 1.0),
                source_records: [`hr_${empId}`],
                status: 'active',
                joining_date: getRandomDate(365 * 8),
                tags: ['staff', 'support']
            }
        });
    }
    
    // Clear existing entities
    await Entity.deleteMany({});
    console.log('🧹 Cleared existing entities');
    
    // Insert entities in batches
    const batchSize = 50;
    for (let i = 0; i < entities.length; i += batchSize) {
        const batch = entities.slice(i, i + batchSize);
        await Entity.insertMany(batch);
        console.log(`✅ Inserted entities batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(entities.length / batchSize)}`);
    }
    
    console.log(`🎉 Created ${entities.length} entities`);
    return entities;
}

async function seedEvents(entities) {
    console.log('📊 Seeding events...');
    
    const events = [];
    const activityTypes = [
        { type: 'access', subtypes: ['entry', 'exit', 'denied'] },
        { type: 'connectivity', subtypes: ['wifi_connect', 'wifi_disconnect', 'network_access'] },
        { type: 'transaction', subtypes: ['payment', 'library_issue', 'library_return'] },
        { type: 'service', subtypes: ['helpdesk', 'maintenance_request', 'medical_visit'] },
        { type: 'social', subtypes: ['event_attendance', 'meeting', 'seminar'] },
        { type: 'academic', subtypes: ['class_attendance', 'exam', 'lab_session'] }
    ];
    
    // Generate events for the last 30 days
    const startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const endDate = new Date();
    
    let eventCounter = 0;
    
    for (const entity of entities) {
        // Generate 20-100 events per entity based on type
        const eventCount = entity.profile.entity_type === 'student' ? randomInt(50, 100) :
                          entity.profile.entity_type === 'faculty' ? randomInt(30, 60) :
                          randomInt(20, 40);
        
        for (let i = 0; i < eventCount; i++) {
            const activityGroup = randomChoice(activityTypes);
            const timestamp = getRandomDate(30);
            const building = randomChoice(buildings);
            const room = randomChoice(rooms[building] || ['']);
            
            // Generate realistic patterns
            const hour = timestamp.getHours();
            let confidence = randomFloat(0.7, 0.95);
            
            // Higher confidence during normal hours
            if (hour >= 8 && hour <= 18) {
                confidence = randomFloat(0.85, 0.98);
            }
            
            // Lower confidence for restricted areas
            if (['Server Room', 'Security Office', 'Admin Block'].includes(building)) {
                confidence = randomFloat(0.6, 0.85);
            }
            
            const event = {
                _id: `event_${++eventCounter}`,
                entity_id: entity._id,
                timestamp: timestamp,
                activity_type: activityGroup.type,
                activity_subtype: randomChoice(activityGroup.subtypes),
                location: {
                    building: building,
                    room: room,
                    floor: randomChoice(['Ground Floor', 'First Floor', 'Second Floor']),
                    coordinates: getCoordinates(building),
                    zone: building.includes('Hostel') ? 'residential' :
                          building.includes('Sports') ? 'recreational' :
                          building.includes('Admin') ? 'administrative' :
                          building === 'Server Room' ? 'restricted' : 'academic',
                    access_level: building === 'Server Room' || building === 'Security Office' ? 'restricted' :
                                 building.includes('Faculty') ? 'private' : 'public'
                },
                sources: [
                    {
                        type: randomChoice(['card_swipe', 'wifi_log', 'cctv_frame']),
                        id: `source_${eventCounter}_1`,
                        confidence: confidence,
                        raw_data: {
                            device_id: randomChoice(entity.identifiers.device_hashes || []),
                            signal_strength: randomInt(-80, -30),
                            duration: randomInt(300, 7200) // 5 minutes to 2 hours
                        }
                    }
                ],
                fused_confidence: confidence,
                provenance: {
                    fusion_algorithm: 'dempster_shafer',
                    processing_time: `${randomInt(10, 100)}ms`,
                    conflicts_resolved: 0,
                    data_lineage: [{
                        source_id: 'data_ingestion',
                        transformation: 'raw_to_structured',
                        timestamp: timestamp
                    }],
                    quality_metrics: {
                        completeness: randomFloat(0.8, 1.0),
                        accuracy: confidence,
                        consistency: randomFloat(0.85, 1.0),
                        timeliness: randomFloat(0.9, 1.0)
                    }
                },
                duration: randomInt(300, 3600), // 5 minutes to 1 hour
                tags: [entity.profile.entity_type, activityGroup.type],
                anomaly_score: randomFloat(0, 0.3), // Most events are normal
                risk_level: 'low'
            };
            
            // Add some anomalous events (5%)
            if (Math.random() < 0.05) {
                event.anomaly_score = randomFloat(0.6, 0.9);
                event.risk_level = event.anomaly_score > 0.8 ? 'high' : 'medium';
                event.tags.push('anomaly');
            }
            
            events.push(event);
        }
    }
    
    // Clear existing events
    await Event.deleteMany({});
    console.log('🧹 Cleared existing events');
    
    // Insert events in batches
    const batchSize = 100;
    for (let i = 0; i < events.length; i += batchSize) {
        const batch = events.slice(i, i + batchSize);
        await Event.insertMany(batch);
        console.log(`✅ Inserted events batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(events.length / batchSize)}`);
    }
    
    console.log(`🎉 Created ${events.length} events`);
    return events;
}

async function seedAlerts(entities, events) {
    console.log('🚨 Seeding alerts...');
    
    const alerts = [];
    let alertCounter = 0;
    
    // Create different types of alerts
    
    // 1. Inactivity alerts (30%)
    for (let i = 0; i < 15; i++) {
        const entity = randomChoice(entities);
        const hoursInactive = randomInt(13, 48);
        
        const alert = {
            _id: `alert_${++alertCounter}`,
            type: 'INACTIVITY',
            severity: hoursInactive > 24 ? 'HIGH' : 'MEDIUM',
            status: randomChoice(['active', 'acknowledged', 'resolved']),
            title: 'Entity Inactivity Detected',
            description: `${entity.profile.name} has not been observed for ${hoursInactive} hours`,
            rule: {
                name: 'inactivity_detection',
                condition: 'hours_since_last_seen > threshold',
                threshold: 12,
                parameters: { hours: hoursInactive }
            },
            context: {
                entity_id: entity._id,
                entity_name: entity.profile.name,
                location: {
                    building: randomChoice(buildings),
                    coordinates: getCoordinates(randomChoice(buildings))
                }
            },
            actions: [
                {
                    type: 'email',
                    target: 'security@campus.edu',
                    status: 'sent',
                    attempted_at: getRandomDate(2),
                    completed_at: getRandomDate(1)
                }
            ],
            triggered_at: getRandomDate(3),
            auto_resolve: true,
            metadata: {
                confidence_score: randomFloat(0.7, 0.9),
                false_positive_probability: randomFloat(0.1, 0.3)
            }
        };
        
        if (alert.status === 'acknowledged') {
            alert.acknowledged_at = getRandomDate(2);
            alert.acknowledged_by = 'security_officer_001';
        }
        
        if (alert.status === 'resolved') {
            alert.resolved_at = getRandomDate(1);
            alert.resolved_by = 'security_officer_001';
            alert.resolution_notes = 'Entity contacted and confirmed safe';
        }
        
        alerts.push(alert);
    }
    
    // 2. Unusual location alerts (25%)
    for (let i = 0; i < 12; i++) {
        const entity = randomChoice(entities);
        const restrictedBuilding = randomChoice(['Server Room', 'Security Office', 'Admin Block']);
        
        const alert = {
            _id: `alert_${++alertCounter}`,
            type: 'UNUSUAL_LOCATION',
            severity: 'HIGH',
            status: randomChoice(['active', 'acknowledged', 'resolved']),
            title: 'Unusual Location Access',
            description: `${entity.profile.name} detected in restricted area: ${restrictedBuilding}`,
            rule: {
                name: 'unusual_location_detection',
                condition: 'entity_in_restricted_area',
                parameters: { access_level: 'restricted' }
            },
            context: {
                entity_id: entity._id,
                entity_name: entity.profile.name,
                location: {
                    building: restrictedBuilding,
                    room: randomChoice(rooms[restrictedBuilding] || ['']),
                    coordinates: getCoordinates(restrictedBuilding)
                },
                related_events: [{
                    event_id: `event_${randomInt(1, 1000)}`,
                    timestamp: getRandomDate(1),
                    activity_type: 'access'
                }]
            },
            actions: [
                {
                    type: 'sms',
                    target: '+91-98765-43210',
                    status: 'sent',
                    attempted_at: getRandomDate(1),
                    completed_at: getRandomDate(1)
                }
            ],
            triggered_at: getRandomDate(2),
            auto_resolve: true,
            metadata: {
                confidence_score: randomFloat(0.8, 0.95),
                false_positive_probability: randomFloat(0.05, 0.2)
            }
        };
        
        alerts.push(alert);
    }
    
    // 3. Multiple presence alerts (20%)
    for (let i = 0; i < 10; i++) {
        const entity = randomChoice(entities);
        const locations = [randomChoice(buildings), randomChoice(buildings)];
        
        const alert = {
            _id: `alert_${++alertCounter}`,
            type: 'MULTIPLE_PRESENCE',
            severity: 'CRITICAL',
            status: randomChoice(['active', 'acknowledged']),
            title: 'Multiple Presence Detected',
            description: `${entity.profile.name} appears at multiple locations simultaneously`,
            rule: {
                name: 'multiple_presence_detection',
                condition: 'simultaneous_locations > 1',
                parameters: { locations: locations }
            },
            context: {
                entity_id: entity._id,
                entity_name: entity.profile.name,
                related_events: locations.map(loc => ({
                    event_id: `event_${randomInt(1, 1000)}`,
                    timestamp: getRandomDate(1),
                    activity_type: 'access'
                }))
            },
            actions: [
                {
                    type: 'webhook',
                    target: 'https://security.campus.edu/alerts',
                    status: 'sent',
                    attempted_at: getRandomDate(1),
                    completed_at: getRandomDate(1)
                }
            ],
            triggered_at: getRandomDate(1),
            auto_resolve: false,
            metadata: {
                confidence_score: randomFloat(0.85, 0.98),
                false_positive_probability: randomFloat(0.02, 0.15)
            }
        };
        
        alerts.push(alert);
    }
    
    // 4. Pattern anomaly alerts (15%)
    for (let i = 0; i < 8; i++) {
        const entity = randomChoice(entities);
        
        const alert = {
            _id: `alert_${++alertCounter}`,
            type: 'PATTERN_ANOMALY',
            severity: randomChoice(['MEDIUM', 'HIGH']),
            status: randomChoice(['active', 'acknowledged', 'resolved']),
            title: 'Behavioral Pattern Anomaly',
            description: `Unusual activity pattern detected for ${entity.profile.name}`,
            rule: {
                name: 'pattern_anomaly_detection',
                condition: 'deviation_from_normal_pattern > threshold',
                threshold: 0.7,
                parameters: { deviation_score: randomFloat(0.7, 0.9) }
            },
            context: {
                entity_id: entity._id,
                entity_name: entity.profile.name,
                historical_pattern: {
                    normal_locations: [randomChoice(buildings), randomChoice(buildings)],
                    normal_hours: '09:00-17:00',
                    deviation_detected: 'unusual_timing'
                }
            },
            actions: [
                {
                    type: 'dashboard',
                    target: 'security_dashboard',
                    status: 'sent',
                    attempted_at: getRandomDate(1),
                    completed_at: getRandomDate(1)
                }
            ],
            triggered_at: getRandomDate(2),
            auto_resolve: true,
            metadata: {
                confidence_score: randomFloat(0.6, 0.8),
                false_positive_probability: randomFloat(0.2, 0.4)
            }
        };
        
        alerts.push(alert);
    }
    
    // 5. Security breach alerts (5%)
    for (let i = 0; i < 3; i++) {
        const entity = randomChoice(entities);
        
        const alert = {
            _id: `alert_${++alertCounter}`,
            type: 'SECURITY_BREACH',
            severity: 'CRITICAL',
            status: randomChoice(['active', 'acknowledged']),
            title: 'Potential Security Breach',
            description: `Unauthorized access attempt detected`,
            rule: {
                name: 'security_breach_detection',
                condition: 'unauthorized_access_pattern',
                parameters: { 
                    failed_attempts: randomInt(3, 8),
                    time_window: '5_minutes'
                }
            },
            context: {
                entity_id: entity._id,
                entity_name: entity.profile.name,
                location: {
                    building: randomChoice(['Server Room', 'Security Office', 'Admin Block']),
                    coordinates: getCoordinates('Server Room')
                }
            },
            actions: [
                {
                    type: 'email',
                    target: 'admin@campus.edu',
                    status: 'sent',
                    attempted_at: getRandomDate(1),
                    completed_at: getRandomDate(1)
                },
                {
                    type: 'sms',
                    target: '+91-98765-43210',
                    status: 'sent',
                    attempted_at: getRandomDate(1),
                    completed_at: getRandomDate(1)
                }
            ],
            triggered_at: getRandomDate(1),
            escalation_level: 1,
            auto_resolve: false,
            metadata: {
                confidence_score: randomFloat(0.9, 0.99),
                false_positive_probability: randomFloat(0.01, 0.1)
            }
        };
        
        alerts.push(alert);
    }
    
    // 6. System error alerts (5%)
    for (let i = 0; i < 2; i++) {
        const alert = {
            _id: `alert_${++alertCounter}`,
            type: 'SYSTEM_ERROR',
            severity: randomChoice(['MEDIUM', 'HIGH']),
            status: randomChoice(['active', 'resolved']),
            title: 'System Processing Error',
            description: 'Error in data fusion processing pipeline',
            rule: {
                name: 'system_error_detection',
                condition: 'processing_error_rate > threshold',
                threshold: 0.05,
                parameters: { 
                    error_rate: randomFloat(0.05, 0.15),
                    component: randomChoice(['data_fusion', 'entity_resolution', 'prediction_engine'])
                }
            },
            context: {
                location: {
                    building: 'Server Room',
                    room: 'Main Server',
                    coordinates: getCoordinates('Server Room')
                }
            },
            actions: [
                {
                    type: 'log',
                    target: 'system_logs',
                    status: 'delivered',
                    attempted_at: getRandomDate(1),
                    completed_at: getRandomDate(1)
                }
            ],
            triggered_at: getRandomDate(1),
            auto_resolve: true,
            metadata: {
                confidence_score: 1.0,
                false_positive_probability: 0.0
            }
        };
        
        if (alert.status === 'resolved') {
            alert.resolved_at = getRandomDate(0.5);
            alert.resolved_by = 'system_admin';
            alert.resolution_notes = 'System restarted and error resolved';
        }
        
        alerts.push(alert);
    }
    
    // Clear existing alerts
    await Alert.deleteMany({});
    console.log('🧹 Cleared existing alerts');
    
    // Insert alerts
    await Alert.insertMany(alerts);
    console.log(`🎉 Created ${alerts.length} alerts`);
    
    return alerts;
}

async function seedFullData() {
    try {
        console.log('🌱 Starting comprehensive data seeding...');
        console.log('📅 This will create realistic campus security data for testing');
        
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
        
        console.log('\n🎉 Data seeding completed successfully!');
        console.log('\n📊 Summary:');
        console.log(`├── Entities: ${entities.length}`);
        console.log(`│   ├── Students: ${entities.filter(e => e.profile.entity_type === 'student').length}`);
        console.log(`│   ├── Faculty: ${entities.filter(e => e.profile.entity_type === 'faculty').length}`);
        console.log(`│   └── Staff: ${entities.filter(e => e.profile.entity_type === 'staff').length}`);
        console.log(`├── Events: ${events.length}`);
        console.log(`└── Alerts: ${alerts.length}`);
        console.log(`    ├── Active: ${alerts.filter(a => a.status === 'active').length}`);
        console.log(`    ├── Acknowledged: ${alerts.filter(a => a.status === 'acknowledged').length}`);
        console.log(`    └── Resolved: ${alerts.filter(a => a.status === 'resolved').length}`);
        
        console.log('\n🚀 Your database is now ready for testing!');
        console.log('🎯 You can now explore:');
        console.log('   • Entity search and profiles');
        console.log('   • Event timelines and analytics');
        console.log('   • Alert management and monitoring');
        console.log('   • Real-time dashboard features');
        
    } catch (error) {
        console.error('❌ Error seeding data:', error);
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