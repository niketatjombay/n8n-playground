'use client';

import { useEffect, useState } from 'react';
import WorkflowCard from '@/components/WorkflowCard';
import EnvironmentBadge from '@/components/EnvironmentBadge';

interface StatusData {
  subWorkflows: Array<{
    slug: string;
    description: string | null;
    usedBy: string[];
    environments: Record<string, { n8nId: string | null; isTodo: boolean } | null>;
  }>;
  workflows: Array<{
    slug: string;
    description: string | null;
    usesSubWorkflows: string[];
    environments: Record<string, unknown>;
  }>;
  todos: Array<{ path: string; value: string }>;
  environments: string[];
}

export default function DashboardPage() {
  const [data, setData] = useState<StatusData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/status')
      .then((res) => res.json())
      .then((json) => {
        if (json.success) {
          setData(json.data);
        } else {
          setError(json.error || 'Unknown error');
        }
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div>
        <h1 className="text-2xl font-semibold text-zinc-100">Dashboard</h1>
        <p className="text-sm text-zinc-400 mt-1">Workflow status across environments</p>
        <div className="mt-8 space-y-4">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-48 bg-zinc-900 border border-zinc-800 rounded-lg animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <h1 className="text-2xl font-semibold text-zinc-100">Dashboard</h1>
        <div className="mt-6 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-100">Dashboard</h1>
      <p className="text-sm text-zinc-400 mt-1">
        Workflow status across environments
      </p>

      {/* TODO warnings */}
      {data.todos.length > 0 && (
        <div className="mt-6 bg-amber-500/10 border border-amber-500/20 rounded-lg px-4 py-3">
          <h3 className="text-sm font-medium text-amber-400">
            {data.todos.length} TODO placeholder{data.todos.length > 1 ? 's' : ''} found
          </h3>
          <ul className="mt-2 space-y-1">
            {data.todos.map((todo, i) => (
              <li key={i} className="text-xs text-amber-300/80 font-mono">
                {todo.path}: {todo.value}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Main workflow cards */}
      <section className="mt-8">
        <h2 className="text-lg font-semibold text-zinc-200 mb-4">
          Workflows ({data.workflows.length})
        </h2>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {data.workflows.map((wf) => (
            <WorkflowCard
              key={wf.slug}
              workflow={wf as any}
              envList={data.environments}
            />
          ))}
        </div>
      </section>

      {/* Sub-workflows */}
      {data.subWorkflows.length > 0 && (
        <section className="mt-10">
          <h2 className="text-lg font-semibold text-zinc-200 mb-4">
            Shared Sub-Workflows ({data.subWorkflows.length})
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {data.subWorkflows.map((sub) => (
              <div
                key={sub.slug}
                className="bg-zinc-900 border border-zinc-800 rounded-lg px-5 py-4"
              >
                <h3 className="text-sm font-semibold text-zinc-100 font-mono">
                  {sub.slug}
                </h3>
                {sub.description && (
                  <p className="text-xs text-zinc-400 mt-1">{sub.description}</p>
                )}
                {sub.usedBy.length > 0 && (
                  <p className="text-xs text-zinc-500 mt-2">
                    Used by: {sub.usedBy.join(', ')}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {data.environments.map((env) => {
                    const envData = sub.environments[env];
                    return (
                      <div key={env} className="flex items-center gap-1.5">
                        <EnvironmentBadge env={env} />
                        <span className="text-xs font-mono text-zinc-500">
                          {envData?.n8nId
                            ? envData.isTodo
                              ? envData.n8nId
                              : envData.n8nId.slice(0, 8)
                            : '--'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
