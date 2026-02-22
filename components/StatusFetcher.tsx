'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

export function useStatusFetch() {
  const [slugs, setSlugs] = useState<string[]>([]);
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);

  const fetchStatus = () => {
    setStatusLoading(true);
    setStatusError(null);
    apiFetch('/api/status')
      .then((res) => res.json())
      .then((json) => {
        if (json.success) {
          setSlugs(json.data.workflows.map((w: any) => w.slug));
          setWorkflows(json.data.workflows);
        } else {
          setStatusError(json.error || 'Failed to load workflow list');
        }
      })
      .catch((err) => setStatusError(err.message))
      .finally(() => setStatusLoading(false));
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  return { slugs, workflows, statusLoading, statusError, refetchStatus: fetchStatus };
}

export function StatusError({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="mt-6 max-w-lg bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
      <p className="text-sm text-red-400">{error}</p>
      <button
        onClick={onRetry}
        className="mt-2 px-3 py-1.5 text-xs font-medium rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors"
      >
        Retry
      </button>
    </div>
  );
}
