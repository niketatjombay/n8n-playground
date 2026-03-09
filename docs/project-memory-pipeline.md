# Project Memory Pipeline

## Overview

The project memory pipeline automatically builds and maintains a living knowledge base for every consulting project at Jombay. Each time a meeting note or project document is uploaded, two n8n workflows run in sequence to extract meaningful information and merge it into a unified project memory.

This memory is then consumed by all downstream AI agents (case study creator, session slides, pre-work summary, etc.) to produce project-aware, context-rich outputs without requiring manual briefing.

---

## The Two Flows

### Flow 1 — Document Summary Extractor

**Workflow:** `[STG] Document Summary Extractor`
**Triggered by:** Backend, immediately after a file is uploaded to a meeting note or project document record.

**What it does:**

Receives the raw document content (from Google Drive or inline text) and produces a decision-grade consultant note from it. The extraction follows strict rules:

- Extracts only what is explicitly stated in the document — no inference, no fabrication
- Preserves exact numbers, percentages, and timelines (never replaces them with qualitative words)
- Captures decisions, commitments, scope boundaries, open questions, current vs. desired state, and conditional logic
- Removes noise: greetings, logistics, facilitation language, commercial discussions
- Strips all speaker attribution and participant lists — the output is working memory, not meeting minutes
- Writes in a direct consultant voice, not formal documentation

The extraction runs on Sonnet and produces two fields:

- **`document_summary`** — a markdown consultant note covering all meaningful insights from the document
- **`ai_observations`** — structured flags for ambiguities, missing context, conflicting information, undefined jargon, and clarification questions with AI recommendations (null if the document is clear)

Once complete, the backend stores these on the meeting note or project document record and triggers Flow 2.

---

### Flow 2 — Project Memory Updater

**Workflow:** `[STG] Project Memory Updater v2`
**Triggered by:** Backend, after Flow 1 completes. Receives Flow 1's `document_summary`, `ai_observations`, and the project's current memory from the database.

**What it does:**

Merges the new document summary into the existing project memory and generates clarification questions if needed.

**Step 1 — Merge**

The merge agent receives the full context: the new document summary, the existing project memory, and any observations flagged by the extraction. It operates in one of three modes:

- **2A (Initial):** First document for the project — builds the memory from scratch
- **2B (Document Merge):** Integrates new information into the existing memory
- **2C (Corrections):** Applies user clarification answers or freeform corrections to the existing memory

Merge rules:
- New facts that aren't already in memory are added
- Facts already captured are tracked and skipped (no duplication)
- Conflicting information is flagged inline rather than silently resolved
- Proper nouns are never modified — names, companies, and locations are preserved exactly
- People who spoke in meetings are not listed as program participants unless explicitly described that way

The output is a complete, updated project memory in markdown — not a diff.

**Step 2 — Questions**

After the merge, a second Sonnet call reviews the updated memory and generates up to 3 clarification questions for the consulting team. Questions are only raised for genuine blockers: unresolved conflicts, critical gaps that affect deliverables, or ambiguities that would cause incorrect execution. In corrections mode (2C), the agent defaults to no questions unless the answers themselves introduced a new gap.

Each question includes context from the memory, an example of a good answer, and an AI recommendation with a confidence level.

**Final output** is written back to the project record:
- `current_project_memory` — the updated markdown memory
- `clarification_questions` — array of structured questions (or empty if none needed)
- `memory_status` — either `updated` or `clarification_needed`

---

## The Clarification Loop

When `memory_status` is `clarification_needed`, the dashboard surfaces the questions to the user. Once answered, the backend sends the answers back to Flow 2 in **2C (Corrections)** mode. The memory is updated with the answers and the loop closes.

```
Upload document
  → Flow 1: extract → document_summary + ai_observations
  → Flow 2 (2A/2B): merge + questions → memory updated
  → [if questions] dashboard shows questions → user answers
  → Flow 2 (2C): apply corrections → memory updated
```

---

## How Other Agents Use Project Memory

Downstream workflows receive the full `current_project_memory` text and use their own LLM extraction step to pull only what's relevant to their specific task. The memory is not injected wholesale — each agent filters it. This means the quality and completeness of the project memory directly determines the quality of every downstream output.

---

## Key Design Decisions

**No re-extraction in Flow 2.** Flow 1 already produces a decision-grade consultant note. Flow 2 merges this directly into memory without a second extraction pass. Adding an intermediate re-extraction step would be lossy and redundant.

**Silent deduplication.** The merge agent actively tracks what it chose not to add. This prevents the memory from becoming bloated across many document uploads.

**Conflicts are preserved, not resolved.** When new information contradicts existing memory, both versions are kept and flagged. The AI does not pick a winner — that decision stays with the consulting team.

**Zero trace principle.** Neither flow stores who said what. The memory contains facts and decisions, not attributed statements. This prevents false importance being assigned to information based on its source.
