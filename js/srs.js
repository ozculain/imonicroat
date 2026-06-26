/* =========================================================================
   FSRS scheduler (Free Spaced Repetition Scheduler, v4.5 formulas)
   Reference: Jarrett Ye et al., "Optimizing Spaced Repetition Schedule by
   Capturing the Dynamics of Memory" / open-spaced-repetition/fsrs4anki.
   Default weights are the published FSRS-4.5 defaults.
   ========================================================================= */
if (typeof window === 'undefined') { global.window = global; } // node test shim
(function () {
  'use strict';

  const W = [
    0.4872, 1.4003, 3.7145, 13.8206, // initial stability for Again/Hard/Good/Easy
    5.1618, 1.2298,                  // initial difficulty
    0.8975, 0.0310,                  // difficulty update + mean reversion
    1.6474, 0.1367, 1.0461,          // stability growth
    2.1072, 0.0793, 0.3246, 1.5870,  // post-lapse stability
    0.2272, 2.8755                   // hard penalty, easy bonus
  ];

  const DECAY = -0.5;
  const FACTOR = Math.pow(0.9, 1 / DECAY) - 1; // = 19/81; R(S,S)=0.9 by construction

  const Rating = { Again: 1, Hard: 2, Good: 3, Easy: 4 };

  const DAY_MS = 24 * 60 * 60 * 1000;

  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

  /** Probability of recall t days after a review that left stability S. */
  function retrievability(tDays, S) {
    if (S <= 0) return 0;
    return Math.pow(1 + FACTOR * (tDays / S), DECAY);
  }

  /** Interval (days) at which retrievability decays to requestRetention. */
  function nextIntervalDays(S, requestRetention) {
    const ivl = (S / FACTOR) * (Math.pow(requestRetention, 1 / DECAY) - 1);
    return clamp(Math.round(ivl), 1, 365);
  }

  function initStability(rating) {
    return Math.max(W[rating - 1], 0.1);
  }

  function initDifficulty(rating) {
    return clamp(W[4] - (rating - 3) * W[5], 1, 10);
  }

  function nextDifficulty(d, rating) {
    const updated = d - W[6] * (rating - 3);
    // mean reversion toward D0(Easy), the canonical FSRS-4.5 anchor (≈3.93)
    return clamp(W[7] * initDifficulty(Rating.Easy) + (1 - W[7]) * updated, 1, 10);
  }

  function stabilityAfterRecall(d, s, r, rating) {
    const hardPenalty = rating === Rating.Hard ? W[15] : 1;
    const easyBonus = rating === Rating.Easy ? W[16] : 1;
    return s * (1 +
      Math.exp(W[8]) *
      (11 - d) *
      Math.pow(s, -W[9]) *
      (Math.exp(W[10] * (1 - r)) - 1) *
      hardPenalty * easyBonus);
  }

  function stabilityAfterLapse(d, s, r) {
    const sNew = W[11] *
      Math.pow(d, -W[12]) *
      (Math.pow(s + 1, W[13]) - 1) *
      Math.exp(W[14] * (1 - r));
    return Math.min(clamp(sNew, 0.1, 365), s); // a lapse never increases stability
  }

  /** A fresh card record. `cardId` keys back into the content layer. */
  function newCard(cardId) {
    return {
      cardId,
      state: 'new',          // new | learning | review | relearning
      stability: 0,
      difficulty: 0,
      due: 0,                // epoch ms; 0 = available immediately
      lastReview: 0,
      reps: 0,
      lapses: 0,
      stepsLeft: 0           // intra-session learning steps remaining
    };
  }

  // Learning steps: a new card must be answered correctly twice in-session
  // (Duolingo-style) before it graduates to the FSRS review queue.
  const LEARNING_STEPS = 2;

  /**
   * Apply a review. Mutates and returns the card.
   * rating: 1..4 (the exercise layer maps correctness/speed onto this).
   * now: epoch ms.
   */
  function review(card, rating, now, requestRetention) {
    requestRetention = requestRetention || 0.9;
    // guard against an out-of-range / NaN rating corrupting the card forever
    // (initStability indexes W[rating-1]); fall back to Good.
    rating = Math.round(rating);
    if (!(rating >= 1 && rating <= 4)) rating = Rating.Good;
    const elapsedDays = card.lastReview ? Math.max(0, (now - card.lastReview) / DAY_MS) : 0;

    if (card.state === 'new') {
      card.stability = initStability(rating);
      card.difficulty = initDifficulty(rating);
      if (rating === Rating.Again) {
        card.state = 'learning';
        card.stepsLeft = LEARNING_STEPS;
        card.due = now + 60 * 1000;             // retry within the session
      } else if (rating === Rating.Easy) {
        card.state = 'review';
        card.due = now + nextIntervalDays(card.stability, requestRetention) * DAY_MS;
      } else {
        card.state = 'learning';
        card.stepsLeft = 1;
        card.due = now + 10 * 60 * 1000;
      }
    } else if (card.state === 'learning' || card.state === 'relearning') {
      if (rating === Rating.Again) {
        card.stepsLeft = LEARNING_STEPS;
        card.due = now + 60 * 1000;
      } else {
        card.stepsLeft -= 1;
        if (card.stepsLeft <= 0 || rating === Rating.Easy) {
          card.state = 'review';
          card.due = now + nextIntervalDays(card.stability, requestRetention) * DAY_MS;
        } else {
          card.due = now + 10 * 60 * 1000;
        }
      }
    } else { // review
      const r = retrievability(elapsedDays, card.stability);
      if (rating === Rating.Again) {
        card.lapses += 1;
        card.stability = stabilityAfterLapse(card.difficulty, card.stability, r);
        card.difficulty = nextDifficulty(card.difficulty, rating);
        card.state = 'relearning';
        card.stepsLeft = 1;
        card.due = now + 60 * 1000;
      } else {
        card.stability = stabilityAfterRecall(card.difficulty, card.stability, r, rating);
        card.difficulty = nextDifficulty(card.difficulty, rating);
        card.due = now + nextIntervalDays(card.stability, requestRetention) * DAY_MS;
      }
    }

    card.lastReview = now;
    card.reps += 1;
    return card;
  }

  /**
   * Seed a card as already-known (test-out / placement).
   * stabilityDays controls how far out the first review lands.
   */
  function seedKnown(card, now, stabilityDays) {
    card.state = 'review';
    // a zero/negative stability makes the first real review NaN (pow(0,-w)) —
    // clamp to a sane floor
    card.stability = Math.max(stabilityDays, 0.1);
    card.difficulty = initDifficulty(Rating.Easy);
    card.lastReview = now;
    card.reps = 1;
    // jitter ±20% so seeded cards don't all come due the same day
    const jitter = 0.8 + 0.4 * pseudoRandom(card.cardId);
    card.due = now + Math.max(1, Math.round(stabilityDays * jitter)) * DAY_MS;
    return card;
  }

  /** Deterministic per-card jitter so seeding is reproducible. */
  function pseudoRandom(str) {
    str = String(str); // a numeric cardId would have no .length → constant jitter
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return ((h >>> 0) % 1000) / 1000;
  }

  /** Cards due for review at `now`, soonest first. */
  function dueCards(cards, now) {
    return cards
      .filter(c => c.state !== 'new' && c.due <= now)
      .sort((a, b) => a.due - b.due);
  }

  /** Maturity bucket used by the exercise layer to pick difficulty. */
  function maturity(card) {
    if (card.state === 'new') return 'new';
    if (card.state === 'learning' || card.state === 'relearning') return 'learning';
    return card.stability >= 21 ? 'mature' : 'young';
  }

  window.CRO = window.CRO || {};
  CRO.srs = {
    Rating, newCard, review, seedKnown, dueCards, maturity,
    retrievability, nextIntervalDays, DAY_MS,
    _internals: { initStability, initDifficulty, nextDifficulty, stabilityAfterRecall, stabilityAfterLapse, W }
  };

  // Allow node-based testing
  if (typeof module !== 'undefined' && module.exports) module.exports = CRO.srs;
})();
