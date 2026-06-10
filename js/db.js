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

  let dbPromise = null;
  let useFallback = false;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve) => {
      if (!window.indexedDB) { useFallback = true; resolve(null); return; }
      let settled = false;
      const done = db => { if (!settled) { settled = true; resolve(db); } };
      // Some environments (notably file:// in locked-down browsers) leave the
      // open request pending forever — fall back to localStorage after 1.5s.
      const guard = setTimeout(() => { useFallback = true; done(null); }, 1500);
      let req;
      try { req = indexedDB.open(DB_NAME, DB_VERSION); }
      catch (e) { clearTimeout(guard); useFallback = true; done(null); return; }
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const name of STORES) {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name, { keyPath: keyPathFor(name) });
          }
        }
      };
      req.onsuccess = () => { clearTimeout(guard); done(req.result); };
      req.onerror = () => { clearTimeout(guard); useFallback = true; done(null); };
      req.onblocked = () => { clearTimeout(guard); useFallback = true; done(null); };
    });
    return dbPromise;
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
    localStorage.setItem('imonicroat:' + store, JSON.stringify(obj));
  }

  async function put(store, record) {
    const db = await open();
    if (useFallback || !db) {
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
    // the sync file handle is a live OS object — never serialize it
    dump.meta = dump.meta.filter(m => m.key !== 'syncHandle');
    return dump;
  }

  async function importAll(dump) {
    if (!dump || dump.app !== 'imonicroat') throw new Error('Not an Imo i Nicro backup file.');
    for (const s of STORES) {
      if (Array.isArray(dump[s])) await bulkPut(s, dump[s]);
    }
  }

  window.CRO = window.CRO || {};
  CRO.db = { put, bulkPut, get, getAll, remove, getMeta, setMeta, exportAll, importAll, STORES };
})();
