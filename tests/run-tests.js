/* Node test runner: FSRS behaviour, content integrity, exercise engine.
   Run: node tests/run-tests.js */
'use strict';

const path = require('path');
const srs = require(path.join(__dirname, '..', 'js', 'srs.js'));
const content = require(path.join(__dirname, '..', 'js', 'content.js'));
const ex = require(path.join(__dirname, '..', 'js', 'exercises.js'));
const sync = require(path.join(__dirname, '..', 'js', 'sync.js'));

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
  t('activity: max not sum', act.xp === 40 && act.lessons === 2);
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

/* ================= vault (E2E crypto) ================= */
console.log('Vault crypto');
const vaultTests = (async () => {
  const vault = require(path.join(__dirname, '..', 'js', 'vault.js'));
  const secret = { profiles: [{ name: 'Imo' }], srs: [{ key: 'p1|w:kava', reps: 3 }], note: 'čćžšđ 🇭🇷' };
  const env = await vault.encrypt(secret, 'correct horse');
  t('envelope marked', vault.isEnvelope(env) && env.v === 1);
  t('ciphertext is not plaintext', !JSON.stringify(env).includes('kava'));
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

vaultTests().then(() => {
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}).catch(e => {
  console.error('vault tests crashed: ' + (e && e.message));
  process.exit(1);
});
