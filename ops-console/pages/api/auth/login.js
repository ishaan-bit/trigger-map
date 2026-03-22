import { verifyAdminPassword, createSessionToken, setSessionCookie } from '../../../lib/auth.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { password } = req.body || {};
  if (!password || typeof password !== 'string') {
    return res.status(400).json({ error: 'Password required' });
  }

  try {
    const valid = await verifyAdminPassword(password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    const token = await createSessionToken();
    setSessionCookie(res, token);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Login error:', err.message);
    if (err.message.includes('Auth config missing')) {
      return res.status(500).json({ error: 'Auth config missing — check server environment variables' });
    }
    return res.status(500).json({ error: 'Internal error' });
  }
}
