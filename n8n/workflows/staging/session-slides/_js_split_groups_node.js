// 4.1_JS_SplitGroups — v2: Targeted content distribution
// Key change: Uses content tags (step 5) to send ONLY relevant pre-work + KB per group.
// v1 sent ALL 73K chars of pre-work to ALL 7 groups (511K total).
// v2 sends each group only its tagged subset (est. 74K total).

const agent1 = $input.first().json.agent1_output;
const validatedInput = $('1.2_PREP_Input').first().json;
const tagData = $('2.10_JS_ParseTags').first().json;
const kbResults = $('2.7_JS_ParseKB').first().json.kb_results || [];

const blueprint = agent1.slide_blueprint || {};
const contentTags = tagData.content_tags || {};
const slideTemplate = validatedInput.slide_template || {};

// Full pre-work slides (keyed by slide_id like "slide_1_1", "slide_2_3", etc.)
const preWorkSlides = validatedInput.pre_work_slides || {};

// Index KB results by content_unit_id for O(1) lookup
const kbMap = {};
for (const unit of kbResults) {
  const id = unit.content_unit_id || unit.id;
  if (id) kbMap[id] = unit;
}

// Group definitions — same 7 groups as v1
const groupDefs = [
  { key: 'group_1', name: 'Title & Introduction', slides: ['slide_1','slide_2','slide_3'], types: 'Session title, Jombay intro, Trainer intro' },
  { key: 'group_2', name: 'Setup & Framing', slides: ['slide_4','slide_5'], types: 'Agenda, Working Agreement' },
  { key: 'group_3', name: 'Context & Objectives', slides: ['slide_6','slide_7'], types: 'Program overview, Objectives' },
  { key: 'group_4', name: 'Core Content', slides: ['slide_8','slide_9','slide_10'], types: 'Module breaker, Content (AC), Quote' },
  { key: 'group_5', name: 'Engagement & Application', slides: ['slide_11','slide_12'], types: 'Discussion/Reflection (RO), Activity (CE)' },
  { key: 'group_6', name: 'Transition & Reflection', slides: ['slide_13','slide_14','slide_15'], types: 'Break, Questions, Feedback' },
  { key: 'group_7', name: 'Action & Closing', slides: ['slide_16','slide_17'], types: 'Call to Action (AE), Closing' }
];

// Build per-group data with TARGETED content distribution
const groups = {};
for (const def of groupDefs) {
  // Blueprint entries for this group's slides
  const groupBlueprints = {};
  for (const slideKey of def.slides) {
    groupBlueprints[slideKey] = blueprint[slideKey] || {};
  }

  // Slide template entries (Gagné/Kolb/AGES — deterministic)
  const groupTemplate = {};
  for (const slideKey of def.slides) {
    groupTemplate[slideKey] = slideTemplate[slideKey] || {};
  }

  // Targeted pre-work: only slides tagged for this group's session slides
  const groupPreWork = {};
  const groupKB = [];
  const seenKB = {};

  for (const slideKey of def.slides) {
    const tags = contentTags[slideKey] || {};

    // Gather tagged pre-work slides (full content)
    for (const pwId of (tags.pre_work_slides || [])) {
      if (preWorkSlides[pwId] && !groupPreWork[pwId]) {
        groupPreWork[pwId] = preWorkSlides[pwId];
      }
    }

    // Gather tagged KB units (full content)
    for (const kbId of (tags.kb_units || [])) {
      if (kbMap[kbId] && !seenKB[kbId]) {
        groupKB.push(kbMap[kbId]);
        seenKB[kbId] = true;
      }
    }
  }

  groups[def.key] = {
    name: def.name,
    slides: def.slides,
    slide_types: def.types,
    blueprints: groupBlueprints,
    slide_template: groupTemplate,
    tagged_pre_work: groupPreWork,
    tagged_kb: groupKB
  };
}

// Common context (shared across all groups)
const commonContext = {
  session_overview: agent1.session_overview || {},
  mandatory_jombay_frameworks: agent1.mandatory_jombay_frameworks || [],
  sensitivity_log: agent1.sensitivity_log || []
};

// Agent 2 system prompt — v2: CONTENT ONLY (no facilitator scripts)
const agent2SystemPrompt = `ROLE: Expert content designer at Jombay (HR L&D consulting). Generate on-slide content for training session slides.

You receive: slide blueprints (strategic direction), slide template (Gagné/Kolb/AGES — FIXED), tagged pre-work data, tagged KB content units, client context.

YOUR JOB: Generate compelling, client-specific slide content for your assigned slides.

=== SLIDE TEMPLATE REFERENCE ===
Each slide has a fixed type with pre-assigned Gagné event, Kolb stage, and AGES function. These are provided in the slide_template — reference them but do NOT re-assign.

=== PRE-WORK DATA RULES ===
- bullets and slide_notes are PRIMARY content source — ground your content in these
- walkthrough_tip sets key message tone
- gaps/conflicts/ambiguity → MUST appear as reviewer_flags
- LOW confidence data → HEDGE the content, don't assert
- If no pre-work is tagged for your slides, use blueprint direction + KB content

=== ON-SLIDE CONTENT RULES ===
- LEAN and VISUAL-FIRST — slides are prompts, not scripts
- Headlines: punchy, memorable, client-specific (not generic)
- Subtext: one supporting line that adds context
- Bullets: max 4 per slide, each under 12 words
- Visual guidance: describe what visual/diagram/image to show
- NO speaker notes on participant slides

=== PROVENANCE RULE ===
For every slide, apply the 70% fit rule:
- >=70% fit with KB content → "Reused" with source reference
- 40-69% fit → "Adapted" with source and what needs changing
- <40% fit → "New" with rationale

=== QUALITY BAR ===
WISE (grounded in theory + context), WITTY (energy + personality), RELEVANT (client-specific)

=== OPERATING RULES ===
1. Follow the blueprint direction for each slide
2. Reference Gagné/Kolb/AGES from slide_template (they're fixed, not your decision)
3. Reuse Jombay KB content first (70% rule)
4. Flag pre-work gaps, conflicts, ambiguity — do NOT resolve them
5. Flag sensitivity concerns — do NOT ignore them
6. Activity slides: include step-by-step instructions + duration
7. Be concise — content goes ON slides, not in notes

=== OUTPUT SCHEMA ===
Return a JSON object with one key per slide:
{
  "slide_N": {
    "slide_title": "string",
    "headline": "punchy, memorable headline",
    "subtext": "supporting context line",
    "bullets": ["max 4 bullets", "each under 12 words"],
    "visual_guidance": "describe the visual element for this slide",
    "activity": {
      "has_activity": false,
      "instructions": null,
      "duration_minutes": null,
      "debrief_questions": []
    },
    "provenance": "New | Reused | Adapted",
    "provenance_source": "CU_id or null",
    "reviewer_flags": [{ "flag": "string", "reason": "string" }]
  }
}

IMPORTANT:
- Return one entry per assigned slide (use slide_1, slide_2, etc. as keys)
- Do NOT include facilitator scripts — those are generated separately
- Do NOT include modality notes — those are generated separately
- Activity slides (type 12) MUST have instructions and duration_minutes
- Every slide MUST have a headline and at least 1 bullet`;

return [{ json: {
  groups: groups,
  common_context: commonContext,
  client_context: {
    client_name: validatedInput.client_name,
    industry: validatedInput.project_details.industry || '',
    seniority_of_cohort: validatedInput.project_details.seniority_of_cohort || '',
    program_name: validatedInput.project_details.name || '',
    content_type: validatedInput.project_details.content_type || '',
    program_type: validatedInput.project_details.program_type || ''
  },
  session_constraints: validatedInput.session_constraints,
  agent2_system_prompt: agent2SystemPrompt,
  memory_id: validatedInput.memory_id,
  knowledge_base_id: validatedInput.knowledge_base_id,
  workflow_session_id: validatedInput.workflow_session_id,
  workflow_id: validatedInput.workflow_id,
  project_id: validatedInput.project_id,
  client_id: validatedInput.client_id
}}];
