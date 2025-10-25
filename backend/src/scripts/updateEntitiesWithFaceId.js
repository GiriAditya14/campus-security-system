const mongoose = require('mongoose');
const csv = require('csv-parser');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const Entity = require('../models/Entity');

async function updateEntitiesWithFaceId() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/campus-security');
    console.log('Connected to MongoDB');

    const csvFilePath = path.join(__dirname, '..', 'data', 'student or staff profiles.csv');
    const faceIdMapping = {};

    // Read CSV and build mapping
    await new Promise((resolve, reject) => {
      fs.createReadStream(csvFilePath)
        .pipe(csv())
        .on('data', (row) => {
          if (row.entity_id && row.face_id) {
            faceIdMapping[row.entity_id] = row.face_id;
          }
        })
        .on('end', resolve)
        .on('error', reject);
    });

    console.log(`Found ${Object.keys(faceIdMapping).length} entity-face mappings`);

    // Update entities with face_id
    let updatedCount = 0;
    const entities = await Entity.find({});

    for (const entity of entities) {
      const faceId = faceIdMapping[entity._id]; // Use _id instead of entity_id
      if (faceId) {
        await Entity.updateOne(
          { _id: entity._id },
          { $set: { 'identifiers.face_id': faceId } }
        );
        updatedCount++;
        if (updatedCount % 100 === 0) {
          console.log(`Updated ${updatedCount} entities...`);
        }
      }
    }

    console.log(`Successfully updated ${updatedCount} entities with face_id`);

    // Verify a few entities
    const sampleEntities = await Entity.find({}).limit(3);
    console.log('\nSample updated entities:');
    sampleEntities.forEach(entity => {
      console.log(`Entity ${entity._id}: face_id = ${entity.identifiers.face_id}`);
    });

  } catch (error) {
    console.error('Error updating entities:', error);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed');
  }
}

updateEntitiesWithFaceId();