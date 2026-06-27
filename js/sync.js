/* =========================================================================
   Two-device sync via a shared file (File System Access API).
   Point both computers at one imonicroat-sync.json in a cloud-synced folder
   (OneDrive / Dropbox / Google Drive). The app reads the file, merges it
   with local data using per-store conflict rules, writes the merge back —
   on boot, after every lesson, and after edits. No server, works offline
   (sync simply resumes next time the file is reachable).

   Merge rules (two writers, eventually consistent). Conflicts are resolved by a
   per-record Lamport clock {clk, dev} stamped on every write, so the outcome is
   independent of (unsynchronized) device wall-clocks; higher clk wins, deviceId
   breaks ties. Records predating the clock fall back to their timestamp rule:
     profiles  → union by id (local wins on conflict)
     srs       → higher clk wins (fallback: newest lastReview, then more reps)
     activity  → keyed per (profile|date|device); each device owns its counter,
                 so app-side streak/week totals SUM across devices. The max-merge
                 only ever resolves the SAME device re-syncing its own counter.
     flags     → higher clk wins (fallback: updatedAt); "resolved" is sticky
     overrides → higher clk wins (fallback: editedAt)
     variety   → higher clk wins (fallback: updatedAt); deletions are tombstones,
                 GC'd 60 days after deletion
     meta      → never synced (device-local: active profile, settings, handle)

   Concurrency: writes use optimistic concurrency control. The payload carries a
   monotonic `rev`; on write we set rev = remoteRev + 1 and guard it — the gist
   transport via an If-Match ETag (best-effort: older GitHub behaviour ignores
   it), the file transport via a re-read-and-compare just before writing. A
   detected conflict re-reads, re-merges and retries (up to 3x). A narrow TOCTOU
   window remains for the file transport, but it is self-healing — each device
   re-merges on its next sync — so a missed write is recovered, not lost.
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
  let lastEtag = null;         // gist ETag from the most recent read (for If-Match CAS)

  function supported() {
    return typeof window.showSaveFilePicker === 'function' && typeof window.showOpenFilePicker === 'function';
  }

  /* ---------------- pure merge (node-testable) ---------------- */
  // Distinguish "no remote yet" (fresh → seed it) from "remote is corrupt".
  // Returning null on a parse failure used to make syncNow overwrite a
  // possibly-good remote with local-only data; instead we throw so the write
  // is skipped and we retry next sync (mirrors the wrong-passphrase path).
  function parseRemote(text) {
    if (!text || !text.trim()) return null; // genuinely empty / missing → fresh
    try { return JSON.parse(text); }
    catch (e) { throw new Error('corrupt-remote: sync payload is not valid JSON'); }
  }

  function unionBy(a, b, key, resolve) {
    const map = new Map();
    (a || []).forEach(x => map.set(x[key], x));
    (b || []).forEach(y => {
      const x = map.get(y[key]);
      map.set(y[key], x ? resolve(x, y) : y);
    });
    return [...map.values()];
  }

  // Conflict winner by logical clock (skew-proof): higher clk wins, deviceId
  // breaks ties deterministically. Returns null when neither record carries a
  // clock, so callers fall back to their wall-clock/semantic rule for legacy data.
  function pickByClock(x, y) {
    if (x.clk == null && y.clk == null) return null;
    const cx = x.clk || 0, cy = y.clk || 0;
    if (cx !== cy) return cy > cx ? y : x;
    return String(y.dev || '') > String(x.dev || '') ? y : x;
  }

  function mergeDumps(local, remote) {
    const newer = (x, y, field) => ((y[field] || 0) > (x[field] || 0) ? y : x);
    return {
      app: 'imonicroat',
      version: local.version || 1,
      exportedAt: new Date().toISOString(),
      profiles: unionBy(local.profiles, remote.profiles, 'id', (x) => x),
      srs: unionBy(local.srs, remote.srs, 'key', (x, y) => {
        const p = pickByClock(x, y);
        if (p) return p;
        if ((y.lastReview || 0) !== (x.lastReview || 0)) return (y.lastReview || 0) > (x.lastReview || 0) ? y : x;
        return (y.reps || 0) > (x.reps || 0) ? y : x;
      }),
      // per-device keys (profile|date|device) never collide across devices, so
      // this union keeps each device's counter; max only ever resolves the SAME
      // device re-syncing its own monotonically-growing counter. App-side
      // streak/week totals SUM these records.
      activity: unionBy(local.activity, remote.activity, 'key', (x, y) =>
        Object.assign({}, x, { xp: Math.max(x.xp || 0, y.xp || 0), lessons: Math.max(x.lessons || 0, y.lessons || 0) })),
      flags: unionBy(local.flags, remote.flags, 'id', (x, y) => {
        const w = pickByClock(x, y) || newer(x, y, 'updatedAt');
        return (x.resolved || y.resolved) ? Object.assign({}, w, { resolved: true }) : w;
      }),
      overrides: unionBy(local.overrides, remote.overrides, 'id', (x, y) => pickByClock(x, y) || newer(x, y, 'editedAt')),
      variety: unionBy(local.variety, remote.variety, 'id', (x, y) => {
        const p = pickByClock(x, y);
        if (p) return p;
        const ts = v => v.updatedAt || v.createdAt || 0;
        return ts(y) > ts(x) ? y : x;
      }),
      meta: [] // device-local, never synced
    };
  }

  // Highest logical clock seen in a dump — used to advance this device's clock
  // past anything observed remotely, so future local writes causally dominate.
  function maxClock(dump) {
    let m = 0;
    ['srs', 'overrides', 'variety', 'flags'].forEach(s => (dump[s] || []).forEach(r => {
      if (r.clk > m) m = r.clk;
    }));
    return m;
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
    lastEtag = r.headers.get('etag') || null; // for an If-Match conditional write
    const data = await r.json();
    const f = data.files && data.files[GIST_FILE];
    if (!f) return null;
    let text = f.content;
    if (f.truncated && f.raw_url) {
      const rr = await fetch(f.raw_url);
      if (!rr.ok) throw new Error('corrupt-remote: could not fetch full gist content (' + rr.status + ')');
      text = await rr.text();
    }
    return parseRemote(text);
  }

  async function gistWrite(merged, etag) {
    const headers = gistHeaders();
    // best-effort compare-and-swap: if GitHub honors If-Match it returns 412
    // when the gist changed under us (older versions ignore it harmlessly)
    if (etag) headers['If-Match'] = etag;
    const body = JSON.stringify({ files: { [GIST_FILE]: { content: JSON.stringify(merged) } } });
    const r = await fetch('https://api.github.com/gists/' + gist.id, {
      method: 'PATCH', headers, body
    });
    if (r.status === 412) { const e = new Error('sync-conflict: gist changed during merge'); e.conflict = true; throw e; }
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

  /* ---- transport-agnostic sync (payloads are E2E-encrypted when a
          household passphrase exists — see js/vault.js) ---- */
  async function maybeDecrypt(payload) {
    if (!payload) return null;
    if (!CRO.vault || !CRO.vault.isEnvelope(payload)) return payload; // legacy plaintext
    const pass = await CRO.vault.getPassphrase();
    if (!pass) throw new Error('passphrase-needed: remote data is encrypted.');
    try { return await CRO.vault.decrypt(payload, pass); }
    catch (e) { throw new Error('Wrong household passphrase for the synced data.'); }
  }

  async function maybeEncrypt(merged) {
    const pass = CRO.vault ? await CRO.vault.getPassphrase() : null;
    return pass ? CRO.vault.encrypt(merged, pass) : merged;
  }

  async function readRemote() {
    let payload = null;
    if (status.transport === 'gist') payload = await gistRead();
    else {
      // An unreadable handle (permission/transient) must NOT be treated as
      // "fresh" — that would overwrite the shared file with local-only data.
      // Let read errors throw so syncNow skips the write and retries later.
      const file = await handle.getFile();
      payload = parseRemote(await file.text());
    }
    return maybeDecrypt(payload);
  }

  async function writeRemote(merged, baseRev) {
    const payload = await maybeEncrypt(merged);
    if (status.transport === 'gist') return gistWrite(payload, lastEtag);
    // file transport has no ETag: re-read just before writing and bail if the
    // version moved since we merged (another device wrote concurrently). Still a
    // narrow TOCTOU window, but it catches the common case; self-healing covers
    // the rest on the next sync.
    const current = await readRemote().catch(() => null);
    const curRev = (current && current.app === 'imonicroat') ? (current.rev || 0) : 0;
    if (baseRev != null && curRev !== baseRev) {
      const e = new Error('sync-conflict: file changed during merge'); e.conflict = true; throw e;
    }
    const w = await handle.createWritable();
    await w.write(JSON.stringify(payload));
    await w.close();
  }

  // The read-merge-write core, with optimistic-concurrency retry. Transport I/O
  // is injected so this is unit-testable: `read()` returns the decrypted remote
  // dump (or null), `write(merged, baseRev)` persists it and throws an error with
  // `.conflict === true` if the remote changed underneath. Returns the dump that
  // was actually written so the caller can commit it locally.
  async function runSync(localDump, read, write) {
    const local = await localDump();
    let merged = null, wrote = false, lastErr = null;
    for (let attempt = 0; attempt < 3 && !wrote; attempt++) {
      const remote = await read();
      const base = (remote && remote.app === 'imonicroat') ? remote : null;
      merged = base ? mergeDumps(local, base) : local;
      // GC old variety tombstones (both devices have long since converged)
      const tombCutoff = Date.now() - 60 * 864e5;
      if (merged.variety) merged.variety = merged.variety.filter(v => !(v.deleted && (v.updatedAt || 0) < tombCutoff));
      merged.rev = (base && base.rev || 0) + 1; // optimistic version counter
      try { await write(merged, base && base.rev || 0); wrote = true; }
      catch (e) { if (e && e.conflict) { lastErr = e; continue; } throw e; } // re-read & re-merge
    }
    if (!wrote) throw (lastErr || new Error('sync-conflict: could not write after retries'));
    return merged;
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
      // read → merge → write with optimistic-concurrency retry; commit locally
      // only once the remote write has actually landed
      const merged = await runSync(localDump, readRemote, writeRemote);
      // advance our Lamport clock past anything observed, so later local writes win
      const seen = maxClock(merged);
      const cur = (await CRO.db.getMeta('syncClock')) || 0;
      if (seen > cur) await CRO.db.setMeta('syncClock', seen);
      await CRO.db.importAll(merged);
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
  CRO.sync = { init, setup, setupGist, gistInfo, reconnect, disconnect, syncNow, status, mergeDumps, _unionBy: unionBy, _parseRemote: parseRemote, _maxClock: maxClock, _runSync: runSync };
  if (typeof module !== 'undefined' && module.exports) module.exports = CRO.sync;
})();
