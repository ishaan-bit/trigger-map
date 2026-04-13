import Head from 'next/head';
import { useState } from 'react';

function StatusIcon({ status }) {
  if (status === 'passed') return <span style={{ color: 'var(--green)' }}>✓</span>;
  if (status === 'failed') return <span style={{ color: 'var(--red)' }}>✗</span>;
  return <span style={{ color: 'var(--yellow)' }}>○</span>;
}

function TestSuite({ suite }) {
  const [expanded, setExpanded] = useState(suite.status === 'failed');
  const passed = suite.tests.filter(t => t.status === 'passed').length;
  const failed = suite.tests.filter(t => t.status === 'passed' ? false : true).length;

  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 8, marginBottom: 8, overflow: 'hidden' }}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px',
          cursor: 'pointer', background: suite.status === 'failed' ? 'rgba(255,80,80,0.06)' : 'transparent',
          userSelect: 'none',
        }}
      >
        <StatusIcon status={suite.status} />
        <span style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 13 }}>{suite.file}</span>
        <span className="mono" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          {passed}/{suite.tests.length} passed
        </span>
        <span className="mono" style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
          {suite.duration}ms
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{expanded ? '▾' : '▸'}</span>
      </div>
      {expanded && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '6px 14px 10px' }}>
          {suite.tests.map((test, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '4px 0', fontSize: 13 }}>
              <StatusIcon status={test.status} />
              <div style={{ flex: 1 }}>
                <span>{test.name}</span>
                {test.duration != null && (
                  <span className="mono" style={{ fontSize: 11, color: 'var(--text-secondary)', marginLeft: 8 }}>{test.duration}ms</span>
                )}
                {test.failureMessage && (
                  <pre style={{
                    margin: '6px 0 2px', padding: 10, background: 'rgba(255,80,80,0.08)',
                    borderRadius: 6, fontSize: 12, whiteSpace: 'pre-wrap', lineHeight: 1.5,
                    color: 'var(--red)', maxHeight: 200, overflow: 'auto',
                  }}>{test.failureMessage}</pre>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TestsPage() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastRun, setLastRun] = useState(null);

  async function runTests() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/tests/run', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Test run failed');
      setData(json);
      setLastRun(new Date());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const failedSuites = data?.testSuites?.filter(s => s.status === 'failed') || [];
  const passedSuites = data?.testSuites?.filter(s => s.status !== 'failed') || [];

  return (
    <>
      <Head><title>Unit Tests — Ops Console</title></Head>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: 0 }}>Unit Tests</h2>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
            Run and monitor test suites across the codebase
          </p>
        </div>
        <button
          onClick={runTests}
          disabled={loading}
          className="ops-btn"
          style={{ padding: '8px 20px', fontSize: 14 }}
        >
          {loading ? '⟳ Running…' : '▶ Run Tests'}
        </button>
      </div>

      {error && (
        <div style={{
          padding: '12px 16px', background: 'rgba(255,80,80,0.1)', border: '1px solid var(--red)',
          borderRadius: 8, marginBottom: 16, fontSize: 13, color: 'var(--red)',
        }}>
          {error}
        </div>
      )}

      {loading && (
        <div style={{
          padding: 40, textAlign: 'center', color: 'var(--text-secondary)',
          fontSize: 14, fontFamily: 'var(--font-mono)',
        }}>
          Running vitest… this may take a few seconds
        </div>
      )}

      {data && !loading && (
        <>
          {/* Summary cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
            <div className="ops-card" style={{ padding: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: data.success ? 'var(--green)' : 'var(--red)' }}>
                {data.success ? 'PASS' : 'FAIL'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>Status</div>
            </div>
            <div className="ops-card" style={{ padding: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 700 }}>{data.numTotalTests}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>Total Tests</div>
            </div>
            <div className="ops-card" style={{ padding: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--green)' }}>{data.numPassedTests}</div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>Passed</div>
            </div>
            <div className="ops-card" style={{ padding: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: data.numFailedTests > 0 ? 'var(--red)' : 'var(--text-secondary)' }}>
                {data.numFailedTests}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>Failed</div>
            </div>
            <div className="ops-card" style={{ padding: 16, textAlign: 'center' }}>
              <div className="mono" style={{ fontSize: 28, fontWeight: 700 }}>
                {data.numTotalTestSuites}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>Test Suites</div>
            </div>
            <div className="ops-card" style={{ padding: 16, textAlign: 'center' }}>
              <div className="mono" style={{ fontSize: 28, fontWeight: 700 }}>
                {data.duration ? `${(data.duration / 1000).toFixed(1)}s` : '—'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>Duration</div>
            </div>
          </div>

          {/* Pass rate bar */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
              <span>Pass Rate</span>
              <span className="mono">
                {data.numTotalTests > 0 ? Math.round((data.numPassedTests / data.numTotalTests) * 100) : 0}%
              </span>
            </div>
            <div style={{ background: 'var(--bg-tertiary)', borderRadius: 4, height: 10, overflow: 'hidden' }}>
              <div style={{
                width: `${data.numTotalTests > 0 ? (data.numPassedTests / data.numTotalTests) * 100 : 0}%`,
                height: '100%',
                background: data.numFailedTests > 0 ? 'var(--yellow)' : 'var(--green)',
                borderRadius: 4,
                transition: 'width 0.3s',
              }} />
            </div>
          </div>

          {/* Failed suites first */}
          {failedSuites.length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h3 style={{ fontSize: 14, marginBottom: 8, color: 'var(--red)' }}>
                Failed ({failedSuites.length})
              </h3>
              {failedSuites.map((suite, i) => <TestSuite key={i} suite={suite} />)}
            </div>
          )}

          {/* Passed suites */}
          <div>
            <h3 style={{ fontSize: 14, marginBottom: 8, color: 'var(--green)' }}>
              Passed ({passedSuites.length})
            </h3>
            {passedSuites.map((suite, i) => <TestSuite key={i} suite={suite} />)}
          </div>

          {lastRun && (
            <div style={{ marginTop: 16, fontSize: 12, color: 'var(--text-secondary)', textAlign: 'right' }}>
              Last run: {lastRun.toLocaleTimeString()}
            </div>
          )}
        </>
      )}

      {!data && !loading && !error && (
        <div style={{
          padding: 60, textAlign: 'center', color: 'var(--text-secondary)',
          border: '1px dashed var(--border)', borderRadius: 12,
        }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⊘</div>
          <div style={{ fontSize: 14 }}>Click <strong>Run Tests</strong> to execute the test suite</div>
          <div style={{ fontSize: 12, marginTop: 6 }}>
            Tests run against the algorithm code (emotions, signals, RAG, decomposition, etc.)
          </div>
        </div>
      )}
    </>
  );
}
