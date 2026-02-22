// 7.3_JS_PrepScripts — Prepare facilitator script generation for 7 parallel groups
// Input: QC review output (from Agent 3) — not directly used but triggers execution order
// Reads: finalized content (6.1_JS_Merge), blueprint (3.3_JS_ParseAgent1A),
//         content tags (2.10_JS_ParseTags), pre-work slides (1.2_PREP_Input)

const validatedInput = $('1.2_PREP_Input').first().json;
const mergedContent = $('6.1_JS_Merge').first().json;
const agent1 = $('3.3_JS_ParseAgent1A').first().json.agent1_output;
const tagData = $('2.10_JS_ParseTags').first().json;
const qcReview = $input.first().json;
const qcData = qcReview.llm_response || qcReview;

const slideSpec = mergedContent.slide_spec || {};
const blueprint = agent1.slide_blueprint || {};
const contentTags = tagData.content_tags || {};
const slideTemplate = validatedInput.slide_template || {};
const preWorkSlides = validatedInput.pre_work_slides || {};

// Index QC flags per slide
const qcFlags = {};
const slideReviews = qcData.slide_reviews || {};
for (const [key, review] of Object.entries(slideReviews)) {
  const slideKey = key.startsWith('slide_') ? key : 'slide_' + key;
  if (review.flags && review.flags.length > 0) {
    qcFlags[slideKey] = review.flags;
  }
}

// Same 7 group definitions as step 7
const groupDefs = [
  { key: 'group_1', name: 'Title & Introduction', slides: ['slide_1','slide_2','slide_3'], types: 'Session title, Jombay intro, Trainer intro' },
  { key: 'group_2', name: 'Setup & Framing', slides: ['slide_4','slide_5'], types: 'Agenda, Working Agreement' },
  { key: 'group_3', name: 'Context & Objectives', slides: ['slide_6','slide_7'], types: 'Program overview, Objectives' },
  { key: 'group_4', name: 'Core Content', slides: ['slide_8','slide_9','slide_10'], types: 'Module breaker, Content (AC), Quote' },
  { key: 'group_5', name: 'Engagement & Application', slides: ['slide_11','slide_12'], types: 'Discussion/Reflection (RO), Activity (CE)' },
  { key: 'group_6', name: 'Transition & Reflection', slides: ['slide_13','slide_14','slide_15'], types: 'Break, Questions, Feedback' },
  { key: 'group_7', name: 'Action & Closing', slides: ['slide_16','slide_17'], types: 'Call to Action (AE), Closing' }
];

// Build per-group data with targeted pre-work (same tagging as step 7)
const groups = {};
for (const def of groupDefs) {
  const groupContent = {};
  const groupBlueprint = {};
  const groupTemplate = {};
  const groupQCFlags = {};
  const groupPreWork = {};

  for (const slideKey of def.slides) {
    groupContent[slideKey] = slideSpec[slideKey] || {};
    groupBlueprint[slideKey] = blueprint[slideKey] || {};
    groupTemplate[slideKey] = slideTemplate[slideKey] || {};
    if (qcFlags[slideKey]) groupQCFlags[slideKey] = qcFlags[slideKey];

    // Targeted pre-work from content tags
    const tags = contentTags[slideKey] || {};
    for (const pwId of (tags.pre_work_slides || [])) {
      if (preWorkSlides[pwId] && !groupPreWork[pwId]) {
        groupPreWork[pwId] = preWorkSlides[pwId];
      }
    }
  }

  groups[def.key] = {
    name: def.name,
    slides: def.slides,
    slide_types: def.types,
    content: groupContent,
    blueprint: groupBlueprint,
    slide_template: groupTemplate,
    qc_flags: groupQCFlags,
    tagged_pre_work: groupPreWork
  };
}

// Script generation system prompt
const scriptSystemPrompt = `ROLE: Expert facilitator coach at Jombay (HR L&D consulting). You write facilitator delivery scripts for training sessions.

You receive: finalized slide content, strategic blueprint, QC reviewer flags, slide template (Gagné/Kolb/AGES), and tagged pre-work data.

YOUR JOB: Write facilitator scripts and delivery notes for each assigned slide. A new facilitator reading your script without seeing the slides must be able to run the session.

=== FACILITATOR SCRIPT RULES ===
- Near-verbatim, medium verbosity — facilitator reads and delivers
- STANDALONE — must work without slides visible
- Include: opening statement, key talking points, transitions to next slide
- Include: timing cues, engagement prompts, energy direction
- Activity slides: exact step-by-step with timing, debrief questions, expected outcomes
- Address any QC flags in your script (the reviewer flagged these for attention)

=== MODALITY ADAPTATIONS ===
For each slide, provide specific adaptations:
- Virtual: what changes for online delivery (breakout rooms, chat, polling, screen share)
- In-person: what changes for physical delivery (room setup, movement, props, whiteboard)

=== ENERGY & TONE ===
Guide the facilitator on:
- Energy level: high-energy, calm, reflective, playful, serious
- Tone shifts: where to speed up, slow down, pause for effect
- Engagement cues: when to ask questions, when to listen, when to direct

=== QUALITY BAR ===
- Scripts must be client-specific (reference their context, challenges, industry)
- Ground scripts in pre-work findings where tagged
- Scripts must feel natural — not robotic or generic
- Transitions between slides must flow logically

=== OUTPUT SCHEMA ===
Return a JSON object with one key per slide:
{
  "slide_N": {
    "facilitator_script": "Near-verbatim delivery script (150-400 words). Include opening, talking points, transitions.",
    "visual_guidance": "What visual/diagram/image to show or draw (1-2 sentences)",
    "energy_note": "Facilitator energy and tone direction (1 sentence)",
    "modality_notes": {
      "virtual": "Specific virtual delivery adaptations (1-2 sentences)",
      "in_person": "Specific in-person delivery adaptations (1-2 sentences)"
    },
    "debrief_questions": ["For discussion/activity slides only — 2-3 probing questions"],
    "activity_run_of_show": "Step-by-step activity instructions with timing (only for activity slides, null otherwise)"
  }
}

IMPORTANT:
- Return one entry per assigned slide
- facilitator_script is REQUIRED for every slide
- debrief_questions: only for slides 11, 12, 14 (discussion/activity/questions types)
- activity_run_of_show: only for slide 12 (activity type)
- Do NOT repeat on-slide content — the script is what the facilitator SAYS, not what's on the slide`;

return [{ json: {
  groups: groups,
  session_overview: agent1.session_overview || {},
  client_context: {
    client_name: validatedInput.client_name,
    industry: validatedInput.project_details.industry || '',
    seniority_of_cohort: validatedInput.project_details.seniority_of_cohort || '',
    program_name: validatedInput.project_details.name || ''
  },
  session_constraints: validatedInput.session_constraints,
  script_system_prompt: scriptSystemPrompt,
  memory_id: validatedInput.memory_id,
  knowledge_base_id: validatedInput.knowledge_base_id,
  workflow_session_id: validatedInput.workflow_session_id,
  workflow_id: validatedInput.workflow_id,
  project_id: validatedInput.project_id,
  client_id: validatedInput.client_id
}}];
