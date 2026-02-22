'use client';

import { useEffect, useState } from 'react';
import EnvironmentBadge from '@/components/EnvironmentBadge';

interface FlatWorkflow {
  id: string;
  name: string;
  active: boolean;
  nodeCount: number;
  updatedAt: string;
}

interface GroupedWorkflow extends FlatWorkflow {
  slug?: string;
  type?: string;
  subSlug?: string;
}

type GroupedData = {
  count: number;
  groups: Record<string, GroupedWorkflow[]>;
};

type FlatData = {
  count: number;
  workflows: FlatWorkflow[];
};

const ENV_ORDER = ['development', 'staging', 'production', 'untracked'];

export default function WorkflowsPage() {
  const [grouped, setGrouped] = useState(true);
  const [groupedData, setGroupedData] = useState<GroupedData | null>(null);
  const [flatData, setFlatData] = useState<FlatData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    development: true,
    staging: true,
    production: true,
    untracked: false,
  });

  useEffect(() => {
    setLoading(true);
    setError(null);
    const url = grouped ? '/api/workflows?grouped=true' : '/api/workflows';
    fetch(url)
      .then((res) => res.json())
      .then((json) => {
        if (!json.success) {
          setError(json.error || 'Unknown error');
          return;
        }
        if (grouped) {
          setGroupedData(json.data);
        } else {
          setFlatData(json.data);
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [grouped]);

  const toggleGroup = (env: string) => {
    setExpandedGroups((prev) => ({ ...prev, [env]: !prev[env] }));
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100">Workflows</h1>
          <p className="text-sm text-zinc-400 mt-1">
            All workflows registered in the n8n instance
          </p>
        </div>

        {/* View toggle */}
        <div className="flex items-center gap-2 bg-zinc-900 border border-zinc-800 rounded-lg p-1">
          <button
            onClick={() => setGrouped(true)}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
              grouped
                ? 'bg-zinc-700 text-zinc-100'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Grouped
          </button>
          <button
            onClick={() => setGrouped(false)}
            className={`px-3 py-1.5 text-xs font-medium rounded transition-colors ${
              !grouped
                ? 'bg-zinc-700 text-zinc-100'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            Flat
          </button>
        </div>
      </div>

      {loading && (
        <div className="mt-8 space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="h-12 bg-zinc-900 border border-zinc-800 rounded-lg animate-pulse"
            />
          ))}
        </div>
      )}

      {error && (
        <div className="mt-6 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Grouped view */}
      {!loading && !error && grouped && groupedData && (
        <div className="mt-6 space-y-4">
          <p className="text-sm text-zinc-500">
            {groupedData.count} workflow{groupedData.count !== 1 ? 's' : ''} total
          </p>
          {ENV_ORDER.map((env) => {
            const items = groupedData.groups[env];
            if (!items || items.length === 0) return null;
            const isExpanded = expandedGroups[env] ?? true;

            return (
              <div
                key={env}
                className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden"
              >
                <button
                  onClick={() => toggleGroup(env)}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-zinc-800/50 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <EnvironmentBadge env={env} />
                    <span className="text-sm text-zinc-400">
                      {items.length} workflow{items.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <span className="text-zinc-500 text-sm">
                    {isExpanded ? '\u25B4' : '\u25BE'}
                  </span>
                </button>

                {isExpanded && (
                  <div className="border-t border-zinc-800 divide-y divide-zinc-800/50">
                    {items.map((wf) => (
                      <div
                        key={wf.id}
                        className="px-4 py-2.5 flex items-center gap-4 text-sm"
                      >
                        <span className="text-zinc-200 flex-1 truncate">
                          {wf.name}
                        </span>
                        <span className="font-mono text-xs text-zinc-500 w-20 text-right">
                          {wf.id}
                        </span>
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded w-14 text-center ${
                            wf.active
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : 'bg-zinc-800 text-zinc-500'
                          }`}
                        >
                          {wf.active ? 'active' : 'off'}
                        </span>
                        {wf.type && (
                          <span className="text-xs text-zinc-500 w-12 text-right">
                            {wf.type}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Flat view */}
      {!loading && !error && !grouped && flatData && (
        <div className="mt-6">
          <p className="text-sm text-zinc-500 mb-4">
            {flatData.count} workflow{flatData.count !== 1 ? 's' : ''} total
          </p>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
            {/* Table header */}
            <div className="px-4 py-2.5 border-b border-zinc-800 flex items-center gap-4 text-xs font-medium text-zinc-500 uppercase tracking-wider">
              <span className="flex-1">Name</span>
              <span className="w-20 text-right">ID</span>
              <span className="w-14 text-center">Active</span>
              <span className="w-14 text-right">Nodes</span>
              <span className="w-28 text-right">Updated</span>
            </div>
            <div className="divide-y divide-zinc-800/50">
              {flatData.workflows.map((wf) => (
                <div
                  key={wf.id}
                  className="px-4 py-2.5 flex items-center gap-4 text-sm"
                >
                  <span className="text-zinc-200 flex-1 truncate">
                    {wf.name}
                  </span>
                  <span className="font-mono text-xs text-zinc-500 w-20 text-right">
                    {wf.id}
                  </span>
                  <span
                    className={`text-xs px-1.5 py-0.5 rounded w-14 text-center ${
                      wf.active
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : 'bg-zinc-800 text-zinc-500'
                    }`}
                  >
                    {wf.active ? 'active' : 'off'}
                  </span>
                  <span className="text-xs text-zinc-500 w-14 text-right">
                    {wf.nodeCount}
                  </span>
                  <span className="text-xs text-zinc-600 w-28 text-right">
                    {new Date(wf.updatedAt).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
