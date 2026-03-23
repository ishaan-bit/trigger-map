import { requireAuth } from '../../../lib/auth.js';
import { manageUser } from '../../../lib/backendClient.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!(await requireAuth(req, res))) return;

  const { action, ownerId, email, password, name, subscription } = req.body || {};

  if (!action) {
    return res.status(400).json({ error: 'action is required' });
  }

  try {
    const result = await manageUser(action, { ownerId, email, password, name, subscription });
    return res.status(result.status).json(result.data);
  } catch (err) {
    console.error('User management proxy error:', err);
    return res.status(500).json({ error: err.message });
  }
}
