# What's new — Update v148

## The big one: app was stuck at the splash screen

If the app wasn't loading after the last update, this is fixed. The startup process had a few ways it could silently hang — a language preference loading from storage, a session check timing out, or a notification tap firing before the app was fully ready. All of these are now handled with proper fallbacks and a hard timeout so the app always loads.

---

## New features

### Share your week
From your Weekly Report, tap **"Share my week"** to generate a 7-day shareable link. The person who opens it sees your emotional tone for the week, top patterns, and an insight highlight — no raw notes, no personal details shared. The link expires automatically after 7 days.

The link now also appears as a proper clickable preview when shared on WhatsApp, iMessage, and Telegram.

### How-to guide built into the app
Under **Settings → About**, there's a new "How to use TriggerMap" button that opens a plain-English guide to every part of the app — the emotion pad, your baseline, drift, weekly insights, adaptive modes, and more. No more guessing what the numbers mean.

### New onboarding slide
A fourth slide has been added to onboarding that explains the 2-axis emotion scale in plain terms — what "bad to good" and "drained to charged" mean, and what your baseline is.

---

## Fixes and improvements

### Emotional trajectory display
The weekday labels in the emotional tone strip now show consistently as Mon/Tue/Wed across all devices, regardless of device language settings. Previously on some Android phones these were rendering as local-script characters.

### Keyboard covering the note textbox
Fixed the keyboard pushing up over the notes input when logging a moment.

### Fewer numbers in the weekly report
Removed raw decimal Y-axis numbers from the score trend chart. The direction (Trending up / Easing down / Holding steady) is now shown as a plain text label instead.

### Drift and internal signal display
The drift timeline now shows ↑ ↑↑ — ↓ ↓↓ arrows instead of raw numbers. The internal/external signal section now shows a plain description instead of a decimal score.

### Better tag options when logging
All 9 emotional zones now have 13–16 specific tags each (up from 6–8), with vocabulary that actually matches how each zone feels.

### Delete account page
The contact email on the Delete Account page has been corrected to qdenxp@gmail.com.

---

## Under the hood

- Build system fix: resolved a Google artifact repository error (403 on `gson:2.9.1`) that was causing Gradle builds to fail
- Removed a crashed startup crash caused by Sentry's native SDK being called without its native module being compiled in
