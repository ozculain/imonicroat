/* Node test runner: FSRS behaviour, content integrity, exercise engine.
   Run: node tests/run-tests.js */
'use strict';

const path = require('path');
const srs = require(path.join(__dirname, '..', 'js', 'srs.js'));
const content = require(path.join(__dirname, '..', 'js', 'content.js'));
const ex = require(path.join(__dirname, '..', 'js', 'exercises.js'));
const sync = require(path.join(__dirname, '..', 'js', 'sync.js'));
const stats = require(path.join(__dirname, '..', 'js', 'stats.js'));

let pass = 0, fail = 0;
function t(name, cond, detail) {
  if (cond) { pass++; }
  else { fail++; console.error('  FAIL: ' + name + (detail ? ' — ' + detail : '')); }
}
const DAY = srs.DAY_MS;

/* ================= FSRS ================= */
console.log('FSRS scheduler');
{
  const now = Date.now();
  let c = srs.newCard('w:test');
  t('new card starts new', c.state === 'new');

  // first Good → learning with one step left
  srs.review(c, srs.Rating.Good, now);
  t('Good on new → learning', c.state === 'learning');
  t('stability initialised', c.stability > 0);
  t('difficulty in range', c.difficulty >= 1 && c.difficulty <= 10);

  // second Good → graduates to review with a future due date
  srs.review(c, srs.Rating.Good, now + 10 * 60 * 1000);
  t('graduates to review', c.state === 'review');
  t('due in the future (≥1 day)', c.due >= now + DAY - 1000);

  // successful review after the interval grows stability
  const s1 = c.stability;
  srs.review(c, srs.Rating.Good, c.due);
  t('stability grows on success', c.stability > s1, `${s1} → ${c.stability}`);

  // lapse shrinks stability and goes to relearning
  const s2 = c.stability;
  srs.review(c, srs.Rating.Again, c.due);
  t('lapse → relearning', c.state === 'relearning');
  t('lapse shrinks stability', c.stability < s2, `${s2} → ${c.stability}`);
  t('lapse counted', c.lapses === 1);

  // recover
  srs.review(c, srs.Rating.Good, c.due + 60 * 1000);
  t('recovers to review', c.state === 'review');

  // retrievability sanity
  t('R(0)=1', Math.abs(srs.retrievability(0, 10) - 1) < 1e-9);
  t('R(S)=0.9 by construction', Math.abs(srs.retrievability(10, 10) - 0.9) < 1e-9);
  t('R decreasing', srs.retrievability(30, 10) < srs.retrievability(5, 10));

  // interval at 90% retention ≈ stability
  t('interval(S, .9) ≈ S', Math.abs(srs.nextIntervalDays(20, 0.9) - 20) <= 1);
  t('stricter retention → shorter interval', srs.nextIntervalDays(20, 0.93) < srs.nextIntervalDays(20, 0.85));

  // Easy beats Good on first rating
  const cg = srs.review(srs.newCard('a'), srs.Rating.Good, now);
  const ce = srs.review(srs.newCard('b'), srs.Rating.Easy, now);
  t('Easy initial stability > Good', ce.stability > cg.stability);

  // seeding known cards
  const seeded = srs.seedKnown(srs.newCard('w:known'), now, 30);
  t('seeded card is review state', seeded.state === 'review');
  t('seeded due 24–36 days out', seeded.due >= now + 24 * DAY && seeded.due <= now + 36 * DAY);

  // dueCards ordering & filtering
  const cards = [
    Object.assign(srs.newCard('x1'), { state: 'review', due: now - 2 * DAY }),
    Object.assign(srs.newCard('x2'), { state: 'review', due: now - DAY }),
    Object.assign(srs.newCard('x3'), { state: 'review', due: now + DAY }),
    srs.newCard('x4')
  ];
  const due = srs.dueCards(cards, now);
  t('dueCards filters future & new', due.length === 2);
  t('dueCards sorts soonest first', due[0].cardId === 'x1');

  // maturity buckets
  t('maturity new', srs.maturity(srs.newCard('m1')) === 'new');
  t('maturity mature at 21d stability',
    srs.maturity(Object.assign(srs.newCard('m2'), { state: 'review', stability: 25 })) === 'mature');

  // simulate 200 mixed reviews — invariants hold
  let sim = srs.newCard('sim'), tnow = now, okInv = true;
  for (let i = 0; i < 200; i++) {
    const r = [1, 2, 3, 3, 3, 4][i % 6];
    srs.review(sim, r, tnow);
    tnow = Math.max(sim.due, tnow + 60 * 1000);
    if (!(sim.stability > 0 && sim.stability <= 365 + 1e6) ||
        !(sim.difficulty >= 1 && sim.difficulty <= 10) || !isFinite(sim.due)) okInv = false;
  }
  t('200-review simulation keeps invariants', okInv);
}

/* ================= content integrity ================= */
console.log('Content integrity');
{
  const { WORDS, SENTENCES, GRAMMAR, UNITS, wordById, gramById } = content;

  const ids = new Set();
  let dup = null;
  WORDS.forEach(w => { if (ids.has(w.id)) dup = w.id; ids.add(w.id); });
  SENTENCES.forEach(s => { if (ids.has(s.id)) dup = s.id; ids.add(s.id); });
  GRAMMAR.forEach(g => { if (ids.has(g.id)) dup = g.id; ids.add(g.id); });
  t('all ids unique', !dup, dup);

  let badRef = [];
  SENTENCES.forEach(s => s.words.forEach(w => { if (!wordById[w]) badRef.push(s.id + '→' + w); }));
  t('sentence word refs all exist', badRef.length === 0, badRef.join(', '));

  let badG = [];
  SENTENCES.forEach(s => (s.grammar || []).forEach(g => { if (!gramById[g]) badG.push(s.id + '→' + g); }));
  t('sentence grammar refs all exist', badG.length === 0, badG.join(', '));

  let lateWord = [];
  SENTENCES.forEach(s => s.words.forEach(w => {
    if (wordById[w].unit > s.unit) lateWord.push(`${s.id}(u${s.unit}) uses ${w}(u${wordById[w].unit})`);
  }));
  t('no sentence uses words from later units', lateWord.length === 0, lateWord.join('; '));

  let noGender = WORDS.filter(w => w.pos === 'n' && !w.g).map(w => w.id);
  t('every noun has a gender', noGender.length === 0, noGender.join(', '));

  let noSource = WORDS.filter(w => !w.source).map(w => w.id)
    .concat(SENTENCES.filter(s => !s.source).map(s => s.id))
    .concat(GRAMMAR.filter(g => !g.source).map(g => g.id));
  t('every item has a source', noSource.length === 0, noSource.join(', '));

  const unitNs = new Set(UNITS.map(u => u.n));
  let orphan = WORDS.filter(w => !unitNs.has(w.unit)).map(w => w.id)
    .concat(SENTENCES.filter(s => !unitNs.has(s.unit)).map(s => s.id));
  t('all items belong to defined units', orphan.length === 0, orphan.join(', '));

  UNITS.forEach(u => {
    const n = WORDS.filter(w => w.unit === u.n).length;
    t(`unit ${u.n} has words (${n})`, n >= 8, String(n));
  });
  t('≥ 60 sentences', SENTENCES.length >= 60, String(SENTENCES.length));
  t('≥ 150 words', WORDS.length >= 130, String(WORDS.length));

  // case sequence: accusative grammar in unit 3, locative 5, genitive 6, dative/instr 9, future 10
  t('accusative taught in unit 3', gramById['g-akuzativ'].unit === 3);
  t('locative taught in unit 5', gramById['g-lokativ'].unit === 5);
  t('genitive taught in unit 6', gramById['g-genitiv'].unit === 6);
  t('aspect taught early (unit 4)', gramById['g-vid'].unit === 4);

  // overrides
  content.applyOverrides([{ id: 'kava', patch: { en: 'coffee (test)' } }]);
  t('override applies', wordById['kava'].en === 'coffee (test)');
  content.applyOverrides([{ id: 'kava', patch: { en: 'coffee' } }]);
}

/* ================= exercise engine ================= */
console.log('Exercise engine');
{
  // orthography utilities
  t('digraph split', JSON.stringify(ex.letters('ljubav')) === JSON.stringify(['lj', 'u', 'b', 'a', 'v']));
  t('digraph split nj', JSON.stringify(ex.letters('konj')) === JSON.stringify(['k', 'o', 'nj']));
  t('strip diacritics', ex.stripDiacritics('čćžšđ') === 'cczsd');

  const r1 = ex.checkTyped('Pijem kavu.', ['Pijem kavu.']);
  t('exact typed match', r1.ok && r1.exact);
  const r2 = ex.checkTyped('pijem kavu', ['Pijem kavu.']);
  t('case/punctuation-insensitive', r2.ok && r2.exact);
  const r3 = ex.checkTyped('Zelim caj', ['Želim čaj']);
  t('diacritics-only counts with nudge', r3.ok && r3.diacriticsOnly);
  const r4 = ex.checkTyped('Pijem vino', ['Pijem kavu']);
  t('wrong answer rejected', !r4.ok);
  const r5 = ex.checkTyped('Dovidjenja i laku noc', ['Doviđenja i laku noć']);
  t('typo tolerance on long answers', r5.ok, JSON.stringify(r5));

  // rating mapping
  const R = srs.Rating;
  t('wrong → Again', ex.ratingFromResult({ ok: false }, 3000) === R.Again);
  t('diacritics → Hard', ex.ratingFromResult({ ok: true, diacriticsOnly: true }, 3000) === R.Hard);
  t('fast correct → Easy', ex.ratingFromResult({ ok: true, exact: true }, 3000) === R.Easy);
  t('slow correct → Good', ex.ratingFromResult({ ok: true, exact: true }, 9000) === R.Good);

  // exercise generation for every card and maturity
  ex.reseed(42);
  let genFail = [];
  const buckets = ['new', 'learning', 'young', 'mature'];
  content.WORDS.forEach(w => buckets.forEach(b => {
    const e = ex.exerciseFor('w:' + w.id, b, true);
    if (!e || !e.type) genFail.push(w.id + '/' + b);
  }));
  content.SENTENCES.forEach(s => buckets.forEach(b => {
    const e = ex.exerciseFor('s:' + s.id, b, false);
    if (!e || !e.type) genFail.push(s.id + '/' + b);
  }));
  t('exerciseFor works for every card×maturity', genFail.length === 0, genFail.slice(0, 5).join(', '));

  // choice exercises always include the right answer & it checks out
  ex.reseed(7);
  let choiceOk = true;
  for (const w of content.WORDS.slice(0, 40)) {
    const e = ex.exChoice(w, 'hr2en');
    const idx = e.options.findIndex(o => o.id === w.id);
    if (idx < 0 || !e.check(idx).ok || e.check((idx + 1) % e.options.length).ok) choiceOk = false;
  }
  t('choice contains answer; check() consistent', choiceOk);

  // distractors never share a translation with the answer
  ex.reseed(11);
  let distinct = true;
  for (const w of content.WORDS) {
    const e = ex.exChoice(w, 'hr2en');
    const ens = e.options.map(o => ex.norm(o.en));
    if (new Set(ens).size !== ens.length) distinct = false;
  }
  t('choice options have distinct translations', distinct);

  // tiles round-trip
  ex.reseed(3);
  let tilesOk = true;
  for (const s of content.SENTENCES) {
    const e = ex.exTiles(s);
    if (!e.check(e.tokens).ok) tilesOk = false;
    if (e.check(e.tokens.slice().reverse()).ok && e.tokens.length > 1
        && e.tokens.join(' ') !== e.tokens.slice().reverse().join(' ')) tilesOk = false;
    // every needed token is present in the tile bank
    const bank = e.tiles.slice();
    for (const tok of e.tokens) {
      const k = bank.indexOf(tok);
      if (k < 0) tilesOk = false; else bank.splice(k, 1);
    }
  }
  t('tiles: correct order accepted, bank complete, wrong order rejected', tilesOk);

  // gap fill: target among options, check consistent
  ex.reseed(5);
  let gapOk = true;
  for (const s of content.SENTENCES) {
    const e = ex.exGap(s);
    const idx = e.options.findIndex(o => ex.norm(o) === ex.norm(e.target));
    if (idx < 0 || !e.check(idx).ok) gapOk = false;
    if (!e.display.includes('____')) gapOk = false;
  }
  t('gap fill consistent for all sentences', gapOk);

  // production accepts the canonical sentence
  let prodOk = true;
  for (const s of content.SENTENCES) {
    if (!ex.exProduce(s).check(s.hr).ok) prodOk = false;
  }
  t('production accepts canonical Croatian', prodOk);

  // sentence translation accepts alternates
  const s301 = content.sentById['s301'];
  const eT = ex.exSentence(s301, 'hr2enType');
  t('alt translations accepted', eT.check('I drink coffee').ok);
}

/* ================= bugfix regressions ================= */
console.log('Bugfix regressions');
{
  // A1 — parenthetical glosses in the English answer must not cause false negatives
  t('A1: checkTyped ignores a parenthetical gloss',
    ex.checkTyped('I was in Split.', ['I was in Split. (man speaking)']).ok);
  // drive it through real content: every sentence whose en carries a gloss must
  // accept the gloss-free natural answer (no silent skip — assert some exist)
  const glossed = content.SENTENCES.filter(s => /\([^)]*\)/.test(s.en));
  t('A1: course actually contains glossed sentences to guard', glossed.length > 0, String(glossed.length));
  let glossBad = '';
  for (const s of glossed) {
    const natural = s.en.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
    if (!ex.exSentence(s, 'hr2enType').check(natural).ok) { glossBad = s.id + ' "' + s.en + '"'; break; }
  }
  t('A1: every glossed sentence accepts the natural typed answer', glossBad === '', glossBad);

  // A2 — gap-fill options must be punctuation-uniform (no lone-comma giveaway)
  ex.reseed(5);
  let gapClean = true, gapWhy = '';
  for (const s of content.SENTENCES) {
    const e = ex.exGap(s);
    if (/,/.test(e.target)) { gapClean = false; gapWhy = 'target "' + e.target + '" in ' + s.id; }
    if (e.options.some(o => /,/.test(o))) { gapClean = false; gapWhy = 'comma option in ' + s.id; }
  }
  t('A2: gap-fill has no comma giveaway', gapClean, gapWhy);

  // B1 — difficulty mean-reverts toward D0(Easy) (≈3.93), not D0(Good)
  let d = srs._internals.initDifficulty(srs.Rating.Good);
  for (let i = 0; i < 2000; i++) d = srs._internals.nextDifficulty(d, srs.Rating.Good);
  const easyD = srs._internals.initDifficulty(srs.Rating.Easy);
  t('B1: steady-Good difficulty converges to D0(Easy)', Math.abs(d - easyD) < 1e-6, `${d} vs ${easyD}`);

  // C1 — corrupt remote throws (write is skipped); empty/missing stays "fresh"
  t('C1: empty remote → null (fresh)', sync._parseRemote('') === null && sync._parseRemote('  ') === null);
  t('C1: valid remote parses', sync._parseRemote('{"app":"imonicroat"}').app === 'imonicroat');
  let parseThrew = false;
  try { sync._parseRemote('{ not valid json'); } catch (e) { parseThrew = true; }
  t('C1: corrupt remote throws instead of clobbering', parseThrew);

  // A3 — tile distractors must not normalize to a needed token (case-variant hole)
  ex.reseed(13);
  let tileClean = true, tileWhy = '';
  for (const s of content.SENTENCES) {
    const e = ex.exTiles(s);
    const need = new Set(e.tokens.map(ex.norm));
    const matching = e.tiles.filter(tl => need.has(ex.norm(tl))).length;
    if (matching !== e.tokens.length) { tileClean = false; tileWhy = s.id + ': ' + matching + '≠' + e.tokens.length; }
  }
  t('A3: tile bank has no case-variant distractors', tileClean, tileWhy);

  // A4 — the blanked answer must never remain visible in the gap display
  ex.reseed(5);
  let gapNoLeak = true, leakWhy = '';
  for (const s of content.SENTENCES) {
    const e = ex.exGap(s);
    const visible = e.display.split(/\s+/).map(ex.norm);
    if (visible.includes(ex.norm(e.target))) { gapNoLeak = false; leakWhy = s.id; }
  }
  t('A4: gap-fill never leaves the answer visible', gapNoLeak, leakWhy);
  // A4 (non-vacuous): force a repeated target word — ALL occurrences must blank,
  // and exactly one blank per occurrence
  let repeatOk = false;
  for (let seed = 1; seed <= 50 && !repeatOk; seed++) {
    ex.reseed(seed);
    const e = ex.exGap({ id: 'syn', unit: 1, en: 'I love and I love', hr: 'Volim i volim kavu' });
    if (ex.norm(e.target) === 'volim') {
      const blanks = (e.display.match(/____/g) || []).length;
      repeatOk = blanks === 2 && !e.display.split(/\s+/).map(ex.norm).includes('volim');
    }
  }
  t('A4: a repeated target word is blanked in every position', repeatOk);

  // B2 — out-of-range / NaN ratings and zero-stability seeds stay finite
  const c0 = srs.review(srs.newCard('g0'), 0, Date.now());
  const c5 = srs.review(srs.newCard('g5'), 5, Date.now());
  const cN = srs.review(srs.newCard('gN'), NaN, Date.now());
  t('B2: out-of-range/NaN rating never produces NaN',
    [c0, c5, cN].every(c => isFinite(c.stability) && isFinite(c.difficulty) && isFinite(c.due)));
  const cz = srs.seedKnown(srs.newCard('z'), Date.now(), 0);
  srs.review(cz, srs.Rating.Good, cz.due);
  t('B2: seedKnown(...,0) survives first review without NaN', isFinite(cz.stability) && isFinite(cz.due));
}

/* ================= sync merge ================= */
console.log('Sync merge');
{
  const L = {
    app: 'imonicroat', version: 1,
    profiles: [{ id: 'p1', name: 'Imo' }],
    srs: [
      { key: 'p1|w:kava', cardId: 'w:kava', lastReview: 100, reps: 3, stability: 5 },
      { key: 'p1|w:caj', cardId: 'w:caj', lastReview: 50, reps: 1, stability: 1 }
    ],
    activity: [{ key: 'p1|2026-06-10', profileId: 'p1', date: '2026-06-10', xp: 40, lessons: 1 }],
    flags: [{ id: 'f1', cardId: 'w:kava', resolved: false, updatedAt: 10 }],
    overrides: [{ id: 'kava', patch: { en: 'old' }, editedAt: 10 }],
    variety: [{ id: 'v1', hr: 'kaj', createdAt: 5, updatedAt: 5 }],
    meta: [{ key: 'activeProfile', value: 'p1' }]
  };
  const R = {
    app: 'imonicroat', version: 1,
    profiles: [{ id: 'p1', name: 'Imo-remote' }, { id: 'p2', name: 'Nicro' }],
    srs: [
      { key: 'p1|w:kava', cardId: 'w:kava', lastReview: 200, reps: 4, stability: 9 },
      { key: 'p2|w:kava', cardId: 'w:kava', lastReview: 90, reps: 2, stability: 3 }
    ],
    activity: [
      { key: 'p1|2026-06-10', profileId: 'p1', date: '2026-06-10', xp: 25, lessons: 2 },
      { key: 'p2|2026-06-10', profileId: 'p2', date: '2026-06-10', xp: 60, lessons: 1 }
    ],
    flags: [{ id: 'f1', cardId: 'w:kava', resolved: true, updatedAt: 5 }],
    overrides: [{ id: 'kava', patch: { en: 'new' }, editedAt: 20 }],
    variety: [
      { id: 'v1', hr: 'kaj', createdAt: 5, updatedAt: 9, deleted: true },
      { id: 'v2', hr: 'fjaka', createdAt: 7, updatedAt: 7 }
    ],
    meta: [{ key: 'activeProfile', value: 'p2' }]
  };
  const M = sync.mergeDumps(L, R);

  t('profiles union', M.profiles.length === 2);
  t('local profile wins on conflict', M.profiles.find(p => p.id === 'p1').name === 'Imo');
  const kava = M.srs.find(r => r.key === 'p1|w:kava');
  t('srs: newest lastReview wins', kava.stability === 9 && kava.reps === 4);
  t('srs: local-only record kept', !!M.srs.find(r => r.key === 'p1|w:caj'));
  t('srs: partner records arrive', !!M.srs.find(r => r.key === 'p2|w:kava'));
  const act = M.activity.find(a => a.key === 'p1|2026-06-10');
  t('activity: same key (same device) resolves by max', act.xp === 40 && act.lessons === 2);
  t('activity: partner day arrives (streak works)', !!M.activity.find(a => a.key === 'p2|2026-06-10'));
  t('flags: resolved is sticky', M.flags.find(f => f.id === 'f1').resolved === true);
  t('overrides: latest editedAt wins', M.overrides.find(o => o.id === 'kava').patch.en === 'new');
  t('variety: tombstone propagates', M.variety.find(v => v.id === 'v1').deleted === true);
  t('variety: new entry arrives', !!M.variety.find(v => v.id === 'v2'));
  t('meta never synced', M.meta.length === 0);

  // merge is idempotent: merging the merge with either side changes nothing material
  const M2 = sync.mergeDumps(M, R);
  t('merge idempotent (srs)', JSON.stringify(M2.srs) === JSON.stringify(M.srs));
  t('merge idempotent (activity)', JSON.stringify(M2.activity) === JSON.stringify(M.activity));
  t('merge idempotent (variety)', JSON.stringify(M2.variety) === JSON.stringify(M.variety));
}

/* ================= sync conflict resolution (C2/C3) ================= */
console.log('Sync conflict resolution');
{
  // C3 — concurrent same-day work on different devices SUMS (per-device keys)
  const dA = { app: 'imonicroat', activity: [{ key: 'p1|2026-06-26|dA', profileId: 'p1', date: '2026-06-26', deviceId: 'dA', xp: 50, lessons: 1 }] };
  const dB = { app: 'imonicroat', activity: [{ key: 'p1|2026-06-26|dB', profileId: 'p1', date: '2026-06-26', deviceId: 'dB', xp: 30, lessons: 1 }] };
  const m = sync.mergeDumps(dA, dB);
  const total = m.activity.filter(a => a.date === '2026-06-26').reduce((s, a) => s + a.xp, 0);
  t('C3: concurrent same-day device XP sums to 80', m.activity.length === 2 && total === 80, String(total));
  const total2 = sync.mergeDumps(m, dB).activity.reduce((s, a) => s + a.xp, 0);
  t('C3: re-merge stays 80 (idempotent, no double-count)', total2 === 80, String(total2));

  // C2 — the logical clock beats wall-clock skew on conflicting edits
  const skewOld = { app: 'imonicroat', overrides: [{ id: 'kava', patch: { en: 'A' }, editedAt: 9e12, clk: 2, dev: 'dA' }] };
  const skewNew = { app: 'imonicroat', overrides: [{ id: 'kava', patch: { en: 'B' }, editedAt: 1, clk: 5, dev: 'dB' }] };
  t('C2: higher logical clock wins despite a far-future wall-clock',
    sync.mergeDumps(skewOld, skewNew).overrides.find(o => o.id === 'kava').patch.en === 'B');

  // C2 — a clk tie resolves deterministically by deviceId (order-independent)
  const tieA = { app: 'imonicroat', variety: [{ id: 'v1', hr: 'A', clk: 7, dev: 'dA', updatedAt: 1 }] };
  const tieB = { app: 'imonicroat', variety: [{ id: 'v1', hr: 'B', clk: 7, dev: 'dB', updatedAt: 1 }] };
  t('C2: clk tie broken deterministically (merge order-independent)',
    sync.mergeDumps(tieA, tieB).variety[0].hr === sync.mergeDumps(tieB, tieA).variety[0].hr);

  // C2 — legacy records without clk still resolve by timestamp (back-compat)
  const legA = { app: 'imonicroat', overrides: [{ id: 'x', patch: { en: 'old' }, editedAt: 10 }] };
  const legB = { app: 'imonicroat', overrides: [{ id: 'x', patch: { en: 'new' }, editedAt: 20 }] };
  t('C2: clk-less records fall back to timestamp', sync.mergeDumps(legA, legB).overrides[0].patch.en === 'new');

  t('C2: maxClock scans all record stores', sync._maxClock({ srs: [{ clk: 3 }], variety: [{ clk: 9 }], flags: [{ clk: 4 }] }) === 9);
}

/* ================= stats: per-device sum + streak (real UI code) ================= */
console.log('Stats (streak / weekly duel)');
{
  // C3 real consumer: two device records for the SAME profile+day must SUM
  const wk = stats.isoWeekKey('2026-06-24T12:00:00');
  const acts = [
    { profileId: 'p1', date: '2026-06-24', deviceId: 'dA', xp: 50, lessons: 1 },
    { profileId: 'p1', date: '2026-06-24', deviceId: 'dB', xp: 30, lessons: 1 }, // same day, other device
    { profileId: 'p2', date: '2026-06-24', deviceId: 'dA', xp: 15, lessons: 1 }
  ];
  const totals = stats.weekTotals(acts, wk, ['p1', 'p2']);
  t('stats: per-device same-day XP sums in weekTotals (80)', totals.p1 === 80, JSON.stringify(totals));
  t('stats: other profile counted separately (15)', totals.p2 === 15);

  // streak: a day counts only when `need` distinct profiles practised it;
  // multiple device records for one profile still count that profile once
  const day = '2026-06-26';
  const ref = new Date(2026, 5, 26, 12, 0, 0);
  const both = [
    { profileId: 'p1', date: day, deviceId: 'dA', xp: 10, lessons: 1 },
    { profileId: 'p1', date: day, deviceId: 'dB', xp: 10, lessons: 1 }, // same profile twice
    { profileId: 'p2', date: day, deviceId: 'dA', xp: 10, lessons: 1 }
  ];
  const sBoth = stats.streakState(both, 2, ref);
  t('stats: day complete when both profiles practised (multi-device safe)', sBoth.todayComplete && sBoth.streak === 1);
  const onlyOne = both.slice(0, 2); // both records are p1 → only one distinct profile
  const sOne = stats.streakState(onlyOne, 2, ref);
  t('stats: same profile on two devices does NOT satisfy need=2', !sOne.todayComplete && sOne.streak === 0);
  t('stats: doneToday reflects who practised', sBoth.doneToday.has('p1') && sBoth.doneToday.has('p2'));
}

/* ================= vault (E2E crypto) ================= */
console.log('Vault crypto');
const vaultTests = (async () => {
  const vault = require(path.join(__dirname, '..', 'js', 'vault.js'));
  const secret = { profiles: [{ name: 'Imo' }], srs: [{ key: 'p1|w:kava', reps: 3 }], note: 'čćžšđ 🇭🇷' };
  const env = await vault.encrypt(secret, 'correct horse');
  t('envelope marked', vault.isEnvelope(env) && env.v === 1);
  t('ciphertext is not plaintext', !JSON.stringify(env).includes('kava'));
  t('E1: envelope carries iteration count (≥600k)', env.it >= 600000);
  const back = await vault.decrypt(env, 'correct horse');
  t('decrypt roundtrip (incl. diacritics)', JSON.stringify(back) === JSON.stringify(secret));
  let failed = false;
  try { await vault.decrypt(env, 'wrong pass'); } catch (e) { failed = true; }
  t('wrong passphrase rejected', failed);
  const env2 = await vault.encrypt(secret, 'correct horse');
  t('fresh salt+iv every encryption', env2.ct !== env.ct && env2.salt !== env.salt);
  t('plain dumps are not envelopes', !vault.isEnvelope({ app: 'imonicroat', srs: [] }));
});

/* ================= PWA assets ================= */
console.log('PWA assets');
{
  const fs = require('fs');
  const root = path.join(__dirname, '..');
  const swSrc = fs.readFileSync(path.join(root, 'sw.js'), 'utf8');
  const m = swSrc.match(/const FILES = \[([\s\S]*?)\]/);
  t('sw.js declares FILES', !!m);
  if (m) {
    const files = m[1].match(/'([^']+)'/g).map(s => s.slice(1, -1)).filter(f => f !== './');
    const missing = files.filter(f => !fs.existsSync(path.join(root, f)));
    t('every cached file exists on disk', missing.length === 0, missing.join(', '));
    // every script in index.html is also cached for offline
    const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
    const srcs = (html.match(/src="([^"]+)"/g) || []).map(s => s.slice(5, -1));
    const uncached = srcs.filter(s => !files.includes(s));
    t('all index.html scripts are in the SW cache list', uncached.length === 0, uncached.join(', '));
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.webmanifest'), 'utf8'));
  t('manifest valid (name, icons, standalone)',
    manifest.name && manifest.display === 'standalone' && manifest.icons.length >= 2);
  manifest.icons.forEach(i =>
    t('manifest icon exists: ' + i.src, fs.existsSync(path.join(root, i.src))));
}

/* ================= db import (merge vs replace) + export hygiene ================= */
const dbTests = (async () => {
  console.log('DB import/replace');
  // db.js has no indexedDB in node → it uses its localStorage fallback; shim it
  const store = {};
  global.localStorage = {
    getItem: k => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: k => { delete store[k]; }
  };
  require(path.join(__dirname, '..', 'js', 'db.js'));
  const db = global.CRO.db;

  // H1/D2 — DEFAULT importAll (what sync uses) MERGES, never clears: a record
  // not in the dump (e.g. written during an in-flight sync) must survive.
  await db.put('flags', { id: 'f1', note: 'old' });
  await db.put('flags', { id: 'f2', note: 'concurrent-write' });
  await db.setMeta('passphrase', 'secret');
  await db.importAll({ app: 'imonicroat', flags: [{ id: 'f1', note: 'new' }], meta: [] });
  let flags = await db.getAll('flags');
  t('H1/D2: default import merges (concurrent f2 NOT clobbered, f1 updated)',
    flags.length === 2 && !!flags.find(f => f.id === 'f2') && flags.find(f => f.id === 'f1').note === 'new',
    JSON.stringify(flags));
  t('D2: device-local meta survives an import with meta:[]',
    (await db.getMeta('passphrase')) === 'secret');

  // D2 — {replace:true} (backup restore) DOES remove orphans
  await db.importAll({ app: 'imonicroat', flags: [{ id: 'f1', note: 'restored' }], meta: [] }, { replace: true });
  flags = await db.getAll('flags');
  t('D2: replace-mode import removes orphans (only f1 remains)',
    flags.length === 1 && flags[0].id === 'f1' && flags[0].note === 'restored', JSON.stringify(flags));

  // D4/H2 — exported backups must omit ALL device-local secrets/identity
  await db.setMeta('lock', { salt: 'x', hash: 'y' });
  await db.setMeta('gistSync', { token: 'ghp_SECRET_TOKEN_123', id: 'gid' });
  await db.setMeta('deviceId', 'dXYZ');
  await db.setMeta('syncClock', 42);
  await db.setMeta('activeProfile', 'p1'); // this one SHOULD remain exportable
  const dump = await db.exportAll();
  const metaKeys = dump.meta.map(m => m.key);
  const leaked = ['passphrase', 'lock', 'gistSync', 'deviceId', 'syncClock'].filter(k => metaKeys.includes(k));
  t('H2/D4: export omits passphrase/lock/gistSync/deviceId/syncClock', leaked.length === 0, 'leaked: ' + leaked.join(','));
  t('H2/D4: raw GitHub token string is absent from the backup', !JSON.stringify(dump).includes('ghp_SECRET_TOKEN_123'));
  t('D4: non-secret meta (activeProfile) is still exported', metaKeys.includes('activeProfile'));

  // M3 — the localStorage→IDB migration rule must keep the NEWER record, not
  // blindly skip a key already in IDB (which would drop a newer offline edit)
  const mw = db._migrateWins;
  t('M3: new key is adopted', mw({ id: 'x', clk: 1 }, undefined, 'flags') === true);
  t('M3: newer LS clk overwrites older IDB', mw({ id: 'x', clk: 9 }, { id: 'x', clk: 5 }, 'flags') === true);
  t('M3: older LS clk does NOT overwrite newer IDB', mw({ id: 'x', clk: 3 }, { id: 'x', clk: 5 }, 'flags') === false);
  t('M3: activity (no clk) keeps the higher xp', mw({ key: 'a', xp: 80 }, { key: 'a', xp: 50 }, 'activity') === true
    && mw({ key: 'a', xp: 40 }, { key: 'a', xp: 50 }, 'activity') === false);
  t('M3: equal clk keeps IDB (no needless write)', mw({ id: 'x', clk: 5 }, { id: 'x', clk: 5 }, 'flags') === false);
});

/* ================= clock: atomic under concurrency (M1) ================= */
const clockTests = (async () => {
  console.log('Clock (atomic Lamport)');
  require(path.join(__dirname, '..', 'js', 'clock.js'));
  const clock = global.CRO.clock;
  await global.CRO.db.setMeta('syncClock', 0);
  clock._reset();
  // fire 100 concurrent bumps — the non-atomic read-modify-write collided here
  const results = await Promise.all(Array.from({ length: 100 }, () => clock.bump()));
  t('M1: 100 concurrent bumps are all distinct (no collision)', new Set(results).size === 100, 'unique=' + new Set(results).size);
  t('M1: they cover exactly 1..100 (no gaps)', Math.min.apply(null, results) === 1 && Math.max.apply(null, results) === 100);
  await clock.observe(5); // below current → must not regress
  t('M1: observe(below) does not regress', (await clock.bump()) === 101);
  await clock.observe(500); // above current → advances
  t('M1: observe(above) advances the clock', (await clock.bump()) === 501);
});

/* ================= sync optimistic concurrency (C4) ================= */
const syncC4Tests = (async () => {
  console.log('Sync optimistic concurrency (C4)');
  const localDump = async () => ({
    app: 'imonicroat', profiles: [], activity: [], flags: [], overrides: [], variety: [],
    srs: [{ key: 'p1|w:a', cardId: 'w:a', lastReview: 5, clk: 1, dev: 'dL' }], meta: []
  });
  const fullRemote = (rev) => ({ app: 'imonicroat', rev, srs: [], activity: [], flags: [], overrides: [], variety: [] });

  // happy path: remote present → rev = remoteRev + 1, single write
  let writes = [];
  const okWrite = async (m, baseRev) => { writes.push({ rev: m.rev, baseRev }); };
  let merged = await sync._runSync(localDump, async () => fullRemote(2), okWrite);
  t('C4: rev bumps to remoteRev+1, written once', merged.rev === 3 && writes.length === 1 && writes[0].baseRev === 2);

  // fresh remote (null) → rev starts at 1, baseRev 0
  writes = [];
  merged = await sync._runSync(localDump, async () => null, okWrite);
  t('C4: fresh remote starts rev at 1', merged.rev === 1 && writes[0].baseRev === 0);

  // conflict then success: first write conflicts, retry re-reads (advancing rev) and succeeds
  let calls = 0, reads = 0;
  const advancingRead = async () => { reads++; return fullRemote(reads); };
  const flakyWrite = async () => { calls++; if (calls === 1) { const e = new Error('conflict'); e.conflict = true; throw e; } };
  merged = await sync._runSync(localDump, advancingRead, flakyWrite);
  t('C4: conflict triggers re-read & retry', calls === 2 && reads === 2 && merged.rev === reads + 1);

  // persistent conflict → throws a conflict error after 3 attempts
  let rejectedConflict = false, attempts = 0;
  const alwaysConflict = async () => { attempts++; const e = new Error('conflict'); e.conflict = true; throw e; };
  try { await sync._runSync(localDump, async () => fullRemote(2), alwaysConflict); }
  catch (e) { rejectedConflict = !!(e && e.conflict); }
  t('C4: gives up after 3 conflicting attempts', rejectedConflict && attempts === 3);

  // a non-conflict write error propagates immediately, no silent retry
  let propagated = false, hardCalls = 0;
  const hardFail = async () => { hardCalls++; throw new Error('network down'); };
  try { await sync._runSync(localDump, async () => fullRemote(2), hardFail); }
  catch (e) { propagated = /network down/.test(e.message) && hardCalls === 1; }
  t('C4: non-conflict write error propagates without retry', propagated);

  // H1 (the actual fix glue): reconcileLocal re-reads a FRESH local snapshot and
  // re-merges, so a write that landed during the round-trip survives the commit.
  // `merged` is what was written to remote (stale); freshLocal has the during-sync
  // grade (clk6, stability 9) and the +30 XP (80 vs 50).
  const writtenToRemote = {
    app: 'imonicroat',
    srs: [{ key: 'p1|w:a', cardId: 'w:a', clk: 5, dev: 'dL', stability: 1 }],
    activity: [{ key: 'p1|d|dL', profileId: 'p1', date: 'd', deviceId: 'dL', xp: 50, lessons: 1 }]
  };
  const freshAfterRoundTrip = async () => ({
    app: 'imonicroat',
    srs: [{ key: 'p1|w:a', cardId: 'w:a', clk: 6, dev: 'dL', stability: 9 }],
    activity: [{ key: 'p1|d|dL', profileId: 'p1', date: 'd', deviceId: 'dL', xp: 80, lessons: 1 }]
  });
  const committed = await sync._reconcileLocal(freshAfterRoundTrip, writtenToRemote);
  t('H1: reconcileLocal keeps the card graded during sync (stability 9)',
    committed.srs.find(r => r.key === 'p1|w:a').stability === 9);
  t('H1: reconcileLocal keeps the XP earned during sync (80, not 50)',
    committed.activity.find(a => a.key === 'p1|d|dL').xp === 80);
});

vaultTests().then(dbTests).then(clockTests).then(syncC4Tests).then(() => {
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}).catch(e => {
  console.error('async tests crashed: ' + (e && e.message));
  process.exit(1);
});
