# Project Memory Updater — Reliability Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix execution timeouts and missing error reporting in the Project Memory Updater by deploying the v3 architecture with output size constraints, disabled retry, and verified error routing.

**Architecture:** The local JSON file contains two node structures — old v2 at top-level `nodes` (currently deployed) and new v3 at `activeVersion.nodes` (not deployed). We promote v3 to top-level, apply three targeted changes (prompt constraint, max_tokens, remove retry), then deploy and activate.

**Tech Stack:** n8n workflow JSON, jq, existing deploy CLI (`npm run n8n:deploy`, `npm run n8n:activate`)

---

## Context

- Workflow file: `n8n/workflows/staging/project-memory-updater/main_workflow.json`
- Workflow ID on n8n: `uX4p9Kt3Ztz59NEO`
- Environment: staging (`--env staging`)
- v3 nodes to promote from `activeVersion.nodes`:
  - `1.2_VAL_Input`, `1.3_IF_Valid`, `1.4_IF_NeedStep1`
  - `2.1_FMT_Extract`, `2.2_SUB_Extract`, `2.3_FMT_MergeDoc`, `2.4_FMT_MergeCorr`
  - `3.1_SUB_Merge`, `3.2_FMT_Questions`, `3.3_SUB_Questions`
  - `4.1_JS_Package`, `4.2_IF_Status`, `4.3_API_Success`
  - `5.1_ERR_Format`, `5.2_API_Error`
- v3 connections to promote: from `activeVersion.connections`

---

### Task 1: Promote v3 nodes to top-level

The file currently has old v2 at `nodes[]` and new v3 at `activeVersion.nodes[]`. Replace the top-level `nodes` and `connections` with the v3 versions.

**Files:**
- Modify: `n8n/workflows/staging/project-memory-updater/main_workflow.json`

**Step 1: Verify current top-level node names (old v2)**

```bash
cat n8n/workflows/staging/project-memory-updater/main_workflow.json | jq '[.nodes[] | .name]'
```

Expected output includes: `"2.1_FMT_Merge"`, `"2.2_SUB_Merge"`, `"3.1_FMT_Questions"`, `"3.2_SUB_Review"` — the old v2 names.

**Step 2: Verify activeVersion node names (v3)**

```bash
cat n8n/workflows/staging/project-memory-updater/main_workflow.json | jq '[.activeVersion.nodes[] | .name]'
```

Expected output includes: `"2.1_FMT_Extract"`, `"2.2_SUB_Extract"`, `"2.3_FMT_MergeDoc"`, `"3.1_SUB_Merge"`, `"3.3_SUB_Questions"` — the new v3 names.

**Step 3: Replace top-level nodes and connections with v3**

```bash
jq '.nodes = .activeVersion.nodes | .connections = .activeVersion.connections' \
  n8n/workflows/staging/project-memory-updater/main_workflow.json \
  > /tmp/pmu_v3.json && mv /tmp/pmu_v3.json \
  n8n/workflows/staging/project-memory-updater/main_workflow.json
```

**Step 4: Verify the promotion worked**

```bash
cat n8n/workflows/staging/project-memory-updater/main_workflow.json | jq '[.nodes[] | .name]'
```

Expected: v3 node names appear at top level. `"2.1_FMT_Extract"` should be present, `"2.1_FMT_Merge"` should not.

**Step 5: Commit**

```bash
git add n8n/workflows/staging/project-memory-updater/main_workflow.json
git commit -m "chore(pmu): promote v3 nodes to top-level in workflow JSON"
```

---

### Task 2: Add output size constraint to merge prompts

Add a memory size constraint to the system prompts in `2.3_FMT_MergeDoc` and `2.4_FMT_MergeCorr`, and reduce `max_tokens` from 8000 to 7000 in both.

**Files:**
- Modify: `n8n/workflows/staging/project-memory-updater/main_workflow.json`

**Step 1: Verify current max_tokens for merge nodes**

```bash
cat n8n/workflows/staging/project-memory-updater/main_workflow.json | \
  jq '.nodes[] | select(.name == "2.3_FMT_MergeDoc" or .name == "2.4_FMT_MergeCorr") | {name, max_tokens: (.parameters.jsCode | match("max_tokens: [0-9]+") | .string)}'
```

Expected: both show `max_tokens: 8000`.

**Step 2: Edit `2.3_FMT_MergeDoc` — add size constraint to system prompt**

Open `n8n/workflows/staging/project-memory-updater/main_workflow.json` in editor.

Find the `jsCode` for node `2.3_FMT_MergeDoc`. The system prompt ends with:
```
- Use \\\\n for line breaks in markdown text
```

Append the following immediately after that line (still inside the same string, before the closing `\\\";`):

```
\\\\n\\\\nMEMORY SIZE CONSTRAINT: Keep project_memory_text under 25,000 characters (~6000 tokens). If merging would exceed this, compress existing sections by dropping older redundant details and verbose context. Never remove Key Decisions, Constraints, Success Criteria, or Timeline entries. New information always takes priority over existing content.
```

**Step 3: Edit `2.3_FMT_MergeDoc` — reduce max_tokens**

In the same node's jsCode, find:
```
max_tokens: 8000,
```

Change to:
```
max_tokens: 7000,
```

**Step 4: Edit `2.4_FMT_MergeCorr` — same changes**

Repeat Steps 2 and 3 for the `2.4_FMT_MergeCorr` node's jsCode. The system prompt is identical — same append location, same change.

**Step 5: Verify both changes**

```bash
cat n8n/workflows/staging/project-memory-updater/main_workflow.json | \
  jq '.nodes[] | select(.name == "2.3_FMT_MergeDoc" or .name == "2.4_FMT_MergeCorr") | {name, has_constraint: (.parameters.jsCode | contains("MEMORY SIZE CONSTRAINT")), max_tokens: (.parameters.jsCode | match("max_tokens: [0-9]+") | .string)}'
```

Expected: both nodes show `"has_constraint": true` and `"max_tokens: 7000"`.

**Step 6: Commit**

```bash
git add n8n/workflows/staging/project-memory-updater/main_workflow.json
git commit -m "feat(pmu): add memory size constraint to merge prompts, cap max_tokens at 7000"
```

---

### Task 3: Disable retry on all SUB nodes

Remove `retryOnFail`, `maxTries`, and `waitBetweenTries` from `2.2_SUB_Extract`, `3.1_SUB_Merge`, and `3.3_SUB_Questions`.

**Files:**
- Modify: `n8n/workflows/staging/project-memory-updater/main_workflow.json`

**Step 1: Verify current retry config exists**

```bash
cat n8n/workflows/staging/project-memory-updater/main_workflow.json | \
  jq '.nodes[] | select(.name == "2.2_SUB_Extract" or .name == "3.1_SUB_Merge" or .name == "3.3_SUB_Questions") | {name, retryOnFail, maxTries, waitBetweenTries}'
```

Expected: all three nodes show `"retryOnFail": true, "maxTries": 2, "waitBetweenTries": 5000`.

**Step 2: Remove retry fields from all three nodes**

```bash
jq '(.nodes[] | select(.name == "2.2_SUB_Extract" or .name == "3.1_SUB_Merge" or .name == "3.3_SUB_Questions")) |= del(.retryOnFail) | del(.maxTries) | del(.waitBetweenTries)' \
  n8n/workflows/staging/project-memory-updater/main_workflow.json \
  > /tmp/pmu_noretry.json && mv /tmp/pmu_noretry.json \
  n8n/workflows/staging/project-memory-updater/main_workflow.json
```

**Step 3: Verify retry fields are gone**

```bash
cat n8n/workflows/staging/project-memory-updater/main_workflow.json | \
  jq '.nodes[] | select(.name == "2.2_SUB_Extract" or .name == "3.1_SUB_Merge" or .name == "3.3_SUB_Questions") | {name, retryOnFail, maxTries, waitBetweenTries}'
```

Expected: all three fields are `null` (absent) for all three nodes.

**Step 4: Verify onError is still set**

```bash
cat n8n/workflows/staging/project-memory-updater/main_workflow.json | \
  jq '.nodes[] | select(.name == "2.2_SUB_Extract" or .name == "3.1_SUB_Merge" or .name == "3.3_SUB_Questions") | {name, onError}'
```

Expected: all three show `"onError": "continueErrorOutput"` — this must remain intact.

**Step 5: Commit**

```bash
git add n8n/workflows/staging/project-memory-updater/main_workflow.json
git commit -m "fix(pmu): disable retry on SUB nodes so error path fires immediately on LLM failure"
```

---

### Task 4: Deploy and activate

Push the updated workflow to n8n staging and activate it.

**Files:** None — uses existing CLI

**Step 1: Check deploy CLI targets the right workflow**

```bash
cat n8n/workflows/staging/project-memory-updater/main_workflow.json | jq '{id, name}'
```

Expected: `"id": "uX4p9Kt3Ztz59NEO"`, `"name": "[STG] Project Memory Updater v2"`.

**Step 2: Deploy to staging**

```bash
npm run n8n:deploy -- --env staging
```

Watch output for `project-memory-updater` being deployed successfully. Should show no errors.

**Step 3: Activate**

```bash
npm run n8n:activate -- project-memory-updater staging
```

Expected: workflow activated confirmation.

**Step 4: Verify deployed node names on n8n**

```bash
curl -s "https://workflows.ur-nl.com/api/v1/executions?limit=3" \
  -H "X-N8N-API-KEY: $(grep N8N_API_KEY .env.local | cut -d= -f2)" | jq '[.data[] | {id, status, startedAt}]'
```

This checks the execution list is reachable. Then trigger a test execution using the sample input.

**Step 5: Trigger a test execution using sample input**

```bash
curl -s -X POST "https://workflows.ur-nl.com/webhook/6d067559-e8da-4451-9f99-1a54840140be" \
  -H "Content-Type: application/json" \
  -H "apikey: test_jombay_n8n_key" \
  -d @n8n/workflows/staging/project-memory-updater/sample_input.json
```

Note: if `sample_input.json` is multipart, adapt the curl call to match its format.

**Step 6: Verify execution used v3 nodes**

Wait ~30 seconds, then check the latest execution:

```bash
curl -s "https://workflows.ur-nl.com/api/v1/executions?limit=1" \
  -H "X-N8N-API-KEY: $(grep N8N_API_KEY .env.local | cut -d= -f2)" | \
  jq '.data[0] | {id, status, startedAt, stoppedAt}'
```

Then fetch that execution with data:

```bash
EXEC_ID=$(curl -s "https://workflows.ur-nl.com/api/v1/executions?limit=1" \
  -H "X-N8N-API-KEY: $(grep N8N_API_KEY .env.local | cut -d= -f2)" | jq -r '.data[0].id')

curl -s "https://workflows.ur-nl.com/api/v1/executions/${EXEC_ID}?includeData=true" \
  -H "X-N8N-API-KEY: $(grep N8N_API_KEY .env.local | cut -d= -f2)" | \
  jq '{status, lastNode: .data.lastNodeExecuted, nodes: (.data.runData | keys)}'
```

Expected: `status: "success"`, node names include `"2.1_FMT_Extract"` (v3), not `"2.1_FMT_Merge"` (v2).

**Step 7: Commit deploy marker**

```bash
git add n8n/workflows/staging/project-memory-updater/main_workflow.json
git commit -m "deploy(pmu): deploy v3 with size constraint, no retry, error reporting to staging"
```
