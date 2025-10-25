const mongoose = require('mongoose');
require('dotenv').config();

const User = require('../models/User');
const Entity = require('../models/Entity');

async function linkUsersToEntities() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/campus-security');
    console.log('Connected to MongoDB');

    // Map system users to some entities from the dataset
    const userEntityMapping = {
      'admin@campus.edu': 'E100000',    // Map admin to first entity
      'security@campus.edu': 'E100001', // Map security officer to second entity
      'operator@campus.edu': 'E100002', // Map operator to third entity
      'viewer@campus.edu': 'E100003'    // Map viewer to fourth entity
    };

    for (const [email, entityId] of Object.entries(userEntityMapping)) {
      // Find the user
      const user = await User.findOne({ email });
      if (!user) {
        console.log(`User not found: ${email}`);
        continue;
      }

      // Find the entity
      const entity = await Entity.findById(entityId);
      if (!entity) {
        console.log(`Entity not found: ${entityId}`);
        continue;
      }

      // Update the entity to include this user's email in identifiers
      const updateResult = await Entity.updateOne(
        { _id: entityId },
        { $set: { 'identifiers.system_user_email': email } }
      );

      console.log(`Update result for ${entityId}:`, updateResult);
      console.log(`Linked ${email} to entity ${entityId} (${entity.profile.name}) with face_id ${entity.identifiers.face_id}`);
    }

    // Verify the linkages
    console.log('\nVerifying linkages:');
    for (const email of Object.keys(userEntityMapping)) {
      const entity = await Entity.findOne({ 'identifiers.system_user_email': email });
      if (entity) {
        console.log(`✓ ${email} -> ${entity._id} -> ${entity.identifiers.face_id}`);
      }
    }

  } catch (error) {
    console.error('Error linking users to entities:', error);
  } finally {
    await mongoose.connection.close();
    console.log('Database connection closed');
  }
}

linkUsersToEntities();