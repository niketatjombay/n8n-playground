'use client';

import { useEffect, useState } from 'react';

const ENVIRONMENTS = ['development', 'staging', 'production'];

interface TestResponse {
  success: boolean;
  statusCode?: number;
  webhookUrl?: string;
  data?: unknown;
  error?: string;
}

export default function TestPage() {
  const [slug, setSlug] = useState('');
  const [env, setEnv] = useState('development');
  const [payload, setPayload] = useState('{\n  \n}');
  const [slugs, setSlugs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<TestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/status')
      .then((res) => res.json())
      .then((json) => {
        if (json.success) {
          setSlugs(json.data.workflows.map((w: any) => w.slug));
        }
      })
      .catch(() => {});
  }, []);

  const handleTrigger = async () => {
    if (!slug) return;
    setLoading(true);
    setResponse(null);
    setError(null);

    let parsedPayload = null;
    try {
      const trimmed = payload.trim();
      if (trimmed) {
        parsedPayload = JSON.parse(trimmed);
      }
    } catch {
      setError('Invalid JSON payload');
      setLoading(false);
      return;
    }

    try {
      const res = await fetch('/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, env, payload: parsedPayload }),
      });
      const json = await res.json();
      setResponse(json);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const statusCodeColor = (code?: number) => {
    if (!code) return 'text-zinc-400';
    if (code >= 200 && code < 300) return 'text-emerald-400';
    if (code >= 400) return 'text-red-400';
    return 'text-amber-400';
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-100">Test Webhook</h1>
      <p className="text-sm text-zinc-400 mt-1">
        Trigger a workflow webhook with a test payload
      </p>

      <div className="mt-8 max-w-2xl space-y-5">
        <div className="grid grid-cols-2 gap-4">
          {/* Workflow slug */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              Workflow
            </label>
            <select
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Select a workflow</option>
              {slugs.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* Environment */}
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">
              Environment
            </label>
            <select
              value={env}
              onChange={(e) => setEnv(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            >
              {ENVIRONMENTS.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* JSON payload */}
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">
            JSON Payload
          </label>
          <textarea
            value={payload}
            onChange={(e) => setPayload(e.target.value)}
            rows={10}
            spellCheck={false}
            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-sm text-zinc-200 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 resize-y"
          />
        </div>

        {/* Trigger button */}
        <button
          onClick={handleTrigger}
          disabled={loading || !slug}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
        >
          {loading ? 'Triggering...' : 'Trigger'}
        </button>
      </div>

      {error && (
        <div className="mt-6 max-w-2xl bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Response display */}
      {response && (
        <div className="mt-6 max-w-2xl bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800 flex items-center gap-4">
            <h3 className="text-sm font-medium text-zinc-300">Response</h3>
            {response.statusCode && (
              <span
                className={`text-sm font-mono font-bold ${statusCodeColor(
                  response.statusCode
                )}`}
              >
                {response.statusCode}
              </span>
            )}
          </div>

          <div className="px-4 py-3 space-y-3">
            {response.webhookUrl && (
              <div>
                <span className="text-xs text-zinc-500">URL:</span>
                <p className="text-xs font-mono text-zinc-400 mt-0.5 break-all">
                  {response.webhookUrl}
                </p>
              </div>
            )}

            <div>
              <span className="text-xs text-zinc-500">Body:</span>
              <pre className="mt-1 bg-zinc-950 border border-zinc-800 rounded-lg px-4 py-3 text-xs font-mono text-zinc-300 overflow-x-auto max-h-96 overflow-y-auto">
                {response.data
                  ? JSON.stringify(response.data, null, 2)
                  : response.error
                  ? response.error
                  : 'No response body'}
              </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
