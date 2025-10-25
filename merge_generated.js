#!/usr/bin/env node
/* Convenience wrapper: allow running `node merge_generated.js` from the repository root.
   This simply loads the actual backend script at backend/src/scripts/merge_generated.js
*/
try {
  require('./backend/src/scripts/merge_generated.js');
} catch (err) {
  console.error('Failed to load backend/src/scripts/merge_generated.js:', err);
  process.exit(1);
}
