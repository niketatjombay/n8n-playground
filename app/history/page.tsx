'use client';

import { useState } from 'react';
import { useStatusFetch, StatusError } from '@/components/StatusFetcher';
import { apiFetch } from '@/lib/api';

const ENVIRONMENTS = ['development', 'staging', 'production'];

interface Commit {
  hash: string;
  subject: string;
  author: string;
  date: string;
}

export default function HistoryPage() {
  const { slugs, statusLoading, statusError, refetchStatus } = useStatusFetch();
  const [slug, setSlug] = useState('');
  const [env, setEnv] = useState('development');
  const [commits, setCommits] = useState<Commit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedCommit, setExpandedCommit] = useState<string | null>(null);
  const [versionContent, setVersionContent] = useState<any>(null);

  const loadHistory = async () => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    setCommits([]);
    setExpandedCommit(null);
    setVersionContent(null);
    try {
      const res = await apiFetch(`/api/history?slug=${slug}&env=${env}&limit=20`);
      const json = await res.json();
      if (json.success) {
        setCommits(json.commits || []);
      } else {
        setError(json.error || 'Failed to load history');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const viewVersion = async (hash: string) => {
    if (expandedCommit === hash) {
      setExpandedCommit(null);
      setVersionContent(null);
      return;
    }
    setExpandedCommit(hash);
    try {
      const res = await apiFetch(`/api/history?slug=${slug}&env=${env}&commit=${hash}`);
      const json = await res.json();
      if (json.success) {
        setVersionContent(json.content);
      }
    } catch {}
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-100">Version History</h1>
      <p className="text-sm text-zinc-400 mt-1">View past versions of workflow files</p>

      {statusError && <StatusError error={statusError} onRetry={refetchStatus} />}

      <div className="mt-8 max-w-3xl">
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
            <button onClick={loadHistory} disabled={loading || !slug}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors">
              {loading ? 'Loading...' : 'Load History'}
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-6 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400">{error}</div>
        )}

        {commits.length > 0 && (
          <div className="mt-6 space-y-2">
            {commits.map((commit) => (
              <div key={commit.hash} className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
                <button
                  onClick={() => viewVersion(commit.hash)}
                  className="w-full px-4 py-3 flex items-center gap-4 text-left hover:bg-zinc-800/50 transition-colors"
                >
                  <span className="text-xs font-mono text-blue-400">{commit.hash.slice(0, 7)}</span>
                  <span className="text-sm text-zinc-200 flex-1">{commit.subject}</span>
                  <span className="text-xs text-zinc-500">{new Date(commit.date).toLocaleDateString()}</span>
                </button>
                {expandedCommit === commit.hash && versionContent && (
                  <div className="border-t border-zinc-800 px-4 py-3">
                    <pre className="text-xs font-mono text-zinc-400 overflow-x-auto max-h-96 overflow-y-auto">
                      {JSON.stringify(versionContent, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {commits.length === 0 && !loading && !error && slug && (
          <div className="mt-6 text-sm text-zinc-500">No history found for this workflow</div>
        )}
      </div>
    </div>
  );
}
