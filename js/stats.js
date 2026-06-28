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

  function activeDaysByProfile(acts) {
    const by = {};
    (acts || []).forEach(a => {
      if (a.lessons > 0) { (by[a.profileId] = by[a.profileId] || new Set()).add(a.date); }
    });
    return by;
  }
  const shiftKey = (dateStr, n) => {
    const d = new Date(dateStr + 'T12:00:00'); d.setDate(d.getDate() - n); return todayKey(d);
  };

  /** Forgiving shared-streak state.
      - A day counts only if there's real activity on it (no free days), and
        `need` profiles are "in sync" — each practised on the day OR within the
        previous `windowDays` (default 1), so "you last night, me this morning"
        still counts as one shared day.
      - The run tolerates up to `grace` (default 1) fully-missed days, so one
        skipped day doesn't reset everything.
      `refDate` defaults to now (passable for tests). opts: {grace, windowDays}.
      Returns {streak, todayComplete, doneToday:Set<profileId actually active today>}. */
  function streakState(acts, need, refDate, opts) {
    opts = opts || {};
    const grace = opts.grace == null ? 1 : opts.grace;
    const windowDays = opts.windowDays == null ? 1 : opts.windowDays;
    const by = activeDaysByProfile(acts);
    const profiles = Object.keys(by);
    const covers = (pid, D) => {
      for (let k = 0; k <= windowDays; k++) if (by[pid].has(shiftKey(D, k))) return true;
      return false;
    };
    const sharedDone = D => {
      if (!profiles.some(pid => by[pid].has(D))) return false; // anchor: real activity on D
      let c = 0;
      for (const pid of profiles) if (covers(pid, D)) c++;
      return c >= need;
    };
    const day = refDate ? new Date(refDate) : new Date();
    const todayStr = todayKey(day);
    const doneToday = new Set(profiles.filter(pid => by[pid].has(todayStr)));

    let streak = 0, graceLeft = grace;
    if (!sharedDone(todayStr)) day.setDate(day.getDate() - 1); // today still open, don't break on it
    while (true) {
      const d = todayKey(day);
      if (sharedDone(d)) { streak += 1; day.setDate(day.getDate() - 1); }
      else if (graceLeft > 0) { graceLeft -= 1; day.setDate(day.getDate() - 1); }
      else break;
    }
    return { streak, todayComplete: sharedDone(todayStr), doneToday };
  }

  /** One person's own day-streak (not hostage to the partner), same grace rule. */
  function personalStreak(acts, profileId, refDate, opts) {
    opts = opts || {};
    const grace = opts.grace == null ? 1 : opts.grace;
    const days = new Set();
    (acts || []).forEach(a => { if (a.profileId === profileId && a.lessons > 0) days.add(a.date); });
    const day = refDate ? new Date(refDate) : new Date();
    let streak = 0, graceLeft = grace;
    if (!days.has(todayKey(day))) day.setDate(day.getDate() - 1);
    while (true) {
      const d = todayKey(day);
      if (days.has(d)) { streak += 1; day.setDate(day.getDate() - 1); }
      else if (graceLeft > 0) { graceLeft -= 1; day.setDate(day.getDate() - 1); }
      else break;
    }
    return streak;
  }

  window.CRO = window.CRO || {};
  CRO.stats = { todayKey, isoWeekKey, weekTotals, streakState, personalStreak };
  if (typeof module !== 'undefined' && module.exports) module.exports = CRO.stats;
})();
