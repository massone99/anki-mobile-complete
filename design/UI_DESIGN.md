# Recall 2 — UI implementation

The UI was redesigned for quick one-handed reviews, readable cards, and predictable actions.

- **Home:** high-contrast momentum banner; one-step Study; clear Speed Learning launcher; compact readiness counts per deck.
- **Normal review:** fixed answer controls at the bottom; four distinct, readable ratings; undo, edit, bury, suspend; text size and interval-preview controls.
- **Speed Learning:** focus banner, precise deck/tag/state/search and individual-card selection, fixed sprint launcher; mastery counters, recall accuracy and retry controls. All progress remains separate from FSRS review scheduling.
- **Browser:** FlatList virtualization (initial 12 rows; window of 7), 170ms query debounce, outdated-result guard, hit targets for delete/suspend.
- **Settings → Interface:** four accents (forest, indigo, ocean, berry), comfortable/compact layout, three answer text sizes, interval preview toggle, tap-to-reveal toggle. Saved in SQLite (`preferences.ui_prefs`); writes are serialized so rapid setting changes remain in order. Defaults are validated before use.
- **Design:** off-white background, forest accent and ink typography, clear visual hierarchy, minimum ~42pt navigation/control hit areas.

## Preview image status

The PNGs in `design/screenshots` are **Chromium-rendered visual previews based on the implemented React Native styles and screen composition, with illustrative sample data**. They are not captured from a running Android/iOS build. Some icons, sample card bodies, the simulated time and numerical FSRS intervals are approximate. They are design references; actual platform text rendering and layouts can vary. `design/preview.html` is the static visual reference used for rendering.

## Testing status

Node core tests and SQLite SQL smoke tests pass. JSX/TypeScript syntax transpilation was checked for modified files. Full `tsc --noEmit`, Metro bundling, device UI behavior and E2E latency remain **unverified** because this environment lacks installed Expo project dependencies and an Android/iOS runtime.

## Scope limits

This UI update does not introduce direct AnkiWeb collection sync or modern `.anki21b` package compatibility. Import/Export and desktop-bridge capabilities are unchanged. Interface settings are local preference records and are not included in existing Recall JSON backups.
