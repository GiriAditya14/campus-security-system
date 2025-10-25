const express = require('express');
const multer = require('multer');
const EmbeddingService = require('../services/embeddingService');
const mlServiceClient = require('../services/mlServiceClient');
const Entity = require('../models/Entity');
const router = express.Router();

// Multer memory storage for uploads
const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 5 * 1024 * 1024 } }); // 5MB

/**
 * @route POST /api/cctv/recognize
 * @desc Upload an image, convert to embedding and match against known face embeddings
 * @access Private
 */
router.post('/recognize', upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Image file is required' });
    }

    // Convert image buffer to base64 for ML service
    const base64 = req.file.buffer.toString('base64');
    const imageData = { data: base64 };

    // Generate face embedding via embedding service (which will call ML service)
    const EmbService = new EmbeddingService();
    const embeddingResult = await EmbService.generateFaceEmbeddings([imageData]);
    const embedding = embeddingResult.embeddings && embeddingResult.embeddings[0];

    if (!embedding) {
      return res.status(500).json({ success: false, message: 'Failed to generate embedding' });
    }

    // Call ML service to match embedding
    const matchResp = await mlServiceClient.matchFaceWithRetry(embedding, 0.8);
    if (!matchResp || !matchResp.success || !matchResp.data) {
      return res.status(500).json({ success: false, message: 'Face matching failed', detail: matchResp.error });
    }

    const best = matchResp.data.best_match;
    const matches = matchResp.data.matches || [];

    if (!best) {
      return res.status(404).json({ success: false, message: 'No matching face found', matches });
    }

    // Try to resolve the best match to an entity in our DB
    let entity = null;
    if (best.entity_id) {
      entity = await Entity.findById(best.entity_id).lean();
    }

    if (!entity && best.face_id) {
      entity = await Entity.findOne({ 'identifiers.face_id': best.face_id }).lean();
    }

    return res.json({
      success: true,
      match: best,
      confidence: matchResp.data.confidence || best.confidence || 0,
      matches,
      entity
    });

  } catch (error) {
    console.error('CCTV recognize error:', error);
    return res.status(500).json({ success: false, message: 'Internal server error', error: error.message });
  }
});

module.exports = router;
