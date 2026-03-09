# Pre-Work Summary — Improvements Design

**Date:** 2026-03-05
**Workflow:** `[STG] Pre-Work Summary` (ID: `PDjuao8X0zSNWvvN`)
**Status:** Design approved, pending implementation

---

## Problem Statement

Three issues with the current workflow:

1. **CTM input is silently dropped.** The webhook receives `ctm_google_drive_url` but the workflow never extracts or injects it. The prompt's `<ctm>` section is always empty.
2. **Model string is hardcoded** to the full Bedrock ID (`global.anthropic.claude-sonnet-4-5-20250929-v1:0`). Should be `'sonnet'` to use the shared LLM sub-workflow's model mapping.
3. **Main LLM call receives raw, unfiltered inputs.** Project memory and project details can be very large. Without pre-filtering, the single generation call receives excessive noise and risks timeouts on large projects.

---

## Approved Approach

Add a pre-processing LLM node (`2.5_FMT_FilterContext`) that compresses all inputs into focused, slide-relevant JSON before the main generation call. This keeps the single-pass generation intact — preserving cross-slide consistency — while reducing token count for the main call.

---

## Architecture

### Current Flow

```
1.1_TRG_Webhook
  → 2.1_IF_HasDocs
      YES → 2.2_JS_SplitUrls → 2.3_SUB_ExtractDoc → 2.4_JS_CollectDocs
      ↓ (both paths)
  → 3.2_FMT_BuildPrompt → 4.1_SUB_CallLLM → ...
```

### Updated Flow

```
1.1_TRG_Webhook
  → 2.1_IF_HasDocs (checks documents_urls OR ctm_google_drive_url)
      YES → 2.2_JS_SplitUrls (includes CTM URL with type marker)
           → 2.3_SUB_ExtractDoc
           → 2.4_JS_CollectDocs (separates extracted_ctm from extracted_documents)
      ↓ (both paths)
  → 2.5_FMT_FilterContext  [NEW]
  → 3.2_FMT_BuildPrompt
  → 4.1_SUB_CallLLM → ... (unchanged from here)
```

---

## Node-by-Node Changes

### `2.1_IF_HasDocs`
**Change:** Update condition to trigger the doc path if either `documents_urls` OR `ctm_google_drive_url` is non-empty.

```
($json.body.documents_urls is not empty) OR ($json.body.ctm_google_drive_url is not empty)
```

### `2.2_JS_SplitUrls`
**Change:** Include CTM URL in the batch with a `type: 'ctm'` marker so `2.4_JS_CollectDocs` can separate it.

```js
// documents_urls: comma-separated list
// ctm_google_drive_url: single URL

const items = [];
const body = $('1.1_TRG_Webhook').first().json.body;

if (body.documents_urls) {
  const urls = body.documents_urls.split(',').map(u => u.trim()).filter(u => u.length > 0);
  urls.forEach(url => items.push({ json: { mode: 'EXTRACT_CONTENT', google_drive_file_url: url, type: 'document' } }));
}

if (body.ctm_google_drive_url && body.ctm_google_drive_url.trim()) {
  items.push({ json: { mode: 'EXTRACT_CONTENT', google_drive_file_url: body.ctm_google_drive_url.trim(), type: 'ctm' } });
}

return items;
```

### `2.4_JS_CollectDocs`
**Change:** Separate CTM from regular documents in the output.

```js
const docs = [];
let ctm = null;

for (const item of $input.all()) {
  if (item.json.status === 'success' && item.json.extracted_text) {
    if (item.json.type === 'ctm') {
      ctm = item.json.extracted_text;
    } else {
      docs.push(item.json.extracted_text);
    }
  }
}

return [{ json: { extracted_documents: docs, extracted_ctm: ctm, has_documents: docs.length > 0 || ctm !== null } }];
```

### `2.5_FMT_FilterContext` (NEW NODE)
**Type:** Code node (same pattern as `3.2_FMT_BuildPrompt` — builds prompt and calls LLM sub-workflow)
**Model:** `'sonnet'`
**Max tokens:** 3000
**Job:** Extract only what the 12 slides need from large inputs. No fabrication, no inference. If a section has no data, mark it as not found.

**Input sources:**
- `project_details` — from webhook
- `current_project_memory` — from webhook
- `extracted_ctm` — from `2.4_JS_CollectDocs` (null if not provided)
- `extracted_documents` — from `2.4_JS_CollectDocs` (empty array if not provided)

**Output JSON schema:**
```json
{
  "participant_profile": {
    "total_nominated": "string",
    "level_breakdown": ["string"],
    "functions": ["string"],
    "experience_range": "string",
    "locations": ["string"]
  },
  "competencies_in_scope": ["string"],
  "company_profile": {
    "industry": "string",
    "scale": "string",
    "values": ["string"],
    "geographic_presence": ["string"],
    "strategic_focus": ["string"]
  },
  "challenges": [
    {
      "competency": "string",
      "participant_observations": ["string"],
      "manager_leader_observations": ["string"]
    }
  ],
  "current_vs_desired": [
    {
      "competency": "string",
      "current_behaviors": ["string"],
      "desired_behaviors": ["string"]
    }
  ],
  "verbatim_quotes": {
    "participant_fgd": ["string"],
    "manager_fgd": ["string"],
    "leadership_interview": ["string"]
  },
  "client_jargon": [
    { "term": "string", "definition": "string" }
  ],
  "out_of_scope_issues": ["string"],
  "insights": [
    {
      "pattern": "string",
      "root_cause": "string",
      "learning_implications": ["string"],
      "org_requirements": ["string"]
    }
  ],
  "development_themes": [
    {
      "name": "string",
      "subtopics": ["string"],
      "sequencing_logic": "string"
    }
  ],
  "additional_insights": ["string"],
  "extraction_gaps": ["string"]
}
```

**Key rules for FilterContext prompt:**
- Extract only what is explicitly stated — no inference, no fabrication
- Verbatim quotes (for `verbatim_quotes`) must be character-exact from source
- If a section has no data, use empty array `[]` or empty string `""` — never invent
- `extraction_gaps` lists what was missing — maps to `gaps` fields in the main generation
- Output pure JSON — no markdown fences, no explanatory text

### `3.2_FMT_BuildPrompt`
**Changes:**
1. Model string: `'global.anthropic.claude-sonnet-4-5-20250929-v1:0'` → `'sonnet'`
2. Input injection: reads from `2.5_FMT_FilterContext` output instead of raw webhook fields
3. CTM injected from `extracted_ctm` (via FilterContext or directly)
4. Main prompt Section 2 (INPUT STRUCTURE): updated to reference `<project_context>` tag

**What does NOT change in the prompt:**
- Role definition (Section 1)
- Evidence framework (Section 3)
- Output format spec (Section 4) — including the JSON schema with `metadata` + `slides` array
- Voice and tone rules (Section 4.5)
- `slide_notes` generation (Section 5)
- All 12 slide specifications (Section 6)
- Issue handling (Section 7)
- Anti-patterns (Section 8)
- Cross-slide consistency checks (Section 9)
- Generation sequence (Section 10)
- Success criteria (Section 11)
- Output format reminder at end

**Updated Section 2 (INPUT STRUCTURE):**
```
## 2. INPUT STRUCTURE

A single pre-processed context block is provided:

- **`<project_context>`** — Structured JSON containing: participant profile, competencies in scope, company profile, challenges per competency, current vs desired behaviors, verbatim quotes (T1), client jargon, out-of-scope issues, insights, development themes, and any extraction gaps.

If `extraction_gaps` contains items, treat them as missing data — flag in `gaps` for affected slides. Do not fabricate content for gaps.
```

---

## What Stays Unchanged

| Component | Status |
|---|---|
| Webhook input fields | Unchanged — no new required fields |
| `2.3_SUB_ExtractDoc` | Unchanged |
| `4.1_SUB_CallLLM` | Unchanged |
| `5.1_IF_LLMError` | Unchanged |
| `5.2_JS_ParseAndRender` | Unchanged |
| `5.3_IF_ParseError` | Unchanged |
| `6.1_GDOC_Create` | Unchanged |
| `6.2_GDOC_Update` | Unchanged |
| `7.1_API_ReportSuccess` | Unchanged |
| `8.1_ERR_Format` | Unchanged |
| `8.2_API_ReportError` | Unchanged |
| Final output schema | Unchanged — `agent_response` (keyed slides object), `content` (rendered text), Google Doc, API response |
| All 12 slide specifications | Unchanged |
| Evidence rules, output format, voice rules | Unchanged |

---

## Key Design Decisions

**Single-pass generation preserved.** Splitting into 3 generation calls (by slide group) was considered but rejected — cross-slide consistency (themes in 1.1 must match 3.3, insights in 3.1 must link to Group 2 evidence) is hard to guarantee across multiple calls. Pre-processing solves the token problem without this tradeoff.

**FilterContext outputs JSON.** Structured JSON is consumed by the UI and passed downstream cleanly. Easier to serialize into `<project_context>` and inspect for debugging.

**CTM follows the existing extraction path.** No new sub-workflow needed — CTM URL is added to the same `2.3_SUB_ExtractDoc` batch with a type marker. `2.4_JS_CollectDocs` separates it. Minimal change, same proven extraction logic.

**Main prompt is minimally changed.** Only Section 2 (INPUT STRUCTURE) is updated to reference `<project_context>`. All slide specs, evidence tiers, and output rules are preserved exactly — the prompt was already generating correct output.
