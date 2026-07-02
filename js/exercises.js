/* =========================================================================
   Exercise engine.
   Generates exercise descriptors from cards + content, checks answers,
   and maps results onto FSRS ratings.

   Difficulty ladder (by FSRS maturity):
     new       → intro card, then recognise (multiple choice HR→EN)
     learning  → choice both directions, pair match, listening choice
     young     → tiles EN→HR, gap fill, listening type
     mature    → typed EN→HR, typed listening, typed production
   ========================================================================= */
if (typeof window === 'undefined') { global.window = global; } // node test shim
(function () {
  'use strict';

  /* ---------------- text utilities (orthography-aware) ---------------- */

  // Croatian digraphs are single letters; we keep them intact when splitting.
  const DIGRAPHS = ['dž', 'lj', 'nj', 'Dž', 'DŽ', 'Lj', 'LJ', 'Nj', 'NJ'];

  function letters(word) {
    const out = [];
    let i = 0;
    while (i < word.length) {
      const two = word.slice(i, i + 2);
      if (DIGRAPHS.includes(two)) { out.push(two); i += 2; }
      else { out.push(word[i]); i += 1; }
    }
    return out;
  }

  function stripDiacritics(s) {
    return s
      .replace(/č|ć/g, 'c').replace(/Č|Ć/g, 'C')
      .replace(/š/g, 's').replace(/Š/g, 'S')
      .replace(/ž/g, 'z').replace(/Ž/g, 'Z')
      .replace(/đ/g, 'd').replace(/Đ/g, 'D');
  }

  function norm(s) {
    return (s || '')
      .toLowerCase()
      .replace(/\([^)]*\)/g, '')   // drop parenthetical glosses, e.g. "(man speaking)"
      .replace(/[.,!?;:'"„"…‘’´`()-]/g, '') // incl. any stray unbalanced parens
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Compare a typed answer against accepted strings.
   * Returns { ok, exact, diacriticsOnly, expected }.
   * diacriticsOnly = right word, wrong/missing diacritics → counts as correct
   * with a gentle nudge (Duolingo-style "watch the accents").
   */
  function checkTyped(answer, accepted, altForms) {
    const a = norm(answer);
    for (const exp of accepted) {
      if (a === norm(exp)) return { ok: true, exact: true, diacriticsOnly: false, expected: exp };
    }
    // the couple's own register: a listed Dalmatian form is full credit —
    // never an error — with the standard form echoed back for reinforcement
    for (const alt of (altForms || [])) {
      if (a === norm(alt) || stripDiacritics(a) === stripDiacritics(norm(alt))) {
        return { ok: true, exact: false, diacriticsOnly: false, dalmatian: true, expected: accepted[0] };
      }
    }
    for (const exp of accepted) {
      if (stripDiacritics(a) === stripDiacritics(norm(exp))) {
        return { ok: true, exact: false, diacriticsOnly: true, expected: exp };
      }
    }
    // small typo tolerance for longer answers (edit distance 1, length > 6)
    for (const exp of accepted) {
      const e = norm(exp);
      if (e.length > 6 && editDistance(stripDiacritics(a), stripDiacritics(e)) === 1) {
        return { ok: true, exact: false, diacriticsOnly: false, typo: true, expected: exp };
      }
    }
    return { ok: false, exact: false, diacriticsOnly: false, expected: accepted[0] };
  }

  function editDistance(a, b) {
    if (Math.abs(a.length - b.length) > 1) return 99;
    const m = a.length, n = b.length;
    const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
    for (let j = 0; j <= n; j++) dp[0][j] = j;
    for (let i = 1; i <= m; i++)
      for (let j = 1; j <= n; j++)
        dp[i][j] = Math.min(
          dp[i - 1][j] + 1, dp[i][j - 1] + 1,
          dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return dp[m][n];
  }

  /* ---------------- deterministic shuffle (seeded) ---------------- */
  let seedCounter = 1;
  function rng() {
    // xorshift — deterministic enough for distractor picking, reseeded per session
    seedCounter ^= seedCounter << 13; seedCounter ^= seedCounter >>> 17; seedCounter ^= seedCounter << 5;
    return ((seedCounter >>> 0) % 100000) / 100000;
  }
  function reseed(n) { seedCounter = (n >>> 0) || 1; }
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function pick(arr, n, excludeFn) {
    const pool = shuffle(arr.filter(x => !excludeFn || !excludeFn(x)));
    return pool.slice(0, n);
  }

  /* ---------------- exercise builders ---------------- */
  // Every exercise: { type, cardId, prompt..., check(answerPayload) → {ok,...}, rating(result, ms) }

  function ratingFromResult(res, ms) {
    const R = CRO.srs.Rating;
    if (!res.ok) return R.Again;
    if (res.diacriticsOnly || res.typo) return R.Hard;
    if (ms < 6000) return R.Easy;
    return R.Good;
  }

  // Multiple-choice speed is noise — a lucky 1-in-4 tap must not read as
  // mastery. Recognition exercises cap at Good; only typed/spoken answers
  // can earn Easy.
  function ratingCapped(res, ms) {
    const r = ratingFromResult(res, ms);
    return r === CRO.srs.Rating.Easy ? CRO.srs.Rating.Good : r;
  }

  function wordChoices(word, n, sameUnitFirst) {
    const all = CRO.content.WORDS;
    const sameUnit = all.filter(w => w.unit === word.unit && w.id !== word.id);
    const others = all.filter(w => w.unit !== word.unit && w.id !== word.id);
    // shuffle within each group, keeping same-unit distractors first (harder
    // near-misses); iterate the pre-ordered pool directly so the order survives
    const pool = sameUnitFirst
      ? shuffle(sameUnit).concat(shuffle(others))
      : shuffle(all.filter(w => w.id !== word.id));
    // avoid distractors with an identical translation
    const seen = new Set([norm(word.en)]);
    const out = [];
    for (const w of pool) {
      if (out.length >= n) break;
      if (seen.has(norm(w.en))) continue;
      seen.add(norm(w.en));
      out.push(w);
    }
    return out;
  }

  /** New-card introduction (not graded — informational screen). */
  function exIntro(word) {
    return { type: 'intro', cardId: 'w:' + word.id, word };
  }

  /** Dalmatian alternates for a word (word.dal may hold 'x' or 'x / y'). */
  function dalForms(word) {
    return word && word.dal ? String(word.dal).split(' / ').map(s => s.trim()).filter(Boolean) : [];
  }

  /** Multiple choice HR→EN or EN→HR. */
  function exChoice(word, dir) {
    const distract = wordChoices(word, 3, true);
    const options = shuffle([word].concat(distract));
    return {
      type: 'choice', dir, cardId: 'w:' + word.id, word, options,
      check(idx) {
        const ok = options[idx] && options[idx].id === word.id;
        return { ok, expected: dir === 'hr2en' ? word.en : word.hr, chosen: idx };
      },
      rating: ratingCapped
    };
  }

  /** Listening: hear Croatian, choose (or type) what you heard.
      rate (optional) sets the playback speed — mature cards hear it faster. */
  function exListen(word, typed, rate) {
    const distract = wordChoices(word, 3, true);
    const options = shuffle([word].concat(distract));
    return {
      type: typed ? 'listenType' : 'listenChoice',
      cardId: 'w:' + word.id, word, options: typed ? null : options,
      audioText: word.hr.split(' / ')[0], rate,
      check(ans) {
        if (typed) return checkTyped(ans, [word.hr.split(' / ')[0]], dalForms(word));
        const ok = options[ans] && options[ans].id === word.id;
        return { ok, expected: word.hr };
      },
      rating: typed ? ratingFromResult : ratingCapped
    };
  }

  /** Pair matching: 5 HR–EN pairs. Graded per word, lightly (Good/Again). */
  function exPairs(words) {
    return {
      type: 'pairs',
      cardId: null, // multi-card; app grades each matched word
      words: words.slice(0, 5)
    };
  }

  /** Sentence translation HR→EN: multiple choice (early) or typed (late). */
  function exSentence(sent, mode) {
    const accepted = [sent.en].concat(sent.alt || []);
    if (mode === 'hr2enType') {
      return {
        type: 'sentTypeEn', cardId: 's:' + sent.id, sent,
        audioText: sent.hr,
        check(ans) { return checkTyped(ans, accepted); },
        rating: ratingFromResult
      };
    }
    // multiple-choice EN meaning
    const distract = pick(CRO.content.SENTENCES, 3, s => s.id === sent.id || norm(s.en) === norm(sent.en));
    const options = shuffle([sent].concat(distract));
    return {
      type: 'sentChoiceEn', cardId: 's:' + sent.id, sent, options,
      audioText: sent.hr,
      check(idx) {
        const ok = options[idx] && options[idx].id === sent.id;
        return { ok, expected: sent.en };
      },
      rating: ratingCapped
    };
  }

  /** Tile building: EN prompt → assemble the Croatian sentence from tiles. */
  function exTiles(sent) {
    const tokens = sent.hr.replace(/[.,!?]/g, '').split(/\s+/);
    // distractor tiles from other sentences in the same unit (or globally)
    const pool = CRO.content.SENTENCES
      .filter(s => s.id !== sent.id)
      .flatMap(s => s.hr.replace(/[.,!?]/g, '').split(/\s+/));
    // exclude distractors that normalize to a needed token (the check is
    // case-/diacritic-insensitive, so a case-variant tile would be accepted)
    const needNorm = new Set(tokens.map(norm));
    const distinct = [...new Set(pool.filter(t => !needNorm.has(norm(t))))];
    const distractors = pick(distinct, Math.min(3, distinct.length));
    return {
      type: 'tiles', cardId: 's:' + sent.id, sent,
      tokens, tiles: shuffle(tokens.concat(distractors)),
      audioText: sent.hr,
      check(assembled) {
        const want = norm(tokens.join(' '));
        const got = norm((assembled || []).join(' '));
        const ok = got === want;
        return { ok, expected: sent.hr };
      },
      rating: ratingFromResult
    };
  }

  /** Gap fill: sentence with one word blanked; choose from 4. */
  function exGap(sent) {
    // strip commas too, so the gapped option isn't the only one with a trailing comma
    const tokens = sent.hr.replace(/[.,!?]/g, '').split(/\s+/);
    // blank a content word, chosen at random (not always the longest, which is
    // predictable) and blank every occurrence so a repeat doesn't leak it
    const candidates = tokens.filter(t => t.length > 2);
    const target = candidates.length ? candidates[Math.floor(rng() * candidates.length)] : tokens[0];
    const display = tokens.map(t => norm(t) === norm(target) ? '____' : t).join(' ');
    // distractors: other forms / words of similar length from the unit
    const pool = [...new Set(CRO.content.SENTENCES
      .filter(s => s.unit === sent.unit && s.id !== sent.id)
      .flatMap(s => s.hr.replace(/[.,!?]/g, '').split(/\s+/))
      .filter(t => t.length > 2 && norm(t) !== norm(target)))];
    const options = shuffle([target].concat(pick(pool, 3)));
    return {
      type: 'gap', cardId: 's:' + sent.id, sent, display, target, options,
      en: sent.en,
      check(idx) {
        const ok = norm(options[idx] || '') === norm(target);
        return { ok, expected: target };
      },
      rating: ratingCapped
    };
  }

  /** Typed production: EN → type the whole Croatian sentence. */
  function exProduce(sent) {
    const accepted = [sent.hr].concat(sent.altHr || []);
    return {
      type: 'produce', cardId: 's:' + sent.id, sent,
      check(ans) { return checkTyped(ans, accepted); },
      rating: ratingFromResult
    };
  }

  /* ---------------- "ours" cards (family-variety entries) ---------------- */
  // A variety entry with both Croatian and a meaning is a real card
  // (cardId 'v:'+id). Options are shaped word-like ({hr, en}) so the app's
  // existing choice/typed renderers work unchanged.
  function varietyDistractors(entry, pool, n) {
    const seen = new Set([norm(entry.en)]);
    const out = [];
    for (const c of shuffle(pool)) {
      if (out.length >= n) break;
      if (c.id === entry.id || !c.en || !c.hr) continue;
      if (seen.has(norm(c.en))) continue;
      seen.add(norm(c.en));
      out.push({ id: c.id, hr: c.hr, en: c.en });
    }
    return out;
  }

  function exVarietyChoice(entry, dir, pool) {
    const self = { id: entry.id, hr: entry.hr, en: entry.en };
    const options = shuffle([self].concat(varietyDistractors(entry, pool, 3)));
    return {
      type: 'choice', dir, cardId: 'v:' + entry.id, word: self, options,
      check(idx) {
        const ok = options[idx] && options[idx].id === entry.id;
        return { ok, expected: dir === 'hr2en' ? entry.en : entry.hr, chosen: idx };
      },
      rating: ratingCapped
    };
  }

  function exVarietyType(entry) {
    return {
      type: 'produce', cardId: 'v:' + entry.id,
      sent: { hr: entry.hr, en: entry.en },
      audioText: entry.hr,
      check(ans) { return checkTyped(ans, [entry.hr]); },
      rating: ratingFromResult
    };
  }

  /** Exercise ladder for an ours-card, mirroring words: recognise → both
      directions → type it. pool = other candidates for distractors. */
  function exerciseForVariety(entry, maturityBucket, hasAudio, pool) {
    if (!entry || !entry.hr || !entry.en) return null;
    pool = pool || [];
    const r = rng();
    if (maturityBucket === 'new') return exVarietyChoice(entry, 'hr2en', pool);
    if (maturityBucket === 'learning') return exVarietyChoice(entry, r < 0.5 ? 'hr2en' : 'en2hr', pool);
    if (maturityBucket === 'young' && r < 0.5) return exVarietyChoice(entry, 'en2hr', pool);
    return exVarietyType(entry);
  }

  /* ---------------- numbers & prices (trip comprehension drill) ---------------- */
  const NUM_UNITS = ['', 'jedan', 'dva', 'tri', 'četiri', 'pet', 'šest', 'sedam', 'osam', 'devet'];
  const NUM_TEENS = ['deset', 'jedanaest', 'dvanaest', 'trinaest', 'četrnaest', 'petnaest', 'šesnaest', 'sedamnaest', 'osamnaest', 'devetnaest'];
  const NUM_TENS = ['', '', 'dvadeset', 'trideset', 'četrdeset', 'pedeset', 'šezdeset', 'sedamdeset', 'osamdeset', 'devedeset'];

  /** Spoken Croatian for 1–100 ("dvadeset pet"). */
  function numberToCroatian(n) {
    if (n === 100) return 'sto';
    if (n < 10) return NUM_UNITS[n];
    if (n < 20) return NUM_TEENS[n - 10];
    const t = Math.floor(n / 10), u = n % 10;
    return u ? NUM_TENS[t] + ' ' + NUM_UNITS[u] : NUM_TENS[t];
  }

  /** "dvadeset jedan euro" / "trideset pet eura" — ends-in-jedan takes the singular. */
  function priceText(n) {
    return numberToCroatian(n) + ((n % 10 === 1 && n % 100 !== 11) ? ' euro' : ' eura');
  }

  /** Speak-aloud rep: see the English, say the Croatian out loud, reveal,
      self-grade. No typing — the trip needs a mouth, and at two known users
      honesty is a fine grader (it's how Anki has always worked). */
  function exSpeak(cardId, item) {
    return {
      type: 'speak', cardId, item,
      audioText: (item.hr || '').split(' / ')[0],
      check(saidIt) {
        return { ok: !!saidIt, selfGraded: true, expected: item.hr };
      },
      rating(res) { return res.ok ? CRO.srs.Rating.Good : CRO.srs.Rating.Again; }
    };
  }

  /** Listening drill: hear a price, type the number. Not an SRS card — a skill
      rep for the market/café moment; XP only. */
  function exPriceListen() {
    const n = 1 + Math.floor(rng() * 100); // 1–100
    return {
      type: 'priceListen', cardId: null, n,
      audioText: priceText(n),
      check(ans) {
        const ok = String(ans == null ? '' : ans).trim() === String(n);
        return { ok, expected: n + ' — ' + priceText(n) };
      }
    };
  }

  /* ---------------- session builder ---------------- */

  /**
   * Pick the exercise for a card given its maturity and whether audio exists.
   * variety: rotate types via the per-session rng.
   */
  function exerciseFor(cardId, maturityBucket, hasAudio) {
    const item = CRO.content.item(cardId);
    if (!item) return null;
    const isWord = cardId.startsWith('w:');
    const r = rng();

    if (isWord) {
      if (maturityBucket === 'new') {
        // first contact after the intro: pure recognition, never production
        return exChoice(item, 'hr2en');
      }
      if (maturityBucket === 'learning') {
        if (hasAudio && r < 0.3) return exListen(item, false);
        return exChoice(item, r < 0.5 ? 'hr2en' : 'en2hr');
      }
      if (maturityBucket === 'young') {
        if (hasAudio && r < 0.35) return exListen(item, false);
        return exChoice(item, 'en2hr');
      }
      // mature
      if (hasAudio && r < 0.4) return exListen(item, true, 1.0); // mature ears get natural speed
      return exChoice(item, 'en2hr'); // typed word entry handled via listenType; choice keeps pace brisk
    }

    // sentence cards
    if (maturityBucket === 'new') {
      // a brand-new sentence is taught on a teach screen first (app layer);
      // its first exercise is recognising the meaning, nothing harder
      return exSentence(item, 'hr2enChoice');
    }
    if (maturityBucket === 'learning') {
      return r < 0.5 ? exSentence(item, 'hr2enChoice') : exTiles(item);
    }
    if (maturityBucket === 'young') {
      if (r < 0.35) return exTiles(item);
      if (r < 0.65) return exGap(item);
      return exSentence(item, 'hr2enType');
    }
    // mature → real production
    if (r < 0.4) return exProduce(item);
    if (r < 0.7) return exSentence(item, 'hr2enType');
    return exGap(item);
  }

  window.CRO = window.CRO || {};
  CRO.ex = {
    letters, stripDiacritics, norm, checkTyped, editDistance,
    reseed, shuffle, pick,
    exIntro, exChoice, exListen, exPairs, exSentence, exTiles, exGap, exProduce,
    exerciseFor, exerciseForVariety, ratingFromResult, ratingCapped, _dalForms: dalForms,
    numberToCroatian, priceText, exPriceListen, exSpeak,
    SPECIAL_KEYS: ['č', 'ć', 'š', 'ž', 'đ']
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = CRO.ex;
})();
