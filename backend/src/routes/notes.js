const express = require('express');
const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');

const router = express.Router();

// GET /api/notes
router.get('/', async (req, res) => {
  try {
    const { category, entity_id, q, date_from, date_to } = req.query;
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.max(1, parseInt(req.query.limit, 10) || 50);

    // Try likely csv locations
    const possiblePaths = [
      path.join(__dirname, '..', '..', 'data', 'free_text_notes.csv'),
      path.join(__dirname, '..', 'data', 'free_text_notes.csv'),
      path.resolve(process.cwd(), 'backend', 'data', 'free_text_notes.csv'),
      path.resolve(process.cwd(), 'data', 'free_text_notes.csv')
    ];

    const csvPath = possiblePaths.find(p => fs.existsSync(p));
    if (!csvPath) {
      return res.status(404).json({ success: false, message: 'Notes data not found' });
    }

    const items = [];
    return new Promise((resolve, reject) => {
      fs.createReadStream(csvPath)
        .pipe(csv(['note_id','entity_id','category','text','timestamp']))
        .on('data', (row) => {
          // basic trim
          const item = {
            note_id: (row.note_id || '').trim(),
            entity_id: (row.entity_id || '').trim(),
            category: (row.category || '').trim(),
            text: (row.text || '').trim(),
            timestamp: (row.timestamp || '').trim()
          };

          // Filters
          if (category && item.category.toLowerCase() !== category.toLowerCase()) return;
          if (entity_id && item.entity_id.toLowerCase() !== entity_id.toLowerCase()) return;
          if (q && !((item.text || '').toLowerCase().includes(q.toLowerCase()))) return;
          if (date_from && new Date(item.timestamp) < new Date(date_from)) return;
          if (date_to && new Date(item.timestamp) > new Date(date_to)) return;

          items.push(item);
        })
        .on('end', () => {
          // sort newest first
          items.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));

          const total = items.length;
          const pages = Math.ceil(total / limit);
          const start = (page - 1) * limit;
          const data = items.slice(start, start + limit);

          res.json({
            success: true,
            notes: data,
            page,
            limit,
            total,
            pages
          });
          resolve();
        })
        .on('error', (err) => {
          reject(err);
        });
    });

  } catch (error) {
    console.error('Notes error:', error);
    return res.status(500).json({ success: false, message: 'Failed to fetch notes', error: error.message });
  }
});

module.exports = router;
