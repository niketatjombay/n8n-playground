# Test Page Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Redesign the test page to use a two-phase trigger→track flow with timestamp-based execution discovery, fix the `getExecutions` client bug, and clean up payload loading.

**Architecture:** Phase 1 fires the webhook and captures `triggeredAt`. Phase 2 polls executions and picks the closest timestamp match. All snapshot/compare logic is removed. The `getExecutions` service is fixed to use `clientForEnv(env)` for correct n8n instance routing.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS 4

---

### Task 1: Fix `getExecutions` to use `clientForEnv(env)`

**Files:**
- Modify: `n8n/services/executions.js:30`

**Step 1: Fix the client instantiation**

In `n8n/services/executions.js`, line 30, replace:

```javascript
const client = new N8nClient();
```

with:

```javascript
const client = clientForEnv(env);
```

This ensures production workflow executions query the production n8n instance instead of always using the default dev_staging instance.

**Step 2: Remove unused `N8nClient` import if no longer needed**

Check if `N8nClient` is still used anywhere else in the file. `getExecutionDetail` at line 432 still uses `new N8nClient()` as a fallback when `env` is not provided, so the import must stay.

**Step 3: Verify the build compiles**

Run: `npm run build`
Expected: Build succeeds with no errors.

**Step 4: Commit**

```bash
git add n8n/services/executions.js
git commit -m "fix: use clientForEnv in getExecutions for correct instance routing"
```

---

### Task 2: Add `triggeredAt` to `testWorkflow` response

**Files:**
- Modify: `n8n/services/test-workflow.js:81-103`
- Modify: `app/api/test/route.ts` (no changes needed — passthrough)

**Step 1: Capture `triggeredAt` before the fetch call**

In `n8n/services/test-workflow.js`, immediately before the `try { const response = await fetch(...)` block (line 81), add:

```javascript
const triggeredAt = new Date().toISOString();
```

**Step 2: Add `triggeredAt` to both return paths**

In the success return (line 98-103), add `triggeredAt`:

```javascript
return {
  success: statusCode < 400,
  webhookUrl,
  statusCode,
  data: responseBody,
  triggeredAt,
};
```

In the error return (line 104-109), add `triggeredAt`:

```javascript
return {
  success: false,
  webhookUrl,
  error: error.message,
  triggeredAt,
};
```

**Step 3: Verify the build compiles**

Run: `npm run build`
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add n8n/services/test-workflow.js
git commit -m "feat: add triggeredAt timestamp to testWorkflow response"
```

---

### Task 3: Rewrite `app/test/page.tsx` — state & payload loading

This task strips out the old snapshot/polling logic and sets up the clean foundation.

**Files:**
- Modify: `app/test/page.tsx`

**Step 1: Update interfaces and constants**

Replace the existing `TestResponse` interface and `POLL_INTERVAL_MS` constant at lines 39-56:

```typescript
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
  triggeredAt?: string;
}

interface ExecutionInfo {
  id: string;
  status: string;
  startedAt: string | null;
  stoppedAt: string | null;
  duration: number | null;
}
```

**Step 2: Replace state declarations**

Remove `latestIdBeforeRef` (line 79). Add:

```typescript
const [pollIntervalMs, setPollIntervalMs] = useState(POLL_INTERVALS[0].ms);
const triggeredAtRef = useRef<string | null>(null);
```

Keep all other existing state variables.

**Step 3: Consolidate payload loading**

The existing `useEffect` at lines 97-124 that loads payload already follows the correct fallback chain (sample_input.json → metadata input → empty). Keep it as-is — it's clean. The `.catch()` fallback block duplicates the `else` branch from `.then()`, but the design says "no duplicated fallback." Consolidate by extracting a helper:

```typescript
const fallbackPayload = useCallback((slug: string) => {
  const wf = workflows.find((w: any) => w.slug === slug);
  if (wf?.input) {
    setPayload(JSON.stringify(wf.input, null, 2));
    setPayloadSource('metadata');
  } else {
    setPayload('{\n  \n}');
    setPayloadSource('empty');
  }
}, [workflows]);
```

Then use `fallbackPayload(slug)` in both the `.then()` else-branch and `.catch()`.

**Step 4: Remove `snapshotLatestExecution` function**

Delete lines 139-151 (the `snapshotLatestExecution` function). This is no longer needed.

**Step 5: Verify the build compiles**

Run: `npm run build`
Expected: Build succeeds.

**Step 6: Commit**

```bash
git add app/test/page.tsx
git commit -m "refactor: clean up state, payload loading, remove snapshot logic"
```

---

### Task 4: Rewrite execution polling with timestamp matching

**Files:**
- Modify: `app/test/page.tsx`

**Step 1: Rewrite `startExecutionPolling`**

Replace the current `startExecutionPolling` callback with timestamp-based matching:

```typescript
const startExecutionPolling = useCallback((triggerSlug: string, triggerEnv: string, triggeredAt: string) => {
  setPolling(true);
  startTimeRef.current = Date.now();
  setLiveElapsed(0);
  setExecution(null);

  // Live elapsed timer (1s tick)
  liveTimerRef.current = setInterval(() => {
    if (startTimeRef.current) {
      setLiveElapsed(Math.round((Date.now() - startTimeRef.current) / 1000));
    }
  }, 1000);

  const poll = async () => {
    // Timeout check
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

      // Stop polling when terminal
      const done = closest.status === 'success' || closest.status === 'error' || closest.status === 'canceled';
      if (done) {
        stopPolling();
      }
    } catch {
      // Keep polling on network errors
    }
  };

  // First poll after 3s, then at user-chosen interval
  setTimeout(poll, 3000);
  pollRef.current = setInterval(poll, pollIntervalMs);
}, [stopPolling, pollIntervalMs]);
```

Key changes from old version:
- Accepts `triggeredAt` as a parameter (not reading from a ref)
- Uses closest-timestamp matching instead of snapshot ID comparison
- Uses `pollIntervalMs` state instead of hardcoded constant

**Step 2: Update `handleTrigger` to use the new flow**

Replace the current `handleTrigger`:

```typescript
const handleTrigger = async () => {
  if (!slug) return;

  // Clear previous state
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
```

Key changes:
- No more `snapshotLatestExecution()` call before trigger
- No more parallel polling while webhook awaits
- Polling starts AFTER trigger returns, using `triggeredAt` from the response
- Sequential two-phase flow: trigger completes → polling begins

**Step 3: Verify the build compiles**

Run: `npm run build`
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add app/test/page.tsx
git commit -m "feat: replace snapshot-based polling with timestamp-based execution matching"
```

---

### Task 5: Add poll interval selector UI

**Files:**
- Modify: `app/test/page.tsx`

**Step 1: Add poll interval selector next to the Send button**

In the trigger button section (around line 453-484), add a segmented control after the button. Replace the entire `{/* Trigger button */}` div:

```tsx
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
```

**Step 2: Update the polling indicator to show selected interval**

In the execution tracker section, replace the hardcoded `poll every {POLL_INTERVAL_MS / 1000}s` with:

```tsx
{polling && (
  <span className="text-[10px] font-mono text-zinc-600">
    poll every {POLL_INTERVALS.find(i => i.ms === pollIntervalMs)?.label || '30s'}
  </span>
)}
```

**Step 3: Verify the build compiles**

Run: `npm run build`
Expected: Build succeeds.

**Step 4: Commit**

```bash
git add app/test/page.tsx
git commit -m "feat: add poll interval selector (30s, 60s, 3m, 5m)"
```

---

### Task 6: Manual end-to-end test

**Step 1: Start dev server**

Run: `npm run dev`

**Step 2: Test payload loading**

1. Open `http://localhost:3001/test`
2. Select `session-slides` workflow, `staging` env
3. Verify: JSON editor loads `sample_input.json` content with `sample_input.json` badge
4. Switch to `development` env — verify payload reloads appropriately
5. Select a workflow without a sample_input.json — verify fallback to metadata or empty

**Step 3: Test trigger + execution tracking**

1. Select `session-slides`, `staging` env
2. Set poll interval to `30s`
3. Click "Send Request"
4. Verify: Loading spinner while webhook executes
5. Verify: After response returns, webhook response panel shows status code + response body
6. Verify: Execution tracker starts polling, finds execution by closest timestamp
7. Verify: Execution ID is shown as clickable link, with copy button
8. Verify: When execution completes, polling stops, "view details" link appears

**Step 4: Test production env routing**

1. Select a production workflow
2. Trigger it
3. Verify: Execution is found (proves `clientForEnv` fix works)

**Step 5: Test poll interval change**

1. Click different poll intervals (60s, 3m)
2. Trigger a workflow
3. Verify: Polling happens at the selected interval

**Step 6: Commit any fixes if needed**

---

### Task 7: Final build verification

**Step 1: Run lint**

Run: `npm run lint`
Expected: No errors.

**Step 2: Run production build**

Run: `npm run build`
Expected: Build succeeds with no TypeScript errors.

**Step 3: Final commit if any cleanup was needed**

```bash
git add -A
git commit -m "chore: cleanup after test page redesign"
```
