'use client';

import { useState, useEffect, useCallback, useMemo, use } from 'react';
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

interface LlmDetail {
  model: string | null;
  prompt: string | null;
  systemPrompt: string | null;
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
  metadata: unknown;
  tokenUsage: TokenUsage | null;
  llmDetail: LlmDetail | null;
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

const STATUS_STYLES: Record<string, { dot: string; badge: string }> = {
  success: { dot: 'bg-emerald-400', badge: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25' },
  error: { dot: 'bg-red-400', badge: 'bg-red-500/10 text-red-400 border-red-500/25' },
  canceled: { dot: 'bg-orange-400', badge: 'bg-orange-500/10 text-orange-400 border-orange-500/25' },
  waiting: { dot: 'bg-amber-400', badge: 'bg-amber-500/10 text-amber-400 border-amber-500/25' },
  running: { dot: 'bg-sky-400', badge: 'bg-sky-500/10 text-sky-400 border-sky-500/25' },
};

function getStatusStyle(status: string) {
  return STATUS_STYLES[status] || { dot: 'bg-zinc-500', badge: 'bg-zinc-500/10 text-zinc-400 border-zinc-500/25' };
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
  try { return new Date(ts).toLocaleString(); } catch { return '--'; }
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function shortNodeType(type: string): string {
  const last = type.split('.').pop() || type;
  return last.replace(/([a-z])([A-Z])/g, '$1 $2');
}

function isLlmNodeType(type: string): boolean {
  return type.includes('langchain') || type.includes('openAi');
}

/** Extract text content from n8n outputData.main branches */
function extractMainItems(data: unknown): unknown[] {
  if (!data || typeof data !== 'object') return [];
  const d = data as { main?: unknown[][] };
  if (!d.main || !Array.isArray(d.main)) return [];
  const items: unknown[] = [];
  for (const branch of d.main) {
    if (!Array.isArray(branch)) continue;
    for (const item of branch) {
      if (item && typeof item === 'object' && 'json' in item) {
        items.push((item as { json: unknown }).json);
      }
    }
  }
  return items;
}

/** Try to extract an LLM response text from output items */
function extractLlmResponse(outputData: unknown): string | null {
  const items = extractMainItems(outputData);
  for (const item of items) {
    if (!item || typeof item !== 'object') continue;
    const obj = item as Record<string, unknown>;
    // Common patterns from LLM nodes
    const candidates = [
      obj.text, obj.output, obj.response, obj.result,
      obj.message?.toString(),
      (obj.choices as { message?: { content?: string } }[])?.[0]?.message?.content,
    ];
    for (const c of candidates) {
      if (typeof c === 'string' && c.length > 0) return c;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Copy Button
// ---------------------------------------------------------------------------

function CopyBtn({ text, className = '' }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {});
  }, [text]);

  return (
    <button onClick={copy} className={`text-zinc-600 hover:text-zinc-300 transition-colors ${className}`} title="Copy">
      {copied ? (
        <svg className="w-3.5 h-3.5 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
        </svg>
      )}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Data Panel — collapsible JSON viewer with header
// ---------------------------------------------------------------------------

function DataPanel({ label, data, defaultOpen = false, accent = 'zinc' }: {
  label: string;
  data: unknown;
  defaultOpen?: boolean;
  accent?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const text = useMemo(() => JSON.stringify(data, null, 2), [data]);
  if (data === null || data === undefined) return null;

  const accentColors: Record<string, string> = {
    zinc: 'border-zinc-700/50 text-zinc-400',
    sky: 'border-sky-500/30 text-sky-400',
    amber: 'border-amber-500/30 text-amber-400',
    emerald: 'border-emerald-500/30 text-emerald-400',
    violet: 'border-violet-500/30 text-violet-400',
  };
  const ac = accentColors[accent] || accentColors.zinc;

  return (
    <div className={`rounded border ${ac.split(' ')[0]} overflow-hidden`}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3 py-1.5 bg-zinc-900/60 hover:bg-zinc-800/60 transition-colors"
      >
        <span className={`text-[10px] font-mono font-semibold uppercase tracking-wider ${ac.split(' ').slice(1).join(' ')}`}>
          {label}
        </span>
        <div className="flex items-center gap-2">
          <CopyBtn text={text} />
          <span className="text-zinc-600 text-[10px]">{open ? '▴' : '▾'}</span>
        </div>
      </button>
      {open && (
        <pre className="px-3 py-2.5 text-[11px] font-mono text-zinc-400 overflow-auto max-h-80 bg-zinc-950/50 leading-relaxed whitespace-pre-wrap break-words">
          {text}
        </pre>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// LLM Detail Panel — prompt/response/tokens in a structured view
// ---------------------------------------------------------------------------

function LlmDetailPanel({ node }: { node: NodeInfo }) {
  const { tokenUsage, llmDetail, outputData } = node;
  const [showRawOutput, setShowRawOutput] = useState(false);

  const llmResponse = useMemo(() => extractLlmResponse(outputData), [outputData]);

  const model = tokenUsage?.model || llmDetail?.model || 'unknown';
  const prompt = llmDetail?.prompt;
  const systemPrompt = llmDetail?.systemPrompt;

  return (
    <div className="space-y-2">
      {/* Model + tokens bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-violet-400 bg-violet-500/10 px-2 py-0.5 rounded">
          LLM
        </span>
        <span className="text-xs font-mono text-zinc-300">{model}</span>
        {tokenUsage && (
          <>
            <span className="text-zinc-700">|</span>
            <span className="text-[10px] font-mono text-zinc-500">
              IN <span className="text-emerald-400">{formatNumber(tokenUsage.inputTokens)}</span>
            </span>
            <span className="text-[10px] font-mono text-zinc-500">
              OUT <span className="text-sky-400">{formatNumber(tokenUsage.outputTokens)}</span>
            </span>
            <span className="text-[10px] font-mono text-zinc-500">
              TOTAL <span className="text-zinc-300">{formatNumber(tokenUsage.inputTokens + tokenUsage.outputTokens)}</span>
            </span>
            <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${
              tokenUsage.source === 'actual'
                ? 'text-emerald-500 border-emerald-500/20 bg-emerald-500/5'
                : 'text-amber-500 border-amber-500/20 bg-amber-500/5'
            }`}>
              {tokenUsage.source}
            </span>
          </>
        )}
      </div>

      {/* System prompt */}
      {systemPrompt && (
        <div className="rounded border border-zinc-700/40 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-1 bg-zinc-900/60">
            <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-zinc-500">System Prompt</span>
            <CopyBtn text={systemPrompt} />
          </div>
          <pre className="px-3 py-2 text-[11px] font-mono text-zinc-400 max-h-40 overflow-auto bg-zinc-950/40 whitespace-pre-wrap break-words leading-relaxed">
            {systemPrompt}
          </pre>
        </div>
      )}

      {/* User prompt */}
      {prompt && (
        <div className="rounded border border-sky-500/20 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-1 bg-sky-500/5">
            <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-sky-500">Prompt</span>
            <CopyBtn text={prompt} />
          </div>
          <pre className="px-3 py-2 text-[11px] font-mono text-sky-300/80 max-h-60 overflow-auto bg-zinc-950/40 whitespace-pre-wrap break-words leading-relaxed">
            {prompt}
          </pre>
        </div>
      )}

      {/* LLM response */}
      {llmResponse && (
        <div className="rounded border border-emerald-500/20 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-1 bg-emerald-500/5">
            <span className="text-[10px] font-mono font-semibold uppercase tracking-wider text-emerald-500">Response</span>
            <div className="flex items-center gap-2">
              <CopyBtn text={llmResponse} />
              <button
                onClick={() => setShowRawOutput(!showRawOutput)}
                className="text-[9px] font-mono text-zinc-600 hover:text-zinc-400 transition-colors"
              >
                {showRawOutput ? 'formatted' : 'raw json'}
              </button>
            </div>
          </div>
          {showRawOutput ? (
            <pre className="px-3 py-2 text-[11px] font-mono text-zinc-400 max-h-80 overflow-auto bg-zinc-950/40 whitespace-pre-wrap break-words leading-relaxed">
              {JSON.stringify(outputData, null, 2)}
            </pre>
          ) : (
            <pre className="px-3 py-2 text-[11px] font-mono text-emerald-300/80 max-h-80 overflow-auto bg-zinc-950/40 whitespace-pre-wrap break-words leading-relaxed">
              {llmResponse}
            </pre>
          )}
        </div>
      )}

      {/* Fallback: if no prompt/response extracted, show raw I/O */}
      {!prompt && !llmResponse && (
        <>
          <DataPanel label="Input" data={node.inputData} accent="sky" />
          <DataPanel label="Output" data={node.outputData} accent="emerald" />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Node Card — expandable, with special LLM treatment
// ---------------------------------------------------------------------------

function NodeCard({ node, depth = 0, env = 'development' }: { node: NodeInfo; depth?: number; env?: string }) {
  const [expanded, setExpanded] = useState(false);
  const style = getStatusStyle(node.status);
  const isLlm = isLlmNodeType(node.type);

  return (
    <div className={depth > 0 ? 'ml-4 border-l-2 border-violet-500/20 pl-3' : ''}>
      {/* Header row */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-zinc-800/40 transition-colors group"
      >
        {/* Status dot */}
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${style.dot}`} />

        {/* Name */}
        <span className="text-sm font-medium text-zinc-200 truncate">{node.name}</span>

        {/* Node type */}
        <span className="text-[10px] font-mono text-zinc-600 hidden sm:inline">{shortNodeType(node.type)}</span>

        {/* Spacer */}
        <span className="flex-1" />

        {/* Badges */}
        {isLlm && (
          <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20 uppercase tracking-wider">
            LLM
          </span>
        )}
        {node.isSubWorkflow && (
          <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20 uppercase tracking-wider">
            Sub
          </span>
        )}
        {node.tokenUsage && (
          <span className="text-[10px] font-mono text-zinc-500">
            {formatNumber(node.tokenUsage.inputTokens + node.tokenUsage.outputTokens)} tok
          </span>
        )}

        {/* Duration */}
        <span className="text-[10px] font-mono text-zinc-600 w-14 text-right flex-shrink-0">
          {formatDuration(node.executionTimeMs)}
        </span>

        {/* Expand indicator */}
        <span className={`text-zinc-600 text-[10px] flex-shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`}>
          ▾
        </span>
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="mx-3 mb-3 mt-1 space-y-2">
          {/* Node error */}
          {node.error != null && (
            <div className="rounded border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-400 font-mono">
              {String(
                typeof node.error === 'string'
                  ? node.error
                  : (node.error as { message?: string })?.message || JSON.stringify(node.error)
              )}
            </div>
          )}

          {/* LLM nodes get special treatment */}
          {isLlm ? (
            <LlmDetailPanel node={node} />
          ) : (
            <>
              {/* Standard node I/O */}
              <DataPanel label="Input" data={node.inputData} accent="sky" />
              <DataPanel label="Output" data={node.outputData} accent="emerald" />
            </>
          )}

          {/* Sub-workflow nodes */}
          {node.subExecution && (
            <div className="mt-2">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-violet-400">
                  Sub-workflow
                </span>
                <span className="text-xs font-mono text-zinc-300">{node.subExecution.workflowName}</span>
                <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${getStatusStyle(node.subExecution.status).badge}`}>
                  {node.subExecution.status}
                </span>
                <Link
                  href={`/executions/${node.subExecution.id}?env=${env}`}
                  className="text-[10px] font-mono text-sky-500 hover:text-sky-400 underline underline-offset-2"
                >
                  #{node.subExecution.id}
                </Link>
              </div>
              {node.subExecution.error && (
                <div className="rounded border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-400 font-mono mb-2">
                  {node.subExecution.error}
                </div>
              )}
              <div className="space-y-px">
                {node.subExecution.nodes.map((subNode, i) => (
                  <NodeCard key={`${subNode.name}-${i}`} node={subNode} depth={depth + 1} env={env} />
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

  const rawText = useMemo(() => data?.raw ? JSON.stringify(data.raw, null, 2) : '', [data]);

  const copyRaw = useCallback(() => {
    if (!rawText) return;
    navigator.clipboard.writeText(rawText).then(() => {
      setRawCopied(true);
      setTimeout(() => setRawCopied(false), 2000);
    }).catch(() => {});
  }, [rawText]);

  const tokenEntries = data ? Object.entries(data.tokenSummary) : [];

  // Loading state
  if (loading) {
    return (
      <div className="max-w-5xl">
        <Link href="/executions" className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Executions
        </Link>
        <div className="mt-6 space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-16 bg-zinc-900/50 border border-zinc-800/50 rounded-lg animate-pulse" style={{ animationDelay: `${i * 100}ms` }} />
          ))}
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="max-w-5xl">
        <Link href="/executions" className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Executions
        </Link>
        <div className="mt-6 bg-red-500/5 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { execution, nodes } = data;
  const statusStyle = getStatusStyle(execution.status);

  return (
    <div className="max-w-5xl">
      {/* Back link */}
      <Link href="/executions" className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-zinc-300 transition-colors">
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        Executions
      </Link>

      {/* Header */}
      <div className="mt-4 bg-zinc-900/80 border border-zinc-800 rounded-lg overflow-hidden">
        <div className="px-5 py-4">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-lg font-semibold text-zinc-100 font-mono">#{execution.id}</h1>
            <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border uppercase tracking-wider ${statusStyle.badge}`}>
              <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1.5 ${statusStyle.dot}`} />
              {execution.status}
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded border bg-zinc-800/50 text-zinc-500 border-zinc-700/50 uppercase tracking-wider">
              {execution.mode}
            </span>
          </div>
          <p className="text-sm text-zinc-400 mt-1.5 font-mono">{execution.workflowName}</p>
        </div>

        {/* Metadata strip */}
        <div className="flex items-center gap-6 px-5 py-2.5 bg-zinc-950/40 border-t border-zinc-800/50 text-[11px] font-mono flex-wrap">
          <div className="text-zinc-500">
            Started <span className="text-zinc-300">{formatTimestamp(execution.startedAt)}</span>
          </div>
          <div className="text-zinc-500">
            Finished <span className="text-zinc-300">{formatTimestamp(execution.stoppedAt)}</span>
          </div>
          <div className="text-zinc-500">
            Duration <span className="text-zinc-200 font-semibold">{formatDuration(execution.duration)}</span>
          </div>
          <div className="text-zinc-500">
            Nodes <span className="text-zinc-300">{nodes.length}</span>
          </div>
        </div>

        {/* Execution error */}
        {execution.error && (
          <div className="mx-5 mb-4 mt-3 bg-red-500/5 border border-red-500/20 rounded-lg px-4 py-3">
            <p className="text-sm text-red-400 font-mono">{execution.error.message}</p>
            {execution.error.stack && (
              <>
                <button
                  onClick={() => setShowStack(!showStack)}
                  className="text-[10px] font-mono text-red-600 hover:text-red-400 mt-1 transition-colors"
                >
                  {showStack ? 'hide stack trace' : 'show stack trace'}
                </button>
                {showStack && (
                  <pre className="mt-2 text-[10px] text-red-400/60 font-mono whitespace-pre-wrap break-words max-h-48 overflow-auto">
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
        <div className="mt-5">
          <h2 className="text-[11px] font-mono font-semibold uppercase tracking-wider text-zinc-500 mb-2">
            Token Usage
          </h2>
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-lg overflow-hidden">
            <div className="grid grid-cols-5 gap-px bg-zinc-800/30">
              <div className="bg-zinc-900/60 px-4 py-2 text-[10px] font-mono font-semibold uppercase tracking-wider text-zinc-500">Model</div>
              <div className="bg-zinc-900/60 px-4 py-2 text-[10px] font-mono font-semibold uppercase tracking-wider text-zinc-500 text-right">Input</div>
              <div className="bg-zinc-900/60 px-4 py-2 text-[10px] font-mono font-semibold uppercase tracking-wider text-zinc-500 text-right">Output</div>
              <div className="bg-zinc-900/60 px-4 py-2 text-[10px] font-mono font-semibold uppercase tracking-wider text-zinc-500 text-right">Total</div>
              <div className="bg-zinc-900/60 px-4 py-2 text-[10px] font-mono font-semibold uppercase tracking-wider text-zinc-500 text-right">Source</div>
            </div>
            {tokenEntries.map(([model, info]) => (
              <div key={model} className="grid grid-cols-5 gap-px bg-zinc-800/30">
                <div className="bg-zinc-950/40 px-4 py-2.5 text-xs font-mono text-zinc-300">{model}</div>
                <div className="bg-zinc-950/40 px-4 py-2.5 text-xs font-mono text-emerald-400 text-right">{formatNumber(info.inputTokens)}</div>
                <div className="bg-zinc-950/40 px-4 py-2.5 text-xs font-mono text-sky-400 text-right">{formatNumber(info.outputTokens)}</div>
                <div className="bg-zinc-950/40 px-4 py-2.5 text-xs font-mono text-zinc-200 font-semibold text-right">{formatNumber(info.inputTokens + info.outputTokens)}</div>
                <div className="bg-zinc-950/40 px-4 py-2.5 text-right">
                  <span className={`text-[9px] font-mono px-1.5 py-0.5 rounded border ${
                    info.source === 'actual'
                      ? 'text-emerald-500 border-emerald-500/20 bg-emerald-500/5'
                      : 'text-amber-500 border-amber-500/20 bg-amber-500/5'
                  }`}>
                    {info.source}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Execution Flow */}
      <div className="mt-5">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-[11px] font-mono font-semibold uppercase tracking-wider text-zinc-500">
            Execution Flow
            <span className="text-zinc-600 ml-2">{nodes.length} node{nodes.length !== 1 ? 's' : ''}</span>
          </h2>
          <button
            onClick={() => setShowRaw(!showRaw)}
            className={`px-2.5 py-1 text-[10px] font-mono font-semibold rounded border transition-colors ${
              showRaw
                ? 'bg-zinc-700/50 text-zinc-200 border-zinc-600/50'
                : 'text-zinc-500 border-zinc-800 hover:text-zinc-300 hover:border-zinc-700'
            }`}
          >
            {showRaw ? 'Timeline' : 'Raw JSON'}
          </button>
        </div>

        {showRaw ? (
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2 bg-zinc-900/60 border-b border-zinc-800/50">
              <span className="text-[10px] font-mono text-zinc-500">Raw execution data</span>
              <button
                onClick={copyRaw}
                className="text-[10px] font-mono text-zinc-600 hover:text-zinc-300 transition-colors"
              >
                {rawCopied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <pre className="px-4 py-3 text-[11px] font-mono text-zinc-400 overflow-auto max-h-[600px] whitespace-pre-wrap break-words leading-relaxed">
              {rawText}
            </pre>
          </div>
        ) : (
          <div className="bg-zinc-900/80 border border-zinc-800 rounded-lg divide-y divide-zinc-800/40 overflow-hidden">
            {nodes.map((node, i) => (
              <NodeCard key={`${node.name}-${i}`} node={node} env={env} />
            ))}
            {nodes.length === 0 && (
              <div className="px-4 py-10 text-center text-sm text-zinc-600 font-mono">
                No node execution data available
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
