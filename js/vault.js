/* =========================================================================
   Household passphrase: local lock screen + end-to-end encryption of sync.
   - The lock is a soft UI gate, not a security boundary: local IndexedDB data
     is plaintext, and the stored unlock token is the PBKDF2 hash itself, so
     anyone with local device access can bypass it. The real protections for
     data at rest are the device login and OS disk encryption.
   - The same passphrase E2E-encrypts everything written to the sync gist/file
     (PBKDF2 600k → AES-256-GCM), so data in transit/at-rest remotely is
     ciphertext that a stranger with the URL can never read. THIS is the part
     that provides genuine confidentiality.
   - The passphrase is held locally (IndexedDB) so unattended background sync
     can encrypt without re-prompting; it never syncs and never leaves the
     device. The GitHub token is likewise local-only.
   ========================================================================= */
if (typeof window === 'undefined') { global.window = global; } // node test shim
(function () {
  'use strict';

  const cryptoObj = window.crypto ||
    (typeof require === 'function' ? require('crypto').webcrypto : null);
  const subtle = cryptoObj && cryptoObj.subtle;
  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const ITER = 600000;        // current default (OWASP-aligned for PBKDF2-SHA256)
  const LEGACY_ITER = 150000; // assumed when a record predates the stored `it`
  // Headless test harnesses can't drive WebCrypto reliably (subtle promises
  // stall in headless Chromium). Tests set this flag to exercise the FLOW
  // with a stub; the real crypto is covered by node tests (tests/run-tests.js).
  const TEST_STUB = !!window.__CRO_TEST_NOCRYPTO;

  function b64(buf) {
    const bytes = new Uint8Array(buf);
    let s = '';
    for (let i = 0; i < bytes.length; i += 0x8000) {
      s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(s);
  }
  function unb64(s) {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  async function aesKey(pass, salt, iter) {
    const km = await subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
    return subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: iter || ITER, hash: 'SHA-256' },
      km, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  async function passHash(pass, salt, iter) {
    if (TEST_STUB) return 'stub:' + pass;
    const km = await subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveBits']);
    const bits = await subtle.deriveBits({ name: 'PBKDF2', salt, iterations: iter || ITER, hash: 'SHA-256' }, km, 256);
    return b64(bits);
  }

  /** Encrypt any JSON-able object into a portable envelope. */
  async function encrypt(obj, pass) {
    if (TEST_STUB) return { app: 'imonicroat-enc', v: 0, stub: pass, ct: JSON.stringify(obj) };
    const salt = cryptoObj.getRandomValues(new Uint8Array(16));
    const iv = cryptoObj.getRandomValues(new Uint8Array(12));
    const k = await aesKey(pass, salt, ITER);
    const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, k, enc.encode(JSON.stringify(obj)));
    return { app: 'imonicroat-enc', v: 1, it: ITER, salt: b64(salt), iv: b64(iv), ct: b64(ct) };
  }

  /** Decrypt an envelope; throws on wrong passphrase (GCM auth failure). */
  async function decrypt(env, pass) {
    if (env.v === 0 && env.stub !== undefined) {
      if (!TEST_STUB || env.stub !== pass) throw new Error('bad stub passphrase');
      return JSON.parse(env.ct);
    }
    const k = await aesKey(pass, unb64(env.salt), env.it || LEGACY_ITER);
    const pt = await subtle.decrypt({ name: 'AES-GCM', iv: unb64(env.iv) }, k, unb64(env.ct));
    return JSON.parse(dec.decode(pt));
  }

  function isEnvelope(o) { return !!(o && o.app === 'imonicroat-enc' && o.ct); }

  /* ---------------- local lock ---------------- */
  const UNLOCK_LS = 'imonicroat:unlock';

  async function setPassphrase(pass) {
    const salt = cryptoObj.getRandomValues(new Uint8Array(16));
    const hash = await passHash(pass, salt, ITER);
    await CRO.db.setMeta('lock', { salt: b64(salt), hash, it: ITER });
    await CRO.db.setMeta('passphrase', pass); // device-local, used to encrypt sync
    try { localStorage.setItem(UNLOCK_LS, hash); } catch (e) { }
  }

  async function hasLock() { return !!(await CRO.db.getMeta('lock')); }

  async function isUnlocked() {
    const lock = await CRO.db.getMeta('lock');
    if (!lock) return true;
    try {
      return localStorage.getItem(UNLOCK_LS) === lock.hash ||
        sessionStorage.getItem(UNLOCK_LS) === lock.hash;
    } catch (e) { return false; }
  }

  /** Try a passphrase against the local lock. remember=false → this tab only. */
  async function unlock(pass, remember) {
    const lock = await CRO.db.getMeta('lock');
    if (!lock) return true;
    const h = await passHash(pass, unb64(lock.salt), lock.it || LEGACY_ITER);
    if (h !== lock.hash) return false;
    try {
      (remember === false ? sessionStorage : localStorage).setItem(UNLOCK_LS, h);
    } catch (e) { }
    // keep the encryption passphrase available for sync writes
    await CRO.db.setMeta('passphrase', pass);
    return true;
  }

  async function getPassphrase() { return CRO.db.getMeta('passphrase'); }

  async function lockNow() {
    try { localStorage.removeItem(UNLOCK_LS); sessionStorage.removeItem(UNLOCK_LS); } catch (e) { }
  }

  window.CRO = window.CRO || {};
  CRO.vault = { encrypt, decrypt, isEnvelope, setPassphrase, hasLock, isUnlocked, unlock, getPassphrase, lockNow, _passHash: passHash };
  if (typeof module !== 'undefined' && module.exports) module.exports = CRO.vault;
})();
