# Case Study Modification - LLM Prompts (V2)

This document contains all LLM prompts used in the case study modification workflow.

**NOTE:** This workflow has been updated to V2 with 8 LLM nodes + 1 JS node (down from 11 LLM nodes).

For the complete V2 prompts specification, see: [case_study_agent_prompts_v2.md](./case_study_agent_prompts_v2.md)

---

## V2 Changes Summary

### Node Consolidation
| Original | V2 | Change |
|----------|-----|--------|
| Node 6 + Node 7 | Stage 6 | Challenge Writing + Conciseness merged |
| Node 9 + Node 10 | Stage 8 | Quality Scoring + Auto-Fix merged |
| Node 10 (LLM) | Stage 10 | Converted to pure JavaScript (no LLM) |

### Target Level Values
| V1 | V2 |
|---------|-----|
| "Junior", "Mid-Level", "Senior" | "Low", "Mid", "High", "Exceptional" |

### Key V2 Features
- **Behavior Stitching Storyline** (Stage 5) - Detailed narrative showing how behaviors interconnect
- **"Gives Away Answer" Prevention** (Stage 6, 8) - Explicit check to avoid listing failures directly
- **Assessor Guidance** (Stage 7) - Overall + per-question guidance with rating indicators
- **Evidence Moments** (Stage 5, 6) - 2-3 specific moments where each behavior can be demonstrated
- **16 Quality Criteria** (Stage 8) - Expanded from 4 criteria
- **Word Count Change** - 150-200 words per challenge (flexible from exact 170)
- **JS Packaging** (Stage 10) - No LLM needed, prevents token limit issues

---

## Workflow Flow (V2)

```
INPUT → [Stage 1] → [Stage 2] → [Stage 3] → [Stage 4] → [Stage 5] → [Stage 6] → [Stage 7] → [Stage 8] → [Stage 9] → [Stage 10] → OUTPUT
         (Input)     (Context)   (Parse)     (Industry)  (Behavior)  (Challenge) (Questions) (Quality)   (Bias)      (Package)
```

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
| MRG | Merge LLM response into generated_case |
| SUB | Call sub-workflow |
| JS | JavaScript processing (no LLM) |
| ERR | Error handling |
| OUT | Output response |

### Stage Overview

| Stage | Nodes | Model | Purpose |
|-------|-------|-------|---------|
| 1 | 1.1-1.7 | - | Input validation & document extraction |
| 2 | 2.1-2.3 | Sonnet | Context & Design Constraints |
| 3 | 3.1-3.3 | Sonnet | Parse Reference Case |
| 4 | 4.1-4.3 | Sonnet | Industry Adaptation |
| 5 | 5.1-5.3 | Sonnet | Behavior Mapping + Outline |
| 6 | 6.1-6.3 | Sonnet | Challenge Writing + Conciseness |
| 7 | 7.1-7.3 | Sonnet | Question Generation + Assessor Guidance |
| 8 | 8.1-8.3 | Haiku | Quality Scoring + Auto-Fix |
| 9 | 9.1-9.3 | Haiku | Bias Check |
| 10 | 10.1 | **JS** | Package Final Output (no LLM) |
| 11 | 11.1-11.2 | - | Error handling & webhook response |

---

## Data Flow

**Two key objects flow through the workflow:**

| Object | Purpose | Visibility |
|--------|---------|------------|
| `generated_case` | Internal trace of complete workflow execution | Internal only |
| `final_output` | Structured output for API consumption | Returned to caller |

- `generated_case` is updated by each MRG node with intermediate results
- `final_output` is assembled at Stage 10 from `generated_case` + `case_study_context`
- Only relevant data is sent to each LLM stage to optimize tokens

---

## How to Update Prompts

1. Edit the prompt text in the workflow JSON: `workflows/case-study-modification---production.json`
2. Run `npm run n8n:deploy` to deploy changes
3. Test with a sample payload using `target_level` values ("Low", "Mid", "High", "Exceptional")
4. Verify all 10 stages execute (8 LLM + 1 JS + input/output)
5. Check output matches V2 schema

---

## V2 Output Schema

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
    "case_design_constraints": { ... }
  },
  "case_study_content": {
    "introduction": "string",
    "challenges": [
      {
        "number": 1,
        "title": "string",
        "content": "string",
        "word_count": 150-200,
        "behaviors_assessed": [
          {"name": "string", "evidence_moments": ["string"]}
        ],
        "metrics": ["string"]
      }
    ]
  },
  "assessment_questions": [
    {
      "question_number": 1,
      "question_text": "string",
      "linked_challenge": 1,
      "behaviors_tested": ["string"],
      "response_guidance": "string",
      "evaluation_criteria": ["string"]
    }
  ],
  "assessor_guidance": {
    "overall": "string (~100-150 words)",
    "for_questions": [
      {"question_number": 1, "guidance": "string (~100-150 words)"}
    ]
  },
  "quality_summary": {
    "overall_rating": "number",
    "average_rating": "number",
    "total_checks_passed": "number",
    "total_checks_conducted": 16,
    "passed_quality_check": "boolean",
    "passed_bias_check": "boolean",
    "total_behaviors_covered": "number",
    "behavior_coverage_analysis": { ... },
    "recommendations_for_deployment": ["string"]
  }
}
```

---

## Quality Criteria (16 Total)

### Section A: Case Study Body (7 criteria)
- A1. Flow & Transition
- A2. Style & Tone
- A3. Balance
- A4. Overall Impact
- A5. "Gives Away Answer" Check
- A6. Mandatory Elements Check
- A7. Word Count Compliance

### Section B: Questions Quality (5 criteria)
- B1. Behavior Name Absence
- B2. Case Connection
- B3. Solution Flexibility
- B4. Complexity Match
- B5. Coverage Balance

### Section C: Behavior Coverage (2 criteria)
- C1. 100% Coverage Verification
- C2. No Duplication

### Section D: Assessor Guidance Quality (2 criteria)
- D1. Overall Guidance
- D2. Per-Question Guidance
