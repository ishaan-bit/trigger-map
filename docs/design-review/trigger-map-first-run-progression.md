# Trigger Map — first-run progression (render-and-fix pass)

Date: 2026-06-25 · Branch: `feature/ui-adaptive-tags-revamp`

## What changed and why

Value now lands at the **first log**, not the third. Previously every user with
<3 lifetime moments saw one "still learning / not enough yet" shell. The signal
state model now distinguishes the early journey:

| Logs | State | What the user sees | Honesty guard |
|------|-------|--------------------|---------------|
| 0 | `seeding` | Focused starter + CTA | No inference |
| 1 | `reflection` | **First point on the map** — the actual area + feeling they logged, as a glowing linked pair | Restates their own log; never implies repetition/cause |
| 2 | `thread` | **Possible thread** — areas/feelings so far, with an `↻ again` badge when one repeats | "Possible", "could clarify" — echo ≠ pattern |
| 3+ | `forming` → `pattern` → … | Existing barometer/connected/changes spine | 3 is the *earliest* threshold, not a guarantee |

Implemented in the pure layers so it stays testable:
- `utils/triggerSignal.js` — `buildSeed()` + reflection/thread state resolution + `seed` payload.
- `utils/triggerCopy.js` — reflection/thread headlines (interpolated) + `firstReflection`/`possibleThread` confidence chips.
- `components/triggermap/SeedMap.js` (new) — the first-run map visual (FirstPoint / Lanes / growth dots).
- `components/triggermap/TriggerMapView.js` — `SeedExperience` wires it in; reflection/thread route before seeding/dormant.
- `i18n/en.json` + `i18n/hi.json` — new keys, full parity (86/86).

## Honesty rules verified

- A reflection is not a pattern; a thread is "possible". (copy + tests)
- Insufficient data never renders as `steady` (state machine; unit-tested).
- The barometer is **not rendered** in reflection/thread — no fabricated pressure read.
- 3 local-only logs resolve to `forming`, not `pattern` (unit-tested).

## Render validation done

- Text-level render of all 7 states × EN/HI confirmed (hierarchy title→body→chip→map,
  no leftover `{placeholders}`, natural Hindi wrapping).
- Static RN review fixed two real issues:
  1. Replaced single-side dashed border (renders inconsistently on Android) with discrete dots.
  2. Removed card-in-card nesting — header card and SeedMap card are now siblings, matching the established rhythm.
- Chips use `flexWrap` + `numberOfLines={1}` + `flexShrink` so long Hindi labels wrap by chip, never clip.

## Remaining visual debt (later pass)

- **No on-device screenshots captured.** Validation here was static + text-level only;
  a real Android/emulator pass is still owed to confirm pixel spacing, the SeedMap dot
  connector alignment, and Hindi line-height on small (≤360dp) widths.
- `analysisReady` treats local `correlations: {}` / `frictionZones: []` as truthy, so the
  `forming(pending)` offline-shell branch effectively never fires for local reports. Harmless
  today (local 3-log users land on `forming` anyway) but worth tightening to a non-empty check.
- The legacy 3-tab "Explore" content (Mirror/ThisWeek/Premium) still uses the older card
  grammar; the transition from the new spine into Explore is functional but not yet visually
  unified.

## Legacy cleanup done

Removed inert (0-reference) legacy header/hero/share-button styles from
`WeeklyReportScreen.js` and the now-orphaned `Share` import.
