import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';

// bcrypt hash of "admin123" — used ONLY when OPS_ADMIN_PASSWORD_HASH is unset in dev mode
const DEV_FALLBACK_HASH = '$2b$12$QCRUq.QiGhybpLF1pAVf6OyhJoZ6imb5Ajax8dUz9HcpTmIlB8/ay';

const COOKIE_NAME = 'ops_session';
const TOKEN_LIFETIME = '12h';

function getPasswordHash() {
  const hash = process.env.OPS_ADMIN_PASSWORD_HASH;
  if (hash) return hash;
  if (process.env.NODE_ENV !== 'production') {
    return DEV_FALLBACK_HASH;
  }
  return null;
}

function getSecret() {
  const raw = process.env.OPS_JWT_SECRET;
  if (!raw) throw new Error('OPS_JWT_SECRET not configured');
  return new TextEncoder().encode(raw);
}

export async function verifyAdminPassword(password) {
  const hash = getPasswordHash();
  if (!hash) throw new Error('Auth config missing: OPS_ADMIN_PASSWORD_HASH is not set');
  return bcrypt.compare(password, hash);
}

export async function createSessionToken() {
  return new SignJWT({ role: 'ops-admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(TOKEN_LIFETIME)
    .sign(getSecret());
}

export async function verifySessionToken(token) {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    return payload.role === 'ops-admin' ? payload : null;
  } catch {
    return null;
  }
}

export function getSessionCookie(req) {
  const cookieHeader = req.headers.cookie || '';
  const match = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  return match ? match[1] : null;
}

export function setSessionCookie(res, token) {
  res.setHeader('Set-Cookie', [
    `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200${
      process.env.NODE_ENV === 'production' ? '; Secure' : ''
    }`,
  ]);
}

export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', [
    `${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0`,
  ]);
}

// Protect API routes: returns true if authorized, sends 401 if not
export async function requireAuth(req, res) {
  const token = getSessionCookie(req);
  if (!token) {
    res.status(401).json({ error: 'Not authenticated' });
    return false;
  }
  const payload = await verifySessionToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Invalid session' });
    return false;
  }
  return true;
}
