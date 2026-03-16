import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import { SignJWT, jwtVerify } from "jose";
import { hgetallObject, pipeline, redis, redisKey } from "./redisClient.js";

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID?.trim());
const encoder = new TextEncoder();
const sessionLifetimeSeconds = 60 * 60 * 24 * 30;

function sessionSecret() {
  if (!process.env.JWT_SECRET) {
    throw new Error("JWT_SECRET missing");
  }

  return encoder.encode(process.env.JWT_SECRET);
}

function userKey(userId) {
  return redisKey("user", userId);
}

function emailLookupKey(email) {
  return redisKey("userEmail", email.toLowerCase());
}

function googleLookupKey(googleSub) {
  return redisKey("userGoogle", googleSub);
}

function sessionKey(sessionId) {
  return redisKey("session", sessionId);
}

function serializeUser(record) {
  if (!record?.id) {
    return null;
  }

  return {
    id: record.id,
    email: record.email || null,
    name: record.name || "QuietDen User",
    provider: record.provider || "email",
    createdAt: record.createdAt,
  };
}

export async function hashPassword(password) {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}

export async function getUserById(userId) {
  return serializeUser(await hgetallObject(userKey(userId)));
}

export async function getRawUserByEmail(email) {
  const userId = await redis(["GET", emailLookupKey(email)]);
  if (!userId) {
    return null;
  }

  return hgetallObject(userKey(userId));
}

export async function registerEmailUser({ email, password, name }) {
  const normalizedEmail = email.toLowerCase();
  const existingUserId = await redis(["GET", emailLookupKey(normalizedEmail)]);

  if (existingUserId) {
    throw new Error("EMAIL_EXISTS");
  }

  const userId = randomUUID();
  const passwordHash = await hashPassword(password);
  const createdAt = new Date().toISOString();

  await pipeline([
    [
      "HSET",
      userKey(userId),
      "id",
      userId,
      "email",
      normalizedEmail,
      "name",
      name,
      "passwordHash",
      passwordHash,
      "provider",
      "email",
      "createdAt",
      createdAt,
    ],
    ["SET", emailLookupKey(normalizedEmail), userId],
  ]);

  return getUserById(userId);
}

export async function loginEmailUser({ email, password }) {
  const userRecord = await getRawUserByEmail(email.toLowerCase());

  if (!userRecord?.passwordHash) {
    throw new Error("INVALID_CREDENTIALS");
  }

  const passwordValid = await verifyPassword(password, userRecord.passwordHash);
  if (!passwordValid) {
    throw new Error("INVALID_CREDENTIALS");
  }

  return serializeUser(userRecord);
}

export async function verifyGoogleIdToken(idToken) {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!clientId) {
    throw new Error("GOOGLE_AUTH_NOT_CONFIGURED");
  }

  // Accept tokens issued to the Web client (implicit/web flow) or the
  // Android client (authorization-code + PKCE flow from mobile).
  const allowedAudiences = [clientId];
  const androidId = process.env.GOOGLE_ANDROID_CLIENT_ID?.trim();
  if (androidId) {
    allowedAudiences.push(androidId);
  }

  let ticket;
  try {
    ticket = await googleClient.verifyIdToken({
      idToken,
      audience: allowedAudiences,
    });
  } catch (err) {
    console.error("Google token verification failed:", err.message);
    throw new Error("INVALID_GOOGLE_TOKEN");
  }

  const payload = ticket.getPayload();
  if (!payload?.sub || !payload.email) {
    throw new Error("INVALID_GOOGLE_TOKEN");
  }

  return payload;
}

export async function loginGoogleUser({ idToken }) {
  const payload = await verifyGoogleIdToken(idToken);
  const googleSub = payload.sub;
  const existingUserId = await redis(["GET", googleLookupKey(googleSub)]);
  const createdAt = new Date().toISOString();

  if (existingUserId) {
    return getUserById(existingUserId);
  }

  const email = payload.email.toLowerCase();
  const byEmail = await redis(["GET", emailLookupKey(email)]);
  const userId = byEmail || randomUUID();

  await pipeline([
    [
      "HSET",
      userKey(userId),
      "id",
      userId,
      "email",
      email,
      "name",
      payload.name || "QuietDen User",
      "provider",
      "google",
      "googleSub",
      googleSub,
      "createdAt",
      createdAt,
    ],
    ["SET", emailLookupKey(email), userId],
    ["SET", googleLookupKey(googleSub), userId],
  ]);

  return getUserById(userId);
}

export async function createSession(user) {
  const sessionId = randomUUID();
  const token = await new SignJWT({ sid: sessionId, email: user.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${sessionLifetimeSeconds}s`)
    .sign(sessionSecret());

  await pipeline([
    [
      "HSET",
      sessionKey(sessionId),
      "sessionId",
      sessionId,
      "userId",
      user.id,
      "createdAt",
      new Date().toISOString(),
      "expiresAt",
      String(Date.now() + sessionLifetimeSeconds * 1000),
    ],
    ["EXPIRE", sessionKey(sessionId), String(sessionLifetimeSeconds)],
  ]);

  return token;
}

export async function validateSession(token) {
  const verified = await jwtVerify(token, sessionSecret());
  const sessionId = verified.payload.sid;

  if (!sessionId) {
    throw new Error("INVALID_SESSION");
  }

  const session = await hgetallObject(sessionKey(sessionId));
  if (!session?.userId) {
    throw new Error("SESSION_NOT_FOUND");
  }

  const user = await getUserById(session.userId);
  if (!user) {
    throw new Error("USER_NOT_FOUND");
  }

  return user;
}

export async function getSubscription(userId) {
  return hgetallObject(redisKey("subscription", userId));
}

export async function isFirstAiFreeAvailable(userId) {
  const claimed = await redis(["GET", redisKey("first_ai_claimed", userId)]);
  return !claimed;
}

export async function markFirstAiFreeUsed(userId) {
  await redis(["SET", redisKey("first_ai_claimed", userId), "1"]);
}