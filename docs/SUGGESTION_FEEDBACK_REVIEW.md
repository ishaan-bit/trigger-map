# Suggestion Feedback Review

## Current Flow

- Move, Fuel, and Perspective adaptive modes are stored in Redis through `backend/services/modeStore.js`.
- Cached mode output is served by `backend/pages/api/modes/index.js`.
- Feedback is posted to `backend/pages/api/modes/feedback.js`, appended to `triggermap:mode_feedback:{ownerId}`, and applied to `triggermap:mode_profile:{ownerId}` for Move/Fuel likes and dislikes.
- LLM/HITL generation lives in `backend/ai/modeComposer.js` and is run by `backend/jobs/generateAdaptiveModes.js`, local worker `local-worker/batchOrchestrator.js`, and ops-console LLM controls.
- Rule-based Move/Fuel primitives live in `backend/knowledge/*Library.js`, `shared/knowledge/*Library.js`, and mobile mirrored shared knowledge.
- Mobile renders the adaptive mode UI inside `mobile/screens/WeeklyReportScreen.js`. It uses server mode items when present and local catalogue fallbacks for Move/Fuel.
- The emotion capture UI is the continuous `EmotionPad` in `mobile/components/EmotionPad.js`, with compatibility mappings in `shared/constants/emotions.js` and mobile mirrored constants.

## Broken Points

- Mode feedback currently requires an authenticated user. Anonymous owner/device flows used elsewhere, such as `/api/actions` and `/api/weeklyReport`, are not accepted by `/api/modes/feedback`.
- Mobile posts mode feedback with only a token. It does not include `deviceId`, swallows failures, and marks feedback as accepted before persistence succeeds.
- Mode feedback accepts only `helpful` and `not_helpful`, while the requested UX/model also allows close equivalents such as `tried`, `skipped`, `too_hard`, and `not_relevant`.
- Perspective has no client-side fallback and no backend fallback when LLM generation fails or no cached Perspective output exists, so the UI can settle into a warm/try-again style state instead of useful content.
- Move/Fuel adaptive generation already reads feedback/profile, but fallback behavior is split: server generation can return `null` on LLM failure while mobile only backfills display from local libraries.
- Emotion capture is continuous internally, but emitted values are quantised to 0.05 with only coarse visual anchors; users do not get enough explicit granularity cues.

## Minimal Fix Plan

- Preserve existing Redis keys and API contracts while widening `/api/modes/feedback` to accept authenticated users or anonymous `deviceId`, plus legacy/alternate request field names.
- Persist richer feedback metadata safely while keeping existing `mode`, `itemId`, `response`, and timestamp fields.
- Update mobile mode feedback to pass `deviceId`, await persistence, show pending/success/failure state, and avoid duplicate rapid taps.
- Add rule-based fallback mode output helpers on the backend so Move/Fuel/Perspective can return useful cached or generated fallback content when LLM output is unavailable.
- Keep LLM/HITL generation server-side and preserve the existing composer path.
- Add more granular emotion pad tick labels and 9-point compatible axis constants while keeping stored `valence`, `arousal`, `intensity`, and legacy emotion mappings compatible.
- Bump Android `versionCode` using the existing local EAS versioning setup.

## Files To Change

- `backend/services/modeStore.js`
- `backend/pages/api/modes/feedback.js`
- `backend/pages/api/modes/index.js`
- `backend/ai/modeComposer.js`
- `mobile/services/api.js`
- `mobile/screens/WeeklyReportScreen.js`
- `mobile/components/EmotionPad.js`
- `shared/constants/emotions.js`
- `mobile/shared/constants/emotions.js`
- `mobile/app.json`
- tests/docs as practical

## Risks

- Anonymous adaptive mode feedback can only attach to the anonymous `deviceId`; it will not automatically merge into a signed-in profile unless the existing account migration flow already handles that owner transition.
- Stored LLM mode outputs remain premium/UI-gated by the existing mobile screen; backend fallback availability should not be treated as a new entitlement surface.
- Perspective fallback is intentionally conservative and rule-based. It avoids fake LLM text, but it will be less nuanced than generated output.
- Emotion axis granularity is kept compatible by preserving numeric ranges and legacy mapping; analytics should continue to work, but old reports will not gain new tick labels retroactively.
