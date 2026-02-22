'use client';

import { useState } from 'react';
import Link from 'next/link';
import EnvironmentBadge from './EnvironmentBadge';

interface EnvStatus {
  n8nId: string | null;
  isTodo: boolean;
  active: boolean;
  webhookPath: string | null;
  lastDeployedAt: string | null;
  projectId: string | null;
  folderId: string | null;
}

interface WorkflowData {
  slug: string;
  description: string | null;
  usesSubWorkflows: string[];
  environments: Record<string, EnvStatus | null>;
}

interface WorkflowCardProps {
  workflow: WorkflowData;
  envList: string[];
  onStatusChange?: () => void;
}

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diff = now - then;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
}

export default function WorkflowCard({ workflow, envList, onStatusChange }: WorkflowCardProps) {
  const [togglingEnv, setTogglingEnv] = useState<string | null>(null);

  const handleToggle = async (env: string, active: boolean) => {
    setTogglingEnv(env);
    try {
      const res = await fetch('/api/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug: workflow.slug, env, deactivate: active }),
      });
      const json = await res.json();
      if (json.success && onStatusChange) {
        onStatusChange();
      }
    } catch {
      // silently fail for inline toggle
    } finally {
      setTogglingEnv(null);
    }
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
      <div className="px-5 py-4 border-b border-zinc-800">
        <h3 className="text-base font-semibold text-zinc-100 font-mono">
          {workflow.slug}
        </h3>
        {workflow.description && (
          <p className="text-sm text-zinc-400 mt-1">{workflow.description}</p>
        )}
      </div>

      <div className="px-5 py-4 space-y-3">
        {envList.map((env) => {
          const envData = workflow.environments[env];
          if (!envData) {
            return (
              <div key={env} className="flex items-center gap-3">
                <EnvironmentBadge env={env} />
                <span className="text-xs text-zinc-600">Not configured</span>
              </div>
            );
          }
          return (
            <div key={env} className="flex items-center gap-3 flex-wrap">
              <EnvironmentBadge env={env} active={envData.active} />
              <span className="text-xs font-mono text-zinc-500">
                {envData.isTodo
                  ? envData.n8nId
                  : envData.n8nId
                  ? envData.n8nId.slice(0, 12)
                  : '--'}
              </span>
              <span
                className={`text-xs px-1.5 py-0.5 rounded ${
                  envData.active
                    ? 'bg-emerald-500/10 text-emerald-400'
                    : 'bg-zinc-800 text-zinc-500'
                }`}
              >
                {envData.active ? 'active' : 'inactive'}
              </span>
              {envData.lastDeployedAt && (
                <span className="text-xs text-zinc-600">
                  {relativeTime(envData.lastDeployedAt)}
                </span>
              )}
              {!envData.isTodo && envData.n8nId && (
                <button
                  onClick={() => handleToggle(env, envData.active)}
                  disabled={togglingEnv === env}
                  className="text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors disabled:opacity-50 ml-auto"
                >
                  {togglingEnv === env ? '...' : envData.active ? 'Deactivate' : 'Activate'}
                </button>
              )}
            </div>
          );
        })}
      </div>

      <div className="px-5 py-3 border-t border-zinc-800 flex gap-2">
        <Link
          href={`/deploy?slug=${workflow.slug}`}
          className="px-3 py-1.5 text-xs font-medium rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors"
        >
          Deploy
        </Link>
        <Link
          href={`/promote?slug=${workflow.slug}`}
          className="px-3 py-1.5 text-xs font-medium rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors"
        >
          Promote
        </Link>
      </div>
    </div>
  );
}
