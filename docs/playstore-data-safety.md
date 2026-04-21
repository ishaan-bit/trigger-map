# TriggerMap Play Store Data Safety

## Data collected

- **Device or other IDs**: an app-generated UUID (not IMEI or Android ID) created per install and stored on-device. Transmitted to TriggerMap servers on every API call to link anonymous moment logs before account creation. Also collected automatically by PostHog (analytics distinct ID) and Sentry (crash report install identifier). Required for app functionality.
- **Email address**: collected only when a user creates an account or signs in.
- **User content**: trigger logs, emotions, notes, reminders, and weekly insights entered by the user.
- **App activity**: subscription verification state and feature usage events for analytics (PostHog). Crash logs and diagnostics (Sentry).

## Data sharing

- No data is sold.
- Data is shared only with service providers required to operate the app: Upstash Redis (storage), Vercel (hosting), Google Sign-In (authentication), Google Play Billing (subscription verification), PostHog (analytics — receives device distinct ID and usage events), and Sentry (crash reporting — receives device ID and crash logs).

## Security practices

- Data is encrypted in transit over HTTPS.
- Authentication sessions are signed server-side.
- Users can request export or deletion support through the privacy contact.

## Account deletion and support

- Privacy contact: support@triggermap.app
- Users can request account deletion and data export by contacting support.

## Google Play Data Safety form checklist

Data types that must be declared:
- [x] Device or other IDs — collected, not ephemeral, required, purpose: App functionality + Analytics + Crash reporting
- [x] Email address — collected, not ephemeral, optional (anonymous use allowed), purpose: Account management
- [x] User content (app activity / in-app actions) — collected, not ephemeral, required, purpose: App functionality
- [x] Crash logs — collected by Sentry, purpose: Analytics / App functionality
- [x] App interactions — collected by PostHog, purpose: Analytics