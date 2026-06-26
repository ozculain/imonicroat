/* =========================================================================
   App shell: profiles, streak, lesson sessions, flags & review workflow,
   family-variety layer, notes layer, test-out, settings.
   ========================================================================= */
(function () {
  'use strict';

  const $ = sel => document.querySelector(sel);
  const el = (tag, cls, html) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html !== undefined) e.innerHTML = html;
    return e;
  };
  const ic = CRO.icons.icon;

  /* ================= state ================= */
  const state = {
    profiles: [],
    activeId: null,
    srs: {},          // cardId → card (active profile)
    flags: [],
    variety: [],
    overrides: [],
    settings: { retention: 0.9, newPerLesson: 4, showVariety: true, dailyGoalLessons: 1 },
    session: null,
    view: 'home',
    deviceId: null,   // stable per-device id (activity keys, conflict tiebreak)
    clock: 0          // local Lamport clock for skew-proof conflict resolution
  };

  const NEW_WORDS_PER_LESSON = () => state.settings.newPerLesson || 4;
  const XP_CORRECT = 10, XP_HARD = 6;

  function todayKey(d) {
    d = d || new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
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
    return t.getFullYear() + '-W' + String(week).padStart(2, '0');
  }

  /* ================= boot ================= */
  async function boot() {
    // offline-first PWA when hosted (no-op when opened from file://)
    if ('serviceWorker' in navigator && /^https?:/.test(location.protocol)) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
    CRO.audio.init();
    // refresh the home screen if a Croatian voice appears after first render
    CRO.audio.onChange(() => { if (state.view === 'home') render('home'); });
    // household lock: gate everything behind the passphrase on this device
    if (!(await CRO.vault.isUnlocked())) { renderLock(); return; }
    await CRO.sync.init(); // pull partner's progress before loading state
    state.profiles = await CRO.db.getAll('profiles');
    state.overrides = await CRO.db.getAll('overrides');
    state.flags = await CRO.db.getAll('flags');
    state.variety = (await CRO.db.getAll('variety')).filter(v => !v.deleted);
    CRO.content.applyOverrides(state.overrides);
    const savedSettings = await CRO.db.getMeta('settings');
    if (savedSettings) Object.assign(state.settings, savedSettings);
    state.activeId = await CRO.db.getMeta('activeProfile');
    if (state.profiles.length === 0) { render('onboarding'); return; }
    if (!state.activeId || !state.profiles.find(p => p.id === state.activeId)) {
      state.activeId = state.profiles[0].id;
    }
    await loadProfileSrs();
    render('home');
  }

  async function loadProfileSrs() {
    const all = await CRO.db.getAll('srs');
    state.srs = {};
    all.filter(r => r.profileId === state.activeId)
       .forEach(r => { state.srs[r.cardId] = r; });
  }

  function activeProfile() { return state.profiles.find(p => p.id === state.activeId); }
  function otherProfile() { return state.profiles.find(p => p.id !== state.activeId); }

  // A stable per-device id and a Lamport clock. The clock makes cross-device
  // conflict resolution independent of (unsynchronized) wall clocks: every
  // record-mutating write stamps a monotonically increasing {clk, dev}, and the
  // merge prefers the higher clk (deviceId breaks ties deterministically).
  async function ensureDeviceId() {
    if (state.deviceId) return state.deviceId;
    let id = await CRO.db.getMeta('deviceId');
    if (!id) { id = 'd' + Math.random().toString(36).slice(2, 10); await CRO.db.setMeta('deviceId', id); }
    state.deviceId = id;
    return id;
  }
  async function bumpClock() {
    const c = (await CRO.db.getMeta('syncClock') || 0) + 1;
    await CRO.db.setMeta('syncClock', c);
    state.clock = c;
    return c;
  }
  /** {clk, dev} stamp for a record about to be written, for skew-proof merges. */
  async function stamp() {
    return { clk: await bumpClock(), dev: await ensureDeviceId() };
  }

  async function saveCard(card) {
    Object.assign(card, await stamp());
    await CRO.db.put('srs', Object.assign({ key: state.activeId + '|' + card.cardId, profileId: state.activeId }, card));
    state.srs[card.cardId] = card;
  }

  async function addXp(amount, lessonDone) {
    // key per (profile, day, device): each device owns its own counter, so the
    // merge can SUM independent same-day work instead of max-ing it away.
    const deviceId = await ensureDeviceId();
    const date = todayKey();
    const key = state.activeId + '|' + date + '|' + deviceId;
    const rec = (await CRO.db.get('activity', key)) || { key, profileId: state.activeId, date, deviceId, xp: 0, lessons: 0 };
    rec.xp += amount;
    if (lessonDone) rec.lessons += 1;
    await CRO.db.put('activity', rec);
  }

  /* ================= streak & head-to-head ================= */
  async function streakInfo() {
    const acts = await CRO.db.getAll('activity');
    const byDate = {};
    acts.forEach(a => {
      if (a.lessons > 0) {
        byDate[a.date] = byDate[a.date] || new Set();
        byDate[a.date].add(a.profileId);
      }
    });
    const need = Math.min(2, Math.max(1, state.profiles.length));
    const doneDay = d => (byDate[d] && byDate[d].size >= need);
    let streak = 0;
    const day = new Date();
    // today counts if done; otherwise streak may still be alive from yesterday
    if (!doneDay(todayKey(day))) day.setDate(day.getDate() - 1);
    while (doneDay(todayKey(day))) { streak += 1; day.setDate(day.getDate() - 1); }
    const today = byDate[todayKey()] || new Set();
    return {
      streak,
      todayComplete: doneDay(todayKey()),
      youDone: today.has(state.activeId),
      partnerDone: state.profiles.length > 1 && otherProfile() ? today.has(otherProfile().id) : true
    };
  }

  async function weekScores() {
    const acts = await CRO.db.getAll('activity');
    const wk = isoWeekKey();
    const scores = {};
    state.profiles.forEach(p => { scores[p.id] = 0; });
    acts.forEach(a => {
      if (isoWeekKey(a.date + 'T12:00:00') === wk && scores[a.profileId] !== undefined) {
        scores[a.profileId] += a.xp;
      }
    });
    return scores;
  }

  /* ================= card availability ================= */
  function introducedWordIds() {
    return new Set(Object.keys(state.srs).filter(k => k.startsWith('w:')).map(k => k.slice(2)));
  }

  function nextNewWords(limit) {
    const known = introducedWordIds();
    return CRO.content.WORDS.filter(w => !known.has(w.id)).slice(0, limit);
  }

  function availableNewSentences(limit, extraWordIds) {
    const known = introducedWordIds();
    (extraWordIds || []).forEach(id => known.add(id));
    return CRO.content.SENTENCES
      .filter(s => !state.srs['s:' + s.id] && s.words.every(w => known.has(w)))
      .slice(0, limit);
  }

  function unitProgress(unitN) {
    const wordIds = CRO.content.WORDS.filter(w => w.unit === unitN).map(w => 'w:' + w.id);
    const sentIds = CRO.content.SENTENCES.filter(s => s.unit === unitN).map(s => 's:' + s.id);
    const ids = wordIds.concat(sentIds);
    if (!ids.length) return { seen: 0, total: 0, mature: 0 };
    const seen = ids.filter(id => state.srs[id]).length;
    const mature = ids.filter(id => state.srs[id] && state.srs[id].state === 'review').length;
    return { seen, total: ids.length, mature };
  }

  function currentUnit() {
    for (const u of CRO.content.UNITS) {
      const p = unitProgress(u.n);
      if (p.seen < p.total) return u;
    }
    return CRO.content.UNITS[CRO.content.UNITS.length - 1];
  }

  /* ================= rendering ================= */
  function render(view, arg) {
    state.view = view;
    const root = $('#app');
    root.innerHTML = '';
    if (view !== 'onboarding' && view !== 'lesson') root.appendChild(header());
    const fn = {
      onboarding: viewOnboarding, home: viewHome, lesson: viewLesson,
      review: viewReview, variety: viewVariety, settings: viewSettings,
      testout: viewTestout, summary: viewSummary
    }[view];
    fn(root, arg);
  }

  function header() {
    const h = el('header', 'topbar');
    const brand = el('div', 'brand');
    brand.innerHTML = `<span class="brand-mark">${CRO.icons.sahovnica(4, 4, 10)}</span><span class="brand-name">Imo&nbsp;i&nbsp;Nicro</span><span class="brand-sub">hrvatski za nas dvoje</span>`;
    h.appendChild(brand);

    const right = el('div', 'topbar-right');
    // profile switcher
    state.profiles.forEach(p => {
      const b = el('button', 'avatar-btn' + (p.id === state.activeId ? ' active' : ''));
      b.innerHTML = CRO.icons.avatar(p.name, p.hue, 30);
      b.title = p.name;
      b.onclick = async () => {
        state.activeId = p.id;
        await CRO.db.setMeta('activeProfile', p.id);
        await loadProfileSrs();
        render('home');
      };
      right.appendChild(b);
    });
    const gear = el('button', 'iconbtn', ic('gear', 19));
    gear.title = 'Settings';
    gear.onclick = () => render('settings');
    right.appendChild(gear);
    h.appendChild(right);
    return h;
  }

  /* ================= lock screen ================= */
  function renderLock() {
    const root = $('#app');
    root.innerHTML = '';
    const wrap = el('div', 'onboard');
    wrap.innerHTML = `
      <div class="onboard-art">${CRO.icons.sahovnica(5, 5, 18)}</div>
      <h1>Imo i Nicro</h1>
      <p class="lede">Private household app — enter the passphrase.</p>
      <div class="card form-card lockcard">
        <label>Passphrase <input type="password" id="lockPass" autocomplete="current-password"></label>
        <label class="check"><input type="checkbox" id="lockRemember" checked> remember on this device</label>
        <p class="hint bad-hint" id="lockErr" style="display:none">Wrong passphrase.</p>
        <button class="btn primary" id="lockBtn">Unlock</button>
      </div>`;
    root.appendChild(wrap);
    const tryUnlock = async () => {
      const ok = await CRO.vault.unlock($('#lockPass').value, $('#lockRemember').checked);
      if (ok) { boot(); }
      else { $('#lockErr').style.display = 'block'; $('#lockPass').select(); }
    };
    $('#lockBtn').onclick = tryUnlock;
    $('#lockPass').addEventListener('keydown', e => { if (e.key === 'Enter') tryUnlock(); });
    $('#lockPass').focus();
  }

  /* ================= onboarding ================= */
  function viewOnboarding(root) {
    const wrap = el('div', 'onboard');
    wrap.innerHTML = `
      <div class="onboard-art">${CRO.icons.sahovnica(5, 5, 18)}</div>
      <h1>Imo i Nicro</h1>
      <p class="lede">Croatian for the two of you — short daily lessons on top of a real
      spaced-repetition engine, with every rule and word sourced. This is a private
      household app: everything is locked behind your passphrase and your synced data
      is end-to-end encrypted.</p>
      <div class="card form-card">
        <h2>Set up your household</h2>
        <label>First learner <input id="p1name" placeholder="Name" maxlength="14"></label>
        <label class="check"><input type="checkbox" id="p1known"> already speaks some Croatian</label>
        <hr>
        <label>Second learner <input id="p2name" placeholder="Name (optional)" maxlength="14"></label>
        <label class="check"><input type="checkbox" id="p2known"> already speaks some Croatian</label>
        <hr>
        <label>Household passphrase <input type="password" id="passA" autocomplete="new-password" placeholder="something you both remember"></label>
        <label>Repeat it <input type="password" id="passB" autocomplete="new-password"></label>
        <p class="hint bad-hint" id="passErr" style="display:none"></p>
        <button class="btn primary" id="startBtn">Počnimo! · Let's begin</button>
        <p class="hint">The passphrase locks the app on every device and encrypts everything
        that syncs between you. Each of you gets your own progress; the streak is shared —
        it only grows on days you <em>both</em> practise.</p>
        <hr>
        <button class="btn ghost" id="connectBtn">${ic('refresh', 15)} Already set up on another device? Connect sync</button>
        <p class="hint">Set up profiles on one device first, connect sync there (Settings), then join
        from here — GitHub sync works on any phone or computer.</p>
      </div>`;
    root.appendChild(wrap);
    $('#connectBtn').onclick = () => {
      const m = modal();
      m.body.innerHTML = `
        <h3>${ic('refresh', 18)} Connect to your existing setup</h3>
        <div class="syncopt">
          <h4>GitHub sync <span class="hint-inline">— any device</span></h4>
          <label class="modal-label">Household passphrase <input type="password" id="ob-pass" autocomplete="off"></label>
          <label class="modal-label">GitHub token <input id="ob-token" placeholder="ghp_…" autocomplete="off"></label>
          <label class="modal-label">Gist id <input id="ob-gist" placeholder="shown in Settings on the first device"></label>
          <button class="btn primary" id="ob-gconnect">Connect</button>
        </div>
        ${CRO.sync.status.supported ? `
        <div class="syncopt">
          <h4>Shared-folder file <span class="hint-inline">— desktop Chrome/Edge</span></h4>
          <button class="btn ghost" id="ob-fconnect">Pick imonicroat-sync.json…</button>
        </div>` : ''}`;
      async function afterConnect(ok) {
        if (!ok) { toast(CRO.sync.status.error || 'Could not connect.'); return; }
        state.profiles = await CRO.db.getAll('profiles');
        if (!state.profiles.length) { toast('Connected, but no profiles found yet — set up on the first device first.'); return; }
        state.activeId = state.profiles[0].id;
        await CRO.db.setMeta('activeProfile', state.activeId);
        state.overrides = await CRO.db.getAll('overrides');
        state.flags = await CRO.db.getAll('flags');
        state.variety = (await CRO.db.getAll('variety')).filter(v => !v.deleted);
        CRO.content.applyOverrides(state.overrides);
        await loadProfileSrs();
        m.close();
        render('home');
      }
      m.body.querySelector('#ob-gconnect').onclick = async () => {
        const pass = $('#ob-pass').value;
        if (!pass) { toast('Enter the household passphrase.'); return; }
        await CRO.db.setMeta('passphrase', pass); // needed to decrypt the remote data
        const ok = await CRO.sync.setupGist($('#ob-token').value, $('#ob-gist').value);
        if (ok) await CRO.vault.setPassphrase(pass); // adopt the lock locally too
        afterConnect(ok);
      };
      const fbtn = m.body.querySelector('#ob-fconnect');
      if (fbtn) fbtn.onclick = async () => {
        const pass = $('#ob-pass').value;
        if (pass) await CRO.db.setMeta('passphrase', pass);
        const ok = await CRO.sync.setup(false);
        if (ok && pass) await CRO.vault.setPassphrase(pass);
        afterConnect(ok);
      };
    };
    $('#startBtn').onclick = async () => {
      const mk = (name, known, hue) => ({
        id: 'p' + Math.random().toString(36).slice(2, 8),
        name: name.trim(), hue, createdAt: Date.now(), knowsSome: known
      });
      const n1 = $('#p1name').value.trim();
      if (!n1) { $('#p1name').focus(); return; }
      const pa = $('#passA').value, pb = $('#passB').value, perr = $('#passErr');
      if (pa.length < 4) { perr.textContent = 'Pick a passphrase of at least 4 characters.'; perr.style.display = 'block'; $('#passA').focus(); return; }
      if (pa !== pb) { perr.textContent = 'The two passphrases don\'t match.'; perr.style.display = 'block'; $('#passB').focus(); return; }
      await CRO.vault.setPassphrase(pa);
      const p1 = mk(n1, $('#p1known').checked, 205);
      await CRO.db.put('profiles', p1);
      state.profiles = [p1];
      const n2 = $('#p2name').value.trim();
      if (n2) {
        const p2 = mk(n2, $('#p2known').checked, 16);
        await CRO.db.put('profiles', p2);
        state.profiles.push(p2);
      }
      state.activeId = p1.id;
      await CRO.db.setMeta('activeProfile', p1.id);
      await loadProfileSrs();
      render('home');
    };
  }

  /* ================= home ================= */
  async function viewHome(root) {
    const main = el('main', 'home');
    root.appendChild(main);

    const sInfo = await streakInfo();
    const scores = await weekScores();
    const due = CRO.srs.dueCards(Object.values(state.srs), Date.now());
    const p = activeProfile();
    const partner = otherProfile();

    // streak + head-to-head band
    const band = el('section', 'band');
    const streakCls = sInfo.todayComplete ? 'flame lit' : 'flame';
    let streakNote;
    if (sInfo.todayComplete) streakNote = 'Both done today — the flame is safe.';
    else if (sInfo.youDone && partner) streakNote = `You're done — waiting on ${partner.name}.`;
    else if (!sInfo.youDone && sInfo.partnerDone && partner) streakNote = `${partner.name} already practised today. Your move.`;
    else streakNote = 'A lesson each keeps the shared flame alive.';
    band.innerHTML = `
      <div class="streakbox">
        <span class="${streakCls}">${ic(sInfo.todayComplete ? 'flame' : 'flameDim', 30)}</span>
        <div><div class="streak-n">${sInfo.streak}</div><div class="streak-lbl">shared streak</div></div>
        <p class="streak-note">${streakNote}</p>
      </div>`;
    if (partner) {
      const a = scores[p.id] || 0, b = scores[partner.id] || 0;
      const max = Math.max(a, b, 1);
      const lead = a === b ? 'Dead heat this week.' : (a > b ? `${p.name} leads this week!` : `${partner.name} leads this week!`);
      const h2h = el('div', 'h2h');
      h2h.innerHTML = `
        <div class="h2h-title">${ic('trophy', 16)} Tjedni dvoboj <span class="h2h-sub">· weekly duel</span></div>
        <div class="h2h-row"><span class="h2h-name">${p.name}</span><div class="h2h-bar"><div style="width:${Math.round(a / max * 100)}%; background:hsl(${p.hue} 55% 52%)"></div></div><span class="h2h-xp">${a}</span></div>
        <div class="h2h-row"><span class="h2h-name">${partner.name}</span><div class="h2h-bar"><div style="width:${Math.round(b / max * 100)}%; background:hsl(${partner.hue} 55% 52%)"></div></div><span class="h2h-xp">${b}</span></div>
        <div class="h2h-lead">${lead}</div>`;
      band.appendChild(h2h);
    }
    main.appendChild(band);

    // big start button
    const unit = currentUnit();
    const start = el('section', 'startrow');
    const newWords = nextNewWords(NEW_WORDS_PER_LESSON()).length;
    start.innerHTML = `
      <button class="btn primary big" id="startLesson">
        ${ic('bolt', 22)} Start lesson
        <span class="btn-sub">${due.length} review${due.length === 1 ? '' : 's'} due · ${newWords} new</span>
      </button>`;
    main.appendChild(start);
    start.querySelector('#startLesson').onclick = () => startSession();

    // flagged-items shortcut
    const openFlags = state.flags.filter(f => !f.resolved);
    if (openFlags.length) {
      const fl = el('button', 'reviewlink');
      fl.innerHTML = `${ic('flagFill', 17)} ${openFlags.length} flagged item${openFlags.length === 1 ? '' : 's'} awaiting native review`;
      fl.onclick = () => render('review');
      main.appendChild(fl);
    }

    // units
    const units = el('section', 'units');
    CRO.content.UNITS.forEach(u => {
      const prog = unitProgress(u.n);
      const pct = prog.total ? prog.seen / prog.total : 0;
      const card = el('div', 'unitcard' + (u.n === unit.n ? ' current' : '') + (pct >= 1 ? ' done' : ''));
      card.innerHTML = `
        <div class="unit-head">
          <span class="unit-num">${u.n}</span>
          <div class="unit-titles"><div class="unit-hr">${u.hrTitle}</div><div class="unit-en">${u.title}</div></div>
          <div class="unit-prog">${CRO.icons.sahovnica(8, Math.round(pct * 8), 10)}</div>
        </div>
        <p class="unit-blurb">${u.blurb}</p>
        <div class="unit-actions"></div>`;
      const actions = card.querySelector('.unit-actions');
      if (pct < 1) {
        const t = el('button', 'btn ghost small', `${ic('skip', 14)} Test out`);
        t.onclick = () => render('testout', u);
        actions.appendChild(t);
      }
      const g = el('button', 'btn ghost small', `${ic('book', 14)} Grammar notes`);
      g.onclick = () => showUnitNotes(u);
      actions.appendChild(g);
      units.appendChild(card);
    });
    main.appendChild(units);

    // variety + audio status footer
    const foot = el('footer', 'homefoot');
    const vCount = state.variety.length;
    const audioOk = CRO.audio.available();
    const st = CRO.sync.status;
    let syncHtml = '';
    if (st.state === 'needs-permission') {
      syncHtml = `<button class="linklike" id="syncReconnect">${ic('refresh', 14)} Reconnect sync (${esc(st.fileName || '')})</button>`;
    } else if (st.connected && st.state === 'ok') {
      syncHtml = `<span class="audio-status">${ic('refresh', 14)} synced · ${esc(st.fileName || '')}</span>`;
    } else if (st.state === 'offline') {
      syncHtml = `<span class="audio-status">${ic('refresh', 14)} offline — will sync</span>`;
    } else if (st.state === 'error') {
      syncHtml = `<span class="audio-status">${ic('refresh', 14)} sync error — see Settings</span>`;
    }
    foot.innerHTML = `
      <button class="linklike" id="varietyBtn">${ic('leaf', 15)} Family variety layer (${vCount})</button>
      ${syncHtml}
      <span class="audio-status">${ic(audioOk ? 'speaker' : 'speakerOff', 15)} ${audioOk ? 'Croatian voice: ' + CRO.audio.voiceLabel() : 'No Croatian voice on this device'}</span>`;
    main.appendChild(foot);
    foot.querySelector('#varietyBtn').onclick = () => render('variety');
    const rc = foot.querySelector('#syncReconnect');
    if (rc) rc.onclick = async () => {
      const ok = await CRO.sync.reconnect();
      if (ok) { await loadProfileSrs(); state.profiles = await CRO.db.getAll('profiles'); }
      render('home');
    };
  }

  /* ================= notes layer ================= */
  function sourceChips(sourceStr) {
    // expand known source keys into expandable detail
    const parts = (sourceStr || '').split(';').map(s => s.trim()).filter(Boolean);
    return parts.map(pt => {
      const key = Object.keys(CRO.content.SOURCES).find(k => pt.startsWith(k) || pt.startsWith(CRO.content.SOURCES[k].label));
      const det = key ? CRO.content.SOURCES[key].detail : '';
      return `<span class="src" title="${det.replace(/"/g, '&quot;')}">${pt}</span>`;
    }).join(' ');
  }

  function varietyFor(baseId) {
    return state.variety.filter(v => v.baseId === baseId);
  }

  function showNotes(cardId) {
    const item = CRO.content.item(cardId);
    if (!item) return;
    const isWord = cardId.startsWith('w:');
    const m = modal();
    let html = `<h3 class="notes-hr">${item.hr} ${audioBtnHtml(item.hr)}</h3><p class="notes-en">${item.en}</p>`;
    if (isWord) {
      if (item.g) html += `<p class="notes-line"><b>Gender:</b> ${({ m: 'masculine', f: 'feminine', n: 'neuter' })[item.g]}</p>`;
      if (item.pron) html += `<p class="notes-line"><b>Say it:</b> ${item.pron}</p>`;
      if (item.conj) html += `<p class="notes-line"><b>Present:</b> ${item.conj}</p>`;
      if (item.pf) html += `<p class="notes-line"><b>Perfective partner:</b> ${item.pf}</p>`;
      if (item.forms) html += `<p class="notes-line"><b>Forms taught:</b> ${Object.entries(item.forms).map(([k, v]) => k + ': ' + v).join(' · ')}</p>`;
    }
    if (item.note) html += `<p class="notes-note">${item.note}</p>`;
    const vars = varietyFor(cardId.slice(2));
    if (vars.length && state.settings.showVariety) {
      html += `<div class="notes-variety"><b>${ic('leaf', 13)} Family variety:</b> ` +
        vars.map(v => `<span class="variety-chip" title="${(v.note || '') + (v.region ? ' (' + v.region + ')' : '')}">${v.hr}</span>`).join(' ') + '</div>';
    }
    // related grammar
    const gIds = (item.grammar || []);
    gIds.forEach(gid => {
      const g = CRO.content.gramById[gid];
      if (g) html += `<div class="notes-gram"><h4>${g.title}</h4><p>${g.body}</p><div class="srcline">${sourceChips(g.source)}</div></div>`;
    });
    html += `<div class="srcline"><b>Source:</b> ${sourceChips(item.source)}</div>`;
    html += `<p class="notes-meta">Sentences in this course follow patterns attested in the cited references; the flag → review workflow exists so your native reviewer can correct anything that reads off.</p>`;
    const flagBtn = `<button class="btn ghost small" id="notesFlag">${ic('flag', 14)} Flag for review</button>`;
    m.body.innerHTML = html + flagBtn;
    m.body.querySelector('#notesFlag').onclick = () => { m.close(); flagDialog(cardId, 'notes panel'); };
    bindAudioBtns(m.body);
  }

  function showUnitNotes(u) {
    const m = modal();
    const grams = CRO.content.GRAMMAR.filter(g => g.unit === u.n);
    m.body.innerHTML = `<h3>${u.hrTitle} · ${u.title}</h3>` +
      (grams.length ? grams.map(g => `<div class="notes-gram"><h4>${g.title}</h4><p>${g.body}</p><div class="srcline">${sourceChips(g.source)}</div></div>`).join('') :
        '<p>No grammar notes in this unit.</p>');
  }

  function modal() {
    const back = el('div', 'modal-back');
    const box = el('div', 'modal');
    const x = el('button', 'modal-x', ic('cross', 18));
    const body = el('div', 'modal-body');
    box.appendChild(x); box.appendChild(body); back.appendChild(box);
    document.body.appendChild(back);
    const close = () => back.remove();
    x.onclick = close;
    back.onclick = e => { if (e.target === back) close(); };
    return { body, close };
  }

  /* ================= flags ================= */
  function flagDialog(cardId, context) {
    const item = CRO.content.item(cardId);
    const m = modal();
    m.body.innerHTML = `
      <h3>${ic('flag', 18)} Flag for native review</h3>
      <p class="notes-en">“${item ? item.hr : cardId}” — what looks wrong?</p>
      <textarea id="flagNote" rows="3" placeholder="e.g. nobody says this — we'd say … instead"></textarea>
      <button class="btn primary" id="flagSave">Save flag</button>`;
    m.body.querySelector('#flagSave').onclick = async () => {
      const f = Object.assign({
        id: 'f' + Date.now() + Math.random().toString(36).slice(2, 6),
        cardId, note: $('#flagNote').value.trim(), context: context || '',
        profileId: state.activeId, createdAt: Date.now(), updatedAt: Date.now(), resolved: false
      }, await stamp());
      await CRO.db.put('flags', f);
      state.flags.push(f);
      CRO.sync.syncNow('flag');
      m.close();
      toast('Flagged — it will appear on the review screen.');
    };
  }

  /* ================= review screen (correction workflow) ================= */
  async function viewReview(root) {
    const main = el('main', 'review');
    root.appendChild(main);
    main.appendChild(el('h2', null, `${ic('flagFill', 20)} Native review`));
    main.appendChild(el('p', 'lede-small',
      'Everything flagged in lessons gathers here. Corrections are applied to the lesson content immediately, and you can reset the spaced-repetition schedule for the corrected card so both of you re-learn the fixed version.'));

    const open = state.flags.filter(f => !f.resolved);
    if (!open.length) {
      main.appendChild(el('p', 'empty', 'Nothing flagged right now. Čisto! ✦'));
      const back = el('button', 'btn ghost', 'Back');
      back.onclick = () => render('home');
      main.appendChild(back);
      return;
    }

    // group flags by card
    const byCard = {};
    open.forEach(f => { (byCard[f.cardId] = byCard[f.cardId] || []).push(f); });

    Object.entries(byCard).forEach(([cardId, flags]) => {
      const item = CRO.content.item(cardId);
      if (!item) return;
      const isWord = cardId.startsWith('w:');
      const card = el('div', 'card flagcard');
      const who = flags.map(f => {
        const prof = state.profiles.find(p => p.id === f.profileId);
        return `<div class="flag-note">${ic('flag', 13)} <b>${prof ? prof.name : '?'}</b>${f.context ? ' <span class="flag-ctx">(' + f.context + ')</span>' : ''}: ${f.note || '<i>no note</i>'}</div>`;
      }).join('');
      card.innerHTML = `
        ${who}
        <div class="editgrid">
          <label>Croatian <input class="e-hr" value="${esc(item.hr)}"></label>
          <label>English <input class="e-en" value="${esc(item.en)}"></label>
          ${isWord ? `<label>Pronunciation <input class="e-pron" value="${esc(item.pron || '')}"></label>` : ''}
          <label>Note <input class="e-note" value="${esc(item.note || '')}"></label>
          <label>Source <input class="e-src" value="${esc(item.source || '')}"></label>
        </div>
        <label class="check"><input type="checkbox" class="e-reset" checked> reset the SRS schedule for this card (both profiles) so the correction is re-learned</label>
        <div class="row">
          <button class="btn primary e-save">Apply correction</button>
          <button class="btn ghost e-dismiss">Dismiss flag${flags.length > 1 ? 's' : ''} (content is fine)</button>
        </div>`;
      main.appendChild(card);

      card.querySelector('.e-save').onclick = async () => {
        const patch = {
          hr: card.querySelector('.e-hr').value,
          en: card.querySelector('.e-en').value,
          note: card.querySelector('.e-note').value,
          source: card.querySelector('.e-src').value
        };
        const pronEl = card.querySelector('.e-pron');
        if (pronEl) patch.pron = pronEl.value;
        const id = cardId.slice(2);
        const override = Object.assign({ id, patch, editedAt: Date.now(), editedBy: state.activeId }, await stamp());
        await CRO.db.put('overrides', override);
        state.overrides = state.overrides.filter(o => o.id !== id).concat([override]);
        CRO.content.applyOverrides([override]);
        if (card.querySelector('.e-reset').checked) await resetCardAllProfiles(cardId);
        for (const f of flags) { Object.assign(f, { resolved: true, updatedAt: Date.now() }, await stamp()); await CRO.db.put('flags', f); }
        CRO.sync.syncNow('correction');
        toast('Correction applied.');
        render('review');
      };
      card.querySelector('.e-dismiss').onclick = async () => {
        for (const f of flags) { Object.assign(f, { resolved: true, updatedAt: Date.now() }, await stamp()); await CRO.db.put('flags', f); }
        CRO.sync.syncNow('dismiss');
        render('review');
      };
    });

    const back = el('button', 'btn ghost', 'Back');
    back.onclick = () => render('home');
    main.appendChild(back);
  }

  async function resetCardAllProfiles(cardId) {
    const all = await CRO.db.getAll('srs');
    for (const rec of all) {
      if (rec.cardId === cardId) {
        const fresh = Object.assign(CRO.srs.newCard(cardId), await stamp());
        await CRO.db.put('srs', Object.assign({ key: rec.key, profileId: rec.profileId }, fresh));
        if (rec.profileId === state.activeId) state.srs[cardId] = Object.assign({}, fresh);
      }
    }
  }

  function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }

  /* ================= family variety layer ================= */
  function viewVariety(root) {
    const main = el('main', 'variety');
    root.appendChild(main);
    main.appendChild(el('h2', null, `${ic('leaf', 20)} Family variety`));
    main.appendChild(el('p', 'lede-small',
      'Regional vocabulary and alternative phrasings your family actually uses. These stay tagged separately from standard Croatian — shown as green chips, never mixed into the standard answers.'));

    const form = el('div', 'card form-card');
    form.innerHTML = `
      <label>Links to standard word/sentence (optional)
        <select id="v-base"><option value="">— none, standalone entry —</option>
          ${CRO.content.WORDS.map(w => `<option value="${w.id}">${esc(w.hr)} · ${esc(w.en)}</option>`).join('')}
        </select></label>
      <label>Family / regional Croatian <input id="v-hr" placeholder="e.g. kaj, fjaka, šugaman"></label>
      <label>Meaning <input id="v-en" placeholder="English meaning"></label>
      <label>Region / who says it <input id="v-region" placeholder="e.g. kajkavian — baka in Zagorje"></label>
      <label>Note <input id="v-note" placeholder="anything worth remembering"></label>
      <button class="btn primary" id="v-add">${ic('plus', 15)} Add entry</button>`;
    main.appendChild(form);
    form.querySelector('#v-add').onclick = async () => {
      const hr = $('#v-hr').value.trim();
      if (!hr) return;
      const v = Object.assign({
        id: 'v' + Date.now(), baseId: $('#v-base').value || null,
        hr, en: $('#v-en').value.trim(), region: $('#v-region').value.trim(),
        note: $('#v-note').value.trim(), createdAt: Date.now(), updatedAt: Date.now()
      }, await stamp());
      await CRO.db.put('variety', v);
      state.variety.push(v);
      CRO.sync.syncNow('variety');
      render('variety');
    };

    state.variety.slice().reverse().forEach(v => {
      const base = v.baseId ? CRO.content.wordById[v.baseId] : null;
      const row = el('div', 'card vrow');
      row.innerHTML = `
        <div><span class="variety-chip big">${esc(v.hr)}</span> ${esc(v.en || '')}
          ${base ? `<span class="vrow-base">↔ standard: <b>${esc(base.hr)}</b></span>` : ''}
          ${v.region ? `<div class="vrow-region">${esc(v.region)}</div>` : ''}
          ${v.note ? `<div class="vrow-note">${esc(v.note)}</div>` : ''}</div>
        <button class="iconbtn v-del" title="Delete">${ic('cross', 16)}</button>`;
      row.querySelector('.v-del').onclick = async () => {
        // tombstone, not delete — so the removal also syncs to the other device
        Object.assign(v, { deleted: true, updatedAt: Date.now() }, await stamp());
        await CRO.db.put('variety', v);
        state.variety = state.variety.filter(x => x.id !== v.id);
        CRO.sync.syncNow('variety');
        render('variety');
      };
      main.appendChild(row);
    });

    const back = el('button', 'btn ghost', 'Back');
    back.onclick = () => render('home');
    main.appendChild(back);
  }

  /* ================= settings ================= */
  function viewSettings(root) {
    const main = el('main', 'settings');
    root.appendChild(main);
    main.appendChild(el('h2', null, `${ic('gear', 20)} Settings`));
    const card = el('div', 'card form-card');
    const audioOk = CRO.audio.available();
    card.innerHTML = `
      <label>New words per lesson
        <select id="s-new">${[2, 3, 4, 5, 6].map(n => `<option ${n === state.settings.newPerLesson ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label>Memory strictness (FSRS target retention)
        <select id="s-ret">
          <option value="0.85" ${state.settings.retention === 0.85 ? 'selected' : ''}>relaxed — fewer reviews (85%)</option>
          <option value="0.9" ${state.settings.retention === 0.9 ? 'selected' : ''}>standard (90%)</option>
          <option value="0.93" ${state.settings.retention === 0.93 ? 'selected' : ''}>strict — more reviews (93%)</option>
        </select></label>
      <label class="check"><input type="checkbox" id="s-var" ${state.settings.showVariety ? 'checked' : ''}> show family-variety chips in lessons</label>
      <p class="hint">${ic(audioOk ? 'speaker' : 'speakerOff', 14)} ${audioOk ? 'Croatian voice: ' + CRO.audio.voiceLabel() : 'No Croatian voice found. On Windows, add one under Settings → Time & Language → Speech → Add voices → Croatian; Chrome also ships a Google hrvatski voice when online.'}</p>
      <hr>
      <h3 class="settings-h">${ic('gear', 16)} Household passphrase</h3>
      <p class="hint" id="s-lockstatus"></p>
      <div class="row">
        <input type="password" id="s-pass" placeholder="new passphrase" style="flex:1">
        <button class="btn ghost small" id="s-setpass">Set</button>
        <button class="btn ghost small" id="s-locknow">Lock now</button>
      </div>
      <p class="hint">Locks the app on this device and end-to-end encrypts everything that syncs.
      Use the same passphrase on every device. If you change it, change it everywhere and run
      “Sync now” from this device first.</p>
      <hr>
      <h3 class="settings-h">${ic('refresh', 16)} Sync between devices</h3>
      <p class="hint" id="s-syncstatus"></p>
      <div id="s-syncbody"></div>
      <hr>
      <div class="row">
        <button class="btn ghost" id="s-export">${ic('download', 15)} Export backup</button>
        <button class="btn ghost" id="s-import">${ic('upload', 15)} Import backup</button>
      </div>
      <p class="hint">Manual fallback: all data lives in this browser (IndexedDB) and works offline; the backup file carries both profiles, all corrections and the variety layer.</p>
      <input type="file" id="s-file" accept=".json" style="display:none">`;
    main.appendChild(card);

    // passphrase section wiring
    (async () => {
      $('#s-lockstatus').textContent = (await CRO.vault.hasLock())
        ? 'A passphrase is set on this device.'
        : 'No passphrase yet — set one to lock the app and encrypt sync.';
    })();
    $('#s-setpass').onclick = async () => {
      const p = $('#s-pass').value;
      if (p.length < 4) { toast('At least 4 characters.'); return; }
      await CRO.vault.setPassphrase(p);
      $('#s-pass').value = '';
      $('#s-lockstatus').textContent = 'A passphrase is set on this device.';
      CRO.sync.syncNow('rekey'); // re-encrypt the remote copy under the new key
      toast('Passphrase set — synced data is now encrypted with it.');
    };
    $('#s-locknow').onclick = async () => {
      if (!(await CRO.vault.hasLock())) { toast('Set a passphrase first.'); return; }
      await CRO.vault.lockNow();
      location.reload();
    };

    // sync section wiring
    function renderSyncRow() {
      const st = CRO.sync.status;
      const lbl = $('#s-syncstatus'), body = $('#s-syncbody');
      body.innerHTML = '';
      if (st.state === 'ok') lbl.textContent = `Connected via ${st.transport === 'gist' ? 'GitHub' : st.fileName} · last synced ${new Date(st.lastSync).toLocaleTimeString()}`;
      else if (st.state === 'offline') lbl.textContent = 'Connected — offline right now; sync resumes automatically.';
      else if (st.state === 'needs-permission') lbl.textContent = `Remembered ${st.fileName} — click Reconnect to allow access.`;
      else if (st.state === 'error') lbl.textContent = 'Sync error: ' + (st.error || 'unknown');
      else lbl.textContent = 'Not connected.';

      const mk = (txt, fn, primary) => {
        const b = el('button', 'btn ' + (primary ? 'primary' : 'ghost') + ' small', txt);
        b.onclick = async () => { await fn(); renderSyncRow(); };
        return b;
      };

      if (st.connected || st.state === 'needs-permission') {
        const row = el('div', 'row');
        if (st.state === 'needs-permission') row.appendChild(mk('Reconnect', () => CRO.sync.reconnect(), true));
        else row.appendChild(mk('Sync now', () => CRO.sync.syncNow('manual'), true));
        row.appendChild(mk('Disconnect', () => CRO.sync.disconnect()));
        body.appendChild(row);
        const g = CRO.sync.gistInfo();
        if (g) {
          body.appendChild(el('p', 'hint', `To connect another device, enter the same token there with gist id: <b>${esc(g.id)}</b>`));
        }
        return;
      }

      // --- not connected: offer both transports ---
      const gistBox = el('div', 'syncopt');
      gistBox.innerHTML = `
        <h4>${ic('bolt', 14)} GitHub sync <span class="hint-inline">— recommended: works on PC, Mac, Android and iPhone</span></h4>
        <p class="hint">Make one free GitHub account for the two of you. Create a token at
        <b>github.com/settings/tokens</b> (classic token, only the <b>gist</b> scope, no expiry).
        Enter it on every device; leave the gist id empty on the first device — the app creates a
        private gist and shows you the id to use on the others.</p>
        <label>GitHub token <input id="g-token" placeholder="ghp_…" autocomplete="off"></label>
        <label>Gist id (empty on first device) <input id="g-id" placeholder="e.g. 9f2c4a…"></label>
        <button class="btn primary small" id="g-connect">Connect GitHub sync</button>`;
      body.appendChild(gistBox);
      gistBox.querySelector('#g-connect').onclick = async () => {
        const ok = await CRO.sync.setupGist($('#g-token').value, $('#g-id').value);
        if (ok) { toast('GitHub sync connected.'); state.profiles = await CRO.db.getAll('profiles'); await loadProfileSrs(); }
        else toast(CRO.sync.status.error || 'Could not connect.');
        renderSyncRow();
      };

      if (st.supported) {
        const fileBox = el('div', 'syncopt');
        fileBox.innerHTML = `
          <h4>${ic('download', 14)} Shared-folder file <span class="hint-inline">— desktop Chrome/Edge only</span></h4>
          <p class="hint">Point both computers at one <b>imonicroat-sync.json</b> in a folder you share
          (OneDrive, Dropbox…). When the browser asks, choose “Allow on every visit”.</p>
          <div class="row" id="f-row"></div>`;
        body.appendChild(fileBox);
        const frow = fileBox.querySelector('#f-row');
        frow.appendChild(mk('Create sync file…', () => CRO.sync.setup(true)));
        frow.appendChild(mk('Connect existing…', () => CRO.sync.setup(false)));
      }
    }
    renderSyncRow();

    $('#s-new').onchange = saveSettings; $('#s-ret').onchange = saveSettings; $('#s-var').onchange = saveSettings;
    async function saveSettings() {
      state.settings.newPerLesson = parseInt($('#s-new').value, 10);
      state.settings.retention = parseFloat($('#s-ret').value);
      state.settings.showVariety = $('#s-var').checked;
      await CRO.db.setMeta('settings', state.settings);
      toast('Saved.');
    }
    $('#s-export').onclick = async () => {
      const dump = await CRO.db.exportAll();
      const blob = new Blob([JSON.stringify(dump, null, 1)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'imonicroat-backup-' + todayKey() + '.json';
      a.click();
    };
    $('#s-import').onclick = () => $('#s-file').click();
    $('#s-file').onchange = async e => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const dump = JSON.parse(await file.text());
        await CRO.db.importAll(dump);
        toast('Imported. Reloading…');
        setTimeout(() => location.reload(), 700);
      } catch (err) { toast('Import failed: ' + err.message); }
    };

    const back = el('button', 'btn ghost', 'Back');
    back.onclick = () => render('home');
    main.appendChild(back);
  }

  /* ================= test-out ================= */
  function viewTestout(root, unit) {
    const main = el('main', 'lesson');
    root.appendChild(main);
    const words = CRO.content.WORDS.filter(w => w.unit === unit.n);
    const sents = CRO.content.SENTENCES.filter(s => s.unit === unit.n);
    CRO.ex.reseed(Date.now());
    const qs = CRO.ex.shuffle(words).slice(0, 7).map(w => CRO.ex.exChoice(w, 'en2hr'))
      .concat(CRO.ex.shuffle(sents).slice(0, 3).map(s => CRO.ex.exTiles(s)));
    const quiz = CRO.ex.shuffle(qs);
    const results = [];
    let i = 0;

    function step() {
      if (i >= quiz.length) return finish();
      renderExercise(main, quiz[i], {
        progress: { done: i, total: quiz.length },
        title: `Test out · ${unit.hrTitle}`,
        onResult(res, ex) { results.push({ ex, ok: res.ok }); i += 1; step(); },
        onQuit: () => render('home')
      });
    }

    async function finish() {
      const okIds = new Set(results.filter(r => r.ok && r.ex.cardId).map(r => r.ex.cardId));
      const passRate = results.filter(r => r.ok).length / results.length;
      const now = Date.now();
      let seeded = 0;
      if (passRate >= 0.8) {
        // seed the whole unit as known
        for (const w of words) { await seedIfNew('w:' + w.id, now); seeded++; }
        for (const s of sents) { await seedIfNew('s:' + s.id, now); seeded++; }
      } else {
        for (const id of okIds) { await seedIfNew(id, now); seeded++; }
      }
      main.innerHTML = '';
      const done = el('div', 'summary card');
      done.innerHTML = `
        <h2>${passRate >= 0.8 ? 'Bravo! Unit tested out.' : 'Partial credit'}</h2>
        <p>${Math.round(passRate * 100)}% correct. ${seeded} card${seeded === 1 ? '' : 's'} scheduled as already-known —
        FSRS will check in on them in a few weeks instead of teaching them from scratch.</p>
        <button class="btn primary">Continue</button>`;
      done.querySelector('button').onclick = () => render('home');
      main.appendChild(done);
    }

    async function seedIfNew(cardId, now) {
      if (state.srs[cardId] && state.srs[cardId].state !== 'new') return;
      const c = CRO.srs.seedKnown(CRO.srs.newCard(cardId), now, 30);
      await saveCard(c);
    }
    step();
  }

  /* ================= lesson session =================
     The lesson teaches before it tests:
       1. unit opener (first time you enter a unit)
       2. each new word: intro screen → easy recognition
       3. each new sentence: grammar screen (first time the concept appears)
            → teach screen with word-by-word gloss → recognise the meaning
       4. due reviews (graded by FSRS maturity)
       5. second, harder pass over today's new words
       6. recap on the summary screen
  */
  function startSession() {
    CRO.ex.reseed(Date.now());
    const now = Date.now();
    const due = CRO.srs.dueCards(Object.values(state.srs), now).slice(0, 8);
    const newWords = nextNewWords(NEW_WORDS_PER_LESSON());
    const newSents = availableNewSentences(3, newWords.map(w => w.id));

    const steps = [];
    const learned = { words: newWords, grammar: [], sentences: newSents };

    // 1. unit opener when this lesson is the first visit to a unit
    if (newWords.length) {
      const u = CRO.content.UNITS.find(x => x.n === newWords[0].unit);
      const unitTouched = Object.keys(state.srs).some(id =>
        id.startsWith('w:') && CRO.content.wordById[id.slice(2)] &&
        CRO.content.wordById[id.slice(2)].unit === u.n);
      if (u && !unitTouched) steps.push({ kind: 'unitIntro', unit: u });
    }

    // 2. new words: teach, then recognise
    newWords.forEach(w => {
      steps.push({ kind: 'intro', word: w });
      steps.push({ kind: 'ex', make: () => CRO.ex.exerciseFor('w:' + w.id, 'new', CRO.audio.available()) });
    });

    // 3. new sentences: grammar concept → teach screen → easy exercise
    const alreadyTaught = new Set(
      CRO.content.SENTENCES.filter(s => state.srs['s:' + s.id]).flatMap(s => s.grammar || []));
    newSents.forEach(s => {
      (s.grammar || []).forEach(gid => {
        if (!alreadyTaught.has(gid) && CRO.content.gramById[gid]) {
          alreadyTaught.add(gid);
          learned.grammar.push(CRO.content.gramById[gid]);
          steps.push({ kind: 'grammar', g: CRO.content.gramById[gid], sent: s });
        }
      });
      steps.push({ kind: 'sentTeach', sent: s });
      steps.push({ kind: 'ex', make: () => CRO.ex.exerciseFor('s:' + s.id, 'new', CRO.audio.available()) });
    });

    // 4. due reviews
    const rest = [];
    due.forEach(c => rest.push({ kind: 'ex', make: () => CRO.ex.exerciseFor(c.cardId, CRO.srs.maturity(c), CRO.audio.available()) }));

    // 5. second pass over today's new words, one notch harder
    newWords.forEach(w => rest.push({ kind: 'ex', make: () => CRO.ex.exerciseFor('w:' + w.id, 'learning', CRO.audio.available()) }));

    const all = steps.concat(CRO.ex.shuffle(rest));

    // pair-matching break in the middle if enough words are in play
    const sessionWordIds = newWords.map(w => w.id)
      .concat(due.filter(c => c.cardId.startsWith('w:')).map(c => c.cardId.slice(2)));
    if (sessionWordIds.length >= 5) {
      const ws = CRO.ex.shuffle(sessionWordIds).slice(0, 5).map(id => CRO.content.wordById[id]).filter(Boolean);
      if (ws.length === 5) all.splice(Math.floor(all.length / 2), 0, { kind: 'pairs', words: ws });
    }

    if (!all.length) { toast('Nothing due — come back later today!'); return; }
    const unit = newWords.length ? CRO.content.UNITS.find(x => x.n === newWords[0].unit) : currentUnit();
    state.session = {
      steps: all, idx: 0, xp: 0, correct: 0, total: 0, requeued: {},
      learned, title: unit ? `Unit ${unit.n} · ${unit.hrTitle}` : 'Review'
    };
    render('lesson');
  }

  function viewLesson(root) {
    const s = state.session;
    if (!s) { render('home'); return; }
    const main = el('main', 'lesson');
    root.appendChild(main);
    nextStep(main);
  }

  async function nextStep(main) {
    const s = state.session;
    if (s.idx >= s.steps.length) return finishSession(main);
    const step = s.steps[s.idx];

    if (step.kind === 'intro') {
      renderIntro(main, step.word, () => { s.idx += 1; nextStep(main); });
      return;
    }
    if (step.kind === 'unitIntro') {
      renderUnitIntro(main, step.unit, () => { s.idx += 1; nextStep(main); });
      return;
    }
    if (step.kind === 'grammar') {
      renderGrammarTeach(main, step.g, step.sent, () => { s.idx += 1; nextStep(main); });
      return;
    }
    if (step.kind === 'sentTeach') {
      renderSentTeach(main, step.sent, () => { s.idx += 1; nextStep(main); });
      return;
    }
    if (step.kind === 'pairs') {
      renderPairs(main, step.words, async (perWordOk) => {
        for (const [wid, ok] of Object.entries(perWordOk)) {
          await gradeCard('w:' + wid, ok ? CRO.srs.Rating.Good : CRO.srs.Rating.Again);
          s.total += 1; if (ok) { s.correct += 1; s.xp += XP_CORRECT / 2; }
        }
        s.idx += 1; nextStep(main);
      }, sessionChromeOpts());
      return;
    }

    const ex = step.make();
    if (!ex) { s.idx += 1; nextStep(main); return; }
    renderExercise(main, ex, {
      progress: { done: s.idx, total: s.steps.length },
      onQuit: quitSession,
      title: state.session.title,
      async onResult(res, ex2, ms) {
        s.total += 1;
        if (ex2.cardId) {
          const rating = ex2.rating ? ex2.rating(res, ms) : (res.ok ? 3 : 1);
          await gradeCard(ex2.cardId, rating);
        }
        if (res.ok) { s.correct += 1; s.xp += (res.diacriticsOnly || res.typo) ? XP_HARD : XP_CORRECT; }
        else if (ex2.cardId && (s.requeued[ex2.cardId] || 0) < 1) {
          // missed it → see it again before the session ends
          s.requeued[ex2.cardId] = 1;
          const cardId = ex2.cardId;
          s.steps.push({ kind: 'ex', make: () => CRO.ex.exerciseFor(cardId, 'learning', CRO.audio.available()) });
        }
        s.idx += 1;
        nextStep(main);
      }
    });
  }

  async function gradeCard(cardId, rating) {
    let card = state.srs[cardId];
    if (!card) card = CRO.srs.newCard(cardId);
    CRO.srs.review(card, rating, Date.now(), state.settings.retention);
    await saveCard(card);
  }

  function quitSession() {
    state.session = null;
    render('home');
  }

  async function finishSession(main) {
    const s = state.session;
    await addXp(Math.round(s.xp), true);
    await CRO.sync.syncNow('lesson'); // pick up partner's day before showing the streak
    state.session = null;
    render('summary', s);
  }

  async function viewSummary(root, s) {
    const main = el('main', 'lesson');
    root.appendChild(main);
    const sInfo = await streakInfo();
    const acc = s.total ? Math.round(100 * s.correct / s.total) : 100;
    const partner = otherProfile();
    let streakLine;
    if (sInfo.todayComplete) streakLine = `${ic('flame', 22)} Shared streak: <b>${sInfo.streak}</b> — both of you practised today.`;
    else if (partner) streakLine = `${ic('flameDim', 22)} Your half is done. The streak ticks to <b>${sInfo.streak + 1}</b> once ${partner.name} practises today.`;
    else streakLine = `${ic('flame', 22)} Streak: <b>${sInfo.streak}</b>`;
    const learned = s.learned || { words: [], grammar: [], sentences: [] };
    let recap = '';
    if (learned.words.length || learned.grammar.length) {
      recap = `<div class="recap">
        ${learned.words.length ? `<div class="recap-row"><b>New words</b> ${learned.words.map(w => `<span class="recap-chip">${esc(w.hr.split(' / ')[0])}</span>`).join(' ')}</div>` : ''}
        ${learned.grammar.length ? `<div class="recap-row"><b>New grammar</b> ${learned.grammar.map(g => `<span class="recap-chip">${esc(g.title)}</span>`).join(' ')}</div>` : ''}
      </div>`;
    }
    const card = el('div', 'summary card');
    card.innerHTML = `
      <div class="sum-sah">${CRO.icons.sahovnica(8, Math.round(acc / 100 * 8), 14)}</div>
      <h2>Lekcija gotova!</h2>
      <p class="sum-stats">+${Math.round(s.xp)} XP · ${acc}% correct</p>
      ${recap}
      <p class="sum-streak">${streakLine}</p>
      <div class="row center">
        <button class="btn primary" id="sumHome">Continue</button>
        <button class="btn ghost" id="sumAgain">${ic('refresh', 15)} Another lesson</button>
      </div>`;
    main.appendChild(card);
    card.querySelector('#sumHome').onclick = () => render('home');
    card.querySelector('#sumAgain').onclick = () => startSession();
  }

  /* ================= exercise rendering ================= */
  function lessonChrome(main, opts) {
    main.innerHTML = '';
    const top = el('div', 'lesson-top');
    const quit = el('button', 'iconbtn', ic('cross', 20));
    quit.title = 'Quit lesson';
    quit.onclick = opts.onQuit || (() => render('home'));
    const prog = el('div', 'progressbar');
    const pct = opts.progress ? Math.round(100 * opts.progress.done / Math.max(1, opts.progress.total)) : 0;
    prog.innerHTML = `<div class="progress-fill" style="width:${pct}%"></div>`;
    top.appendChild(quit); top.appendChild(prog);
    if (opts.title) top.appendChild(el('span', 'lesson-title', opts.title));
    main.appendChild(top);
    const stage = el('div', 'stage');
    main.appendChild(stage);
    return stage;
  }

  function audioBtnHtml(text, slow) {
    if (!CRO.audio.available() && !CRO.audio.nearVoice) return '';
    return `<button class="audiobtn" data-say="${esc(text)}" ${slow ? 'data-slow="1"' : ''} title="Listen">${ic('speaker', 16)}</button>`;
  }
  function bindAudioBtns(scope) {
    scope.querySelectorAll('.audiobtn').forEach(b => {
      b.onclick = e => {
        e.stopPropagation();
        CRO.audio.speak(b.dataset.say, b.dataset.slow ? 0.6 : 0.85);
      };
    });
  }

  function flagBtnEl(cardId, context) {
    const b = el('button', 'flagbtn', ic('flag', 15));
    b.title = 'Flag for native review';
    b.onclick = () => flagDialog(cardId, context);
    return b;
  }
  function notesBtnEl(cardId) {
    const b = el('button', 'flagbtn', ic('info', 15));
    b.title = 'Notes & sources';
    b.onclick = () => showNotes(cardId);
    return b;
  }

  /** Intro screen for a new word. */
  function renderIntro(main, word, onNext) {
    const stage = lessonChrome(main, sessionChromeOpts());
    const genderTag = word.g ? `<span class="gender g-${word.g}">${({ m: 'muški · m', f: 'ženski · f', n: 'srednji · n' })[word.g]}</span>` : '';
    const vars = state.settings.showVariety ? varietyFor(word.id) : [];
    const box = el('div', 'introcard card');
    box.innerHTML = `
      <div class="intro-label">${ic('sparkle', 15)} new word</div>
      <div class="intro-hr">${word.hr} ${audioBtnHtml(word.hr.split(' / ')[0])}</div>
      ${genderTag}
      <div class="intro-en">${word.en}</div>
      <div class="intro-pron">${word.pron || ''}</div>
      ${word.conj ? `<div class="intro-conj">${word.conj}</div>` : ''}
      ${word.note ? `<div class="intro-note">${word.note}</div>` : ''}
      ${vars.length ? `<div class="notes-variety">${ic('leaf', 13)} ${vars.map(v => `<span class="variety-chip" title="${esc(v.note || '')}">${esc(v.hr)}</span>`).join(' ')}</div>` : ''}
      <div class="srcline">${sourceChips(word.source)}</div>
      <button class="btn primary" id="introNext">Got it</button>`;
    stage.appendChild(box);
    const tools = el('div', 'extools');
    tools.appendChild(notesBtnEl('w:' + word.id));
    tools.appendChild(flagBtnEl('w:' + word.id, 'intro screen'));
    box.prepend(tools);
    bindAudioBtns(box);
    if (CRO.audio.available()) CRO.audio.speak(word.hr.split(' / ')[0]);
    $('#introNext').onclick = onNext;
  }

  function sessionProgress() {
    const s = state.session;
    return s ? { done: s.idx, total: s.steps.length } : { done: 0, total: 1 };
  }

  function sessionChromeOpts() {
    return { progress: sessionProgress(), onQuit: quitSession, title: state.session && state.session.title };
  }

  /** Unit opener — where you are and why this unit matters. */
  function renderUnitIntro(main, unit, onNext) {
    const stage = lessonChrome(main, sessionChromeOpts());
    const grams = CRO.content.GRAMMAR.filter(g => g.unit === unit.n);
    const box = el('div', 'introcard card');
    box.innerHTML = `
      <div class="intro-label">${ic('book', 15)} unit ${unit.n}</div>
      <div class="intro-hr">${esc(unit.hrTitle)}</div>
      <div class="intro-en">${esc(unit.title)}</div>
      <div class="intro-note">${esc(unit.blurb)}</div>
      ${grams.length ? `<p class="unit-coming">Coming up in this unit: ${grams.map(g => '<b>' + esc(g.title) + '</b>').join(' · ')}</p>` : ''}
      <button class="btn primary" id="contBtn">Start</button>`;
    stage.appendChild(box);
    box.querySelector('#contBtn').onclick = onNext;
  }

  /** Grammar teach screen — the rule, taught before it is ever tested. */
  function renderGrammarTeach(main, g, exampleSent, onNext) {
    const stage = lessonChrome(main, sessionChromeOpts());
    const box = el('div', 'introcard card teachcard');
    box.innerHTML = `
      <div class="intro-label">${ic('sparkle', 15)} new grammar</div>
      <div class="teach-title">${esc(g.title)}</div>
      <p class="teach-body">${esc(g.body)}</p>
      ${exampleSent ? `<div class="teach-example">${esc(exampleSent.hr)} ${audioBtnHtml(exampleSent.hr)}<span class="teach-example-en">${esc(exampleSent.en)}</span></div>` : ''}
      <div class="srcline">${sourceChips(g.source)}</div>
      <button class="btn primary" id="contBtn">Got it</button>`;
    stage.appendChild(box);
    bindAudioBtns(box);
    box.querySelector('#contBtn').onclick = onNext;
  }

  /** Sentence teach screen — full sentence, audio, word-by-word gloss. */
  function renderSentTeach(main, sent, onNext) {
    const stage = lessonChrome(main, sessionChromeOpts());
    const gloss = (sent.words || [])
      .map(id => CRO.content.wordById[id])
      .filter(Boolean)
      .map(w => `<span class="gloss"><b>${esc(w.hr.split(' / ')[0])}</b> ${esc(w.en.split(' / ')[0].split(' (')[0])}</span>`)
      .join('');
    const box = el('div', 'introcard card teachcard');
    box.innerHTML = `
      <div class="intro-label">${ic('sparkle', 15)} new sentence</div>
      <div class="intro-hr sent-hr">${esc(sent.hr)} ${audioBtnHtml(sent.hr)}</div>
      <div class="intro-en">${esc(sent.en)}</div>
      ${gloss ? `<div class="glossrow">${gloss}</div>` : ''}
      ${sent.note ? `<div class="intro-note">${esc(sent.note)}</div>` : ''}
      <div class="srcline">${sourceChips(sent.source)}</div>
      <button class="btn primary" id="contBtn">Got it</button>`;
    stage.appendChild(box);
    const tools = el('div', 'extools');
    tools.appendChild(notesBtnEl('s:' + sent.id));
    tools.appendChild(flagBtnEl('s:' + sent.id, 'teach screen'));
    box.prepend(tools);
    bindAudioBtns(box);
    if (CRO.audio.available()) CRO.audio.speak(sent.hr);
    box.querySelector('#contBtn').onclick = onNext;
  }

  /** Generic exercise renderer. opts.onResult(res, ex, ms) */
  function renderExercise(main, ex, opts) {
    const stage = lessonChrome(main, opts);
    const t0 = Date.now();
    const box = el('div', 'excard card');
    stage.appendChild(box);
    const tools = el('div', 'extools');
    if (ex.cardId) { tools.appendChild(notesBtnEl(ex.cardId)); tools.appendChild(flagBtnEl(ex.cardId, ex.type)); }
    box.appendChild(tools);

    const submitWrap = el('div', 'submitrow');
    let getAnswer = null;   // set per type; returns the payload for ex.check
    let autoSubmitting = false;

    function prompt(html) { box.appendChild(el('div', 'ex-prompt', html)); }

    switch (ex.type) {
      case 'choice': {
        const w = ex.word;
        if (ex.dir === 'hr2en') prompt(`<span class="ex-kind">${ic('swap', 14)} What does this mean?</span><div class="ex-big">${w.hr} ${audioBtnHtml(w.hr.split(' / ')[0])}</div>`);
        else prompt(`<span class="ex-kind">${ic('swap', 14)} Which is “${w.en}”?</span>`);
        const list = el('div', 'choices');
        ex.options.forEach((o, idx) => {
          const b = el('button', 'choice', ex.dir === 'hr2en' ? esc(o.en) : esc(o.hr));
          b.dataset.idx = idx;
          b.onclick = () => submit(idx, b);
          list.appendChild(b);
        });
        box.appendChild(list);
        break;
      }
      case 'listenChoice': {
        prompt(`<span class="ex-kind">${ic('ear', 14)} What do you hear?</span>
          <div class="listenrow">${audioBtnHtml(ex.audioText)} ${audioBtnHtml(ex.audioText, true)}<span class="listen-slow">slow</span></div>`);
        const list = el('div', 'choices');
        ex.options.forEach((o, idx) => {
          const b = el('button', 'choice', esc(o.hr));
          b.onclick = () => submit(idx, b);
          list.appendChild(b);
        });
        box.appendChild(list);
        setTimeout(() => CRO.audio.speak(ex.audioText), 250);
        break;
      }
      case 'listenType': {
        prompt(`<span class="ex-kind">${ic('ear', 14)} Type what you hear</span>
          <div class="listenrow">${audioBtnHtml(ex.audioText)} ${audioBtnHtml(ex.audioText, true)}<span class="listen-slow">slow</span></div>`);
        getAnswer = typedInput(box, 'Type the Croatian…');
        setTimeout(() => CRO.audio.speak(ex.audioText), 250);
        break;
      }
      case 'sentChoiceEn': {
        prompt(`<span class="ex-kind">${ic('swap', 14)} What does this mean?</span><div class="ex-big">${esc(ex.sent.hr)} ${audioBtnHtml(ex.sent.hr)}</div>`);
        const list = el('div', 'choices');
        ex.options.forEach((o, idx) => {
          const b = el('button', 'choice', esc(o.en));
          b.onclick = () => submit(idx, b);
          list.appendChild(b);
        });
        box.appendChild(list);
        break;
      }
      case 'sentTypeEn': {
        prompt(`<span class="ex-kind">${ic('keyboard', 14)} Translate to English</span><div class="ex-big">${esc(ex.sent.hr)} ${audioBtnHtml(ex.sent.hr)}</div>`);
        getAnswer = typedInput(box, 'Type the English…', true);
        break;
      }
      case 'tiles': {
        prompt(`<span class="ex-kind">${ic('tiles', 14)} Build the Croatian</span><div class="ex-big">“${esc(ex.sent.en)}”</div>`);
        const built = el('div', 'tilebuild');
        const bank = el('div', 'tilebank');
        const assembled = [];
        ex.tiles.forEach(t => {
          const b = el('button', 'tile', esc(t));
          b.onclick = () => {
            if (b.classList.contains('used')) return;
            b.classList.add('used');
            assembled.push(t);
            const chip = el('button', 'tile placed', esc(t));
            chip.onclick = () => {
              const k = assembled.indexOf(t);
              if (k >= 0) assembled.splice(k, 1);
              chip.remove(); b.classList.remove('used');
            };
            built.appendChild(chip);
          };
          bank.appendChild(b);
        });
        box.appendChild(built); box.appendChild(bank);
        getAnswer = () => assembled;
        break;
      }
      case 'gap': {
        prompt(`<span class="ex-kind">${ic('gap', 14)} Fill the gap</span>
          <div class="ex-big">${esc(ex.display)}</div><div class="ex-sub">“${esc(ex.en)}”</div>`);
        const list = el('div', 'choices');
        ex.options.forEach((o, idx) => {
          const b = el('button', 'choice', esc(o));
          b.onclick = () => submit(idx, b);
          list.appendChild(b);
        });
        box.appendChild(list);
        break;
      }
      case 'produce': {
        prompt(`<span class="ex-kind">${ic('keyboard', 14)} Say it in Croatian</span><div class="ex-big">“${esc(ex.sent.en)}”</div>`);
        getAnswer = typedInput(box, 'Type the Croatian…');
        break;
      }
    }

    if (getAnswer) {
      const go = el('button', 'btn primary', 'Check');
      go.onclick = () => submit(getAnswer());
      submitWrap.appendChild(go);
      box.appendChild(submitWrap);
      const inp = box.querySelector('input.typed');
      if (inp) {
        inp.focus();
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') submit(getAnswer()); });
      }
    }
    bindAudioBtns(box);

    function submit(payload, btnEl) {
      if (autoSubmitting) return;
      autoSubmitting = true;
      const res = ex.check(payload);
      const ms = Date.now() - t0;
      // visual feedback
      box.querySelectorAll('.choice').forEach(b => b.disabled = true);
      if (btnEl) btnEl.classList.add(res.ok ? 'right' : 'wrong');
      const fb = el('div', 'feedback ' + (res.ok ? 'good' : 'bad'));
      let msg;
      if (res.ok && res.diacriticsOnly) msg = `${ic('check', 18)} Right — mind the little hooks: <b>${esc(res.expected)}</b>`;
      else if (res.ok && res.typo) msg = `${ic('check', 18)} Close enough — exactly: <b>${esc(res.expected)}</b>`;
      else if (res.ok) msg = `${ic('check', 18)} Točno!`;
      else msg = `${ic('cross', 18)} Not quite. Answer: <b>${esc(res.expected)}</b>`;
      const item = ex.cardId ? CRO.content.item(ex.cardId) : null;
      fb.innerHTML = `<div class="fb-msg">${msg}</div>
        ${item && item.hr && !res.ok ? `<div class="fb-extra">${esc(item.hr)} ${audioBtnHtml((item.hr || '').split(' / ')[0])}</div>` : ''}
        <div class="fb-actions">
          ${ex.cardId ? `<button class="linklike fb-flag">${ic('flag', 13)} flag</button>` : ''}
          <button class="btn primary fb-next">Continue</button>
        </div>`;
      box.appendChild(fb);
      bindAudioBtns(fb);
      const flagB = fb.querySelector('.fb-flag');
      if (flagB) flagB.onclick = () => flagDialog(ex.cardId, ex.type);
      const nxt = fb.querySelector('.fb-next');
      nxt.focus();
      nxt.onclick = () => opts.onResult(res, ex, ms);
      if (res.ok && CRO.audio.available() && item && (ex.type === 'tiles' || ex.type === 'produce' || ex.type === 'gap')) {
        CRO.audio.speak(item.hr || ex.audioText || '');
      }
    }
  }

  /** typed input with Croatian special-character keys; returns getter */
  function typedInput(box, placeholder, noSpecials) {
    const wrap = el('div', 'typedwrap');
    const inp = document.createElement('input');
    inp.className = 'typed';
    inp.placeholder = placeholder;
    inp.autocapitalize = 'off'; inp.autocomplete = 'off'; inp.spellcheck = false;
    wrap.appendChild(inp);
    if (!noSpecials) {
      const row = el('div', 'specials');
      CRO.ex.SPECIAL_KEYS.forEach(ch => {
        const b = el('button', 'special', ch);
        b.tabIndex = -1;
        b.onmousedown = e => {
          e.preventDefault();
          const s = inp.selectionStart || inp.value.length;
          inp.value = inp.value.slice(0, s) + ch + inp.value.slice(inp.selectionEnd || s);
          inp.focus();
          inp.setSelectionRange(s + 1, s + 1);
        };
        row.appendChild(b);
      });
      wrap.appendChild(row);
    }
    box.appendChild(wrap);
    return () => inp.value;
  }

  /** pair matching */
  function renderPairs(main, words, onDone, opts) {
    const stage = lessonChrome(main, opts);
    const box = el('div', 'excard card');
    stage.appendChild(box);
    box.appendChild(el('div', 'ex-prompt', `<span class="ex-kind">${ic('pairs', 14)} Match the pairs</span>`));
    const grid = el('div', 'pairgrid');
    const left = CRO.ex.shuffle(words.map(w => ({ id: w.id, label: w.hr, side: 'hr' })));
    const right = CRO.ex.shuffle(words.map(w => ({ id: w.id, label: w.en, side: 'en' })));
    const colL = el('div', 'paircol'), colR = el('div', 'paircol');
    const errors = {};
    let sel = null, matched = 0;
    function mkBtn(item) {
      const b = el('button', 'pairbtn', esc(item.label));
      b.onclick = () => {
        if (b.classList.contains('done')) return;
        if (!sel) { sel = { item, b }; b.classList.add('sel'); return; }
        if (sel.item.side === item.side) { sel.b.classList.remove('sel'); sel = { item, b }; b.classList.add('sel'); return; }
        // attempt match
        if (sel.item.id === item.id) {
          sel.b.classList.remove('sel');
          sel.b.classList.add('done'); b.classList.add('done');
          if (CRO.audio.available()) CRO.audio.speak(CRO.content.wordById[item.id].hr.split(' / ')[0]);
          matched += 1; sel = null;
          if (matched === words.length) {
            const perWord = {};
            words.forEach(w => { perWord[w.id] = !errors[w.id]; });
            setTimeout(() => onDone(perWord), 350);
          }
        } else {
          errors[sel.item.id] = true; errors[item.id] = true;
          sel.b.classList.add('shake'); b.classList.add('shake');
          const a = sel.b; sel = null;
          setTimeout(() => { a.classList.remove('shake', 'sel'); b.classList.remove('shake'); }, 400);
        }
      };
      return b;
    }
    left.forEach(i => colL.appendChild(mkBtn(i)));
    right.forEach(i => colR.appendChild(mkBtn(i)));
    grid.appendChild(colL); grid.appendChild(colR);
    box.appendChild(grid);
  }

  /* ================= toast ================= */
  function toast(msg) {
    const t = el('div', 'toast', msg);
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('show'), 10);
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 2200);
  }

  /* ================= go ================= */
  window.addEventListener('DOMContentLoaded', boot);
  window.CRO = window.CRO || {};
  CRO.app = { state, boot, startSession, streakInfo, render };
})();
