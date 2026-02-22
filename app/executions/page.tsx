'use client';

import { useState } from 'react';
import { useStatusFetch, StatusError } from '@/components/StatusFetcher';
import { apiFetch } from '@/lib/api';

const ENVIRONMENTS = ['development', 'staging', 'production'];

interface Execution {
  id: string;
  status: string;
  startedAt: string;
  stoppedAt: string | null;
  mode: string;
  duration: number | null;
}

function statusColor(status: string) {
  switch (status) {
    case 'success': return 'bg-emerald-500/10 text-emerald-400';
    case 'error': return 'bg-red-500/10 text-red-400';
    case 'waiting': return 'bg-amber-500/10 text-amber-400';
    default: return 'bg-blue-500/10 text-blue-400';
  }
}

function formatDuration(ms: number | null) {
  if (ms === null) return '--';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export default function ExecutionsPage() {
  const { slugs, statusLoading, statusError, refetchStatus } = useStatusFetch();
  const [slug, setSlug] = useState('');
  const [env, setEnv] = useState('development');
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadExecutions = async () => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/executions?slug=${slug}&env=${env}&limit=20`);
      const json = await res.json();
      if (json.success) {
        setExecutions(json.executions);
      } else {
        setError(json.error || 'Failed to load executions');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-100">Execution History</h1>
      <p className="text-sm text-zinc-400 mt-1">View recent workflow execution results</p>

      {statusError && <StatusError error={statusError} onRetry={refetchStatus} />}

      <div className="mt-8 max-w-2xl">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Workflow</label>
            <select value={slug} onChange={(e) => setSlug(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500">
              <option value="">Select a workflow</option>
              {slugs.map((s) => (<option key={s} value={s}>{s}</option>))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Environment</label>
            <select value={env} onChange={(e) => setEnv(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500">
              {ENVIRONMENTS.map((e) => (<option key={e} value={e}>{e}</option>))}
            </select>
          </div>
          <div className="flex items-end">
            <button onClick={loadExecutions} disabled={loading || !slug}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors">
              {loading ? 'Loading...' : 'Load'}
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-6 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400">{error}</div>
        )}

        {executions.length > 0 && (
          <div className="mt-6 bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left">
                  <th className="px-4 py-3 text-zinc-400 font-medium">ID</th>
                  <th className="px-4 py-3 text-zinc-400 font-medium">Status</th>
                  <th className="px-4 py-3 text-zinc-400 font-medium">Started</th>
                  <th className="px-4 py-3 text-zinc-400 font-medium">Duration</th>
                  <th className="px-4 py-3 text-zinc-400 font-medium">Mode</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {executions.map((exec) => (
                  <tr key={exec.id}>
                    <td className="px-4 py-2.5 text-zinc-300 font-mono text-xs">{exec.id}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs px-2 py-0.5 rounded ${statusColor(exec.status)}`}>{exec.status}</span>
                    </td>
                    <td className="px-4 py-2.5 text-zinc-400 text-xs">{new Date(exec.startedAt).toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-zinc-400 text-xs font-mono">{formatDuration(exec.duration)}</td>
                    <td className="px-4 py-2.5 text-zinc-500 text-xs">{exec.mode}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
