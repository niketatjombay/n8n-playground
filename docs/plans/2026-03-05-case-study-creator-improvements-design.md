# Case Study Creator — Improvements Design

**Date:** 2026-03-05
**Workflow:** `[STG] Case Study Creator`
**Architecture doc:** `n8n/docs/case-study-prompts.md`
**Status:** Design approved, pending implementation

---

## Problem Statement

Four issues with the current workflow:

1. **`project_memory` not reaching content-writing stages.** Stages 6a, 6b, 6c (situation, challenges, conclusion) receive zero FGD context. Content is generated purely from industry-adapted structure. The case study is not grounded in actual client findings.

2. **`tone`, `must_include`, `narrative_arc`, `tension_patterns`, `decision_types` never injected into Stage 6.** All five fields are parsed in Stage 1 and stored in `case_study_context` but never passed to the content-writing prompts where they matter most.

3. **Model strings hardcoded** to full Bedrock IDs across all 9 FMT nodes. Should be `'sonnet'` / `'haiku'` to use the shared LLM sub-workflow's model mapping.

4. **No XML wrapping** on injected inputs in several FMT nodes — raw template literal injection risks prompt injection and inconsistent parsing.

---

## Approved Approach (C)

Insert a FilterContext pre-processing step at Stage 1.8–1.10 so all downstream stages get clean, focused FGD context. Fix direct injection of `tone`, `must_include`, `narrative_arc`, `tension_patterns`, `decision_types` into Stage 6 prompts. Fix all model strings.

---

## Architecture

### Current Flow (simplified)

```
Stage 1: Webhook → Validate → Extract → Validate Extraction
Stage 2: FMT_Context → LLM_Context → MRG_Context
...
Stage 6: FMT_SituationIntro → ... → FMT_Challenge → ... → FMT_Conclusion → ...
```

### Updated Flow

```
Stage 1: Webhook → Validate → Extract → Validate Extraction
  → 1.8_FMT_FilterContext → 1.9_SUB_FilterLLM → 1.10_MRG_FilterContext  [NEW]
Stage 2: FMT_Context → LLM_Context → MRG_Context
...
Stage 6: FMT_SituationIntro → ... → FMT_Challenge → ... → FMT_Conclusion → ...
```

`1.10_MRG_FilterContext` adds `filtered_context` to `case_study_context`. All downstream FMT nodes read `ctx.filtered_context` for FGD grounding.

---

## New Nodes (Stage 1.8–1.10)

### `1.8_FMT_FilterContext`
**Type:** Code node
**Model:** `'sonnet'`
**Max tokens:** 2000
**Job:** Compress `project_memory` + behavior definitions into focused, case-study-relevant JSON.

**Inputs (XML-wrapped):**
```
<project_memory>{{ ctx.project_memory }}</project_memory>
<behaviors>{{ JSON.stringify(ctx.behaviors) }}</behaviors>
<client_context>client: ctx.client_name | industry: ctx.industry | level: ctx.target_level | function: ctx.business_function</client_context>
```

**Output JSON schema:**
```json
{
  "organizational_challenges": ["<key challenge or pain point from FGDs>"],
  "behavioral_evidence": [
    {
      "behavior": "<behavior name matching user input>",
      "observed_gaps": ["<specific gap observed in FGDs>"],
      "positive_examples": ["<positive example if any>"]
    }
  ],
  "key_themes": ["<recurring theme across FGD conversations>"],
  "specific_scenarios": ["<concrete situation or example usable as case study inspiration>"],
  "organizational_context": {
    "culture_dynamics": ["<cultural or organizational dynamic observed>"],
    "stakeholder_tensions": ["<cross-functional or leadership tensions>"],
    "strategic_pressures": ["<business pressures driving the programme>"]
  },
  "language_and_tone": ["<actual phrases, terminology, or expressions used by participants>"],
  "extraction_gaps": ["<what was missing or unclear in project_memory>"]
}
```

**Prompt rules:**
- Extract ONLY what is explicitly stated — no inference, no fabrication
- `behavioral_evidence` entries must match behavior names exactly as provided in `<behaviors>`
- If a section has no data, use empty array — never invent
- Output pure JSON — no markdown fences, no explanatory text

### `1.9_SUB_FilterLLM`
**Type:** executeWorkflow
**Sub-workflow ID:** `GDaWNcJJtLdY8Q6Y4Yv5p`
**retryOnFail:** true, maxTries: 2
**onError:** continueErrorOutput — error path wired to `ERR_Response`

### `1.10_MRG_FilterContext`
**Type:** Code node
**Job:** Read `llm_response` from FilterLLM, merge `filtered_context` into `case_study_context`.

```js
const input = $input.first().json;
const filteredContext = input.llm_response || {};
return [{
  json: {
    ...input,
    case_study_context: {
      ...input.case_study_context,
      filtered_context: filteredContext
    }
  }
}];
```

---

## Connection Changes

| From | To | Change |
|---|---|---|
| `1.7_IF_Extracted` YES | `1.8_FMT_FilterContext` | Was → `2.1_FMT_Context` |
| `1.8_FMT_FilterContext` | `1.9_SUB_FilterLLM` | New |
| `1.9_SUB_FilterLLM` success | `1.10_MRG_FilterContext` | New |
| `1.9_SUB_FilterLLM` error | `ERR_Response` | New (error wire) |
| `1.10_MRG_FilterContext` | `2.1_FMT_Context` | New (was directly from 1.7) |

---

## FMT Node Changes

### What's added to each prompt (additive only — existing content unchanged)

| Node | Additions |
|---|---|
| `2.1_FMT_Context` | `<filtered_context>` replaces raw `project_memory` string injection |
| `4.1_FMT_Industry` | `<filtered_context>` with `organizational_context` + `strategic_pressures` |
| `5.1_FMT_Behavior` | `<filtered_context>` with `behavioral_evidence` per behavior |
| `6a.1_FMT_SituationIntro` | `<filtered_context>` with `specific_scenarios` + `organizational_context`; `tone` and `narrative_arc` added as explicit instructions |
| `6b.1_FMT_Challenge` | `<filtered_context>` with `behavioral_evidence` + `key_themes`; `tone`, `must_include`, `tension_patterns`, `decision_types` added |
| `6c.1_FMT_Conclusion` | `<filtered_context>` with `key_themes`; `tone` added |
| `7.1_FMT_Questions` | `<filtered_context>` with `language_and_tone` so questions use client terminology |

### Model string fix (all 9 FMT nodes)

| Current | Replace with |
|---|---|
| `'global.anthropic.claude-sonnet-4-5-20250929-v1:0'` | `'sonnet'` |
| `'global.anthropic.claude-haiku-4-5-20251001-v1:0'` (Stages 8, 9) | `'haiku'` |

---

## What Stays Unchanged

| Component | Status |
|---|---|
| `1.1_TRG_Webhook` through `1.7_IF_Extracted` | Unchanged |
| All MRG nodes (2.3, 3.3, 4.3, 5.3, 6a.3, 6b.3, 6c.3, 7.3, 8.3, 9.3) | Unchanged |
| All LLM sub-workflow call nodes | Unchanged |
| Stage 3 (ParseRef) | Unchanged — works from reference case text only |
| Stage 8 (Quality), Stage 9 (Bias) | Unchanged |
| `10.1_JS_Package`, `10.2_API_Success` | Unchanged |
| Final output JSON schema | Identical to V3 — no structural changes |
| Error path (`ERR_Response`) | Unchanged (just receives new error wire from 1.9) |

---

## Key Design Decisions

**Filter at Stage 1, not Stage 6.** Inserting the filter before Stage 2 means all 9 downstream stages benefit — not just content writing. Stage 2 (design constraints), Stage 4 (industry), Stage 5 (behavior mapping) all get FGD grounding, producing better intermediate outputs that feed Stage 6.

**Direct injection for `tone`/`must_include`/`narrative_arc`.** These fields are already in `ctx` — they just need to be added to the prompt strings. No new nodes needed for this fix.

**Output schema unchanged.** `filtered_context` is internal pipeline state on `case_study_context`. It is not added to `generated_case` and does not appear in `final_output`. `10.1_JS_Package` is untouched.

**Error wire on `1.9_SUB_FilterLLM`.** Same pattern as other sub-workflow nodes — `continueErrorOutput` with error path wired to `ERR_Response` to prevent silent failures.
