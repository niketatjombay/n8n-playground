# Execution Detail Page Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build an execution detail page at `/executions/[id]` showing full execution flow with node-level data, sub-workflow nesting, and LLM token usage summary.

**Architecture:** Extends the existing data layer (n8n client -> service -> API route -> page) with a new `getExecution()` client method, a `getExecutionDetail()` service that transforms raw n8n execution data into a structured shape with token extraction, a dynamic API route, and a new client page with vertical timeline UI.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4, js-tiktoken (new dependency for token estimation)

---

### Task 1: Install js-tiktoken dependency

**Files:**
- Modify: `package.json`

**Step 1: Install the package**

Run: `npm install js-tiktoken`

**Step 2: Verify installation**

Run: `node -e "const { encodingForModel } = require('js-tiktoken'); const enc = encodingForModel('gpt-4o'); console.log(enc.encode('hello world').length)"`
Expected: Outputs a number (2)

**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add js-tiktoken for LLM token estimation"
```

---

### Task 2: Add getExecution() to n8n API client

**Files:**
- Modify: `n8n/lib/n8n-client.js:88-92` (after existing `getExecutions` method)

**Step 1: Add the method**

Add this method to the `N8nClient` class, right after the existing `getExecutions` method (after line 92):

```javascript
async getExecution(executionId) {
  return this.request(`/executions/${executionId}?includeData=true`);
}
```

**Step 2: Verify the file is syntactically valid**

Run: `node -e "require('./n8n/lib/n8n-client.js'); console.log('OK')"`
Expected: `OK`

**Step 3: Commit**

```bash
git add n8n/lib/n8n-client.js
git commit -m "feat: add getExecution() method to n8n API client"
```

---

### Task 3: Add getExecutionDetail() service

**Files:**
- Modify: `n8n/services/executions.js`

**Step 1: Add token extraction helpers and the getExecutionDetail function**

Add the following after the existing `getExecutions` function and before `module.exports`:

```javascript
// LLM node type prefixes that may contain token usage data
const LLM_NODE_TYPES = [
  'n8n-nodes-langchain.lmChatOpenAi',
  '@n8n/n8n-nodes-langchain.lmChatOpenAi',
  'n8n-nodes-langchain.lmChatAnthropic',
  '@n8n/n8n-nodes-langchain.lmChatAnthropic',
  'n8n-nodes-langchain.lmChatGoogleGemini',
  '@n8n/n8n-nodes-langchain.lmChatGoogleGemini',
  '@n8n/n8n-nodes-langchain.openAi',
  'n8n-nodes-langchain.openAi',
  '@n8n/n8n-nodes-langchain.agent',
  'n8n-nodes-langchain.agent',
];

const EXECUTE_WORKFLOW_TYPES = [
  'n8n-nodes-base.executeWorkflow',
  '@n8n/n8n-nodes-base.executeWorkflow',
];

function isLlmNode(nodeType) {
  return LLM_NODE_TYPES.some(t => nodeType?.includes(t));
}

function isExecuteWorkflowNode(nodeType) {
  return EXECUTE_WORKFLOW_TYPES.some(t => nodeType?.includes(t));
}

/**
 * Search through node output data for token usage info.
 * Checks multiple known paths where LLM providers put usage data.
 */
function extractTokenUsage(outputData) {
  if (!outputData) return null;

  // Flatten all output items
  const items = [];
  if (Array.isArray(outputData.main)) {
    for (const branch of outputData.main) {
      if (Array.isArray(branch)) {
        for (const item of branch) {
          if (item?.json) items.push(item.json);
        }
      }
    }
  }

  for (const json of items) {
    // Direct usage object (OpenAI style)
    const usage = json.usage
      || json.response?.usage
      || json.message?.usage
      || json.data?.usage
      || json.tokenUsage
      || json.response?.body?.usage;

    if (usage) {
      const inputTokens = usage.prompt_tokens ?? usage.promptTokens ?? usage.input_tokens ?? 0;
      const outputTokens = usage.completion_tokens ?? usage.completionTokens ?? usage.output_tokens ?? 0;
      const model = json.model || json.response?.model || json.message?.model || usage.model || 'unknown';
      if (inputTokens > 0 || outputTokens > 0) {
        return { model, inputTokens, outputTokens, source: 'actual' };
      }
    }
  }

  return null;
}

/**
 * Estimate token count using tiktoken for text content.
 */
function estimateTokens(text) {
  if (!text || typeof text !== 'string') return 0;
  try {
    const { encodingForModel } = require('js-tiktoken');
    const enc = encodingForModel('gpt-4o');
    const count = enc.encode(text).length;
    return count;
  } catch {
    // Rough fallback: ~4 chars per token
    return Math.ceil(text.length / 4);
  }
}

/**
 * Try to estimate tokens from node input/output text when actual usage isn't available.
 */
function estimateNodeTokenUsage(nodeData, workflowNode) {
  let inputText = '';
  let outputText = '';

  // Extract text from input data
  if (nodeData.inputData?.main) {
    for (const branch of nodeData.inputData.main) {
      if (Array.isArray(branch)) {
        for (const item of branch) {
          if (item?.json) inputText += JSON.stringify(item.json);
        }
      }
    }
  }

  // Extract text from output data
  if (nodeData.data?.main) {
    for (const branch of nodeData.data.main) {
      if (Array.isArray(branch)) {
        for (const item of branch) {
          if (item?.json) outputText += JSON.stringify(item.json);
        }
      }
    }
  }

  if (!inputText && !outputText) return null;

  const model = workflowNode?.parameters?.model
    || workflowNode?.parameters?.modelId
    || workflowNode?.parameters?.options?.model
    || 'unknown';

  return {
    model,
    inputTokens: estimateTokens(inputText),
    outputTokens: estimateTokens(outputText),
    source: 'estimated',
  };
}

/**
 * Build an ordered list of nodes from execution runData and workflow definition.
 */
function buildNodeList(runData, workflowData) {
  if (!runData) return [];

  // Build a node type lookup from workflow definition
  const nodeTypeMap = {};
  const nodeParamsMap = {};
  if (workflowData?.nodes) {
    for (const node of workflowData.nodes) {
      nodeTypeMap[node.name] = node.type;
      nodeParamsMap[node.name] = node;
    }
  }

  // Build nodes from runData, ordered by startTime
  const nodes = [];
  for (const [nodeName, executions] of Object.entries(runData)) {
    const exec = executions[0]; // Take first execution run
    if (!exec) continue;

    const nodeType = nodeTypeMap[nodeName] || 'unknown';
    const workflowNode = nodeParamsMap[nodeName] || null;

    const node = {
      name: nodeName,
      type: nodeType,
      status: exec.executionStatus || 'success',
      executionTimeMs: exec.executionTime || 0,
      startTime: exec.startTime || 0,
      inputData: null, // Will be populated from source connections
      outputData: exec.data || null,
      tokenUsage: null,
      isSubWorkflow: isExecuteWorkflowNode(nodeType),
      subExecution: null,
      error: exec.error || null,
    };

    // Extract token usage for LLM nodes
    if (isLlmNode(nodeType)) {
      const actualUsage = extractTokenUsage(exec.data);
      if (actualUsage) {
        node.tokenUsage = actualUsage;
      } else {
        node.tokenUsage = estimateNodeTokenUsage(exec, workflowNode);
      }
    }

    nodes.push(node);
  }

  // Sort by startTime
  nodes.sort((a, b) => a.startTime - b.startTime);

  return nodes;
}

/**
 * Aggregate token usage across all nodes (including sub-workflow nodes) by model.
 */
function aggregateTokenSummary(nodes) {
  const summary = {};

  for (const node of nodes) {
    if (node.tokenUsage) {
      const { model, inputTokens, outputTokens, source } = node.tokenUsage;
      if (!summary[model]) {
        summary[model] = { inputTokens: 0, outputTokens: 0, source };
      }
      summary[model].inputTokens += inputTokens;
      summary[model].outputTokens += outputTokens;
      // If any source is 'estimated', mark the whole model as 'mixed'
      if (summary[model].source !== source) {
        summary[model].source = 'mixed';
      }
    }

    // Recurse into sub-workflow nodes
    if (node.subExecution?.nodes) {
      const subSummary = aggregateTokenSummary(node.subExecution.nodes);
      for (const [model, usage] of Object.entries(subSummary)) {
        if (!summary[model]) {
          summary[model] = { inputTokens: 0, outputTokens: 0, source: usage.source };
        }
        summary[model].inputTokens += usage.inputTokens;
        summary[model].outputTokens += usage.outputTokens;
        if (summary[model].source !== usage.source) {
          summary[model].source = 'mixed';
        }
      }
    }
  }

  return summary;
}

async function getExecutionDetail({ executionId, env: envArg }) {
  loadEnv();

  if (!executionId || !envArg) {
    return { success: false, error: 'executionId and env are required' };
  }

  const env = resolveEnv(envArg);

  try {
    const client = new N8nClient();
    const raw = await client.getExecution(executionId);

    if (!raw || !raw.id) {
      return { success: false, error: `Execution ${executionId} not found` };
    }

    const runData = raw.data?.resultData?.runData || {};
    const workflowData = raw.workflowData || {};

    // Build the node list
    const nodes = buildNodeList(runData, workflowData);

    // Fetch sub-workflow executions for Execute Workflow nodes
    for (const node of nodes) {
      if (node.isSubWorkflow && node.outputData) {
        // Try to find sub-execution ID from output data
        let subExecutionId = null;

        // Check output items for executionId reference
        if (node.outputData.main) {
          for (const branch of node.outputData.main) {
            if (Array.isArray(branch)) {
              for (const item of branch) {
                if (item?.json?.executionId) {
                  subExecutionId = item.json.executionId;
                  break;
                }
              }
              if (subExecutionId) break;
            }
          }
        }

        // If no executionId in output, try to find from the execution metadata
        if (!subExecutionId && node.outputData.metadata?.subExecution?.executionId) {
          subExecutionId = node.outputData.metadata.subExecution.executionId;
        }

        if (subExecutionId) {
          try {
            const subRaw = await client.getExecution(subExecutionId);
            if (subRaw?.id) {
              const subRunData = subRaw.data?.resultData?.runData || {};
              const subWorkflowData = subRaw.workflowData || {};
              node.subExecution = {
                id: subRaw.id,
                workflowName: subWorkflowData.name || 'Sub-workflow',
                status: subRaw.status || 'unknown',
                nodes: buildNodeList(subRunData, subWorkflowData),
              };
            }
          } catch (err) {
            // Sub-execution fetch failed; continue without it
            node.subExecution = { id: subExecutionId, workflowName: 'Unknown', status: 'error', nodes: [], error: err.message };
          }
        }
      }
    }

    // Build token summary
    const tokenSummary = aggregateTokenSummary(nodes);

    // Build execution metadata
    const execution = {
      id: raw.id,
      status: raw.status || 'unknown',
      startedAt: raw.startedAt || null,
      stoppedAt: raw.stoppedAt || null,
      duration: raw.stoppedAt && raw.startedAt
        ? new Date(raw.stoppedAt).getTime() - new Date(raw.startedAt).getTime()
        : null,
      mode: raw.mode || 'unknown',
      finished: raw.finished ?? false,
      workflowName: workflowData.name || 'Unknown Workflow',
      error: raw.data?.resultData?.error
        ? { message: raw.data.resultData.error.message || 'Unknown error', stack: raw.data.resultData.error.stack || null }
        : null,
    };

    return {
      success: true,
      execution,
      nodes,
      tokenSummary,
      raw,
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
```

**Step 2: Update module.exports**

Change the exports line to include the new function:

```javascript
module.exports = { getExecutions, getExecutionDetail };
```

**Step 3: Verify the file is syntactically valid**

Run: `node -e "require('./n8n/services/executions.js'); console.log('OK')"`
Expected: `OK`

**Step 4: Commit**

```bash
git add n8n/services/executions.js
git commit -m "feat: add getExecutionDetail service with token extraction"
```

---

### Task 4: Add API route for execution detail

**Files:**
- Create: `app/api/executions/[id]/route.ts`

**Step 1: Create the dynamic API route**

```typescript
import { NextResponse } from 'next/server';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const env = searchParams.get('env');

    if (!env) {
      return NextResponse.json(
        { success: false, error: 'env query parameter is required' },
        { status: 400 }
      );
    }

    const { getExecutionDetail } = require('@/n8n/services/executions');
    const data = await getExecutionDetail({ executionId: id, env });

    if (!data.success) {
      return NextResponse.json(data, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
```

Note: In Next.js 16, dynamic route params are accessed via `await params` (they are a Promise).

**Step 2: Verify the build compiles**

Run: `npx next build 2>&1 | tail -5`
Expected: Build completes without errors (or at least the route compiles)

**Step 3: Commit**

```bash
git add app/api/executions/\[id\]/route.ts
git commit -m "feat: add GET /api/executions/[id] API route"
```

---

### Task 5: Make execution IDs clickable on the list page

**Files:**
- Modify: `app/executions/page.tsx:110-111`

**Step 1: Add Link import and make IDs clickable**

Add this import at the top of the file (after the existing imports):

```typescript
import Link from 'next/link';
```

Replace the execution ID table cell (around line 111):

```typescript
<td className="px-4 py-2.5 text-zinc-300 font-mono text-xs">{exec.id}</td>
```

With:

```typescript
<td className="px-4 py-2.5">
  <Link
    href={`/executions/${exec.id}?env=${env}`}
    className="text-blue-400 hover:text-blue-300 font-mono text-xs underline underline-offset-2"
  >
    {exec.id}
  </Link>
</td>
```

**Step 2: Verify no lint errors**

Run: `npx eslint app/executions/page.tsx`
Expected: No errors

**Step 3: Commit**

```bash
git add app/executions/page.tsx
git commit -m "feat: make execution IDs clickable links to detail page"
```

---

### Task 6: Build the execution detail page

**Files:**
- Create: `app/executions/[id]/page.tsx`

**Step 1: Create the execution detail page component**

This is a large file. Create it with the following content:

```tsx
'use client';

import { useState, useEffect, use } from 'react';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { useSearchParams } from 'next/navigation';

// --- Types ---

interface TokenUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  source: 'actual' | 'estimated' | 'mixed';
}

interface ExecutionNode {
  name: string;
  type: string;
  status: string;
  executionTimeMs: number;
  startTime: number;
  inputData: any;
  outputData: any;
  tokenUsage: TokenUsage | null;
  isSubWorkflow: boolean;
  subExecution: SubExecution | null;
  error: any;
}

interface SubExecution {
  id: string;
  workflowName: string;
  status: string;
  nodes: ExecutionNode[];
  error?: string;
}

interface ExecutionMeta {
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
  [model: string]: {
    inputTokens: number;
    outputTokens: number;
    source: string;
  };
}

interface ExecutionDetailData {
  success: boolean;
  error?: string;
  execution: ExecutionMeta;
  nodes: ExecutionNode[];
  tokenSummary: TokenSummary;
  raw: any;
}

// --- Helpers ---

function statusColor(status: string) {
  switch (status) {
    case 'success': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
    case 'error': return 'bg-red-500/10 text-red-400 border-red-500/20';
    case 'waiting': return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
    case 'running': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
    default: return 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20';
  }
}

function statusDot(status: string) {
  switch (status) {
    case 'success': return 'bg-emerald-400';
    case 'error': return 'bg-red-400';
    case 'waiting': return 'bg-amber-400';
    case 'running': return 'bg-blue-400';
    default: return 'bg-zinc-400';
  }
}

function formatDuration(ms: number | null) {
  if (ms === null) return '--';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function formatTimestamp(ts: string | null) {
  if (!ts) return '--';
  return new Date(ts).toLocaleString();
}

function formatNumber(n: number) {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
  return String(n);
}

// --- Sub-components ---

function JsonViewer({ data, label }: { data: any; label: string }) {
  const [copied, setCopied] = useState(false);
  const text = JSON.stringify(data, null, 2);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="mt-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-zinc-500 font-medium uppercase">{label}</span>
        <button
          onClick={copyToClipboard}
          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
        >
          {copied ? 'Copied!' : 'Copy'}
        </button>
      </div>
      <pre className="bg-zinc-950 border border-zinc-800 rounded-lg p-3 text-xs text-zinc-300 overflow-x-auto max-h-64 overflow-y-auto font-mono whitespace-pre-wrap break-all">
        {text}
      </pre>
    </div>
  );
}

function NodeCard({ node, depth = 0 }: { node: ExecutionNode; depth?: number }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className={depth > 0 ? 'ml-6' : ''}>
      <div
        className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-800/50 cursor-pointer rounded-lg transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Timeline dot */}
        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${statusDot(node.status)}`} />

        {/* Node name and type */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm text-zinc-200 font-medium truncate">{node.name}</span>
            {node.isSubWorkflow && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20 flex-shrink-0">
                sub-workflow
              </span>
            )}
          </div>
          <span className="text-xs text-zinc-500 truncate block">{node.type}</span>
        </div>

        {/* Token usage badge for LLM nodes */}
        {node.tokenUsage && (
          <div className="flex-shrink-0 text-xs px-2 py-1 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-mono">
            {node.tokenUsage.model}: {formatNumber(node.tokenUsage.inputTokens)}in / {formatNumber(node.tokenUsage.outputTokens)}out
          </div>
        )}

        {/* Execution time */}
        <span className="text-xs text-zinc-500 font-mono flex-shrink-0 w-16 text-right">
          {formatDuration(node.executionTimeMs)}
        </span>

        {/* Expand indicator */}
        <svg
          className={`w-4 h-4 text-zinc-500 transition-transform flex-shrink-0 ${expanded ? 'rotate-90' : ''}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="ml-8 mr-4 mb-3 space-y-2">
          {/* Error info */}
          {node.error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-xs text-red-400">
              {typeof node.error === 'string' ? node.error : node.error.message || JSON.stringify(node.error)}
            </div>
          )}

          {/* Input data */}
          {node.inputData && (
            <JsonViewer data={node.inputData} label="Input" />
          )}

          {/* Output data */}
          {node.outputData && (
            <JsonViewer data={node.outputData} label="Output" />
          )}

          {/* Sub-workflow nodes */}
          {node.subExecution && node.subExecution.nodes.length > 0 && (
            <div className="mt-3 border border-purple-500/20 rounded-lg p-3 bg-purple-500/5">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs font-medium text-purple-400">
                  Sub: {node.subExecution.workflowName}
                </span>
                <span className="text-[10px] text-zinc-500 font-mono">
                  (Execution #{node.subExecution.id})
                </span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded ${statusColor(node.subExecution.status)}`}>
                  {node.subExecution.status}
                </span>
              </div>
              <div className="space-y-0.5">
                {node.subExecution.nodes.map((subNode, i) => (
                  <NodeCard key={`${subNode.name}-${i}`} node={subNode} depth={depth + 1} />
                ))}
              </div>
            </div>
          )}

          {node.subExecution?.error && !node.subExecution.nodes.length && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 text-xs text-red-400">
              Failed to load sub-workflow execution: {node.subExecution.error}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- Main Page ---

export default function ExecutionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const searchParams = useSearchParams();
  const env = searchParams.get('env') || 'development';

  const [data, setData] = useState<ExecutionDetailData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  useEffect(() => {
    const fetchDetail = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await apiFetch(`/api/executions/${id}?env=${env}`);
        const json = await res.json();
        if (json.success) {
          setData(json);
        } else {
          setError(json.error || 'Failed to load execution detail');
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchDetail();
  }, [id, env]);

  if (loading) {
    return (
      <div>
        <Link href="/executions" className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors">
          &larr; Back to Executions
        </Link>
        <div className="mt-8 text-zinc-400 text-sm">Loading execution details...</div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div>
        <Link href="/executions" className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors">
          &larr; Back to Executions
        </Link>
        <div className="mt-8 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400">
          {error || 'No data available'}
        </div>
      </div>
    );
  }

  const { execution, nodes, tokenSummary, raw } = data;
  const hasTokens = Object.keys(tokenSummary).length > 0;

  return (
    <div>
      {/* Back link */}
      <Link href="/executions" className="text-sm text-zinc-400 hover:text-zinc-200 transition-colors">
        &larr; Back to Executions
      </Link>

      {/* Header card */}
      <div className="mt-4 bg-zinc-900 border border-zinc-800 rounded-lg p-5">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-semibold text-zinc-100">
                Execution #{execution.id}
              </h1>
              <span className={`text-xs px-2 py-0.5 rounded border ${statusColor(execution.status)}`}>
                {execution.status}
              </span>
              <span className="text-xs px-2 py-0.5 rounded bg-zinc-800 text-zinc-400 border border-zinc-700">
                {execution.mode}
              </span>
            </div>
            <p className="text-sm text-zinc-400 mt-1">
              {execution.workflowName}
            </p>
          </div>
        </div>

        <div className="flex gap-6 mt-4 text-sm">
          <div>
            <span className="text-zinc-500">Started:</span>{' '}
            <span className="text-zinc-300">{formatTimestamp(execution.startedAt)}</span>
          </div>
          <div>
            <span className="text-zinc-500">Finished:</span>{' '}
            <span className="text-zinc-300">{formatTimestamp(execution.stoppedAt)}</span>
          </div>
          <div>
            <span className="text-zinc-500">Duration:</span>{' '}
            <span className="text-zinc-300 font-mono">{formatDuration(execution.duration)}</span>
          </div>
        </div>

        {/* Execution-level error */}
        {execution.error && (
          <div className="mt-4 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
            <p className="text-sm font-medium text-red-400">Error</p>
            <p className="text-xs text-red-300 mt-1">{execution.error.message}</p>
            {execution.error.stack && (
              <pre className="text-[10px] text-red-300/60 mt-2 overflow-x-auto whitespace-pre-wrap">{execution.error.stack}</pre>
            )}
          </div>
        )}
      </div>

      {/* Token summary table */}
      {hasTokens && (
        <div className="mt-6 bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-zinc-800">
            <h2 className="text-sm font-medium text-zinc-200">Token Usage by Model</h2>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-left">
                <th className="px-4 py-2.5 text-zinc-400 font-medium text-xs">Model</th>
                <th className="px-4 py-2.5 text-zinc-400 font-medium text-xs text-right">Input Tokens</th>
                <th className="px-4 py-2.5 text-zinc-400 font-medium text-xs text-right">Output Tokens</th>
                <th className="px-4 py-2.5 text-zinc-400 font-medium text-xs text-right">Total</th>
                <th className="px-4 py-2.5 text-zinc-400 font-medium text-xs">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {Object.entries(tokenSummary).map(([model, usage]) => (
                <tr key={model}>
                  <td className="px-4 py-2.5 text-zinc-300 font-mono text-xs">{model}</td>
                  <td className="px-4 py-2.5 text-zinc-300 font-mono text-xs text-right">{usage.inputTokens.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-zinc-300 font-mono text-xs text-right">{usage.outputTokens.toLocaleString()}</td>
                  <td className="px-4 py-2.5 text-zinc-200 font-mono text-xs text-right font-medium">
                    {(usage.inputTokens + usage.outputTokens).toLocaleString()}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded ${
                      usage.source === 'actual'
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : usage.source === 'estimated'
                        ? 'bg-amber-500/10 text-amber-400'
                        : 'bg-zinc-500/10 text-zinc-400'
                    }`}>
                      {usage.source}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Execution flow */}
      <div className="mt-6 bg-zinc-900 border border-zinc-800 rounded-lg">
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
          <h2 className="text-sm font-medium text-zinc-200">
            Execution Flow
            <span className="text-zinc-500 ml-2 font-normal">({nodes.length} nodes)</span>
          </h2>
          <button
            onClick={() => setShowRaw(!showRaw)}
            className="text-xs px-3 py-1.5 rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors border border-zinc-700"
          >
            {showRaw ? 'Hide Raw' : 'View Raw'}
          </button>
        </div>

        {showRaw ? (
          <div className="p-4">
            <JsonViewer data={raw} label="Raw Execution Data" />
          </div>
        ) : (
          <div className="py-2">
            {nodes.length === 0 ? (
              <p className="px-4 py-3 text-sm text-zinc-500">No node execution data available.</p>
            ) : (
              <div className="space-y-0.5">
                {nodes.map((node, i) => (
                  <NodeCard key={`${node.name}-${i}`} node={node} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Verify lint passes**

Run: `npx eslint app/executions/\[id\]/page.tsx`
Expected: No errors

**Step 3: Verify the build compiles**

Run: `npm run build 2>&1 | tail -10`
Expected: Build succeeds

**Step 4: Commit**

```bash
git add app/executions/\[id\]/page.tsx
git commit -m "feat: add execution detail page with timeline, tokens, and sub-workflows"
```

---

### Task 7: Manual smoke test

**Step 1: Start the dev server**

Run: `npm run dev`

**Step 2: Test the full flow**

1. Navigate to `http://localhost:3001/executions`
2. Select a workflow and environment, click Load
3. Verify execution IDs are now blue clickable links
4. Click an execution ID
5. Verify the detail page loads with:
   - Header card showing execution metadata
   - Token summary table (if LLM nodes present)
   - Vertical timeline of nodes
   - Click a node to expand and see input/output JSON
   - Sub-workflow nodes show nested execution data
   - View Raw button shows full JSON
6. Click "Back to Executions" to return to list
7. Test with a failed execution if available (verify error display)

**Step 3: Fix any issues found during testing**

**Step 4: Final commit (if fixes needed)**

```bash
git add -A
git commit -m "fix: address issues found during execution detail smoke test"
```
