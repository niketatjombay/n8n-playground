'use client';

import { useState } from 'react';
import { useStatusFetch, StatusError } from '@/components/StatusFetcher';

const ENVIRONMENTS = ['development', 'staging', 'production'];

export default function ActivatePage() {
  const { slugs, workflows, statusLoading, statusError, refetchStatus } = useStatusFetch();
  const [slug, setSlug] = useState('');
  const [env, setEnv] = useState('development');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const currentStatus = (() => {
    if (!slug || !workflows.length) return null;
    const wf = workflows.find((w: any) => w.slug === slug);
    if (!wf) return null;
    const envData = wf.environments?.[env];
    if (!envData || envData.isTodo) return null;
    return envData;
  })();

  const handleToggle = async (deactivate: boolean) => {
    if (!slug) return;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const res = await fetch('/api/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, env, deactivate }),
      });
      const json = await res.json();
      if (json.success) {
        setResult(json);
        refetchStatus();
      } else {
        setError(json.error || 'Operation failed');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-100">Activate / Deactivate</h1>
      <p className="text-sm text-zinc-400 mt-1">
        Toggle workflow activation status in n8n
      </p>

      {statusError && <StatusError error={statusError} onRetry={refetchStatus} />}
      {statusLoading && !statusError && <div className="mt-6 text-sm text-zinc-500">Loading workflows...</div>}

      <div className="mt-8 max-w-lg space-y-5">
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">Workflow</label>
          <select
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Select a workflow</option>
            {slugs.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">Environment</label>
          <select
            value={env}
            onChange={(e) => setEnv(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          >
            {ENVIRONMENTS.map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
        </div>

        {currentStatus && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3">
            <span className="text-sm text-zinc-400">Current status: </span>
            <span className={`text-sm font-medium ${currentStatus.active ? 'text-emerald-400' : 'text-zinc-500'}`}>
              {currentStatus.active ? 'Active' : 'Inactive'}
            </span>
            <span className="text-xs text-zinc-600 ml-2">
              (n8nId: {currentStatus.n8nId?.slice(0, 12)})
            </span>
          </div>
        )}

        <div className="flex gap-3">
          <button
            onClick={() => handleToggle(false)}
            disabled={loading || !slug || !currentStatus}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
          >
            {loading ? 'Processing...' : 'Activate'}
          </button>
          <button
            onClick={() => handleToggle(true)}
            disabled={loading || !slug || !currentStatus}
            className="px-5 py-2.5 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
          >
            {loading ? 'Processing...' : 'Deactivate'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-6 max-w-2xl bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-6 max-w-2xl bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-4 py-3 text-sm text-emerald-400">
          Workflow {result.slug} is now {result.active ? 'active' : 'inactive'} in {result.env}
        </div>
      )}
    </div>
  );
}
