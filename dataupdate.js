#!/usr/bin/env node
/* Convenience wrapper: allow running `node dataupdate.js` from the repository root.
   This simply loads the actual backend script at backend/src/scripts/dataupdate.js
   which contains the Express endpoints and the guarded data generator.
*/
try {
  require('./backend/src/scripts/dataupdate.js');
} catch (err) {
  console.error('Failed to load backend/src/scripts/dataupdate.js:', err);
  process.exit(1);
}
