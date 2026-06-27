/* =========================================================================
   Integration boot test: loads the REAL app scripts into a jsdom DOM and drives
   onboarding → a full lesson → sync → secondary screens → a flag correction,
   asserting no runtime errors and that data persists. This covers the DOM +
   app-wiring that the pure-logic suite (run-tests.js) cannot.

   Opt-in (keeps the app itself zero-dependency). First install the dev deps:

       npm install --no-save jsdom fake-indexeddb
       node tests/boot.js

   Without those packages this script SKIPS (exit 0) rather than failing, so the
   default `node tests/run-tests.js` flow stays dependency-free.
   ========================================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const { webcrypto } = require('crypto');

let JSDOM, fakeIDB;
try {
  JSDOM = require('jsdom').JSDOM;
  fakeIDB = require('fake-indexeddb');
} catch (e) {
  console.log('SKIP tests/boot.js — install dev deps to run: npm install --no-save jsdom fake-indexeddb');
  process.exit(0);
}

const ROOT = path.join(__dirname, '..');
const ORDER = ['icons', 'srs', 'db', 'clock', 'stats', 'vault', 'sync', 'audio', 'content', 'exercises', 'app'];
const scripts = ORDER.map(n => fs.readFileSync(path.join(ROOT, 'js', n + '.js'), 'utf8'));

const errors = [];
let gistStore = null;

// In-memory GitHub-gist API emulator so syncNow runs its real
// read → merge → write → reconcile → importAll → clock path (payload encrypted).
function makeFakeFetch() {
  const store = { gists: {}, rev: 0 };
  gistStore = store;
  const resp = (status, body, headers) => ({
    ok: status >= 200 && status < 300, status,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
    headers: { get: h => (headers || {})[String(h).toLowerCase()] || null }
  });
  let idc = 0;
  return async function (url, opts) {
    opts = opts || {}; const method = opts.method || 'GET';
    if (url === 'https://api.github.com/gists' && method === 'POST') {
      const id = 'gist' + (++idc);
      store.gists[id] = JSON.parse(opts.body).files['imonicroat-sync.json'].content;
      return resp(201, { id });
    }
    const m = url.match(/^https:\/\/api\.github\.com\/gists\/(.+)$/);
    if (m) {
      const id = m[1];
      if (method === 'GET') {
        const content = store.gists[id] != null ? store.gists[id] : '';
        return resp(200, { files: { 'imonicroat-sync.json': { content, truncated: false } } }, { etag: '"' + store.rev + '"' });
      }
      if (method === 'PATCH') {
        store.gists[id] = JSON.parse(opts.body).files['imonicroat-sync.json'].content;
        store.rev++;
        return resp(200, { id });
      }
    }
    return resp(404, {});
  };
}

const html = `<!DOCTYPE html><html><head></head><body><div id="app"></div>
${scripts.map(s => `<script>${s}\n</script>`).join('\n')}
</body></html>`;

const dom = new JSDOM(html, {
  runScripts: 'dangerously',
  pretendToBeVisual: true,
  url: 'http://localhost/',
  beforeParse(window) {
    if (!window.crypto || !window.crypto.subtle) {
      try { Object.defineProperty(window, 'crypto', { value: webcrypto, configurable: true }); } catch (e) {}
    }
    if (typeof window.TextEncoder === 'undefined') window.TextEncoder = TextEncoder;
    if (typeof window.TextDecoder === 'undefined') window.TextDecoder = TextDecoder;
    try { Object.defineProperty(window, 'indexedDB', { value: fakeIDB.indexedDB, configurable: true }); } catch (e) {}
    window.IDBKeyRange = fakeIDB.IDBKeyRange;
    window.fetch = makeFakeFetch();
    window.onerror = (msg, src, line, col, err) => { errors.push('ERR: ' + msg + (err && err.stack ? ' | ' + err.stack.split('\n')[1] : '')); };
    window.addEventListener('unhandledrejection', e => {
      const r = e.reason; errors.push('REJ: ' + (r && r.message ? r.message + ' | ' + (r.stack || '').split('\n')[1] : r));
    });
    // jsdom implements no serviceWorker, so app.js's guard skips registration.
  }
});

const win = dom.window;
const doc = win.document;
const q = sel => doc.querySelector(sel);
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(sel, ms = 4000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (q(sel)) return true; await sleep(25); }
  return false;
}

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) pass++; else { fail++; console.error('  FAIL: ' + name + (detail ? ' — ' + detail : '')); }
}

(async () => {
  if (!await waitFor('#p1name')) { console.error('FAIL: onboarding never rendered'); finish(); return; }
  q('#p1name').value = 'Imo'; q('#p2name').value = 'Nicro';
  q('#passA').value = 'test1234'; q('#passB').value = 'test1234';
  q('#startBtn').click();

  if (!await waitFor('#startLesson')) { console.error('FAIL: home never rendered'); finish(); return; }
  check('onboarding creates two profiles', win.CRO.app.state.profiles.length === 2);
  q('#startLesson').click();
  await sleep(60);
  check('lesson session started', !!win.CRO.app.state.session);

  for (let clicks = 0; clicks < 200; clicks++) {
    const st = win.CRO.app.state;
    if (st.view === 'summary' || !st.session) break;
    const cont = q('#contBtn') || q('#introNext'); if (cont) { cont.click(); await sleep(15); continue; }
    const fb = q('.fb-next'); if (fb) { fb.click(); await sleep(15); continue; }
    const choice = q('.choice:not([disabled])'); if (choice) { choice.click(); await sleep(15); continue; }
    const pair = doc.querySelector('.pairbtn:not(.done)');
    if (pair) { doc.querySelectorAll('.pairbtn:not(.done)').forEach(b => b.click()); await sleep(60); continue; }
    const typed = q('input.typed');
    if (typed) { typed.value = 'x'; const c = [...doc.querySelectorAll('.btn.primary')].find(b => b.textContent.trim() === 'Check'); if (c) { c.click(); await sleep(15); continue; } }
    const tile = q('.tilebank .tile:not(.used)');
    if (tile) { doc.querySelectorAll('.tilebank .tile:not(.used)').forEach(t => t.click()); const c = [...doc.querySelectorAll('.btn.primary')].find(b => b.textContent.trim() === 'Check'); if (c) c.click(); await sleep(15); continue; }
    await sleep(30);
  }
  check('lesson reaches summary', win.CRO.app.state.view === 'summary');
  check('grading persisted SRS cards', (await win.CRO.db.getAll('srs')).length > 0);
  check('activity recorded (per-device key)', (await win.CRO.db.getAll('activity')).length > 0);

  // integrated sync: connect, encrypt round-trip, H1 concurrent-write-survives
  check('gist sync connected', await win.CRO.sync.setupGist('ghp_test', ''));
  await win.CRO.sync.syncNow('manual');
  check('sync state ok', win.CRO.sync.status.state === 'ok');
  const blob = gistStore.gists[Object.keys(gistStore.gists)[0]];
  let isCipher = false, profilesBack = 0;
  try {
    const parsed = JSON.parse(blob);
    isCipher = parsed.app === 'imonicroat-enc';
    const dec = await win.CRO.vault.decrypt(parsed, await win.CRO.vault.getPassphrase());
    profilesBack = (dec.profiles || []).length;
  } catch (e) { errors.push('sync-verify: ' + e.message); }
  check('remote payload is ciphertext', isCipher);
  check('remote decrypts back to both profiles', profilesBack === 2, String(profilesBack));

  const probeKey = win.CRO.app.state.activeId + '|w:__probe__';
  const syncP = win.CRO.sync.syncNow('lesson');
  await win.CRO.db.put('srs', { key: probeKey, cardId: 'w:__probe__', clk: 999999, dev: 'probe', stability: 7 });
  await syncP;
  check('H1: write during in-flight sync survives the commit', !!(await win.CRO.db.get('srs', probeKey)));

  // secondary screens
  win.CRO.app.render('variety'); await sleep(30);
  if (q('#v-hr')) { q('#v-hr').value = 'fjaka'; q('#v-en').value = 'idle bliss'; q('#v-add').click(); await sleep(40); }
  check('variety entry added (stamp→clock write)', (await win.CRO.db.getAll('variety')).filter(v => !v.deleted).length >= 1);
  win.CRO.app.render('settings'); await sleep(40);
  check('settings screen renders', !!q('#s-export') && !!q('#s-setpass'));
  win.CRO.app.render('review'); await sleep(30);
  check('review screen renders', q('main.review') != null);

  // flag → correction (override + SRS reset + flag-resolve, all stamp→clock)
  const word = win.CRO.content.WORDS[0];
  const cardId = 'w:' + word.id;
  const flag = { id: 'fprobe', cardId, note: 'test', profileId: win.CRO.app.state.activeId, createdAt: 1, updatedAt: 1, resolved: false };
  await win.CRO.db.put('flags', flag);
  win.CRO.app.state.flags.push(flag);
  win.CRO.app.render('review'); await sleep(40);
  const card = q('.flagcard');
  if (card) {
    card.querySelector('.e-hr').value = 'KORRIGIRANO';
    card.querySelector('.e-save').click();
    await sleep(80);
    const ov = (await win.CRO.db.getAll('overrides')).find(o => o.id === word.id);
    check('correction override applied to content', !!(ov && ov.patch.hr === 'KORRIGIRANO') && win.CRO.content.item(cardId).hr === 'KORRIGIRANO');
    check('flag resolved after correction', (await win.CRO.db.get('flags', 'fprobe')).resolved === true);
  } else { check('flag correction card rendered', false); }

  finish();
})().catch(e => { console.error('HARNESS CRASH: ' + e.message + '\n' + e.stack); process.exit(1); });

function finish() {
  check('no runtime errors during the whole flow', errors.length === 0, errors.join(' || '));
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
