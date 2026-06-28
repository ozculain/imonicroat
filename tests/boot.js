/* =========================================================================
   Integration boot test: loads the REAL app scripts into a jsdom DOM and drives
   the actual UI. Two scenarios:
     A. IndexedDB backend + gist sync — onboarding → a full lesson → encrypted
        sync → variety/settings/review screens → a flag correction.
     B. localStorage backend + File System Access (shared-folder) sync — connect
        a faked file handle, sync, and confirm a write during sync survives.
   Both assert no runtime errors and that data persists / round-trips.

   Opt-in (keeps the app itself zero-dependency). Install the dev deps first:

       npm install --no-save jsdom fake-indexeddb
       node tests/boot.js

   Without those packages this SKIPS (exit 0), so `node tests/run-tests.js`
   stays dependency-free.
   ========================================================================= */
'use strict';
const fs = require('fs');
const path = require('path');
const { webcrypto } = require('crypto');

let JSDOM, fakeIDB;
try { JSDOM = require('jsdom').JSDOM; fakeIDB = require('fake-indexeddb'); }
catch (e) { console.log('SKIP tests/boot.js — install dev deps to run: npm install --no-save jsdom fake-indexeddb'); process.exit(0); }

const ROOT = path.join(__dirname, '..');
const ORDER = ['icons', 'srs', 'db', 'clock', 'stats', 'vault', 'sync', 'audio', 'content', 'exercises', 'app'];
const SCRIPTS = ORDER.map(n => fs.readFileSync(path.join(ROOT, 'js', n + '.js'), 'utf8'));
const HTML = `<!DOCTYPE html><html><head></head><body><div id="app"></div>
${SCRIPTS.map(s => `<script>${s}\n</script>`).join('\n')}</body></html>`;

let pass = 0, fail = 0;
const check = (name, cond, detail) => { if (cond) pass++; else { fail++; console.error('  FAIL: ' + name + (detail ? ' — ' + detail : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

function commonInject(window, errors) {
  if (!window.crypto || !window.crypto.subtle) { try { Object.defineProperty(window, 'crypto', { value: webcrypto, configurable: true }); } catch (e) {} }
  if (typeof window.TextEncoder === 'undefined') window.TextEncoder = TextEncoder;
  if (typeof window.TextDecoder === 'undefined') window.TextDecoder = TextDecoder;
  window.onerror = (m, s, l, c, e) => errors.push('ERR: ' + m + (e && e.stack ? ' | ' + e.stack.split('\n')[1] : ''));
  window.addEventListener('unhandledrejection', e => { const r = e.reason; errors.push('REJ: ' + (r && r.message ? r.message + ' | ' + (r.stack || '').split('\n')[1] : r)); });
}

function makeDom(beforeParseExtra) {
  const errors = [];
  const dom = new JSDOM(HTML, {
    runScripts: 'dangerously', pretendToBeVisual: true, url: 'http://localhost/',
    beforeParse(window) { commonInject(window, errors); beforeParseExtra(window); }
  });
  const doc = dom.window.document;
  return { win: dom.window, doc, q: s => doc.querySelector(s), errors,
    waitFor: async (s, ms = 4000) => { const t = Date.now(); while (Date.now() - t < ms) { if (doc.querySelector(s)) return true; await sleep(20); } return false; } };
}

async function onboard(ctx) {
  await ctx.waitFor('#p1name');
  ctx.q('#p1name').value = 'Imo'; ctx.q('#p2name').value = 'Nicro';
  ctx.q('#startBtn').click();
  await ctx.waitFor('#startLesson');
}

// in-memory GitHub-gist API emulator (encrypts the real payload)
function makeFakeFetch(state) {
  const resp = (status, body, headers) => ({ ok: status >= 200 && status < 300, status, json: async () => body, text: async () => (typeof body === 'string' ? body : JSON.stringify(body)), headers: { get: h => (headers || {})[String(h).toLowerCase()] || null } });
  let idc = 0;
  return async (url, opts) => {
    opts = opts || {}; const method = opts.method || 'GET';
    if (url === 'https://api.github.com/gists' && method === 'POST') { const id = 'g' + (++idc); state.gists[id] = JSON.parse(opts.body).files['imonicroat-sync.json'].content; return resp(201, { id }); }
    const m = url.match(/^https:\/\/api\.github\.com\/gists\/(.+)$/);
    if (m) {
      const id = m[1];
      if (method === 'GET') return resp(200, { files: { 'imonicroat-sync.json': { content: state.gists[id] != null ? state.gists[id] : '', truncated: false } } }, { etag: '"' + state.rev + '"' });
      if (method === 'PATCH') { state.gists[id] = JSON.parse(opts.body).files['imonicroat-sync.json'].content; state.rev++; return resp(200, { id }); }
    }
    return resp(404, {});
  };
}

// ---------- Scenario A: IndexedDB + gist sync, full UI drive ----------
async function scenarioGist() {
  const gist = { gists: {}, rev: 0 };
  const ctx = makeDom(window => {
    try { Object.defineProperty(window, 'indexedDB', { value: fakeIDB.indexedDB, configurable: true }); } catch (e) {}
    window.IDBKeyRange = fakeIDB.IDBKeyRange;
    window.fetch = makeFakeFetch(gist);
  });
  const { win, doc, q, errors } = ctx;
  const err0 = () => errors.length;

  await onboard(ctx);
  check('A: onboarding creates two profiles', win.CRO.app.state.profiles.length === 2);
  check('C: onboarding sets no lock by default', (await win.CRO.vault.hasLock()) === false);
  await win.CRO.vault.setSyncPassphrase('test1234'); // encrypt sync without enabling the lock
  q('#startLesson').click(); await sleep(60);
  check('A: lesson session started', !!win.CRO.app.state.session);
  for (let i = 0; i < 200; i++) {
    const st = win.CRO.app.state; if (st.view === 'summary' || !st.session) break;
    const cont = q('#contBtn') || q('#introNext'); if (cont) { cont.click(); await sleep(15); continue; }
    const fb = q('.fb-next'); if (fb) { fb.click(); await sleep(15); continue; }
    const ch = q('.choice:not([disabled])'); if (ch) { ch.click(); await sleep(15); continue; }
    const pair = doc.querySelector('.pairbtn:not(.done)'); if (pair) { doc.querySelectorAll('.pairbtn:not(.done)').forEach(b => b.click()); await sleep(60); continue; }
    const typed = q('input.typed'); if (typed) { typed.value = 'x'; const c = [...doc.querySelectorAll('.btn.primary')].find(b => b.textContent.trim() === 'Check'); if (c) { c.click(); await sleep(15); continue; } }
    const tile = q('.tilebank .tile:not(.used)'); if (tile) { doc.querySelectorAll('.tilebank .tile:not(.used)').forEach(t => t.click()); const c = [...doc.querySelectorAll('.btn.primary')].find(b => b.textContent.trim() === 'Check'); if (c) c.click(); await sleep(15); continue; }
    await sleep(30);
  }
  check('A: lesson reaches summary', win.CRO.app.state.view === 'summary');
  check('A: grading persisted SRS cards (IndexedDB)', (await win.CRO.db.getAll('srs')).length > 0);
  check('A: activity recorded (per-device key)', (await win.CRO.db.getAll('activity')).length > 0);

  check('A: gist sync connected', await win.CRO.sync.setupGist('ghp_test', ''));
  await win.CRO.sync.syncNow('manual');
  check('A: sync state ok', win.CRO.sync.status.state === 'ok');
  let isCipher = false, profilesBack = 0;
  try { const parsed = JSON.parse(gist.gists[Object.keys(gist.gists)[0]]); isCipher = parsed.app === 'imonicroat-enc'; profilesBack = ((await win.CRO.vault.decrypt(parsed, await win.CRO.vault.getPassphrase())).profiles || []).length; } catch (e) { errors.push('A sync-verify: ' + e.message); }
  check('A: remote payload is ciphertext', isCipher);
  check('A: remote decrypts back to both profiles', profilesBack === 2, String(profilesBack));

  const probe = win.CRO.app.state.activeId + '|w:__probe__';
  const p = win.CRO.sync.syncNow('lesson');
  await win.CRO.db.put('srs', { key: probe, cardId: 'w:__probe__', clk: 999999, dev: 'probe', stability: 7 });
  await p;
  check('A: H1 — write during in-flight sync survives the commit', !!(await win.CRO.db.get('srs', probe)));

  // D: the connected device produces a valid one-paste pairing code
  const pcode = win.CRO.sync.pairingCode();
  check('D: pairing code round-trips', !!pcode && !!win.CRO.sync._parsePairing(pcode));

  // C: the lock is an off-by-default toggle, separate from the sync passphrase
  await win.CRO.vault.enableLock('test1234');
  check('C: enabling the lock turns it on', (await win.CRO.vault.hasLock()) === true);
  await win.CRO.vault.disableLock();
  check('C: disabling keeps sync working (passphrase retained)',
    (await win.CRO.vault.hasLock()) === false && (await win.CRO.vault.getPassphrase()) === 'test1234');

  win.CRO.app.render('variety'); await sleep(30);
  if (q('#v-hr')) { q('#v-hr').value = 'fjaka'; q('#v-en').value = 'idle bliss'; q('#v-add').click(); await sleep(40); }
  check('A: variety entry added (stamp→clock)', (await win.CRO.db.getAll('variety')).filter(v => !v.deleted).length >= 1);
  win.CRO.app.render('settings'); await sleep(40);
  check('A: settings screen renders', !!q('#s-export') && !!q('#s-locktoggle') && !!q('#s-weekly'));
  win.CRO.app.render('review'); await sleep(30);
  check('A: review screen renders', q('main.review') != null);

  const word = win.CRO.content.WORDS[0], cardId = 'w:' + word.id;
  await win.CRO.db.put('flags', { id: 'fprobe', cardId, profileId: win.CRO.app.state.activeId, createdAt: 1, updatedAt: 1, resolved: false });
  win.CRO.app.state.flags.push({ id: 'fprobe', cardId, resolved: false });
  win.CRO.app.render('review'); await sleep(40);
  const card = q('.flagcard');
  if (card) {
    card.querySelector('.e-hr').value = 'KORRIGIRANO'; card.querySelector('.e-save').click(); await sleep(80);
    const ov = (await win.CRO.db.getAll('overrides')).find(o => o.id === word.id);
    check('A: correction override applied to content', !!(ov && ov.patch.hr === 'KORRIGIRANO') && win.CRO.content.item(cardId).hr === 'KORRIGIRANO');
    check('A: flag resolved after correction', (await win.CRO.db.get('flags', 'fprobe')).resolved === true);
  } else check('A: flag correction card rendered', false);

  check('A: no runtime errors', errors.length === 0, errors.join(' || '));
}

// ---------- Scenario B: localStorage + File System Access transport ----------
async function scenarioFile() {
  const file = { blob: '' };
  const ctx = makeDom(window => {
    // no indexedDB → localStorage backend (so db skips persisting the handle)
    const handle = {
      name: 'imonicroat-sync.json',
      async getFile() { return { text: async () => file.blob }; },
      async createWritable() { return { write: async d => { file.blob = d; }, close: async () => {} }; },
      async queryPermission() { return 'granted'; },
      async requestPermission() { return 'granted'; }
    };
    window.showSaveFilePicker = async () => handle;
    window.showOpenFilePicker = async () => [handle];
  });
  const { win, errors } = ctx;
  await onboard(ctx);
  await win.CRO.vault.setSyncPassphrase('test1234');

  check('B: file transport supported (pickers present)', win.CRO.sync.status.supported === true);
  const ok = await win.CRO.sync.setup(true);      // create file + first sync
  await win.CRO.sync.syncNow('manual');           // read → merge → rev-recheck → write
  check('B: file sync connected', ok && win.CRO.sync.status.transport === 'file' && win.CRO.sync.status.state === 'ok');
  let isCipher = false, profilesBack = 0;
  try { const parsed = JSON.parse(file.blob); isCipher = parsed.app === 'imonicroat-enc'; profilesBack = ((await win.CRO.vault.decrypt(parsed, await win.CRO.vault.getPassphrase())).profiles || []).length; } catch (e) { errors.push('B verify: ' + e.message); }
  check('B: file payload is ciphertext', isCipher);
  check('B: file decrypts back to both profiles', profilesBack === 2, String(profilesBack));

  const probe = win.CRO.app.state.activeId + '|w:__fprobe__';
  const p = win.CRO.sync.syncNow('lesson');
  await win.CRO.db.put('srs', { key: probe, cardId: 'w:__fprobe__', clk: 999999, dev: 'probe', stability: 7 });
  await p;
  check('B: H1 — write during in-flight file sync survives', !!(await win.CRO.db.get('srs', probe)));
  check('B: no runtime errors', errors.length === 0, errors.join(' || '));
}

(async () => {
  await scenarioGist();
  await scenarioFile();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS CRASH: ' + e.message + '\n' + e.stack); process.exit(1); });
