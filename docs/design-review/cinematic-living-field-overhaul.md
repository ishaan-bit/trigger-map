# UI overhaul — "The Living Field" (v1.0.13)

Date: 2026-06-25

## Direction

The app's soul is the emotional field (valence/arousal), but the old UI buried it
under flat dark cards on a static gradient with a few non-moving glow circles.
The overhaul makes that field literal and alive: **every screen sits inside a slow,
cinematic aurora whose hue is driven by the user's current emotional state**, and
foreground content floats on it as luminous glass that catches the light.

Chosen for maximum leverage with no backend change — the shell and shared
primitives cascade to every screen at once.

## What changed

**`AtmosphericField` (new)** — a drifting aurora: 4 large soft-edged colour blobs
(SVG radial gradients, since there's no blur lib) that translate/scale/breathe on
the Reanimated native thread over 26–39s loops, plus a radial vignette for depth.
Hue triad selected per dominant emotion (calm/neutral/anxious/frustrated/energized).
`pointerEvents="none"` throughout; ~0 JS-thread cost.

**`ScreenShell`** — replaced the 3 static breathing glow-orbs (which animated on
the JS thread, `useNativeDriver:false`) with the `AtmosphericField`. Deeper
space-black base gradient; atmosphere dialed down (0.6) until there's history.
→ cascades to Log, Timeline, Insights, Premium, Settings.

**`useEmotionalState`** — fixed the coordinate bug so `dominantEmotion` (which now
drives the whole atmosphere's colour) reflects real feelings instead of defaulting
new-model moments to neutral.

**`Card`** — luminous glass: top-down light sheen + a hairline highlight along the
top edge. Propagates to every Card across the app.

**`TriggerTile`** — cinematic: trigger-colour gradient fading into deep space, a
soft SVG halo behind a glowing icon disc, top highlight, springier press.

**Log header** — larger (30px/800) prompt with depth shadow, glowing kicker.

**Report** — dropped the redundant 0.05-opacity `report-bg.png`; the living field
now provides the backdrop.

## Notes / debt

- No blur library installed, so glass depth is built from layered gradients +
  vignette rather than true backdrop blur. A future `expo-blur` pass could deepen it.
- Aurora + per-tile SVG halos add ~14 SVG nodes on the Log screen; all static
  except the 4 native-thread aurora loops. Watch frame rate on low-end Android in
  the on-device pass.
- Cards remain near-opaque (0.96) so the aurora glows *around* content, not through
  it — keeps text contrast safe. Revisit if we want true translucency.
- Still owed: a real device pass to tune blob opacity/positions per screen height.
