# Design: Project Memory Updater — Reliability Improvements

**Date:** 2026-03-06
**Triggered by:** Execution 21770 failure (10-min timeout, no error reported back)
**Workflow:** `[STG] Project Memory Updater v2` — workflow ID `uX4p9Kt3Ztz59NEO`

---

## Root Cause Summary

Execution 21770 was canceled after 10 minutes with no error reported to the backend. The failure chain:

1. `2.1_FMT_Merge` built a ~69,000 char prompt (current project memory + large document summary)
2. `2.2_SUB_Merge` called the LLM sub-workflow — it errored after 5 min (execution 21771)
3. Retry config (`maxTries: 2`) triggered a second attempt (21772) — also failed at 5 min
4. Parent workflow hit 10-min n8n timeout and was canceled
5. Error path (`5.1_ERR_Format` → `5.2_API_Error`) never ran — retry consumed the entire timeout budget

Additionally, the deployed workflow is the old v2 (direct merge, 1 large LLM call). The new v3 architecture (Extract → Merge → Questions, 3 scoped LLM calls) exists locally but has not been deployed.

---

## Changes

### 1. Output Size Guard — Prompt Constraint + max_tokens

**Target nodes:** `2.3_FMT_MergeDoc` and `2.4_FMT_MergeCorr` in v3

Add the following constraint block to the end of the system prompt in both nodes:

> MEMORY SIZE CONSTRAINT: Keep `project_memory_text` under 25,000 characters (~6000 tokens). If merging would exceed this, compress existing sections by dropping older redundant details and verbose context. Never remove Key Decisions, Constraints, Success Criteria, or Timeline entries. New information always takes priority over existing content.

Also reduce `max_tokens` from `8000` → `7000` in both FMT nodes. This allocates ~6000 tokens for the memory text and ~1000 tokens for the `changes_made` JSON wrapper.

**Rationale:** The LLM will actively manage memory size during merge rather than growing unbounded. The tighter `max_tokens` prevents runaway output while leaving headroom for the full JSON response to complete cleanly.

---

### 2. Disable Retry on All SUB Nodes

**Target nodes:** `2.2_SUB_Extract`, `3.1_SUB_Merge`, `3.3_SUB_Questions` in v3

Remove from each:
```json
"retryOnFail": true,
"maxTries": 2,
"waitBetweenTries": 5000
```

**Rationale:** With `maxTries: 2` and a 5-min LLM timeout, a single retry consumes ~10 min — the entire parent workflow budget. Disabling retry means the error output fires immediately on first failure, giving the error reporting path time to run before the parent timeout.

---

### 3. Error Handling — No Structural Changes Needed

The v3 workflow already has correct error wiring:
- All SUB nodes: `onError: "continueErrorOutput"` → `5.1_ERR_Format`
- `5.1_ERR_Format` → `5.2_API_Error` → `PUT /projects/:id/update_memory_failed`

The error path was blocked by retry (Section 2). Disabling retry is sufficient to activate it.

`5.1_ERR_Format` handles `_error`, `error_message`, and `error.message` shapes — this covers the n8n sub-workflow error format.

---

### 4. Deploy v3

Steps:
1. Ensure top-level `nodes` and `connections` in the local JSON reflect v3 structure (from `activeVersion.nodes`) with Sections 1–3 changes applied
2. Deploy: `npm run n8n:deploy -- --env staging`
3. Activate: `npm run n8n:activate -- project-memory-updater staging`
4. Verify: check n8n execution list after a test run confirms correct node names and error path fires on failure

---

## What We Are Not Doing

- **Input chunking** — not viable since chunking `current_project_memory` would lose coherence across chunks
- **Retry with backoff** — removing retry entirely for now; can revisit once underlying timeout issue is resolved
- **Compression LLM call** — adds latency and another failure point; prompt constraint (Section 1) is sufficient
