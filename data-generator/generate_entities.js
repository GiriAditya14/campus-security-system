const faker = require('faker');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

// Set seed for reproducible data
faker.seed(12345);

// Configuration
const CONFIG = {
    TOTAL_ENTITIES: 5000,
    STUDENTS_RATIO: 0.75,
    FACULTY_RATIO: 0.20,
    STAFF_RATIO: 0.05,
    OUTPUT_DIR: './generated_data',
    DEPARTMENTS: [
        'Computer Science', 'Electrical Engineering', 'Mechanical Engineering',
        'Civil Engineering', 'Mathematics', 'Physics', 'Chemistry', 'Biology',
        'Economics', 'Management', 'Design', 'Architecture', 'Liberal Arts',
        'CIVIL', 'MECH', 'ECE', 'CSE', 'BIO', 'CHEM', 'PHYS', 'MATH', 'Admin'
    ],
    YEARS: [1, 2, 3, 4, 5], // For students
    BUILDINGS: [
        'Academic Complex', 'Library', 'Hostel A', 'Hostel B', 'Hostel C',
        'Faculty Housing', 'Sports Complex', 'Cafeteria', 'Admin Block',
        'Research Center', 'Innovation Hub', 'Medical Center', 'Engineering Block',
        'Science Block', 'Arts Block', 'Management Block'
    ],
    INDIAN_FIRST_NAMES: [
        'Aarav', 'Vivaan', 'Aditya', 'Vihaan', 'Arjun', 'Sai', 'Reyansh', 'Ayaan',
        'Krishna', 'Ishaan', 'Shaurya', 'Atharv', 'Advik', 'Pranav', 'Rishabh',
        'Ananya', 'Diya', 'Priya', 'Kavya', 'Anika', 'Saanvi', 'Ira', 'Myra',
        'Sara', 'Anaya', 'Zara', 'Kiara', 'Navya', 'Riya', 'Sana', 'Neha',
        'Rohan', 'Aryan', 'Karan', 'Varun', 'Rahul', 'Amit', 'Raj', 'Dev',
        'Siddharth', 'Harsh', 'Yash', 'Nikhil', 'Akash', 'Vikram', 'Suresh'
    ],
    INDIAN_LAST_NAMES: [
        'Sharma', 'Verma', 'Gupta', 'Singh', 'Kumar', 'Agarwal', 'Jain', 'Bansal',
        'Mehta', 'Shah', 'Patel', 'Joshi', 'Desai', 'Modi', 'Rao', 'Reddy',
        'Nair', 'Iyer', 'Menon', 'Pillai', 'Das', 'Ghosh', 'Mukherjee', 'Bose',
        'Chatterjee', 'Banerjee', 'Dutta', 'Roy', 'Saha', 'Chakraborty'
    ]
};

// Utility functions
function generatePhoneNumber() {
    return `+91${faker.datatype.number({ min: 7000000000, max: 9999999999 })}`;
}

function generateStudentId(year, department, index) {
    const deptCode = department.substring(0, 3).toUpperCase();
    const yearCode = (new Date().getFullYear() - year + 1).toString().slice(-2);
    return `S${faker.datatype.number({ min: 10000, max: 99999 })}`;
}

function generateStaffId(index) {
    return `T${faker.datatype.number({ min: 1000, max: 9999 })}`;
}

function generateCardId() {
    return `C${faker.datatype.number({ min: 1000, max: 9999 })}`;
}

function generateDeviceHash() {
    return `DH${faker.random.alphaNumeric(12).toLowerCase()}`;
}

function generateFaceId() {
    return `F${faker.datatype.number({ min: 100000, max: 999999 })}`;
}

function generateFaceEmbedding() {
    // Generate 128-dimensional face embedding (simulated)
    return Array.from({ length: 128 }, () => 
        parseFloat((Math.random() * 2 - 1).toFixed(6))
    );
}

function generateEmail(firstName, lastName, type, entityId) {
    const name = `${firstName.toLowerCase()}.${lastName.toLowerCase()}`;
    const userId = entityId.replace('E', 'user');
    return `${userId}@campus.edu`;
}

function getRandomIndianName() {
    const firstName = faker.random.arrayElement(CONFIG.INDIAN_FIRST_NAMES);
    const lastName = faker.random.arrayElement(CONFIG.INDIAN_LAST_NAMES);
    return { firstName, lastName };
}

// Main generation function
function generateEntities() {
    console.log('🏗️  Generating synthetic entity data...');
    
    const entities = [];
    let studentIndex = 1;
    let staffIndex = 1;
    
    // Create output directory
    if (!fs.existsSync(CONFIG.OUTPUT_DIR)) {
        fs.mkdirSync(CONFIG.OUTPUT_DIR, { recursive: true });
    }
    
    for (let i = 0; i < CONFIG.TOTAL_ENTITIES; i++) {
        const rand = Math.random();
        let entityType, entityId, year = null, studentId = null, staffId = null;
        
        // Determine entity type
        if (rand < CONFIG.STUDENTS_RATIO) {
            entityType = 'student';
            year = faker.random.arrayElement(CONFIG.YEARS);
            studentId = generateStudentId(year, faker.random.arrayElement(CONFIG.DEPARTMENTS), studentIndex++);
        } else if (rand < CONFIG.STUDENTS_RATIO + CONFIG.FACULTY_RATIO) {
            entityType = 'faculty';
            staffId = generateStaffId(staffIndex++);
        } else {
            entityType = 'staff';
            staffId = generateStaffId(staffIndex++);
        }
        
        const { firstName, lastName } = getRandomIndianName();
        const department = faker.random.arrayElement(CONFIG.DEPARTMENTS);
        const entityIdNum = `E${String(100000 + i).padStart(6, '0')}`;
        
        const entity = {
            entity_id: entityIdNum,
            name: `${firstName} ${lastName}`,
            role: entityType,
            email: generateEmail(firstName, lastName, entityType, entityIdNum),
            department: department,
            student_id: studentId || '',
            staff_id: staffId || '',
            card_id: generateCardId(),
            device_hash: generateDeviceHash(),
            face_id: generateFaceId(),
            
            // Additional fields for comprehensive entity data
            first_name: firstName,
            last_name: lastName,
            phone: generatePhoneNumber(),
            year: year || '',
            date_of_birth: faker.date.between('1980-01-01', '2005-12-31').toISOString().split('T')[0],
            gender: faker.random.arrayElement(['Male', 'Female', 'Other']),
            address: faker.address.streetAddress(),
            city: faker.address.city(),
            state: faker.address.state(),
            pincode: faker.address.zipCode(),
            emergency_contact: generatePhoneNumber(),
            blood_group: faker.random.arrayElement(['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']),
            hostel: entityType === 'student' ? faker.random.arrayElement(['Hostel A', 'Hostel B', 'Hostel C']) : '',
            room_number: entityType === 'student' ? `${faker.datatype.number({ min: 100, max: 999 })}` : '',
            office_location: entityType !== 'student' ? `${faker.random.arrayElement(CONFIG.BUILDINGS)}, Room ${faker.datatype.number({ min: 100, max: 999 })}` : '',
            joining_date: faker.date.between('2015-01-01', '2024-01-01').toISOString().split('T')[0],
            status: faker.random.arrayElement(['active', 'active', 'active', 'active', 'inactive']), // 80% active
            face_embedding: JSON.stringify(generateFaceEmbedding()),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
        };
        
        entities.push(entity);
        
        // Progress indicator
        if ((i + 1) % 500 === 0) {
            console.log(`   Generated ${i + 1}/${CONFIG.TOTAL_ENTITIES} entities...`);
        }
    }
    
    // Write to CSV file (compatible with existing format)
    const csvWriter = createCsvWriter({
        path: path.join(CONFIG.OUTPUT_DIR, 'student_or_staff_profiles.csv'),
        header: [
            { id: 'entity_id', title: 'entity_id' },
            { id: 'name', title: 'name' },
            { id: 'role', title: 'role' },
            { id: 'email', title: 'email' },
            { id: 'department', title: 'department' },
            { id: 'student_id', title: 'student_id' },
            { id: 'staff_id', title: 'staff_id' },
            { id: 'card_id', title: 'card_id' },
            { id: 'device_hash', title: 'device_hash' },
            { id: 'face_id', title: 'face_id' }
        ]
    });
    
    // Write comprehensive CSV
    const comprehensiveCsvWriter = createCsvWriter({
        path: path.join(CONFIG.OUTPUT_DIR, 'comprehensive_entity_profiles.csv'),
        header: [
            { id: 'entity_id', title: 'entity_id' },
            { id: 'name', title: 'name' },
            { id: 'first_name', title: 'first_name' },
            { id: 'last_name', title: 'last_name' },
            { id: 'role', title: 'role' },
            { id: 'email', title: 'email' },
            { id: 'phone', title: 'phone' },
            { id: 'department', title: 'department' },
            { id: 'year', title: 'year' },
            { id: 'student_id', title: 'student_id' },
            { id: 'staff_id', title: 'staff_id' },
            { id: 'card_id', title: 'card_id' },
            { id: 'device_hash', title: 'device_hash' },
            { id: 'face_id', title: 'face_id' },
            { id: 'date_of_birth', title: 'date_of_birth' },
            { id: 'gender', title: 'gender' },
            { id: 'address', title: 'address' },
            { id: 'city', title: 'city' },
            { id: 'state', title: 'state' },
            { id: 'pincode', title: 'pincode' },
            { id: 'emergency_contact', title: 'emergency_contact' },
            { id: 'blood_group', title: 'blood_group' },
            { id: 'hostel', title: 'hostel' },
            { id: 'room_number', title: 'room_number' },
            { id: 'office_location', title: 'office_location' },
            { id: 'joining_date', title: 'joining_date' },
            { id: 'status', title: 'status' },
            { id: 'created_at', title: 'created_at' },
            { id: 'updated_at', title: 'updated_at' }
        ]
    });
    
    return Promise.all([
        csvWriter.writeRecords(entities),
        comprehensiveCsvWriter.writeRecords(entities)
    ]).then(() => {
        console.log('✅ Entity profiles generated successfully!');
        console.log(`   📊 Total entities: ${entities.length}`);
        console.log(`   👨‍🎓 Students: ${entities.filter(e => e.role === 'student').length}`);
        console.log(`   👨‍🏫 Faculty: ${entities.filter(e => e.role === 'faculty').length}`);
        console.log(`   👨‍💼 Staff: ${entities.filter(e => e.role === 'staff').length}`);
        console.log(`   📁 Files: student_or_staff_profiles.csv, comprehensive_entity_profiles.csv`);
        
        // Also save as JSON for easier processing
        fs.writeFileSync(
            path.join(CONFIG.OUTPUT_DIR, 'entities.json'),
            JSON.stringify(entities, null, 2)
        );
        
        return entities;
    }).catch(error => {
        console.error('❌ Error generating entities:', error);
        throw error;
    });
}

// Export for use in other generators
module.exports = { generateEntities, CONFIG };

// Run if called directly
if (require.main === module) {
    generateEntities()
        .then(() => {
            console.log('🎉 Entity generation completed!');
            process.exit(0);
        })
        .catch(error => {
            console.error('💥 Entity generation failed:', error);
            process.exit(1);
        });
}