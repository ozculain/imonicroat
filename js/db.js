/* =========================================================================
   Persistence layer: IndexedDB with a localStorage fallback.
   Stores:
     profiles  — {id, name, hue, createdAt, settings}
     srs       — {key: profileId + '|' + cardId, profileId, cardId, ...card}
     activity  — {key: profileId + '|' + date, profileId, date, xp, lessons}
     flags     — {id, cardId, profileId, note, context, createdAt, resolved}
     overrides — {id: cardId, patch: {...}, editedAt, editedBy}
     variety   — {id, baseId|null, hr, en, note, region, createdAt}
     meta      — {key, value}   (streak cache, active profile, etc.)
   ========================================================================= */
(function () {
  'use strict';

  const DB_NAME = 'imonicroat';
  const DB_VERSION = 1;
  const STORES = ['profiles', 'srs', 'activity', 'flags', 'overrides', 'variety', 'meta'];

  let dbInstance = null;    // the open IDB connection, once available
  let opening = null;       // in-flight open() promise
  let useFallback = false;  // currently serving from localStorage
  let lsDirty = false;      // localStorage holds writes not yet migrated to IDB

  function open() {
    if (dbInstance) return Promise.resolve(dbInstance);
    if (useFallback) return Promise.resolve(null);
    if (opening) return opening;
    opening = new Promise((resolve) => {
      if (!window.indexedDB) { useFallback = true; resolve(null); return; }
      let settled = false;
      const fellBack = () => { if (!settled) { settled = true; useFallback = true; resolve(null); } };
      const succeeded = db => {
        dbInstance = db;
        if (settled) { adoptIdb(db); return; } // arrived AFTER we fell back → migrate
        settled = true; resolve(db);
      };
      // Some environments (notably file:// in locked-down browsers) leave the
      // open request pending. Fall back to localStorage after 5s, but DON'T
      // latch permanently: keep the request alive so a slow-but-successful open
      // is adopted and any localStorage writes are migrated into IDB — a
      // transient hiccup must not split data across both stores.
      const guard = setTimeout(fellBack, 5000);
      let req;
      try { req = indexedDB.open(DB_NAME, DB_VERSION); }
      catch (e) { clearTimeout(guard); fellBack(); return; }
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const name of STORES) {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name, { keyPath: keyPathFor(name) });
          }
        }
      };
      req.onsuccess = () => { clearTimeout(guard); succeeded(req.result); };
      req.onerror = () => { clearTimeout(guard); fellBack(); };
      req.onblocked = () => { clearTimeout(guard); fellBack(); };
    });
    return opening;
  }

  // Adopt a late-arriving IDB connection: migrate localStorage-buffered writes
  // that aren't already in IDB (so concurrent fresh IDB writes aren't clobbered),
  // then stop using the fallback.
  async function adoptIdb(db) {
    useFallback = false;
    if (!lsDirty) return;
    for (const store of STORES) {
      const buffered = Object.values(lsLoad(store));
      if (buffered.length) {
        const have = await new Promise((resolve, reject) => {
          const tx = db.transaction(store, 'readonly');
          const req = tx.objectStore(store).getAllKeys();
          req.onsuccess = () => resolve(new Set(req.result || []));
          req.onerror = () => reject(req.error);
        });
        const missing = buffered.filter(r => !have.has(r[keyPathFor(store)]));
        if (missing.length) {
          await new Promise((resolve, reject) => {
            const tx = db.transaction(store, 'readwrite');
            const os = tx.objectStore(store);
            for (const r of missing) os.put(r);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
          });
        }
      }
      try { localStorage.removeItem('imonicroat:' + store); } catch (e) { /* ignore */ }
    }
    lsDirty = false;
  }

  function keyPathFor(store) {
    if (store === 'srs' || store === 'activity' || store === 'meta') return 'key';
    return 'id';
  }

  /* ---- localStorage fallback (same API, JSON blobs per store) ---- */
  function lsLoad(store) {
    try { return JSON.parse(localStorage.getItem('imonicroat:' + store) || '{}'); }
    catch (e) { return {}; }
  }
  function lsSave(store, obj) {
    try {
      localStorage.setItem('imonicroat:' + store, JSON.stringify(obj));
      lsDirty = true;
    } catch (e) {
      // quota exceeded or serialization failure — degrade without throwing so a
      // put()/bulkPut() doesn't reject the whole operation
      if (typeof console !== 'undefined') console.warn('localStorage save failed for ' + store, e && e.name);
    }
  }

  async function put(store, record) {
    const db = await open();
    if (useFallback || !db) {
      // a FileSystemFileHandle JSON-serializes to '{}' — don't persist a broken
      // handle in localStorage (the file transport is desktop-only, where IDB
      // exists anyway); it stays in memory for this session via sync.js
      if (store === 'meta' && record.key === 'syncHandle') return record;
      const all = lsLoad(store);
      all[record[keyPathFor(store)]] = record;
      lsSave(store, all);
      return record;
    }
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).put(record);
      tx.oncomplete = () => resolve(record);
      tx.onerror = () => reject(tx.error);
    });
  }

  async function bulkPut(store, records) {
    const db = await open();
    if (useFallback || !db) {
      const all = lsLoad(store);
      for (const r of records) all[r[keyPathFor(store)]] = r;
      lsSave(store, all);
      return;
    }
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      const os = tx.objectStore(store);
      for (const r of records) os.put(r);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function get(store, key) {
    const db = await open();
    if (useFallback || !db) return lsLoad(store)[key] || null;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function getAll(store) {
    const db = await open();
    if (useFallback || !db) return Object.values(lsLoad(store));
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readonly');
      const req = tx.objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async function clear(store) {
    const db = await open();
    if (useFallback || !db) { lsSave(store, {}); return; }
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async function remove(store, key) {
    const db = await open();
    if (useFallback || !db) {
      const all = lsLoad(store);
      delete all[key];
      lsSave(store, all);
      return;
    }
    return new Promise((resolve, reject) => {
      const tx = db.transaction(store, 'readwrite');
      tx.objectStore(store).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  /* ---- convenience: meta key/value ---- */
  async function getMeta(key, fallback) {
    const rec = await get('meta', key);
    return rec ? rec.value : (fallback === undefined ? null : fallback);
  }
  async function setMeta(key, value) {
    return put('meta', { key, value });
  }

  /* ---- export / import everything (move between devices) ---- */
  async function exportAll() {
    const dump = { app: 'imonicroat', version: DB_VERSION, exportedAt: new Date().toISOString() };
    for (const s of STORES) dump[s] = await getAll(s);
    // strip device-local secrets: the live file handle (unserializable) and the
    // passphrase / lock hash, which must never travel in a backup file
    dump.meta = dump.meta.filter(m => !['syncHandle', 'passphrase', 'lock'].includes(m.key));
    return dump;
  }

  async function importAll(dump) {
    if (!dump || dump.app !== 'imonicroat') throw new Error('Not an Imo i Nicro backup file.');
    for (const s of STORES) {
      if (!Array.isArray(dump[s])) continue;
      // meta is device-local (passphrase, gist token, active profile, file
      // handle); merge it without clearing so a sync dump (meta:[]) or a
      // secret-stripped backup never wipes this device's keys.
      if (s === 'meta') { await bulkPut('meta', dump.meta); continue; }
      // every other store: replace, so a restore doesn't leave orphaned records.
      // (A sync merge passes a full superset, so clear-then-put is exact there too.)
      await clear(s);
      await bulkPut(s, dump[s]);
    }
  }

  window.CRO = window.CRO || {};
  CRO.db = { put, bulkPut, get, getAll, clear, remove, getMeta, setMeta, exportAll, importAll, STORES };
})();
