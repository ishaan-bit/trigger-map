import { requireInternalAuth } from '../../../../lib/internalAuth.js';
import enableCors from '../../../../lib/cors.js';

const ALLOWED_JOBS = {
  generateWeeklyReports: '../../../../jobs/generateWeeklyReports.js',
  generateLlmInsights: '../../../../jobs/generateLlmInsights.js',
  generateFreePass: '../../../../jobs/generateFreePass.js',
  generateAdaptiveModes: '../../../../jobs/generateAdaptiveModes.js',
};

const ALLOWED_LLM_MODELS = ['mistral', 'phi3', 'llama3', 'llama2', 'gemma', 'qwen2'];

export default async function handler(req, res) {
  if (enableCors(req, res)) return;
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  if (!requireInternalAuth(req, res)) return;

  const { job, force, minMoments, llmModel, ownerIds, personalize } = req.body || {};

  if (!job || !ALLOWED_JOBS[job]) {
    return res.status(400).json({ error: `Unknown or disallowed job: ${job}` });
  }

  // Temporarily override LLM_MODEL if provided (for LLM jobs)
  const prevModel = process.env.LLM_MODEL;
  if (llmModel && typeof llmModel === 'string' && ALLOWED_LLM_MODELS.includes(llmModel)) {
    process.env.LLM_MODEL = llmModel;
  }

  try {
    let result;

    if (job === 'generateWeeklyReports') {
      const { runGenerateWeeklyReports } = await import('../../../../jobs/generateWeeklyReports.js');
      result = await runGenerateWeeklyReports({ force: !!force, ownerIds, personalize: personalize !== false });
    } else if (job === 'generateLlmInsights') {
      const { runGenerateLlmInsights } = await import('../../../../jobs/generateLlmInsights.js');
      result = await runGenerateLlmInsights({
        force: !!force,
        minMoments: minMoments || 1,
        ownerIds,
      });
    } else if (job === 'generateFreePass') {
      const { runGenerateFreePass } = await import('../../../../jobs/generateFreePass.js');
      result = await runGenerateFreePass({
        force: !!force,
        minMoments: minMoments || 5,
        ownerIds,
      });
    } else if (job === 'generateAdaptiveModes') {
      const { runGenerateAdaptiveModes } = await import('../../../../jobs/generateAdaptiveModes.js');
      result = await runGenerateAdaptiveModes({
        force: !!force,
        ownerIds,
      });
    }

    return res.status(200).json({
      ok: true,
      job,
      llmModel: process.env.LLM_MODEL || 'default',
      result,
      executedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error(`Internal job execution error [${job}]:`, err);
    return res.status(500).json({
      error: 'Job execution failed',
      message: err.message,
      job,
    });
  } finally {
    // Restore original LLM_MODEL
    if (prevModel !== undefined) {
      process.env.LLM_MODEL = prevModel;
    } else if (llmModel) {
      delete process.env.LLM_MODEL;
    }
  }
}
