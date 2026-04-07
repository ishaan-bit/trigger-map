import { requireAuth } from '../../../lib/auth.js';
import { getJobStatus } from '../../../lib/workerClient.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!(await requireAuth(req, res))) return;

  const { job } = req.query;
  if (!job) return res.status(400).json({ error: 'job query param required' });

  try {
    const result = await getJobStatus(job);
    return res.status(result.status || 200).json(result.data || { status: 'unknown' });
  } catch (err) {
    return res.status(502).json({ error: err.message });
  }
}
