const fs = require('fs');
const path = require('path');
const { faker } = require('@faker-js/faker');

// IIT Guwahati specific data
const DEPARTMENTS = [
    'Computer Science', 'Electronics & Communication', 'Mechanical Engineering',
    'Civil Engineering', 'Chemical Engineering', 'Physics', 'Mathematics',
    'Chemistry', 'Biology', 'Humanities', 'Management', 'Design'
];

const LOCATIONS = {
    'ACADEMIC_COMPLEX': ['AC_101', 'AC_102', 'AC_201', 'AC_301'],
    'LIBRARY': ['LIB_ENT', 'LIB_L1', 'LIB_L2', 'LIB_L3'],
    'COMPUTER_CENTER': ['CC_LAB1', 'CC_LAB2', 'CC_SERVER'],
    'HOSTELS': ['HOSTEL_A', 'HOSTEL_B', 'HOSTEL_C'],
    'CAFETERIA': ['CAF_MAIN', 'CAF_FOOD_COURT'],
    'GYMNASIUM': ['GYM_MAIN', 'GYM_INDOOR'],
    'LABS': ['LAB_101', 'LAB_102', 'LAB_201', 'LAB_301'],
    'AUDITORIUM': ['AUD_MAIN', 'AUD_SEMINAR'],
    'ADMIN': ['ADMIN_LOBBY', 'ADMIN_OFFICE']
};

const WIFI_APS = {
    'AP_LIB_1': 'LIBRARY', 'AP_LIB_2': 'LIBRARY', 'AP_LIB_3': 'LIBRARY',
    'AP_AC_1': 'ACADEMIC_COMPLEX', 'AP_AC_2': 'ACADEMIC_COMPLEX',
    'AP_CC_1': 'COMPUTER_CENTER', 'AP_CC_2': 'COMPUTER_CENTER',
    'AP_CAF_1': 'CAFETERIA', 'AP_CAF_2': 'CAFETERIA',
    'AP_GYM_1': 'GYMNASIUM', 'AP_LAB_1': 'LABS', 'AP_LAB_2': 'LABS'
};

class SyntheticDataGenerator {
    constructor() {
        this.entities = [];
        this.cardSwipes = [];
        this.wifiLogs = [];
        this.cctvFrames = [];
        this.faceEmbeddings = [];
        this.helpdeskTickets = [];
        this.eventRSVPs = [];
        this.labBookings = [];
        this.libraryCheckouts = [];
        
        // Set consistent seed for reproducible data
        faker.seed(12345);
    }

    // Generate realistic Indian names
    generateIndianName() {
        const firstNames = [
            'Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Sai', 'Reyansh',
            'Ayaan', 'Krishna', 'Ishaan', 'Shaurya', 'Atharv', 'Advik', 'Pranav',
            'Ananya', 'Diya', 'Priya', 'Kavya', 'Anika', 'Saanvi', 'Ira',
            'Myra', 'Tara', 'Siya', 'Pari', 'Nisha', 'Riya', 'Neha', 'Sana'
        ];
        
        const lastNames = [
            'Sharma', 'Verma', 'Gupta', 'Singh', 'Kumar', 'Patel', 'Yadav',
            'Mishra', 'Agarwal', 'Jain', 'Bansal', 'Srivastava', 'Tiwari',
            'Pandey', 'Saxena', 'Joshi', 'Arora', 'Malhotra', 'Kapoor',
            'Chopra', 'Mehta', 'Shah', 'Desai', 'Modi', 'Rao', 'Reddy'
        ];
        
        return `${faker.helpers.arrayElement(firstNames)} ${faker.helpers.arrayElement(lastNames)}`;
    }

    // Generate entity profiles (students and staff)
    generateEntityProfiles(count = 1000) {
        console.log(`Generating ${count} entity profiles...`);
        
        for (let i = 0; i < count; i++) {
            const isStudent = i < count * 0.8; // 80% students, 20% staff
            const entityId = `E${String(100000 + i).padStart(6, '0')}`;
            const name = this.generateIndianName();
            const department = faker.helpers.arrayElement(DEPARTMENTS);
            
            const entity = {
                entity_id: entityId,
                name: name,
                role: isStudent ? 'student' : 'staff',
                email: `${name.toLowerCase().replace(' ', '.')}@iitg.ac.in`,
                department: department,
                student_id: isStudent ? `S${faker.number.int({ min: 10000, max: 99999 })}` : '',
                staff_id: !isStudent ? `T${faker.number.int({ min: 1000, max: 9999 })}` : '',
                card_id: `C${faker.number.int({ min: 1000, max: 9999 })}`,
                device_hash: `DH${faker.string.hexadecimal({ length: 12, prefix: '' })}`,
                face_id: `F${String(100000 + i).padStart(6, '0')}`,
                phone: faker.phone.number('+91 9#########'),
                year: isStudent ? faker.number.int({ min: 1, max: 4 }) : null,
                created_at: faker.date.past({ years: 2 }),
                status: faker.helpers.weightedArrayElement([
                    { weight: 0.9, value: 'active' },
                    { weight: 0.1, value: 'inactive' }
                ])
            };
            
            this.entities.push(entity);
        }
        
        return this.entities;
    }

    // Generate card swipe data
    generateCardSwipes(count = 5000) {
        console.log(`Generating ${count} card swipe records...`);
        
        const allLocations = Object.values(LOCATIONS).flat();
        
        for (let i = 0; i < count; i++) {
            const entity = faker.helpers.arrayElement(this.entities);
            const location = faker.helpers.arrayElement(allLocations);
            
            // Generate realistic timestamps (last 30 days, business hours weighted)
            const timestamp = this.generateRealisticTimestamp();
            
            this.cardSwipes.push({
                card_id: entity.card_id,
                location_id: location,
                timestamp: timestamp.toISOString(),
                entity_id: entity.entity_id
            });
        }
        
        return this.cardSwipes;
    }

    // Generate WiFi association logs
    generateWiFiLogs(count = 3000) {
        console.log(`Generating ${count} WiFi association logs...`);
        
        const apIds = Object.keys(WIFI_APS);
        
        for (let i = 0; i < count; i++) {
            const entity = faker.helpers.arrayElement(this.entities);
            const apId = faker.helpers.arrayElement(apIds);
            const timestamp = this.generateRealisticTimestamp();
            
            this.wifiLogs.push({
                device_hash: entity.device_hash,
                ap_id: apId,
                timestamp: timestamp.toISOString(),
                entity_id: entity.entity_id,
                signal_strength: faker.number.int({ min: -80, max: -30 }),
                duration: faker.number.int({ min: 300, max: 7200 }) // 5 min to 2 hours
            });
        }
        
        return this.wifiLogs;
    }  
  // Generate CCTV frame metadata
    generateCCTVFrames(count = 2000) {
        console.log(`Generating ${count} CCTV frame records...`);
        
        const cameras = [
            'CAM_LIB_ENT', 'CAM_AC_MAIN', 'CAM_CAF_01', 'CAM_GYM_ENT',
            'CAM_LAB_CORR', 'CAM_HOSTEL_A', 'CAM_ADMIN_LOBBY', 'CAM_PARKING'
        ];
        
        for (let i = 0; i < count; i++) {
            const entity = faker.helpers.arrayElement(this.entities);
            const camera = faker.helpers.arrayElement(cameras);
            const timestamp = this.generateRealisticTimestamp();
            
            this.cctvFrames.push({
                frame_id: `FRAME_${String(i + 1).padStart(6, '0')}`,
                camera_id: camera,
                timestamp: timestamp.toISOString(),
                face_id: entity.face_id,
                entity_id: entity.entity_id,
                confidence: faker.number.float({ min: 0.7, max: 0.99, precision: 0.01 }),
                bounding_box: {
                    x: faker.number.int({ min: 100, max: 500 }),
                    y: faker.number.int({ min: 100, max: 400 }),
                    width: faker.number.int({ min: 80, max: 150 }),
                    height: faker.number.int({ min: 100, max: 180 })
                }
            });
        }
        
        return this.cctvFrames;
    }

    // Generate face embeddings
    generateFaceEmbeddings() {
        console.log(`Generating face embeddings for ${this.entities.length} entities...`);
        
        this.entities.forEach(entity => {
            // Generate 128-dimensional face embedding (FaceNet standard)
            const embedding = Array.from({ length: 128 }, () => 
                faker.number.float({ min: -1, max: 1, precision: 0.0001 })
            );
            
            this.faceEmbeddings.push({
                face_id: entity.face_id,
                entity_id: entity.entity_id,
                embedding: embedding,
                quality_score: faker.number.float({ min: 0.8, max: 1.0, precision: 0.01 }),
                created_at: entity.created_at
            });
        });
        
        return this.faceEmbeddings;
    }

    // Generate helpdesk tickets
    generateHelpdeskTickets(count = 500) {
        console.log(`Generating ${count} helpdesk tickets...`);
        
        const ticketTypes = [
            'Network Issue', 'Hardware Problem', 'Software Installation',
            'Account Access', 'Email Problem', 'Printer Issue', 'Lab Access',
            'WiFi Connection', 'System Slow', 'Password Reset'
        ];
        
        const priorities = ['Low', 'Medium', 'High', 'Critical'];
        const statuses = ['Open', 'In Progress', 'Resolved', 'Closed'];
        
        for (let i = 0; i < count; i++) {
            const entity = faker.helpers.arrayElement(this.entities);
            const ticketType = faker.helpers.arrayElement(ticketTypes);
            const timestamp = this.generateRealisticTimestamp();
            
            this.helpdeskTickets.push({
                ticket_id: `TKT_${String(i + 1).padStart(6, '0')}`,
                entity_id: entity.entity_id,
                requester_email: entity.email,
                subject: `${ticketType} - ${faker.lorem.words(3)}`,
                description: faker.lorem.paragraph(),
                priority: faker.helpers.arrayElement(priorities),
                status: faker.helpers.arrayElement(statuses),
                category: ticketType,
                created_at: timestamp.toISOString(),
                location: faker.helpers.arrayElement(Object.values(LOCATIONS).flat())
            });
        }
        
        return this.helpdeskTickets;
    }  
  // Generate event RSVPs
    generateEventRSVPs(count = 800) {
        console.log(`Generating ${count} event RSVP records...`);
        
        const eventTypes = [
            'Technical Workshop', 'Cultural Event', 'Sports Tournament',
            'Guest Lecture', 'Seminar', 'Conference', 'Festival Celebration',
            'Career Fair', 'Alumni Meet', 'Research Presentation'
        ];
        
        const venues = Object.values(LOCATIONS).flat();
        
        for (let i = 0; i < count; i++) {
            const entity = faker.helpers.arrayElement(this.entities);
            const eventType = faker.helpers.arrayElement(eventTypes);
            const eventDate = faker.date.future({ years: 0.5 });
            
            this.eventRSVPs.push({
                rsvp_id: `RSVP_${String(i + 1).padStart(6, '0')}`,
                event_id: `EVT_${String(Math.floor(i / 10) + 1).padStart(4, '0')}`,
                entity_id: entity.entity_id,
                attendee_email: entity.email,
                event_name: `${eventType} - ${faker.lorem.words(2)}`,
                event_type: eventType,
                event_date: eventDate.toISOString(),
                venue: faker.helpers.arrayElement(venues),
                rsvp_status: faker.helpers.weightedArrayElement([
                    { weight: 0.7, value: 'confirmed' },
                    { weight: 0.2, value: 'pending' },
                    { weight: 0.1, value: 'declined' }
                ]),
                registered_at: faker.date.past({ years: 0.1 }).toISOString()
            });
        }
        
        return this.eventRSVPs;
    }

    // Generate lab bookings
    generateLabBookings(count = 600) {
        console.log(`Generating ${count} lab booking records...`);
        
        const labs = [
            'Computer Lab 1', 'Computer Lab 2', 'Physics Lab', 'Chemistry Lab',
            'Biology Lab', 'Electronics Lab', 'Mechanical Workshop', 'Research Lab'
        ];
        
        for (let i = 0; i < count; i++) {
            const entity = faker.helpers.arrayElement(this.entities.filter(e => e.role === 'student'));
            const lab = faker.helpers.arrayElement(labs);
            const bookingDate = faker.date.future({ years: 0.2 });
            
            this.labBookings.push({
                booking_id: `LAB_${String(i + 1).padStart(6, '0')}`,
                entity_id: entity.entity_id,
                student_id: entity.student_id,
                lab_name: lab,
                booking_date: bookingDate.toISOString(),
                time_slot: `${faker.number.int({ min: 9, max: 17 })}:00-${faker.number.int({ min: 10, max: 18 })}:00`,
                purpose: faker.lorem.sentence(),
                status: faker.helpers.arrayElement(['confirmed', 'pending', 'cancelled']),
                created_at: faker.date.past({ years: 0.1 }).toISOString()
            });
        }
        
        return this.labBookings;
    }

    // Generate library checkouts
    generateLibraryCheckouts(count = 1200) {
        console.log(`Generating ${count} library checkout records...`);
        
        const bookCategories = [
            'Computer Science', 'Engineering', 'Mathematics', 'Physics',
            'Chemistry', 'Biology', 'Literature', 'History', 'Economics'
        ];
        
        for (let i = 0; i < count; i++) {
            const entity = faker.helpers.arrayElement(this.entities);
            const category = faker.helpers.arrayElement(bookCategories);
            const checkoutDate = faker.date.past({ years: 0.5 });
            const dueDate = new Date(checkoutDate);
            dueDate.setDate(dueDate.getDate() + 14); // 2 weeks loan period
            
            this.libraryCheckouts.push({
                checkout_id: `CHK_${String(i + 1).padStart(6, '0')}`,
                entity_id: entity.entity_id,
                book_id: `BK_${String(faker.number.int({ min: 1000, max: 9999 }))}`,
                book_title: faker.lorem.words(faker.number.int({ min: 2, max: 5 })),
                author: this.generateIndianName(),
                category: category,
                isbn: faker.string.numeric(13),
                checkout_date: checkoutDate.toISOString(),
                due_date: dueDate.toISOString(),
                return_date: faker.helpers.maybe(() => 
                    faker.date.between({ from: checkoutDate, to: new Date() }).toISOString(),
                    { probability: 0.7 }
                ),
                status: faker.helpers.arrayElement(['checked_out', 'returned', 'overdue'])
            });
        }
        
        return this.libraryCheckouts;
    }   
 // Generate realistic timestamps (weighted towards business hours)
    generateRealisticTimestamp() {
        const now = new Date();
        const daysAgo = faker.number.int({ min: 1, max: 30 });
        const baseDate = new Date(now.getTime() - (daysAgo * 24 * 60 * 60 * 1000));
        
        // Weight towards business hours (8 AM - 8 PM)
        const hour = faker.helpers.weightedArrayElement([
            { weight: 0.05, value: faker.number.int({ min: 0, max: 7 }) },   // Night
            { weight: 0.8, value: faker.number.int({ min: 8, max: 20 }) },   // Day
            { weight: 0.15, value: faker.number.int({ min: 21, max: 23 }) }  // Evening
        ]);
        
        baseDate.setHours(hour, faker.number.int({ min: 0, max: 59 }), faker.number.int({ min: 0, max: 59 }));
        return baseDate;
    }

    // Save data to CSV files
    async saveToCSV() {
        const dataDir = path.join(__dirname, '../../../data/synthetic');
        
        // Create directory if it doesn't exist
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        // Save entity profiles
        const entityCSV = this.convertToCSV(this.entities, [
            'entity_id', 'name', 'role', 'email', 'department', 'student_id', 
            'staff_id', 'card_id', 'device_hash', 'face_id', 'phone', 'year', 'status'
        ]);
        fs.writeFileSync(path.join(dataDir, 'entity_profiles.csv'), entityCSV);

        // Save card swipes
        const cardSwipeCSV = this.convertToCSV(this.cardSwipes, [
            'card_id', 'location_id', 'timestamp', 'entity_id'
        ]);
        fs.writeFileSync(path.join(dataDir, 'card_swipes.csv'), cardSwipeCSV);

        // Save WiFi logs
        const wifiCSV = this.convertToCSV(this.wifiLogs, [
            'device_hash', 'ap_id', 'timestamp', 'entity_id', 'signal_strength', 'duration'
        ]);
        fs.writeFileSync(path.join(dataDir, 'wifi_logs.csv'), wifiCSV);

        // Save CCTV frames
        const cctvCSV = this.convertToCSV(this.cctvFrames.map(frame => ({
            ...frame,
            bounding_box: JSON.stringify(frame.bounding_box)
        })), ['frame_id', 'camera_id', 'timestamp', 'face_id', 'entity_id', 'confidence', 'bounding_box']);
        fs.writeFileSync(path.join(dataDir, 'cctv_frames.csv'), cctvCSV);

        // Save face embeddings as JSON (too complex for CSV)
        fs.writeFileSync(
            path.join(dataDir, 'face_embeddings.json'), 
            JSON.stringify(this.faceEmbeddings, null, 2)
        );

        // Save helpdesk tickets
        const helpdeskCSV = this.convertToCSV(this.helpdeskTickets, [
            'ticket_id', 'entity_id', 'requester_email', 'subject', 'description',
            'priority', 'status', 'category', 'created_at', 'location'
        ]);
        fs.writeFileSync(path.join(dataDir, 'helpdesk_tickets.csv'), helpdeskCSV);

        // Save event RSVPs
        const rsvpCSV = this.convertToCSV(this.eventRSVPs, [
            'rsvp_id', 'event_id', 'entity_id', 'attendee_email', 'event_name',
            'event_type', 'event_date', 'venue', 'rsvp_status', 'registered_at'
        ]);
        fs.writeFileSync(path.join(dataDir, 'event_rsvps.csv'), rsvpCSV);

        // Save lab bookings
        const labCSV = this.convertToCSV(this.labBookings, [
            'booking_id', 'entity_id', 'student_id', 'lab_name', 'booking_date',
            'time_slot', 'purpose', 'status', 'created_at'
        ]);
        fs.writeFileSync(path.join(dataDir, 'lab_bookings.csv'), labCSV);

        // Save library checkouts
        const libraryCSV = this.convertToCSV(this.libraryCheckouts, [
            'checkout_id', 'entity_id', 'book_id', 'book_title', 'author',
            'category', 'isbn', 'checkout_date', 'due_date', 'return_date', 'status'
        ]);
        fs.writeFileSync(path.join(dataDir, 'library_checkouts.csv'), libraryCSV);

        console.log(`\n✅ Synthetic data saved to: ${dataDir}`);
        console.log(`📊 Generated data summary:`);
        console.log(`   - Entity Profiles: ${this.entities.length}`);
        console.log(`   - Card Swipes: ${this.cardSwipes.length}`);
        console.log(`   - WiFi Logs: ${this.wifiLogs.length}`);
        console.log(`   - CCTV Frames: ${this.cctvFrames.length}`);
        console.log(`   - Face Embeddings: ${this.faceEmbeddings.length}`);
        console.log(`   - Helpdesk Tickets: ${this.helpdeskTickets.length}`);
        console.log(`   - Event RSVPs: ${this.eventRSVPs.length}`);
        console.log(`   - Lab Bookings: ${this.labBookings.length}`);
        console.log(`   - Library Checkouts: ${this.libraryCheckouts.length}`);
    }    
    // Convert array of objects to CSV
    convertToCSV(data, headers) {
        if (!data || data.length === 0) return '';
        
        const csvHeaders = headers.join(',');
        const csvRows = data.map(row => {
            return headers.map(header => {
                const value = row[header];
                if (value === null || value === undefined) return '';
                if (typeof value === 'string' && value.includes(',')) {
                    return `"${value.replace(/"/g, '""')}"`;
                }
                return value;
            }).join(',');
        });
        
        return [csvHeaders, ...csvRows].join('\n');
    }

    // Generate all synthetic data
    async generateAll() {
        console.log('🚀 Starting synthetic data generation...\n');
        
        // Generate in sequence to maintain relationships
        this.generateEntityProfiles(1000);
        this.generateCardSwipes(5000);
        this.generateWiFiLogs(3000);
        this.generateCCTVFrames(2000);
        this.generateFaceEmbeddings();
        this.generateHelpdeskTickets(500);
        this.generateEventRSVPs(800);
        this.generateLabBookings(600);
        this.generateLibraryCheckouts(1200);
        
        await this.saveToCSV();
        
        console.log('\n🎉 Synthetic data generation completed successfully!');
        return {
            entities: this.entities.length,
            cardSwipes: this.cardSwipes.length,
            wifiLogs: this.wifiLogs.length,
            cctvFrames: this.cctvFrames.length,
            faceEmbeddings: this.faceEmbeddings.length,
            helpdeskTickets: this.helpdeskTickets.length,
            eventRSVPs: this.eventRSVPs.length,
            labBookings: this.labBookings.length,
            libraryCheckouts: this.libraryCheckouts.length
        };
    }
}

// Export for use in other modules
module.exports = SyntheticDataGenerator;

// Run if called directly
if (require.main === module) {
    const generator = new SyntheticDataGenerator();
    generator.generateAll().catch(console.error);
}