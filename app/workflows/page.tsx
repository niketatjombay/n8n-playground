'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api';

interface WorkflowEntry {
  n8nId: string;
  name: string;
  slug: string;
  type: 'main' | 'sub';
  webhookPath: string | null;
  active: boolean;
  lastDeployedAt: string | null;
  archived: boolean;
}

interface FolderNode {
  folder_id: string | null;
  folder_name: string;
  environment: string | null;
  folders: FolderNode[];
  workflows: WorkflowEntry[];
}

interface WorkflowsData {
  project_id: string;
  project_name: string;
  folders: FolderNode[];
}

const ENV_COLORS: Record<string, string> = {
  development: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  staging: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  production: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
};

function WorkflowRow({ wf }: { wf: WorkflowEntry }) {
  return (
    <div className={`px-4 py-2.5 flex items-center gap-3 text-sm ${wf.archived ? 'opacity-40' : ''}`}>
      <span className={`text-xs px-1.5 py-0.5 rounded border ${
        wf.active
          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
          : 'bg-zinc-800 text-zinc-500 border-zinc-700'
      }`}>
        {wf.active ? 'active' : 'off'}
      </span>
      <span className="text-zinc-200 flex-1 truncate">{wf.name}</span>
      {wf.archived && <span className="text-xs text-zinc-600 italic">archived</span>}
      {wf.type === 'sub' && <span className="text-xs text-zinc-500">sub</span>}
      <span className="font-mono text-xs text-zinc-600">{wf.n8nId}</span>
    </div>
  );
}

function FolderTree({ folder, depth = 0 }: { folder: FolderNode; depth?: number }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = folder.folders.length > 0 || folder.workflows.length > 0;
  const envClass = folder.environment ? ENV_COLORS[folder.environment] ?? null : null;
  const activeWorkflows = folder.workflows.filter(w => !w.archived);

  return (
    <div className={depth > 0 ? 'ml-4 border-l border-zinc-800 pl-3 mt-1' : ''}>
      <button
        onClick={() => setExpanded(e => !e)}
        className="flex items-center gap-2 py-1.5 text-sm w-full text-left hover:text-zinc-100 transition-colors"
        disabled={!hasChildren}
      >
        <span className="text-zinc-500 text-xs w-3">
          {hasChildren ? (expanded ? '▾' : '▸') : ' '}
        </span>
        <span className={`font-medium ${envClass ? 'text-zinc-300' : 'text-zinc-200'}`}>
          {folder.folder_name}
        </span>
        {folder.environment && envClass && (
          <span className={`text-xs px-1.5 py-0.5 rounded border ${envClass}`}>
            {folder.environment}
          </span>
        )}
        {activeWorkflows.length > 0 && (
          <span className="text-xs text-zinc-600 ml-auto">
            {activeWorkflows.length} workflow{activeWorkflows.length !== 1 ? 's' : ''}
          </span>
        )}
      </button>

      {expanded && hasChildren && (
        <div>
          {folder.workflows.length > 0 && (
            <div className="ml-3 border border-zinc-800 rounded-lg overflow-hidden mb-2 divide-y divide-zinc-800/50">
              {folder.workflows.map(wf => (
                <WorkflowRow key={wf.n8nId} wf={wf} />
              ))}
            </div>
          )}
          {folder.folders.map(child => (
            <FolderTree key={child.folder_id ?? child.folder_name} folder={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function WorkflowsPage() {
  const [data, setData] = useState<WorkflowsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(null);
    apiFetch('/api/workflows')
      .then(res => res.json())
      .then(json => {
        if (!json.success) throw new Error(json.error || 'Unknown error');
        setData(json.data);
      })
      .catch(err => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    setError(null);
    try {
      const res = await apiFetch('/api/sync', { method: 'POST' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Sync failed');
      const r = json.data;
      setSyncResult(`Synced — ${r.updated} updated, ${r.archived} archived`);
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100">Workflows</h1>
          <p className="text-sm text-zinc-400 mt-1">
            {data ? `${data.project_name} · ${data.project_id}` : 'Loading...'}
          </p>
        </div>

        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg text-zinc-200 transition-colors disabled:opacity-50"
        >
          {syncing ? 'Syncing...' : 'Sync'}
        </button>
      </div>

      {syncResult && (
        <div className="mt-3 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
          {syncResult}
        </div>
      )}

      {error && (
        <div className="mt-3 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {loading && (
        <div className="mt-6 space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-8 bg-zinc-900 border border-zinc-800 rounded animate-pulse" />
          ))}
        </div>
      )}

      {!loading && !error && data && (
        <div className="mt-6">
          {data.folders.map(folder => (
            <FolderTree key={folder.folder_id ?? folder.folder_name} folder={folder} depth={0} />
          ))}
        </div>
      )}
    </div>
  );
}
