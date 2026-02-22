'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import OperationLog from '@/components/OperationLog';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useStatusFetch, StatusError } from '@/components/StatusFetcher';
import { apiFetch } from '@/lib/api';

const ENVIRONMENTS = ['development', 'staging', 'production'];

const ENV_INDEX: Record<string, number> = {
  development: 0,
  staging: 1,
  production: 2,
};

function getDefaultTarget(source: string): string {
  if (source === 'development') return 'staging';
  if (source === 'staging') return 'production';
  return '';
}

function PromoteForm() {
  const searchParams = useSearchParams();
  const { slugs, statusLoading, statusError, refetchStatus } = useStatusFetch();
  const [slug, setSlug] = useState('');
  const [sourceEnv, setSourceEnv] = useState('development');
  const [targetEnv, setTargetEnv] = useState('staging');
  const [loading, setLoading] = useState(false);
  const [steps, setSteps] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [diffData, setDiffData] = useState<any>(null);

  // Pre-select from URL param once slugs are loaded
  useEffect(() => {
    const paramSlug = searchParams.get('slug');
    if (paramSlug && slugs.includes(paramSlug)) {
      setSlug(paramSlug);
    }
  }, [searchParams, slugs]);

  // Auto-cascade target when source changes
  useEffect(() => {
    setTargetEnv(getDefaultTarget(sourceEnv));
  }, [sourceEnv]);

  // Validate promotion direction
  useEffect(() => {
    if (targetEnv && ENV_INDEX[targetEnv] <= ENV_INDEX[sourceEnv]) {
      setValidationError(
        `Cannot promote from ${sourceEnv} to ${targetEnv}. Target must be higher than source.`
      );
    } else {
      setValidationError(null);
    }
  }, [sourceEnv, targetEnv]);

  const handlePreview = async () => {
    if (!slug || validationError) return;
    setLoading(true);
    setSteps([]);
    setError(null);
    try {
      const res = await apiFetch('/api/promote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, sourceEnv, targetEnv, dryRun: true }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        const resultSteps = json.data.steps || json.data;
        setSteps(Array.isArray(resultSteps) ? resultSteps : []);
      } else if (json.steps) {
        setSteps(json.steps);
      } else {
        setError(json.error || 'Preview failed');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleViewChanges = async () => {
    if (!slug || !sourceEnv || !targetEnv || validationError) return;
    try {
      const res = await apiFetch(`/api/promote/preview?slug=${slug}&sourceEnv=${sourceEnv}&targetEnv=${targetEnv}`);
      const json = await res.json();
      if (json.success) {
        setDiffData(json);
      }
    } catch {}
  };

  const handlePromote = async () => {
    if (!slug || validationError) return;
    setLoading(true);
    setSteps([]);
    setError(null);
    try {
      const res = await apiFetch('/api/promote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, sourceEnv, targetEnv }),
      });
      const json = await res.json();
      if (json.success && json.data) {
        const resultSteps = json.data.steps || json.data;
        setSteps(Array.isArray(resultSteps) ? resultSteps : []);
      } else if (json.steps) {
        setSteps(json.steps);
      } else {
        setError(json.error || 'Promote failed');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      {statusError && <StatusError error={statusError} onRetry={refetchStatus} />}
      {statusLoading && !statusError && (
        <div className="mt-6 text-sm text-zinc-500">Loading workflows...</div>
      )}

      <div className="mt-8 max-w-lg space-y-5">
        {/* Workflow slug */}
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">
            Workflow
          </label>
          <select
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Select a workflow</option>
            {slugs.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>

        {/* Source env */}
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">
            Source Environment
          </label>
          <select
            value={sourceEnv}
            onChange={(e) => setSourceEnv(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          >
            {ENVIRONMENTS.slice(0, -1).map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
        </div>

        {/* Target env */}
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">
            Target Environment
          </label>
          <select
            value={targetEnv}
            onChange={(e) => setTargetEnv(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          >
            {ENVIRONMENTS.slice(1).map((e) => (
              <option key={e} value={e}>
                {e}
              </option>
            ))}
          </select>
          {validationError && (
            <p className="mt-1.5 text-xs text-red-400">{validationError}</p>
          )}
        </div>

        {slug && !validationError && (
          <button
            onClick={handleViewChanges}
            className="text-sm text-blue-400 hover:text-blue-300 underline"
          >
            View Changes
          </button>
        )}

        {diffData && (
          <div className="mt-4 bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-zinc-800">
              <h3 className="text-sm font-medium text-zinc-300">Changes Preview</h3>
            </div>
            <div className="divide-y divide-zinc-800/50">
              {diffData.changes.map((change: any, i: number) => (
                <div key={i} className="px-4 py-2.5 grid grid-cols-3 gap-2 text-xs font-mono">
                  <span className="text-zinc-400">{change.field}</span>
                  <span className="text-red-400">{change.from}</span>
                  <span className="text-emerald-400">{change.to}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Promote buttons */}
        <div className="flex gap-3">
          <button
            onClick={handlePreview}
            disabled={loading || !slug || !!validationError}
            className="px-5 py-2.5 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
          >
            {loading ? 'Checking...' : 'Preview Changes'}
          </button>
          <button
            onClick={() => setShowConfirm(true)}
            disabled={loading || !slug || !!validationError}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
          >
            {loading ? 'Promoting...' : 'Promote'}
          </button>
        </div>
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

      <ConfirmDialog
        open={showConfirm}
        title="Promote Workflow"
        message={`Promote ${slug} from ${sourceEnv} to ${targetEnv}?${
          targetEnv === 'production' ? '\n\nYou are about to promote to PRODUCTION.' : ''
        }`}
        confirmLabel="Promote"
        destructive={targetEnv === 'production'}
        onConfirm={() => {
          setShowConfirm(false);
          handlePromote();
        }}
        onCancel={() => setShowConfirm(false)}
      />
    </>
  );
}

export default function PromotePage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-100">Promote Workflow</h1>
      <p className="text-sm text-zinc-400 mt-1">
        Promote a workflow from one environment to another
      </p>
      <Suspense
        fallback={
          <div className="mt-8 text-sm text-zinc-500">Loading...</div>
        }
      >
        <PromoteForm />
      </Suspense>
    </div>
  );
}
