import { getSessionCookie, verifySessionToken } from '../../../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = getSessionCookie(req);
  if (!token) {
    return res.status(401).json({ authenticated: false });
  }

  const payload = await verifySessionToken(token);
  if (!payload) {
    return res.status(401).json({ authenticated: false });
  }

  return res.status(200).json({ authenticated: true, role: payload.role });
}
