# Session Slides Agent — Architecture Overview

## What It Does

The Session Slides agent transforms a pre-work content package into a complete, facilitator-ready 17-slide training session. It takes client context, pre-work summaries, a content outline (Google Doc), and project memory as inputs and produces structured slide specifications, near-verbatim facilitator scripts, and a quality review — all aligned with Jombay's instructional design frameworks (Gagne's 9 Events, Kolb's Learning Cycle, AGES, Bloom's Taxonomy).

**Endpoint:** `POST /staging/session-slides`
**Total slides:** 17 (fixed structure — title through closing)
**Estimated runtime:** 8–12 minutes

## Pipeline Overview

```
Webhook → Validate → Extract Content → Extract Memory → KB Pre-fetch
  → Agent 1A (Strategic Design)
  → Agent 1B (7 parallel Blueprint groups)
  → Agent 2 (7 parallel Content Generation groups)
  → Agent 3 (QA Review)
  → Assemble → PUT to CoreAPI
```

### Stage 1: Ingestion & Pre-processing

| Step | What happens |
|------|-------------|
| **Webhook** | Receives project_details, pre_work_summary, session_constraints, content_outline_url, memory_id, knowledge_base_id |
| **Validation** | Parses JSON inputs, extracts client name (fallback chain), validates required fields |
| **Content Extraction** | Calls the Google Drive Utils sub-workflow to extract text from the content outline doc |
| **Memory Extraction** | LLM call to extract session-relevant context from project memory (previous sessions, frameworks, facilitator preferences, participant pain points) |
| **KB Pre-fetch** | Single LLM call with the `search_knowledge_base` tool to retrieve all relevant Jombay IP upfront (see below) |

### Stage 2: Agent 1A — Strategic Instructional Designer

A single LLM call that produces the strategic blueprint: session overview, Gagne event mapping (all 9 events to slide numbers), Kolb cycle assignments (CE/RO/AC/AE to slides 12/11/9/16), per-slide allocation guidance, mandatory Jombay frameworks, competencies for KB search, and a sensitivity log. This output drives all downstream agents.

### Stage 3: Agent 1B — Slide Blueprinting (7 parallel)

Splits the 17 slides into 7 groups and runs them in parallel. Each group produces detailed 15-field blueprints per slide (type, intent, Gagne event, Kolb stage, AGES function, tension/safety call, provenance tag, content direction, experience anchors, etc.). Results are merged into a unified `slide_blueprint` object.

| Group | Slides | Focus |
|-------|--------|-------|
| 1 | 1–3 | Title & Introduction |
| 2 | 4–5 | Setup & Framing |
| 3 | 6–7 | Context & Objectives |
| 4 | 8–10 | Core Content |
| 5 | 11–12 | Engagement & Application |
| 6 | 13–15 | Transition & Reflection |
| 7 | 16–17 | Action & Closing |

### Stage 4: Agent 2 — Slide Content Generation (7 parallel)

Same 7-group split. Each group receives the blueprints from Agent 1B plus the pre-fetched KB results, and generates:
- **Slide specs:** headline, subtext, visual guidance, bullets (max 4, under 12 words each), activity details, modality notes (virtual vs in-person), provenance tags, KB asset references
- **Facilitator scripts:** near-verbatim delivery guide, energy notes, transition language, optional facilitation paths, activity run-of-show, debrief questions

Results are merged across all 7 groups into unified `slide_spec` and `facilitator_script` objects covering all 17 slides.

### Stage 5: Agent 3 — QA Reviewer

Reviews all 17 slides against Jombay's Content Development Checklist (retrieved from memory). Checks structural completeness, instructional quality, content quality, compliance, facilitator usability, and provenance. Flags issues with what/why/fix-direction — never auto-corrects.

### Stage 6: Assembly & Output

Embeds Agent 3 review flags into slide specs, builds a provenance log, and assembles the final output (metadata, session overview, slide specs, facilitator scripts, checklist compliance report, reviewer attention log). PUTs the result to CoreAPI as a completed workflow session.

---

## How the Knowledge Base Works

### The Problem It Solves

Jombay maintains a library of proprietary IP — frameworks, models, assessment tools, content summaries, and reusable content units — stored in an **AWS Bedrock Knowledge Base**. The agent needs to search this library to align slide content with existing Jombay materials (the "70% fit rule": reuse if >=70% fit, adapt if 40-69%, create new if <40%).

### Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│  n8n node    │     │  LLM Sub-wf      │     │  AgentCoreAPI       │
│  2.6_SUB_    │────>│  (HTTP POST to   │────>│  (Bedrock Agent     │
│  KBSearch    │     │   agentcoreapi)  │     │   with KB tool)     │
└─────────────┘     └──────────────────┘     └─────────┬───────────┘
                                                       │
                                                       ▼
                                              ┌────────────────────┐
                                              │  AWS Bedrock       │
                                              │  Knowledge Base    │
                                              │  (ID: e.g.        │
                                              │   Q6OYS6AUC8)     │
                                              └────────────────────┘
```

The `knowledge_base_id` is passed in the webhook payload and threaded through every LLM call. When AgentCoreAPI receives a request with a `knowledge_base_id`, it configures the Bedrock Agent with a `search_knowledge_base` tool. The LLM can then autonomously call this tool during its response generation.

### Pre-fetch Strategy (Phase 3 Optimization)

Previously, every agent independently called `search_knowledge_base` via multi-turn tool use, adding 60-120 seconds per call. With 1 Agent 1A call + 5 Agent 2 calls, this created 6 redundant KB searches and pushed execution times past the 300s timeout limit.

**Now:** A single dedicated KB search runs once after memory extraction (`2.5_FMT_KBSearch` → `2.6_SUB_KBSearch` → `2.7_JS_ParseKB`). The search prompt includes:
- Client name, industry, audience seniority, session topic
- Competencies and themes extracted from pre-work metadata

The results are parsed into a `kb_results` array and injected as a `=== KNOWLEDGE BASE RESULTS ===` context section into every downstream agent's prompt. This eliminates all multi-turn tool-call overhead while ensuring every agent has full access to Jombay's content library.

### How Agents Use KB Results

| Agent | How it uses KB results |
|-------|----------------------|
| **Agent 1A** | Identifies mandatory Jombay frameworks, determines provenance tags (Reused/Adapted/New) per slide |
| **Agent 1B** | Applies 70% fit rule to each blueprint, references KB content in provenance decisions |
| **Agent 2** | Aligns on-slide content with KB summaries, populates `knowledge_bank_assets` per slide (title, type, URL, summary), references KB content in facilitator scripts |
| **Agent 3** | Verifies KB content was used where available, checks provenance tags are present |

### Infrastructure Stack

| Layer | Technology |
|-------|-----------|
| Workflow orchestration | n8n CE (self-hosted at `workflows.ur-nl.com`) |
| LLM gateway | AgentCoreAPI (`agentcoreapi.jombay.com`) |
| LLM model | Claude Sonnet 4.5 via AWS Bedrock (`global.anthropic.claude-sonnet-4-5-20250929-v1:0`) |
| Knowledge base | AWS Bedrock Knowledge Base |
| Session memory | AWS Bedrock Memory (Content Development Checklist, project context) |
| Application backend | CoreAPI (`coreapi.ur-nl.com`) — stores workflow session results |
