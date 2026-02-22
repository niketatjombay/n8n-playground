# Functionality Gaps Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement all 17 functionality gaps identified in the design doc — existing feature fixes, new features, and production hardening.

**Architecture:** All changes follow existing patterns: client pages in `app/`, API routes in `app/api/`, services in `n8n/services/`, shared components in `components/`. New pages follow the same `useEffect` fetch + form + OperationLog pattern. New services follow the same `loadEnv()` + structured JSON return pattern.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4, Node.js (CommonJS services)

---

## Phase 1 — Quick Wins

### Task 1: Remove unused `workflows.config.js`

**Files:**
- Delete: `n8n/config/workflows.config.js`
- Modify: `n8n/README.md` (remove reference if it mentions workflows.config.js)

**Step 1: Verify no code imports this file**

Run: `grep -r "workflows.config" --include="*.js" --include="*.ts" --include="*.tsx" n8n/ app/`
Expected: No matches (only README and design doc reference it)

**Step 2: Delete the file**

```bash
rm n8n/config/workflows.config.js
```

**Step 3: Commit**

```bash
git add -u
git commit -m "chore: remove unused workflows.config.js"
```

---

### Task 2: Update Sidebar with all new navigation links

**Files:**
- Modify: `components/Sidebar.tsx`

**Step 1: Update the navLinks array**

Replace the existing `navLinks` array in `components/Sidebar.tsx` with:

```typescript
const navLinks = [
  { href: '/', label: 'Dashboard' },
  { href: '/workflows', label: 'Workflows' },
  { href: '/executions', label: 'Executions' },
  { href: '/deploy', label: 'Deploy' },
  { href: '/promote', label: 'Promote' },
  { href: '/backup', label: 'Backup' },
  { href: '/activate', label: 'Activate' },
  { href: '/test', label: 'Test' },
  { href: '/history', label: 'History' },
  { href: '/activity', label: 'Activity' },
];
```

**Step 2: Verify the dev server renders correctly**

Run: `npm run dev` and check sidebar at http://localhost:3001
Expected: All 10 links visible. New links (Executions, Activate, History, Activity) show but 404 when clicked (pages not created yet).

**Step 3: Commit**

```bash
git add components/Sidebar.tsx
git commit -m "feat: add Executions, Activate, History, Activity to sidebar nav"
```

---

### Task 3: Add health check endpoint

**Files:**
- Create: `app/api/health/route.ts`

**Step 1: Create the health check route**

Create `app/api/health/route.ts`:

```typescript
import { NextResponse } from 'next/server';

export async function GET() {
  const result: Record<string, unknown> = {
    status: 'ok',
    timestamp: new Date().toISOString(),
  };

  // Check n8n connectivity
  try {
    const N8nClient = require('@/n8n/lib/n8n-client');
    const { loadEnv } = require('@/n8n/lib/env-loader');
    loadEnv();
    const client = new N8nClient();
    await client.request('/workflows?limit=1');
    result.n8n = {
      reachable: true,
      url: process.env.N8N_BASE_URL || 'http://localhost:5678',
    };
  } catch (err: any) {
    result.n8n = {
      reachable: false,
      error: err.message,
    };
    result.status = 'degraded';
  }

  // Check metadata
  try {
    const { readMetadata, listWorkflowSlugs, listSubWorkflowSlugs, findTodoPlaceholders } = require('@/n8n/lib/metadata');
    readMetadata();
    result.metadata = {
      workflows: listWorkflowSlugs().length,
      subWorkflows: listSubWorkflowSlugs().length,
      todoCount: findTodoPlaceholders().length,
    };
  } catch (err: any) {
    result.metadata = { error: err.message };
    result.status = 'degraded';
  }

  const httpStatus = result.status === 'ok' ? 200 : 503;
  return NextResponse.json(result, { status: httpStatus });
}
```

**Step 2: Test the endpoint**

Run: `curl http://localhost:3001/api/health | jq .`
Expected: JSON with status, n8n reachability, metadata counts.

**Step 3: Commit**

```bash
git add app/api/health/route.ts
git commit -m "feat: add /api/health endpoint with n8n + metadata checks"
```

---

### Task 4: Improve loading/error states on dropdown fetches

All pages that fetch `/api/status` to populate dropdowns (Deploy, Promote, Backup, Test) silently swallow errors with `.catch(() => {})`. Fix all of them.

**Files:**
- Modify: `app/deploy/page.tsx`
- Modify: `app/promote/page.tsx`
- Modify: `app/backup/page.tsx`
- Modify: `app/test/page.tsx`

**Step 1: Create a shared StatusFetch component**

Create `components/StatusFetcher.tsx`:

```typescript
'use client';

import { useEffect, useState } from 'react';

interface StatusFetcherProps {
  onSlugs: (slugs: string[]) => void;
  onWorkflows?: (workflows: any[]) => void;
}

export function useStatusFetch() {
  const [slugs, setSlugs] = useState<string[]>([]);
  const [workflows, setWorkflows] = useState<any[]>([]);
  const [statusLoading, setStatusLoading] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);

  const fetchStatus = () => {
    setStatusLoading(true);
    setStatusError(null);
    fetch('/api/status')
      .then((res) => res.json())
      .then((json) => {
        if (json.success) {
          setSlugs(json.data.workflows.map((w: any) => w.slug));
          setWorkflows(json.data.workflows);
        } else {
          setStatusError(json.error || 'Failed to load workflow list');
        }
      })
      .catch((err) => setStatusError(err.message))
      .finally(() => setStatusLoading(false));
  };

  useEffect(() => {
    fetchStatus();
  }, []);

  return { slugs, workflows, statusLoading, statusError, refetchStatus: fetchStatus };
}

export function StatusError({ error, onRetry }: { error: string; onRetry: () => void }) {
  return (
    <div className="mt-6 max-w-lg bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3">
      <p className="text-sm text-red-400">{error}</p>
      <button
        onClick={onRetry}
        className="mt-2 px-3 py-1.5 text-xs font-medium rounded bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors"
      >
        Retry
      </button>
    </div>
  );
}
```

**Step 2: Update Deploy page**

In `app/deploy/page.tsx`, replace the status fetch `useEffect` and add error handling. Replace:

```typescript
const [slugs, setSlugs] = useState<string[]>([]);
```

and the `useEffect` that calls `/api/status` with:

```typescript
import { useStatusFetch, StatusError } from '@/components/StatusFetcher';

// Inside the component:
const { slugs, statusLoading, statusError, refetchStatus } = useStatusFetch();
```

Add before the form:

```tsx
{statusError && <StatusError error={statusError} onRetry={refetchStatus} />}
{statusLoading && <div className="mt-6 text-sm text-zinc-500">Loading workflows...</div>}
```

Keep the `searchParams` pre-selection logic but read from `slugs` once available.

**Step 3: Update Promote page** — same pattern as Deploy.

**Step 4: Update Backup page** — same pattern.

**Step 5: Update Test page** — same pattern.

**Step 6: Verify all pages show error state when API is unreachable**

Temporarily set an invalid `N8N_BASE_URL` and load each page.
Expected: Red error banner with "Retry" button instead of empty dropdowns.

**Step 7: Commit**

```bash
git add components/StatusFetcher.tsx app/deploy/page.tsx app/promote/page.tsx app/backup/page.tsx app/test/page.tsx
git commit -m "feat: add loading/error states with retry for status dropdown fetches"
```

---

### Task 5: Pre-populate Test page with default payload

**Files:**
- Modify: `n8n/services/status.js` (include `input` field in workflow data)
- Modify: `app/test/page.tsx`

**Step 1: Add `input` field to status service**

In `n8n/services/status.js`, inside the `for (const slug of slugs)` loop, add `input` to the pushed object. After the line that sets `usesSubWorkflows`, add:

```javascript
input: entry.input || null,
```

So the workflow object becomes:
```javascript
workflows.push({
  slug,
  description: entry.description || null,
  usesSubWorkflows: entry.uses_sub_workflows || [],
  input: entry.input || null,
  environments
});
```

**Step 2: Update Test page to pre-populate payload on slug change**

In `app/test/page.tsx`, store the full workflows array from status. When `slug` changes, look up the workflow's `input` field and set it as the payload:

```typescript
const { slugs, workflows, statusLoading, statusError, refetchStatus } = useStatusFetch();

// When slug changes, pre-populate payload
useEffect(() => {
  if (slug && workflows.length > 0) {
    const wf = workflows.find((w: any) => w.slug === slug);
    if (wf?.input) {
      setPayload(JSON.stringify(wf.input, null, 2));
    }
  }
}, [slug, workflows]);
```

**Step 3: Verify**

Select a workflow that has `input` defined in metadata.json.
Expected: Textarea auto-fills with the default payload JSON.

**Step 4: Commit**

```bash
git add n8n/services/status.js app/test/page.tsx
git commit -m "feat: pre-populate test payload from workflow metadata input field"
```

---

### Task 6: Add Dashboard refresh button and auto-polling

**Files:**
- Modify: `app/page.tsx`

**Step 1: Add refresh button and polling to Dashboard**

Refactor the Dashboard to extract the fetch logic into a `fetchData` function. Add:

```typescript
const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

const fetchData = () => {
  setLoading(true);
  fetch('/api/status')
    .then((res) => res.json())
    .then((json) => {
      if (json.success) {
        setData(json.data);
        setError(null);
      } else {
        setError(json.error || 'Unknown error');
      }
    })
    .catch((err) => setError(err.message))
    .finally(() => {
      setLoading(false);
      setLastUpdated(new Date());
    });
};

useEffect(() => {
  fetchData();
}, []);

// Auto-poll every 30s, pause when tab is not visible
useEffect(() => {
  const interval = setInterval(() => {
    if (!document.hidden) {
      fetchData();
    }
  }, 30000);
  return () => clearInterval(interval);
}, []);
```

Add a refresh button and "last updated" indicator in the header area:

```tsx
<div className="flex items-center gap-4">
  <h1 className="text-2xl font-semibold text-zinc-100">Dashboard</h1>
  <button
    onClick={fetchData}
    disabled={loading}
    className="p-1.5 rounded-md text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-colors disabled:opacity-50"
    title="Refresh"
  >
    <svg className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  </button>
  {lastUpdated && (
    <span className="text-xs text-zinc-500">
      Updated {lastUpdated.toLocaleTimeString()}
    </span>
  )}
</div>
```

**Step 2: Verify**

Load Dashboard. Click refresh button — data reloads. Wait 30s — data auto-refreshes. Switch tabs and back — no unnecessary fetches during tab-away.

**Step 3: Commit**

```bash
git add app/page.tsx
git commit -m "feat: add refresh button and 30s auto-polling to Dashboard"
```

---

## Phase 2 — Activate Feature

### Task 7: Create Activate/Deactivate page

**Files:**
- Create: `app/activate/page.tsx`

**Step 1: Create the Activate page**

Create `app/activate/page.tsx` following the same pattern as Deploy/Backup pages:

```typescript
'use client';

import { useState } from 'react';
import { useStatusFetch, StatusError } from '@/components/StatusFetcher';

const ENVIRONMENTS = ['development', 'staging', 'production'];

export default function ActivatePage() {
  const { slugs, workflows, statusLoading, statusError, refetchStatus } = useStatusFetch();
  const [slug, setSlug] = useState('');
  const [env, setEnv] = useState('development');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Get current activation status for selected workflow+env
  const currentStatus = (() => {
    if (!slug || !workflows.length) return null;
    const wf = workflows.find((w: any) => w.slug === slug);
    if (!wf) return null;
    const envData = wf.environments?.[env];
    if (!envData || envData.isTodo) return null;
    return envData;
  })();

  const handleToggle = async (deactivate: boolean) => {
    if (!slug) return;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const res = await fetch('/api/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, env, deactivate }),
      });
      const json = await res.json();
      if (json.success) {
        setResult(json);
        refetchStatus(); // Refresh to get updated active status
      } else {
        setError(json.error || 'Operation failed');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-100">Activate / Deactivate</h1>
      <p className="text-sm text-zinc-400 mt-1">
        Toggle workflow activation status in n8n
      </p>

      {statusError && <StatusError error={statusError} onRetry={refetchStatus} />}
      {statusLoading && <div className="mt-6 text-sm text-zinc-500">Loading workflows...</div>}

      <div className="mt-8 max-w-lg space-y-5">
        {/* Workflow select */}
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">Workflow</label>
          <select
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">Select a workflow</option>
            {slugs.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {/* Environment select */}
        <div>
          <label className="block text-sm font-medium text-zinc-300 mb-1.5">Environment</label>
          <select
            value={env}
            onChange={(e) => setEnv(e.target.value)}
            className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
          >
            {ENVIRONMENTS.map((e) => (
              <option key={e} value={e}>{e}</option>
            ))}
          </select>
        </div>

        {/* Current status display */}
        {currentStatus && (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg px-4 py-3">
            <span className="text-sm text-zinc-400">Current status: </span>
            <span className={`text-sm font-medium ${currentStatus.active ? 'text-emerald-400' : 'text-zinc-500'}`}>
              {currentStatus.active ? 'Active' : 'Inactive'}
            </span>
            <span className="text-xs text-zinc-600 ml-2">
              (n8nId: {currentStatus.n8nId?.slice(0, 12)})
            </span>
          </div>
        )}

        {/* Action buttons */}
        <div className="flex gap-3">
          <button
            onClick={() => handleToggle(false)}
            disabled={loading || !slug || !currentStatus}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
          >
            {loading ? 'Processing...' : 'Activate'}
          </button>
          <button
            onClick={() => handleToggle(true)}
            disabled={loading || !slug || !currentStatus}
            className="px-5 py-2.5 bg-zinc-700 hover:bg-zinc-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
          >
            {loading ? 'Processing...' : 'Deactivate'}
          </button>
        </div>
      </div>

      {error && (
        <div className="mt-6 max-w-2xl bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {result && (
        <div className="mt-6 max-w-2xl bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-4 py-3 text-sm text-emerald-400">
          Workflow {result.slug} is now {result.active ? 'active' : 'inactive'} in {result.env}
        </div>
      )}
    </div>
  );
}
```

**Step 2: Verify**

Navigate to `/activate`. Select a workflow and environment. Click Activate/Deactivate.
Expected: Status updates, success message shown, status re-fetches to show updated state.

**Step 3: Commit**

```bash
git add app/activate/page.tsx
git commit -m "feat: add Activate/Deactivate page"
```

---

### Task 8: Add activate toggle to Dashboard WorkflowCard

**Files:**
- Modify: `components/WorkflowCard.tsx`

**Step 1: Add toggle button and API call to WorkflowCard**

Add an `onActivateToggle` callback prop and a small toggle button next to each environment's active/inactive pill. When clicked, call `/api/activate` and notify the parent to refresh.

Add a new prop to the interface:

```typescript
interface WorkflowCardProps {
  workflow: WorkflowData;
  envList: string[];
  onStatusChange?: () => void;
}
```

Inside each environment row (after the active/inactive pill), add a toggle button for environments that have a valid (non-TODO) n8nId:

```tsx
{!envData.isTodo && envData.n8nId && (
  <button
    onClick={async () => {
      // inline activate/deactivate call
    }}
    className="text-xs px-1.5 py-0.5 rounded bg-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors ml-auto"
  >
    {envData.active ? 'Deactivate' : 'Activate'}
  </button>
)}
```

Add state management for the inline API call (loading spinner per env).

**Step 2: Update Dashboard to pass onStatusChange**

In `app/page.tsx`, pass `onStatusChange={fetchData}` to each `<WorkflowCard>`.

**Step 3: Verify**

On Dashboard, each workflow card environment row shows a small "Activate" or "Deactivate" button. Clicking toggles the status and refreshes the card.

**Step 4: Commit**

```bash
git add components/WorkflowCard.tsx app/page.tsx
git commit -m "feat: add inline activate/deactivate toggle to Dashboard workflow cards"
```

---

## Phase 3 — Safety

### Task 9: Fix promote to abort on sub-workflow failure

**Files:**
- Modify: `n8n/services/promote.js`

**Step 1: Add early abort check after each sub-workflow deploy**

In `n8n/services/promote.js`, after the sub-workflow deploy loop (after the `for (const subSlug of subSlugs)` loop ends), add a check:

```javascript
// Abort if any sub-workflow failed
const subErrors = steps.filter(s => s.type === 'sub-workflow' && s.status === 'error');
if (subErrors.length > 0) {
  return {
    success: false,
    slug,
    sourceEnv,
    targetEnv,
    steps,
    error: `${subErrors.length} sub-workflow(s) failed — aborting main workflow promotion`
  };
}
```

Insert this between the end of the `for (const subSlug of subSlugs)` loop and the `// --- Promote main workflow ---` comment.

**Step 2: Verify**

Simulate a sub-workflow failure (e.g., by temporarily corrupting a sub-workflow JSON file). Run promote.
Expected: Promote returns `success: false` with the failure message. Main workflow is NOT deployed.

**Step 3: Commit**

```bash
git add n8n/services/promote.js
git commit -m "fix: abort promote if any sub-workflow deployment fails"
```

---

### Task 10: Add confirmation dialog component

**Files:**
- Create: `components/ConfirmDialog.tsx`

**Step 1: Create the ConfirmDialog component**

```typescript
'use client';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/60" onClick={onCancel} />

      {/* Dialog */}
      <div className="relative bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <h3 className="text-lg font-semibold text-zinc-100">{title}</h3>
        <p className="mt-2 text-sm text-zinc-400 whitespace-pre-line">{message}</p>

        <div className="mt-6 flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium rounded-lg bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-medium rounded-lg text-white transition-colors ${
              destructive
                ? 'bg-red-600 hover:bg-red-500'
                : 'bg-blue-600 hover:bg-blue-500'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add components/ConfirmDialog.tsx
git commit -m "feat: add reusable ConfirmDialog component"
```

---

### Task 11: Add confirmation dialogs to Deploy, Promote, and Activate pages

**Files:**
- Modify: `app/deploy/page.tsx`
- Modify: `app/promote/page.tsx`
- Modify: `app/activate/page.tsx`

**Step 1: Add confirmation to Deploy page**

Import `ConfirmDialog`. Add state `const [showConfirm, setShowConfirm] = useState(false);`. Change the Deploy button's `onClick` from `handleDeploy` to `() => setShowConfirm(true)`. Add the dialog:

```tsx
<ConfirmDialog
  open={showConfirm}
  title="Deploy Workflows"
  message={`Deploy ${slug || 'all workflows'} to ${env}?${
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
```

**Step 2: Add confirmation to Promote page** — same pattern. Message: `Promote ${slug} from ${sourceEnv} to ${targetEnv}?`

**Step 3: Add confirmation to Activate page** — same pattern. Message: `${deactivate ? 'Deactivate' : 'Activate'} ${slug} in ${env}?`

**Step 4: Verify**

On each page, clicking the action button now shows a modal. Cancel dismisses it. Confirm executes the operation. Production targets show red confirm button.

**Step 5: Commit**

```bash
git add app/deploy/page.tsx app/promote/page.tsx app/activate/page.tsx
git commit -m "feat: add confirmation dialogs before Deploy, Promote, and Activate"
```

---

## Phase 4 — Dry-Run & Diff

### Task 12: Add dry-run mode to deploy service

**Files:**
- Modify: `n8n/services/deploy.js`
- Modify: `app/api/deploy/route.ts`

**Step 1: Add dryRun parameter to deploy service**

In `n8n/services/deploy.js`, add `dryRun = false` to the function signature:

```javascript
async function deploy({ env, slug = null, dryRun = false }) {
```

In the sub-workflow loop, when `dryRun` is true, skip the actual API call and metadata write:

```javascript
if (dryRun) {
  const existingId = subEntry[env]?.n8nId;
  const wouldAction = (existingId && !existingId.startsWith('TODO')) ? 'would-update' : 'would-create';
  steps.push({
    type: 'sub-workflow',
    slug: subSlug,
    status: 'success',
    action: wouldAction,
    id: existingId || '(new)',
  });
  continue; // skip actual deploy
}
```

Same pattern for the main workflow loop.

**Step 2: Pass dryRun from API route**

In `app/api/deploy/route.ts`, extract `dryRun` from the body:

```typescript
const { env, slug, dryRun } = body;
const data = await deploy({ env, slug: slug || null, dryRun: dryRun || false });
```

**Step 3: Commit**

```bash
git add n8n/services/deploy.js app/api/deploy/route.ts
git commit -m "feat: add dry-run mode to deploy service"
```

---

### Task 13: Add dry-run mode to promote service

**Files:**
- Modify: `n8n/services/promote.js`
- Modify: `app/api/promote/route.ts`

**Step 1: Add dryRun parameter to promote service**

Same approach as deploy. Add `dryRun = false` to the function signature. When `dryRun` is true, skip the `deployOne()` call, the metadata writes, and the file writes. Still run `remapWorkflow()` so we can validate the remap succeeds. Return steps with `action: 'would-create'` or `action: 'would-update'`.

**Step 2: Pass dryRun from API route**

In `app/api/promote/route.ts`, extract and pass `dryRun`.

**Step 3: Commit**

```bash
git add n8n/services/promote.js app/api/promote/route.ts
git commit -m "feat: add dry-run mode to promote service"
```

---

### Task 14: Add Preview Changes button to Deploy and Promote pages

**Files:**
- Modify: `app/deploy/page.tsx`
- Modify: `app/promote/page.tsx`
- Modify: `components/OperationLog.tsx`

**Step 1: Update OperationLog to handle preview actions**

In `components/OperationLog.tsx`, update the success case to handle `would-create` and `would-update` actions with a distinct style (blue text instead of green):

```tsx
{step.status === 'success' && (
  <>
    {step.action && (
      <span className={step.action.startsWith('would-') ? 'text-blue-400' : 'text-emerald-400'}>
        {step.action}
      </span>
    )}
    {step.id && (
      <span className="text-zinc-400 ml-2">id: {step.id}</span>
    )}
  </>
)}
```

**Step 2: Add Preview button to Deploy page**

Add a "Preview Changes" button next to the Deploy button. It calls the same API with `dryRun: true` and shows the OperationLog with preview results. Then the user can click Deploy to execute for real.

```tsx
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
```

`handlePreview` is the same as `handleDeploy` but passes `dryRun: true` in the body.

**Step 3: Same for Promote page**

**Step 4: Commit**

```bash
git add app/deploy/page.tsx app/promote/page.tsx components/OperationLog.tsx
git commit -m "feat: add Preview Changes button with dry-run to Deploy and Promote"
```

---

### Task 15: Add environment diff view for Promote

**Files:**
- Create: `n8n/services/promote-preview.js`
- Create: `app/api/promote/preview/route.ts`
- Modify: `app/promote/page.tsx`

**Step 1: Create the promote-preview service**

Create `n8n/services/promote-preview.js`:

```javascript
const { loadEnv } = require('../lib/env-loader');
const { remapWorkflow } = require('../lib/env-remap');
const { readMetadata, getSubWorkflows, buildSubWorkflowIdMap, getWorkflowEnv } = require('../lib/metadata');
const { environments } = require('../config/environments.config');
const fs = require('fs');
const path = require('path');

function promotePreview({ slug, sourceEnv, targetEnv }) {
  loadEnv();

  const srcCfg = environments[sourceEnv];
  const tgtCfg = environments[targetEnv];
  if (!srcCfg || !tgtCfg) {
    return { success: false, error: 'Invalid environment' };
  }

  const meta = readMetadata();
  const entry = meta[slug];
  if (!entry) {
    return { success: false, error: `Workflow "${slug}" not found` };
  }

  const changes = [];

  // Name change
  changes.push({
    field: 'Workflow name prefix',
    from: srcCfg.prefix,
    to: tgtCfg.prefix,
  });

  // Webhook path
  const srcWebhook = entry[sourceEnv]?.webhookPath;
  const tgtWebhook = entry[targetEnv]?.webhookPath;
  if (srcWebhook || tgtWebhook) {
    changes.push({
      field: 'Webhook path',
      from: srcWebhook || '(none)',
      to: tgtWebhook || '(none)',
    });
  }

  // Sub-workflow ID mappings
  const subIdMap = buildSubWorkflowIdMap(slug, sourceEnv, targetEnv);
  for (const [srcId, tgtId] of Object.entries(subIdMap)) {
    changes.push({
      field: 'Sub-workflow ID',
      from: srcId,
      to: tgtId,
    });
  }

  // Core API URL
  if (srcCfg.coreApiUrl !== tgtCfg.coreApiUrl) {
    changes.push({
      field: 'Core API URL',
      from: srcCfg.coreApiUrl,
      to: tgtCfg.coreApiUrl,
    });
  }

  // Credentials
  const srcCred = srcCfg.credentials?.httpHeaderAuth;
  const tgtCred = tgtCfg.credentials?.httpHeaderAuth;
  if (srcCred?.id !== tgtCred?.id) {
    changes.push({
      field: 'httpHeaderAuth credential',
      from: `${srcCred?.name} (${srcCred?.id})`,
      to: `${tgtCred?.name} (${tgtCred?.id})`,
    });
  }

  // Fields stripped
  changes.push({
    field: 'Stripped fields',
    from: 'id, createdAt, updatedAt, versionId, etc.',
    to: '(removed)',
  });

  return { success: true, slug, sourceEnv, targetEnv, changes };
}

module.exports = { promotePreview };
```

**Step 2: Create the API route**

Create `app/api/promote/preview/route.ts`:

```typescript
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const slug = searchParams.get('slug');
    const sourceEnv = searchParams.get('sourceEnv');
    const targetEnv = searchParams.get('targetEnv');

    if (!slug || !sourceEnv || !targetEnv) {
      return NextResponse.json(
        { success: false, error: 'slug, sourceEnv, and targetEnv are required' },
        { status: 400 }
      );
    }

    const { promotePreview } = require('@/n8n/services/promote-preview');
    const data = promotePreview({ slug, sourceEnv, targetEnv });
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
```

**Step 3: Add diff view to Promote page**

In `app/promote/page.tsx`, add a "View Changes" button that fetches `/api/promote/preview` and renders a collapsible diff table:

```tsx
{diffData && (
  <div className="mt-6 max-w-2xl bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
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
```

**Step 4: Commit**

```bash
git add n8n/services/promote-preview.js app/api/promote/preview/route.ts app/promote/page.tsx
git commit -m "feat: add environment diff view for Promote"
```

---

## Phase 5 — Authentication

### Task 16: Add API key authentication with middleware

**Files:**
- Create: `middleware.ts` (Next.js root)
- Create: `app/login/page.tsx`
- Modify: `app/layout.tsx` (conditionally hide sidebar on login page)

**Step 1: Create the middleware**

Create `middleware.ts` at the project root:

```typescript
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const apiKey = process.env.PLAYGROUND_API_KEY;

  // If no API key is configured, auth is disabled
  if (!apiKey) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  // Allow login page and health check without auth
  if (pathname === '/login' || pathname === '/api/health') {
    return NextResponse.next();
  }

  // API routes: check Authorization header
  if (pathname.startsWith('/api/')) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${apiKey}`) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.next();
  }

  // Pages: check cookie
  const token = request.cookies.get('playground-token')?.value;
  if (token !== apiKey) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Match all routes except static files and _next
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
```

**Step 2: Create the login page**

Create `app/login/page.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [key, setKey] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    // Test the key against the health endpoint
    try {
      const res = await fetch('/api/health', {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (res.ok) {
        // Store in cookie (httpOnly not possible from client, but fine for this use case)
        document.cookie = `playground-token=${key}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=strict`;
        // Also store for API calls
        localStorage.setItem('playground-api-key', key);
        router.push('/');
      } else {
        setError('Invalid API key');
      }
    } catch {
      setError('Could not connect to server');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
      <div className="w-full max-w-sm">
        <h1 className="text-xl font-semibold text-zinc-100 text-center mb-8">n8n Playground</h1>
        <form onSubmit={handleLogin} className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">API Key</label>
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Enter your API key"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
              autoFocus
            />
          </div>
          {error && (
            <p className="text-sm text-red-400">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading || !key}
            className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>
      </div>
    </div>
  );
}
```

**Step 3: Add auth header to all API fetches**

Create a utility `lib/api.ts` that wraps fetch with the auth header:

```typescript
export async function apiFetch(url: string, options: RequestInit = {}) {
  const apiKey = typeof window !== 'undefined' ? localStorage.getItem('playground-api-key') : null;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };
  if (apiKey) {
    headers['Authorization'] = `Bearer ${apiKey}`;
  }
  return fetch(url, { ...options, headers });
}
```

Update all pages to use `apiFetch` instead of bare `fetch` for API calls.

**Step 4: Update layout to hide sidebar on login page**

In `app/layout.tsx`, wrap Sidebar and main in a layout component that checks the path. Alternatively, create a separate layout for the login page by using a route group: move the Sidebar layout into `app/(app)/layout.tsx` and have `app/login/` use its own layout.

**Step 5: Commit**

```bash
git add middleware.ts app/login/page.tsx lib/api.ts app/layout.tsx
git commit -m "feat: add API key authentication with login page and middleware"
```

---

## Phase 6 — Execution History

### Task 17: Create execution history service and API

**Files:**
- Create: `n8n/services/executions.js`
- Create: `app/api/executions/route.ts`

**Step 1: Create the executions service**

Create `n8n/services/executions.js`:

```javascript
const { loadEnv } = require('../lib/env-loader');
const N8nClient = require('../lib/n8n-client');
const { getWorkflowEnv } = require('../lib/metadata');

const ENV_ALIASES = { dev: 'development', stg: 'staging', prod: 'production' };
function resolveEnv(input) { return ENV_ALIASES[input] || input; }

async function getExecutions({ slug, env: envArg, limit = 20 }) {
  loadEnv();

  if (!slug || !envArg) {
    return { success: false, error: 'slug and env are required' };
  }

  const env = resolveEnv(envArg);
  let envBlock;
  try {
    envBlock = getWorkflowEnv(slug, env);
  } catch (error) {
    return { success: false, error: error.message };
  }

  const n8nId = envBlock.n8nId;
  if (!n8nId || n8nId.startsWith('TODO')) {
    return { success: false, error: `No valid n8n ID for ${slug}/${env}` };
  }

  try {
    const client = new N8nClient();
    const result = await client.getExecutions(n8nId, limit);
    const executions = (result.data || []).map((exec) => ({
      id: exec.id,
      status: exec.status,
      startedAt: exec.startedAt,
      stoppedAt: exec.stoppedAt,
      mode: exec.mode,
      duration: exec.stoppedAt && exec.startedAt
        ? new Date(exec.stoppedAt).getTime() - new Date(exec.startedAt).getTime()
        : null,
    }));

    return { success: true, slug, env, n8nId, executions };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

module.exports = { getExecutions };
```

**Step 2: Create the API route**

Create `app/api/executions/route.ts`:

```typescript
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const slug = searchParams.get('slug');
    const env = searchParams.get('env');
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    if (!slug || !env) {
      return NextResponse.json(
        { success: false, error: 'slug and env are required' },
        { status: 400 }
      );
    }

    const { getExecutions } = require('@/n8n/services/executions');
    const data = await getExecutions({ slug, env, limit });
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
```

**Step 3: Commit**

```bash
git add n8n/services/executions.js app/api/executions/route.ts
git commit -m "feat: add executions service and API endpoint"
```

---

### Task 18: Create Executions page

**Files:**
- Create: `app/executions/page.tsx`

**Step 1: Create the Executions page**

Create `app/executions/page.tsx` with:
- Workflow + Environment dropdowns (using `useStatusFetch`)
- "Load Executions" button
- Table showing: Execution ID, Status (color-coded pill), Started At, Duration, Mode
- Status colors: success=green, error=red, waiting=amber, new=blue

```typescript
'use client';

import { useState } from 'react';
import { useStatusFetch, StatusError } from '@/components/StatusFetcher';

const ENVIRONMENTS = ['development', 'staging', 'production'];

interface Execution {
  id: string;
  status: string;
  startedAt: string;
  stoppedAt: string | null;
  mode: string;
  duration: number | null;
}

function statusColor(status: string) {
  switch (status) {
    case 'success': return 'bg-emerald-500/10 text-emerald-400';
    case 'error': return 'bg-red-500/10 text-red-400';
    case 'waiting': return 'bg-amber-500/10 text-amber-400';
    default: return 'bg-blue-500/10 text-blue-400';
  }
}

function formatDuration(ms: number | null) {
  if (ms === null) return '--';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export default function ExecutionsPage() {
  const { slugs, statusLoading, statusError, refetchStatus } = useStatusFetch();
  const [slug, setSlug] = useState('');
  const [env, setEnv] = useState('development');
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadExecutions = async () => {
    if (!slug) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/executions?slug=${slug}&env=${env}&limit=20`);
      const json = await res.json();
      if (json.success) {
        setExecutions(json.executions);
      } else {
        setError(json.error || 'Failed to load executions');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-100">Execution History</h1>
      <p className="text-sm text-zinc-400 mt-1">
        View recent workflow execution results
      </p>

      {statusError && <StatusError error={statusError} onRetry={refetchStatus} />}

      <div className="mt-8 max-w-2xl">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Workflow</label>
            <select
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Select a workflow</option>
              {slugs.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-1.5">Environment</label>
            <select
              value={env}
              onChange={(e) => setEnv(e.target.value)}
              className="w-full bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
            >
              {ENVIRONMENTS.map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={loadExecutions}
              disabled={loading || !slug}
              className="px-5 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
            >
              {loading ? 'Loading...' : 'Load'}
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-6 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        {executions.length > 0 && (
          <div className="mt-6 bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left">
                  <th className="px-4 py-3 text-zinc-400 font-medium">ID</th>
                  <th className="px-4 py-3 text-zinc-400 font-medium">Status</th>
                  <th className="px-4 py-3 text-zinc-400 font-medium">Started</th>
                  <th className="px-4 py-3 text-zinc-400 font-medium">Duration</th>
                  <th className="px-4 py-3 text-zinc-400 font-medium">Mode</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {executions.map((exec) => (
                  <tr key={exec.id}>
                    <td className="px-4 py-2.5 text-zinc-300 font-mono text-xs">{exec.id}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs px-2 py-0.5 rounded ${statusColor(exec.status)}`}>
                        {exec.status}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-zinc-400 text-xs">
                      {new Date(exec.startedAt).toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-400 text-xs font-mono">
                      {formatDuration(exec.duration)}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-500 text-xs">{exec.mode}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Verify**

Navigate to `/executions`. Select a workflow and env, click Load.
Expected: Table of recent executions with color-coded status pills.

**Step 3: Commit**

```bash
git add app/executions/page.tsx
git commit -m "feat: add Execution History page"
```

---

## Phase 7 — Version History

### Task 19: Create version history service

**Files:**
- Create: `n8n/services/history.js`

**Step 1: Create the history service**

Create `n8n/services/history.js`:

```javascript
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

function getWorkflowFilePath(slug, env) {
  return path.join(process.cwd(), 'n8n', 'workflows', env, slug, 'main_workflow.json');
}

function getHistory({ slug, env, limit = 20 }) {
  const filePath = getWorkflowFilePath(slug, env);
  const relPath = path.relative(process.cwd(), filePath);

  if (!fs.existsSync(filePath)) {
    return { success: false, error: `File not found: ${relPath}` };
  }

  try {
    const log = execSync(
      `git log --format="%H|%s|%an|%aI" -n ${limit} -- "${relPath}"`,
      { cwd: process.cwd(), encoding: 'utf8' }
    ).trim();

    if (!log) {
      return { success: true, slug, env, commits: [] };
    }

    const commits = log.split('\n').map(line => {
      const [hash, subject, author, date] = line.split('|');
      return { hash, subject, author, date };
    });

    return { success: true, slug, env, file: relPath, commits };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

function getVersion({ slug, env, commitHash }) {
  const filePath = getWorkflowFilePath(slug, env);
  const relPath = path.relative(process.cwd(), filePath);

  try {
    const content = execSync(
      `git show ${commitHash}:"${relPath}"`,
      { cwd: process.cwd(), encoding: 'utf8' }
    );
    return { success: true, slug, env, commitHash, content: JSON.parse(content) };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

module.exports = { getHistory, getVersion };
```

**Step 2: Commit**

```bash
git add n8n/services/history.js
git commit -m "feat: add git-based version history service"
```

---

### Task 20: Create history API routes and page

**Files:**
- Create: `app/api/history/route.ts`
- Create: `app/history/page.tsx`

**Step 1: Create the API route**

Create `app/api/history/route.ts`:

```typescript
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const slug = searchParams.get('slug');
    const env = searchParams.get('env');
    const commitHash = searchParams.get('commit');

    if (!slug || !env) {
      return NextResponse.json(
        { success: false, error: 'slug and env are required' },
        { status: 400 }
      );
    }

    if (commitHash) {
      const { getVersion } = require('@/n8n/services/history');
      const data = getVersion({ slug, env, commitHash });
      return NextResponse.json(data);
    }

    const { getHistory } = require('@/n8n/services/history');
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const data = getHistory({ slug, env, limit });
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
```

**Step 2: Create the History page**

Create `app/history/page.tsx` with:
- Workflow + Environment dropdowns
- Load History button
- Table: Commit hash (short), Subject, Author, Date
- Click a commit to expand and view the workflow JSON at that version

Follow the same styling pattern as the Executions page.

**Step 3: Commit**

```bash
git add app/api/history/route.ts app/history/page.tsx
git commit -m "feat: add workflow version history page"
```

---

## Phase 8 — Bulk Operations

### Task 21: Add multi-select to Deploy and Backup pages

**Files:**
- Modify: `app/deploy/page.tsx`
- Modify: `app/backup/page.tsx`

**Step 1: Add multi-select to Deploy page**

Replace the single workflow dropdown with a checkbox list. Add "Select All" / "Deselect All" buttons. When deploying, loop through selected slugs and call the API for each, aggregating all steps into a single OperationLog.

Replace `useState<string>('')` for slug with `useState<string[]>([])` for `selectedSlugs`.

Render checkboxes:

```tsx
<div className="space-y-2 max-h-48 overflow-y-auto bg-zinc-900 border border-zinc-800 rounded-lg p-3">
  <div className="flex gap-2 mb-2">
    <button onClick={() => setSelectedSlugs([...slugs])} className="text-xs text-blue-400 hover:text-blue-300">
      Select All
    </button>
    <button onClick={() => setSelectedSlugs([])} className="text-xs text-zinc-400 hover:text-zinc-300">
      Deselect All
    </button>
  </div>
  {slugs.map((s) => (
    <label key={s} className="flex items-center gap-2 text-sm text-zinc-200 cursor-pointer">
      <input
        type="checkbox"
        checked={selectedSlugs.includes(s)}
        onChange={(e) => {
          if (e.target.checked) setSelectedSlugs([...selectedSlugs, s]);
          else setSelectedSlugs(selectedSlugs.filter(x => x !== s));
        }}
        className="rounded border-zinc-700"
      />
      {s}
    </label>
  ))}
</div>
```

Update the deploy handler to loop through selected slugs (or deploy all if none selected).

**Step 2: Same for Backup page**

**Step 3: Commit**

```bash
git add app/deploy/page.tsx app/backup/page.tsx
git commit -m "feat: add multi-select workflow checkboxes to Deploy and Backup"
```

---

## Phase 9 — Audit Trail

### Task 22: Create activity log service

**Files:**
- Create: `n8n/services/activity-log.js`

**Step 1: Create the activity log service**

Create `n8n/services/activity-log.js`:

```javascript
const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(process.cwd(), 'n8n', 'logs');
const LOG_PATH = path.join(LOG_DIR, 'activity.json');

function readLog() {
  if (!fs.existsSync(LOG_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(LOG_PATH, 'utf8'));
  } catch {
    return [];
  }
}

function writeLog(entries) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
  fs.writeFileSync(LOG_PATH, JSON.stringify(entries, null, 2) + '\n');
}

function logActivity(entry) {
  const log = readLog();
  log.unshift({
    timestamp: new Date().toISOString(),
    ...entry,
  });
  // Keep last 500 entries
  if (log.length > 500) log.length = 500;
  writeLog(log);
}

function getActivityLog({ limit = 50, slug, action } = {}) {
  let log = readLog();
  if (slug) log = log.filter(e => e.slug === slug);
  if (action) log = log.filter(e => e.action === action);
  return log.slice(0, limit);
}

module.exports = { logActivity, getActivityLog };
```

**Step 2: Add `.gitignore` entry for activity log**

Add `n8n/logs/` to `.gitignore`.

**Step 3: Commit**

```bash
git add n8n/services/activity-log.js .gitignore
git commit -m "feat: add activity log service with JSON file storage"
```

---

### Task 23: Integrate activity logging into existing services

**Files:**
- Modify: `n8n/services/deploy.js`
- Modify: `n8n/services/promote.js`
- Modify: `n8n/services/backup.js`
- Modify: `n8n/services/activate.js`

**Step 1: Add logging to deploy service**

At the end of the `deploy` function, before `return { env, steps }`, add:

```javascript
const { logActivity } = require('./activity-log');
logActivity({
  action: 'deploy',
  slug: slug || 'all',
  env,
  result: steps.some(s => s.status === 'error') ? 'error' : 'success',
  steps,
});
```

**Step 2: Same for promote** — log action `'promote'` with `details: { sourceEnv, targetEnv }`.

**Step 3: Same for backup** — log action `'backup'`.

**Step 4: Same for activate** — log action based on `deactivate` parameter.

**Step 5: Commit**

```bash
git add n8n/services/deploy.js n8n/services/promote.js n8n/services/backup.js n8n/services/activate.js
git commit -m "feat: integrate activity logging into deploy, promote, backup, activate"
```

---

### Task 24: Create Activity page and API

**Files:**
- Create: `app/api/activity/route.ts`
- Create: `app/activity/page.tsx`

**Step 1: Create the API route**

Create `app/api/activity/route.ts`:

```typescript
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const slug = searchParams.get('slug') || undefined;
    const action = searchParams.get('action') || undefined;

    const { getActivityLog } = require('@/n8n/services/activity-log');
    const entries = getActivityLog({ limit, slug, action });
    return NextResponse.json({ success: true, entries });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
```

**Step 2: Create the Activity page**

Create `app/activity/page.tsx` with:
- Filter dropdowns: Action type (all/deploy/promote/backup/activate), Workflow slug
- Table: Timestamp, Action, Slug, Environment, Result (success/error)
- Auto-load on page open

```typescript
'use client';

import { useEffect, useState } from 'react';
import { useStatusFetch } from '@/components/StatusFetcher';

interface ActivityEntry {
  timestamp: string;
  action: string;
  slug: string;
  env: string;
  result: string;
  details?: Record<string, string>;
}

const ACTIONS = ['all', 'deploy', 'promote', 'backup', 'activate', 'deactivate'];

export default function ActivityPage() {
  const { slugs } = useStatusFetch();
  const [entries, setEntries] = useState<ActivityEntry[]>([]);
  const [filterAction, setFilterAction] = useState('all');
  const [filterSlug, setFilterSlug] = useState('');
  const [loading, setLoading] = useState(true);

  const loadActivity = () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: '50' });
    if (filterAction !== 'all') params.set('action', filterAction);
    if (filterSlug) params.set('slug', filterSlug);

    fetch(`/api/activity?${params}`)
      .then(res => res.json())
      .then(json => {
        if (json.success) setEntries(json.entries);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadActivity();
  }, [filterAction, filterSlug]);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-100">Activity Log</h1>
      <p className="text-sm text-zinc-400 mt-1">Recent operations and their results</p>

      <div className="mt-8 max-w-4xl">
        <div className="flex gap-4 mb-4">
          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {ACTIONS.map(a => (
              <option key={a} value={a}>{a === 'all' ? 'All actions' : a}</option>
            ))}
          </select>
          <select
            value={filterSlug}
            onChange={(e) => setFilterSlug(e.target.value)}
            className="bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="">All workflows</option>
            {slugs.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="text-sm text-zinc-500">Loading...</div>
        ) : entries.length === 0 ? (
          <div className="text-sm text-zinc-500">No activity recorded yet</div>
        ) : (
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-left">
                  <th className="px-4 py-3 text-zinc-400 font-medium">Time</th>
                  <th className="px-4 py-3 text-zinc-400 font-medium">Action</th>
                  <th className="px-4 py-3 text-zinc-400 font-medium">Workflow</th>
                  <th className="px-4 py-3 text-zinc-400 font-medium">Environment</th>
                  <th className="px-4 py-3 text-zinc-400 font-medium">Result</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/50">
                {entries.map((entry, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2.5 text-zinc-400 text-xs">
                      {new Date(entry.timestamp).toLocaleString()}
                    </td>
                    <td className="px-4 py-2.5 text-zinc-300 text-xs font-medium">{entry.action}</td>
                    <td className="px-4 py-2.5 text-zinc-300 text-xs font-mono">{entry.slug}</td>
                    <td className="px-4 py-2.5 text-zinc-400 text-xs">{entry.env}</td>
                    <td className="px-4 py-2.5">
                      <span className={`text-xs px-2 py-0.5 rounded ${
                        entry.result === 'success'
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : 'bg-red-500/10 text-red-400'
                      }`}>
                        {entry.result}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 3: Commit**

```bash
git add app/api/activity/route.ts app/activity/page.tsx
git commit -m "feat: add Activity Log page with filterable operation history"
```

---

## Summary

| Phase | Tasks | Items Covered |
|-------|-------|---------------|
| 1 — Quick Wins | 1-6 | #2, #5, #6, #7, #8, #17 |
| 2 — Activate | 7-8 | #1, #3 |
| 3 — Safety | 9-11 | #4, #15 |
| 4 — Dry-Run & Diff | 12-15 | #10, #11 |
| 5 — Auth | 16 | #14 |
| 6 — Executions | 17-18 | #9 |
| 7 — History | 19-20 | #12 |
| 8 — Bulk Ops | 21 | #13 |
| 9 — Audit Trail | 22-24 | #16 |

**Total: 24 tasks across 9 phases covering all 17 design items.**
