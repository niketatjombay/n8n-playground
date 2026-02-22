# n8n Playground — Functionality Gaps Design

**Date**: 2026-02-22
**Scope**: 17 items across 3 tiers — existing gaps, new features, production hardening

---

## Tier 1: Gaps in Existing Features

### 1. Activate/Deactivate Page

New page at `/activate` with:
- Workflow dropdown (from `/api/status`)
- Environment dropdown
- Current activation status display (fetched live from n8n via existing `/api/activate` or a new GET variant)
- Activate / Deactivate button (toggles based on current state)
- OperationLog for result display

The page calls `POST /api/activate` with `{ slug, env, deactivate?: boolean }`.

### 2. Sidebar Link for Activate

Add "Activate" to `Sidebar.tsx` navigation array between "Backup" and "Test". Icon/label consistent with existing nav items. Path: `/activate`.

### 3. Dashboard Activate Toggle

Add an activate/deactivate toggle button to `WorkflowCard.tsx` for each environment that has a valid (non-TODO) n8nId. Clicking calls `/api/activate` inline and updates the card state without a full page reload. Show a small spinner during the API call.

### 4. Promote: Fail on Sub-workflow Error

In `promote.js`, if any sub-workflow deployment step returns `status: 'error'`, abort the main workflow promotion and return early with:
```json
{
  "success": false,
  "error": "Sub-workflow deployment failed — aborting main workflow promotion",
  "steps": [/* sub-workflow steps so far */]
}
```

### 5. Better Loading/Error States on Dropdown Fetch

In Deploy, Promote, Backup, Test, and Activate pages: when the initial `/api/status` fetch fails, show an error banner above the form (not just empty dropdowns). Add a "Retry" button. Show a skeleton/spinner while loading.

### 6. Remove Unused `workflows.config.js`

Delete `n8n/config/workflows.config.js`. Verify no imports reference it first.

### 7. Pre-populate Test Payload

In the Test page, after selecting a workflow slug:
- Read the workflow's `input` field from metadata (via the status API response)
- Pre-populate the JSON textarea with `JSON.stringify(input, null, 2)`
- User can still edit before sending

This requires the `/api/status` response to include each workflow's `input` field from metadata.

### 8. Dashboard Refresh

Add a refresh button (circular arrow icon) to the Dashboard header. Clicking re-fetches `/api/status`. Also add auto-polling every 30 seconds (with a visible "Last updated: Xs ago" indicator). Polling pauses when the browser tab is not visible.

---

## Tier 2: Missing Features

### 9. Execution History Page

New page at `/executions` showing recent execution results.

**API**: New `GET /api/executions?slug=<slug>&env=<env>&limit=20` endpoint.
**Service**: New `n8n/services/executions.js` calling `N8nClient.getExecutions()`.
**UI**:
- Workflow + environment dropdowns
- Table: Execution ID, Status (success/error/waiting), Started At, Duration, Mode (webhook/manual)
- Click an execution row to expand and show input/output data
- Color-coded status pills

**Sidebar**: Add "Executions" link between "Workflows" and "Deploy".

### 10. Dry-Run Mode for Deploy/Promote

Add a `dryRun: boolean` parameter to deploy and promote services.

When `dryRun` is true:
- Walk through all the same logic (read files, check metadata, resolve IDs)
- But skip the actual n8n API calls (create/update)
- Return steps with `action: 'would-create'` or `action: 'would-update'`
- Do NOT write metadata changes

**UI**: Add a "Preview Changes" button next to Deploy/Promote buttons. Clicking runs the dry-run, shows the OperationLog with preview results, then the user confirms to execute for real.

### 11. Environment Diff View for Promote

After selecting slug, source, and target on the Promote page, show a collapsible "View Changes" section that displays:
- Workflow name: `[DEV] Foo` → `[STG] Foo`
- Webhook path changes
- Sub-workflow ID remappings (source ID → target ID)
- Credential swaps
- Any fields that will be stripped

**Implementation**: New `GET /api/promote/preview?slug=X&sourceEnv=Y&targetEnv=Z` endpoint that runs the remap logic without deploying and returns the diff.

### 12. Workflow Version History / Rollback

**Approach**: Git-based versioning. Each deploy/promote/backup operation auto-commits the workflow JSON files to git with a descriptive message.

**New service**: `n8n/services/history.js`
- `getHistory(slug, env, limit)` — runs `git log` on the workflow's JSON file
- `getVersion(slug, env, commitHash)` — runs `git show` for a specific version
- `rollback(slug, env, commitHash)` — checks out the old version and deploys it

**New API**: `GET /api/history?slug=X&env=Y` and `POST /api/rollback`

**New page**: `/history` — select workflow + env, see commit history, click to view old version, button to rollback.

**Sidebar**: Add "History" link after "Executions".

### 13. Bulk Operations

Add multi-select capability to the Deploy and Backup pages:
- Replace single workflow dropdown with a checklist of workflows
- "Select All" / "Deselect All" buttons
- Execute operations on all selected workflows sequentially
- OperationLog shows combined results

No new API needed — the frontend loops through selected slugs and calls the existing API for each.

---

## Tier 3: Production Hardening

### 14. Authentication

Lightweight API key authentication:
- New env var: `PLAYGROUND_API_KEY` in `.env.local`
- If set, all API routes check for `Authorization: Bearer <key>` header
- Frontend stores the key in `localStorage` after a simple login prompt
- Login page at `/login` — single password field, no username
- Middleware in `middleware.ts` to protect all `/api/*` routes and redirect unauthenticated users to `/login`
- If `PLAYGROUND_API_KEY` is not set, auth is disabled (backwards compatible)

### 15. Confirmation Dialogs

Add a reusable `ConfirmDialog` component:
- Modal overlay with title, message, Cancel/Confirm buttons
- Confirm button is red for destructive actions, blue for normal
- Required before: Deploy (to any env), Promote, Activate/Deactivate
- Extra warning text when target is production: "You are about to deploy to PRODUCTION"
- Dialog shows a summary of what will happen (slug, env, action)

### 16. Audit Trail / Activity Log

**Storage**: JSON file at `n8n/logs/activity.json` (append-only, newest first).

**Schema per entry**:
```json
{
  "timestamp": "ISO-8601",
  "action": "deploy|promote|backup|activate|deactivate",
  "slug": "case-study-creator",
  "env": "staging",
  "details": { "sourceEnv": "dev", "targetEnv": "stg" },
  "result": "success|error",
  "steps": [...]
}
```

**Service**: `n8n/services/activity-log.js` — `logActivity(entry)` and `getActivityLog(limit, slug?, action?)`.

**API**: `GET /api/activity?limit=50&slug=X&action=deploy`

**Integration**: Each existing service (deploy, promote, backup, activate) calls `logActivity()` after completing.

**UI**: New page at `/activity` showing a filterable, paginated table of recent operations. Sidebar link after "History".

### 17. Health Check Endpoint

New `GET /api/health` returning:
```json
{
  "status": "ok",
  "timestamp": "ISO-8601",
  "n8n": {
    "reachable": true,
    "url": "https://workflows.ur-nl.com"
  },
  "metadata": {
    "workflows": 6,
    "subWorkflows": 2,
    "todoCount": 12
  }
}
```

Checks:
- n8n API is reachable (lightweight GET to `/api/v1/workflows?limit=1`)
- metadata.json is readable and parseable
- Returns 200 if all checks pass, 503 if n8n is unreachable

---

## New Sidebar Navigation (Final Order)

1. Dashboard (`/`)
2. Workflows (`/workflows`)
3. Executions (`/executions`) — NEW
4. Deploy (`/deploy`)
5. Promote (`/promote`)
6. Backup (`/backup`)
7. Activate (`/activate`) — NEW
8. Test (`/test`)
9. History (`/history`) — NEW
10. Activity (`/activity`) — NEW

---

## Implementation Priority

**Phase 1 — Quick Wins (items 2, 5, 6, 7, 8, 17)**: Small, independent changes.
**Phase 2 — Activate Feature (items 1, 3)**: New page + card enhancement.
**Phase 3 — Safety (items 4, 15)**: Error handling + confirmation dialogs.
**Phase 4 — Dry-Run & Diff (items 10, 11)**: Preview capabilities.
**Phase 5 — Auth (item 14)**: API key auth + login page.
**Phase 6 — Execution History (item 9)**: New page + API + service.
**Phase 7 — Version History (item 12)**: Git-based versioning.
**Phase 8 — Bulk Ops (item 13)**: Multi-select on Deploy/Backup.
**Phase 9 — Audit Trail (item 16)**: Activity logging + page.
