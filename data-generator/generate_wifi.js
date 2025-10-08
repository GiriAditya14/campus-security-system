const faker = require('faker');
const fs = require('fs');
const path = require('path');
const moment = require('moment');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

// Set seed for reproducible data
faker.seed(12345);

// Configuration
const CONFIG = {
    TOTAL_ASSOCIATIONS: 75000,
    OUTPUT_DIR: './generated_data',
    DATE_RANGE: {
        start: '2025-08-01',
        end: '2025-10-06'
    },
    ACCESS_POINTS: [
        'AP_LIB_1', 'AP_LIB_2', 'AP_LIB_3', 'AP_LIB_4', 'AP_LIB_5',
        'AP_ENG_1', 'AP_ENG_2', 'AP_ENG_3', 'AP_ENG_4', 'AP_ENG_5',
        'AP_LAB_1', 'AP_LAB_2', 'AP_LAB_3', 'AP_LAB_4', 'AP_LAB_5',
        'AP_AUD_1', 'AP_AUD_2', 'AP_AUD_3',
        'AP_CAF_1', 'AP_CAF_2', 'AP_CAF_3', 'AP_CAF_4',
        'AP_GYM_1', 'AP_GYM_2',
        'AP_ADMIN_1', 'AP_ADMIN_2', 'AP_ADMIN_3',
        'AP_HOSTEL_A_1', 'AP_HOSTEL_A_2', 'AP_HOSTEL_A_3',
        'AP_HOSTEL_B_1', 'AP_HOSTEL_B_2', 'AP_HOSTEL_B_3',
        'AP_HOSTEL_C_1', 'AP_HOSTEL_C_2', 'AP_HOSTEL_C_3',
        'AP_FACULTY_1', 'AP_FACULTY_2',
        'AP_RESEARCH_1', 'AP_RESEARCH_2', 'AP_RESEARCH_3',
        'AP_INNOVATION_1', 'AP_INNOVATION_2',
        'AP_MEDICAL_1', 'AP_SPORTS_1', 'AP_OUTDOOR_1', 'AP_OUTDOOR_2'
    ],
    AP_DETAILS: {
        'AP_LIB_1': { building: 'Library', floor: '1', zone: 'academic', coverage: 'high' },
        'AP_LIB_2': { building: 'Library', floor: '2', zone: 'academic', coverage: 'high' },
        'AP_LIB_3': { building: 'Library', floor: '3', zone: 'academic', coverage: 'high' },
        'AP_LIB_4': { building: 'Library', floor: '4', zone: 'academic', coverage: 'medium' },
        'AP_LIB_5': { building: 'Library', floor: '5', zone: 'academic', coverage: 'medium' },
        'AP_ENG_1': { building: 'Engineering Block', floor: '1', zone: 'academic', coverage: 'high' },
        'AP_ENG_2': { building: 'Engineering Block', floor: '2', zone: 'academic', coverage: 'high' },
        'AP_ENG_3': { building: 'Engineering Block', floor: '3', zone: 'academic', coverage: 'high' },
        'AP_ENG_4': { building: 'Engineering Block', floor: '4', zone: 'academic', coverage: 'medium' },
        'AP_ENG_5': { building: 'Engineering Block', floor: '5', zone: 'academic', coverage: 'medium' },
        'AP_LAB_1': { building: 'Lab Complex', floor: '1', zone: 'academic', coverage: 'high' },
        'AP_LAB_2': { building: 'Lab Complex', floor: '2', zone: 'academic', coverage: 'high' },
        'AP_LAB_3': { building: 'Lab Complex', floor: '3', zone: 'academic', coverage: 'medium' },
        'AP_LAB_4': { building: 'Lab Complex', floor: '4', zone: 'academic', coverage: 'medium' },
        'AP_LAB_5': { building: 'Lab Complex', floor: '5', zone: 'academic', coverage: 'low' },
        'AP_AUD_1': { building: 'Auditorium', floor: '1', zone: 'academic', coverage: 'high' },
        'AP_AUD_2': { building: 'Auditorium', floor: '2', zone: 'academic', coverage: 'medium' },
        'AP_AUD_3': { building: 'Auditorium', floor: '3', zone: 'academic', coverage: 'medium' },
        'AP_CAF_1': { building: 'Cafeteria', floor: '1', zone: 'recreational', coverage: 'high' },
        'AP_CAF_2': { building: 'Cafeteria', floor: '2', zone: 'recreational', coverage: 'high' },
        'AP_CAF_3': { building: 'Cafeteria', floor: '3', zone: 'recreational', coverage: 'medium' },
        'AP_CAF_4': { building: 'Cafeteria', floor: 'Outdoor', zone: 'recreational', coverage: 'low' },
        'AP_GYM_1': { building: 'Gymnasium', floor: '1', zone: 'recreational', coverage: 'high' },
        'AP_GYM_2': { building: 'Gymnasium', floor: '2', zone: 'recreational', coverage: 'medium' },
        'AP_ADMIN_1': { building: 'Admin Block', floor: '1', zone: 'administrative', coverage: 'high' },
        'AP_ADMIN_2': { building: 'Admin Block', floor: '2', zone: 'administrative', coverage: 'high' },
        'AP_ADMIN_3': { building: 'Admin Block', floor: '3', zone: 'administrative', coverage: 'medium' },
        'AP_HOSTEL_A_1': { building: 'Hostel A', floor: '1', zone: 'residential', coverage: 'high' },
        'AP_HOSTEL_A_2': { building: 'Hostel A', floor: '2', zone: 'residential', coverage: 'high' },
        'AP_HOSTEL_A_3': { building: 'Hostel A', floor: '3', zone: 'residential', coverage: 'medium' },
        'AP_HOSTEL_B_1': { building: 'Hostel B', floor: '1', zone: 'residential', coverage: 'high' },
        'AP_HOSTEL_B_2': { building: 'Hostel B', floor: '2', zone: 'residential', coverage: 'high' },
        'AP_HOSTEL_B_3': { building: 'Hostel B', floor: '3', zone: 'residential', coverage: 'medium' },
        'AP_HOSTEL_C_1': { building: 'Hostel C', floor: '1', zone: 'residential', coverage: 'high' },
        'AP_HOSTEL_C_2': { building: 'Hostel C', floor: '2', zone: 'residential', coverage: 'high' },
        'AP_HOSTEL_C_3': { building: 'Hostel C', floor: '3', zone: 'residential', coverage: 'medium' },
        'AP_FACULTY_1': { building: 'Faculty Housing', floor: '1', zone: 'residential', coverage: 'high' },
        'AP_FACULTY_2': { building: 'Faculty Housing', floor: '2', zone: 'residential', coverage: 'medium' },
        'AP_RESEARCH_1': { building: 'Research Center', floor: '1', zone: 'academic', coverage: 'high' },
        'AP_RESEARCH_2': { building: 'Research Center', floor: '2', zone: 'academic', coverage: 'high' },
        'AP_RESEARCH_3': { building: 'Research Center', floor: '3', zone: 'academic', coverage: 'medium' },
        'AP_INNOVATION_1': { building: 'Innovation Hub', floor: '1', zone: 'academic', coverage: 'high' },
        'AP_INNOVATION_2': { building: 'Innovation Hub', floor: '2', zone: 'academic', coverage: 'medium' },
        'AP_MEDICAL_1': { building: 'Medical Center', floor: '1', zone: 'service', coverage: 'high' },
        'AP_SPORTS_1': { building: 'Sports Complex', floor: '1', zone: 'recreational', coverage: 'medium' },
        'AP_OUTDOOR_1': { building: 'Campus', floor: 'Outdoor', zone: 'service', coverage: 'low' },
        'AP_OUTDOOR_2': { building: 'Campus', floor: 'Outdoor', zone: 'service', coverage: 'low' }
    },
    // Signal strength ranges based on coverage
    SIGNAL_STRENGTH: {
        high: { min: -40, max: -20 },    // Strong signal
        medium: { min: -60, max: -40 },  // Medium signal
        low: { min: -80, max: -60 }      // Weak signal
    },
    // Session duration patterns (in seconds)
    SESSION_DURATION: {
        student: {
            academic: { min: 1800, max: 10800 },    // 30 min to 3 hours
            residential: { min: 3600, max: 28800 }, // 1 hour to 8 hours
            recreational: { min: 900, max: 7200 }   // 15 min to 2 hours
        },
        faculty: {
            academic: { min: 3600, max: 14400 },    // 1 hour to 4 hours
            residential: { min: 7200, max: 43200 }, // 2 hours to 12 hours
            recreational: { min: 1800, max: 5400 }  // 30 min to 1.5 hours
        },
        staff: {
            academic: { min: 1800, max: 7200 },     // 30 min to 2 hours
            residential: { min: 3600, max: 36000 }, // 1 hour to 10 hours
            recreational: { min: 1200, max: 3600 }  // 20 min to 1 hour
        }
    }
};

// Utility functions
function getSignalStrength(apId) {
    const apDetails = CONFIG.AP_DETAILS[apId];
    const coverage = apDetails ? apDetails.coverage : 'medium';
    const range = CONFIG.SIGNAL_STRENGTH[coverage];
    
    // Add some randomness to make it more realistic
    const baseStrength = faker.datatype.number({ min: range.min, max: range.max });
    const noise = faker.datatype.number({ min: -5, max: 5 });
    
    return Math.max(-100, Math.min(-10, baseStrength + noise));
}

function getSessionDuration(userType, zone) {
    const durations = CONFIG.SESSION_DURATION[userType] || CONFIG.SESSION_DURATION.student;
    const zoneDuration = durations[zone] || durations.academic;
    
    return faker.datatype.number({ min: zoneDuration.min, max: zoneDuration.max });
}

function getRealisticAccessPoint(userType, hour, isWeekend, preferredZone = null) {
    let possibleAPs = [];
    
    // Filter APs based on time and user type
    if (isWeekend) {
        // Weekend - more recreational and residential
        possibleAPs = CONFIG.ACCESS_POINTS.filter(ap => {
            const details = CONFIG.AP_DETAILS[ap];
            return details && (
                details.zone === 'recreational' || 
                details.zone === 'residential' ||
                (details.zone === 'academic' && Math.random() > 0.7)
            );
        });
    } else {
        // Weekday patterns
        if (hour >= 8 && hour <= 17) {
            // Work/study hours - mostly academic
            possibleAPs = CONFIG.ACCESS_POINTS.filter(ap => {
                const details = CONFIG.AP_DETAILS[ap];
                return details && (
                    details.zone === 'academic' ||
                    details.zone === 'administrative' ||
                    (details.zone === 'recreational' && Math.random() > 0.5)
                );
            });
        } else if (hour >= 18 && hour <= 22) {
            // Evening - mixed usage
            possibleAPs = CONFIG.ACCESS_POINTS.filter(ap => {
                const details = CONFIG.AP_DETAILS[ap];
                return details && (
                    details.zone === 'recreational' ||
                    details.zone === 'residential' ||
                    (details.zone === 'academic' && Math.random() > 0.3)
                );
            });
        } else {
            // Late night/early morning - mostly residential
            possibleAPs = CONFIG.ACCESS_POINTS.filter(ap => {
                const details = CONFIG.AP_DETAILS[ap];
                return details && details.zone === 'residential';
            });
        }
    }
    
    // Filter by preferred zone if specified
    if (preferredZone) {
        const zoneAPs = possibleAPs.filter(ap => {
            const details = CONFIG.AP_DETAILS[ap];
            return details && details.zone === preferredZone;
        });
        if (zoneAPs.length > 0) {
            possibleAPs = zoneAPs;
        }
    }
    
    // Filter by user type preferences
    if (userType === 'student') {
        // Students prefer hostels for residential
        const studentPreferred = possibleAPs.filter(ap => 
            !ap.includes('FACULTY') || Math.random() > 0.8
        );
        if (studentPreferred.length > 0) {
            possibleAPs = studentPreferred;
        }
    } else if (userType === 'faculty') {
        // Faculty prefer faculty housing and research areas
        const facultyPreferred = possibleAPs.filter(ap => 
            ap.includes('FACULTY') || ap.includes('RESEARCH') || !ap.includes('HOSTEL') || Math.random() > 0.9
        );
        if (facultyPreferred.length > 0) {
            possibleAPs = facultyPreferred;
        }
    }
    
    return possibleAPs.length > 0 ? faker.random.arrayElement(possibleAPs) : faker.random.arrayElement(CONFIG.ACCESS_POINTS);
}

function generateRealisticWiFiPattern(entity, date) {
    const associations = [];
    const isWeekend = moment(date).day() === 0 || moment(date).day() === 6;
    const userType = entity.role;
    
    // Determine number of associations for the day
    let numAssociations;
    if (isWeekend) {
        numAssociations = faker.datatype.number({ min: 0, max: 5 });
    } else {
        switch (userType) {
            case 'student':
                numAssociations = faker.datatype.number({ min: 3, max: 12 });
                break;
            case 'faculty':
                numAssociations = faker.datatype.number({ min: 2, max: 8 });
                break;
            case 'staff':
                numAssociations = faker.datatype.number({ min: 2, max: 6 });
                break;
            default:
                numAssociations = faker.datatype.number({ min: 1, max: 5 });
        }
    }
    
    // Generate associations with realistic timing and roaming
    let currentTime = moment(date).hour(faker.datatype.number({ min: 6, max: 8 }));
    let lastAP = null;
    let sessionStartTime = null;
    
    for (let i = 0; i < numAssociations; i++) {
        // Determine if this is a new session or roaming
        const isRoaming = lastAP && Math.random() > 0.7; // 30% chance of roaming
        
        let apId;
        if (isRoaming) {
            // Roaming - choose nearby AP or same building
            const lastAPDetails = CONFIG.AP_DETAILS[lastAP];
            const sameBuilding = CONFIG.ACCESS_POINTS.filter(ap => {
                const details = CONFIG.AP_DETAILS[ap];
                return details && details.building === lastAPDetails.building && ap !== lastAP;
            });
            
            if (sameBuilding.length > 0 && Math.random() > 0.5) {
                apId = faker.random.arrayElement(sameBuilding);
            } else {
                apId = getRealisticAccessPoint(userType, currentTime.hour(), isWeekend);
            }
        } else {
            // New session
            apId = getRealisticAccessPoint(userType, currentTime.hour(), isWeekend);
            sessionStartTime = currentTime.clone();
        }
        
        // Generate association timestamp
        if (i > 0) {
            // Add some time between associations
            const timeBetween = faker.datatype.number({ min: 300, max: 3600 }); // 5 min to 1 hour
            currentTime.add(timeBetween, 'seconds');
        }
        
        const signalStrength = getSignalStrength(apId);
        const apDetails = CONFIG.AP_DETAILS[apId];
        
        // Calculate session duration for this association
        const sessionDuration = getSessionDuration(userType, apDetails.zone);
        
        associations.push({
            device_hash: entity.device_hash,
            ap_id: apId,
            timestamp: currentTime.format('M/D/YYYY H:mm'),
            entity_id: entity.entity_id,
            user_type: userType,
            signal_strength: signalStrength,
            session_duration: sessionDuration,
            building: apDetails.building,
            floor: apDetails.floor,
            zone: apDetails.zone,
            coverage: apDetails.coverage,
            is_roaming: isRoaming,
            day_of_week: currentTime.format('dddd'),
            is_weekend: isWeekend,
            hour: currentTime.hour()
        });
        
        lastAP = apId;
        
        // Move time forward for next association
        currentTime.add(faker.datatype.number({ min: 1800, max: 7200 }), 'seconds');
        
        // Don't go past midnight
        if (currentTime.hour() >= 24) {
            break;
        }
    }
    
    return associations;
}

function generateWiFiAssociations(entities) {
    console.log('🏗️  Generating synthetic WiFi association data...');
    
    const associations = [];
    const startDate = moment(CONFIG.DATE_RANGE.start);
    const endDate = moment(CONFIG.DATE_RANGE.end);
    const totalDays = endDate.diff(startDate, 'days');
    
    // Create output directory
    if (!fs.existsSync(CONFIG.OUTPUT_DIR)) {
        fs.mkdirSync(CONFIG.OUTPUT_DIR, { recursive: true });
    }
    
    let processedEntities = 0;
    
    for (const entity of entities) {
        // Skip entities without device hash or inactive entities
        if (!entity.device_hash || (entity.status === 'inactive' && Math.random() > 0.1)) {
            continue;
        }
        
        // Generate associations for random days
        const activeDays = faker.datatype.number({ 
            min: Math.floor(totalDays * 0.4), 
            max: Math.floor(totalDays * 0.9) 
        });
        
        const selectedDates = [];
        for (let i = 0; i < activeDays; i++) {
            const randomDay = faker.datatype.number({ min: 0, max: totalDays - 1 });
            const date = startDate.clone().add(randomDay, 'days');
            selectedDates.push(date.format('YYYY-MM-DD'));
        }
        
        // Remove duplicates and sort
        const uniqueDates = [...new Set(selectedDates)].sort();
        
        // Generate associations for each selected date
        for (const date of uniqueDates) {
            const dailyAssociations = generateRealisticWiFiPattern(entity, date);
            associations.push(...dailyAssociations);
        }
        
        processedEntities++;
        if (processedEntities % 100 === 0) {
            console.log(`   Processed ${processedEntities}/${entities.length} entities...`);
        }
    }
    
    // Shuffle associations to make them more realistic
    for (let i = associations.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [associations[i], associations[j]] = [associations[j], associations[i]];
    }
    
    // Limit to target number if we have too many
    const finalAssociations = associations.slice(0, CONFIG.TOTAL_ASSOCIATIONS);
    
    // Write basic CSV (compatible with existing format)
    const basicCsvWriter = createCsvWriter({
        path: path.join(CONFIG.OUTPUT_DIR, 'wifi_associations_logs.csv'),
        header: [
            { id: 'device_hash', title: 'device_hash' },
            { id: 'ap_id', title: 'ap_id' },
            { id: 'timestamp', title: 'timestamp' }
        ]
    });
    
    // Write comprehensive CSV
    const comprehensiveCsvWriter = createCsvWriter({
        path: path.join(CONFIG.OUTPUT_DIR, 'comprehensive_wifi_logs.csv'),
        header: [
            { id: 'device_hash', title: 'device_hash' },
            { id: 'ap_id', title: 'ap_id' },
            { id: 'timestamp', title: 'timestamp' },
            { id: 'entity_id', title: 'entity_id' },
            { id: 'user_type', title: 'user_type' },
            { id: 'signal_strength', title: 'signal_strength' },
            { id: 'session_duration', title: 'session_duration' },
            { id: 'building', title: 'building' },
            { id: 'floor', title: 'floor' },
            { id: 'zone', title: 'zone' },
            { id: 'coverage', title: 'coverage' },
            { id: 'is_roaming', title: 'is_roaming' },
            { id: 'day_of_week', title: 'day_of_week' },
            { id: 'is_weekend', title: 'is_weekend' },
            { id: 'hour', title: 'hour' }
        ]
    });
    
    return Promise.all([
        basicCsvWriter.writeRecords(finalAssociations),
        comprehensiveCsvWriter.writeRecords(finalAssociations)
    ]).then(() => {
        console.log('✅ WiFi association data generated successfully!');
        console.log(`   📊 Total associations: ${finalAssociations.length}`);
        console.log(`   📅 Date range: ${CONFIG.DATE_RANGE.start} to ${CONFIG.DATE_RANGE.end}`);
        console.log(`   📡 Access points: ${CONFIG.ACCESS_POINTS.length} different APs`);
        console.log(`   👥 Active entities: ${processedEntities}`);
        
        // Generate statistics
        const stats = {
            total_associations: finalAssociations.length,
            unique_devices: new Set(finalAssociations.map(a => a.device_hash)).size,
            unique_aps: new Set(finalAssociations.map(a => a.ap_id)).size,
            date_range: CONFIG.DATE_RANGE,
            weekday_associations: finalAssociations.filter(a => !a.is_weekend).length,
            weekend_associations: finalAssociations.filter(a => a.is_weekend).length,
            roaming_sessions: finalAssociations.filter(a => a.is_roaming).length,
            by_user_type: {
                student: finalAssociations.filter(a => a.user_type === 'student').length,
                faculty: finalAssociations.filter(a => a.user_type === 'faculty').length,
                staff: finalAssociations.filter(a => a.user_type === 'staff').length
            },
            by_zone: {
                academic: finalAssociations.filter(a => a.zone === 'academic').length,
                residential: finalAssociations.filter(a => a.zone === 'residential').length,
                recreational: finalAssociations.filter(a => a.zone === 'recreational').length,
                administrative: finalAssociations.filter(a => a.zone === 'administrative').length,
                service: finalAssociations.filter(a => a.zone === 'service').length
            },
            signal_strength_distribution: {
                strong: finalAssociations.filter(a => a.signal_strength >= -40).length,
                medium: finalAssociations.filter(a => a.signal_strength >= -60 && a.signal_strength < -40).length,
                weak: finalAssociations.filter(a => a.signal_strength < -60).length
            },
            average_session_duration: Math.round(
                finalAssociations.reduce((sum, a) => sum + a.session_duration, 0) / finalAssociations.length
            )
        };
        
        // Save statistics
        fs.writeFileSync(
            path.join(CONFIG.OUTPUT_DIR, 'wifi_associations_stats.json'),
            JSON.stringify(stats, null, 2)
        );
        
        console.log(`   📈 Statistics saved to wifi_associations_stats.json`);
        console.log(`   📶 Average signal strength: ${Math.round(finalAssociations.reduce((sum, a) => sum + a.signal_strength, 0) / finalAssociations.length)} dBm`);
        console.log(`   ⏱️  Average session duration: ${Math.round(stats.average_session_duration / 60)} minutes`);
        
        return finalAssociations;
    }).catch(error => {
        console.error('❌ Error generating WiFi associations:', error);
        throw error;
    });
}

// Export for use in other generators
module.exports = { generateWiFiAssociations, CONFIG };

// Run if called directly
if (require.main === module) {
    // Load entities first
    const entitiesPath = path.join(CONFIG.OUTPUT_DIR, 'entities.json');
    
    if (!fs.existsSync(entitiesPath)) {
        console.error('❌ Entities file not found. Please run generate_entities.js first.');
        process.exit(1);
    }
    
    const entities = JSON.parse(fs.readFileSync(entitiesPath, 'utf8'));
    
    generateWiFiAssociations(entities)
        .then(() => {
            console.log('🎉 WiFi association generation completed!');
            process.exit(0);
        })
        .catch(error => {
            console.error('💥 WiFi association generation failed:', error);
            process.exit(1);
        });
}