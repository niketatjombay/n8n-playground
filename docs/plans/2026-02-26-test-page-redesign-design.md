# Test Page Redesign

## Problem

The current test page (`/test`) has tangled async flows, unreliable execution discovery (snapshot ID comparison that can pick up wrong executions), duplicated fallback logic for payload loading, and an `N8nClient` bug that queries the wrong instance for production workflows.

## Design

### Two-Phase Flow

**Phase 1 — Trigger**: User fills form, clicks Send. `POST /api/test` fires the webhook, awaits the full response. Returns `{ success, webhookUrl, statusCode, data, triggeredAt }`. The `triggeredAt` ISO timestamp is captured on the server immediately before the webhook fetch.

**Phase 2 — Track Execution**: After the trigger returns, the frontend polls `GET /api/executions?slug=X&env=Y&limit=5` at a user-chosen interval (30s/60s/3m/5m). From the returned list, selects the execution with the smallest absolute time difference between its `startedAt` and the `triggeredAt` from Phase 1. Polls until status is terminal (`success` | `error` | `canceled`). Max polling duration: 60 minutes.

### Execution Discovery — Closest-Timestamp Match

```
candidates = executions.filter(e => e.startedAt exists)
match = candidate with min(abs(Date(e.startedAt) - Date(triggeredAt)))
```

This replaces the current snapshot-before/compare-after approach. It eliminates false matches from concurrent executions because:
- The filter is by workflow ID (via slug+env)
- The timestamp match picks the execution closest to when we triggered
- Multiple rapid triggers by the same user would each have a unique `triggeredAt`

### Files Changed

**`n8n/services/test-workflow.js`**
- Capture `triggeredAt = new Date().toISOString()` before the `fetch()` call
- Add `triggeredAt` to the return object

**`n8n/services/executions.js`** (`getExecutions`)
- Use `clientForEnv(env)` instead of `new N8nClient()` so production queries hit the correct n8n instance

**`app/test/page.tsx`**
- Remove snapshot logic (`latestIdBeforeRef`, `snapshotLatestExecution`)
- Remove parallel polling-while-triggering pattern
- After trigger returns, start polling with closest-timestamp matching
- Add poll interval selector (30s, 60s, 3m, 5m)
- Consolidate payload loading into a single function with one fallback chain
- On completion, show "View full execution" link to `/executions/{id}?env=Y`

### Payload Loading (cleanup)

Single `loadPayload(slug, env, workflows)` function:
1. Try `GET /api/sample-input?slug&env` — if success, use it (badge: `sample_input.json`)
2. Else check `workflows.find(w => w.slug === slug)?.input` — if exists, use it (badge: `metadata`)
3. Else set empty `{}` (no badge)

No duplicated fallback in `.catch()`.

### UI Layout (top to bottom)

1. Header: "Webhook Tester" + env badge
2. Form: workflow selector, env segmented control, JSON editor with source badge
3. Send button + poll interval selector
4. Execution tracker (after trigger): `#ID` clickable link + copy button, status badge, duration, live elapsed counter, "View full execution" link when done
5. Webhook Response (after trigger returns): status code, URL, response body with copy button

### Poll Interval Selector

Segmented control next to the Send button (or in the header). Options: 30s | 60s | 3m | 5m. Default: 30s. Stored in component state only (no persistence needed).
