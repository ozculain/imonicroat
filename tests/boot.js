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

async function onboard(ctx, name1, name2) {
  await ctx.waitFor('#p1name');
  ctx.q('#p1name').value = name1 || 'Imo'; ctx.q('#p2name').value = name2 || 'Nicro';
  ctx.q('#startBtn').click();
  await ctx.waitFor('#startLesson');
}

// Click through a running lesson until the summary. Answers are arbitrary —
// this is flow coverage, not accuracy.
async function driveLesson(ctx) {
  const { win, doc, q } = ctx;
  for (let i = 0; i < 200; i++) {
    const st = win.CRO.app.state; if (st.view === 'summary' || !st.session) break;
    const cont = q('#contBtn') || q('#introNext'); if (cont) { cont.click(); await sleep(15); continue; }
    const fb = q('.fb-next'); if (fb) { fb.click(); await sleep(15); continue; }
    const rev = [...doc.querySelectorAll('.btn')].find(b => b.textContent.trim() === 'Show the Croatian');
    if (rev) { rev.click(); await sleep(15); continue; }
    const said = [...doc.querySelectorAll('.btn')].find(b => /Said it/.test(b.textContent));
    if (said) { said.click(); await sleep(15); continue; }
    const ch = q('.choice:not([disabled])'); if (ch) { ch.click(); await sleep(15); continue; }
    const pair = doc.querySelector('.pairbtn:not(.done)');
    if (pair) {
      // answer pairs CORRECTLY (the step carries its words) — deterministic Good
      // grades, which also exercises the organic mission-setting path
      const st2 = win.CRO.app.state.session;
      const words = (st2 && st2.steps[st2.idx] && st2.steps[st2.idx].words) || [];
      for (const w of words) {
        const btns = [...doc.querySelectorAll('.pairbtn:not(.done)')];
        const bh = btns.find(b => b.textContent === w.hr);
        const be = btns.find(b => b.textContent === w.en);
        if (bh && be) { bh.click(); be.click(); await sleep(20); }
      }
      await sleep(450); // onDone fires 350ms after the final match
      continue;
    }
    const typed = q('input.typed'); if (typed) { typed.value = 'x'; const c = [...doc.querySelectorAll('.btn.primary')].find(b => b.textContent.trim() === 'Check'); if (c) { c.click(); await sleep(15); continue; } }
    const tile = q('.tilebank .tile:not(.used)'); if (tile) { doc.querySelectorAll('.tilebank .tile:not(.used)').forEach(t => t.click()); const c = [...doc.querySelectorAll('.btn.primary')].find(b => b.textContent.trim() === 'Check'); if (c) c.click(); await sleep(15); continue; }
    await sleep(30);
  }
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

  await onboard(ctx, 'Imo', 'Ni<b>&"cro'); // hostile partner name: escaping regression
  check('A: onboarding creates two profiles', win.CRO.app.state.profiles.length === 2);
  const lead = doc.querySelector('.h2h-lead');
  check('E: HTML in a profile name is escaped, not parsed',
    !!lead && !lead.querySelector('b') && lead.textContent.includes('Ni<b>&"cro'), lead && lead.innerHTML);
  check('C: onboarding sets no lock by default', (await win.CRO.vault.hasLock()) === false);
  check('pace: onboarding select persisted the default', ((await win.CRO.db.getMeta('settings')) || {}).newPerLesson === 4);
  await win.CRO.vault.setSyncPassphrase('test1234'); // encrypt sync without enabling the lock
  win.CRO.app.state.settings.newPerLesson = 5; // ≥5 session words → the pairs step appears (answered correctly by the driver)
  q('#startLesson').click(); await sleep(60);
  check('A: lesson session started', !!win.CRO.app.state.session);
  check('V: no-voice notice shown', [...doc.querySelectorAll('.toast')].some(t2 => /No Croatian voice/.test(t2.textContent)));
  await driveLesson(ctx);
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
  await win.CRO.db.put('flags', { id: 'fprobe', cardId, note: '<img src=x>', profileId: win.CRO.app.state.activeId, createdAt: 1, updatedAt: 1, resolved: false });
  win.CRO.app.state.flags.push({ id: 'fprobe', cardId, note: '<img src=x>', resolved: false });
  win.CRO.app.render('review'); await sleep(40);
  check('E: flag note HTML is escaped on review', q('.flag-note') && !q('.flag-note img'));
  const card = q('.flagcard');
  if (card) {
    card.querySelector('.e-hr').value = 'KORRIGIRANO'; card.querySelector('.e-save').click(); await sleep(80);
    const ov = (await win.CRO.db.getAll('overrides')).find(o => o.id === word.id);
    check('A: correction override applied to content', !!(ov && ov.patch.hr === 'KORRIGIRANO') && win.CRO.content.item(cardId).hr === 'KORRIGIRANO');
    check('A: flag resolved after correction', (await win.CRO.db.get('flags', 'fprobe')).resolved === true);
  } else check('A: flag correction card rendered', false);

  // A3: correct answers during the lesson set today's mission organically
  const mis0 = await win.CRO.db.getMeta('mission');
  check('A3: the lesson set a mission organically (via the correctly-answered pairs)',
    !!mis0 && mis0.date === win.CRO.stats.todayKey() && mis0.done === false, JSON.stringify(mis0));
  win.CRO.app.render('home'); await sleep(40);
  check('A3: mission card renders on home', !!q('.mission'));
  const mbtn = q('.mission-btn');
  const xpBefore = (await win.CRO.db.getAll('activity')).reduce((s, a) => s + (a.xp || 0), 0);
  if (mbtn) { mbtn.click(); await sleep(50); }
  const xpAfter = (await win.CRO.db.getAll('activity')).reduce((s, a) => s + (a.xp || 0), 0);
  check('A3: marking the mission done pays +5 XP', !!mbtn && xpAfter === xpBefore + 5, xpBefore + '→' + xpAfter);
  check('A3: mission done state persists', ((await win.CRO.db.getMeta('mission')) || {}).done === true);

  // M: the modal closes on Escape
  win.CRO.app.render('home'); await sleep(40);
  const gBtn = [...doc.querySelectorAll('.unit-actions .btn')].find(b => /Grammar notes/.test(b.textContent));
  gBtn.click(); await sleep(30);
  check('M: notes modal opens', !!doc.querySelector('.modal-back'));
  doc.dispatchEvent(new win.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await sleep(30);
  check('M: Escape closes the modal', !doc.querySelector('.modal-back'));

  // A1 regression: a variety entry WITH a meaning joins the next lesson as a
  // real card — this used to crash the session (oursIntro had no handler)
  const oursId = (await win.CRO.db.getAll('variety')).find(v => !v.deleted && v.en).id;
  win.CRO.app.render('home'); await sleep(30);
  q('#startLesson').click(); await sleep(60);
  check('A1: second lesson starts with an ours entry present', !!win.CRO.app.state.session);
  await driveLesson(ctx);
  check('A1: second lesson reaches the summary (no oursIntro crash)', win.CRO.app.state.view === 'summary');
  check('A1: the ours card was introduced and graded',
    !!win.CRO.app.state.srs['v:' + oursId] || !!(await win.CRO.db.get('srs', win.CRO.app.state.activeId + '|v:' + oursId)));

  // N: the price drill and speak reps join a lesson once eligible, and their
  // real UI drives cleanly to the summary
  win.CRO.audio.available = () => true; // jsdom has no speechSynthesis; speak() stays a safe no-op
  ['dvadeset', 'sto-num'].forEach(id => { win.CRO.app.state.srs['w:' + id] = win.CRO.srs.newCard('w:' + id); });
  win.CRO.app.state.srs['w:kava'] = Object.assign(win.CRO.srs.newCard('w:kava'),
    { state: 'review', due: Date.now() - 1, stability: 30, lastReview: Date.now() - 5 * 864e5 });
  win.CRO.app.render('home'); await sleep(30);
  q('#startLesson').click(); await sleep(60);
  const probeKinds = ((win.CRO.app.state.session && win.CRO.app.state.session.steps) || [])
    .filter(s => s.kind === 'ex').map(s => { const e = s.make(); return e && e.type; });
  check('N: price drill inserted when eligible', probeKinds.includes('priceListen'));
  check('N: speak rep inserted from a review-strength card', probeKinds.includes('speak'));
  await driveLesson(ctx);
  check('N: probe lesson (speak + price UI) reaches summary', win.CRO.app.state.view === 'summary');

  // C2: enabling the lock under a different passphrase than sync is refused.
  // enableLock hashes with 600k PBKDF2 iterations — poll instead of guessing.
  const waitUntil = async (fn, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await sleep(40); } return false; };
  win.CRO.app.render('settings'); await sleep(40);
  const passBefore = await win.CRO.vault.getPassphrase();
  q('#s-pass').value = 'DIFFERENT99'; q('#s-locktoggle').click(); await sleep(300);
  check('C2: mismatched lock passphrase refused while synced',
    (await win.CRO.vault.hasLock()) === false && (await win.CRO.vault.getPassphrase()) === passBefore);
  q('#s-pass').value = passBefore; q('#s-locktoggle').click();
  check('C2: matching lock passphrase turns the lock on', await waitUntil(() => win.CRO.vault.hasLock()));
  check('C2: the sync passphrase stayed intact', (await win.CRO.vault.getPassphrase()) === passBefore);
  await sleep(150); // let the handler's post-hash UI writes settle
  await win.CRO.vault.disableLock();

  // D2: a truncated backup file is refused before anything is replaced
  const badFile = new win.File([JSON.stringify({ app: 'imonicroat', flags: [] })], 'bad.json', { type: 'application/json' });
  const fin = q('#s-file');
  Object.defineProperty(fin, 'files', { value: [badFile], configurable: true });
  fin.dispatchEvent(new win.Event('change'));
  await sleep(120);
  check('D2: truncated backup refused — profiles untouched', (await win.CRO.db.getAll('profiles')).length === 2);

  // T: themes — selectable per device, applied to <body>, persisted
  win.CRO.app.render('settings'); await sleep(40);
  check('T: theme select present', !!q('#s-theme'));
  q('#s-theme').value = 'papir'; q('#s-theme').dispatchEvent(new win.Event('change')); await sleep(60);
  check('T: theme applied to body', doc.body.dataset.theme === 'papir');
  check('T: theme persisted in settings', (((await win.CRO.db.getMeta('settings')) || {}).theme) === 'papir');
  q('#s-theme').value = 'ljeto'; q('#s-theme').dispatchEvent(new win.Event('change')); await sleep(40);
  check('T: theme switches back', doc.body.dataset.theme === 'ljeto');

  // L: full lock cycle through the real UI
  await win.CRO.vault.enableLock(passBefore);
  await win.CRO.vault.lockNow();
  win.CRO.app.boot();
  check('L: lock screen appears on boot', await ctx.waitFor('#lockPass'));
  q('#lockPass').value = 'WRONG'; q('#lockBtn').click();
  check('L: wrong passphrase is rejected', await waitUntil(async () => q('#lockErr') && q('#lockErr').style.display !== 'none'));
  check('L: still locked after the wrong passphrase', (await win.CRO.vault.isUnlocked()) === false);
  q('#lockPass').value = passBefore; q('#lockBtn').click();
  check('L: right passphrase unlocks through to home', await ctx.waitFor('#startLesson', 12000));
  await win.CRO.vault.disableLock();

  // C2: gist connect without a passphrase is blocked (not-connected settings).
  // Wait out the rekey sync first — disconnecting mid-flight is its own test:
  await waitUntil(() => win.CRO.sync.status.state !== 'syncing');
  await win.CRO.sync.disconnect();
  await sleep(100);
  check('C2: disconnect is not resurrected by a stale sync', win.CRO.sync.status.connected === false);
  win.CRO.app.render('settings');
  check('C2: settings shows the connect form after disconnect', await ctx.waitFor('#g-token'));
  q('#g-token').value = 'ghp_second'; q('#g-pass').value = '';
  q('#g-connect').click(); await sleep(60);
  check('C2: gist connect without a passphrase is blocked', win.CRO.sync.status.connected === false);

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

// ---------- Scenario P: two devices pair through the real UI and converge ----------
async function scenarioPair() {
  const gist = { gists: {}, rev: 0 };
  // Both windows run the localStorage backend (per-window isolation; the
  // fake-indexeddb module is a process-wide singleton, so two "devices" on it
  // would silently share one database).
  const A = makeDom(w => { w.fetch = makeFakeFetch(gist); });
  await onboard(A);
  await A.win.CRO.vault.setSyncPassphrase('pair-pass');
  check('P: device A connects gist sync', await A.win.CRO.sync.setupGist('ghp_A', ''));
  A.win.CRO.app.render('settings'); await sleep(40);
  const codeInp = A.doc.querySelector('.paircode');
  check('P: settings shows a pairing code', !!codeInp && !!codeInp.value);
  const code = codeInp ? codeInp.value : '';

  // Device B joins from its onboarding screen with the code + passphrase
  const B = makeDom(w => { w.fetch = makeFakeFetch(gist); });
  await B.waitFor('#connectBtn');
  B.q('#connectBtn').click(); await sleep(30);
  check('P: connect modal opens on B', !!B.q('#ob-paircode'));
  B.q('#ob-paircode').value = code;
  B.q('#ob-pass').value = 'pair-pass';
  B.q('#ob-gconnect').click();
  check('P: B lands on home with both profiles', await B.waitFor('#startLesson', 8000) && B.win.CRO.app.state.profiles.length === 2,
    'profiles=' + B.win.CRO.app.state.profiles.length);

  // B practises as the second profile, then syncs
  const avatars = B.doc.querySelectorAll('.avatar-btn');
  if (avatars[1]) { avatars[1].click(); await sleep(60); }
  const p2 = B.win.CRO.app.state.activeId;
  check('P: B switched to the second profile', p2 === B.win.CRO.app.state.profiles[1].id);
  B.q('#startLesson').click(); await sleep(60);
  await driveLesson(B);
  check('P: B finishes a lesson', B.win.CRO.app.state.view === 'summary');
  await B.win.CRO.sync.syncNow('manual');
  check('P: B sync ok', B.win.CRO.sync.status.state === 'ok');

  // A pulls and sees the partner's day
  check('P: A re-sync succeeds', await A.win.CRO.sync.syncNow('manual'));
  const aActs = await A.win.CRO.db.getAll('activity');
  check("P: B's lesson activity arrived on A", aActs.some(a => a.profileId === p2 && (a.lessons || 0) > 0));
  const info = await A.win.CRO.app.streakInfo();
  check('P: A sees the partner done today', info.partnerDone === true);
  const aSrs = await A.win.CRO.db.getAll('srs');
  check("P: p2's SRS cards exist on A", aSrs.some(r => r.profileId === p2));
  check('P: no runtime errors (A)', A.errors.length === 0, A.errors.join(' || '));
  check('P: no runtime errors (B)', B.errors.length === 0, B.errors.join(' || '));
}

(async () => {
  await scenarioGist();
  await scenarioFile();
  await scenarioPair();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('HARNESS CRASH: ' + e.message + '\n' + e.stack); process.exit(1); });
