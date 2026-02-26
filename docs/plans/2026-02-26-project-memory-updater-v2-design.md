# Project Memory Updater v2 — Design Document

**Date**: 2026-02-26
**Status**: Approved
**Workflow**: `project-memory-updater`

## Problem Statement

The current Project Memory Updater produces bloated, duplicative output with hallucinated facts. After 3-10 documents are merged, the memory becomes diluted with fluff, repeated information across sections, and AI-generated implications not present in source documents. This degrades downstream workflows (case study creator, session slides, pre-work summary) that consume the memory.

### Root Causes

1. **3-step telephone game**: Extract ALL → Merge → Questions. The extraction step extracts everything indiscriminately, and the merge step preserves everything verbatim.
2. **"Extract EVERYTHING" mandate**: Step 1 prompt says "don't filter or prioritize — extract EVERYTHING" — directly causes bloat.
3. **No deduplication**: Neither prompt instructs the model to check for existing facts before adding new ones.
4. **Prompt duplication**: The merge prompt is copy-pasted in two nodes (`2.3_FMT_MergeDoc` and `2.4_FMT_MergeCorr`), creating maintenance risk.

## Solution: 2-Step Pipeline (Merge + Quality Review)

### Architecture

**Current flow (3 LLM calls):**
```
Webhook → Validate → [Extract] → [Merge] → [Questions] → Package → API
```

**New flow (2 LLM calls):**
```
Webhook → Validate → [Merge] → [Quality Review] → Package → API
```

Key changes:
- **Eliminate extraction step entirely** — the merge agent receives the raw document and existing memory directly, making merge decisions without lossy intermediate translation
- **Add quality review step** — a second model pass that catches duplication, hallucination, and fluff that Step 1 may have missed
- **All modes (2A/2B/2C) take the same path** — no separate correction branch; corrections are just another input type

### Modes

| Mode | Trigger | Step 1 Input | Step 2 Input |
|---|---|---|---|
| 2A_INITIAL | First document, no existing memory | null memory + new doc | Merge output + changelog |
| 2B_DOCUMENT_MERGE | New document + existing memory | current memory + new doc | Merge output + changelog |
| 2C_CORRECTIONS | User corrections, no new document | current memory + corrections | Merge output + changelog |

## Prompts

### Step 1: Memory Merge Agent (Sonnet)

```
# PROJECT MEMORY MAINTENANCE AGENT

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
- Use markdown: headers (##), bullet lists, **bold** for emphasis

## OUTPUT FORMAT

Return ONLY valid JSON:

{
  "project_memory_text": "# Project Memory\n\n## Section...\n...",
  "changes_made": {
    "sections_updated": ["section names modified or created"],
    "new_facts_added": ["brief list of genuinely new facts"],
    "duplicates_skipped": ["facts already in memory, not re-added"],
    "conflicts_detected": [
      {
        "section": "section",
        "existing": "current value",
        "new": "contradicting value"
      }
    ],
    "questions_resolved": [
      { "question": "...", "resolution": "..." }
    ],
    "summary": "1-2 sentence summary of what changed"
  }
}
```

### Step 2: Quality Review Agent (Sonnet)

```
# MEMORY QUALITY REVIEWER

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
  "project_memory_text": "# Project Memory\n\n...",
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
}
```

## Node Structure

| Node | Type | Purpose |
|---|---|---|
| `1.1_TRG_Webhook` | Webhook (POST) | Receives document + memory + corrections |
| `1.2_VAL_Input` | Code | Validates inputs, detects mode (2A/2B/2C), normalizes schema |
| `1.3_IF_Valid` | If | Gate: valid → continue, invalid → error path |
| `2.1_FMT_Merge` | Code | Builds Step 1 prompt with memory + doc + corrections |
| `2.2_SUB_Merge` | Execute Workflow | Calls LLM sub-workflow (Sonnet) for merge |
| `3.1_FMT_Review` | Code | Parses merge output, builds Step 2 review prompt |
| `3.2_SUB_Review` | Execute Workflow | Calls LLM sub-workflow (Sonnet) for quality review |
| `4.1_JS_Package` | Code | Parses review output, assembles final API response |
| `4.2_IF_Status` | If | Routes success vs error |
| `4.3_API_Success` | HTTP Request (PUT) | Sends updated memory to coreapi |
| `5.1_ERR_Format` | Code | Formats error for API reporting |
| `5.2_API_Error` | HTTP Request (PUT) | Sends error status to coreapi |

**12 nodes** (down from 15 in v1).

### Connection Map

```
1.1 → 1.2 → 1.3 ──(valid)──→ 2.1 → 2.2 → 3.1 → 3.2 → 4.1 → 4.2 ──(ok)──→ 4.3
                  └(invalid)→ 5.1 → 5.2
                                                                    └(error)→ 5.1
              2.2 error output → 5.1
              3.2 error output → 5.1
```

### Key Differences from v1

| Aspect | v1 (Current) | v2 (New) |
|---|---|---|
| LLM calls | 3 sequential | 2 sequential |
| Pipeline | Extract → Merge → Questions | Merge → Quality Review |
| Extraction step | Dedicated "extract everything" agent | Eliminated — merge agent reads raw document |
| Deduplication | Not implemented | Active — merge agent tracks `duplicates_skipped` |
| Quality gate | None | Step 2 reviews for duplication, hallucination, fluff |
| Mode branching | Separate merge nodes for doc vs corrections | Single merge path for all modes |
| Prompt maintenance | Merge prompt duplicated in 2 nodes | Single merge prompt, single review prompt |
| Question generation | Always runs, even after user answers | Conservative in corrections mode |

## API Contract

### Input (Webhook POST body)

No changes to the webhook contract — same fields:

```json
{
  "project_id": "string",
  "client_id": "string",
  "meeting_note_id": "string",
  "document_summary": "string (nullable)",
  "current_project_memory": "string (nullable)",
  "file_type": "string",
  "ai_observations": "string (nullable)",
  "clarification_answers": "array (nullable)",
  "freeform_corrections": "string (nullable)"
}
```

### Output (API PUT body)

No changes to the API contract:

```json
{
  "project": {
    "current_project_memory": "string (markdown)",
    "clarification_questions": "string (JSON array)",
    "memory_status": "updated | clarification_needed | error",
    "meeting_note_id": "string"
  }
}
```

## Success Criteria

1. No duplicated facts across sections in output memory
2. No hallucinated information (facts not traceable to inputs)
3. Memory length scales with actual content, not number of documents processed
4. All downstream workflows continue to function with the new memory format
5. Merge + Review completes in < 60 seconds (vs current ~45-90s for 3 calls)
