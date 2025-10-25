const express = require('express');
const cors = require('cors');
const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');

const app = express();
const PORT =  5005;

// Middleware
app.use(cors());
app.use(express.json());

// Settings (development-safe defaults)
const DATA_GENERATOR_ENABLED = (process.env.DATA_GENERATOR_ENABLED === 'true');
const DATA_GENERATOR_INTERVAL_MS = parseInt(process.env.DATA_GENERATOR_INTERVAL_MS || '5000', 10);
// target: 'dev' (writes to .gen.csv alongside originals) or 'prod' (write to original files)
const DATA_GENERATOR_TARGET = process.env.DATA_GENERATOR_TARGET || 'dev';
// if true, endpoints will read generated files instead of originals
const DATA_GENERATOR_USE_GENERATED_SOURCE = (process.env.DATA_GENERATOR_USE_GENERATED_SOURCE === 'true');

// Base CSV file paths (original canonical files)
const BASE_CSV_FILES = {
  cardSwipes: path.join(__dirname, '../data/campus card_swipes.csv'),
  cctvFrames: path.join(__dirname, '../data/cctv_frames.csv'),
  wifiLogs: path.join(__dirname, '../data/wifi_associations_logs.csv')
};

// If target is dev, generated files will be created with a .gen suffix next to originals
function getTargetPath(key) {
  const base = BASE_CSV_FILES[key];
  if (DATA_GENERATOR_TARGET === 'dev') return base + '.gen.csv';
  return base; // prod
}

// When serving data, allow reading generated files if configured
function getSourcePath(key) {
  if (DATA_GENERATOR_USE_GENERATED_SOURCE) return getTargetPath(key);
  return BASE_CSV_FILES[key];
}

// Ensure file headers exist (simple, idempotent)
const HEADERS = {
  cardSwipes: 'card_id,location_id,timestamp\n',
  cctvFrames: 'frame_id,location_id,timestamp,face_id\n',
  wifiLogs: 'device_hash,ap_id,timestamp\n'
};

async function ensureFileHasHeader(filePath, header) {
  try {
    await fs.promises.access(filePath, fs.constants.F_OK);
    // file exists - do nothing
  } catch (err) {
    // create file with header
    await fs.promises.writeFile(filePath, header, 'utf8');
  }
}

// Basic CSV escaping
function escapeCSV(field) {
  if (field == null) return '';
  const s = String(field);
  if (s.includes(',') || s.includes('\"') || s.includes('\n')) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

// Per-file write queue to avoid concurrent appendFile races
const writeQueues = new Map();
function appendToCSV(filePath, data) {
  const csvLine = data.map(escapeCSV).join(',') + '\n';
  const prev = writeQueues.get(filePath) || Promise.resolve();
  const p = prev.then(() => fs.promises.appendFile(filePath, csvLine, 'utf8'))
    .catch(err => {
      console.error('Append error for', filePath, err);
    });
  writeQueues.set(filePath, p);
  return p;
}

// Data Generator Functions
function pad(n) { return String(n).padStart(2, '0'); }

function formatDateForCSV(date) {
  // card_swipes uses YYYY-MM-DD HH:mm:ss
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function formatShortDate(date) {
  // cctv_frames & wifi use M/D/YYYY H:mm (matches existing dataset)
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hours = date.getHours();
  const minutes = pad(date.getMinutes());
  return `${month}/${day}/${year} ${hours}:${minutes}`;
}

function generateCardSwipe() {
  const locations = ['GYM', 'ADMIN_LOBBY', 'LIB_ENT', 'AUDITORIUM', 'LAB_101', 'LAB_305', 'CAF_01', 'HOSTEL_GATE'];
  const cardId = 'C' + Math.floor(Math.random() * 10000);
  const timestamp = formatDateForCSV(new Date());
  return {
    card_id: cardId,
    location_id: locations[Math.floor(Math.random() * locations.length)],
    timestamp: timestamp
  };
}

function generateCCTVFrame() {
  const locations = ['LAB_101', 'LIB_ENT', 'ADMIN_LOBBY', 'AUDITORIUM', 'GYM', 'LAB_305', 'HOSTEL_GATE', 'CAF_01'];
  const frameId = 'FR' + (700000 + Math.floor(Math.random() * 100000));
  const faceId = Math.random() > 0.3 ? 'F' + Math.floor(Math.random() * 105000) : '';
  const timestamp = formatShortDate(new Date());
  return {
    frame_id: frameId,
    location_id: locations[Math.floor(Math.random() * locations.length)],
    timestamp: timestamp,
    face_id: faceId
  };
}

function generateWifiLog() {
  const aps = ['AP_LIB_1', 'AP_ENG_5', 'AP_AUD_3', 'AP_CAF_3', 'AP_LAB_4', 'AP_HOSTEL_4', 'AP_ADMIN_1', 'AP_ENG_2', 'AP_LAB_2'];
  const deviceHash = 'DH' + Math.random().toString(16).substr(2, 12);
  const timestamp = formatShortDate(new Date());
  return {
    device_hash: deviceHash,
    ap_id: aps[Math.floor(Math.random() * aps.length)],
    timestamp: timestamp
  };
}

// Auto-generate data (development only) - guarded behind env var
let generatorInterval = null;
async function startGenerator(intervalMs = DATA_GENERATOR_INTERVAL_MS, once = false) {
  // Decide target files
  const targets = {
    cardSwipes: getTargetPath('cardSwipes'),
    cctvFrames: getTargetPath('cctvFrames'),
    wifiLogs: getTargetPath('wifiLogs')
  };

  // Ensure headers exist on generated files
  await ensureFileHasHeader(targets.cardSwipes, HEADERS.cardSwipes);
  await ensureFileHasHeader(targets.cctvFrames, HEADERS.cctvFrames);
  await ensureFileHasHeader(targets.wifiLogs, HEADERS.wifiLogs);

  async function produceOne() {
    try {
      const cardSwipe = generateCardSwipe();
      await appendToCSV(targets.cardSwipes, [cardSwipe.card_id, cardSwipe.location_id, cardSwipe.timestamp]);

      const cctvFrame = generateCCTVFrame();
      await appendToCSV(targets.cctvFrames, [cctvFrame.frame_id, cctvFrame.location_id, cctvFrame.timestamp, cctvFrame.face_id]);

      const wifiLog = generateWifiLog();
      await appendToCSV(targets.wifiLogs, [wifiLog.device_hash, wifiLog.ap_id, wifiLog.timestamp]);

      console.log('New data generated at', new Date().toISOString(), '->', targets);
    } catch (error) {
      console.error('Error generating data:', error);
    }
  }

  if (once) {
    await produceOne();
    return;
  }

  generatorInterval = setInterval(produceOne, intervalMs);
  console.log(`Data generator started (every ${intervalMs}ms) writing to ${DATA_GENERATOR_TARGET === 'dev' ? '*.gen.csv (safe dev files)' : 'original CSV files'}`);
}

// Prevent multiple concurrent generator instances (pid lock)
const LOCK_FILE = path.join(__dirname, 'dataupdate.pid');
function writeLockFile() {
  try {
    if (fs.existsSync(LOCK_FILE)) {
      const existingPid = parseInt(fs.readFileSync(LOCK_FILE, 'utf8'), 10);
      if (!Number.isNaN(existingPid)) {
        try {
          process.kill(existingPid, 0);
          console.error('Another data generator process is already running with PID', existingPid);
          process.exit(1);
        } catch (e) {
          // process not running, continue
        }
      }
    }
    fs.writeFileSync(LOCK_FILE, String(process.pid), 'utf8');
  } catch (err) {
    console.warn('Could not write lock file', LOCK_FILE, err);
  }
}

function removeLockFile() {
  try { if (fs.existsSync(LOCK_FILE)) fs.unlinkSync(LOCK_FILE); } catch (e) {}
}

process.on('exit', removeLockFile);
process.on('SIGINT', () => { removeLockFile(); process.exit(); });
process.on('SIGTERM', () => { removeLockFile(); process.exit(); });

// Helper function to read CSV and parse data
function readCSV(filePath) {
  return new Promise((resolve, reject) => {
    const results = [];
    if (!fs.existsSync(filePath)) return resolve(results);
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', (error) => reject(error));
  });
}

// Helper function to parse date from CSV
function parseDate(dateStr) {
  if (!dateStr) return new Date(0);
  // Handle format: "2025-09-13 14:02:40" or "9/16/2025 19:22"
  if (dateStr.includes('/')) {
    const [datePart, timePart] = dateStr.split(' ');
    const [month, day, year] = datePart.split('/').map(x => parseInt(x, 10));
    const [hours = 0, minutes = 0] = (timePart || '').split(':').map(x => parseInt(x, 10));
    return new Date(year, month - 1, day, hours || 0, minutes || 0);
  }
  return new Date(dateStr);
}

// Filter data by time period
function filterByTimePeriod(data, filterType, filterValue) {
  const now = new Date();
  return data.filter(item => {
    const itemDate = parseDate(item.timestamp);
    if (filterType === 'hour') {
      const hoursDiff = (now - itemDate) / (1000 * 60 * 60);
      return hoursDiff <= parseInt(filterValue, 10);
    } else if (filterType === 'day') {
      const daysDiff = (now - itemDate) / (1000 * 60 * 60 * 24);
      return daysDiff <= parseInt(filterValue, 10);
    } else if (filterType === 'month') {
      const monthsDiff = (now.getFullYear() - itemDate.getFullYear()) * 12 +
                         (now.getMonth() - itemDate.getMonth());
      return monthsDiff <= parseInt(filterValue, 10);
    }
    return true;
  });
}

// API Routes
app.get('/api/card-swipes', async (req, res) => {
  try {
    const { filterType, filterValue } = req.query;
    let data = await readCSV(getSourcePath('cardSwipes'));
    if (filterType && filterValue) data = filterByTimePeriod(data, filterType, filterValue);
    data.sort((a, b) => parseDate(b.timestamp) - parseDate(a.timestamp));
    res.json(data.slice(0, 100));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/cctv-frames', async (req, res) => {
  try {
    const { filterType, filterValue } = req.query;
    let data = await readCSV(getSourcePath('cctvFrames'));
    if (filterType && filterValue) data = filterByTimePeriod(data, filterType, filterValue);
    data.sort((a, b) => parseDate(b.timestamp) - parseDate(a.timestamp));
    res.json(data.slice(0, 100));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/wifi-logs', async (req, res) => {
  try {
    const { filterType, filterValue } = req.query;
    let data = await readCSV(getSourcePath('wifiLogs'));
    if (filterType && filterValue) data = filterByTimePeriod(data, filterType, filterValue);
    data.sort((a, b) => parseDate(b.timestamp) - parseDate(a.timestamp));
    res.json(data.slice(0, 100));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/stats', async (req, res) => {
  try {
    const cardData = await readCSV(getSourcePath('cardSwipes'));
    const cctvData = await readCSV(getSourcePath('cctvFrames'));
    const wifiData = await readCSV(getSourcePath('wifiLogs'));
    res.json({ cardSwipes: cardData.length, cctvFrames: cctvData.length, wifiLogs: wifiData.length });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Start server
app.listen(PORT, async () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('Generator enabled:', DATA_GENERATOR_ENABLED);

  // If generator is enabled, create lock and start
  if (DATA_GENERATOR_ENABLED) {
    writeLockFile();

    // support --once flag
    const once = process.argv.includes('--once');
    await startGenerator(DATA_GENERATOR_INTERVAL_MS, once);
    if (once) {
      console.log('Generator ran once (--once) and will not continue; exiting.');
      process.exit(0);
    }
  } else {
    console.log('Data generator is disabled by default. To enable set DATA_GENERATOR_ENABLED=true.');
    console.log('By default generated rows are written to .gen.csv files (DATA_GENERATOR_TARGET=dev).');
  }
});