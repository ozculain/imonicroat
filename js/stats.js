/* =========================================================================
   Pure streak / weekly-duel math, split out so it can be unit-tested without a
   DOM. The important property here is the per-device XP SUM: activity is keyed
   (profile|date|device), so a profile can have several records for one day; the
   weekly total must add them up (not take a max), and a day counts toward the
   shared streak if `need` distinct profiles practised it.
   ========================================================================= */
if (typeof window === 'undefined') { global.window = global; } // node test shim
(function () {
  'use strict';

  const pad2 = n => String(n).padStart(2, '0');

  function todayKey(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function isoWeekKey(d) {
    d = d ? new Date(d) : new Date();
    const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const day = (t.getDay() + 6) % 7;
    t.setDate(t.getDate() - day + 3);
    const firstThu = new Date(t.getFullYear(), 0, 4);
    const fday = (firstThu.getDay() + 6) % 7;
    firstThu.setDate(firstThu.getDate() - fday + 3);
    const week = 1 + Math.round((t - firstThu) / (7 * 864e5));
    return t.getFullYear() + '-W' + pad2(week);
  }

  /** XP per profile for ISO week `wk`, seeded to 0 for each id in `profileIds`.
      Sums ALL matching activity records — including several per-device records
      for the same profile/day — so concurrent same-day work adds up. */
  function weekTotals(acts, wk, profileIds) {
    const scores = {};
    (profileIds || []).forEach(id => { scores[id] = 0; });
    (acts || []).forEach(a => {
      if (isoWeekKey(a.date + 'T12:00:00') === wk && scores[a.profileId] !== undefined) {
        scores[a.profileId] += (a.xp || 0);
      }
    });
    return scores;
  }

  /** Shared-streak state. A day counts when `need` distinct profiles have a
      record with lessons>0 (any device). `refDate` defaults to now (passable for
      tests). Returns {streak, todayComplete, doneToday:Set<profileId>}. */
  function streakState(acts, need, refDate) {
    const byDate = {};
    (acts || []).forEach(a => {
      if (a.lessons > 0) { (byDate[a.date] = byDate[a.date] || new Set()).add(a.profileId); }
    });
    const doneDay = d => !!(byDate[d] && byDate[d].size >= need);
    const day = refDate ? new Date(refDate) : new Date();
    const todayStr = todayKey(day);
    let streak = 0;
    if (!doneDay(todayStr)) day.setDate(day.getDate() - 1);
    while (doneDay(todayKey(day))) { streak += 1; day.setDate(day.getDate() - 1); }
    return { streak, todayComplete: doneDay(todayStr), doneToday: byDate[todayStr] || new Set() };
  }

  window.CRO = window.CRO || {};
  CRO.stats = { todayKey, isoWeekKey, weekTotals, streakState };
  if (typeof module !== 'undefined' && module.exports) module.exports = CRO.stats;
})();
