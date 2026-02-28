# Case Study Creator — Architecture Document

**Status:** V3 DEPLOYED on staging — validated with execution 19021 (37/37 nodes, ~4.5 min)
**Date:** 2026-02-28 (V3 user-input fixes deployed)
**Workflow:** `n8n/workflows/staging/case-study-creator/main_workflow.json`

---

## Pipeline Overview

```
Stage 1:  Webhook → VAL_Input → IF_Valid → FMT_DriveUtils → SUB_DriveUtils → VAL_Extraction → IF_Extracted
Stage 2:  FMT_Context → LLM_Context → MRG_Context
Stage 3:  FMT_ParseRef → LLM_ParseRef → MRG_ParseRef
Stage 4:  FMT_Industry → LLM_Industry → MRG_Industry
Stage 5:  FMT_Behavior → LLM_Behavior → MRG_Behavior
Stage 6a: FMT_SituationIntro → LLM_SituationIntro → MRG_SituationIntro
Stage 6b: FMT_Challenge → LLM_Challenge → MRG_Challenge
Stage 6c: FMT_Conclusion → LLM_Conclusion → MRG_Conclusion
Stage 7:  FMT_Questions → LLM_Questions → MRG_Questions
Stage 8:  FMT_Quality → LLM_Quality → MRG_Quality
Stage 9:  FMT_Bias → LLM_Bias → MRG_Bias
Stage 10: JS_Package → API_Success
Error:    ERR_Response (HTTP PUT error)
```

**41 nodes total.** 9 LLM calls (7 Sonnet + 2 Haiku), 1 pure JS node, sequential pipeline (no parallel fan-out).

### Node Naming Convention

```
[Stage].[SubNode]_[Type]_[Name]
```

| Type | Purpose |
|------|---------|
| TRG | Trigger (webhook entry) |
| VAL | Validation |
| IF | Conditional routing |
| FMT | Format prompt for LLM |
| LLM | Call LLM sub-workflow |
| MRG | Merge LLM response into state |
| SUB | Call sub-workflow (non-LLM) |
| JS | JavaScript processing (no LLM) |
| API | HTTP API call |
| ERR | Error handling |

---

## Stage Details

### Stage 1 — Input Validation & Document Extraction (7 nodes)

**Nodes:** `1.1_TRG_Webhook` → `1.2_VAL_Input` → `1.3_IF_Valid` → `1.4_FMT_DriveUtils` → `1.5_SUB_DriveUtils` → `1.6_VAL_Extraction` → `1.7_IF_Extracted`

**Sub-workflows:** DriveUtils (`8N4Pzq6oTI5ligt4r8ZJ4`) for Google Drive text extraction.

`1.2_VAL_Input` parses webhook body and builds three state objects:

| Object | Purpose |
|--------|---------|
| `reference_case_text` | Raw text from reference case (populated later by DriveUtils) |
| `case_study_context` | User settings + project context (immutable after Stage 1) |
| `generated_case` | Accumulator — each MRG node adds its stage output here |

**User settings parsed into `case_study_context`:**

| Setting | Source Field | Default | Description |
|---------|-------------|---------|-------------|
| `challenge_approach` | `typeSpecificInputs.challengeApproach` | `'combined'` | `combined` = 2-3 behaviors per challenge; `separate_per_behavior` = 1 behavior per challenge |
| `number_of_questions` | `typeSpecificInputs.questionsPerChallenge` | `5` | Questions **per challenge** (not total) |
| `behaviors` | `inputJson.behaviours` (British spelling) | `[]` | Array of `{ name, definition }` |
| `case_study_length` | `typeSpecificInputs.lengthPreference` | `'standard'` | `short` / `standard` / `long` |
| `hide_behaviors_in_questions` | `typeSpecificInputs.hideBehaviors` | `false` | Whether to hide behavior names in question text |
| `target_level` | derived from `program_type` | `'Mid'` | `Low` / `Mid` / `High` / `Exceptional` |

**`target_level` mapping from `program_type`:**

| program_type | target_level |
|-------------|-------------|
| first_time_managers | Low |
| young_leaders | Mid |
| senior_leadership | High |
| executive | Exceptional |

### Stage 2 — Design Constraints (3 nodes, Sonnet)

**Nodes:** `2.1_FMT_Context` → `2.2_LLM_Context` → `2.3_MRG_Context`

The LLM generates `design_constraints` based on user settings:

**Key constraint logic (enforced in prompt):**
- If `challenge_approach === 'separate_per_behavior'`: `number_of_challenges = behavior_count`, each challenge assesses exactly ONE behavior
- If `challenge_approach === 'combined'`: `number_of_challenges = ceil(behavior_count / 3)`, capped at 2-4, each challenge assesses 2-3 behaviors
- Questions per challenge: `number_of_questions` (from user input, NOT a total)
- Total questions = `number_of_questions × number_of_challenges`

**Output stored as `case_study_context.case_design_constraints`:**
```json
{
  "number_of_challenges": 3,
  "behavior_distribution": {
    "challenge_1": { "behaviors": ["Strategic Thinking"] },
    "challenge_2": { "behaviors": ["Decision Making"] },
    "challenge_3": { "behaviors": ["Stakeholder Management"] }
  },
  "question_distribution": {
    "challenge_1": 1,
    "challenge_2": 1,
    "challenge_3": 1
  },
  "scenario_styles": ["Crisis management", "Strategic transformation"],
  "fgd_integration_points": [...],
  "difficulty": { "decision_complexity", "language", "ambiguity", "stakeholder_complexity" },
  "word_limits": { "situation": 130, "per_challenge": 200, "per_question": 40, ... }
}
```

### Stage 3 — Parse Reference Case (3 nodes, Sonnet)

**Nodes:** `3.1_FMT_ParseRef` → `3.2_LLM_ParseRef` → `3.3_MRG_ParseRef`

Extracts structural elements from the reference case text: narrative patterns, character types, tension points, data usage patterns.

### Stage 4 — Industry Adaptation (3 nodes, Sonnet)

**Nodes:** `4.1_FMT_Industry` → `4.2_LLM_Industry` → `4.3_MRG_Industry`

Generates industry-specific details: company name, characters (with titles/roles), competitors, metrics, jargon. Grounded in the client's actual industry from `case_study_context`.

### Stage 5 — Behavior Mapping (3 nodes, Sonnet)

**Nodes:** `5.1_FMT_Behavior` → `5.2_LLM_Behavior` → `5.3_MRG_Behavior`

Creates challenge outlines and maps questions to behaviors. Uses `behavior_distribution` and `question_distribution` from Stage 2.

**`challenge_approach` enforcement (V3 fix):**
- If `separate_per_behavior`: CRITICAL CONSTRAINT — each challenge MUST assess exactly ONE behavior. Number of challenges MUST equal number of behaviors.
- If `combined`: Group 2-3 complementary behaviors per challenge.

**Output stored in `generated_case.behavior_mapping`:**
```json
{
  "challenges": [
    {
      "number": 1,
      "title": "The Long Game Under Fire",
      "behaviors": ["Strategic Thinking"],
      "scenario_outline": "...",
      "behavior_stitching_storyline": "...",
      "evidence_moments": [{ "behavior": "Strategic Thinking", "moments": ["...", "..."] }],
      "fgd_point": "...",
      "tension": "...",
      "decision_type": "..."
    }
  ],
  "questions": [
    {
      "number": 1,
      "challenge_number": 1,
      "behaviors_tested": ["Strategic Thinking"],
      "focus": "..."
    }
  ]
}
```

**V3 fix in `5.3_MRG_Behavior`:** Previously read `response.challenge_outlines` (wrong key — always `[]`). Now reads `response.behavior_mapping.challenges` with fallback to `response.challenges`, and also stores `response.behavior_mapping.questions`. Handles both nested and flat LLM response formats.

### Stage 6 — Content Writing (9 nodes, Sonnet × 3)

Split into three sequential sub-stages:

**6a. Situation + Introduction** (3 nodes):
`6a.1_FMT_SituationIntro` → `6a.2_LLM_SituationIntro` → `6a.3_MRG_SituationIntro`

Writes the opening situation paragraph and 4-part introduction (company overview, market context, strategic initiative, team & targets). Uses industry-adapted characters, metrics, and competitors.

**6b. Challenges** (3 nodes):
`6b.1_FMT_Challenge` → `6b.2_LLM_Challenge` → `6b.3_MRG_Challenge`

Writes challenge blocks following 6 beats: triggering event → root cause → reader contribution → escalation → self-reflection → strategic decision point.

**V3 fix:** `challenge_approach` enforcement added to prompt. When `separate_per_behavior`, each challenge assesses exactly ONE behavior. Challenge outlines from Stage 5 are now properly passed (previously always empty due to `5.3` bug).

**6c. Conclusion** (3 nodes):
`6c.1_FMT_Conclusion` → `6c.2_LLM_Conclusion` → `6c.3_MRG_Conclusion`

Writes the conclusion paragraph tying back to the strategic initiative.

### Stage 7 — Question Generation (3 nodes, Sonnet)

**Nodes:** `7.1_FMT_Questions` → `7.2_LLM_Questions` → `7.3_MRG_Questions`

Generates assessment questions + assessor guidance (overall + per-question).

**V3 fix:** Explicit question count constraint added:
- `EXACTLY N question(s) per challenge` (from `ctx.number_of_questions`)
- Total questions = `number_of_questions × challenges.length`
- If `separate_per_behavior`: each question tests the ONE behavior assigned to its challenge
- If `combined`: each question tests 2-3 behaviors from its mapped challenge

**Output stored in `generated_case.assessment_questions` and `generated_case.assessor_guidance`.**

### Stage 8 — Quality Scoring (3 nodes, Haiku)

**Nodes:** `8.1_FMT_Quality` → `8.2_LLM_Quality` → `8.3_MRG_Quality`

16-criteria quality scoring across 4 categories:

| Category | Criteria |
|----------|----------|
| A. Case Study Body (7) | Flow & Transition, Style & Tone, Balance, Overall Impact, "Gives Away Answer" Check, Mandatory Elements, Word Count |
| B. Questions Quality (5) | Behavior Name Absence, Case Connection, Solution Flexibility, Complexity Match, Coverage Balance |
| C. Behavior Coverage (2) | 100% Coverage, No Duplication |
| D. Assessor Guidance (2) | Overall Guidance, Per-Question Guidance |

### Stage 9 — Bias Check (3 nodes, Haiku)

**Nodes:** `9.1_FMT_Bias` → `9.2_LLM_Bias` → `9.3_MRG_Bias`

4-category bias check: gender, cultural, industry, socioeconomic. Flags high-severity issues.

### Stage 10 — Package Final Output (1 JS node + 1 API node)

**Nodes:** `10.1_JS_Package` → `10.2_API_Success`

Pure JS assembly — no LLM. Reads from all upstream MRG nodes and assembles `final_output`.

**V3 fix:** Added `design_context` to `final_output` surfacing all user settings. Fixed `behaviors_list` source from `ctx.behaviors` (user input, authoritative) instead of `behaviorMapping.behaviors` (which was always empty). Added real `behavior_coverage_analysis` with computed `coverage_percentage` and `missing_behaviors`.

---

## Data Flow

**Three objects flow through the pipeline:**

| Object | Purpose | Mutability |
|--------|---------|------------|
| `reference_case_text` | Raw text from Google Drive document | Set once in Stage 1, immutable |
| `case_study_context` | User settings + project context + design constraints | Set in Stage 1, enriched with `case_design_constraints` in Stage 2, then immutable |
| `generated_case` | Accumulator — each MRG node adds its output | Grows through Stages 3-9 |

**What each MRG node adds to `generated_case`:**

| MRG Node | Key Added |
|----------|-----------|
| `2.3_MRG_Context` | `case_design_constraints` (on `case_study_context`, not `generated_case`) |
| `3.3_MRG_ParseRef` | `parsed_reference` |
| `4.3_MRG_Industry` | `industry_adapted` (company, characters, competitors, metrics) |
| `5.3_MRG_Behavior` | `behavior_mapping` (challenges + questions) |
| `6a.3_MRG_SituationIntro` | `situation`, `introduction` |
| `6b.3_MRG_Challenge` | `challenges` |
| `6c.3_MRG_Conclusion` | `conclusion` |
| `7.3_MRG_Questions` | `assessment_questions`, `assessor_guidance` |
| `8.3_MRG_Quality` | `quality_scores` |
| `9.3_MRG_Bias` | `bias_check`, `bias_passed`, `high_severity_issues` |

---

## User Input Settings — Propagation Map

How user settings flow through the pipeline (V3 — all bugs fixed):

| Setting | Stage 1 | Stage 2 | Stage 5 | Stage 6b | Stage 7 | Stage 10 |
|---------|---------|---------|---------|----------|---------|----------|
| `challenge_approach` | Parsed into `ctx` | Determines challenge count formula | Enforces 1-behavior-per-challenge if separate | Enforces writing rules per approach | Determines behaviors-per-question rule | Surfaced in `design_context` |
| `number_of_questions` | Parsed as int, default 5 | Labeled "Questions per Challenge", drives distribution | — | — | `EXACTLY N per challenge` constraint | `total_questions_expected` vs `total_questions_generated` |
| `behaviors` | Parsed as `[{name, definition}]` | Names passed for grouping | Full definitions passed for stitching | — | — | `behaviors_list` from `ctx.behaviors` |
| `target_level` | Derived from `program_type` | Sets difficulty table | Consequences calibration | Writing rules per audience level | — | In `design_context` |
| `case_study_length` | Parsed from input | Word limits set by LLM | — | Word limit per challenge | Word limit per question | In `design_context` |

---

## LLM Calls Summary

**9 total: 7 Sonnet + 2 Haiku**

| Stage | Model | Node | Purpose | Est. Time |
|-------|-------|------|---------|-----------|
| 2 | Sonnet | `2.2_LLM_Context` | Design constraints (challenge count, behavior distribution, question distribution) | ~20s |
| 3 | Sonnet | `3.2_LLM_ParseRef` | Parse reference case structure | ~30s |
| 4 | Sonnet | `4.2_LLM_Industry` | Industry adaptation (company, characters, metrics) | ~25s |
| 5 | Sonnet | `5.2_LLM_Behavior` | Behavior mapping + challenge outlines + question map | ~30s |
| 6a | Sonnet | `6a.2_LLM_SituationIntro` | Situation + introduction writing | ~25s |
| 6b | Sonnet | `6b.2_LLM_Challenge` | Challenge blocks (6-beat narrative) | ~30s |
| 6c | Sonnet | `6c.2_LLM_Conclusion` | Conclusion writing | ~15s |
| 7 | Sonnet | `7.2_LLM_Questions` | Questions + assessor guidance | ~25s |
| 8 | Haiku | `8.2_LLM_Quality` | 16-criteria quality scoring | ~15s |
| 9 | Haiku | `9.2_LLM_Bias` | 4-category bias check | ~10s |

**Sub-workflow:** All LLM calls go through AgentCore (`GDaWNcJJtLdY8Q6Y4Yv5p`).

---

## Output Schema (V3)

```json
{
  "case_study_metadata": {
    "title": "string",
    "created_at": "ISO timestamp",
    "version": "1.0",
    "case_length": "short | medium | long"
  },
  "case_study_context": {
    "workflow_session_id": "string",
    "workflow_id": "string",
    "project_id": "string",
    "client_id": "string",
    "case_design_constraints": { "...Stage 2 output..." }
  },
  "design_context": {
    "challenge_approach": "combined | separate_per_behavior",
    "number_of_questions_per_challenge": 1,
    "total_questions_expected": 3,
    "total_questions_generated": 3,
    "number_of_challenges": 3,
    "behaviors": ["Strategic Thinking", "Decision Making", "Stakeholder Management"],
    "behavior_count": 3,
    "target_level": "Mid",
    "case_study_length": "standard",
    "hide_behaviors_in_questions": false
  },
  "case_study_content": {
    "situation": "string",
    "introduction": {
      "company_overview": "string",
      "market_context": "string",
      "strategic_initiative": "string",
      "team_and_targets": "string"
    },
    "legacy_introduction": "string (concatenated situation + intro + conclusion)",
    "challenges": [
      {
        "number": 1,
        "title": "string",
        "content": "string (~200 words)",
        "behaviors_assessed": ["Strategic Thinking"],
        "characters_used": ["name1"],
        "metrics_used": ["string"],
        "legacy_text": "string"
      }
    ],
    "conclusion": "string"
  },
  "assessment_questions": [
    {
      "number": 1,
      "challenge_number": 1,
      "situation_summary": "string (2-3 sentences)",
      "question": "string",
      "behaviors_tested": ["Strategic Thinking"]
    }
  ],
  "assessor_guidance": {
    "overall": "string (100-150 words)",
    "per_question": [
      { "number": 1, "guidance": "string (100-150 words)" }
    ]
  },
  "quality_summary": {
    "overall_rating": 8.5,
    "average_rating": 8.7,
    "total_checks_passed": 14,
    "total_checks_conducted": 16,
    "passed_quality_check": true,
    "passed_bias_check": true,
    "total_behaviors_covered": 3,
    "unique_behaviors": 3,
    "behaviors_list": ["Strategic Thinking", "Decision Making", "Stakeholder Management"],
    "behavior_coverage_analysis": {
      "total_behaviors_defined": 3,
      "behaviors_in_challenges": 3,
      "coverage_percentage": "100%",
      "distribution": {
        "challenge_1": ["Strategic Thinking"],
        "challenge_2": ["Decision Making"],
        "challenge_3": ["Stakeholder Management"]
      },
      "missing_behaviors": []
    },
    "recommendations_for_deployment": ["string"]
  }
}
```

---

## V3 Fixes (2026-02-28)

### Bugs Fixed

| Bug | Root Cause | Fix | Node |
|-----|-----------|-----|------|
| Behavior drift | `5.3_MRG_Behavior` read `response.challenge_outlines` (wrong key — always `[]`) | Reads `response.behavior_mapping.challenges` + `.questions` with format fallbacks | `5.3_MRG_Behavior` |
| "Separate per behavior" ignored | `challenge_approach` stored but never explained to any LLM | Added explicit SEPARATE vs COMBINED instructions in Stages 2, 5, 6b, 7 | `2.1`, `5.1`, `6b.1`, `7.1` |
| Question count wrong | Source field `questionsPerChallenge` labeled "Total Questions"; Stage 7 never read `number_of_questions` | Fixed to "Questions per Challenge" + added `EXACTLY N per challenge` constraint | `2.1`, `7.1` |
| Design context missing | `10.1_JS_Package` didn't surface user settings; `behaviors_list` always `[]` | Added `design_context` object; sourced `behaviors_list` from `ctx.behaviors` | `10.1_JS_Package` |

### Validated With

Execution 19021 on staging:
- `challenge_approach: "separate_per_behavior"` with 3 behaviors
- `questionsPerChallenge: 1`
- Result: 3 challenges (1 behavior each), 3 questions (1 per challenge), `design_context` fully populated
- All 37/37 nodes succeeded (API PUT failed only due to test IDs)

---

## File Location

All code lives inline in `n8n/workflows/staging/case-study-creator/main_workflow.json`. No extracted JS files.

### How to Update

1. Edit the workflow JSON node's `jsCode` field (use `node -e` scripts for large changes)
2. Deploy: `node -e "const {loadEnv}=require('./n8n/lib/env-loader'); const {deploy}=require('./n8n/services/deploy'); loadEnv(); deploy({env:'staging',workflow:'case-study-creator'}).then(r=>console.log(JSON.stringify(r,null,2)));"`
3. Trigger test: use `testWorkflow({ slug: 'case-study-creator', env: 'staging', payload: {...} })`
4. Check execution: use `getExecutionDetail({ executionId: 'XXXXX', env: 'staging' })`
