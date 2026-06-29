# Web ↔ Android Parity Plan

> Bring `web/` (frozen at **v1.0.8**) to full visual + functional parity with the
> mobile Android build (**v1.0.17**), fully wired to the same backend,
> cross-browser (Android Chrome / iOS Safari), and installable as a PWA.

Generated from a 9-surface audit (logging, timeline, report/insights, premium,
settings/onboarding, identity, atmosphere/design, backend wiring, PWA).

## Executive summary

Web is ~9 mobile versions behind. The gap is **not** incremental polish — three of
four core surfaces (Log, Report/Insights, Premium, Settings+Onboarding) need
ground-up rebuilds, and the identity + atmosphere foundation has fully diverged.

Two foundational breaks block everything else:

1. **Identity:** web still runs the removed email/Google sign-in stack and gates
   premium/progress/modes behind `isSignedIn` (now permanently false). Mobile went
   **device-ID-only at v1.0.9**. The backend is already 100% device-ID ready
   (`ownerId = token?.id || deviceId` on every route), so all parity work is web-side.
2. **Shared logic:** web's `@triggermap/shared` alias points at a **stale local copy**
   (`web/shared/`) missing `contributions.js` + the `knowledge/` library and with
   divergent `emotions.js`/`tags.js`. Web cannot consume v1.0.16 adaptive tags / modes
   until re-pointed at the monorepo root `shared/`.

## Open decisions (need user input)

- **Web subscription/purchase** — web cannot use native Play IAP. Options: (a) browser
  checkout (Stripe/Razorpay) → POST to existing `/api/subscription/verify` keyed by
  deviceId; (b) defer purchase but still reflect entitlement bought on the same deviceId.
- **i18n / Hindi** — mobile has full en+hi via `t()`. Web hardcodes English. Stand up a
  web i18n context + hi catalog now, or English-first scaffold and defer hi.

## Sequencing

1. **Foundations (P0)** — (a) re-alias shared to root + delete stale `web/shared/`;
   (b) rewrite `useSession` + `web/lib/api.js` to device-ID contract (fix
   `/api/actionFeedback`→`/api/actions` 404, thread deviceId everywhere, add ~12 missing
   wrappers, delete sign-in).
2. **Cross-cutting primitives (P0)** — emotionModel (color/coordinate fallback),
   EmotionalStateProvider, AtmosphericField + icon tab bar, onboarding state machine +
   SpotlightOverlay/Tooltip, adaptiveTags util, Card/Button/font/motion design tokens, i18n.
3. **Surfaces** — Log (P0) → Report Read-spine + early detection + Progress (P0) →
   Report For-You modes (P1) → Timeline (P1, parallel) → Premium (P1) →
   Settings+Onboarding (P1).
4. **P2 tail** — Web Push + offline-first localStore; PWA install/manifest/offline/icon polish.

## Workstreams

| # | Workstream | Prio | Est | Depends on |
|---|-----------|------|-----|-----------|
| 1 | Foundation: shared re-alias + device-ID identity + api wiring | P0 | L | — |
| 2 | Cross-cutting presentation + state primitives | P0 | XL | 1 |
| 3 | Log / capture flow (EmotionPad + adaptive tags + FTUE) | P0 | XL | 1,2 |
| 4 | Timeline surface | P1 | L | 2 |
| 5 | Report / Insights — Read spine, early detection, animated Progress | P0 | XL | 1,2 |
| 6 | Report — For You (premium-first Move/Fuel/Perspective) | P1 | XL | 5 |
| 7 | Premium / subscription surface | P1 | XL | 1,2 |
| 8 | Settings + Guide modal + Onboarding carousel | P1 | XL | 1,2 |
| 9 | Web Push delivery + offline-first data layer | P2 | L | 1 |
| 10 | PWA install + cross-browser polish | P2 | M | 2 |

### 1 — Foundation
- `web/next.config.js`: re-point `@triggermap/shared` alias to `../shared`; delete stale `web/shared/`.
- `web/hooks/useSession.js`: device-ID identity — bootstrap `getDeviceId()` unconditionally,
  `fetchMe(null, deviceId)` every load, expose `deviceId`/`subscription`/`isPremium`/`firstAiFreeAvailable`,
  keep `token:null`/`user:null` stable nulls, drop sign-in methods, fire-and-forget `registerDevice`,
  one-time `recover(deviceId, legacyToken)` gated by `triggermap.web.recovery-done`.
- `web/lib/api.js`: thread deviceId into all owner-scoped calls; **fix `submitActionFeedback`→`/api/actions`**;
  add wrappers: recover, registerDevice, createShareSnapshot, fetchShareSnapshot, registerPushToken,
  unregisterPushToken, saveNotificationPrefs, getNotificationPrefs, verifySubscription, submitModeFeedback,
  fetchModeProfile, updateModeProfile, regeneratePremium, fetchModeOutput; remove loginApi/registerApi.
- Delete `web/pages/login.js`; remove Google GSI `<Script>` from `_app.js`; fix `Layout.js` sign-in copy.

### 2 — Primitives
- `web/lib/emotionModel.js`: port `emotionColor(valence,arousal)`, `FIELD_GRADIENT`, `resolveEmotion`/`momentEmotion`.
- `web/hooks/useEmotionalState.js` (provider): port `computeDominantEmotion/Trigger/Trend` + `EMOTION_PALETTE` + SCORE.
- `web/components/AtmosphericField.js`: ~4 animated radial-gradient blobs, AURORA hue triad keyed to dominant emotion.
- `web/components/Layout.js`: 5-item icon tab bar (Log/Timeline/Insights/Premium/Settings), active tint = live emotion color.
- `web/hooks/useOnboarding.js` + `SpotlightOverlay.js` + `Tooltip.js`.
- `web/lib/adaptiveTags.js`: port `getRelevantContributionSuggestionsSync`/`recordTagUsage` (localStorage).
- globals.css design tokens: Card sheen, PrimaryButton variants, font swap, motion vars, count-up utils.
- web i18n context + catalogs.

### 3–10
See audit JSON (`docs/web-parity/audit.json`) for the full file-level task list per surface.

## Key risks

- **Subscription** has no ported path (product decision required).
- **Data recovery** for previously-signed-in web users is fragile — the one-shot
  `recover(deviceId, legacyToken)` must run on the same stored deviceId.
- **Re-aliasing shared** may need `transpilePackages`/exclude tuning (root `shared/` has `__tests__`).
- **EmotionPad / haptics** — iOS Safari has no `navigator.vibrate`; pad is faithful but not identical.
- **AtmosphericField** — 4 full-viewport blurred blobs are costly on iOS Safari → needs `prefers-reduced-motion`
  fallback + reduced blur on small screens.
- **iOS Web Push** only works for **installed** PWAs (16.4+), not Safari tabs → gate notifications UI accordingly.
