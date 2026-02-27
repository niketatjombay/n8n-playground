# Session Slides v2 → v3 — Architecture Document

**Status:** v2 COMPLETE — All 10 steps implemented | v3 APPROVED — Design at `docs/plans/2026-02-27-session-slides-v3-design.md`
**Date:** 2026-02-21 (v2) | 2026-02-27 (v3 design approved)
**Based on:** Execution 12678 (full-data run) + Execution 13300 (regeneration run)

---

## v3 Changes (Approved 2026-02-27)

Three consultant-reported issues drive v3:
1. **Outline sequence not followed** — slides don't match client-approved outline order
2. **Activities missed** — activities from outline absent in output
3. **Target audience ignored** — content appropriate for junior audiences even for senior sessions

### Root Causes Found
- `outline_alignment` is computed and distributed but **dropped** in `_fmt_group_template.js` — never injected into content generation prompt
- No chronological order instruction in `_fmt_alignoutline_node.js`
- No programmatic validation that all outline activities made it into slides
- `seniority_of_cohort` flows through pipeline but Agent 2 has zero adaptation instructions
- `sessionType`, `totalDuration`, `additionalInstructions` not propagated to all stages

### v3 Design Summary (5 changes + 1 new node)

1. **Outline → 17-Section Mapping** (`_fmt_alignoutline_node.js` rewrite): The 17 slide types are SECTIONS, not fixed slides. LLM acts as expert presentation designer — decides how many slides each section needs based on content density. Preserves outline chronological order. Considers seniority and session type.

2. **Module-Based Group Packing** (`_js_splitgroups_node.js` rewrite): Groups slides by outline module boundaries into 7 slots (not even count distribution). Static slides → Groups 1 & 7. Outline modules → Groups 2-6. Seniority and session type injected into Agent 2 system prompt.

3. **Outline + KB Injection** (`_fmt_group_template.js` update): Injects `group.outline_alignment` (per-slide outline evidence) and per-slide KB content into content generation prompt. Each slide gets explicit instruction: "deliver this outline_excerpt."

4. **Expanded Tagging** (`_fmt_tag_content_node.js` update): Maps KB and pre-work to specific expanded slide IDs (e.g., `slide_9_1`, `slide_9_2`) instead of just section types.

5. **Session Constraints Propagation**: `totalDuration`, `sessionType`, `additionalInstructions` flow to ALL prompt stages (AlignOutline, Blueprint, Content Gen, QC, Scripts).

6. **NEW: Coverage Validation** (`_js_coverage_check_node.js`): Pure JS node after content merge, before QC. Cross-checks every outline item has a generated slide. Feeds coverage report to QC quality node.

See full design: `docs/plans/2026-02-27-session-slides-v3-design.md`

---

## Problem Statement

Both analyzed executions failed:
- **Exec 12678** (full data): Agent 1 timed out at 605s. Memory extraction took 546s. Only 13 of ~50 nodes ran. Pipeline died at Agent 1 parse.
- **Exec 13300** (regeneration): Agent 3 (QA) timed out at 300s. 69K token prompt. Pipeline completed all stages but error path fired instead of success.

Root cause: **no token budget discipline** — prompts are assembled without size constraints, outputs are uncapped, every agent gets everything.

### The Token Budget Rule

```
Time = (input_tokens / read_speed) + (output_tokens / gen_speed)
```

For Sonnet on Bedrock (~100K tok/min read, ~4-5K tok/min write):

| Input Tokens | Output Tokens | Est. Time | Verdict |
|-------------|---------------|-----------|---------|
| 15K | 5K | ~75s | Safe |
| 30K | 8K | ~120s | OK |
| 50K | 10K | ~160s | Risky |
| **69K** | **15K** | **~260s** | **Timeout** |

**Design rule: Max ~30K input tokens, ~10K output tokens per call. Every call must fit under 200s.**

---

## Input Analysis (Execution 12678 — Full Data)

### Raw Webhook Inputs

| Field | Size | Tokens | Description |
|-------|------|--------|-------------|
| `project_details` | 4,211 chars | ~1K | 25 fields — many irrelevant |
| `current_project_memory` | 83,817 chars | ~21K | Unstructured text — full project history |
| `input_json.preWorkSummaryOutputJson` | 73,537 chars | ~18K | 12 pre-work slides — PRIMARY content source |
| `input_json.sessionConstraints` | 85 chars | ~21 | totalDuration, sessionType, additionalInstructions |
| `documents_urls` | 96 chars | — | Google Doc URL (content outline) |
| **TOTAL INPUT** | **~162K chars** | **~40K tokens** | |

### project_details (4,211 chars, ~1K tokens)

**KEEP** (session-relevant):
```
name, industry, seniority_of_cohort, background, client_objective,
content_type, facilitators_name, program_type, project_notes, project_components
```

**DROP** (irrelevant noise):
```
description, addresses_for_sessions, analytics_type, assessment_use_case,
assessors_name, cohort_size_description_ac, cohort_size_description_dj,
custom_ac_content, dj_content_complexity, dj_content_readiness,
due_date, start_date, project_duration_months, practice_type,
cities_locations, clarification_answers, freeform_corrections, error_message
```

Estimated savings: 4,211 → ~2,000 chars

### preWorkSummaryOutputJson (73,537 chars, ~18K tokens)

This is the **most important input** — contains the actual content, insights, and challenges from pre-work assessments. It's structured as 12 pre-work slides across 3 sections:

**Section 1 — Project Context (3 slides, ~12K chars)**

| Slide | Template | Title | Size | Confidence | Flags |
|-------|----------|-------|------|------------|-------|
| slide_1_1 | 9 | PROJECT OVERVIEW | 4,603 | High | G3 A2 |
| slide_1_2 | 14 | COMPANY PROFILE | 3,307 | High | A1 |
| slide_1_3 | ? | PARTICIPANT PROFILE | 4,254 | Medium | G3 A1 |

**Section 2 — Diagnostic Findings (5 slides, ~29K chars)**

| Slide | Template | Title | Size | Confidence | Flags |
|-------|----------|-------|------|------------|-------|
| slide_2_1 | 34 | CHALLENGES HEARD | 8,008 | High | A1 |
| slide_2_2 | 35 | CURRENT VS DESIRED STATE | 7,504 | High | A1 |
| slide_2_3 | 42 | CAPTURED EXAMPLES (VERBATIM) | 4,082 | Medium | G1 |
| slide_2_4 | 43 | CAPTURED JARGON | 5,480 | High | — |
| slide_2_5 | 36 | OUT OF SCOPE ISSUES | 3,748 | High | A1 |

**Section 3 — Insights & Themes (4 slides, ~32K chars)**

| Slide | Template | Title | Size | Confidence | Flags |
|-------|----------|-------|------|------------|-------|
| slide_3_1 | 19 | OUR INSIGHTS | 12,701 | Medium | G1 A1 |
| slide_3_2 | 27 | BEHAVIORAL THEMES FOR ASSESSMENT | 4,098 | High | A1 |
| slide_3_3 | 20 | THEMES FOR DEVELOPMENT | 9,213 | Medium | G1 A1 |
| slide_3_4 | 25 | ADDITIONAL INSIGHTS (OUT OF SCOPE) | 6,359 | High | — |

(G = gaps, C = conflicts, A = ambiguity flagged in consultant_notes)

**Per-slide structure:**
```json
{
  "slide_id": "1.1",
  "template_reference": "9",
  "slide_title": "PROJECT OVERVIEW",
  "confidence": "High",
  "bullets": {
    "section_name": ["bullet 1", "bullet 2", "..."]
  },
  "consultant_notes": {
    "walkthrough_tip": "short delivery guidance (~200 chars)",
    "slide_notes": ["detailed note 1", "detailed note 2"],
    "gaps": ["identified gaps"],
    "conflicts": ["identified conflicts"],
    "ambiguity": ["identified ambiguities"]
  }
}
```

**Key insight:** The pre-work slides are NOT the same as the 17 session slides. They need to be MAPPED to session slides. Example:
- Pre-work "CHALLENGES HEARD" → informs session slide 9 (Content), 11 (Discussion), 12 (Activity)
- Pre-work "OUR INSIGHTS" → informs session slide 9 (Content), 16 (Call to Action)
- Pre-work "PROJECT OVERVIEW" → informs session slide 6 (Program Overview), 7 (Objectives)

**At 73K chars, this data CANNOT be sent in full to every agent.** It must be:
1. Mapped to session slides (step 5)
2. Each agent group receives only the pre-work slides relevant to its session slides

### current_project_memory (83,817 chars, ~21K tokens)

Unstructured markdown text — full history of all project interactions. Contains:
- Program goals, audience details, organizational context
- Stakeholder decisions, commitments, blocking items
- Competency definitions, assessment approach
- Risk concerns, open questions

**Too large for any single LLM call as context.** Must be filtered by LLM (Haiku) to extract session-relevant insights. Target: max 2K chars output.

### sessionConstraints (85 chars)

```json
{
  "totalDuration": "2 days",
  "sessionType": "in_person",
  "additionalInstructions": ""
}
```

Small and complete — pass through as-is.

### content_outline_url / documents_urls

In execution 12678, `content_outline_url` was empty but `documents_urls` had a Google Doc link. The DriveUtils sub-workflow extracts text from this doc.

---

## Current Architecture (v1) — What Failed

### Execution 12678 (full data, earlier workflow version)

```
Webhook → Validate → DriveUtils → ExtractMemory(546s!) → Agent1(605s! → FAILED)
  → Error path → PUT error to CoreAPI
```

Only 13 nodes ran. Pipeline died at Agent 1 parse ("Agent 1 did not return valid llm_response object").

- ExtractMemory: 546s — Haiku returned 48K chars (20 keys) instead of targeted extraction
- Agent 1: 605s then failed — sub-workflow timeout

### Execution 13300 (regeneration, newer workflow version with Agent 1A/1B split)

```
Webhook → Validate → DriveUtils → ExtractMemory(195s) → KBSearch(56s)
  → Agent1A(109s) → Agent1B×7(66s) → Agent2×7(230s) → Agent3(300s TIMEOUT)
  → Error path → PUT error to CoreAPI
```

All nodes ran through Agent 2 successfully, but Agent 3 timed out with 69K token prompt.

| Stage | Exec 12678 | Exec 13300 |
|-------|-----------|-----------|
| ExtractMemory | 546s | 195s |
| Agent 1 / 1A | 605s (FAIL) | 109s |
| Agent 1B | — | 66s |
| Agent 2 (max) | — | 230s |
| Agent 3 | — | 300s (FAIL) |
| **Result** | FAILED at Agent 1 | FAILED at Agent 3 |

---

## Proposed Architecture (v2)

### Design Principles

1. **Don't use LLMs for what code can do** — deterministic mappings (Gagné events, slide types) hardcoded
2. **Right-size every call** — budget input + output to fit under 200s
3. **Right model for the task** — Haiku for extraction/classification, Sonnet for creative generation
4. **Minimal context per call** — only send what's needed for that specific task
5. **Separate content from scripts** — generate slide content first, QC it, then generate facilitator scripts
6. **Input trimming is critical** — filter structured inputs in code, unstructured inputs via LLM
7. **Accuracy first** — prefer Sonnet for content generation; compact output schemas over verbose ones

### Pipeline

```
STEP 1: Parse Input (Code, ~0s)
├── Parse JSON fields (handle camelCase keys from frontend)
├── Guard: client_name required
└── Null out empty sections (pre_work={}, constraints={})

STEP 2: Filter Structured Input (Code, ~0s)
├── Trim project_details to ~10 relevant fields
├── Extract pre-work metadata: competencies, themes, audience context
├── Keep full pre-work slides intact (will be distributed in step 5)
└── Build slide structure template (17 types + Gagné mapping — deterministic)

STEP 3+4+DriveUtils (PARALLEL, ~60s wall clock):
├── [3] Filter Memory (Haiku, ~30s)
│   Input: 84K chars project memory
│   Output: max 2K chars — session-relevant insights only
│   Key: tight prompt, hard output cap
├── [4] KB Fetch (Haiku + tool use, ~60s)
│   Input: client context + competency terms from pre-work metadata
│   Output: 10-12 content units, ~10K chars
└── [DriveUtils] Extract content outline (sub-wf, ~5s if URL exists)

STEP 5: Tag Content to Slides (Haiku, ~15-20s)
├── Input: 10 KB unit summaries + 12 pre-work slide summaries + 17 session slide types
├── Output: mapping of BOTH KB units AND pre-work slides to session slides
│   {
│     "slide_6": { "kb_units": ["CU_123"], "pre_work_slides": ["slide_1_1"] },
│     "slide_9": { "kb_units": ["CU_456", "CU_789"], "pre_work_slides": ["slide_2_1", "slide_3_1"] },
│     "slide_13": { "kb_units": [], "pre_work_slides": [] }
│   }
└── NOTE: This is the key input optimization — distributes 73K chars of pre-work across groups

STEP 6: Blueprint (Sonnet, ~80-100s)
├── Input: filtered memory + content outline + trimmed project_details + session constraints
│   + pre-work metadata (not full slides) + KB summary list (~15-20K tokens)
├── Output: session_overview + per-slide blueprint (compact schema) (~5K tokens)
└── NOTE: Merges current Agent 1A + Agent 1B into single call

STEP 7: Content Generation (7 parallel, Sonnet, ~90s max)
├── Each group gets ONLY:
│   - Its slides' blueprint entries
│   - Its tagged KB units (full content)
│   - Its tagged pre-work slides (full content)
│   - Client context (trimmed project_details)
│   - Session constraints
├── Each outputs: slide content only (title, headline, bullets, activity)
└── Does NOT produce facilitator scripts (moved to step 9)

STEP 8: QC Content (Sonnet, ~50s)
├── Input: all 17 slides content + blueprint reference (~12-15K tokens)
├── Output: per-slide flags + overall quality rating (~3K tokens)
└── Flags for human review — does NOT rewrite content

STEP 9: Generate Scripts + Extras (7 parallel, Sonnet, ~60s max)
├── Each group gets: finalized content + its blueprint + QC flags + its pre-work slides
└── Each outputs: facilitator_script, visual_guidance, energy_notes, modality_notes

STEP 10: Assemble + PUT (Code + API, ~5s)
└── Merge all outputs, embed QC flags, build final JSON, PUT to CoreAPI
```

### Why Step 5 (Tagging) is Critical

Without tagging, the 73K chars of pre-work data would either:
- Be sent to ALL 7 groups → each gets 73K extra chars → timeout
- Be summarized and lose detail → content quality drops
- Be dropped → content has no grounding in pre-work (this is what happened in v1!)

With tagging:
- Group 4 (Core Content, slides 8-10) gets pre-work slides about challenges + insights → ~25K chars
- Group 1 (Title & Intro, slides 1-3) gets the project overview slide → ~5K chars
- Group 6 (Break/Questions, slides 13-15) gets nothing → 0 chars
- Each group stays under the 30K input token budget

### Time Budget

```
v1 exec 12678:   546s + 605s(💥) = FAILED at step 2
v1 exec 13300:   195s + 109s + 66s + 230s + 300s(💥) = ~16 min, FAILED at QA

v2 (proposed):   60s  + 20s  + 100s + 90s  + 50s + 60s + 5s = ~6.5 min (RELIABLE)
                 (3+4) (5)   (6)    (7)    (8)   (9)   (out)
```

### Token Budget Per Call

| Step | Model | Input | Output | Est. Time | Risk |
|------|-------|-------|--------|-----------|------|
| 3. Filter Memory | Haiku | ~21K | ~500 | ~25s | Low |
| 4. KB Fetch | Haiku | ~3K | ~5K | ~50s | Low (tool use) |
| 5. Tag Content | Haiku | ~8K | ~2K | ~20s | None |
| 6. Blueprint | Sonnet | ~18K | ~5K | ~100s | Low |
| 7. Content (per group) | Sonnet | ~10-18K | ~3-5K | ~60-90s | Low |
| 8. QC | Sonnet | ~15K | ~3K | ~50s | Low |
| 9. Scripts (per group) | Sonnet | ~8-12K | ~3-5K | ~40-60s | Low |

All calls safely under 200s. No timeout risk.

---

## Key Differences from v1

| Aspect | v1 (Current) | v2 (Proposed) |
|--------|-------------|---------------|
| Pre-work handling | Sent in full to every agent (or dropped entirely due to key mismatch bug) | Tagged to session slides, distributed per-group |
| Memory extraction | LLM with no output cap (546s / 195s) | LLM (Haiku) with tight output cap (~30s) |
| Gagné/Kolb mapping | LLM decides | Hardcoded in code (deterministic) |
| Blueprint phase | Agent 1A (serial) + Agent 1B (7 parallel) = 2 serial LLM phases | Single Sonnet call = 1 serial LLM phase |
| Content generation | Produces content + scripts together | Content ONLY (scripts in step 9) |
| Per-group context | Full KB + full pre-work to every group | Tagged KB + tagged pre-work subset only |
| QA review | Single 69K token call (TIMEOUT) | Reviews content-only (~15K tokens) |
| Facilitator scripts | Part of content gen (huge output) | Separate step after QC (based on finalized content) |
| Input filtering | Minimal (key mismatch dropped 73K chars) | Structured filtering in code + LLM filtering for unstructured |

---

## Slide Groups

| Group | Session Slides | Focus |
|-------|--------|-------|
| 1 | 1-3 | Title & Introduction |
| 2 | 4-5 | Setup & Framing |
| 3 | 6-7 | Context & Objectives |
| 4 | 8-10 | Core Content |
| 5 | 11-12 | Engagement & Application |
| 6 | 13-15 | Transition & Reflection |
| 7 | 16-17 | Action & Closing |

---

## Compact Output Schemas

### Step 6: Blueprint (per slide)
```json
{
  "slide_N": {
    "intent": "one sentence — what this slide achieves",
    "content_direction": "what to put on this slide",
    "key_message": "the one thing the participant should remember",
    "experience_anchors": ["real-world situation to reference"],
    "kb_units_to_use": ["CU_123"],
    "flags": ["any concerns"]
  }
}
```

### Step 7: Content (per slide)
```json
{
  "slide_N": {
    "slide_title": "string",
    "headline": "punchy, memorable",
    "subtext": "supporting line",
    "bullets": ["max 4, under 12 words each"],
    "activity": {
      "has_activity": false,
      "instructions": null,
      "duration_minutes": null
    },
    "provenance": "New | Reused | Adapted",
    "provenance_source": "string"
  }
}
```

### Step 9: Scripts + Extras (per slide)
```json
{
  "slide_N": {
    "facilitator_script": "near-verbatim delivery guide",
    "visual_guidance": "what visual to show",
    "energy_note": "facilitator tone/energy",
    "modality_notes": {
      "virtual": "specific adaptations",
      "in_person": "specific adaptations"
    },
    "debrief_questions": ["for activity/discussion slides"],
    "activity_run_of_show": "step-by-step if applicable"
  }
}
```

---

## Known Bug in v1 (FIXED)

The `1.2_VAL_Input` node looked for `input_json.pre_work_summary_output_json` (snake_case) but the frontend sends `preWorkSummaryOutputJson` (camelCase). Same for `session_constraints` vs `sessionConstraints`. This meant **73K chars of pre-work data and session constraints were silently dropped** in full-data executions.

**Fixed in v2:** The new `1.2_PREP_Input` node checks both camelCase and snake_case keys for all three fields (`preWorkSummaryOutputJson`, `sessionConstraints`, `contentOutlineUrl`).

---

## Implementation Progress

### Steps 1+2: Parse + Filter Input — DONE

**Node:** `1.2_PREP_Input` (Code node, replaces old `1.2_VAL_Input`)
**File:** `n8n/workflows/staging/session-slides/_prep_input_node.js`
**Workflow:** Updated in `main_workflow.json` — node + all 9 downstream references updated

**What it does:**
1. Parses webhook body JSON fields (`project_details`, `input_json`)
2. Handles camelCase keys from frontend (fixes the silent-drop bug)
3. Guards `client_name` required
4. Filters `project_details` from ~28 fields → 10 session-relevant fields (4,145 → 2,924 chars)
5. Extracts pre-work metadata: competencies, development themes, slide summary
6. Builds deterministic 17-slide template with Gagné/Kolb/AGES mappings
7. Passes through identity fields, URLs, memory, sub-workflow IDs

**Tested against:**
- Execution 12678 (full data): All 12 pre-work slides preserved (72K chars), 6 competencies + 5 themes extracted
- Execution 13300 (regeneration): Gracefully handles empty pre-work/constraints

**Downstream references updated (9 nodes):**
`1.4_FMT_DriveUtils`, `2.1_FMT_ExtractMemory`, `2.5_FMT_KBSearch`, `3.1_FMT_Agent1A`, `3.3_JS_ParseAgent1A`, `3.5_JS_SplitForAgent1B`, `4.1_JS_SplitGroups`, `7.1_FMT_Agent3`, `8.1_JS_Assemble`

### Step 3: Filter Memory — DONE

**Node:** `2.1_FMT_ExtractMemory` (Code node, updated in-place)
**File:** `n8n/workflows/staging/session-slides/_fmt_extract_memory_node.js`
**Workflow:** Updated jsCode in `main_workflow.json` (no connection changes needed)

**v1 problems:**
- Haiku returned 27+ keys and 48K chars output (took 546s in exec 12678, 195s in exec 13300)
- Prompt had no output size constraint
- Downstream `3.1_FMT_Agent1A` already had defensive 6-key filtering but time was already wasted

**v2 improvements:**
1. Explicit 2K char hard output cap in system prompt
2. Concrete example output (803 chars) showing exactly what good output looks like
3. "Max 5 items per array, max 15 words each" — prevents verbosity
4. Explicit IGNORE list (admin notes, logistics, scheduling, etc.)
5. Empty memory short-circuit — sends minimal prompt when no memory available

**Token budget:**
- Input: ~21K tokens (system prompt 469 + user prompt with 84K memory ~21K)
- Output: ~500 tokens (2K char cap)
- Estimated time: ~10-15s (vs 195-546s in v1)

### Step 4: KB Search — DONE

**Nodes:** `2.5_FMT_KBSearch` (updated), `2.6_SUB_KBSearch` (unchanged), `2.7_JS_ParseKB` (unchanged)
**File:** `n8n/workflows/staging/session-slides/_fmt_kb_search_node.js`

**v1 bugs fixed:**
- `pre_work_summary` → `pre_work_metadata` (correct field from PREP_Input)
- `metadata.competencies` → `preWorkMeta.competencies` (direct access, no nested `.metadata`)
- `metadata.themes` → `preWorkMeta.development_themes`
- `projectDetails.seniority` → `seniority_of_cohort`
- `projectDetails.project_name` → `name`
- Removed `behavioral_focus_areas` (doesn't exist in v2 output)

**Impact:** v1 had 0 search terms (all field references were broken) → v2 has 11 (6 competencies + 5 development themes). KB search was effectively running blind.

**Prompt improvements:**
- Targeted search ("2-3 focused search calls") vs v1's "return everything"
- Added content_type and session_type to context
- Prompt is only 509 tokens (tiny — tool-use results dominate the token count)

**2.7_JS_ParseKB:** No changes needed — already handles multiple response formats, strips `s3_location`/`result_index`, limits to 10 results.

**Note:** Steps 3 (memory) and 4 (KB) currently run sequentially but could be parallelized since neither depends on the other's output. This is a connection-level change to be addressed separately.

### Step 5: Tag Content to Slides — DONE

**Nodes:** `2.8_FMT_TagContent` (NEW), `2.9_SUB_TagContent` (NEW), `2.10_JS_ParseTags` (NEW)
**Files:** `_fmt_tag_content_node.js`, `_js_parse_tags_node.js`
**Workflow:** 3 new nodes + 4 new connections added, `2.7_JS_ParseKB` rewired

**What it does:** Maps KB units and pre-work slides to the 17 session slides using Haiku. Each session slide gets a list of relevant KB unit IDs and pre-work slide IDs.

**Why this matters:**
- v1: 72K chars × 7 groups = 506K chars of pre-work sent to LLMs (or dropped entirely)
- v2: Each group gets only its relevant subset (4K-24K chars per group, ~74K total)

**Token budget:**
- Input: ~778 tokens (session slides + pre-work summaries + KB summaries)
- Output: ~371 tokens (17-entry mapping)
- Estimated time: ~3-5s

**Connection chain:**
```
2.7_JS_ParseKB → 2.8_FMT_TagContent → 2.9_SUB_TagContent → 2.10_JS_ParseTags → 3.1_FMT_Agent1A
                                                    └─(error)→ 9.1_ERR_Format
```

**Parse node (`2.10_JS_ParseTags`) guarantees:**
- All 17 slides have entries (fills missing with empty arrays)
- Validates array entries are non-empty strings
- Computes stats (total tags, slides with mappings)

### Step 6: Blueprint (merge Agent 1A + 1B) — DONE

**Nodes updated:** `3.1_FMT_Agent1A` (jsCode), `3.3_JS_ParseAgent1A` (jsCode), `3.4_IF_Agent1AValid` (condition + note)
**Files:** `_fmt_blueprint_node.js`, `_js_parse_blueprint_node.js`
**Connection change:** `3.4_IF_Agent1AValid` success path rewired from `3.5_JS_SplitForAgent1B` → `4.1_JS_SplitGroups`

**v1 pipeline (18 nodes, 175s serial):**
```
3.1_FMT → 3.2_SUB → 3.3_Parse → 3.4_IF → 3.5_Split → 7×(FMT+SUB) → 3.7_Merge → 3.8_Parse → 3.9_IF → 4.1_Split
```

**v2 pipeline (3 active nodes, ~23s):**
```
3.1_FMT_Blueprint → 3.2_SUB → 3.3_JS_ParseBlueprint → 3.4_IF → 4.1_JS_SplitGroups
```

**What changed:**
1. `3.1_FMT_Agent1A`: New compact prompt — merges strategic design + per-slide blueprints into single Sonnet call. Reads from `2.10_JS_ParseTags` for content tags. Compact 4-key output schema (session_overview, slide_blueprint, mandatory_jombay_frameworks, sensitivity_log). 6 fields per slide (vs 15 in v1).
2. `3.3_JS_ParseAgent1A`: Simpler parsing for compact schema. Outputs `agent1_output` (backward compat with `4.1_JS_SplitGroups`). Includes empty `gagne_map`/`kolb_map`/`slide_allocation_guidance` for downstream compat.
3. `3.4_IF_Agent1AValid`: Condition updated from `agent1a_parsed` → `blueprint_parsed`. Success rewired to skip Agent 1B entirely.

**Token budget:**
- Input: ~2,600 tokens (system prompt + client context + constraints + slide template + tags + pre-work meta + KB + memory + outline)
- Output: ~1,593 tokens (compact blueprint)
- Estimated time: ~23s (vs 175s v1 serial)

**18 Agent 1B nodes orphaned (still in JSON but unreachable):**
`3.5_JS_SplitForAgent1B`, `3.6a-g_FMT_BP_*`, `3.6a-g_SUB_BP_*`, `3.7_MRG_WaitAgent1B`, `3.8_JS_MergeAgent1B`, `3.9_IF_Agent1BValid`

### Step 7: Content Generation — DONE

**Nodes updated:** `4.1_JS_SplitGroups` (jsCode), `5a.1-5g.1_FMT_Group1-7` (×7 jsCode), `6.1_JS_Merge` (jsCode), 7 SUB node notes
**Files:** `_js_split_groups_node.js`, `_fmt_group_template.js`, `_js_merge_node.js`
**No connection changes** — same 7-parallel-merge topology

**v1 problems:**
- ALL 73K chars of pre-work sent to ALL 7 groups (506K chars total) — timeout risk
- ALL KB results broadcast to every group (redundant)
- System prompt included facilitator scripts (huge output per group)
- Field references broken: `pre_work_summary`, `seniority`, `geography`, `group_size`
- `gagne_map`/`kolb_map` from Agent 1 in common context (now deterministic)

**v2 changes:**

1. `4.1_JS_SplitGroups`:
   - Uses content tags from `2.10_JS_ParseTags` for targeted distribution
   - Each group gets ONLY its tagged pre-work slides (full content) + tagged KB units
   - Includes `slide_template` (Gagné/Kolb/AGES — deterministic) per group
   - Rewrote system prompt: content-only (no facilitator scripts)
   - Compact output schema: slide_title, headline, subtext, bullets, visual_guidance, activity, provenance, reviewer_flags
   - Fixed field references: `seniority_of_cohort`, `pre_work_slides`, `content_type`, `program_type`

2. `5a.1-5g.1_FMT_Group1-7` (all 7 identical pattern):
   - User prompt uses `group.tagged_pre_work` (targeted) instead of `data.pre_work_summary` (broadcast)
   - Uses `group.tagged_kb` (targeted) instead of `data.kb_results` (broadcast)
   - Uses `group.slide_template` for Gagné/Kolb/AGES reference
   - Content-only instructions (no facilitator scripts)
   - Removed `data.common_context` with empty gagne/kolb maps

3. `6.1_JS_Merge`:
   - Content-only merge (no facilitator_scripts output)
   - Ensures all 17 slides have entries (fills missing with MISSING flag)
   - Outputs `status: 'content_merged'` or `'content_partial'`
   - Handles 3 LLM output formats (slide_N keys, slides array, legacy slide_specs)

**Distribution impact:**
```
v1: 73K × 7 = 506K chars pre-work broadcast
v2: Targeted distribution = 74K chars total (85% reduction)
```

**Per-group token budget (heaviest = group_4 Core Content):**
- Input: ~7.4K tokens | Output: ~600 tokens | Est. time: ~12s
- v1 max: 230s → v2 max: ~12s

### Step 8: QC Content Review — DONE

**Nodes updated:** `7.1_FMT_Agent3` (jsCode), `7.2_SUB_Agent3` (note)
**File:** `_fmt_agent3_node.js`
**No connection changes**

**v1 problems (Agent 3 — the 300s timeout):**
- Input was ~69K tokens: slide_spec (20K) + facilitator_scripts (31K) + full pre-work (18K)
- Referenced orphaned node `3.8_JS_MergeAgent1B` (would crash at runtime)
- Reviewed facilitator scripts that aren't generated yet in v2
- Field reference: `pre_work_summary` (doesn't exist in v2)

**v2 changes:**
1. Content-only review — no facilitator scripts (moved to step 9)
2. References `3.3_JS_ParseAgent1A` (not orphaned `3.8`)
3. Compact inputs: slide_spec + slide_template + blueprint ref + session overview + client context + pre-work meta
4. Simplified review criteria: structural, instructional, content, compliance, provenance (no facilitator usability)
5. Compact output schema: review_summary, slide_reviews, checklist_compliance, attention_items

**Token budget:**
- Input: ~4.6K tokens (vs v1's ~69K — 93% reduction)
- Output: ~350 tokens
- Estimated time: ~7s (vs v1's 300s TIMEOUT)

**Note:** `8.1_JS_Assemble` also references orphaned `3.8_JS_MergeAgent1B` — to be fixed in step 10. QC output schema slightly changed (simplified) — assembly node needs updating.

### Step 9: Generate Scripts + Extras — DONE

**Nodes created (17 NEW):**
- `7.3_JS_PrepScripts` — splits finalized content + QC flags + blueprint into 7 groups
- `7.4a-g.1_FMT_Scr1-7` (×7) — format script prompts per group
- `7.4a-g.2_SUB_Scr1-7` (×7) — LLM calls (Sonnet)
- `7.5_MRG_WaitScripts` — merge wait for 7 inputs
- `7.6_JS_MergeScripts` — merge all 7 script outputs

**Files:** `_js_prep_scripts_node.js`, `_fmt_script_template.js`, `_js_merge_scripts_node.js`

**Connection changes:**
- `7.2_SUB_Agent3` success rewired from `8.1_JS_Assemble` → `7.3_JS_PrepScripts`
- `7.6_JS_MergeScripts` → `8.1_JS_Assemble`
- `8.1_JS_Assemble` and `8.2_API_Success` repositioned rightward

**Why this step exists (v2 only):**
In v1, facilitator scripts were generated WITH content in Agent 2 (step 7). This:
- Doubled output size per group (content + scripts)
- Made Agent 2 prompts massive (contributed to 230s per group)
- Scripts were written without QC feedback

In v2, scripts are generated AFTER content + QC:
- Content is finalized and QC-reviewed before scripts are written
- Scripts can address QC flags directly
- Each call is focused: write scripts for finalized content (not generate from scratch)

**Per-group data (targeted, same as step 7):**
- Finalized slide content (from 6.1_JS_Merge)
- Blueprint direction (from 3.3_JS_ParseAgent1A)
- QC flags (from 7.2_SUB_Agent3)
- Slide template with Gagné/Kolb/AGES (from 1.2_PREP_Input)
- Tagged pre-work slides (from 2.10_JS_ParseTags content tags)

**Output per slide:** facilitator_script, visual_guidance, energy_note, modality_notes, debrief_questions, activity_run_of_show

**Token budget (heaviest = group_4 Core Content):**
- Input: ~7.3K tokens | Output: ~1.2K tokens | Est. time: ~20s
- All 7 groups run in parallel → wall clock ~20s

**Total node count:** 58 → 75

### Step 10: Assemble + PUT — DONE

**Node updated:** `8.1_JS_Assemble` (jsCode + notes)
**File:** `_js_assemble_node.js`
**No connection changes** — `8.2_API_Success` payload unchanged

**v1 bugs fixed:**
1. `$('3.8_JS_MergeAgent1B')` — orphaned node crash → now `$('3.3_JS_ParseAgent1A')`
2. `$input` expected Agent 3 → now expects `7.6_JS_MergeScripts` (facilitator scripts)
3. QC data via `$('7.2_SUB_Agent3')` instead of `$input`
4. `merged.facilitator_script` from v1 merge → now from step 9 script merge
5. `gagne_map`/`kolb_map` from LLM → now built from deterministic `slide_template`
6. `project_details.project_name` → `project_details.name`
7. `session_constraints.session_type` → handles both camelCase and snake_case
8. QC schema: `checklist_compliance_report` → `checklist_compliance`, `reviewer_attention_log` → `attention_items`

**Data sources:**
- Slide content: `$('6.1_JS_Merge')` (step 7)
- Facilitator scripts: `$input` = `7.6_JS_MergeScripts` (step 9)
- Blueprint/session overview: `$('3.3_JS_ParseAgent1A')` (step 6)
- QC review: `$('7.2_SUB_Agent3')` (step 8)
- Slide template/Gagné/Kolb: `$('1.2_PREP_Input')` (step 1+2)

**Final output structure:**
```json
{
  "metadata": { "project_name", "client_name", "session_type", "total_duration", "total_slides", "generated_date", "overall_confidence", "n8n_*" },
  "session_overview": { "workshop_title", "key_themes", "learning_objectives", "audience_summary", "session_arc_narrative", "gagne_map", "kolb_map" },
  "slide_spec": { "slide_1": { ... }, ... "slide_17": { ... } },
  "facilitator_script": { "slide_1": { ... }, ... "slide_17": { ... } },
  "mandatory_jombay_frameworks": [...],
  "sensitivity_log": [...],
  "checklist_compliance": { "gagne_coverage", "kolb_coverage", "provenance_coverage" },
  "attention_items": [...],
  "provenance_log": [...]
}
```

---

## Open Items

1. **Output schema alignment with frontend** — ensure compact schemas match what the Nexus UI expects
2. ~~Pre-work to session slide mapping logic~~ — RESOLVED: Uses Haiku LLM (step 5) with mapping guidance in prompt. Template references alone aren't sufficient — content-based tagging is needed.
3. **Timeout configuration** — confirm where the 300s limit lives (AgentCoreAPI vs. n8n vs. Bedrock); consider increasing as safety net
4. **Regeneration flow** — how should the pipeline handle `input_json.regenerationInstructions` (minimal input, user wants to re-run with tweaks)?
5. **documents_urls handling** — currently `content_outline_url` in input_json is empty but `documents_urls` at webhook level has a Google Doc URL. Need to align which field DriveUtils uses.
