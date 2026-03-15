# TriggerMap mobile build requirements

Required environment variables for Expo and EAS builds:

- `EXPO_PUBLIC_API_URL`: public backend base URL used by the mobile API client.

Notes:

- The mobile app reads `process.env.EXPO_PUBLIC_API_URL` at build time.
- If `EXPO_PUBLIC_API_URL` is missing during an EAS build, the app will show `TriggerMap API URL is not configured` at runtime.
- Example value: `https://triggermap-api.vercel.app`

Recommended preview build flow:

1. Ensure the EAS preview environment includes `EXPO_PUBLIC_API_URL`.
2. Run `npx expo-doctor` locally before building.
3. Start the preview build with the EAS CLI once validation passes.
