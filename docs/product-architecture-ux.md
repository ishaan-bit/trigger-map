# TriggerMap Product Architecture, End-to-End Flow, and UI/UX Specification

## 1. Purpose

This document describes the complete TriggerMap product experience from the user’s perspective while staying aligned to the current implementation. It covers:

- product goals and interaction model
- end-to-end journeys
- information architecture
- screen-by-screen UX requirements
- content and copy direction
- system touchpoints that shape the experience

It should be used as the working blueprint for product, design, QA, and engineering alignment.

## 2. Product Vision

TriggerMap helps a person quickly understand which situations trigger which emotions, without requiring long journaling sessions or heavy manual analysis.

The product promise is:

- capture moments in seconds
- spot repeated patterns automatically
- review the week in a readable, visual format
- start anonymously and upgrade to an account when ready

## 3. Core User Promise

Within one week of normal use, a user should be able to answer:

- What situations trigger me most often?
- Which emotions show up most frequently after those situations?
- When in the day do those emotional spikes happen?
- Is this week trending calmer or more strained than earlier in the week?

## 4. Target User Profiles

### 4.1 Self-Reflection User

Wants a very low-friction way to track emotions and triggers without writing long diary entries.

### 4.2 Pattern-Seeking User

Wants recurring weekly summaries and visual explanations, not just raw logs.

### 4.3 Privacy-Sensitive User

Wants to try the product before creating an account and values control over data export.

### 4.4 Premium-Intent User

Is willing to pay if the app reveals useful and actionable behavior patterns.

## 5. Product Experience Principles

1. Logging must feel faster than note-taking.
2. Reflection should happen after capture, not before it.
3. Empty states should still feel useful and motivating.
4. Anonymous use must still deliver genuine value.
5. Analytics and system complexity should stay invisible to the user.

## 6. Experience Architecture

The product breaks into five top-level experience pillars:

1. Entry and onboarding
2. Capture flow
3. Review flow
4. Retention and reminders
5. Identity, trust, and monetization

## 7. Navigation Model

### 7.1 Mobile Top-Level Navigation

The authenticated and anonymous post-onboarding experience uses five tabs:

- Log
- Timeline
- Report
- Premium
- Settings

### 7.2 Pre-Tab Routes

These sit outside the tab bar:

- App boot route
- Onboarding
- Login / registration
- Emotion capture route with selected trigger context

### 7.3 Web Navigation

The web client currently supports a simpler three-surface model:

- Log
- Timeline
- Weekly report

## 8. End-to-End User Flows

## 8.1 First Launch Flow

### Goal

Get the user into logging with minimal friction.

### Flow

1. User opens the app.
2. App initializes monitoring and analytics.
3. App stores the latest open timestamp.
4. App validates backend reachability.
5. App loads device ID, saved token, onboarding state, and reminder preference.
6. If onboarding is incomplete, user is routed to onboarding.
7. If onboarding is complete, user is routed directly to Log.

### UX Requirements

- loading state should be calm, brief, and not expose backend detail
- backend failure should not crash the app; it should surface a short availability message
- first-run routing should always be deterministic

## 8.2 Onboarding Flow

### Goal

Explain the product in under 20 seconds.

### Implemented Steps

- Tap a trigger to log what affected your day.
- Select how it affected you.
- Every week you’ll discover patterns in your triggers.

### UX Requirements

- strong headline explaining emotional trigger mapping
- only one primary action: Start logging
- no forced signup gate
- copy should emphasize speed and clarity over wellness jargon

### Exit Condition

Setting onboarding complete routes the user to the Log tab.

## 8.3 Anonymous Logging Flow

### Goal

Enable immediate value before account creation.

### Flow

1. User lands on Log.
2. User selects one trigger tile.
3. App routes to Emotion screen carrying selected trigger.
4. User selects one emotion.
5. User optionally adds a short note.
6. App saves the moment using device ID if no session token is present.
7. Backend normalizes data, stores the raw moment, updates aggregates, and returns optional feedback.
8. User sees either pattern insight, reflection prompt, or success state.
9. User can continue to Timeline.

### UX Requirements

- trigger selection must feel glanceable and fast
- emotion selection must be explicit; saving without an emotion is disabled
- note entry must remain optional and secondary
- post-save feedback must appear immediately in-context
- the next action should naturally push the user toward reviewing their timeline

## 8.4 Login / Registration Flow

### Goal

Upgrade anonymous use into persistent account ownership.

### Supported Modes

- email sign-in
- email registration
- Google sign-in

### Flow

1. User opens Login screen.
2. User selects sign-in or registration mode.
3. User completes credentials or Google auth.
4. Backend authenticates user and issues session token.
5. Backend migrates anonymous moments from `deviceId` to `user.id`.
6. App stores session token securely and loads the user profile.
7. User is routed to Timeline.

### UX Requirements

- copy must preserve anonymous access as a valid option
- registration should ask only for name, email, and password
- auth errors should be human-readable and modal enough to notice
- Google configuration edge cases should be explained with actionable but non-technical copy in production builds

## 8.5 Timeline Review Flow

### Goal

Let the user scan recent history and see emotional context in reverse chronological order.

### Flow

1. User opens Timeline tab.
2. Screen fetches moments for session user or device owner.
3. Screen displays chronological cards.
4. Empty state prompts user to log their first moment.
5. Error state offers retry.

### UX Requirements

- timeline should always show the most recent moments first
- each item should expose trigger, emotion, timestamp, and optional note
- the view should feel readable even with sparse entries
- load and error states must use the same visual language as the rest of the app

## 8.6 Weekly Report Flow

### Goal

Turn logs into interpretation.

### Flow

1. User opens Report tab.
2. App requests the weekly report for the active owner.
3. Backend loads last-seven-day aggregates and any stored AI insight.
4. Backend builds a structured report payload.
5. App renders insights, summaries, and charts.
6. Empty or low-data scenarios show motivational fallback messaging.

### UX Requirements

- the report must feel explanatory, not clinical
- a small amount of data should still produce understandable output
- cards should use plain-language labels such as Top trigger and Most stable day
- charts must support quick pattern recognition, not fine-grained analysis
- loading state should emphasize interpretation being built, not raw data loading

## 8.7 Subscription Flow

### Goal

Convert interested users after they understand the value of pattern insights.

### Flow

1. User opens Premium tab.
2. If unsigned, the user is redirected to Login.
3. If signed in, the app starts the Android billing flow.
4. Purchase token is sent to backend for verification.
5. Backend stores subscription state.
6. App updates local session subscription state.
7. Success alert confirms activation.

### UX Requirements

- premium value should be expressed in outcomes, not generic feature lists
- pricing should be visible before purchase intent deepens
- signed-out users should understand why login is required
- activation success must be immediate and unambiguous

## 8.8 Settings and Trust Flow

### Goal

Give the user control over identity, reminders, data export, and legal documents.

### Flow Areas

- Account: sign in / sign out
- Subscription: manage premium entry point
- Notifications: weekly reminder toggle
- Data: export logs
- Legal: privacy and terms
- About: version info

### UX Requirements

- settings should be grouped by intent, not by technical subsystem
- the export action should feel safe and reversible
- legal links should open outside the app when needed
- account state should clearly show Anonymous vs signed-in email identity

## 9. Screen-by-Screen UX Specification

## 9.1 Boot / Index Screen

### Purpose

Prepare the session and route the user.

### Required UI States

- loading: “Preparing TriggerMap”
- supporting message about loading session and health checks
- optional timeout message if startup drags on

### Success Routing

- onboarding incomplete -> Onboarding
- onboarding complete -> Log tab

## 9.2 Onboarding Screen

### Information Hierarchy

- Brand label
- Core promise headline
- Supporting subhead
- Three-step explanation cards
- One primary CTA

### Design Intent

- welcoming, clean, confident
- no clutter, no secondary decisions

## 9.3 Log Screen

### Information Hierarchy

- Quick log kicker
- “What triggered this moment?” headline
- support copy
- visual trigger grid

### Interaction Requirements

- one tap must move the user into the second half of the flow
- trigger choices should be visually balanced and easy to scan
- choices are finite and standardized across mobile and web

### Supported Trigger Vocabulary

- work
- social
- family
- health
- money
- alone
- travel
- exercise

## 9.4 Emotion Screen

### Information Hierarchy

- capture effect kicker
- “How did it affect you?” headline
- selected trigger label
- emotion chip grid
- optional note card
- save CTA
- post-save feedback card if available

### Interaction Requirements

- save disabled until emotion selected
- user can add note but should not need to
- feedback replaces the save flow rather than stacking additional complexity
- after save, clear next step should be “Go to timeline”

### Supported Emotion Vocabulary

- calm
- neutral
- anxious
- frustrated
- energized

## 9.5 Timeline Screen

### Information Hierarchy

- period kicker
- Timeline heading
- explanation subtitle
- ordered timeline cards or state card

### Card Content

- trigger label
- emotion label
- time
- note or note empty-state text

### UX State Rules

- load on focus so newly logged moments appear without manual refresh
- if no moments exist, explain what to do next
- if fetch fails, show retry inside a state card

## 9.6 Weekly Report Screen

### Information Hierarchy

- pattern summary kicker
- Weekly Report heading
- supporting subtitle
- insight cards
- AI summary card if present
- summary metric cards
- chart cards
- empty or error state when needed

### Core Metrics to Surface

- top trigger
- most common emotion
- volatility change
- most stable day
- dominant activity period

### Chart Requirements

- trigger frequency bar chart
- emotion distribution pie chart
- weekly emotion trajectory line chart

### UX Tone

- insight-forward, not data-heavy
- readable by someone who does not care about statistics
- interpretive labels should matter more than chart decoration

## 9.7 Premium Screen

### Information Hierarchy

- Premium kicker
- outcome-driven headline
- price range
- benefits list
- primary CTA

### Current Benefit Copy in Code

- Advanced pattern insights
- Monthly reports
- Behavioral experiments
- Data export

### Product Note

Current benefit copy overstates the implemented premium gating. Before release, premium packaging should be aligned to actual entitlement checks.

## 9.8 Settings Screen

### Sections

- Account
- Subscription
- Notifications
- Data
- Legal
- About

### UX Requirements

- each section should feel self-contained
- the reminder toggle must give immediate feedback on permission failures
- export should surface an error if sharing or download fails

## 10. Web Experience Specification

The web experience is a companion surface, not the flagship experience.

### Current Goals

- let a browser user log moments anonymously
- provide a lightweight timeline
- provide a lightweight weekly report
- support installable PWA behavior

### UX Characteristics

- fewer screens than mobile
- browser-local device identity only
- simplified visual analytics using CSS bars instead of chart libraries
- consistent vocabulary with mobile

## 11. Content and Copy Guidelines

### Voice

- clear
- grounded
- calm
- supportive without sounding clinical or overly therapeutic

### Avoid

- diagnostic language
- shame-based language
- overclaiming on mental health outcomes
- vague “AI magic” phrasing

### Favor

- direct labels
- short action text
- plain-language interpretations
- concrete next steps after errors or empty states

## 12. Visual System Specification

## 12.1 Current Palette

- background: `#0b1220`
- surface: `#121b2c`
- elevated: `#192538`
- text: `#f1f5fb`
- muted: `#95a6bd`
- accent: `#7bc9d8`
- success: `#88d498`
- warning: `#f0b96a`
- danger: `#f07f84`

### Visual Character

- dark, calm, cool-toned interface
- soft border treatment
- translucent card layering
- accent color reserved for highlights and section labels

## 12.2 Shape and Layout

- large rounded cards dominate the UI
- generous spacing between sections
- high-contrast headings with muted explanatory copy
- compact but touch-friendly buttons and chips

## 12.3 Motion and Feedback

Current motion is intentionally light. Feedback comes primarily through:

- navigation transition fade
- loading states
- success/error alerts
- chart rendering

Future design expansion should add subtle transition cues without slowing the fast-capture experience.

## 13. Accessibility Specification

Minimum expectations for future refinement:

- maintain strong contrast for text and primary actions
- ensure tap targets remain comfortably touchable
- expose emotion and trigger states clearly for screen readers
- do not rely on color alone for meaning in charts or chips
- provide readable empty and error state messages

## 14. Data and Privacy Experience

### User-Facing Privacy Model

- anonymous logging is supported by default
- account creation is optional for initial use
- logs can be exported
- privacy policy and terms are directly accessible from Settings

### UX Implications

- identity should not feel mandatory too early
- export should reinforce user trust and portability
- legal content should be one tap away from settings

## 15. Notification Experience Specification

### Reflection Reminder

Purpose: prompt the user to record the strongest moment of the day.

### Pattern Alert

Purpose: reinforce pattern discovery quickly after repeated behavior emerges.

### Weekly Insight Ready

Purpose: bring the user back when the weekly report is most valuable.

### Notification Guardrails

- no more than one notification per day
- do not send if user already logged today
- do not send if user opened the app recently

This keeps retention messaging from feeling intrusive.

## 16. Cross-Platform Consistency Requirements

The following must remain consistent across mobile, backend, and web:

- trigger vocabulary
- emotion vocabulary
- note length rules
- report metric names
- interpretation language where possible
- identity behavior for anonymous logging

## 17. Product Gaps Visible in the Current Implementation

1. Premium benefits are presented more broadly than entitlement logic currently enforces.
2. The report is weekly, but some premium copy refers to monthly reports.
3. Anonymous web and mobile identities are independent and do not converge unless the user authenticates on the same flow path.
4. The product has good pattern summaries, but no editing or deletion flow for moments yet.
5. The timeline is reverse chronological, but grouped rendering from the API is not yet fully leveraged by the mobile screen.

## 18. Recommended Product-Level Next Steps

1. Define a true premium entitlement matrix and gate features accordingly.
2. Add moment detail, edit, and delete interactions to improve trust and error recovery.
3. Align premium marketing copy with implemented functionality before app-store scale-up.
4. Add explicit streaks, weekly recap notifications, or experiments only if they strengthen the fast-capture core.
5. Introduce onboarding personalization only after the current first-session friction is measured.

## 19. QA Scenarios

### First-Time Experience

- fresh install routes to onboarding
- onboarding completion routes to Log
- backend unavailable produces non-fatal startup messaging

### Anonymous Capture

- user can log without signing in
- saved moment appears in timeline
- weekly report updates after enough data exists

### Auth Upgrade

- register with existing anonymous history migrates moments
- login with Google or email loads correct user state

### Reporting

- empty report state appears with no data
- charts and insight cards render with populated data
- AI summary renders only when available

### Settings and Trust

- reminder toggle handles permission denial
- export flow returns a shareable file
- legal pages open successfully

### Subscription

- signed-out premium tap routes to login
- signed-in purchase path stores subscription state

## 20. Release Readiness Checklist

- onboarding copy approved
- auth flows verified for both email and Google
- anonymous-to-auth migration tested
- weekly report accuracy spot-checked against raw logs
- notification permissions and suppression logic tested on device
- premium copy aligned with actual entitlements
- privacy policy and terms links verified in production environment
- analytics events validated for key funnel moments

## 21. One-Sentence Product Definition

TriggerMap is an anonymous-first emotional trigger tracking app that turns quick daily logs into readable weekly pattern insight.

## 22. Document Status

Status: current-state product and UX specification based on repository implementation as of March 13, 2026.
