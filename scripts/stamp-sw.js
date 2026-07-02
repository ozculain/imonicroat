#!/usr/bin/env node
/* =========================================================================
   Stamp sw.js VERSION from a content hash of the precached files.

   The browser only re-installs a service worker (and re-runs precache) when
   sw.js itself changes byte-for-byte. Hand-bumping VERSION is easy to forget,
   which ships a stale offline shell. Run this as a release step so any change
   to a precached asset automatically changes VERSION:

       node scripts/stamp-sw.js

   Also exports computeVersion() so the test suite can assert the stamp is
   fresh. No dependencies; reads the FILES array straight out of sw.js.
   ========================================================================= */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');

function computeVersion() {
  const sw = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  const m = sw.match(/const FILES = \[([\s\S]*?)\]/);
  if (!m) throw new Error('Could not find the FILES array in sw.js');
  const files = m[1].match(/'([^']+)'/g).map(s => s.slice(1, -1)).filter(f => f !== './');
  const h = crypto.createHash('sha256');
  for (const f of files) {
    const p = path.join(root, f);
    if (!fs.existsSync(p)) throw new Error('Precached file is missing on disk: ' + f);
    h.update(f).update(fs.readFileSync(p));
  }
  return 'imonicroat-' + h.digest('hex').slice(0, 10);
}

module.exports = { computeVersion };

if (require.main === module) {
  try {
    const swPath = path.join(root, 'sw.js');
    const sw = fs.readFileSync(swPath, 'utf8');
    const version = computeVersion();
    if (sw.includes(`const VERSION = '${version}';`)) {
      console.log('sw.js already stamped → VERSION = ' + version);
      process.exit(0);
    }
    const next = sw.replace(/const VERSION = '[^']*';/, `const VERSION = '${version}';`);
    if (next === sw) { console.error('Could not rewrite VERSION (pattern not found).'); process.exit(1); }
    fs.writeFileSync(swPath, next);
    console.log('Stamped sw.js → VERSION = ' + version);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
