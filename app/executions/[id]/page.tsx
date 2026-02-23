'use client';

import { useState, useEffect, useCallback, use } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TokenUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  source: string;
}

interface SubExecution {
  id: string;
  workflowName: string;
  status: string;
  nodes: NodeInfo[];
  error?: string;
}

interface NodeInfo {
  name: string;
  type: string;
  status: string;
  executionTimeMs: number;
  startTime: number;
  inputData: unknown;
  outputData: unknown;
  tokenUsage: TokenUsage | null;
  isSubWorkflow: boolean;
  subExecution: SubExecution | null;
  error: unknown;
}

interface ExecutionDetail {
  id: string;
  status: string;
  startedAt: string | null;
  stoppedAt: string | null;
  duration: number | null;
  mode: string;
  finished: boolean;
  workflowName: string;
  error: { message: string; stack: string | null } | null;
}

interface TokenSummary {
  [model: string]: { inputTokens: number; outputTokens: number; source: string };
}

interface DetailResponse {
  success: boolean;
  error?: string;
  execution: ExecutionDetail;
  nodes: NodeInfo[];
  tokenSummary: TokenSummary;
  raw: unknown;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function statusColor(status: string): string {
  switch (status) {
    case 'success':
      return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    case 'error':
      return 'bg-red-500/10 text-red-400 border-red-500/20';
    case 'waiting':
      return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    case 'running':
      return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    default:
      return 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20';
  }
}

function statusDot(status: string): string {
  switch (status) {
    case 'success':
      return 'bg-emerald-400';
    case 'error':
      return 'bg-red-400';
    case 'waiting':
      return 'bg-amber-400';
    case 'running':
      return 'bg-blue-400';
    default:
      return 'bg-zinc-400';
  }
}

function formatDuration(ms: number | null): string {
  if (ms === null || ms === undefined) return '--';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(0);
  return `${minutes}m ${seconds}s`;
}

function formatTimestamp(ts: string | null): string {
  if (!ts) return '--';
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return '--';
  }
}

function formatNumber(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

function sourceColor(source: string): string {
  switch (source) {
    case 'actual':
      return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    case 'estimated':
      return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    default:
      return 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20';
  }
}

// ---------------------------------------------------------------------------
// JSON Viewer component
// ---------------------------------------------------------------------------

function JsonViewer({ label, data }: { label: string; data: unknown }) {
  const [copied, setCopied] = useState(false);
  const text = JSON.stringify(data, null, 2);

  const copy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [text]);

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-zinc-400">{label}</span>
        <button
          onClick={copy}
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <pre className="bg-zinc-950 border border-zinc-800 rounded p-3 text-xs text-zinc-300 font-mono overflow-auto max-h-64 whitespace-pre-wrap break-words">
        {text}
      </pre>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Node Card component (recursive for sub-workflows)
// ---------------------------------------------------------------------------

function NodeCard({ node, depth = 0 }: { node: NodeInfo; depth?: number }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={depth > 0 ? 'ml-4 border-l-2 border-purple-500/30 pl-4' : ''}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-zinc-800/50 transition-colors group"
      >
        {/* Status dot */}
        <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${statusDot(node.status)}`} />

        {/* Name & type */}
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-zinc-200">{node.name}</span>
          <span className="ml-2 text-xs text-zinc-500">{node.type}</span>
        </div>

        {/* Badges */}
        {node.isSubWorkflow && (
          <span className="text-xs px-2 py-0.5 rounded border bg-purple-500/10 text-purple-400 border-purple-500/20">
            sub-workflow
          </span>
        )}
        {node.tokenUsage && (
          <span className="text-xs px-2 py-0.5 rounded border bg-blue-500/10 text-blue-400 border-blue-500/20 font-mono">
            {formatNumber(node.tokenUsage.inputTokens + node.tokenUsage.outputTokens)} tok
          </span>
        )}

        {/* Duration */}
        <span className="text-xs text-zinc-500 font-mono w-16 text-right flex-shrink-0">
          {formatDuration(node.executionTimeMs)}
        </span>

        {/* Chevron */}
        <span className="text-zinc-500 text-xs flex-shrink-0 transition-transform group-hover:text-zinc-300">
          {expanded ? '\u25B4' : '\u25BE'}
        </span>
      </button>

      {expanded && (
        <div className="ml-5 pb-3 space-y-2">
          {/* Node error */}
          {node.error != null && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-xs text-red-400">
              {String(
                typeof node.error === 'string'
                  ? node.error
                  : (node.error as { message?: string })?.message || JSON.stringify(node.error)
              )}
            </div>
          )}

          {/* Token usage detail */}
          {node.tokenUsage && (
            <div className="text-xs text-zinc-500 flex items-center gap-3">
              <span>Model: <span className="text-zinc-300 font-mono">{node.tokenUsage.model}</span></span>
              <span>In: <span className="text-zinc-300 font-mono">{formatNumber(node.tokenUsage.inputTokens)}</span></span>
              <span>Out: <span className="text-zinc-300 font-mono">{formatNumber(node.tokenUsage.outputTokens)}</span></span>
              <span className={`text-xs px-1.5 py-0.5 rounded border ${sourceColor(node.tokenUsage.source)}`}>
                {node.tokenUsage.source}
              </span>
            </div>
          )}

          {/* Input / Output */}
          {node.inputData !== null && node.inputData !== undefined && (
            <JsonViewer label="Input" data={node.inputData} />
          )}
          {node.outputData !== null && node.outputData !== undefined && (
            <JsonViewer label="Output" data={node.outputData} />
          )}

          {/* Sub-workflow nodes */}
          {node.subExecution && (
            <div className="mt-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-medium text-purple-400">
                  Sub-workflow: {node.subExecution.workflowName}
                </span>
                <span className={`text-xs px-1.5 py-0.5 rounded border ${statusColor(node.subExecution.status)}`}>
                  {node.subExecution.status}
                </span>
                <Link
                  href={`/executions/${node.subExecution.id}?env=development`}
                  className="text-xs text-blue-400 hover:text-blue-300 underline underline-offset-2"
                >
                  #{node.subExecution.id}
                </Link>
              </div>
              {node.subExecution.error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-xs text-red-400 mb-2">
                  {node.subExecution.error}
                </div>
              )}
              <div className="space-y-0.5">
                {node.subExecution.nodes.map((subNode, i) => (
                  <NodeCard key={`${subNode.name}-${i}`} node={subNode} depth={depth + 1} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function ExecutionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const env = searchParams.get('env') || 'development';

  const [data, setData] = useState<DetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [rawCopied, setRawCopied] = useState(false);
  const [showStack, setShowStack] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchExecution() {
      try {
        const res = await apiFetch(`/api/executions/${id}?env=${env}`);
        const json: DetailResponse = await res.json();
        if (cancelled) return;
        if (!json.success) {
          setError(json.error || 'Failed to load execution');
        } else {
          setData(json);
        }
      } catch (err: unknown) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchExecution();
    return () => { cancelled = true; };
  }, [id, env]);

  const copyRaw = useCallback(() => {
    if (!data?.raw) return;
    navigator.clipboard.writeText(JSON.stringify(data.raw, null, 2)).then(() => {
      setRawCopied(true);
      setTimeout(() => setRawCopied(false), 2000);
    });
  }, [data]);

  const tokenEntries = data ? Object.entries(data.tokenSummary) : [];

  // Loading state
  if (loading) {
    return (
      <div>
        <Link href="/executions" className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors">
          &larr; Back to Executions
        </Link>
        <div className="mt-6 space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-zinc-900 border border-zinc-800 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div>
        <Link href="/executions" className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors">
          &larr; Back to Executions
        </Link>
        <div className="mt-6 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { execution, nodes } = data;

  return (
    <div>
      {/* Back link */}
      <Link href="/executions" className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors">
        &larr; Back to Executions
      </Link>

      {/* Header card */}
      <div className="mt-4 bg-zinc-900 border border-zinc-800 rounded-lg p-5">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-zinc-100 font-mono">#{execution.id}</h1>
          <span className={`text-xs px-2 py-0.5 rounded border ${statusColor(execution.status)}`}>
            {execution.status}
          </span>
          <span className="text-xs px-2 py-0.5 rounded border bg-zinc-800 text-zinc-400 border-zinc-700">
            {execution.mode}
          </span>
        </div>
        <p className="text-sm text-zinc-400 mt-1">{execution.workflowName}</p>

        <div className="flex items-center gap-6 mt-4 text-xs text-zinc-400">
          <div>
            <span className="text-zinc-500">Started: </span>
            <span className="text-zinc-300">{formatTimestamp(execution.startedAt)}</span>
          </div>
          <div>
            <span className="text-zinc-500">Finished: </span>
            <span className="text-zinc-300">{formatTimestamp(execution.stoppedAt)}</span>
          </div>
          <div>
            <span className="text-zinc-500">Duration: </span>
            <span className="text-zinc-300 font-mono">{formatDuration(execution.duration)}</span>
          </div>
        </div>

        {/* Execution error */}
        {execution.error && (
          <div className="mt-4 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
            <p className="text-sm text-red-400">{execution.error.message}</p>
            {execution.error.stack && (
              <>
                <button
                  onClick={() => setShowStack(!showStack)}
                  className="text-xs text-red-500 hover:text-red-400 mt-1 transition-colors"
                >
                  {showStack ? 'Hide stack trace' : 'Show stack trace'}
                </button>
                {showStack && (
                  <pre className="mt-2 text-xs text-red-400/70 font-mono whitespace-pre-wrap break-words max-h-48 overflow-auto">
                    {execution.error.stack}
                  </pre>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Token Summary */}
      {tokenEntries.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-medium text-zinc-300 mb-3">Token Usage Summary</h2>
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left">
                  <th className="px-4 py-2.5 text-zinc-400 font-medium text-xs">Model</th>
                  <th className="px-4 py-2.5 text-zinc-400 font-medium text-xs text-right">Input Tokens</th>
                  <th className="px-4 py-2.5 text-zinc-400 font-medium text-xs text-right">Output Tokens</th>
                  <th className="px-4 py-2.5 text-zinc-400 font-medium text-xs text-right">Total</th>
                  <th className="px-4 py-2.5 text-zinc-400 font-medium text-xs text-right">Source</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {tokenEntries.map(([model, info]) => (
                  <tr key={model}>
                    <td className="px-4 py-2.5 text-zinc-300 font-mono text-xs">{model}</td>
                    <td className="px-4 py-2.5 text-zinc-300 font-mono text-xs text-right">
                      {formatNumber(info.inputTokens)}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-300 font-mono text-xs text-right">
                      {formatNumber(info.outputTokens)}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-300 font-mono text-xs text-right">
                      {formatNumber(info.inputTokens + info.outputTokens)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <span className={`text-xs px-2 py-0.5 rounded border ${sourceColor(info.source)}`}>
                        {info.source}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Execution Flow */}
      <div className="mt-6">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-zinc-300">
            Execution Flow ({nodes.length} node{nodes.length !== 1 ? 's' : ''})
          </h2>
          <button
            onClick={() => setShowRaw(!showRaw)}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
              showRaw
                ? 'bg-zinc-700 text-zinc-100 border-zinc-600'
                : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:text-zinc-200'
            }`}
          >
            {showRaw ? 'View Timeline' : 'View Raw'}
          </button>
        </div>

        {showRaw ? (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-zinc-400">Raw execution data</span>
              <button
                onClick={copyRaw}
                className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
              >
                {rawCopied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <pre className="bg-zinc-950 border border-zinc-800 rounded p-3 text-xs text-zinc-300 font-mono overflow-auto max-h-[600px] whitespace-pre-wrap break-words">
              {JSON.stringify(data.raw, null, 2)}
            </pre>
          </div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg divide-y divide-zinc-800/50">
            {nodes.map((node, i) => (
              <NodeCard key={`${node.name}-${i}`} node={node} />
            ))}
            {nodes.length === 0 && (
              <div className="px-4 py-8 text-center text-sm text-zinc-500">
                No node execution data available
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
