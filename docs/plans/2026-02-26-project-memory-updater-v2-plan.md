# Project Memory Updater v2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the current 3-step extract-merge-questions pipeline with a 2-step merge-review pipeline that eliminates output bloat, duplication, and hallucination.

**Architecture:** Webhook receives document + existing memory + corrections. Step 1 (Merge Agent, Sonnet) combines new info into existing memory with active deduplication. Step 2 (Quality Review Agent, Sonnet) catches remaining quality issues and generates clarification questions. Result is PUT back to the coreapi.

**Tech Stack:** n8n workflow (JSON), JavaScript Code nodes, LLM Sub-workflow (existing), HTTP Request nodes

**Design doc:** `docs/plans/2026-02-26-project-memory-updater-v2-design.md`

---

## Reference: Current vs New Node Map

| Current Node | What Happens To It |
|---|---|
| `1.1_TRG_Webhook` | **Keep** — same webhook trigger |
| `1.2_VAL_Input` | **Rewrite** — simplify mode detection, remove extraction-specific logic |
| `1.3_IF_Valid` | **Keep** — same validation gate |
| `1.4_IF_NeedStep1` | **DELETE** — no longer needed (no separate extraction path) |
| `2.1_FMT_Extract` | **DELETE** — extraction step eliminated |
| `2.2_SUB_Extract` | **DELETE** — extraction sub-workflow call eliminated |
| `2.3_FMT_MergeDoc` | **REPLACE** with `2.1_FMT_Merge` — unified merge formatter |
| `2.4_FMT_MergeCorr` | **DELETE** — corrections go through same merge path |
| `3.1_SUB_Merge` | **RENAME** to `2.2_SUB_Merge` — same sub-workflow call |
| `3.2_FMT_Questions` | **REPLACE** with `3.1_FMT_Review` — quality review formatter |
| `3.3_SUB_Questions` | **RENAME** to `3.2_SUB_Review` — same sub-workflow call |
| `4.1_JS_Package` | **Rewrite** — parse review output instead of questions output |
| `4.2_IF_Status` | **Keep** — same error routing |
| `4.3_API_Success` | **Keep** — same API call |
| `5.1_ERR_Format` | **Keep** — same error formatting |
| `5.2_API_Error` | **Keep** — same error API call |

## Reference: Key File Paths

- **Workflow to modify:** `n8n/workflows/staging/project-memory-updater/main_workflow.json`
- **LLM sub-workflow (no changes):** `n8n/workflows/staging/sub_workflows/llm-sub-workflow.json` (ID: `GDaWNcJJtLdY8Q6Y4Yv5p`)
- **Sample input:** `n8n/workflows/staging/project-memory-updater/sample_input.json`
- **Metadata:** `n8n/workflows/metadata.json`
- **Deploy command:** `npm run n8n:deploy -- --env staging`
- **Test command:** `npm run n8n:test-workflow -- project-memory-updater staging`
- **API credentials:** `httpHeaderAuth` ID `9fZP8bOKRNJtilO1` (Jombay Staging API)
- **API endpoint:** `https://coreapi.ur-nl.com/projects/{project_id}/update_project_memory`
- **Error endpoint:** `https://coreapi.ur-nl.com/projects/{project_id}/update_memory_failed`

## Reference: Webhook Input Schema

```json
{
  "project_id": "string",
  "client_id": "string",
  "meeting_note_id": "string",
  "document_summary": "string (nullable) — new document to merge",
  "current_project_memory": "string (nullable) — existing memory markdown",
  "file_type": "string — e.g. 'project_info'",
  "ai_observations": "string (nullable)",
  "clarification_answers": "string (JSON array, nullable)",
  "freeform_corrections": "string (nullable)"
}
```

---

### Task 1: Create sample_input.json test payloads

**Files:**
- Modify: `n8n/workflows/staging/project-memory-updater/sample_input.json`

**Step 1: Write a Mode 2A (initial) test payload**

Replace the empty `{}` in `sample_input.json` with a realistic Mode 2A payload. This is the simplest mode — first document, no existing memory:

```json
{
  "project_id": "test_project_v2_001",
  "client_id": "test_client_v2_001",
  "meeting_note_id": "test_meeting_001",
  "file_type": "meeting_notes",
  "document_summary": "Meeting with Acme Corp HR team on Jan 15, 2026. Present: Rajesh Kumar (CHRO), Priya Sharma (L&D Head), Niket from Jombay. Acme is a 5000-employee manufacturing company in Pune. They want a leadership development program for 40 mid-level managers across 3 plants. Budget is 25 lakhs. Timeline: start by March 2026, complete by June. Key challenge: managers promoted from technical roles lack people management skills. Rajesh said 'we're losing good engineers because their managers can't have difficult conversations'. Priya wants 360-degree assessments as part of the program. Decision: pilot with 15 managers from Pune plant first. Success metric: 20% improvement in team engagement scores within 6 months.",
  "current_project_memory": null,
  "ai_observations": null,
  "clarification_answers": null,
  "freeform_corrections": null
}
```

**Step 2: Commit**

```bash
git add n8n/workflows/staging/project-memory-updater/sample_input.json
git commit -m "test: add Mode 2A sample input for project-memory-updater v2"
```

---

### Task 2: Write the `1.2_VAL_Input` Code node (simplified validator)

**Files:**
- Modify: `n8n/workflows/staging/project-memory-updater/main_workflow.json` (node `1.2_VAL_Input`)

**Step 1: Write the new validation JavaScript**

The validator detects mode, validates inputs, and passes through normalized data. Compared to v1, this removes the `new_extraction` intermediate object — the raw `document_summary` passes straight through.

```javascript
// Input Validation & Mode Detection (v2 — simplified)
const body = $('1.1_TRG_Webhook').first().json.body;

if (!body) {
  return [{ json: {
    validation_passed: false,
    error_message: 'No request body received'
  }}];
}

// Detect inputs
const hasDocSummary = !!(body.document_summary && body.document_summary.trim().length > 0);
const hasMemory = !!(body.current_project_memory && body.current_project_memory.trim().length > 0);

// Determine mode
let mode, modeDescription;
if (!hasMemory) {
  mode = '2A_INITIAL';
  modeDescription = 'First document — building initial memory';
} else if (hasDocSummary) {
  mode = '2B_DOCUMENT_MERGE';
  modeDescription = 'Merging new document into existing memory';
} else {
  mode = '2C_CORRECTIONS';
  modeDescription = 'Applying user corrections to existing memory';
}

// Validate mode-specific requirements
if (mode === '2A_INITIAL' && !hasDocSummary) {
  return [{ json: {
    validation_passed: false,
    error_message: 'Mode 2A requires document_summary for initial build'
  }}];
}

if (mode === '2C_CORRECTIONS') {
  const hasAnswers = body.clarification_answers && body.clarification_answers.length > 0;
  const hasCorrections = body.freeform_corrections && body.freeform_corrections.trim().length > 0;
  if (!hasAnswers && !hasCorrections) {
    return [{ json: {
      validation_passed: false,
      error_message: 'Mode 2C requires either clarification_answers or freeform_corrections'
    }}];
  }
}

return [{ json: {
  validation_passed: true,
  mode: mode,
  mode_description: modeDescription,
  // Pass raw inputs through — no intermediate extraction format
  document_summary: hasDocSummary ? body.document_summary : null,
  file_type: body.file_type || 'unknown',
  ai_observations: body.ai_observations || null,
  current_project_memory: hasMemory ? body.current_project_memory : null,
  clarification_answers: body.clarification_answers || null,
  freeform_corrections: body.freeform_corrections || null,
  project_id: body.project_id,
  client_id: body.client_id,
  meeting_note_id: body.meeting_note_id
}}];
```

**Step 2: Update the node in the workflow JSON**

In `main_workflow.json`, find the node with `"name": "1.2_VAL_Input"` and replace its `jsCode` parameter with the code above (properly escaped for JSON).

**Step 3: Commit**

```bash
git add n8n/workflows/staging/project-memory-updater/main_workflow.json
git commit -m "refactor: simplify 1.2_VAL_Input — pass raw inputs, no extraction format"
```

---

### Task 3: Write the `2.1_FMT_Merge` Code node (unified merge formatter)

**Files:**
- Modify: `n8n/workflows/staging/project-memory-updater/main_workflow.json`

This node REPLACES both `2.1_FMT_Extract` + `2.3_FMT_MergeDoc` + `2.4_FMT_MergeCorr`. One node handles all three modes.

**Step 1: Write the merge formatter JavaScript**

```javascript
// Step 1: Format unified merge prompt (handles all modes: 2A, 2B, 2C)
const validated = $('1.2_VAL_Input').first().json;

const systemPrompt = `# PROJECT MEMORY MAINTENANCE AGENT

You maintain a living "Project Memory" document for consulting projects
at Jombay (HR tech, L&D sector). This document is the single source of
truth consumed by downstream AI workflows.

## YOUR TASK

You will receive:
- The CURRENT project memory (markdown text, or null if first document)
- A NEW document summary to integrate (or null if corrections-only)
- Optional: user corrections or clarification answers to apply

Produce an UPDATED project memory by merging new information into
the existing memory.

## MERGE RULES

### What to ADD:
- Facts not already present in memory: names, numbers, dates, decisions
- Attributed statements: who said what, with context
- Specific observations, constraints, risks mentioned
- Action items, next steps, deadlines

### What to SKIP:
- Facts already captured in existing memory (even if worded differently)
- Generic/obvious statements ("leadership development is important")
- Restatements of information already in another section
- AI-generated interpretations or implications not stated in inputs

### How to MERGE:
- When new info adds detail to an existing bullet, UPDATE that bullet
  in-place rather than adding a new one
- When new info introduces a genuinely new topic, add it to the
  appropriate section (or create a new section)
- When new info contradicts existing memory, mark with
  [CONFLICT — see changes_made.conflicts_detected] and preserve both

## PROPER NOUN RULES
- NEVER modify company names, people names, or locations
- Preserve exactly as stated in input, even if seemingly misspelled
- One organization = one entity. Use the full formal name everywhere.
  Track aliases in the metadata.

## SPEAKER vs PARTICIPANT
- People who SPOKE in meetings are not necessarily program participants
- Only list someone as target audience if explicitly described as such

## MEMORY STRUCTURE

Use ONLY sections with actual content. Do not create empty sections.

Recommended sections (adapt as needed):
- **Project Overview** — What is being delivered
- **Client Context** — Company background — ONLY from inputs
- **Business Problem** — Core challenge, why project exists
- **Target Audience** — Who is impacted, characteristics, needs
- **Stakeholder Expectations** — Attributed to specific people
- **Success Criteria** — Metrics, KPIs
- **Constraints & Realities** — Limitations, ground realities
- **Key Decisions** — What was decided, by whom, when
- **Open Questions** — Unresolved points
- **Observations & Risks** — Behavioral patterns, risks
- **Timeline & Milestones** — Dates, phases, deadlines
- **People Directory** — Name, role (speaker/subject/both), designation

Formatting:
- Include ALL specific facts (names, numbers, dates, quotes, decisions)
- Cut generic statements and obvious implications
- No fact should appear in more than one section
- Prefer bullet lists over prose. Length scales with actual content.
- Use markdown: headers (##), bullet lists, **bold** for emphasis`;

// Build mode-specific input
const mergeInput = {
  mode: validated.mode,
  mode_description: validated.mode_description,
  current_project_memory_text: validated.current_project_memory,
  document_summary: validated.document_summary,
  file_type: validated.file_type,
  ai_observations: validated.ai_observations,
  clarification_answers: validated.clarification_answers,
  freeform_corrections: validated.freeform_corrections
};

const fullPrompt = systemPrompt + '\n\n# INPUT\n\n' + JSON.stringify(mergeInput, null, 2);

return [{ json: {
  prompt: fullPrompt,
  model: 'global.anthropic.claude-sonnet-4-5-20250929-v1:0',
  max_tokens: 8000,
  node_name: 'PMU_V2_STEP1_MERGE',
  workflow_session_id: validated.meeting_note_id || '',
  workflow_id: 'project-memory-updater',
  project_id: validated.project_id || '',
  client_id: validated.client_id || ''
}}];
```

**Step 2: Create the node in workflow JSON**

Add a new Code node with:
- `name`: `"2.1_FMT_Merge"`
- `id`: generate a UUID
- `type`: `"n8n-nodes-base.code"`
- `typeVersion`: 2
- `position`: `[-1200, -900]` (where the old extract node was)
- `jsCode`: the code above (JSON-escaped)

**Step 3: Commit**

```bash
git add n8n/workflows/staging/project-memory-updater/main_workflow.json
git commit -m "feat: add unified 2.1_FMT_Merge node — single prompt for all modes"
```

---

### Task 4: Write the `3.1_FMT_Review` Code node (quality review formatter)

**Files:**
- Modify: `n8n/workflows/staging/project-memory-updater/main_workflow.json`

This node REPLACES `3.2_FMT_Questions`. It parses the merge output and builds the quality review prompt.

**Step 1: Write the review formatter JavaScript**

```javascript
// Step 2: Parse merge output + format quality review prompt
const mergeResult = $input.first().json;
const validated = $('1.2_VAL_Input').first().json;

// Parse merge result
let mergeData = mergeResult.llm_response;
if (typeof mergeData === 'string') {
  try { mergeData = JSON.parse(mergeData); } catch (e) {
    return [{ json: { _error: 'Failed to parse Step 1 merge output: ' + e.message }}];
  }
}

if (!mergeData || !mergeData.project_memory_text) {
  return [{ json: { _error: 'Step 1 output missing project_memory_text' }}];
}

const systemPrompt = `# MEMORY QUALITY REVIEWER

You are a quality reviewer for Project Memory documents at Jombay
(HR tech, L&D sector). Your job is to review a freshly-merged memory
for quality issues and generate clarification questions.

## YOUR TASK

You will receive:
- The UPDATED project memory (just merged by another agent)
- The CHANGELOG from the merge (what was added, skipped, conflicted)

Do two things:
1. REVIEW the memory for quality issues and fix them
2. GENERATE up to 3 clarification questions (if needed)

## REVIEW CHECKLIST

Check and fix each of these:

1. **Duplication**: Is any fact stated in more than one section?
   → Remove the duplicate, keep the most contextually appropriate one
2. **Hallucination risk**: Does any statement seem to contain general
   knowledge rather than input-sourced facts?
   → Flag with [VERIFY] or remove if clearly hallucinated
3. **Attribution**: Are stakeholder statements properly attributed?
   → Ensure "who said what" is clear
4. **Organization coherence**: Is the client referred to by one
   consistent name throughout?
   → Standardize to full formal name
5. **Empty sections**: Are there sections with no real content?
   → Remove them
6. **Fluff**: Are there generic/obvious statements?
   → Remove them

## QUESTION GENERATION

Generate MAX 3 clarification questions. Fewer is better.
Only ask about genuinely important gaps or conflicts.

Priorities:
- HIGH: Blocks progress, affects deliverables/timeline/budget
- MEDIUM: Important but doesn't block immediate work
- LOW: Nice-to-have clarity

Categories:
- CONFLICT: Contradictory information
- GAP: Missing critical information
- AMBIGUITY: Unclear statement needing specificity
- VERIFICATION: Confirm an assumption

Rules:
- Don't ask about information already clear in memory
- Each question must be specific and actionable
- Provide AI recommendations with reasoning
- If the merge was for corrections mode (user answering previous
  questions), be very conservative — only ask if truly critical

## OUTPUT FORMAT

Return ONLY valid JSON:

{
  "project_memory_text": "# Project Memory\\n\\n...",
  "quality_fixes_applied": [
    {
      "type": "duplication | hallucination | attribution | fluff | empty_section",
      "description": "what was fixed",
      "section": "affected section"
    }
  ],
  "clarification_questions": [
    {
      "id": "CQ-001",
      "priority": "HIGH | MEDIUM | LOW",
      "category": "CONFLICT | GAP | AMBIGUITY | VERIFICATION",
      "question": "Specific question",
      "context": "What we currently know about this",
      "ideal_answer": "Example of a good answer",
      "ai_recommendation": {
        "suggestion": "Recommended answer",
        "reasoning": "Why",
        "confidence": "HIGH | MEDIUM | LOW"
      }
    }
  ]
}`;

const reviewInput = {
  project_memory_text: mergeData.project_memory_text,
  changes_made: mergeData.changes_made || null,
  mode: validated.mode,
  mode_description: validated.mode_description
};

const fullPrompt = systemPrompt + '\n\n# INPUT\n\n' + JSON.stringify(reviewInput, null, 2);

return [{ json: {
  prompt: fullPrompt,
  model: 'global.anthropic.claude-sonnet-4-5-20250929-v1:0',
  max_tokens: 8000,
  node_name: 'PMU_V2_STEP2_REVIEW',
  workflow_session_id: validated.meeting_note_id || '',
  workflow_id: 'project-memory-updater',
  project_id: validated.project_id || '',
  client_id: validated.client_id || '',
  // Carry forward Step 1 data for fallback
  _step1_memory: mergeData.project_memory_text,
  _step1_changes: mergeData.changes_made || null
}}];
```

**Step 2: Create the node in workflow JSON**

Add a Code node with:
- `name`: `"3.1_FMT_Review"`
- `id`: generate a UUID
- `type`: `"n8n-nodes-base.code"`
- `typeVersion`: 2
- `position`: `[0, -900]`
- `jsCode`: the code above (JSON-escaped)

**Step 3: Commit**

```bash
git add n8n/workflows/staging/project-memory-updater/main_workflow.json
git commit -m "feat: add 3.1_FMT_Review node — quality review + question generation"
```

---

### Task 5: Write the `4.1_JS_Package` Code node (output packager)

**Files:**
- Modify: `n8n/workflows/staging/project-memory-updater/main_workflow.json`

**Step 1: Write the package JavaScript**

```javascript
// Package final output: Step 2 review output → API response
const reviewResult = $input.first().json;
const validated = $('1.2_VAL_Input').first().json;
const fmtReviewData = $('3.1_FMT_Review').first().json;

// Parse review result
let reviewData = reviewResult.llm_response;
if (typeof reviewData === 'string') {
  try { reviewData = JSON.parse(reviewData); } catch (e) {
    // Non-fatal: fall back to Step 1 memory
    reviewData = null;
  }
}

// Use review output if available, otherwise fall back to Step 1 merge
let finalMemory, questions, qualityFixes;

if (reviewData && reviewData.project_memory_text) {
  finalMemory = reviewData.project_memory_text;
  questions = Array.isArray(reviewData.clarification_questions)
    ? reviewData.clarification_questions : [];
  qualityFixes = reviewData.quality_fixes_applied || [];
} else {
  // Fallback: use Step 1 output directly
  finalMemory = fmtReviewData._step1_memory;
  questions = [];
  qualityFixes = [];
}

if (!finalMemory) {
  return [{ json: {
    memory_status: 'error',
    error_message: 'No memory output from either merge or review step',
    project_id: validated.project_id,
    client_id: validated.client_id,
    meeting_note_id: validated.meeting_note_id
  }}];
}

const memory_status = questions.length > 0 ? 'clarification_needed' : 'updated';

return [{ json: {
  memory_status: memory_status,
  current_project_memory: finalMemory,
  clarification_questions: questions,
  metadata: {
    changes_made: fmtReviewData._step1_changes,
    quality_fixes: qualityFixes,
    mode: validated.mode,
    mode_description: validated.mode_description
  },
  project_id: validated.project_id,
  client_id: validated.client_id,
  meeting_note_id: validated.meeting_note_id
}}];
```

**Step 2: Update the `4.1_JS_Package` node in the workflow JSON**

Replace the existing `jsCode` in the node named `4.1_JS_Package`.

**Step 3: Commit**

```bash
git add n8n/workflows/staging/project-memory-updater/main_workflow.json
git commit -m "refactor: rewrite 4.1_JS_Package for 2-step pipeline output"
```

---

### Task 6: Assemble the complete workflow JSON

**Files:**
- Modify: `n8n/workflows/staging/project-memory-updater/main_workflow.json`

This is the structural task — rewire nodes and connections to match the new 2-step pipeline.

**Step 1: Remove deleted nodes from the `nodes` array**

Remove these nodes from the JSON:
- `1.4_IF_NeedStep1` (mode branching gate — no longer needed)
- `2.1_FMT_Extract` (extraction formatter — eliminated)
- `2.2_SUB_Extract` (extraction sub-workflow call — eliminated)
- `2.3_FMT_MergeDoc` (doc merge formatter — replaced by `2.1_FMT_Merge`)
- `2.4_FMT_MergeCorr` (corrections merge formatter — replaced by `2.1_FMT_Merge`)
- `3.2_FMT_Questions` (question formatter — replaced by `3.1_FMT_Review`)

Keep these nodes (renamed/updated in earlier tasks):
- `1.1_TRG_Webhook` (unchanged)
- `1.2_VAL_Input` (updated in Task 2)
- `1.3_IF_Valid` (unchanged)
- `2.1_FMT_Merge` (NEW — from Task 3)
- `2.2_SUB_Merge` (was `3.1_SUB_Merge` — rename, same sub-workflow call)
- `3.1_FMT_Review` (NEW — from Task 4)
- `3.2_SUB_Review` (was `3.3_SUB_Questions` — rename, same sub-workflow call)
- `4.1_JS_Package` (updated in Task 5)
- `4.2_IF_Status` (unchanged)
- `4.3_API_Success` (unchanged)
- `5.1_ERR_Format` (unchanged)
- `5.2_API_Error` (unchanged)

**Step 2: Rename the kept sub-workflow nodes**

- Node `3.1_SUB_Merge` → rename to `2.2_SUB_Merge`, update position to `[-900, -900]`
- Node `3.3_SUB_Questions` → rename to `3.2_SUB_Review`, update position to `[300, -900]`

Both keep their existing settings:
- `workflowId`: `GDaWNcJJtLdY8Q6Y4Yv5p`
- `onError`: `continueErrorOutput`
- `retryOnFail`: true
- `maxTries`: 2
- `waitBetweenTries`: 5000

**Step 3: Rewrite the `connections` object**

New connection map:

```json
{
  "1.1_TRG_Webhook": {
    "main": [[{ "node": "1.2_VAL_Input", "type": "main", "index": 0 }]]
  },
  "1.2_VAL_Input": {
    "main": [[{ "node": "1.3_IF_Valid", "type": "main", "index": 0 }]]
  },
  "1.3_IF_Valid": {
    "main": [
      [{ "node": "2.1_FMT_Merge", "type": "main", "index": 0 }],
      [{ "node": "5.1_ERR_Format", "type": "main", "index": 0 }]
    ]
  },
  "2.1_FMT_Merge": {
    "main": [[{ "node": "2.2_SUB_Merge", "type": "main", "index": 0 }]]
  },
  "2.2_SUB_Merge": {
    "main": [
      [{ "node": "3.1_FMT_Review", "type": "main", "index": 0 }],
      [{ "node": "5.1_ERR_Format", "type": "main", "index": 0 }]
    ]
  },
  "3.1_FMT_Review": {
    "main": [[{ "node": "3.2_SUB_Review", "type": "main", "index": 0 }]]
  },
  "3.2_SUB_Review": {
    "main": [
      [{ "node": "4.1_JS_Package", "type": "main", "index": 0 }],
      [{ "node": "5.1_ERR_Format", "type": "main", "index": 0 }]
    ]
  },
  "4.1_JS_Package": {
    "main": [[{ "node": "4.2_IF_Status", "type": "main", "index": 0 }]]
  },
  "4.2_IF_Status": {
    "main": [
      [{ "node": "5.1_ERR_Format", "type": "main", "index": 0 }],
      [{ "node": "4.3_API_Success", "type": "main", "index": 0 }]
    ]
  },
  "5.1_ERR_Format": {
    "main": [[{ "node": "5.2_API_Error", "type": "main", "index": 0 }]]
  }
}
```

**Step 4: Clear the `pinData` object**

The existing pinData references old node names (`Webhook` instead of `1.1_TRG_Webhook`). Set `"pinData": {}` to avoid stale test data breaking the workflow.

**Step 5: Update the workflow `name` field**

Change from `"[STG] Project Memory Updater"` to `"[STG] Project Memory Updater v2"` so we can identify the new version on the n8n dashboard.

**Step 6: Validate the JSON**

Run:
```bash
python3 -c "import json; json.load(open('n8n/workflows/staging/project-memory-updater/main_workflow.json')); print('Valid JSON')"
```
Expected: `Valid JSON`

**Step 7: Verify node count and connections**

Run:
```bash
python3 -c "
import json
wf = json.load(open('n8n/workflows/staging/project-memory-updater/main_workflow.json'))
nodes = [n['name'] for n in wf['nodes']]
print(f'Node count: {len(nodes)}')
print('Nodes:', nodes)
conns = list(wf['connections'].keys())
print(f'Connection sources: {len(conns)}')
print('Sources:', conns)
# Verify all connection targets exist
all_targets = set()
for src, data in wf['connections'].items():
    for outputs in data['main']:
        for conn in outputs:
            all_targets.add(conn['node'])
missing = all_targets - set(nodes)
print(f'Missing targets: {missing or \"none\"}'  )
"
```

Expected:
```
Node count: 12
Missing targets: none
```

**Step 8: Commit**

```bash
git add n8n/workflows/staging/project-memory-updater/main_workflow.json
git commit -m "feat: assemble v2 workflow — 2-step merge+review pipeline, 12 nodes"
```

---

### Task 7: Deploy to staging and smoke test

**Files:**
- No file changes — deployment and testing only

**Step 1: Deploy to staging**

```bash
npm run n8n:deploy -- --env staging
```

Expected: Successful deployment with `project-memory-updater` updated.

**Step 2: Smoke test with Mode 2A (initial memory)**

```bash
npm run n8n:test-workflow -- project-memory-updater staging
```

This will use the `sample_input.json` payload (Mode 2A — first document, no existing memory).

Expected: HTTP 200 response with:
- `memory_status`: `"updated"` or `"clarification_needed"`
- `current_project_memory`: Non-empty markdown with sections
- No duplicated facts
- No hallucinated information

**Step 3: Verify output quality**

Manually inspect the returned `current_project_memory`:
1. Check that it contains the key facts from the sample input (Acme Corp, Rajesh Kumar, 40 managers, 25 lakhs, etc.)
2. Check that there's NO information not present in the input
3. Check that sections are used appropriately (not 13 empty sections)
4. Check output length — should be concise, not bloated

**Step 4: Commit any fixes**

If the smoke test reveals issues, fix them and commit before proceeding.

---

### Task 8: Update metadata description

**Files:**
- Modify: `n8n/workflows/metadata.json`

**Step 1: Update the workflow description**

Find all three entries for `project-memory-updater` (development, staging, production) and update the `description` field:

Old:
```
"Project Memory Consolidator — 3-mode workflow (2A: Initial Build, 2B: Document Merge, 2C: Corrections Only) that maintains evolving project memory with conflict detection and clarification questions via LLM sub-workflow."
```

New:
```
"Project Memory Updater v2 — 2-step pipeline (Merge + Quality Review) that maintains project memory with active deduplication, hallucination prevention, and clarification questions. Modes: 2A Initial Build, 2B Document Merge, 2C Corrections."
```

**Step 2: Commit**

```bash
git add n8n/workflows/metadata.json
git commit -m "docs: update project-memory-updater description for v2 pipeline"
```

---

### Task 9: Copy v2 workflow to development environment

**Files:**
- Modify: `n8n/workflows/development/project-memory-updater/main_workflow.json`

**Step 1: Copy the staging workflow to development**

The development workflow should be identical in structure but with the dev-specific name and webhook path.

```bash
cp n8n/workflows/staging/project-memory-updater/main_workflow.json \
   n8n/workflows/development/project-memory-updater/main_workflow.json
```

**Step 2: Update dev-specific fields**

In the dev copy, update:
- `name`: `"[DEV] Project Memory Updater v2"`
- `webhookId`/`webhookPath` on `1.1_TRG_Webhook`: use the dev webhook path from metadata (`55fa4152-e304-4417-94e2-6d1bd13c9ac5`)
- Sub-workflow IDs in `2.2_SUB_Merge` and `3.2_SUB_Review`: use the development LLM sub-workflow ID from metadata
- API credential ID: use the development API credential

**Step 3: Copy sample_input.json**

```bash
cp n8n/workflows/staging/project-memory-updater/sample_input.json \
   n8n/workflows/development/project-memory-updater/sample_input.json
```

**Step 4: Commit**

```bash
git add n8n/workflows/development/project-memory-updater/
git commit -m "feat: copy v2 workflow to development environment"
```
