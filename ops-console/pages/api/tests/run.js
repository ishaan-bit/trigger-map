import { exec } from 'child_process';
import path from 'path';

export default function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rootDir = path.resolve(process.cwd(), '..');
  const cmd = 'npx vitest run --reporter=json 2>&1';

  exec(cmd, { cwd: rootDir, timeout: 120_000, maxBuffer: 5 * 1024 * 1024 }, (error, stdout) => {
    try {
      // vitest --reporter=json outputs JSON to stdout, even on failure
      // The JSON may be preceded by some non-JSON output, so find the JSON block
      const jsonStart = stdout.indexOf('{');
      const jsonEnd = stdout.lastIndexOf('}');

      if (jsonStart === -1 || jsonEnd === -1) {
        return res.status(500).json({
          error: 'Could not parse test output',
          raw: stdout.slice(0, 2000),
        });
      }

      const jsonStr = stdout.slice(jsonStart, jsonEnd + 1);
      const result = JSON.parse(jsonStr);

      return res.status(200).json({
        success: result.success,
        numTotalTests: result.numTotalTests,
        numPassedTests: result.numPassedTests,
        numFailedTests: result.numFailedTests,
        numTotalTestSuites: result.numTotalTestSuites,
        numPassedTestSuites: result.numPassedTestSuites,
        numFailedTestSuites: result.numFailedTestSuites,
        startTime: result.startTime,
        duration: Date.now() - result.startTime,
        testSuites: (result.testResults || []).map((suite) => ({
          file: suite.name?.replace(/^.*?trigger-map[\\/]/, '') || suite.name,
          status: suite.status,
          duration: suite.endTime - suite.startTime,
          tests: (suite.assertionResults || []).map((t) => ({
            name: t.fullName || t.title,
            status: t.status,
            duration: t.duration,
            failureMessage: t.failureMessages?.join('\n') || null,
          })),
        })),
      });
    } catch (parseError) {
      return res.status(500).json({
        error: 'Failed to parse test results',
        raw: stdout.slice(0, 2000),
      });
    }
  });
}
