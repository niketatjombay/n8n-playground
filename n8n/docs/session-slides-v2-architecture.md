# Session Slides — Architecture Document

**Status:** v3 DEPLOYED on staging — validated with executions 18023, 18496 (87/87 nodes, ~27 min)
**Date:** 2026-02-21 (v2) | 2026-02-27 (v3 deployed)
**Based on:** v1 failure analysis (execs 12678, 13300) + v2 full rewrite + v3 outline alignment

---

## Executive Summary

Session Slides is a 87-node n8n workflow that generates presentation slide decks from pre-work assessment data, project memory, and content outlines. It uses 30 LLM sub-workflow calls (20 Sonnet, 10 Haiku) across a 10-stage pipeline with 4 fan-out/fan-in parallelization points.

**Key design principles:**
1. Don't use LLMs for what code can do — Gagne/Kolb/AGES mappings are deterministic
2. Right-size every call — max ~30K input tokens per call, all under 200s
3. Right model for the task — Haiku for extraction/classification/normalization, Sonnet for creative generation
4. Minimal context per call — content tags distribute 73K chars of pre-work across groups
5. Separate content from scripts — content generated first, QC'd, then scripts written against finalized content
6. Normalizer triplets — FMT→SUB(Haiku)→JS fallback pattern ensures schema compliance without hard failures

---

## Pipeline Overview

```
Stage 1:  Webhook → PREP_Input → IF_Valid
Stage 2a: FMT_DriveUtils → SUB_DriveUtils → FMT_Outline → SUB_Outline
Stage 2b: FMT_AlignOutline → SUB_AlignOutline → JS_AlignOutline (v3)
Stage 3:  FMT_ExtractMemory → SUB_ExtractMemory (parallel with 2b)
Stage 4:  3× FMT_KBSearch → SUB_KBSearch → MRG_KB → JS_MergeKB → JS_ParseKB
Stage 5:  FMT_TagContent → SUB_TagContent → JS_ParseTags
Stage 6:  FMT_Blueprint → SUB_Blueprint → JS_Parse → FMT_NormBP → SUB_NormBP → JS_NormBP → IF_Valid
Stage 7:  JS_SplitGroups → 7× (FMT_Group → SUB_Group) → MRG_WaitAll → JS_Merge → FMT_NormContent → SUB_NormContent → JS_NormContent → JS_CoverageCheck
Stage 8:  3× (FMT_QC → SUB_QC) → MRG_QC → JS_MergeQC → FMT_NormQC → SUB_NormQC → JS_NormQC
Stage 9:  JS_PrepScripts → 7× (FMT_Scr → SUB_Scr) → MRG_WaitScripts → JS_MergeScripts
Stage 10: JS_Assemble → FMT_GammaScript → SUB_GammaScript → JS_GammaScript → API_Success
Error:    ERR_Format → ERR_API (HTTP PUT error)
```

### Node Count

| Type | Count | Purpose |
|------|-------|---------|
| `n8n-nodes-base.code` | 48 | JS processing (FMT prompt builders + JS parsers/mergers) |
| `n8n-nodes-base.executeWorkflow` | 30 | LLM sub-workflow calls |
| `n8n-nodes-base.merge` | 4 | Fan-in wait-for-all points |
| `n8n-nodes-base.if` | 2 | Conditional routing |
| `n8n-nodes-base.httpRequest` | 2 | Success + Error API callbacks |
| `n8n-nodes-base.webhook` | 1 | Entry point |
| **Total** | **87** | |

**Two sub-workflows:**
- `8N4Pzq6oTI5ligt4r8ZJ4` — DriveUtils (Google Drive text extraction)
- `GDaWNcJJtLdY8Q6Y4Yv5p` — AgentCore (all LLM calls: Haiku, Sonnet, KB search with tool use)

---

## Stage-by-Stage Architecture

### Stage 1 — Input Parsing and Validation

**Nodes:** `1.1_TRG_Webhook` → `1.2_PREP_Input` → `1.3_IF_Valid`
**File:** `_prep_input_node.js`

`1.2_PREP_Input` does 7 things:
1. Parses `project_details` and `input_json` (both arrive as JSON strings)
2. Handles camelCase/snake_case variants (`preWorkSummaryOutputJson`, `sessionConstraints`, `contentOutlineUrl`)
3. Guards on `client_name` required
4. Filters `project_details` from ~28 fields → 10 session-relevant fields
5. Extracts pre-work metadata: competencies (from `slide_1_1.bullets.key_themes`) and development themes (from `slide_3_3` bullet keys)
6. Builds deterministic 17-slide template with hardcoded Gagne/Kolb/AGES assignments
7. Generates `run_id` (execution ID) and `input_hash` (djb2 hash for dedup)

`1.3_IF_Valid` routes: `status === 'validated'` → forward, else → `9.1_ERR_Format`

### Stage 2a — Drive/Outline Extraction

**Nodes:** `1.4_FMT_DriveUtils` → `1.5_SUB_DriveUtils` → `2.0_FMT_Outline` → `2.0_SUB_Outline`
**Files:** `_fmt_driveutils_node.js`, `_fmt_outline_node.js`

- `1.4_FMT_DriveUtils`: Passes `content_outline_url` (fallback to `documents_urls`) to DriveUtils sub-workflow
- `2.0_FMT_Outline`: If extracted text >= 50 chars, sends to **Haiku** to structure into `{ modules, themes, objectives, total_duration, delivery_format, key_frameworks }`. Short-circuits to empty structure if text is too short.

### Stage 2b — Outline Alignment (v3)

**Nodes:** `2.0b_FMT_AlignOutline` → `2.0c_SUB_AlignOutline` → `2.0d_JS_AlignOutline`
**Files:** `_fmt_alignoutline_node.js`, `_js_alignoutline_node.js`

The v3 key addition. The 17 slide types are treated as **sections** that can expand based on content density. The LLM acts as a presentation designer deciding how many slides each section needs.

`_fmt_alignoutline_node.js` sends to **Sonnet** with:
- The 17-section framework with expansion rules (e.g., Content/AC can be 1-N slides)
- Structured outline from Stage 2a
- Seniority and session type awareness
- Chronological order preservation instructions

Output includes:
- `section_expansion`: how many slides each section gets (e.g., `section_9: 5` means 5 content slides)
- `slide_plan`: ordered array with per-slide outline evidence, topic, duration
- `delivery_sequence`: ordered list of `slide_N` IDs in presentation order
- `total_slides`: dynamic total (can exceed 17)
- `outline_alignment`: per-slide `{ has_outline_evidence, outline_excerpt, alignment_rationale }`

`_js_alignoutline_node.js` parses this and builds the dynamic `slide_template` with Gagne/Kolb/AGES from the vocabulary map. Handles both array and object LLM output formats for `slide_plan`.

**Bug fixes deployed (commit `1aa593d`):**
- Strips `token_usage`/`usage` keys before content check to prevent metadata-only responses being treated as valid outlines
- Converts object-format `slide_plan` to array (LLM sometimes returns `{ slide_9_1: {...}, slide_9_2: {...} }` instead of `[{...}, {...}]`)

### Stage 3 — Memory Extraction

**Nodes:** `2.1_FMT_ExtractMemory` → `2.2_SUB_ExtractMemory`
**File:** `_fmt_extractmemory_node.js` / `_fmt_extract_memory_node.js`

Runs in parallel with Stage 2b (both trigger from `2.0_SUB_Outline`).

Sends 84K-char `current_project_memory` to **Sonnet** with:
- Strict 6-key schema: `previous_sessions`, `established_frameworks`, `facilitator_preferences`, `client_delivery_notes`, `participant_pain_points`, `real_world_situations`
- Hard 2,000-char output cap
- Concrete example output (803 chars)
- Short-circuits to empty arrays if memory < 50 chars

**Note:** Model is `claude-sonnet-4-6` (not Haiku as originally designed in v2 — upgraded for extraction quality).

### Stage 4 — KB Search (3 parallel)

**Fan-out from `2.0d_JS_AlignOutline`:** `2.5_FMT_KBSearch`, `2.5b_FMT_KBSearch2`, `2.5c_FMT_KBSearch3`
**Files:** `_fmt_kbsearch_node.js`, `_fmt_kbsearch2_node.js`, `_fmt_kbsearch3_node.js`
**Fan-in:** `2.7a_MRG_KB` → `2.7b_JS_MergeKB` → `2.7_JS_ParseKB`
**Files:** `_js_mergekb_node.js`, `_js_parsekb_node.js`

Each search covers a different third of the dynamic slide set:
- KBSearch 1: slides 1 to `ceil(total/3)` — intro/setup
- KBSearch 2: slides `ceil(total/3)+1` to `ceil(total*2/3)` — middle/core
- KBSearch 3: slides `ceil(total*2/3)+1` to `total` — closing/engagement

Each FMT node builds outline-excerpt-based search queries (from `outlineAlignment`) rather than generic competency terms. Model: **Haiku with tool use** (KB search tool). Requests 5 content units per search.

`_js_mergekb_node.js` deduplicates by `content_unit_id`, prefers Google Drive URLs over S3, infers `content_type` from title keywords, caps at 15 total results.

### Stage 5 — Content Tagging

**Nodes:** `2.8_FMT_TagContent` → `2.9_SUB_TagContent` → `2.10_JS_ParseTags`
**Files:** `_fmt_tag_content_node.js`, `_js_parse_tags_node.js`

**The key input optimization.** Maps KB units and pre-work slides to session slides using **Haiku**. Without this, 73K chars of pre-work would be sent to ALL 7 content groups (506K chars total) or dropped entirely.

Input: compact summaries of dynamic slides (with types/topics from AlignOutline), pre-work slides (id + title + 300-char summary), KB units (id + title + type), content outline.

Output: `{ slide_N: { kb_units: ["CU_123"], pre_work_slides: ["slide_2_1"] } }`

`_js_parse_tags_node.js` validates all dynamic slides have entries, fills missing with empty arrays, computes stats.

**Distribution impact:**
- v1: 73K x 7 = 506K chars pre-work broadcast → timeout
- v3: Targeted distribution = ~74K chars total (85% reduction)

### Stage 6 — Blueprint Generation

**Nodes:** `3.1_FMT_Agent1A` → `3.2_SUB_Agent1A` → `3.3_JS_ParseAgent1A` → `3.4_FMT_NormBP` → `3.5_SUB_NormBP` → `3.6_JS_NormBP` → `3.7_IF_Agent1AValid`
**Files:** `_fmt_blueprint_node.js`, `_js_parse_blueprint_node.js`, `_fmt_normbp_node.js`, `_js_normbp_node.js`

Single **Sonnet** call (v2 merged Agent 1A+1B into one). Inputs:
- Filtered client context, session constraints, slide template with Gagne/Kolb/AGES
- Content tags (from Stage 5), pre-work metadata, KB summaries
- Filtered memory (from Stage 3), content outline (from Stage 2a)

Output: 4 keys — `session_overview`, `slide_blueprint` (per-slide strategic direction), `mandatory_jombay_frameworks`, `sensitivity_log`

Per-slide blueprint entry: `intent`, `content_direction`, `key_message`, `experience_anchors`, `kb_units_to_use`, `facilitation_design` (tension_level, rationale, signal), `flags`

**Normalizer triplet:** `JS_ParseAgent1A` → `FMT_NormBP` → `SUB_NormBP` (Haiku) → `JS_NormBP` enforces exact schema with fallback to raw parse data if Haiku fails. Dynamic threshold: 60% of total slides.

**v1 → v2 impact:** 18 nodes (175s serial) → 7 nodes (~23s). 18 orphaned Agent 1B nodes remain in JSON but are unreachable.

### Stage 7 — Content Generation (7 parallel)

**Nodes:** `4.1_JS_SplitGroups` → 7x (`FMT_Group` → `SUB_Group`) → `5h_MRG_WaitAll` → `6.1_JS_Merge` → `6.2_FMT_NormContent` → `6.3_SUB_NormContent` → `6.4_JS_NormContent` → `6.5_JS_CoverageCheck`
**Files:** `_js_split_groups_node.js`, `_fmt_group_template.js`, `_js_merge_node.js`, `_fmt_normcontent_node.js`, `_js_normcontent_node.js`, `_js_coverage_check_node.js`

**Group definitions (static slide assignments; dynamic slides assigned by group key):**

| Group | Name | Default Slides | Types |
|-------|------|---------------|-------|
| 1 | Title & Introduction | 1-3 | Session title, Jombay intro, Trainer intro |
| 2 | Setup & Framing | 4-5 | Agenda, Working Agreement |
| 3 | Context & Objectives | 6-7 | Program overview, Objectives |
| 4 | Core Content | 8-10 | Module breaker, Content (AC), Quote |
| 5 | Engagement & Application | 11-12 | Discussion/Reflection (RO), Activity (CE) |
| 6 | Transition & Reflection | 13-15 | Break, Questions, Feedback |
| 7 | Action & Closing | 16-17 | Call to Action (AE), Closing |

`4.1_JS_SplitGroups` builds 7 group payloads using content tags for targeted distribution. Each group gets ONLY its tagged KB units and pre-work slides (O(1) lookup via `kbMap`). Also builds `per_slide_kb` for explicit per-slide injection in prompts. Emits `agent2_system_prompt` (content-only, no facilitator scripts).

Each FMT_Group node builds user prompt with: slide template, blueprint, session overview, client context, session constraints, content outline, tagged pre-work, per-slide KB content. All 7 call **Sonnet** in parallel.

`6.1_JS_Merge` merges raw outputs — handles format A (slide_N keys), format B (slides array), and legacy (slide_specs).

**Normalizer triplet:** `FMT_NormContent` → `SUB_NormContent` (Haiku) → `JS_NormContent` enforces canonical per-slide schema. Falls back to merging raw data if Haiku returns fewer slides.

`6.5_JS_CoverageCheck` — **Pure JS, no LLM.** Cross-checks every outline-evidence slide in `slide_plan` against generated slides. Produces `coverage_report` with: `coverage_percentage`, `covered_items`, `missing_items`, `extra_slides`. Feeds into QC Quality as explicit missing-item signals.

### Stage 8 — QC Review (3 parallel)

**Fan-out from `6.5_JS_CoverageCheck`:** 3 parallel **Sonnet** calls
**Files:** `_fmt_qc_structure_node.js`, `_fmt_qc_instruct_node.js`, `_fmt_qc_quality_node.js`, `_js_mergeqc_node.js`, `_fmt_normqc_node.js`, `_js_normqc_node.js`

| QC Node | Scope | Key Checks |
|---------|-------|------------|
| `7.1a_QC_Structure` | Structural completeness | Required fields, bullet count/length, activity completeness, provenance tags |
| `7.1b_QC_Instruct` | Instructional alignment | Gagne events, Kolb stages, AGES applied, Bloom levels appropriate for seniority, all 9 Gagne events represented |
| `7.1c_QC_Quality` | Content quality | Client-specificity, headline punch, pre-work grounding, KB usage, compliance (no outcome guarantees, sensitivity), outline coverage (missing items from CoverageCheck as Critical flags), session type compliance |

**Fan-in:** `7.1d_MRG_QC` → `7.1e_JS_MergeQC` → Normalizer triplet (`FMT_NormQC` → `SUB_NormQC` Haiku → `JS_NormQC`)

Output: `review_summary`, `slide_reviews`, `checklist_compliance`, `attention_items`

### Stage 9 — Script Generation (7 parallel)

**Nodes:** `7.3_JS_PrepScripts` → 7x (`FMT_Scr` → `SUB_Scr`) → `7.5_MRG_WaitScripts` → `7.6_JS_MergeScripts`
**Files:** `_js_prep_scripts_node.js`, `_fmt_script_template.js`, `_js_merge_scripts_node.js`

`7.3_JS_PrepScripts` reads normalized content, blueprint, content tags, QC flags (indexed by slide), and pre-work slides. Uses dynamic group definitions from `4.1_JS_SplitGroups`. Generates `scriptSystemPrompt` with role, rules, output schema, and modality adaptations.

Each group calls **Sonnet** with: finalized content, blueprint, slide template, QC flags, tagged pre-work.

`7.6_JS_MergeScripts` merges AND normalizes in one pass. Handles object-type `facilitator_script` via `flattenScript()`. Ensures all canonical fields and all slots have entries.

**Bug fix deployed (commit `a5438b4`):**
- Fixed wrong upstream node references: `$('3.3_JS_ParseAgent1A')` → `$('3.6_JS_NormBP')` for blueprint, `$('6.1_JS_Merge')` → `$('6.4_JS_NormContent')` for content

### Stage 10 — Assembly and Output

**Nodes:** `8.1_JS_Assemble` → `8.2a_FMT_GammaScript` → `8.2_SUB_GammaScript` → `8.2_JS_GammaScript` → `8.2_API_Success`
**Files:** `_js_assemble_node.js`, `_fmt_gammascript_node.js`, `_js_gamma_script_node.js`

`8.1_JS_Assemble` aggregates from 8 upstream nodes:
- `7.6_JS_MergeScripts` (facilitator scripts)
- `6.4_JS_NormContent` (slide content)
- `3.6_JS_NormBP` (blueprint/session overview)
- `1.2_PREP_Input` (validated input, slide template)
- `7.1h_JS_NormQC` (QC review)
- `2.7_JS_ParseKB` (KB results)
- `2.10_JS_ParseTags` (content tags)
- `2.0d_JS_AlignOutline` (outline alignment, delivery_sequence)

Each slide is restructured into a **4-tab format:**
- `content`: headline, subtext, bullets, visual_guidance
- `facilitator`: facilitator_script, facilitator_notes, debrief_questions, talking_points
- `framework`: gagne, kolb, ages, provenance, provenance_source, reviewer_flags
- `gamma_details`: visual_guidance, visual_direction, layout fields

Slides ordered by `delivery_sequence`. `knowledge_bank` includes all KB results with `slide_mapping`.

**Gamma Script:** `FMT_GammaScript` → `SUB_GammaScript` (Haiku) → `JS_GammaScript` generates 15-25K char Gamma-ready markdown. Layout mapping (Content→"Two Column", Activity→"List", Quote→"Quote"). JS fallback generates basic markdown if Haiku fails.

`8.2_API_Success`: HTTP PUT to CoreAPI with `final_output` package.

### Error Path

**`9.1_ERR_Format` → `9.2_ERR_API`**
**File:** `_err_format_node.js`

Filters for real structured errors (has `error_message`, `error_type`, or `status === 'error'`). Ignores `continueErrorOutput` passthroughs that are LLM truncation noise. Returns minimal error payload including `workflow_session_id`.

Error outputs wire from most SUB nodes. Exception: Normalizer SUB nodes (`3.5`, `6.3`, `7.1g`) wire both outputs to their JS extractor for fallback handling.

---

## LLM Calls Summary

**Total: 30 sub-workflow calls (20 Sonnet, 10 Haiku)**

| # | Stage | Model | Node | Purpose |
|---|-------|-------|------|---------|
| 1 | 2a | Haiku | `2.0_SUB_Outline` | Structure raw Drive doc text into JSON |
| 2 | 2b | **Sonnet** | `2.0c_SUB_AlignOutline` | Map outline to dynamic slide plan with section expansion |
| 3 | 3 | **Sonnet** | `2.2_SUB_ExtractMemory` | Filter 84K project memory to 6-key, 2K-char extraction |
| 4-6 | 4 | Haiku+tools | `2.6_SUB_KBSearch` x3 | KB search for 3 slide ranges using outline excerpts |
| 7 | 5 | Haiku | `2.9_SUB_TagContent` | Map KB/pre-work to session slides |
| 8 | 6 | **Sonnet** | `3.2_SUB_Agent1A` | Unified blueprint: session narrative + per-slide direction |
| 9 | 6 | Haiku | `3.5_SUB_NormBP` | Schema normalization of blueprint |
| 10-16 | 7 | **Sonnet** | `5a-5g.2_SUB_Group1-7` | Content generation for 7 slide groups (parallel) |
| 17 | 7 | Haiku | `6.3_SUB_NormContent` | Schema normalization of merged content |
| 18-20 | 8 | **Sonnet** | `7.1a/b/c_SUB_QC` x3 | Structure/Instructional/Quality review (parallel) |
| 21 | 8 | Haiku | `7.1g_SUB_NormQC` | Schema normalization of merged QC |
| 22-28 | 9 | **Sonnet** | `7.4a-7.4g.2_SUB_Scr1-7` | Script generation for 7 groups (parallel) |
| 29 | 10 | Haiku | `8.2_SUB_GammaScript` | Generate Gamma-ready markdown |

---

## Parallelization Map

```
                                    ┌─ KBSearch 1 ─┐
2.0d_JS_AlignOutline ──────────────├─ KBSearch 2 ─┤─ MRG_KB
                                    └─ KBSearch 3 ─┘

2.0_SUB_Outline ── 2.1_FMT_ExtractMemory ── 2.2_SUB_ExtractMemory
                                                    (parallel with 2b+4)

                    ┌─ FMT_Group1 → SUB_Group1 ─┐
                    ├─ FMT_Group2 → SUB_Group2 ─┤
                    ├─ FMT_Group3 → SUB_Group3 ─┤
4.1_JS_SplitGroups ─├─ FMT_Group4 → SUB_Group4 ─┤─ MRG_WaitAll
                    ├─ FMT_Group5 → SUB_Group5 ─┤
                    ├─ FMT_Group6 → SUB_Group6 ─┤
                    └─ FMT_Group7 → SUB_Group7 ─┘

                        ┌─ FMT_QC_Structure → SUB_QC_Structure ─┐
6.5_JS_CoverageCheck ──├─ FMT_QC_Instruct → SUB_QC_Instruct ──┤─ MRG_QC
                        └─ FMT_QC_Quality → SUB_QC_Quality ────┘

                    ┌─ FMT_Scr1 → SUB_Scr1 ─┐
                    ├─ FMT_Scr2 → SUB_Scr2 ─┤
                    ├─ FMT_Scr3 → SUB_Scr3 ─┤
7.3_JS_PrepScripts ─├─ FMT_Scr4 → SUB_Scr4 ─┤─ MRG_WaitScripts
                    ├─ FMT_Scr5 → SUB_Scr5 ─┤
                    ├─ FMT_Scr6 → SUB_Scr6 ─┤
                    └─ FMT_Scr7 → SUB_Scr7 ─┘
```

---

## Data Flow: Three-Object State

The pipeline maintains three conceptual state objects:

1. **Input Context** (immutable after Stage 1): `project_details`, `pre_work_slides`, `session_constraints`, `slide_template`, `content_outline`
2. **Enriched Context** (built in Stages 2-5): `outline_alignment`, `delivery_sequence`, `section_expansion`, `filtered_memory`, `kb_results`, `content_tags`
3. **Generated Content** (accumulated in Stages 6-10): `blueprint`, `slide_content`, `coverage_report`, `qc_review`, `facilitator_scripts`, `gamma_script`

Each downstream FMT node reads specific upstream outputs via `$('NodeName')` — no global data bus.

---

## Normalizer Triplet Pattern

Appears 4 times:

| Location | FMT | SUB (Haiku) | JS Extractor |
|----------|-----|-------------|--------------|
| Blueprint | `3.4_FMT_NormBP` | `3.5_SUB_NormBP` | `3.6_JS_NormBP` |
| Content | `6.2_FMT_NormContent` | `6.3_SUB_NormContent` | `6.4_JS_NormContent` |
| QC | `7.1f_FMT_NormQC` | `7.1g_SUB_NormQC` | `7.1h_JS_NormQC` |
| Gamma | `8.2a_FMT_GammaScript` | `8.2_SUB_GammaScript` | `8.2_JS_GammaScript` |

**How it works:**
1. FMT builds prompt with TARGET SCHEMA and COMMON REMAPPING PATTERNS
2. SUB sends to Haiku (cheaper/faster than Sonnet for schema enforcement)
3. JS extracts result. Both success and error outputs wire to JS. On failure, JS falls back to raw data from the upstream collector — pipeline never hard-fails on a normalization step.

---

## Input Structure

Webhook payload fields:

| Field | Size | Tokens | Description |
|-------|------|--------|-------------|
| `project_details` | 4,211 chars | ~1K | 25 fields → filtered to 10 session-relevant |
| `current_project_memory` | 83,817 chars | ~21K | Unstructured markdown — full project history |
| `input_json.preWorkSummaryOutputJson` | 73,537 chars | ~18K | 12 pre-work slides — PRIMARY content source |
| `input_json.sessionConstraints` | 85 chars | ~21 | totalDuration, sessionType, additionalInstructions |
| `documents_urls` | 96 chars | — | Google Doc URL (content outline) |
| **Total** | **~162K chars** | **~40K tokens** | |

### Pre-work Slides (12 slides, 3 sections)

| Section | Slides | Size | Content |
|---------|--------|------|---------|
| 1. Project Context | 3 slides (1_1, 1_2, 1_3) | ~12K chars | Overview, Company Profile, Participant Profile |
| 2. Diagnostic Findings | 5 slides (2_1 to 2_5) | ~29K chars | Challenges, Current vs Desired, Verbatim, Jargon, Out of Scope |
| 3. Insights & Themes | 4 slides (3_1 to 3_4) | ~32K chars | Insights, Behavioral Themes, Development Themes, Additional |

---

## Output Structure

```json
{
  "final_output": {
    "metadata": {
      "project_name", "client_name", "session_type", "total_duration",
      "total_slides", "generated_date", "overall_confidence",
      "coverage_report": { "coverage_percentage", "covered_count", "missing_count" },
      "run_id", "input_hash", "n8n_workflow_execution_id", "n8n_workflow_execution_url"
    },
    "session_overview": {
      "workshop_title", "key_themes", "learning_objectives",
      "audience_summary", "session_arc_narrative",
      "application_moments", "gagne_map", "kolb_map"
    },
    "slides": {
      "slide_N": {
        "content": { "slide_title", "headline", "subtext", "bullets", "key_message", "activity", "provenance_rationale", "facilitation_tips", "modality_notes", "sources" },
        "facilitator": { "facilitator_script", "visual_guidance", "energy_note", "modality_notes", "debrief_questions", "activity_run_of_show", "estimated_duration_minutes", "optional_paths" },
        "framework": { "gagne", "kolb", "ages", "provenance", "provenance_source", "reviewer_flags" },
        "gamma_details": { "visual_guidance", "layout_recommendation" }
      }
    },
    "mandatory_jombay_frameworks": [...],
    "checklist_compliance": { "gagne_coverage", "kolb_coverage", "ages_coverage", "provenance_coverage", "bloom_compliance" },
    "knowledge_bank": { "kb_results", "kb_result_count", "slide_mapping", "stats" },
    "gamma_script": "# Workshop Title\n## Slide 1: ...\n..."
  },
  "workflow_session_id": "<ID>"
}
```

---

## Performance Comparison

| Metric | v1 (exec 12678) | v1 (exec 13300) | v3 (exec 18023/18496) |
|--------|-----------------|-----------------|----------------------|
| Result | FAILED at Agent 1 | FAILED at QA (300s timeout) | SUCCESS (87/87 nodes) |
| Total time | — | ~16 min (died) | ~27 min |
| Memory extraction | 546s | 195s | ~15s |
| Blueprint | 605s (died) | 109s + 66s | ~23s |
| Content gen (max) | — | 230s | ~90s |
| QA/QC | — | 300s (died) | ~50s (3 parallel) |
| Scripts | — | included in content | ~60s (7 parallel) |
| Node count | ~50 | ~50 | 87 |
| LLM calls | ~8 | ~8 | 30 |

---

## v3 Changes from v2

Three consultant-reported issues drove v3:
1. **Outline sequence not followed** — slides don't match client-approved outline order
2. **Activities missed** — activities from outline absent in output
3. **Target audience ignored** — content appropriate for junior audiences even for senior sessions

### Root Causes Found
- `outline_alignment` was computed and distributed but **dropped** in `_fmt_group_template.js` — never injected into content generation prompt
- No chronological order instruction in AlignOutline
- No programmatic validation that all outline activities made it into slides
- `seniority_of_cohort` flowed through pipeline but Agent 2 had zero adaptation instructions
- `sessionType`, `totalDuration`, `additionalInstructions` not propagated to all stages

### v3 Changes Implemented

1. **Outline → Section Mapping** (`_fmt_alignoutline_node.js` rewrite): Sections can expand (e.g., Content/AC → 5 slides). LLM preserves chronological order. Seniority and session type awareness added.

2. **Dynamic Group Packing** (`_js_split_groups_node.js` rewrite): Groups slides by outline module boundaries. Dynamic slides assigned by group key logic.

3. **Outline + KB Injection** (`_fmt_group_template.js` update): Injects `outline_alignment` per slide and per-slide KB content into content generation prompt. Each slide gets explicit instruction to deliver its `outline_excerpt`.

4. **Expanded Tagging** (`_fmt_tag_content_node.js` update): Maps KB and pre-work to specific expanded slide IDs (e.g., `slide_9_1`, `slide_9_2`).

5. **Session Constraints Propagation**: `totalDuration`, `sessionType`, `additionalInstructions` flow to ALL prompt stages.

6. **Coverage Validation** (`_js_coverage_check_node.js`): NEW pure JS node. Cross-checks outline plan vs generated slides. Feeds coverage report to QC quality node.

7. **3-way QC split**: Single QC call → 3 parallel calls (Structure, Instructional, Quality) with normalizer triplet.

8. **3-way KB search split**: Single KB search → 3 parallel searches covering different slide ranges with outline-excerpt-based queries.

---

## File Inventory

### Extracted JS Files (`n8n/workflows/staging/session-slides/`)

| File | Node | Purpose |
|------|------|---------|
| `_prep_input_node.js` | `1.2_PREP_Input` | Parse, validate, filter, build slide template |
| `_fmt_driveutils_node.js` | `1.4_FMT_DriveUtils` | Pass URL to DriveUtils sub-workflow |
| `_fmt_outline_node.js` | `2.0_FMT_Outline` | Haiku prompt for doc structuring |
| `_fmt_alignoutline_node.js` | `2.0b_FMT_AlignOutline` | Sonnet prompt for slide planning (v3) |
| `_js_alignoutline_node.js` | `2.0d_JS_AlignOutline` | Parse slide plan, build dynamic template (v3) |
| `_fmt_extractmemory_node.js` | `2.1_FMT_ExtractMemory` | Sonnet prompt for memory extraction |
| `_fmt_kbsearch_node.js` | `2.5_FMT_KBSearch` | Haiku+tools prompt for KB search (slides 1-N/3) |
| `_fmt_kbsearch2_node.js` | `2.5b_FMT_KBSearch2` | KB search (slides N/3+1 to 2N/3) |
| `_fmt_kbsearch3_node.js` | `2.5c_FMT_KBSearch3` | KB search (slides 2N/3+1 to N) |
| `_js_mergekb_node.js` | `2.7b_JS_MergeKB` | Deduplicate 3 KB results, cap at 15 |
| `_js_parsekb_node.js` | `2.7_JS_ParseKB` | KB passthrough |
| `_fmt_tag_content_node.js` | `2.8_FMT_TagContent` | Haiku prompt for content tagging |
| `_js_parse_tags_node.js` | `2.10_JS_ParseTags` | Validate tags, fill missing |
| `_fmt_blueprint_node.js` | `3.1_FMT_Agent1A` | Sonnet blueprint prompt |
| `_js_parse_blueprint_node.js` | `3.3_JS_ParseAgent1A` | Parse blueprint output |
| `_fmt_normbp_node.js` | `3.4_FMT_NormBP` | Haiku schema enforcement |
| `_js_normbp_node.js` | `3.6_JS_NormBP` | Extract normalized blueprint |
| `_js_split_groups_node.js` | `4.1_JS_SplitGroups` | Fan out 7 content groups |
| `_fmt_group_template.js` | `5a-5g.1_FMT_Group1-7` | Sonnet content gen prompt |
| `_js_merge_node.js` | `6.1_JS_Merge` | Merge 7 content outputs |
| `_fmt_normcontent_node.js` | `6.2_FMT_NormContent` | Haiku content normalization |
| `_js_normcontent_node.js` | `6.4_JS_NormContent` | Extract normalized content |
| `_js_coverage_check_node.js` | `6.5_JS_CoverageCheck` | Pure JS coverage validation (v3) |
| `_fmt_qc_structure_node.js` | `7.1a_FMT_QC_Structure` | Sonnet structural review |
| `_fmt_qc_instruct_node.js` | `7.1b_FMT_QC_Instruct` | Sonnet instructional review |
| `_fmt_qc_quality_node.js` | `7.1c_FMT_QC_Quality` | Sonnet quality review |
| `_js_mergeqc_node.js` | `7.1e_JS_MergeQC` | Merge 3 QC results |
| `_fmt_normqc_node.js` | `7.1f_FMT_NormQC` | Haiku QC normalization |
| `_js_normqc_node.js` | `7.1h_JS_NormQC` | Extract normalized QC |
| `_js_prep_scripts_node.js` | `7.3_JS_PrepScripts` | Fan out 7 script groups |
| `_fmt_script_template.js` | `7.4a-7.4g.1_FMT_Scr1-7` | Sonnet script gen prompt |
| `_js_merge_scripts_node.js` | `7.6_JS_MergeScripts` | Merge + normalize scripts |
| `_js_assemble_node.js` | `8.1_JS_Assemble` | Build final 4-tab output |
| `_fmt_gammascript_node.js` | `8.2a_FMT_GammaScript` | Haiku Gamma markdown |
| `_js_gamma_script_node.js` | `8.2_JS_GammaScript` | Extract/fallback Gamma |
| `_err_format_node.js` | `9.1_ERR_Format` | Filter real errors |

---

## Known Issues / Open Items

1. **18 orphaned Agent 1B nodes** in workflow JSON — unreachable but clutter the n8n canvas
2. **Memory extraction model discrepancy** — `_fmt_extract_memory_node.js` uses Sonnet (`claude-sonnet-4-6`) not Haiku as originally designed — costs more but better quality
3. **Duplicate JS files** — some nodes have two variants (e.g., `_fmt_extractmemory_node.js` and `_fmt_extract_memory_node.js`; `_js_prepscripts_node.js` and `_js_prep_scripts_node.js`) — the sync script must use the correct one
4. **Transient LLM failures** — QC SUB nodes occasionally return HTTP responses without `agent_response` (seen in exec 18418, not a code issue)
5. **Regeneration flow** — `input_json.regenerationInstructions` not yet handled
