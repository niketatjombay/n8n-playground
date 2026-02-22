'use client';

import { useCallback, useEffect, useState } from 'react';
import { useStatusFetch } from '@/components/StatusFetcher';
import { apiFetch } from '@/lib/api';

interface ActivityEntry {
  timestamp: string;
  action: string;
  slug: string;
  env: string;
  result: string;
  details?: Record<string, string>;
}

const ACTIONS = ['all', 'deploy', 'promote', 'backup', 'activate', 'deactivate'];

export default function ActivityPage() {
  const { slugs } = useStatusFetch();
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [filterAction, setFilterAction] = useState('all');
  const [filterSlug, setFilterSlug] = useState('');
  const [loading, setLoading] = useState(true);

  const loadActivity = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams({ limit: '50' });
    if (filterAction !== 'all') params.set('action', filterAction);
    if (filterSlug) params.set('slug', filterSlug);

    apiFetch(`/api/activity?${params}`)
      .then(res => res.json())
      .then(json => {
        if (json.success) setEntries(json.entries);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [filterAction, filterSlug]);

  useEffect(() => {
    loadActivity();
  }, [loadActivity]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-100">Activity Log</h1>
      <p className="text-sm text-zinc-400 mt-1">Recent operations and their results</p>

      <div className="mt-8 max-w-4xl">
        <div className="flex gap-4 mb-4">
          <select value={filterAction} onChange={(e) => setFilterAction(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500">
            {ACTIONS.map(a => (<option key={a} value={a}>{a === 'all' ? 'All actions' : a}</option>))}
          </select>
          <select value={filterSlug} onChange={(e) => setFilterSlug(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500">
            <option value="">All workflows</option>
            {slugs.map(s => (<option key={s} value={s}>{s}</option>))}
          </select>
        </div>

        {loading ? (
          <div className="text-sm text-zinc-500">Loading...</div>
        ) : entries.length === 0 ? (
          <div className="text-sm text-zinc-500">No activity recorded yet</div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left">
                  <th className="px-4 py-3 text-zinc-400 font-medium">Time</th>
                  <th className="px-4 py-3 text-zinc-400 font-medium">Action</th>
                  <th className="px-4 py-3 text-zinc-400 font-medium">Workflow</th>
                  <th className="px-4 py-3 text-zinc-400 font-medium">Environment</th>
                  <th className="px-4 py-3 text-zinc-400 font-medium">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {entries.map((entry, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2.5 text-zinc-400 text-xs">{new Date(entry.timestamp).toLocaleString()}</td>
                    <td className="px-4 py-2.5 text-zinc-300 text-xs font-medium">{entry.action}</td>
                    <td className="px-4 py-2.5 text-zinc-300 text-xs font-mono">{entry.slug}</td>
                    <td className="px-4 py-2.5 text-zinc-400 text-xs">{entry.env}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        entry.result === 'success' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                      }`}>{entry.result}</span>
                    </td>
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
