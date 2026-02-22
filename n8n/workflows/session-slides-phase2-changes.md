# Session Slides — Phase 2 Changes (User Feedback)

Based on feedback from 10 users. Reference workflow: `n8n/workflows/staging/session-slides/main_workflow.json`

---

## Prompt Changes (waiting for prompt to be shared)

### P1 — Humanize Language
- Remove AI-sounding phrasing (corporate jargon, overly formal constructions)
- Eliminate negative connotations — language must be appropriate for client-facing consulting deliverables
- Convert bullet-point style output into storytelling paragraphs where appropriate
- "Soften" the tone — consultative, not robotic
- Target: output should read like a senior consultant wrote it, not an LLM

### P1 — Reduce Hallucinations
- Strict grounding: output must ONLY use content from input documents (meeting notes, project details, uploaded docs)
- No invented insights, no additional language/points not in source material
- Add explicit guardrails in prompt: "Do not add information, examples, or insights that are not directly present in the provided inputs"
- If information is insufficient, flag the gap rather than filling it with fabricated content

---

## UI/UX & Functional Changes (code changes)

### P1 — Project Creation Flow Redesign
- Step 1: Popup with Project Name + Description → create project on submit
- Step 2: Redirect to full creation flow (Project Details → Meeting Notes → CTM → Project Documents)
- Meeting note processing starts in real-time during upload
- Incomplete projects: user lands back in creation flow until "Save Project" is clicked

### P1 — Delete Meeting Notes
- Add delete option during project creation
- If status is `failed`/`in_processing`/`extracting`: simple confirmation dialog
  - Copy: "Are you sure you want to delete this meeting note — <meeting_note_title>?"
  - Yes → delete, No → cancel
- If status is `generated`: warning dialog about meeting summary regeneration
  - Copy: "Are you sure you want to delete this meeting note — <meeting_note_title>? This will cause regeneration of Meeting Summary. You will not be able to create a deliverable for next 10-15 mins"
  - Yes → delete + regenerate project memory, No → cancel

### P2 — Edit Meeting Summary / Project Memory
- Add edit capability in Project Context → Meeting Summary
- All future deliverables use the edited version
- New meeting notes get merged into the updated summary

---

## Infrastructure / Performance

- Processing speed flagged by 6/10 users (one output never generated, another still "in process" at feedback time)
- Investigate: workflow optimization, parallel processing, timeout handling
- For a tool promising 50-70% time savings, slow processing directly undermines the value proposition

---

## Other Notes

- Aakriti flagged "too many tabs to fill out" — consider whether all input fields are necessary
- Prakriti noted project description field is redundant when meeting notes are already uploaded
