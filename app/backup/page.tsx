'use client';

import { useState } from 'react';
import OperationLog from '@/components/OperationLog';
import { useStatusFetch, StatusError } from '@/components/StatusFetcher';

const ENVIRONMENTS = ['development', 'staging', 'production'];

export default function BackupPage() {
  const { slugs, statusLoading, statusError, refetchStatus } = useStatusFetch();
  const [env, setEnv] = useState('development');
  const [slug, setSlug] = useState('');
  const [loading, setLoading] = useState(false);
  const [steps, setSteps] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);

  const handleBackup = async () => {
    setLoading(true);
    setSteps([]);
    setError(null);
    try {
      const res = await fetch('/api/backup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ env, slug: slug || null }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        const resultSteps = json.data.steps || json.data;
        setSteps(Array.isArray(resultSteps) ? resultSteps : []);
      } else {
        setError(json.error || 'Backup failed');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-100">Backup Workflows</h1>
      <p className="text-sm text-zinc-400 mt-1">
        Download workflow JSON from n8n and save locally
      </p>

      {statusError && <StatusError error={statusError} onRetry={refetchStatus} />}
      {statusLoading && !statusError && (
        <div className="mt-6 text-sm text-zinc-500">Loading workflows...</div>
      )}

      <div className="mt-8 max-w-lg space-y-5">
        {/* Environment select */}
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

        {/* Optional workflow select */}
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">
            Workflow (optional)
          </label>
          <select
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">All workflows</option>
            {slugs.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {/* Backup button */}
        <button
          onClick={handleBackup}
          disabled={loading}
          className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
        >
          {loading ? 'Backing up...' : 'Backup'}
        </button>
      </div>

      {error && (
        <div className="mt-6 max-w-2xl bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {steps.length > 0 && (
        <div className="mt-2 max-w-2xl">
          <OperationLog steps={steps} />
        </div>
      )}
    </div>
  );
}
