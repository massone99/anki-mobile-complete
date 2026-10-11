# Anki compatibility contract

This file is intentionally explicit. A UI that says **Sync** but does not merge the Anki collection is not an AnkiWeb client.

## Current capabilities

| Capability | Status | Notes |
| --- | --- | --- |
| Offline Basic cards | Implemented | Stored in local SQLite |
| Reversed cards | Implemented | Two sibling cards |
| Cloze cards | Implemented | `{{c1::...}}`, `{{c2::...}}`; independent ordinals |
| FSRS | Implemented (local) | `ts-fsrs` 5.x, configurable retention; optimizer absent |
| Intervals, answer logs, undo, suspend, bury | Implemented | Local collection only |
| Deck hierarchies and per-deck limits | Implemented | Namespaced with `::` |
| Note editor, browser, tags | Implemented | Full-text query uses SQLite LIKE |
| Images / audio in legacy `.apkg` | Implemented in basic form | Local files in app documents; external resources are not fetched |
| `.txt/.csv/.tsv` import | Implemented | Anki "Notes in Plain Text" exports (`#separator`, `#html`, `#guid/notetype/deck/tags column`, multiline quoted fields; notetypes mapped to Basic / Reversed / Cloze; duplicate GUIDs skipped) plus Front, Back, Tags, Deck, Type files; tab / comma / semicolon |
| `.json` import/export | Implemented | Recall's own versioned lossless backup format |
| `.apkg` import | Partial | Legacy SQLite `.anki2` / `.anki21`; basic, reversed, cloze models approximated, no templates or FSRS history conversion |
| `.apkg` export | Partial | Legacy `.anki21` package; notes, cards, best-effort scheduling, review log, referenced images/audio. Test with a disposable Anki profile first. |
| New `.anki21b` package import | Not yet supported | Requires protobuf schema-18 and zstd support |
| `.colpkg` full collection import/export | Not implemented | Requires full Anki collection schema and scheduling metadata |
| Custom notetypes and CSS | Not implemented | Imported notetypes are mapped to Basic / Reversed / Cloze |
| Direct AnkiWeb collection sync | **Not implemented** | The Rust Anki backend/protocol must be integrated; this is not a simple REST account endpoint |
| AnkiWeb media sync | **Not implemented** | Must support media usn, hashes, conflict resolution, and credentials |
| AnkiConnect desktop bridge | Partial, opt-in | Notes only. Can ask desktop to sync desktop with AnkiWeb; mobile reviews do not sync. |
| HTML rendering | Partial | Simple text plus images and sound tags; advanced CSS, MathJax and template scripting unsupported |

## Why native AnkiWeb sync is not in this build

The modern Anki sync protocol uses authenticated session keys, update sequence numbers, collection schema migrations, incremental merge rules, full upload/download fallbacks, protobuf, compression, and a separate media sync protocol. Reimplementing a superficially plausible sync endpoint could overwrite or delete existing decks, review history or media.

For parity, integrate Anki's official AGPL-licensed Rust core behind a custom Expo native module (`expo prebuild`, Android NDK and iOS bridge). The AnkiDroid backend is a useful architectural reference: a thin native bridge exposes `openBackend`, `runMethodRaw`, and `closeBackend` over protobuf. Keep all AnkiWeb operations in the official backend, not in the JS collection layer. The whole local data model then needs to be replaced by or migrated to the Anki collection so history and update sequence numbers remain stable.

References:
- https://github.com/ankidroid/Anki-Android-Backend
- https://github.com/ankitects/anki
- https://docs.ankiweb.net/sync-server.html
- https://docs.ankiweb.net/exporting.html
- https://docs.expo.dev/versions/v57.0.0/sdk/sqlite/

## Desktop bridge warnings

1. Install Anki Desktop and AnkiConnect on a trusted laptop/desktop. AnkiConnect is normally bound to localhost, and exposing it on a LAN expands its attack surface.
2. Use a secure trusted network, or an authenticated HTTPS relay; never expose port 8765 directly to the public Internet.
3. The `push` action **only adds missing notes**; it does not transfer review scheduling, deletions, tags edits or media changes to existing notes.
4. `pull` copies supported field values; it does not copy original card states, template styling or scheduling.
5. `sync desktop with AnkiWeb` merely invokes AnkiConnect's `sync` action on the desktop. It does **not** synchronize this mobile app's review history to AnkiWeb.
6. The optional native config plugin `withAnkiConnectLan.js` enables local HTTP networking and, on Android, permits cleartext traffic globally; do not ship it enabled without a threat model.

## Import safety

- Archives are capped by compressed size, SQLite size and note count; media entries are filename-validated and individually size limited.
- Imported Anki GUIDs are preserved where available to avoid importing a GUID twice.
- The importer does not overwrite pre-existing Anki notes; differing schedules and custom templates cannot be correctly merged.
- Restore of a Recall JSON backup merges by Recall object IDs; a **replace** restore is implemented in the database API but not exposed in the mobile UI.
- Always make a backup before testing Anki interop with valuable study data.
