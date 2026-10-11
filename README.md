# Recall — React Native spaced-repetition app

A substantial **offline-first Anki-inspired mobile implementation** in TypeScript, React Native, Expo SDK 57, SQLite and FSRS. Targets Android and iOS.

> **Important:** This is an implementation draft, not a certified Anki replacement. It has not been run on a physical device in this environment. It does **not** implement direct AnkiWeb collection sync, and `.apkg` support is limited to legacy packages. See [the compatibility matrix](docs/ANKI_COMPATIBILITY.md) before importing an important collection.

## Quick start

Requires Node.js **22.13+**, npm, Expo Go (for local features) or Android Studio / Xcode for native development.

```bash
npm install
npx expo install --check
npm run start
```

Scan the Expo QR code with Expo Go. On a connected Android device you can also use `npm run android`. There is no precompiled APK in this archive.

Run validation:

```bash
npm test
npm run typecheck
npm run doctor
```

For APK builds, use Expo Application Services / EAS build or `npx expo run:android` with a configured Android SDK. Test the package importer on a **disposable Anki profile** before any production import.

## 2026-10-11 — Recall 2 interface redesign

Rebuilt the Home, Study, and Speed Learning flow with thumb-reachable actions, clear progress, consistent visual hierarchy and a precision-focused card subset picker. Browse uses `FlatList` virtualization, debounced search and an out-of-order response guard. Settings now includes persisted interface preferences: 4 accent colors, compact/comfortable density, 3 answer sizes, show/hide answer interval predictions, and tap-to-reveal. These changes leave the FSRS model untouched.

[UI design notes and image previews](design/UI_DESIGN.md) are included. **Rendered previews are not actual Android/iOS emulator screenshots.** Theme accents change supported foreground controls and badges but do not switch the entire application to a dark appearance. Preference settings currently remain local-only and are not backed up with Recall JSON. See the design notes for limitations and validation.

## Included screens

- Home dashboard: daily goal, progress bar, streak, card count, deck summaries and quick study.
- Study flow: question/answer reveal, Again/Hard/Good/Easy actions with estimated intervals, undo, bury, suspend, edit, progress and session completion.
- **Speed Learning:** select a subset by deck (including subdecks), keyword, required tags, new/due/lapsed status or individual cards; rapid reveal or free typed recall, either 1–3 consecutive successes per card OR 1–20 consecutive 100% rounds across the entire subset, instant/spaced retry on mistakes in per-card mode, shuffle, skip, undo, mistakes-only replay, progress/accuracy metrics, and SQLite-persisted resume. Does **not** change FSRS intervals or Anki review logs.
- Notes: Basic, Reversed and Cloze, deck selector, tags, editing and deletion.
- Browser: search front/back/tags, filter by deck, suspend/unsuspend and delete.
- Decks: nested `Parent::Child` hierarchy, descriptions, daily card limits and export.
- Statistics: daily activity, simple answer success rates, study days, time and totals.
- Settings: new cards/day, review limits, retention, daily goals, start-of-day and learning-ahead.
- Transfer: import CSV/TSV/TXT and legacy `.apkg`; export Recall JSON, TSV, or legacy `.apkg`.
- Experimental desktop notes bridge: AnkiConnect note import/export actions + Anki Desktop's own AnkiWeb `sync` action.

## Data model

`decks`, `notes`, `cards`, `review_logs`, `speed_sessions`, and `preferences` are persisted in `recall-v1.db` via Expo SQLite, with foreign keys and WAL enabled. Each flashcard has an independently scheduled FSRS state. Recall JSON backups contain decks, notes, cards, logs, preferences, and (optionally for backward compatibility) up to 100 recent Speed Learning sessions. Legacy backup imports without this field remain supported.

## File structure

```
App.tsx                           screens and navigation
src/core/types.ts                 domain entities and defaults
src/core/cards.ts                 reversed + cloze generation
src/core/scheduler.ts             FSRS scheduling and previews
src/core/speed.ts                 Independent speedy recall / mastery queue and stats
src/core/checksum.ts              Anki SHA-1 field checksum
src/data/database.ts              SQLite schema, queries, transactions + speed session persistence
src/screens/SpeedLearning.tsx     Subset picker, options, recall screen, session summary
src/theme/CardBody.tsx           Shared media-aware card rendering
src/services/importExport.ts      file selection, CSV/JSON/APKG transfer
src/services/desktopBridge.ts     optional AnkiConnect notes-only integration
src/theme/ui.tsx                  visual components, accent palettes, UI preference types
src/theme/prefs.ts                SQLite UI preference load/save
plugins/withAnkiConnectLan.js      optional unsafe LAN HTTP support
```

## Speed Learning: consecutive perfect rounds (added 2026-10-11)

The customizable 100% round completion rule is separate from regular Anki/FSRS scheduling and from the original per-card mastery rule. The UI offers a choice between the two in **Sprint settings**, with a 1–20-round target and progress shown during study. Resuming a sprint or exporting/reimporting a Recall JSON backup preserves round counters and history. Legacy Speed Learning sessions without this option remain in per-card mastery mode when resumed. Removing flashcards from a saved round-mode sprint resets perfect-round progress to avoid counting incomplete rounds.

## Speed Learning: use and behavior

1. Open **Home → Speed Learning** or **Deck → Speed learn a subset**. Filtering by a deck includes nested `Deck::Child` decks.
2. Optionally filter by phrase (front, back, tags), one or more required tag names (all entered tags must match), and `All cards`, `New`, `Due now` or `Previously lapsed`. Suspended cards are excluded by default. The picker displays at most 500 matches; narrow the filter to reach others.
3. Tap card rows to build an exact selection, or start directly with the first up to 250 matching cards. Your explicit selection can span multiple filters/decks. Clear it with **Clear selection**.
4. Under **Sprint settings → When is this sprint complete?**, choose one of two independent modes:
   - **Perfect 100% rounds:** Set any target from **1 to 20 consecutive perfect rounds** with `−` / `+` or presets (1, 2, 3, 5, 10). A round means **one attempt at each selected card**, regardless of shuffle or skip. Every answer must be **Remembered** for that round to be 100%. Any **Again** immediately breaks the consecutive-round streak, but the current round still finishes; the app then gives you another full round. The session completes only after **N entire, consecutive 100% rounds**, not after N individually correct cards. The active round counter, mistakes, last round result, completed rounds and current perfect streak are displayed and persisted. This mode replaces per-card mastery/retry-spacing for session completion.
   - **Per-card mastery:** Existing behavior: choose **1–3 consecutive remembered ratings** to master each individual card and **0/2/4/8** other cards between retries.
   Enable typing if you want to attempt an answer before revealing it; typing is self-graded, not automatic string matching.
5. Tap **Reveal answer**, then **Again** or **Remembered**. In 100% rounds mode a mistake resets the current perfect-round streak, and the missed card returns in the next full round (not immediately). In per-card mode **Again** resets that card's mastery streak and requeues it using retry spacing. Skip and undo are available. Finish the sprint, repeat the same subset, or retry just the cards you got wrong at least once.
6. Exiting saves the session; reopen Speed Learning to **Continue last sprint**. A new sprint archives the previous one. Progress is stored locally, not synced to AnkiWeb or used to change FSRS due dates.

Speed Learning is intentionally an ungraded study sandbox relative to Anki scheduling. It has no automatic timer-based card grading, automatic marking of exact typed answers, or per-card learning statistics in standard review history. It handles images/audio via the same media viewer as the normal study screen, if the files exist on-device.

## Desktop bridge setup (optional)

1. Install [AnkiConnect](https://ankiweb.net/shared/info/2055492159) in Anki Desktop.
2. If the phone is on a different device, secure a trusted connection to the desktop's AnkiConnect endpoint. Default AnkiConnect binds to `127.0.0.1:8765` and is not reachable by the phone. Do not make the endpoint publicly accessible.
3. Enter the reachable HTTP(S) endpoint in **Settings → Desktop Anki bridge**. Prefer a TLS endpoint; if local unencrypted HTTP is required, add `"./plugins/withAnkiConnectLan"` to `expo.plugins` before prebuilding and only use this on a trusted network.
4. Use Test, Push or Pull notes, then Desktop sync. **This is not mobile AnkiWeb collection sync**, and does not preserve cross-device review state.

## Future work required for parity

See [Anki compatibility](docs/ANKI_COMPATIBILITY.md). Priorities: full Rust Anki core native bridge + collection migration and sync; modern protobuf/zstd `.anki21b` parsing; native notetype template rendering; media sync; FSRS optimizer and per-deck parameter sets; large-collection virtualization/performance tests; deep links and background sync; accessibility and end-to-end tests.

## Licenses

This implementation uses independently written app code and external npm packages under their own respective licenses. If integrating the official Anki Rust backend, follow the project's **AGPL-3.0 licensing requirements** and publish the corresponding source as required.
