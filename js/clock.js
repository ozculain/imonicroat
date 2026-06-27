/* =========================================================================
   Lamport logical clock for skew-proof sync conflict resolution.

   Every record-mutating write stamps a monotonically increasing counter; the
   merge prefers the higher value (deviceId breaks ties). The counter MUST be
   advanced atomically — a plain getMeta→+1→setMeta read-modify-write lets two
   concurrent writers read the same value and collide. So all updates run
   through a single serialized promise chain, with the value cached in memory as
   the source of truth (persisted to meta for the next session).
   ========================================================================= */
if (typeof window === 'undefined') { global.window = global; } // node test shim
(function () {
  'use strict';

  let chain = Promise.resolve(); // serializes every bump/observe
  let mem = null;                // in-memory authoritative clock (null = unloaded)

  function serialize(fn) {
    const run = chain.then(fn, fn);
    chain = run.then(() => {}, () => {}); // keep the chain alive past rejections
    return run;
  }

  // Re-read the persisted value every time and max it against memory: a second
  // tab of the same PWA shares IndexedDB but not this JS memory, so a cached-only
  // `mem` would hand out stale (duplicate) values. (This still isn't a cross-tab
  // atomic CAS — two tabs bumping at the exact same instant could collide — but
  // it removes the staleness, restoring parity with a read-every-call clock while
  // keeping the in-tab mutex.)
  async function current() {
    const persisted = (await CRO.db.getMeta('syncClock')) || 0;
    mem = Math.max(mem || 0, persisted);
    return mem;
  }

  /** Atomically (within this tab) increment and return the next clock value. */
  async function bump() {
    return serialize(async () => {
      const next = (await current()) + 1;
      mem = next;
      await CRO.db.setMeta('syncClock', next);
      return next;
    });
  }

  /** Advance past a value observed from a peer (monotonic; never regresses). */
  async function observe(seen) {
    return serialize(async () => {
      const cur = await current();
      const next = Math.max(cur, seen || 0);
      if (next !== cur) { mem = next; await CRO.db.setMeta('syncClock', next); }
      return next;
    });
  }

  function _reset() { chain = Promise.resolve(); mem = null; } // test hook

  window.CRO = window.CRO || {};
  CRO.clock = { bump, observe, _reset };
  if (typeof module !== 'undefined' && module.exports) module.exports = CRO.clock;
})();
