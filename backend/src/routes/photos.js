const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();
const { authenticate } = require('../middleware/auth');
const { auditLogger } = require('../middleware/auditLogger');
const Entity = require('../models/Entity');
const User = require('../models/User');

/**
 * @route GET /api/photos/profile/:faceId
 * @desc Get profile photo by face ID
 * @access Private
 */
router.get('/profile/:faceId', authenticate, async (req, res) => {
  try {
    const { faceId } = req.params;
    
    // Validate face ID format (should be like F100000)
    if (!faceId.match(/^F\d+$/)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid face ID format'
      });
    }

    // Construct the image path
    const imagePath = path.join(__dirname, '..', 'data', 'face_images', `${faceId}.jpg`);
    
    // Check if file exists
    if (!fs.existsSync(imagePath)) {
      return res.status(404).json({
        success: false,
        message: 'Profile photo not found'
      });
    }

    // Set appropriate headers for image response
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
    
    // Send the image file
    res.sendFile(imagePath);

  } catch (error) {
    console.error('Error serving profile photo:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while retrieving profile photo'
    });
  }
});

/**
 * @route GET /api/photos/entity/:entityId
 * @desc Get profile photo by entity ID (looks up face_id from entity)
 * @access Private
 */
router.get('/entity/:entityId', authenticate, async (req, res) => {
  try {
    const { entityId } = req.params;
    
    // Find the entity to get the face_id
    const entity = await Entity.findOne({ _id: entityId });
    
    if (!entity || !entity.identifiers.face_id) {
      return res.status(404).json({
        success: false,
        message: 'Entity not found or no associated face ID'
      });
    }

    // Construct the image path using the face_id
    const imagePath = path.join(__dirname, '..', 'data', 'face_images', `${entity.identifiers.face_id}.jpg`);
    
    // Check if file exists
    if (!fs.existsSync(imagePath)) {
      return res.status(404).json({
        success: false,
        message: 'Profile photo not found'
      });
    }

    // Set appropriate headers for image response
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
    
    // Send the image file
    res.sendFile(imagePath);

  } catch (error) {
    console.error('Error serving entity profile photo:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while retrieving entity profile photo'
    });
  }
});

/**
 * @route GET /api/photos/user/:userId
 * @desc Get profile photo by user ID (looks up entity by employee_id or email, then gets face_id)
 * @access Private
 */
router.get('/user/:userId', authenticate, async (req, res) => {
  try {
    const { userId } = req.params;
    
    // Find the user
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Try to find associated entity by employee_id first, then by email, then by system_user_email
    let entity = null;
    
    if (user.profile && user.profile.employee_id) {
      entity = await Entity.findOne({ 
        'identifiers.employee_id': user.profile.employee_id 
      });
    }
    
    // If not found by employee_id, try by email
    if (!entity && user.email) {
      entity = await Entity.findOne({ 
        'identifiers.email': user.email 
      });
    }

    // If not found by email, try by system_user_email (for admin users)
    if (!entity && user.email) {
      entity = await Entity.findOne({ 
        'identifiers.system_user_email': user.email 
      });
    }

    // If no entity found or no face_id, return 404
    if (!entity || !entity.identifiers.face_id) {
      return res.status(404).json({
        success: false,
        message: 'No associated entity or face ID found for user'
      });
    }

    // Construct the image path using the face_id
    const imagePath = path.join(__dirname, '..', 'data', 'face_images', `${entity.identifiers.face_id}.jpg`);
    
    // Check if file exists
    if (!fs.existsSync(imagePath)) {
      return res.status(404).json({
        success: false,
        message: 'Profile photo not found'
      });
    }

    // Set appropriate headers for image response
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache for 24 hours
    
    // Send the image file
    res.sendFile(imagePath);

  } catch (error) {
    console.error('Error serving user profile photo:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while retrieving user profile photo'
    });
  }
});

/**
 * @route GET /api/photos/fallback
 * @desc Get fallback avatar image
 * @access Private
 */
router.get('/fallback', authenticate, async (req, res) => {
  try {
    // Create a simple SVG avatar as fallback
    const svgAvatar = `
      <svg width="100" height="100" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
        <circle cx="50" cy="50" r="50" fill="#e5e7eb"/>
        <circle cx="50" cy="35" r="15" fill="#9ca3af"/>
        <ellipse cx="50" cy="75" rx="25" ry="20" fill="#9ca3af"/>
      </svg>
    `;

    res.setHeader('Content-Type', 'image/svg+xml');
    res.setHeader('Cache-Control', 'public, max-age=3600'); // Cache for 1 hour
    res.send(svgAvatar);

  } catch (error) {
    console.error('Error serving fallback avatar:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while retrieving fallback avatar'
    });
  }
});

module.exports = router;