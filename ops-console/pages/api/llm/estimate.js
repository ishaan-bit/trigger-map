import { requireAuth } from '../../../lib/auth.js';
import { estimateLlmBatch } from '../../../lib/workerClient.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!(await requireAuth(req, res))) return;

  const { pairs, config } = req.body || {};
  if (!Array.isArray(pairs) || !config) {
    return res.status(400).json({ error: 'pairs and config required' });
  }

  try {
    const result = await estimateLlmBatch({ pairs, config });
    return res.status(200).json(result.data || { error: 'No response from worker' });
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
}
