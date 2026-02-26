'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useStatusFetch, StatusError } from '@/components/StatusFetcher';
import { apiFetch } from '@/lib/api';

const ENVIRONMENTS = ['development', 'staging', 'production'] as const;

const ENV_CONFIG: Record<string, { label: string; short: string; color: string; glow: string; bg: string; border: string; ring: string }> = {
  development: {
    label: 'Development',
    short: 'DEV',
    color: 'text-sky-400',
    glow: 'shadow-sky-500/25',
    bg: 'bg-sky-500/10',
    border: 'border-sky-500/30',
    ring: 'ring-sky-500/40',
  },
  staging: {
    label: 'Staging',
    short: 'STG',
    color: 'text-amber-400',
    glow: 'shadow-amber-500/25',
    bg: 'bg-amber-500/10',
    border: 'border-amber-500/30',
    ring: 'ring-amber-500/40',
  },
  production: {
    label: 'Production',
    short: 'PROD',
    color: 'text-rose-400',
    glow: 'shadow-rose-500/25',
    bg: 'bg-rose-500/10',
    border: 'border-rose-500/30',
    ring: 'ring-rose-500/40',
  },
};

const POLL_INTERVALS = [
  { label: '30s', ms: 30_000 },
  { label: '60s', ms: 60_000 },
  { label: '3m', ms: 180_000 },
  { label: '5m', ms: 300_000 },
] as const;

const POLL_MAX_DURATION_MS = 60 * 60 * 1000;

interface TestResponse {
  success: boolean;
  statusCode?: number;
  webhookUrl?: string;
  data?: unknown;
  error?: string;
}

interface ExecutionInfo {
  id: string;
  status: string;
  startedAt: string | null;
  stoppedAt: string | null;
  duration: number | null;
}

export default function TestPage() {
  const { slugs, workflows, statusLoading, statusError, refetchStatus } = useStatusFetch();
  const [slug, setSlug] = useState('');
  const [env, setEnv] = useState('development');
  const [payload, setPayload] = useState('{\n  \n}');
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<TestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [jsonValid, setJsonValid] = useState(true);
  const [payloadLoading, setPayloadLoading] = useState(false);
  const [payloadSource, setPayloadSource] = useState<'sample' | 'metadata' | 'empty' | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumberRef = useRef<HTMLDivElement>(null);

  // Execution polling state
  const [execution, setExecution] = useState<ExecutionInfo | null>(null);
  const [polling, setPolling] = useState(false);
  const [liveElapsed, setLiveElapsed] = useState(0);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const liveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const [pollIntervalMs, setPollIntervalMs] = useState<number>(POLL_INTERVALS[0].ms);
  const triggeredAtRef = useRef<string | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (liveTimerRef.current) clearInterval(liveTimerRef.current);
    };
  }, []);

  // Validate JSON as user types
  useEffect(() => {
    const trimmed = payload.trim();
    if (!trimmed) { setJsonValid(true); return; }
    try { JSON.parse(trimmed); setJsonValid(true); } catch { setJsonValid(false); }
  }, [payload]);

  const fallbackPayload = useCallback((targetSlug: string) => {
    const wf = workflows.find((w: any) => w.slug === targetSlug);
    if (wf?.input) {
      setPayload(JSON.stringify(wf.input, null, 2));
      setPayloadSource('metadata');
    } else {
      setPayload('{\n  \n}');
      setPayloadSource('empty');
    }
  }, [workflows]);

  // Load sample_input.json when slug or env changes
  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    setPayloadLoading(true);

    apiFetch(`/api/sample-input?slug=${encodeURIComponent(slug)}&env=${encodeURIComponent(env)}`)
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        if (json.success && json.data) {
          setPayload(JSON.stringify(json.data, null, 2));
          setPayloadSource('sample');
        } else {
          fallbackPayload(slug);
        }
      })
      .catch(() => {
        if (cancelled) return;
        fallbackPayload(slug);
      })
      .finally(() => { if (!cancelled) setPayloadLoading(false); });

    return () => { cancelled = true; };
  }, [slug, env, workflows, fallbackPayload]);

  const handleScroll = useCallback(() => {
    if (textareaRef.current && lineNumberRef.current) {
      lineNumberRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  }, []);

  const stopPolling = useCallback(() => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (liveTimerRef.current) { clearInterval(liveTimerRef.current); liveTimerRef.current = null; }
    setPolling(false);
  }, []);

  // Start polling for execution using timestamp matching
  const startExecutionPolling = useCallback((triggerSlug: string, triggerEnv: string, triggeredAt: string) => {
    setPolling(true);
    startTimeRef.current = Date.now();
    setLiveElapsed(0);
    setExecution(null);

    liveTimerRef.current = setInterval(() => {
      if (startTimeRef.current) {
        setLiveElapsed(Math.round((Date.now() - startTimeRef.current) / 1000));
      }
    }, 1000);

    const poll = async () => {
      if (startTimeRef.current && Date.now() - startTimeRef.current > POLL_MAX_DURATION_MS) {
        stopPolling();
        return;
      }

      try {
        const res = await apiFetch(
          `/api/executions?slug=${encodeURIComponent(triggerSlug)}&env=${encodeURIComponent(triggerEnv)}&limit=5`
        );
        const json = await res.json();

        if (!json.success || !json.executions?.length) return;

        // Closest-timestamp match
        const triggeredMs = new Date(triggeredAt).getTime();
        const candidates = json.executions.filter((e: any) => e.startedAt);
        if (candidates.length === 0) return;

        let closest = candidates[0];
        let closestDiff = Math.abs(new Date(closest.startedAt).getTime() - triggeredMs);

        for (const c of candidates) {
          const diff = Math.abs(new Date(c.startedAt).getTime() - triggeredMs);
          if (diff < closestDiff) {
            closest = c;
            closestDiff = diff;
          }
        }

        setExecution({
          id: String(closest.id),
          status: closest.status,
          startedAt: closest.startedAt,
          stoppedAt: closest.stoppedAt,
          duration: closest.duration,
        });

        const done = closest.status === 'success' || closest.status === 'error' || closest.status === 'canceled';
        if (done) {
          stopPolling();
        }
      } catch {
        // Keep polling on network errors
      }
    };

    setTimeout(poll, 3000);
    pollRef.current = setInterval(poll, pollIntervalMs);
  }, [stopPolling, pollIntervalMs]);

  const handleTrigger = async () => {
    if (!slug) return;

    stopPolling();
    setLoading(true);
    setResponse(null);
    setError(null);
    setExecution(null);
    setLiveElapsed(0);
    triggeredAtRef.current = null;

    let parsedPayload = null;
    try {
      const trimmed = payload.trim();
      if (trimmed) parsedPayload = JSON.parse(trimmed);
    } catch {
      setError('Invalid JSON payload');
      setLoading(false);
      return;
    }

    // Phase 1: Fire webhook and await full response
    try {
      const res = await apiFetch('/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, env, payload: parsedPayload }),
      });
      const json = await res.json();
      setResponse(json);

      if (!json.success) {
        setError(json.error || 'Request failed');
      }

      // Phase 2: Start polling using triggeredAt from the response
      const triggeredAt = json.triggeredAt;
      if (triggeredAt) {
        triggeredAtRef.current = triggeredAt;
        startExecutionPolling(slug, env, triggeredAt);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const statusCodeColor = (code?: number) => {
    if (!code) return 'text-zinc-500';
    if (code >= 200 && code < 300) return 'text-emerald-400';
    if (code >= 400) return 'text-red-400';
    return 'text-amber-400';
  };

  const statusCodeBg = (code?: number) => {
    if (!code) return 'bg-zinc-500/10';
    if (code >= 200 && code < 300) return 'bg-emerald-500/10';
    if (code >= 400) return 'bg-red-500/10';
    return 'bg-amber-500/10';
  };

  const execStatusColor = (status: string) => {
    switch (status) {
      case 'success': return 'text-emerald-400';
      case 'error': case 'canceled': return 'text-red-400';
      case 'running': return 'text-sky-400';
      case 'waiting': return 'text-amber-400';
      default: return 'text-zinc-500';
    }
  };

  const execStatusBg = (status: string) => {
    switch (status) {
      case 'success': return 'bg-emerald-500/10';
      case 'error': case 'canceled': return 'bg-red-500/10';
      case 'running': return 'bg-sky-500/10';
      case 'waiting': return 'bg-amber-500/10';
      default: return 'bg-zinc-500/10';
    }
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    return `${m}m ${s % 60}s`;
  };

  const lineCount = payload.split('\n').length;
  const envCfg = ENV_CONFIG[env];
  const isFinished = execution && (execution.status === 'success' || execution.status === 'error' || execution.status === 'canceled');

  return (
    <div className="max-w-4xl">
      {/* Header */}
      <div className="flex items-end justify-between mb-8">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-2xl font-semibold text-zinc-100 tracking-tight">
              Webhook Tester
            </h1>
            <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-widest ${envCfg.bg} ${envCfg.color} ${envCfg.border} border`}>
              <span className={`w-1.5 h-1.5 rounded-full bg-current ${(loading || polling) ? 'animate-pulse' : ''}`} />
              {envCfg.short}
            </span>
          </div>
          <p className="text-sm text-zinc-500">
            Fire webhook requests and inspect responses
          </p>
        </div>
        {polling && (
          <div className="text-xs font-mono text-sky-400 animate-pulse">
            {liveElapsed}s
          </div>
        )}
        {!polling && execution?.duration != null && (
          <div className="text-xs font-mono text-zinc-600">
            {formatDuration(execution.duration)}
          </div>
        )}
      </div>

      {statusError && <StatusError error={statusError} onRetry={refetchStatus} />}
      {statusLoading && !statusError && (
        <div className="mt-6 flex items-center gap-2 text-sm text-zinc-500">
          <span className="inline-block w-3 h-3 border-2 border-zinc-600 border-t-zinc-400 rounded-full animate-spin" />
          Loading workflows...
        </div>
      )}

      {/* Main form area */}
      <div className="space-y-5">
        {/* Workflow + Environment row */}
        <div className="flex gap-4 items-end">
          <div className="flex-1">
            <label className="block text-[11px] font-mono uppercase tracking-wider text-zinc-500 mb-2">Workflow</label>
            <div className="relative">
              <select
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className="w-full appearance-none bg-zinc-900/80 border border-zinc-800 rounded-lg px-4 py-2.5 pr-10 text-sm text-zinc-200 font-mono focus:outline-none focus:ring-1 focus:ring-blue-500/50 focus:border-blue-500/50 transition-all cursor-pointer hover:border-zinc-700"
              >
                <option value="">Select workflow...</option>
                {slugs.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-3">
                <svg className="w-4 h-4 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-mono uppercase tracking-wider text-zinc-500 mb-2">Environment</label>
            <div className="flex bg-zinc-900/80 border border-zinc-800 rounded-lg p-0.5">
              {ENVIRONMENTS.map((e) => {
                const cfg = ENV_CONFIG[e];
                const isActive = env === e;
                return (
                  <button
                    key={e}
                    onClick={() => setEnv(e)}
                    className={`relative px-4 py-2 text-xs font-mono font-semibold uppercase tracking-wider rounded-md transition-all duration-200 ${
                      isActive
                        ? `${cfg.bg} ${cfg.color} shadow-lg ${cfg.glow}`
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    {cfg.short}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* JSON editor with line numbers */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <label className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">Request Body</label>
              {payloadLoading && (
                <span className="flex items-center gap-1 text-[10px] font-mono text-zinc-500">
                  <span className="inline-block w-2.5 h-2.5 border border-zinc-600 border-t-zinc-400 rounded-full animate-spin" />
                  loading...
                </span>
              )}
              {!payloadLoading && payloadSource === 'sample' && (
                <span className="text-[10px] font-mono text-sky-500/70 bg-sky-500/10 px-1.5 py-0.5 rounded">sample_input.json</span>
              )}
              {!payloadLoading && payloadSource === 'metadata' && (
                <span className="text-[10px] font-mono text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded">metadata</span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {!jsonValid && payload.trim() && (
                <span className="flex items-center gap-1 text-[10px] font-mono text-red-400">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                  INVALID JSON
                </span>
              )}
              {jsonValid && payload.trim() && payload.trim() !== '{\n  \n}' && (
                <span className="flex items-center gap-1 text-[10px] font-mono text-emerald-500/70">
                  <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                  </svg>
                  VALID
                </span>
              )}
              <span className="text-[10px] font-mono text-zinc-600">
                {lineCount} {lineCount === 1 ? 'line' : 'lines'}
              </span>
            </div>
          </div>
          <div className={`relative flex rounded-lg border overflow-hidden transition-colors duration-200 ${
            !jsonValid && payload.trim() ? 'border-red-500/30' : 'border-zinc-800 focus-within:border-zinc-700'
          }`}>
            <div
              ref={lineNumberRef}
              className="flex-shrink-0 select-none overflow-hidden bg-zinc-900/50 border-r border-zinc-800/50 py-3 px-1"
              aria-hidden
            >
              {Array.from({ length: lineCount }, (_, i) => (
                <div key={i} className="text-right text-[11px] font-mono text-zinc-600 leading-[1.65rem] px-2">{i + 1}</div>
              ))}
            </div>
            <textarea
              ref={textareaRef}
              value={payload}
              onChange={(e) => setPayload(e.target.value)}
              onScroll={handleScroll}
              rows={Math.max(lineCount, 6)}
              spellCheck={false}
              className="flex-1 bg-zinc-950/50 px-4 py-3 text-sm text-zinc-200 font-mono leading-[1.65rem] focus:outline-none resize-y min-h-[160px]"
              placeholder='{ "key": "value" }'
            />
          </div>
        </div>

        {/* Trigger button + poll interval */}
        <div className="flex items-center gap-4">
          <button
            onClick={handleTrigger}
            disabled={loading || !slug || (!jsonValid && !!payload.trim())}
            className={`group relative px-6 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed ${
              loading
                ? 'bg-zinc-800 text-zinc-400 cursor-wait'
                : 'bg-zinc-100 text-zinc-950 hover:bg-white active:scale-[0.98] shadow-lg shadow-white/5 hover:shadow-white/10'
            }`}
          >
            <span className="flex items-center gap-2">
              {loading ? (
                <>
                  <span className="inline-block w-3.5 h-3.5 border-2 border-zinc-600 border-t-zinc-400 rounded-full animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4 transition-transform group-hover:translate-x-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                  </svg>
                  Send Request
                </>
              )}
            </span>
          </button>

          {/* Poll interval selector */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-600">Poll</span>
            <div className="flex bg-zinc-900/80 border border-zinc-800 rounded-md p-0.5">
              {POLL_INTERVALS.map((interval) => (
                <button
                  key={interval.ms}
                  onClick={() => setPollIntervalMs(interval.ms)}
                  className={`px-2.5 py-1 text-[10px] font-mono font-semibold rounded transition-all ${
                    pollIntervalMs === interval.ms
                      ? 'bg-zinc-700/50 text-zinc-200'
                      : 'text-zinc-500 hover:text-zinc-300'
                  }`}
                >
                  {interval.label}
                </button>
              ))}
            </div>
          </div>

          {slug && (
            <span className="text-xs font-mono text-zinc-600 truncate">
              POST /{env}/{slug}
            </span>
          )}
        </div>
      </div>

      {/* Execution tracker */}
      {(polling || execution) && (
        <div className="mt-6 rounded-lg border border-zinc-800 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-900/60 border-b border-zinc-800/60">
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">Execution</span>
              {execution ? (
                <>
                  <a
                    href={`/executions/${execution.id}?env=${env}`}
                    className="text-sm font-mono text-zinc-200 hover:text-sky-400 transition-colors"
                    title="View execution details"
                  >
                    #{execution.id}
                  </a>
                  <button
                    onClick={() => navigator.clipboard.writeText(execution.id)}
                    className="text-zinc-600 hover:text-zinc-400 transition-colors"
                    title="Copy execution ID"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                    </svg>
                  </button>
                  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider ${execStatusColor(execution.status)} ${execStatusBg(execution.status)}`}>
                    {polling && (execution.status === 'running' || execution.status === 'waiting') && (
                      <span className="inline-block w-2 h-2 border border-current border-t-transparent rounded-full animate-spin" />
                    )}
                    {execution.status}
                  </span>
                </>
              ) : (
                <span className="flex items-center gap-1.5 text-[10px] font-mono text-zinc-500">
                  <span className="inline-block w-2 h-2 border border-zinc-500 border-t-zinc-300 rounded-full animate-spin" />
                  waiting for execution...
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {polling && (
                <span className="text-[10px] font-mono text-zinc-600">
                  poll every {POLL_INTERVALS.find(i => i.ms === pollIntervalMs)?.label || '30s'}
                </span>
              )}
              {execution?.duration != null && (
                <span className="text-[10px] font-mono text-zinc-600">{formatDuration(execution.duration)}</span>
              )}
              {polling && (
                <button
                  onClick={stopPolling}
                  className="text-zinc-600 hover:text-zinc-400 transition-colors text-[10px] font-mono"
                >
                  stop
                </button>
              )}
              {isFinished && execution && (
                <a
                  href={`/executions/${execution.id}?env=${env}`}
                  className="text-[10px] font-mono text-sky-500 hover:text-sky-400 transition-colors"
                >
                  view details
                </a>
              )}
            </div>
          </div>
          {polling && (
            <div className="h-0.5 bg-zinc-900 overflow-hidden">
              <div className="h-full bg-sky-500/50 animate-pulse" style={{ width: '100%' }} />
            </div>
          )}
        </div>
      )}

      {/* Error display */}
      {error !== null && (
        <div className="mt-6 flex items-start gap-3 bg-red-500/5 border border-red-500/20 rounded-lg px-4 py-3">
          <svg className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
          </svg>
          <div>
            <p className="text-sm font-medium text-red-400">Request Failed</p>
            <p className="text-sm text-red-400/70 mt-0.5">{error}</p>
          </div>
        </div>
      )}

      {/* Webhook response */}
      {response != null && (
        <div className="mt-4 rounded-lg border border-zinc-800 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-900/60 border-b border-zinc-800/60">
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-mono uppercase tracking-wider text-zinc-500">Response</span>
              {response.statusCode && (
                <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono font-bold ${statusCodeColor(response.statusCode)} ${statusCodeBg(response.statusCode)}`}>
                  {response.statusCode}
                </span>
              )}
            </div>
            <button
              onClick={() => {
                const text = response.data ? JSON.stringify(response.data, null, 2) : response.error || '';
                navigator.clipboard.writeText(text);
              }}
              className="text-zinc-600 hover:text-zinc-400 transition-colors"
              title="Copy response"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </button>
          </div>
          {response.webhookUrl && (
            <div className="px-4 py-2 border-b border-zinc-800/40 bg-zinc-900/30">
              <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-600 mr-2">URL</span>
              <span className="text-xs font-mono text-zinc-400 break-all">{response.webhookUrl}</span>
            </div>
          )}
          <div className="bg-zinc-950/50">
            <pre className="px-4 py-4 text-xs font-mono text-zinc-300 overflow-x-auto max-h-[400px] overflow-y-auto leading-relaxed">
              {response.data
                ? JSON.stringify(response.data, null, 2)
                : response.error
                ? response.error
                : 'No response body'}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
