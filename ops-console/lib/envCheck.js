// Environment variable validation for ops-console.
// Imported by next.config.mjs to run at startup.

const REQUIRED_VARS = [
  'OPS_JWT_SECRET',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'BACKEND_URL',
  'BACKEND_INTERNAL_KEY',
];

// OPS_ADMIN_PASSWORD_HASH is special — has a dev fallback
const AUTH_VARS = ['OPS_ADMIN_PASSWORD_HASH'];

export function checkEnv() {
  const isDev = process.env.NODE_ENV !== 'production';
  const missing = [];

  for (const name of REQUIRED_VARS) {
    if (!process.env[name]) missing.push(name);
  }

  // Auth var: warn but allow dev fallback
  for (const name of AUTH_VARS) {
    if (!process.env[name]) {
      if (isDev) {
        console.warn(
          `⚠  ${name} is not set — using fallback dev password ("admin123"). DO NOT USE IN PRODUCTION.`
        );
      } else {
        missing.push(name);
      }
    }
  }

  if (missing.length > 0) {
    console.error(
      `\n❌  Missing required environment variables:\n${missing.map((v) => `   • ${v}`).join('\n')}\n\n` +
        `   Copy .env.local.example → .env.local and fill in values.\n`
    );
  }

  // Dev-only: log config presence (never log actual values)
  if (isDev) {
    const present = (name) => (process.env[name] ? 'present' : 'MISSING');
    console.log(
      `Auth env loaded: passwordHash=${present('OPS_ADMIN_PASSWORD_HASH')}, jwtSecret=${present('OPS_JWT_SECRET')}`
    );
  }
}
