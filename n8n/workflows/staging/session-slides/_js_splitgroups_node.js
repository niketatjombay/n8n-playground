// ===================================================================
// 4.1_JS_SplitGroups — GROUP DISTRIBUTOR
// ===================================================================
// Splits all pipeline data into 7 group-specific payloads for parallel
// content generation. Each group receives ONLY its relevant slice of:
//   - Blueprint entries (strategic direction per slide)
//   - Slide template (Gagné/Kolb/AGES — deterministic)
//   - Tagged pre-work slides (from content tagging step)
//   - Tagged KB content units (from content tagging step)
//
// Input:  Blueprint + validated input + content tags + KB results
// Output: { groups: { group_1..group_7 }, common_context, client_context,
//           session_constraints, agent2_system_prompt }
//
// v2 optimization: Uses content tags for targeted distribution.
// v1 sent ALL 73K chars of pre-work to ALL 7 groups (511K total).
// v2 sends each group only its tagged subset (est. 74K total).
// ===================================================================

const agent1 = $input.first().json.agent1_output;
const validatedInput = $('1.2_PREP_Input').first().json;
const tagData = $('2.10_JS_ParseTags').first().json;
const kbResults = $('2.7_JS_ParseKB').first().json.kb_results || [];

// Read outline alignment for per-group distribution
let outlineAlignment = {};
try {
  outlineAlignment = $('2.0d_JS_AlignOutline').first().json.outline_alignment || {};
} catch(e) { outlineAlignment = {}; }

// Content outline (structured modules from 2.0_SUB_Outline)
let contentOutline = {};
try {
  const outlineNode = $('2.0_SUB_Outline').first().json;
  contentOutline = outlineNode.formatted_outline || {};
  if (typeof contentOutline === 'string') {
    try { contentOutline = JSON.parse(contentOutline); } catch(e) { contentOutline = {}; }
  }
  if (!contentOutline.modules && outlineNode.llm_response) {
    contentOutline = typeof outlineNode.llm_response === 'string'
      ? JSON.parse(outlineNode.llm_response) : outlineNode.llm_response;
  }
} catch(e) { contentOutline = {}; }

const blueprint = agent1.slide_blueprint || {};
const contentTags = tagData.content_tags || {};
const defaultSlideTemplate = validatedInput.slide_template || {};

// Read dynamic slide template from alignment node (Phase 2: dynamic slide count)
let dynamicTemplate = {};
let totalSlides = 17;
try {
  const alignData = $('2.0d_JS_AlignOutline').first().json;
  dynamicTemplate = alignData.slide_template || {};
  totalSlides = alignData.total_slides || Object.keys(dynamicTemplate).length || 17;
} catch(e) {}
// Fall back to PREP_Input template if dynamic is empty
const slideTemplate = Object.keys(dynamicTemplate).length > 0 ? dynamicTemplate : defaultSlideTemplate;
if (Object.keys(dynamicTemplate).length === 0) totalSlides = Object.keys(slideTemplate).length || 17;

// Full pre-work slides (keyed by slide_id like "slide_1_1", "slide_2_3", etc.)
const preWorkSlides = validatedInput.pre_work_slides || {};

// Index KB results by content_unit_id for O(1) lookup
const kbMap = {};
for (const unit of kbResults) {
  const id = unit.content_unit_id || unit.id;
  if (id) kbMap[id] = unit;
}

// Dynamic group distribution — evenly across 7 groups
const groupNames = [
  'Title & Introduction',
  'Setup & Framing',
  'Context & Objectives',
  'Core Content',
  'Engagement & Application',
  'Transition & Reflection',
  'Action & Closing'
];
const base = Math.floor(totalSlides / 7);
const remainder = totalSlides % 7;
const sizes = Array(7).fill(base);
// Give remainder to middle groups (content-heavy) first
const priority = [3, 4, 5, 2, 1, 6, 0];
for (let i = 0; i < remainder; i++) {
  sizes[priority[i]]++;
}
let slideIdx = 1;
const groupDefs = groupNames.map((name, i) => {
  const slides = [];
  const types = [];
  for (let j = 0; j < sizes[i]; j++) {
    const key = 'slide_' + slideIdx;
    slides.push(key);
    types.push((slideTemplate[key] || {}).type || '');
    slideIdx++;
  }
  return { key: 'group_' + (i + 1), name, slides, types: types.join(', ') };
});

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

  // Per-slide KB mapping for explicit injection in content gen prompt
  const perSlideKB = {};
  for (const slideKey of def.slides) {
    const tags = contentTags[slideKey] || {};
    perSlideKB[slideKey] = (tags.kb_units || [])
      .map(id => kbMap[id])
      .filter(Boolean);
  }

    // Outline alignment for this group's slides
    const groupAlignment = {};
    for (const slideKey of def.slides) {
      groupAlignment[slideKey] = outlineAlignment[slideKey] || { has_outline_evidence: false, outline_section: null, outline_excerpt: null, alignment_rationale: '' };
    }

  groups[def.key] = {
    name: def.name,
    slides: def.slides,
    slide_types: def.types,
    blueprints: groupBlueprints,
    slide_template: groupTemplate,
    tagged_pre_work: groupPreWork,
    tagged_kb: groupKB,
    per_slide_kb: perSlideKB,
    outline_alignment: groupAlignment
  };
}

// Common context (shared across all groups)
const commonContext = {
  session_overview: agent1.session_overview || {},
  mandatory_jombay_frameworks: agent1.mandatory_jombay_frameworks || [],
  sensitivity_log: agent1.sensitivity_log || [],
  content_outline: contentOutline
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

=== CONTENT OUTLINE RULES ===
- The content outline defines the client's intended module structure, topics, and frameworks
- Use it to ensure your slide content aligns with the correct module/topic from the outline
- When the outline specifies particular frameworks or models for a topic, reference them
- If outline content conflicts with blueprint direction, follow the blueprint (it incorporates the outline already)

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
    "facilitation_tips": ["Scannable delivery tips for the facilitator (1-3 tips, max 15 words each)"],
    "modality_notes": {
      "virtual": "What changes for online delivery (1 sentence)",
      "in_person": "What changes for in-person delivery (1 sentence)"
    },
    "provenance": "New | Reused | Adapted",
    "provenance_source": "CU_id or null",
    "provenance_rationale": "Why this provenance decision — e.g. 'GROW model from CU_012 maps 80% to this slide's coaching objective'",
    "reviewer_flags": [{ "flag": "string", "reason": "string" }]
  }
}

EXAMPLE OUTPUT ENTRY:
"slide_9": {
  "slide_title": "The GROW Model: Your Coaching Compass",
  "headline": "Four Questions That Transform Every Conversation",
  "subtext": "From reactive problem-solving to structured coaching in 15 minutes",
  "bullets": ["Goal: What outcome do you want?", "Reality: Where are you now?", "Options: What could you try?", "Will: What will you commit to?"],
  "visual_guidance": "GROW model as a compass diagram with four quadrants, each showing one question and a Microland scenario example",
  "activity": { "has_activity": false, "instructions": null, "duration_minutes": null, "debrief_questions": [] },
  "facilitation_tips": ["Watch for participants defaulting to 'tell' mode — redirect to asking", "Pair participants who show different coaching styles from Echo"],
  "modality_notes": { "virtual": "Use breakout rooms for paired GROW practice with timer", "in_person": "Arrange chairs face-to-face for coaching pairs" },
  "provenance": "Reused",
  "provenance_source": "CU_012",
  "provenance_rationale": "GROW model from CU_012 maps 85% to this slide's coaching objective — only adaptation needed is Microland scenario examples",
  "reviewer_flags": [{ "flag": "Pre-work confidence low on coaching readiness", "reason": "Hedge language: 'building toward' not 'mastering'" }]
}

IMPORTANT:
- Return one entry per assigned slide (use slide_1, slide_2, etc. as keys)
- Do NOT include facilitator scripts — those are generated separately
- facilitation_tips are scannable tips (not the full script) — e.g. "Watch for anchoring to old process"
- modality_notes are brief slide-level adaptations for delivery mode
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
