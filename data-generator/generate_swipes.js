const faker = require('faker');
const fs = require('fs');
const path = require('path');
const moment = require('moment');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

// Set seed for reproducible data
faker.seed(12345);

// Configuration
const CONFIG = {
    TOTAL_SWIPES: 50000,
    OUTPUT_DIR: './generated_data',
    DATE_RANGE: {
        start: '2025-08-01',
        end: '2025-10-06'
    },
    LOCATIONS: [
        'LIB_ENT', 'LAB_101', 'LAB_201', 'LAB_301', 'LAB_305', 'LAB_401',
        'ADMIN_LOBBY', 'AUDITORIUM', 'GYM', 'CAFETERIA', 'HOSTEL_A', 'HOSTEL_B',
        'HOSTEL_C', 'FACULTY_BLOCK', 'RESEARCH_CENTER', 'INNOVATION_HUB',
        'MEDICAL_CENTER', 'SPORTS_COMPLEX', 'PARKING_GATE', 'MAIN_GATE',
        'LIBRARY_FLOOR_2', 'LIBRARY_FLOOR_3', 'COMPUTER_LAB', 'PHYSICS_LAB',
        'CHEMISTRY_LAB', 'BIOLOGY_LAB', 'MECHANICAL_WORKSHOP', 'ELECTRICAL_LAB',
        'CIVIL_LAB', 'CONFERENCE_ROOM_A', 'CONFERENCE_ROOM_B', 'SEMINAR_HALL'
    ],
    LOCATION_DETAILS: {
        'LIB_ENT': { building: 'Library', room: 'Entrance', access_level: 'public', zone: 'academic' },
        'LAB_101': { building: 'Engineering Block', room: '101', access_level: 'restricted', zone: 'academic' },
        'LAB_201': { building: 'Engineering Block', room: '201', access_level: 'restricted', zone: 'academic' },
        'LAB_301': { building: 'Engineering Block', room: '301', access_level: 'restricted', zone: 'academic' },
        'LAB_305': { building: 'Engineering Block', room: '305', access_level: 'restricted', zone: 'academic' },
        'LAB_401': { building: 'Engineering Block', room: '401', access_level: 'restricted', zone: 'academic' },
        'ADMIN_LOBBY': { building: 'Admin Block', room: 'Lobby', access_level: 'public', zone: 'administrative' },
        'AUDITORIUM': { building: 'Academic Complex', room: 'Main Auditorium', access_level: 'public', zone: 'academic' },
        'GYM': { building: 'Sports Complex', room: 'Gymnasium', access_level: 'public', zone: 'recreational' },
        'CAFETERIA': { building: 'Student Center', room: 'Main Cafeteria', access_level: 'public', zone: 'recreational' },
        'HOSTEL_A': { building: 'Hostel A', room: 'Entrance', access_level: 'private', zone: 'residential' },
        'HOSTEL_B': { building: 'Hostel B', room: 'Entrance', access_level: 'private', zone: 'residential' },
        'HOSTEL_C': { building: 'Hostel C', room: 'Entrance', access_level: 'private', zone: 'residential' },
        'FACULTY_BLOCK': { building: 'Faculty Housing', room: 'Main Block', access_level: 'restricted', zone: 'residential' },
        'RESEARCH_CENTER': { building: 'Research Center', room: 'Main Entrance', access_level: 'restricted', zone: 'academic' },
        'INNOVATION_HUB': { building: 'Innovation Hub', room: 'Co-working Space', access_level: 'public', zone: 'academic' },
        'MEDICAL_CENTER': { building: 'Medical Center', room: 'Reception', access_level: 'public', zone: 'service' },
        'SPORTS_COMPLEX': { building: 'Sports Complex', room: 'Main Entrance', access_level: 'public', zone: 'recreational' },
        'PARKING_GATE': { building: 'Campus', room: 'Parking Area', access_level: 'public', zone: 'service' },
        'MAIN_GATE': { building: 'Campus', room: 'Main Gate', access_level: 'public', zone: 'service' }
    },
    // Time patterns for different user types
    TIME_PATTERNS: {
        student: {
            weekday: [
                { start: 8, end: 10, weight: 0.3 }, // Morning classes
                { start: 10, end: 12, weight: 0.2 }, // Late morning
                { start: 14, end: 16, weight: 0.3 }, // Afternoon classes
                { start: 16, end: 18, weight: 0.1 }, // Evening
                { start: 19, end: 22, weight: 0.1 }  // Night study
            ],
            weekend: [
                { start: 10, end: 12, weight: 0.2 },
                { start: 14, end: 18, weight: 0.5 },
                { start: 19, end: 22, weight: 0.3 }
            ]
        },
        faculty: {
            weekday: [
                { start: 9, end: 11, weight: 0.3 },
                { start: 11, end: 13, weight: 0.2 },
                { start: 14, end: 17, weight: 0.4 },
                { start: 17, end: 19, weight: 0.1 }
            ],
            weekend: [
                { start: 10, end: 14, weight: 0.7 },
                { start: 15, end: 18, weight: 0.3 }
            ]
        },
        staff: {
            weekday: [
                { start: 9, end: 12, weight: 0.4 },
                { start: 13, end: 17, weight: 0.5 },
                { start: 17, end: 18, weight: 0.1 }
            ],
            weekend: [
                { start: 10, end: 14, weight: 1.0 }
            ]
        }
    }
};

// Utility functions
function getRandomTimeInPattern(userType, isWeekend) {
    const patterns = CONFIG.TIME_PATTERNS[userType][isWeekend ? 'weekend' : 'weekday'];
    const totalWeight = patterns.reduce((sum, pattern) => sum + pattern.weight, 0);
    let random = Math.random() * totalWeight;
    
    for (const pattern of patterns) {
        random -= pattern.weight;
        if (random <= 0) {
            const hour = faker.datatype.number({ min: pattern.start, max: pattern.end - 1 });
            const minute = faker.datatype.number({ min: 0, max: 59 });
            const second = faker.datatype.number({ min: 0, max: 59 });
            return { hour, minute, second };
        }
    }
    
    // Fallback
    return { hour: 12, minute: 0, second: 0 };
}

function generateRealisticSwipePattern(entity, date) {
    const swipes = [];
    const isWeekend = moment(date).day() === 0 || moment(date).day() === 6;
    const userType = entity.role;
    
    // Determine number of swipes for the day
    let numSwipes;
    if (isWeekend) {
        numSwipes = faker.datatype.number({ min: 0, max: 3 }); // Fewer swipes on weekends
    } else {
        switch (userType) {
            case 'student':
                numSwipes = faker.datatype.number({ min: 2, max: 8 });
                break;
            case 'faculty':
                numSwipes = faker.datatype.number({ min: 2, max: 6 });
                break;
            case 'staff':
                numSwipes = faker.datatype.number({ min: 2, max: 5 });
                break;
            default:
                numSwipes = faker.datatype.number({ min: 1, max: 4 });
        }
    }
    
    // Generate swipes with realistic timing
    for (let i = 0; i < numSwipes; i++) {
        const timeInfo = getRandomTimeInPattern(userType, isWeekend);
        const timestamp = moment(date)
            .hour(timeInfo.hour)
            .minute(timeInfo.minute)
            .second(timeInfo.second);
        
        // Choose location based on user type and time
        const location = getRealisticLocation(userType, timeInfo.hour, isWeekend);
        
        swipes.push({
            card_id: entity.card_id,
            location_id: location,
            timestamp: timestamp.format('YYYY-MM-DD HH:mm:ss'),
            entity_id: entity.entity_id,
            user_type: userType,
            building: CONFIG.LOCATION_DETAILS[location]?.building || 'Unknown',
            room: CONFIG.LOCATION_DETAILS[location]?.room || 'Unknown',
            access_level: CONFIG.LOCATION_DETAILS[location]?.access_level || 'public',
            zone: CONFIG.LOCATION_DETAILS[location]?.zone || 'academic',
            day_of_week: timestamp.format('dddd'),
            is_weekend: isWeekend
        });
    }
    
    // Sort swipes by timestamp
    return swipes.sort((a, b) => moment(a.timestamp).diff(moment(b.timestamp)));
}

function getRealisticLocation(userType, hour, isWeekend) {
    let possibleLocations;
    
    if (isWeekend) {
        // Weekend locations
        possibleLocations = ['LIB_ENT', 'GYM', 'CAFETERIA', 'INNOVATION_HUB', 'SPORTS_COMPLEX'];
        if (userType === 'student') {
            possibleLocations.push('HOSTEL_A', 'HOSTEL_B', 'HOSTEL_C');
        }
    } else {
        // Weekday locations based on time
        if (hour >= 8 && hour <= 12) {
            // Morning - academic activities
            possibleLocations = [
                'LAB_101', 'LAB_201', 'LAB_301', 'LAB_305', 'LAB_401',
                'LIB_ENT', 'AUDITORIUM', 'COMPUTER_LAB', 'PHYSICS_LAB',
                'CHEMISTRY_LAB', 'BIOLOGY_LAB'
            ];
        } else if (hour >= 13 && hour <= 17) {
            // Afternoon - mixed activities
            possibleLocations = [
                'LAB_101', 'LAB_201', 'LAB_301', 'ADMIN_LOBBY', 'LIB_ENT',
                'RESEARCH_CENTER', 'INNOVATION_HUB', 'CONFERENCE_ROOM_A',
                'CONFERENCE_ROOM_B', 'SEMINAR_HALL'
            ];
        } else if (hour >= 18 && hour <= 22) {
            // Evening - recreational and study
            possibleLocations = ['LIB_ENT', 'GYM', 'CAFETERIA', 'INNOVATION_HUB'];
            if (userType === 'student') {
                possibleLocations.push('HOSTEL_A', 'HOSTEL_B', 'HOSTEL_C');
            }
        } else {
            // Late night/early morning - limited access
            possibleLocations = ['MAIN_GATE', 'PARKING_GATE'];
            if (userType === 'student') {
                possibleLocations.push('HOSTEL_A', 'HOSTEL_B', 'HOSTEL_C');
            }
        }
    }
    
    return faker.random.arrayElement(possibleLocations);
}

function generateCardSwipes(entities) {
    console.log('🏗️  Generating synthetic card swipe data...');
    
    const swipes = [];
    const startDate = moment(CONFIG.DATE_RANGE.start);
    const endDate = moment(CONFIG.DATE_RANGE.end);
    const totalDays = endDate.diff(startDate, 'days');
    
    // Create output directory
    if (!fs.existsSync(CONFIG.OUTPUT_DIR)) {
        fs.mkdirSync(CONFIG.OUTPUT_DIR, { recursive: true });
    }
    
    // Generate swipes for each entity over the date range
    let processedEntities = 0;
    
    for (const entity of entities) {
        // Skip inactive entities most of the time
        if (entity.status === 'inactive' && Math.random() > 0.1) {
            continue;
        }
        
        // Generate swipes for random days (not every day)
        const activeDays = faker.datatype.number({ 
            min: Math.floor(totalDays * 0.3), 
            max: Math.floor(totalDays * 0.8) 
        });
        
        const selectedDates = [];
        for (let i = 0; i < activeDays; i++) {
            const randomDay = faker.datatype.number({ min: 0, max: totalDays - 1 });
            const date = startDate.clone().add(randomDay, 'days');
            selectedDates.push(date.format('YYYY-MM-DD'));
        }
        
        // Remove duplicates and sort
        const uniqueDates = [...new Set(selectedDates)].sort();
        
        // Generate swipes for each selected date
        for (const date of uniqueDates) {
            const dailySwipes = generateRealisticSwipePattern(entity, date);
            swipes.push(...dailySwipes);
        }
        
        processedEntities++;
        if (processedEntities % 100 === 0) {
            console.log(`   Processed ${processedEntities}/${entities.length} entities...`);
        }
    }
    
    // Shuffle swipes to make them more realistic
    for (let i = swipes.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [swipes[i], swipes[j]] = [swipes[j], swipes[i]];
    }
    
    // Limit to target number if we have too many
    const finalSwipes = swipes.slice(0, CONFIG.TOTAL_SWIPES);
    
    // Write basic CSV (compatible with existing format)
    const basicCsvWriter = createCsvWriter({
        path: path.join(CONFIG.OUTPUT_DIR, 'campus_card_swipes.csv'),
        header: [
            { id: 'card_id', title: 'card_id' },
            { id: 'location_id', title: 'location_id' },
            { id: 'timestamp', title: 'timestamp' }
        ]
    });
    
    // Write comprehensive CSV
    const comprehensiveCsvWriter = createCsvWriter({
        path: path.join(CONFIG.OUTPUT_DIR, 'comprehensive_card_swipes.csv'),
        header: [
            { id: 'card_id', title: 'card_id' },
            { id: 'location_id', title: 'location_id' },
            { id: 'timestamp', title: 'timestamp' },
            { id: 'entity_id', title: 'entity_id' },
            { id: 'user_type', title: 'user_type' },
            { id: 'building', title: 'building' },
            { id: 'room', title: 'room' },
            { id: 'access_level', title: 'access_level' },
            { id: 'zone', title: 'zone' },
            { id: 'day_of_week', title: 'day_of_week' },
            { id: 'is_weekend', title: 'is_weekend' }
        ]
    });
    
    return Promise.all([
        basicCsvWriter.writeRecords(finalSwipes),
        comprehensiveCsvWriter.writeRecords(finalSwipes)
    ]).then(() => {
        console.log('✅ Card swipe data generated successfully!');
        console.log(`   📊 Total swipes: ${finalSwipes.length}`);
        console.log(`   📅 Date range: ${CONFIG.DATE_RANGE.start} to ${CONFIG.DATE_RANGE.end}`);
        console.log(`   🏢 Locations: ${CONFIG.LOCATIONS.length} different locations`);
        console.log(`   👥 Active entities: ${processedEntities}`);
        
        // Generate statistics
        const stats = {
            total_swipes: finalSwipes.length,
            unique_cards: new Set(finalSwipes.map(s => s.card_id)).size,
            unique_locations: new Set(finalSwipes.map(s => s.location_id)).size,
            date_range: CONFIG.DATE_RANGE,
            weekday_swipes: finalSwipes.filter(s => !s.is_weekend).length,
            weekend_swipes: finalSwipes.filter(s => s.is_weekend).length,
            by_user_type: {
                student: finalSwipes.filter(s => s.user_type === 'student').length,
                faculty: finalSwipes.filter(s => s.user_type === 'faculty').length,
                staff: finalSwipes.filter(s => s.user_type === 'staff').length
            },
            by_zone: {
                academic: finalSwipes.filter(s => s.zone === 'academic').length,
                residential: finalSwipes.filter(s => s.zone === 'residential').length,
                recreational: finalSwipes.filter(s => s.zone === 'recreational').length,
                administrative: finalSwipes.filter(s => s.zone === 'administrative').length,
                service: finalSwipes.filter(s => s.zone === 'service').length
            }
        };
        
        // Save statistics
        fs.writeFileSync(
            path.join(CONFIG.OUTPUT_DIR, 'card_swipes_stats.json'),
            JSON.stringify(stats, null, 2)
        );
        
        console.log(`   📈 Statistics saved to card_swipes_stats.json`);
        
        return finalSwipes;
    }).catch(error => {
        console.error('❌ Error generating card swipes:', error);
        throw error;
    });
}

// Export for use in other generators
module.exports = { generateCardSwipes, CONFIG };

// Run if called directly
if (require.main === module) {
    // Load entities first
    const entitiesPath = path.join(CONFIG.OUTPUT_DIR, 'entities.json');
    
    if (!fs.existsSync(entitiesPath)) {
        console.error('❌ Entities file not found. Please run generate_entities.js first.');
        process.exit(1);
    }
    
    const entities = JSON.parse(fs.readFileSync(entitiesPath, 'utf8'));
    
    generateCardSwipes(entities)
        .then(() => {
            console.log('🎉 Card swipe generation completed!');
            process.exit(0);
        })
        .catch(error => {
            console.error('💥 Card swipe generation failed:', error);
            process.exit(1);
        });
}