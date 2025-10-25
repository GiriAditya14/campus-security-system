#!/usr/bin/env node
/*
  Safe merge tool: append rows from generated .gen.csv files into canonical CSVs.

  Usage (dry-run, safe):
    node merge_generated.js

  To actually perform the merge (non-reversible unless you keep the backups),
    node merge_generated.js --confirm

  Optional flags:
    --remove    Remove the .gen.csv files after successful merge (only with --confirm)

  Behavior:
    - For each known file (card_swipes, cctv_frames, wifi_associations_logs) this
      script checks for BASE.csv.gen.csv. If found, it reads the generated file,
      removes the header if present, and appends the remaining rows to the
      canonical file after making a timestamped backup of the canonical file.
    - By default the script prints the planned actions (dry-run). Use --confirm to execute.
*/

const fs = require('fs');
const path = require('path');

const BASE_CSV_FILES = {
  cardSwipes: path.join(__dirname, '../data/campus card_swipes.csv'),
  cctvFrames: path.join(__dirname, '../data/cctv_frames.csv'),
  wifiLogs: path.join(__dirname, '../data/wifi_associations_logs.csv')
};

function timestamp() {
  const d = new Date();
  return d.toISOString().replace(/[:.]/g, '-');
}

async function fileExists(p) {
  try { await fs.promises.access(p, fs.constants.F_OK); return true; } catch (e) { return false; }
}

async function readAll(p) {
  return fs.promises.readFile(p, 'utf8');
}

function stripHeaderIfPresent(content, expectedHeader) {
  // Normalize line endings
  const lines = content.replace(/\r\n/g, '\n').split('\n');
  if (lines.length === 0) return [];
  // If first line equals expectedHeader (or contains the header columns), drop it
  const first = lines[0].trim();
  if (!first) return lines.filter(Boolean);
  if (first.toLowerCase().startsWith(expectedHeader.toLowerCase().split(',')[0])) {
    return lines.slice(1).filter(Boolean);
  }
  // otherwise assume the file already has no header
  return lines.filter(Boolean);
}

function getHeaderForKey(key) {
  if (key === 'cardSwipes') return 'card_id,location_id,timestamp';
  if (key === 'cctvFrames') return 'frame_id,location_id,timestamp,face_id';
  if (key === 'wifiLogs') return 'device_hash,ap_id,timestamp';
  return '';
}

async function merge({ confirm = false, remove = false } = {}) {
  for (const key of Object.keys(BASE_CSV_FILES)) {
    const base = BASE_CSV_FILES[key];
    const gen = base + '.gen.csv';
    const exists = await fileExists(gen);
    if (!exists) {
      console.log('[skip]', path.basename(gen), 'not present');
      continue;
    }

    console.log('[found]', path.basename(gen));
    const content = await readAll(gen);
    const header = getHeaderForKey(key);
    const rows = stripHeaderIfPresent(content, header);

    if (rows.length === 0) {
      console.log('  - no data rows found in', path.basename(gen), '-> skipping');
      continue;
    }

    console.log(`  - ${rows.length} data row(s) ready to append to ${path.basename(base)}`);

    if (!confirm) {
      console.log('  - DRY RUN: To perform the merge run with --confirm');
      continue;
    }

    // backup original
    const bak = base + `.backup.${timestamp()}`;
    await fs.promises.copyFile(base, bak);
    console.log('  - backup created:', path.basename(bak));

    // append rows to original
    const appendData = rows.map(r => r.endsWith('\n') ? r : r + '\n').join('');
    await fs.promises.appendFile(base, appendData, 'utf8');
    console.log('  - appended rows to', path.basename(base));

    if (remove) {
      await fs.promises.unlink(gen);
      console.log('  - removed generated file', path.basename(gen));
    }
  }
}

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    confirm: args.includes('--confirm'),
    remove: args.includes('--remove')
  };
}

async function main() {
  const opts = parseArgs();
  console.log('Merge generated .gen.csv into originals');
  if (!opts.confirm) console.log('Running in dry-run mode (no changes). Use --confirm to execute.');
  try {
    await merge(opts);
    console.log('Done.');
  } catch (err) {
    console.error('Error during merge:', err);
    process.exit(1);
  }
}

if (require.main === module) main();
