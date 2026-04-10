import { requireAuth } from '../../../lib/auth.js';
import { getLlmBatchStatus, cancelLlmBatch } from '../../../lib/workerClient.js';

export default async function handler(req, res) {
  if (req.method === 'GET') {
    if (!(await requireAuth(req, res))) return;
    try {
      const result = await getLlmBatchStatus();
      return res.status(200).json(result.data || { status: 'unknown' });
    } catch (err) {
      return res.status(502).json({ error: err.message });
    }
  }

  if (req.method === 'DELETE') {
    if (!(await requireAuth(req, res))) return;
    try {
      const result = await cancelLlmBatch();
      return res.status(result.data?.ok ? 200 : 400).json(result.data || { error: 'No response' });
    } catch (err) {
      return res.status(502).json({ error: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
