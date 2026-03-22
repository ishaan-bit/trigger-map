import { requireAuth } from '../../../lib/auth.js';
import { getWorkerHealth } from '../../../lib/workerClient.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  if (!(await requireAuth(req, res))) return;

  const result = await getWorkerHealth();
  return res.status(200).json(result);
}
