# Session Slides v3 — Design Document

**Date**: 2026-02-27
**Status**: Approved
**Workflow**: `session-slides`

## Problem Statement

Three consultant-reported issues with the current session-slides pipeline:

1. **Outline sequence not followed** — output slides don't follow the client-approved session outline order
2. **Activities missed** — activities from the outline are completely absent in output
3. **Target audience ignored** — content is appropriate for junior audiences even when the session is for senior leaders

### Root Causes

1. **Outline alignment computed but dropped**: `_js_splitgroups_node.js` computes per-slide `outline_alignment` and distributes it to groups, but `_fmt_group_template.js` never injects it into the content generation prompt. The data exists but is dropped at the point where it matters most.

2. **No chronological order instruction**: `_fmt_alignoutline_node.js` asks the LLM to plan slides without preserving outline sequence. 7 parallel groups distribute by count, not outline structure.

3. **No activity validation**: Activity detection is LLM-instruction-only with no programmatic verification that all outline activities made it into the slide plan.

4. **Seniority available but unused**: `seniority_of_cohort` flows through the pipeline but Agent 2's system prompt has zero instructions about adapting content for audience level.

5. **Session constraints underutilized**: `totalDuration`, `sessionType`, and `additionalInstructions` are not propagated to all stages.

## Solution: 5 Targeted Changes + 1 New Node

### Design Principles

- The **17 slide types are SECTIONS**, not individual slides. Each section can expand to multiple slides based on content density.
- The **outline is the delivery sequence** — slides must follow it chronologically.
- The **LLM acts as expert presentation designer** — it decides how many slides each section needs based on content density and audience.
- **KB content maps to specific expanded slides**, not just section types.
- **Session constraints** (type, duration, instructions) propagate to ALL prompt stages.
- **Supportive data** (facilitator scripts, gamma, visual scripts) is generated only on validated content.

## Pipeline Overview

```
Stage 1: INPUT PREP
  1.1_TRG_Webhook → 1.2_PREP_Input

Stage 2: CONTENT ANALYSIS (parallel)
  ├── 2.0_SUB_Outline → 2.0b_FMT_AlignOutline → 2.0c_SUB_AlignOutline → 2.0d_JS_AlignOutline
  ├── 2.2_FMT_ExtractMemory → 2.3_SUB_ExtractMemory
  └── 2.4_FMT_KBSearch → 2.5_SUB_KB → 2.6_SUB_KB2 → 2.7_SUB_KB3 → 2.8_JS_MergeKB

Stage 3: TAGGING + BLUEPRINT
  2.9_FMT_TagContent → 2.10_SUB_Tag → 2.11_JS_ParseTags
  → 3.1_FMT_Blueprint → 3.2_SUB_Blueprint → 3.3_FMT_NormBP → 3.4_SUB_NormBP → 3.5_JS_ParseBP

Stage 4: CONTENT GENERATION (7 parallel groups)
  4.1_JS_SplitGroups
  → [FMT_Group1..7 → SUB_Group1..7] (parallel)
  → FMT_NormContent1..7 → SUB_NormContent1..7 (parallel)
  → JS_MergeContent

Stage 5: OUTLINE COVERAGE VALIDATION  ← NEW
  5.0_JS_CoverageCheck

Stage 6: QC (3 parallel)
  ├── FMT_QC_Structure → SUB_QC_Structure
  ├── FMT_QC_Instruct → SUB_QC_Instruct
  └── FMT_QC_Quality → SUB_QC_Quality
  → FMT_NormQC → SUB_NormQC → JS_MergeQC

Stage 7: FACILITATOR SCRIPTS (7 parallel groups)
  JS_PrepScripts
  → [FMT_Scr1..7 → SUB_Scr1..7] (parallel)
  → JS_MergeScripts

Stage 8: ASSEMBLY + GAMMA
  JS_Assemble → FMT_GammaScript → SUB_Gamma → JS_GammaScript → API_Success
```

## Changes

### Change 1: Outline → Section Mapping (`_fmt_alignoutline_node.js`)

**Purpose**: Map the client-approved outline to the 17-section structure. The LLM acts as expert presentation designer and determines how many slides each section needs based on content density and audience seniority.

**Current**: Produces flat slide plan with arbitrary numbering, no chronological order instruction, no seniority consideration.

**New prompt design**:

```
YOU ARE an expert presentation architect. Read the client-approved
session outline and map it to a 17-SECTION presentation structure.

THE 17 SECTIONS (in delivery order):
1. Session title       [STATIC — always 1 slide]
2. Jombay intro        [STATIC — always 1 slide]
3. Trainer intro       [STATIC — always 1 slide]
4. Agenda              [STATIC — always 1 slide]
5. Working Agreement   [0-1 slides — include for interactive sessions]
6. Program overview    [1 slide]
7. Objectives          [1 slide]
8. Module breaker      [0-N slides — one per major topic transition]
9. Content (AC)        [1-N slides — one per content topic in outline]
10. Quote              [0-N slides — where relevant]
11. Discussion/Reflection (RO) [0-N slides — per debrief/discussion in outline]
12. Activity (CE)      [0-N slides — per activity/exercise in outline]
13. Break              [0-N slides — where outline has breaks]
14. Questions          [STATIC — always 1 slide]
15. Feedback           [STATIC — always 1 slide]
16. Call to Action     [STATIC — always 1 slide]
17. Closing            [STATIC — always 1 slide]

AUDIENCE SENIORITY: {seniority_of_cohort}
- Senior: fewer introductory slides, deeper content, strategic activities
- Junior: more scaffolding, step-by-step activities, more context slides

SESSION TYPE: {sessionType}
- Virtual: shorter activities, digital engagement, breakout rooms
- In-person: longer group work, physical movement, hands-on exercises

TIMING:
- If outline has time slots (e.g., "09:00-09:30") → use as ground truth
- If outline has NO time details → use totalDuration to allocate proportionally

PLANNING RULES:
- PRESERVE CHRONOLOGICAL ORDER from outline — the outline IS the delivery sequence
- Each outline time slot maps to one or more slides IN ORDER
- DO NOT merge multiple outline topics into one slide
- DO NOT skip any outline item — every topic/activity/discussion must have a slide
- Each activity/exercise in outline gets its OWN Activity (CE) slide
- Each discussion/debrief gets its OWN Discussion/Reflection (RO) slide
- Each content theme gets its OWN Content (AC) slide
- Add Module breaker between major topic transitions
- Static sections (1-4, 14-17) are always present, always 1 slide each
- You decide the optimal number of slides — do not restrict to any fixed count

USER GUIDELINES:
{additionalInstructions}
```

**Output format**:

```json
{
  "section_expansion": {
    "slide_1": 1,
    "slide_9": 4,
    "slide_12": 3
  },
  "slide_plan": [
    {
      "slide_id": "slide_9_1",
      "section_type": "Content (AC)",
      "section_number": 9,
      "instance": 1,
      "outline_ref": "09:30-10:00",
      "outline_topic": "GROW Model Introduction",
      "outline_excerpt": "EXACT text from outline",
      "alignment_rationale": "Why this maps here",
      "estimated_duration_minutes": 30
    }
  ],
  "delivery_sequence": ["slide_1", "slide_2", "slide_3", "slide_4",
    "slide_5", "slide_6", "slide_7", "slide_8_1", "slide_9_1",
    "slide_12_1", "slide_11_1", "slide_13_1", "slide_9_2", ...
    "slide_14", "slide_15", "slide_16", "slide_17"],
  "total_slides": 24,
  "timing_source": "outline | estimated"
}
```

**Key**: `delivery_sequence` defines the exact presentation order, matching the client-approved outline.

### Change 2: Module-Based Group Packing (`_js_splitgroups_node.js`)

**Purpose**: Pack expanded slides into 7 groups by outline module boundaries instead of even count distribution.

**Current**: Distributes slides evenly by count with cosmetic group names.

**New grouping logic**:
- Group 1: First 4 static slides (Session title through Agenda)
- Groups 2-6: Outline modules (one module per group, smart packing if >5 modules)
- Group 7: Last 4 static slides (Questions through Closing)

If outline has >5 content modules, merge smallest adjacent modules into shared groups.

**Empty group handling**: Groups with no slides return `{}` immediately — FMT_Group nodes check and skip LLM call.

**Agent 2 system prompt additions**:

```
=== AUDIENCE ADAPTATION ===
Target audience seniority: {seniority_of_cohort}

SENIOR (Director/VP/C-suite):
- Strategic framing — "why this matters for your business unit"
- Skip foundational definitions — assume they know basics
- Business impact language, not training jargon
- Activities: strategic application, not skill-building drills
- Fewer bullets, more provocative questions

MID-LEVEL (Manager/Senior IC):
- Balance theory + practical application
- Connect to daily reality (team, projects, cross-functional work)
- Activities: scenario practice with realistic complexity

JUNIOR (Individual Contributor/New hire):
- Step-by-step scaffolding, define terms
- Activities: structured exercises with clear instructions
- More bullets, more guidance, concrete examples

=== SESSION TYPE ===
Delivery format: {sessionType}
- Virtual: digital-first engagement, screen-sharing, breakout rooms, shorter activities
- In-person: group work, physical movement, handouts, longer exercises

=== USER GUIDELINES ===
{additionalInstructions}
Follow these unless they conflict with the session outline.
```

### Change 3: Outline + KB Injection in Content Generation (`_fmt_group_template.js`)

**Purpose**: Inject per-slide outline evidence and KB content that is currently computed but dropped.

**New prompt sections**:

```
=== OUTLINE ALIGNMENT (per-slide — PRIMARY DIRECTIVE) ===
Each slide below has a specific outline excerpt it MUST deliver.
Do NOT substitute, skip, or reinterpret.

slide_9_1:
  section_type: Content (AC)
  outline_topic: "GROW Model Introduction"
  outline_excerpt: "30 min — Introduce GROW coaching framework with demo"
  estimated_duration: 30 min

slide_12_1:
  section_type: Activity (CE)
  outline_topic: "Paired Coaching Exercise"
  outline_excerpt: "30 min — Pairs practice GROW model with real scenarios"
  estimated_duration: 30 min

=== KB CONTENT PER SLIDE ===
--- slide_9_1 ---
KB Unit CU_012: GROW Coaching Framework
Summary: Four-step coaching model (Goal, Reality, Options, Will)...

--- slide_12_1 ---
KB Unit CU_045: Coaching Practice Activities
Summary: Structured pair exercises for coaching skill building...

=== SESSION CONSTRAINTS ===
Session Type: {sessionType}
Duration: {totalDuration}
Tailor content depth and activity design to this format and duration.

=== USER GUIDELINES ===
{additionalInstructions}
```

### Change 4: Content Tagging with Expanded Slides (`_fmt_tag_content_node.js`)

**Purpose**: Map KB units and pre-work to specific expanded slides, not just section types.

**Current**: Tags to 17 fixed section types (e.g., "slide_9" gets all Content KB).

**New**: Runs AFTER alignment step knows the expanded slide IDs. Tags KB and pre-work to specific expanded slides:

```json
{
  "slide_9_1": { "kb_units": ["CU_012", "CU_015"], "pre_work_slides": ["slide_2_1"] },
  "slide_9_2": { "kb_units": ["CU_023", "CU_024"], "pre_work_slides": [] },
  "slide_12_1": { "kb_units": ["CU_045"], "pre_work_slides": ["slide_3_2"] }
}
```

This requires the tagging step to receive the expanded slide plan from alignment. The prompt gets the slide plan with outline excerpts so it can match KB content to specific topics.

### Change 5: Outline Coverage Validation (NEW node `5.0_JS_CoverageCheck`)

**Purpose**: Programmatic check (no LLM needed) that every outline item has a generated slide.

**Position in pipeline**: After content merge, before QC.

```
Content Merge → [5.0_JS_CoverageCheck] → QC (3 parallel) → ...
```

**Logic**:

```javascript
// Read outline alignment (every outline item → expected slide)
const slidePlan = alignment.slide_plan;
const mergedContent = contentMerge.slides;

const covered = [];
const missing = [];

for (const item of slidePlan) {
  if (item.slide_id.startsWith('slide_1') || ...) continue; // skip static

  const slideContent = mergedContent[item.slide_id];
  if (slideContent && slideContent.slide_title) {
    covered.push({ slide_id: item.slide_id, outline_topic: item.outline_topic });
  } else {
    missing.push({
      slide_id: item.slide_id,
      outline_ref: item.outline_ref,
      outline_topic: item.outline_topic,
      status: 'MISSING'
    });
  }
}

return {
  coverage_percentage: Math.round(covered.length / slidePlan.length * 100),
  covered_items: covered,
  missing_items: missing,
  total_outline_items: slidePlan.length,
  total_slides_generated: Object.keys(mergedContent).length
};
```

This feeds into the QC quality node so it can flag coverage gaps.

### Change 6: Session Constraints Propagation

**Current**: `session_constraints` partially used in `_fmt_group_template.js` only.

**New**: Session constraints flow to ALL prompt-building stages:

| Stage | How constraints are used |
|---|---|
| **AlignOutline** | If outline has time slots → use as ground truth. If no times → use `totalDuration` to estimate. `sessionType` affects activity type selection. |
| **Blueprint** | Already receives constraints ✅. Add `additionalInstructions` as "USER GUIDELINES". |
| **Content Gen (Agent 2)** | `sessionType` drives content style (virtual vs in-person). `additionalInstructions` as user guidelines. |
| **QC Quality** | Validate content matches session type (no "stand up and form groups" for virtual). |
| **Facilitator Scripts** | `sessionType` drives script format: virtual = "Share screen, open breakout rooms" vs in-person = "Distribute handouts, form pairs". |

**`additionalInstructions` handling**: Injected into every LLM prompt as:
```
=== USER GUIDELINES ===
{additionalInstructions}
Follow these unless they conflict with the session outline (outline takes precedence).
```

**Timing logic**:
- If outline has time slots → use outline times as ground truth
- If no time details → use `totalDuration` to calculate available time, allocate proportionally
- Flag in output: `timing_source: "outline" | "estimated"`

## Files Modified

| File | Change Type | Purpose |
|---|---|---|
| `_fmt_alignoutline_node.js` | Major rewrite | 17-section mapping, chronological order, seniority, session type, timing |
| `_js_alignoutline_node.js` | Update | Parse new output format (section_expansion, delivery_sequence) |
| `_js_splitgroups_node.js` | Major rewrite | Module-based group packing, seniority in Agent 2 prompt, session constraints |
| `_fmt_group_template.js` | Update | Inject outline_alignment, per-slide KB, session constraints, user guidelines |
| `_fmt_tag_content_node.js` | Update | Tag to expanded slide IDs instead of 17 fixed sections |
| `_fmt_group1..7_node.js` | Update | Handle empty groups (skip LLM call), use expanded slide IDs |
| `_fmt_qc_quality_node.js` | Update | Receive coverage_report, validate session type compliance |
| `_js_assemble_node.js` | Update | Handle variable slide count, delivery_sequence ordering |
| NEW: `_js_coverage_check_node.js` | New | Outline coverage validation (pure JS) |

## Downstream Impact

- **Facilitator scripts**: Will receive expanded slide IDs and session type — scripts adapt for virtual vs in-person delivery
- **Gamma script**: Will handle variable slide count — layout adapts to actual content
- **Assembly**: Orders slides by `delivery_sequence` from alignment, not fixed 1-17

## Success Criteria

1. Every outline item appears in at least one generated slide (coverage ≥ 95%)
2. Slides follow outline chronological order exactly
3. Activities from outline are never skipped
4. Content adapts to audience seniority (vocabulary, depth, activity design)
5. Content adapts to session type (virtual vs in-person)
6. User-provided `additionalInstructions` are respected throughout
7. No regression in existing quality (provenance tracking, KB reuse, pre-work grounding)
