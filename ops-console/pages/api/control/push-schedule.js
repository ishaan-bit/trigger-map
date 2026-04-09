import { requireAuth } from '../../../lib/auth.js';
import { getPushSchedule, savePushSchedule } from '../../../lib/backendClient.js';

export default async function handler(req, res) {
  if (!(await requireAuth(req, res))) return;

  if (req.method === 'GET') {
    try {
      const result = await getPushSchedule();
      return res.status(200).json(result.data || { schedule: null });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  if (req.method === 'POST') {
    try {
      const result = await savePushSchedule(req.body);
      return res.status(200).json(result.data || { ok: true });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
