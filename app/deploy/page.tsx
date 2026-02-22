'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import OperationLog from '@/components/OperationLog';
import ConfirmDialog from '@/components/ConfirmDialog';
import { useStatusFetch, StatusError } from '@/components/StatusFetcher';

const ENVIRONMENTS = ['development', 'staging', 'production'];

function DeployForm() {
  const searchParams = useSearchParams();
  const { slugs, statusLoading, statusError, refetchStatus } = useStatusFetch();
  const [env, setEnv] = useState('development');
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [steps, setSteps] = useState<any[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  // Pre-select from URL param once slugs are loaded
  useEffect(() => {
    const paramSlug = searchParams.get('slug');
    if (paramSlug && slugs.includes(paramSlug)) {
      setSelectedSlugs([paramSlug]);
    }
  }, [searchParams, slugs]);

  const handlePreview = async () => {
    setLoading(true);
    setSteps([]);
    setError(null);
    try {
      const slugsToProcess = selectedSlugs.length > 0 ? selectedSlugs : [null];
      const allSteps: any[] = [];
      for (const s of slugsToProcess) {
        const res = await fetch('/api/deploy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ env, slug: s, dryRun: true }),
        });
        const json = await res.json();
        if (json.success && json.data) {
          const resultSteps = json.data.steps || json.data;
          if (Array.isArray(resultSteps)) allSteps.push(...resultSteps);
        } else {
          setError(json.error || 'Preview failed');
          break;
        }
      }
      setSteps(allSteps);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDeploy = async () => {
    setLoading(true);
    setSteps([]);
    setError(null);
    try {
      const slugsToProcess = selectedSlugs.length > 0 ? selectedSlugs : [null];
      const allSteps: any[] = [];
      for (const s of slugsToProcess) {
        const res = await fetch('/api/deploy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ env, slug: s }),
        });
        const json = await res.json();
        if (json.success && json.data) {
          const resultSteps = json.data.steps || json.data;
          if (Array.isArray(resultSteps)) allSteps.push(...resultSteps);
        } else {
          setError(json.error || 'Deploy failed');
          break;
        }
      }
      setSteps(allSteps);
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

        {/* Workflow select */}
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">Workflows</label>
          <div className="space-y-1.5 max-h-48 overflow-y-auto bg-zinc-900 border border-zinc-800 rounded-lg p-3">
            <div className="flex gap-3 mb-2 pb-2 border-b border-zinc-800">
              <button type="button" onClick={() => setSelectedSlugs([...slugs])} className="text-xs text-blue-400 hover:text-blue-300">
                Select All
              </button>
              <button type="button" onClick={() => setSelectedSlugs([])} className="text-xs text-zinc-400 hover:text-zinc-300">
                Deselect All
              </button>
            </div>
            {slugs.map((s) => (
              <label key={s} className="flex items-center gap-2 text-sm text-zinc-200 cursor-pointer hover:text-zinc-100">
                <input
                  type="checkbox"
                  checked={selectedSlugs.includes(s)}
                  onChange={(e) => {
                    if (e.target.checked) setSelectedSlugs([...selectedSlugs, s]);
                    else setSelectedSlugs(selectedSlugs.filter(x => x !== s));
                  }}
                  className="rounded border-zinc-700 bg-zinc-800"
                />
                {s}
              </label>
            ))}
          </div>
        </div>

        {/* Deploy buttons */}
        <div className="flex gap-3">
          <button
            onClick={handlePreview}
            disabled={loading}
            className="px-5 py-2.5 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
          >
            {loading ? 'Checking...' : 'Preview Changes'}
          </button>
          <button
            onClick={() => setShowConfirm(true)}
            disabled={loading}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
          >
            {loading ? 'Deploying...' : 'Deploy'}
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
        title="Deploy Workflows"
        message={`Deploy ${selectedSlugs.length > 0 ? selectedSlugs.length + ' workflow(s)' : 'all workflows'} to ${env}?${
          env === 'production' ? '\n\nYou are about to deploy to PRODUCTION.' : ''
        }`}
        confirmLabel="Deploy"
        destructive={env === 'production'}
        onConfirm={() => {
          setShowConfirm(false);
          handleDeploy();
        }}
        onCancel={() => setShowConfirm(false)}
      />
    </>
  );
}

export default function DeployPage() {
  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-100">Deploy Workflows</h1>
      <p className="text-sm text-zinc-400 mt-1">
        Deploy workflow JSON to the n8n instance
      </p>
      <Suspense
        fallback={
          <div className="mt-8 text-sm text-zinc-500">Loading...</div>
        }
      >
        <DeployForm />
      </Suspense>
    </div>
  );
}
