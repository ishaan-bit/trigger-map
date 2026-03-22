// Internal API authentication middleware.
// All /api/internal/* endpoints must call this.
// Protected by a shared secret (INTERNAL_API_KEY env var).

export function verifyInternalKey(req) {
  const key = req.headers['x-internal-key'];
  const expected = process.env.INTERNAL_API_KEY;
  if (!expected) return false;
  if (!key) return false;
  // Constant-time comparison to prevent timing attacks
  if (key.length !== expected.length) return false;
  let result = 0;
  for (let i = 0; i < key.length; i++) {
    result |= key.charCodeAt(i) ^ expected.charCodeAt(i);
  }
  return result === 0;
}

export function requireInternalAuth(req, res) {
  if (!verifyInternalKey(req)) {
    res.status(403).json({ error: 'Forbidden — invalid internal key' });
    return false;
  }
  return true;
}
