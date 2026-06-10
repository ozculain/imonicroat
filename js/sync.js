/* =========================================================================
   Two-device sync via a shared file (File System Access API).
   Point both computers at one imonicroat-sync.json in a cloud-synced folder
   (OneDrive / Dropbox / Google Drive). The app reads the file, merges it
   with local data using per-store conflict rules, writes the merge back —
   on boot, after every lesson, and after edits. No server, works offline
   (sync simply resumes next time the file is reachable).

   Merge rules (two writers, eventually consistent):
     profiles  → union by id (local wins on conflict)
     srs       → newest lastReview wins (ties: more reps)
     activity  → per profile-day: max(xp), max(lessons)  — max, not sum,
                 so repeated merges never double-count
     flags     → union; "resolved" is sticky
     overrides → latest editedAt wins
     variety   → latest updatedAt wins; deletions are tombstones
     meta      → never synced (device-local: active profile, settings, handle)
   ========================================================================= */
if (typeof window === 'undefined') { global.window = global; } // node test shim
(function () {
  'use strict';

  const HANDLE_KEY = 'syncHandle';
  const GIST_KEY = 'gistSync';
  const GIST_FILE = 'imonicroat-sync.json';
  const status = {
    supported: false,          // file-handle transport available (desktop Chromium)
    transport: null,           // 'file' | 'gist' | null
    connected: false, state: 'off', lastSync: 0, error: null, fileName: null
  };
  let handle = null;           // FileSystemFileHandle (desktop shared-folder transport)
  let gist = null;             // { token, id } (works on every browser, incl. phones)
  let syncing = false;

  function supported() {
    return typeof window.showSaveFilePicker === 'function' && typeof window.showOpenFilePicker === 'function';
  }

  /* ---------------- pure merge (node-testable) ---------------- */
  function unionBy(a, b, key, resolve) {
    const map = new Map();
    (a || []).forEach(x => map.set(x[key], x));
    (b || []).forEach(y => {
      const x = map.get(y[key]);
      map.set(y[key], x ? resolve(x, y) : y);
    });
    return [...map.values()];
  }

  function mergeDumps(local, remote) {
    const newer = (x, y, field) => ((y[field] || 0) > (x[field] || 0) ? y : x);
    return {
      app: 'imonicroat',
      version: local.version || 1,
      exportedAt: new Date().toISOString(),
      profiles: unionBy(local.profiles, remote.profiles, 'id', (x) => x),
      srs: unionBy(local.srs, remote.srs, 'key', (x, y) => {
        if ((y.lastReview || 0) !== (x.lastReview || 0)) return (y.lastReview || 0) > (x.lastReview || 0) ? y : x;
        return (y.reps || 0) > (x.reps || 0) ? y : x;
      }),
      activity: unionBy(local.activity, remote.activity, 'key', (x, y) =>
        Object.assign({}, x, { xp: Math.max(x.xp || 0, y.xp || 0), lessons: Math.max(x.lessons || 0, y.lessons || 0) })),
      flags: unionBy(local.flags, remote.flags, 'id', (x, y) => {
        const w = newer(x, y, 'updatedAt');
        return (x.resolved || y.resolved) ? Object.assign({}, w, { resolved: true }) : w;
      }),
      overrides: unionBy(local.overrides, remote.overrides, 'id', (x, y) => newer(x, y, 'editedAt')),
      variety: unionBy(local.variety, remote.variety, 'id', (x, y) => {
        const ts = v => v.updatedAt || v.createdAt || 0;
        return ts(y) > ts(x) ? y : x;
      }),
      meta: [] // device-local, never synced
    };
  }

  /* ---------------- file plumbing ---------------- */
  async function localDump() {
    const dump = await CRO.db.exportAll();
    dump.meta = []; // strip device-local keys (incl. the stored file handle)
    return dump;
  }

  /* ---- gist transport (any browser, any device, needs network) ---- */
  function gistHeaders() {
    return {
      'Authorization': 'Bearer ' + gist.token,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
  }

  async function gistRead() {
    const r = await fetch('https://api.github.com/gists/' + gist.id, { headers: gistHeaders() });
    if (r.status === 404) throw new Error('Gist not found — check the gist id.');
    if (r.status === 401 || r.status === 403) throw new Error('GitHub token rejected — check it has the "gist" scope.');
    if (!r.ok) throw new Error('GitHub error ' + r.status);
    const data = await r.json();
    const f = data.files && data.files[GIST_FILE];
    if (!f) return null;
    let text = f.content;
    if (f.truncated && f.raw_url) text = await (await fetch(f.raw_url)).text();
    if (!text || !text.trim()) return null;
    try { return JSON.parse(text); } catch (e) { return null; }
  }

  async function gistWrite(merged) {
    const body = JSON.stringify({ files: { [GIST_FILE]: { content: JSON.stringify(merged) } } });
    const r = await fetch('https://api.github.com/gists/' + gist.id, {
      method: 'PATCH', headers: gistHeaders(), body
    });
    if (!r.ok) throw new Error('GitHub write failed (' + r.status + ')');
  }

  async function gistCreate(token) {
    const r = await fetch('https://api.github.com/gists', {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json' },
      body: JSON.stringify({
        description: 'Imo i Nicro — Croatian app sync (private)',
        public: false,
        files: { [GIST_FILE]: { content: '{}' } }
      })
    });
    if (r.status === 401 || r.status === 403) throw new Error('Token rejected — it needs the "gist" scope.');
    if (!r.ok) throw new Error('Could not create gist (' + r.status + ')');
    return (await r.json()).id;
  }

  /* ---- transport-agnostic sync ---- */
  async function readRemote() {
    if (status.transport === 'gist') return gistRead();
    try {
      const file = await handle.getFile();
      const text = await file.text();
      return text.trim() ? JSON.parse(text) : null;
    } catch (e) { return null; /* unreadable/empty → treat as fresh */ }
  }

  async function writeRemote(merged) {
    if (status.transport === 'gist') return gistWrite(merged);
    const w = await handle.createWritable();
    await w.write(JSON.stringify(merged));
    await w.close();
  }

  async function syncNow(reason) {
    if (!status.transport || syncing) return false;
    if (status.transport === 'gist' && typeof navigator !== 'undefined' && navigator.onLine === false) {
      status.state = 'offline';
      return false; // no network — sync resumes next time
    }
    syncing = true;
    status.state = 'syncing';
    try {
      const remote = await readRemote();
      const local = await localDump();
      const merged = (remote && remote.app === 'imonicroat') ? mergeDumps(local, remote) : local;
      await CRO.db.importAll(merged);
      await writeRemote(merged);
      status.connected = true;
      status.state = 'ok';
      status.lastSync = Date.now();
      status.error = null;
      status.fileName = status.transport === 'gist' ? 'GitHub gist' : handle.name;
      return true;
    } catch (e) {
      // network failures are routine on phones — report softly
      status.state = (e && /fetch|network|failed to/i.test(e.message || '')) ? 'offline' : 'error';
      status.error = e.message;
      return false;
    } finally {
      syncing = false;
    }
  }

  /** Boot-time: restore whichever transport is configured; sync silently if possible. */
  async function init() {
    status.supported = supported();
    // gist transport first — it works everywhere and needs no permission prompt
    try {
      const g = await CRO.db.get('meta', GIST_KEY);
      if (g && g.value && g.value.token && g.value.id) {
        gist = g.value;
        status.transport = 'gist';
        status.connected = true;
        return syncNow('boot');
      }
    } catch (e) { /* fall through to file transport */ }
    if (!status.supported) return false;
    try {
      const rec = await CRO.db.get('meta', HANDLE_KEY);
      handle = rec && rec.value && typeof rec.value.queryPermission === 'function' ? rec.value : null;
    } catch (e) { handle = null; }
    if (!handle) return false;
    status.transport = 'file';
    status.fileName = handle.name;
    try {
      const p = await handle.queryPermission({ mode: 'readwrite' });
      if (p === 'granted') return syncNow('boot');
      status.state = 'needs-permission';
      status.connected = true;
      return false;
    } catch (e) {
      status.state = 'error'; status.error = e.message;
      return false;
    }
  }

  /** Connect GitHub-gist sync. gistId empty → create a fresh private gist. */
  async function setupGist(token, gistId) {
    token = (token || '').trim();
    gistId = (gistId || '').trim().replace(/^.*gist\.github\.com\/(?:[^/]+\/)?/, ''); // accept pasted URLs
    if (!token) { status.error = 'A GitHub token is required.'; return false; }
    try {
      const id = gistId || await gistCreate(token);
      gist = { token, id };
      status.transport = 'gist';
      const ok = await syncNow('setup');
      if (ok) await CRO.db.setMeta(GIST_KEY, gist);
      else if (status.state === 'error') { gist = null; status.transport = handle ? 'file' : null; return false; }
      return ok;
    } catch (e) {
      status.state = 'error'; status.error = e.message;
      gist = null; status.transport = handle ? 'file' : null;
      return false;
    }
  }

  function gistInfo() { return gist ? { id: gist.id } : null; }

  /** User gesture: re-grant permission to the remembered file. */
  async function reconnect() {
    if (!handle) return false;
    try {
      const p = await handle.requestPermission({ mode: 'readwrite' });
      if (p === 'granted') return syncNow('reconnect');
    } catch (e) { status.error = e.message; }
    return false;
  }

  /** User gesture: choose (or create) the shared sync file. */
  async function setup(createNew) {
    if (!supported()) return false;
    try {
      const types = [{ description: 'Imo i Nicro sync', accept: { 'application/json': ['.json'] } }];
      if (createNew) {
        handle = await window.showSaveFilePicker({ suggestedName: 'imonicroat-sync.json', types });
      } else {
        const picked = await window.showOpenFilePicker({ types });
        handle = picked[0];
      }
      await CRO.db.setMeta(HANDLE_KEY, handle); // FileSystemFileHandle is structured-cloneable
      status.transport = 'file';
      return syncNow('setup');
    } catch (e) {
      if (e && e.name !== 'AbortError') { status.state = 'error'; status.error = e.message; }
      return false;
    }
  }

  async function disconnect() {
    handle = null; gist = null;
    status.connected = false; status.state = 'off'; status.fileName = null; status.transport = null;
    await CRO.db.remove('meta', HANDLE_KEY);
    await CRO.db.remove('meta', GIST_KEY);
  }

  window.CRO = window.CRO || {};
  CRO.sync = { init, setup, setupGist, gistInfo, reconnect, disconnect, syncNow, status, mergeDumps, _unionBy: unionBy };
  if (typeof module !== 'undefined' && module.exports) module.exports = CRO.sync;
})();
