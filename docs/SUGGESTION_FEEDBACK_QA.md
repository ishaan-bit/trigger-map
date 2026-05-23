# Suggestion Feedback QA

## Automated Checks

- `npm test` passed: 21 test files, 411 tests.
- `npm --prefix backend run build` passed.
- `npm --prefix web run build` passed.
- `node --check` passed for changed backend mode API/composer files.
- JSON validation passed for changed mobile config/i18n files.
- `npx expo config --type public` passed from `mobile/` and confirmed Android `versionCode: 157`.

## Known Check Limitation

- `npm --prefix mobile run lint` is currently blocked by existing React 19 `react-hooks/refs` lint errors in unrelated animation components such as `EmotionChip`, `EmotionGarden`, `StreakOrb`, `TriggerTile`, and pre-existing sections of `WeeklyReportScreen`/`EmotionPad`.
- Targeted lint on touched mobile files still reports the same pre-existing hook/ref rule family. The new conditional-hook issue introduced during the pass was fixed by removing the conditional `useMemo`.

## Manual QA Checklist

- Anonymous owner support added to mode feedback API through `deviceId`, matching existing `/api/actions` owner handling.
- Signed-in owner support preserved through bearer token and `user.id`.
- Move/Fuel feedback now waits for persistence, shows pending state, success acknowledgement, and a retryable error message.
- Rapid duplicate taps are blocked while a feedback request is pending.
- Feedback entries continue to use `triggermap:mode_feedback:{ownerId}` and still update `triggermap:mode_profile:{ownerId}` for Move/Fuel.
- LLM/HITL generation remains server-side in `modeComposer`; rule-based output is used only as fallback when stored/LLM output is unavailable.
- Perspective fallback now returns useful beginner/pattern content instead of an empty mode when LLM output is missing.
- Emotion capture remains on the same numeric valence/arousal/intensity ranges, with 9-step compatibility and clearer tick labels.

## Remaining Risks

- Full mobile lint remains noisy until the existing React 19 refs-rule violations are addressed across the app.
- Anonymous feedback attaches to the anonymous device owner and depends on existing account migration behavior if the user later signs in.
- AAB generation requires GitHub authentication/workflow dispatch after the commit is pushed.
