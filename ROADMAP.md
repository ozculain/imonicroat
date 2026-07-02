# Plan

The app teaches practical Croatian for time in Dalmatia — standard Croatian as
the backbone, common Dalmatian forms (general ikavian/coastal) marked where
they differ. This file is what's next, in order, and what triggers it.

## Built

- 10 units (A1): greetings, family, food & drink, everyday verbs, travel,
  shopping & numbers (prices in euros), time, past tense, giving, conversation.
  Every item cites a source; a flag → review workflow corrects anything wrong.
- FSRS spaced repetition; lessons teach before they test.
- Two profiles, forgiving streak, weekly total (combined by default, duel
  optional), cross-device sync (encrypted gist or shared file, pairing code for
  the second device), optional lock, offline PWA.
- Own phrases: a variety entry with a meaning becomes a real card in the review
  engine — the phrasebook grows as needed.
- Dalmatian forms count as correct answers; the standard form is echoed back.
- Numbers to 100 and a price-listening drill (hear "trideset pet eura", type
  35) — joins lessons once the tens are learned.
- Speak-aloud reps: two per lesson from stronger cards — say it, reveal,
  self-grade. Listening has slow and natural-speed replay, and the app says so
  when a device has no Croatian voice instead of silently dropping listening.
- A small daily "say it out loud" prompt after lessons.

## Next, when triggered

- **Run on real phones** (deploy to GitHub Pages) → fix whatever the first week
  of actual use turns up. This is the gate for everything below.
- **Most of the 10 units done** → new units for getting things done there:
  directions and transport, pharmacy/doctor, renting and utilities,
  post office/admin, weather and sea.
- **TTS grates or a device has no Croatian voice** → record real audio per card
  (needs design: size and sync of audio blobs).
- **Wanting speaking practice beyond the daily prompt** → quiz mode: one phone
  prompts, the other person answers out loud, mark right or wrong.
- **Android home-screen icon looks cropped** → generate a padded maskable
  512px icon, add to the manifest.

Nothing else is planned until real use asks for it.
