import { requireAuth } from '../../../lib/auth.js';
import { sendPush } from '../../../lib/backendClient.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!(await requireAuth(req, res))) return;

  const { userIds, title, body } = req.body || {};

  if (!title || !title.trim()) return res.status(400).json({ error: 'title is required' });
  if (!body || !body.trim()) return res.status(400).json({ error: 'body is required' });
  if (!Array.isArray(userIds) || userIds.length === 0) return res.status(400).json({ error: 'At least one user must be selected' });

  try {
    const result = await sendPush({ userIds, title: title.trim(), body: body.trim() });
    return res.status(result.ok ? 200 : 502).json(result.data || { error: 'Backend error' });
  } catch (err) {
    console.error('Push proxy error:', err);
    return res.status(500).json({ error: err.message });
  }
}
