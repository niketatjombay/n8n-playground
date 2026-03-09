# Metadata & Config Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 4 data issues found during audit — incomplete `used_by` lists, unused config field, missing folder IDs.

**Architecture:** Direct edits to two JSON/JS config files. No code logic changes.

**Tech Stack:** JSON, JavaScript config

---

### Task 1: Fix `used_by` on llm-sub-workflow (metadata.json)

**Files:**
- Modify: `n8n/workflows/metadata.json` — llm-sub-workflow dev entry (~line 766) and staging entry (~line 808)

**Step 1: Add missing workflows to dev `used_by`**

In the llm-sub-workflow → development → workflows entry, change:

```json
"used_by": [
  "case-study-creator",
  "project-memory-updater",
  "document-summary-extractor"
]
```

to:

```json
"used_by": [
  "case-study-creator",
  "project-memory-updater",
  "document-summary-extractor",
  "pre-work-summary",
  "session-slides"
]
```

**Step 2: Add missing workflows to staging `used_by`**

Same change in llm-sub-workflow → staging → workflows entry.

**Step 3: Verify JSON is valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('n8n/workflows/metadata.json','utf8')); console.log('OK')"`
Expected: `OK`

---

### Task 2: Fix `used_by` on drive-utils (metadata.json)

**Files:**
- Modify: `n8n/workflows/metadata.json` — drive-utils dev entry (~line 884) and staging entry (~line 919)

**Step 1: Add missing workflows to dev `used_by`**

In drive-utils → development → workflows entry, change:

```json
"used_by": [
  "case-study-creator",
  "document-summary-extractor"
]
```

to:

```json
"used_by": [
  "case-study-creator",
  "document-summary-extractor",
  "pre-work-summary",
  "session-slides"
]
```

**Step 2: Add missing workflows to staging `used_by`**

Same change in drive-utils → staging → workflows entry.

**Step 3: Verify JSON is valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('n8n/workflows/metadata.json','utf8')); console.log('OK')"`
Expected: `OK`

---

### Task 3: Remove `assetsApiUrl` from production config

**Files:**
- Modify: `n8n/config/environments.config.js` — production block (~line 53)

**Step 1: Remove the line**

Delete this line from the production environment config:

```javascript
    assetsApiUrl: 'https://assetsapi.jombay.com',
```

**Step 2: Verify config loads**

Run: `node -e "const c = require('./n8n/config/environments.config.js'); console.log(Object.keys(c.environments.production))"`
Expected: Output should NOT include `assetsApiUrl`

---

### Task 4: Fix document-summary-extractor folder IDs (metadata.json)

**Files:**
- Modify: `n8n/workflows/metadata.json` — DSE dev folder (~line 581) and staging folder (~line 613)

**Step 1: Set dev folder_id**

In document-summary-extractor → development folder, change:

```json
"folder_id": null,
```

to:

```json
"folder_id": "Cj8Wfkq6WS7w1Gg9",
```

**Step 2: Set staging folder_id**

In document-summary-extractor → staging folder, change:

```json
"folder_id": null,
```

to:

```json
"folder_id": "c6ZI4UXcv20OKrHM",
```

---

### Task 5: Set parent workflow group folder IDs (metadata.json)

**Files:**
- Modify: `n8n/workflows/metadata.json` — 6 parent folder entries

**Step 1: Set folder_id on each parent group**

Find each workflow group's parent folder (the one with `"environment": null` and `"folder_id": null`) and set `"folder_id": "4JLkQmhzFV2M76tX"`:

1. **pre-work-summary** parent (~line 11)
2. **session-slides** parent (~line 101) — check if already has an ID
3. **case-study-creator** parent (~line 422)
4. **document-summary-extractor** parent (~line 577)
5. **project-memory-updater** parent (~line 672)
6. **llm-sub-workflow** parent (~line 746)
7. **drive-utils** parent (~line 864)

For each, change `"folder_id": null` to `"folder_id": "4JLkQmhzFV2M76tX"`.

**Step 2: Verify JSON is valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('n8n/workflows/metadata.json','utf8')); console.log('OK')"`
Expected: `OK`

---

### Task 6: Commit and push

**Step 1: Stage and commit**

```bash
git add n8n/workflows/metadata.json n8n/config/environments.config.js
git commit -m "fix: complete metadata used_by lists, folder IDs, remove unused assetsApiUrl"
```

**Step 2: Push**

```bash
git push upstream develop
```
