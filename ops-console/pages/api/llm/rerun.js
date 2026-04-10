import { requireAuth } from '../../../lib/auth.js';
import { rerunLlmBatch } from '../../../lib/workerClient.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!(await requireAuth(req, res))) return;

  const { pairIds, maxRuntimeMinutes } = req.body || {};
  if (!Array.isArray(pairIds) || !pairIds.length) {
    return res.status(400).json({ error: 'pairIds (array) required' });
  }

  try {
    const result = await rerunLlmBatch({ pairIds, maxRuntimeMinutes: maxRuntimeMinutes || 120 });
    const status = result.status === 202 ? 202 : result.ok ? 200 : 502;
    return res.status(status).json(result.data || { error: 'No response from worker' });
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
}
