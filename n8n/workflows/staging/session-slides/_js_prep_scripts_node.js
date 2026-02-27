// 7.3_JS_PrepScripts — Prepare facilitator script generation for 7 parallel groups
// Input: QC review output (from 7.1h_JS_NormQC) — not directly used but triggers execution order
// Reads: finalized content (6.4_JS_NormContent), blueprint (3.6_JS_NormBP),
//         content tags (2.10_JS_ParseTags), pre-work slides (1.2_PREP_Input)

const validatedInput = $('1.2_PREP_Input').first().json;
const mergedContent = $('6.4_JS_NormContent').first().json;
const agent1 = $('3.6_JS_NormBP').first().json.agent1_output;
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

// Read dynamic group definitions from SplitGroups (v3)
const splitGroupsData = $('4.1_JS_SplitGroups').first().json;
const dynamicGroups = splitGroupsData.groups || {};

const groupDefs = [];
for (let i = 1; i <= 7; i++) {
  const groupKey = 'group_' + i;
  const group = dynamicGroups[groupKey];
  if (group && group.slides && group.slides.length > 0) {
    groupDefs.push({
      key: groupKey,
      name: group.name,
      slides: group.slides,
      types: group.slide_types || group.slides.map(k => (slideTemplate[k] || {}).type || '').join(', ')
    });
  } else {
    groupDefs.push({
      key: groupKey,
      name: 'Empty',
      slides: [],
      types: ''
    });
  }
}

// Build per-group data with targeted pre-work (same tagging as step 7)
const groups = {};
for (const def of groupDefs) {
  if (def.slides.length === 0) {
    groups[def.key] = { name: 'Empty', slides: [], slide_types: '', content: {}, blueprint: {}, slide_template: {}, qc_flags: {}, tagged_pre_work: {} };
    continue;
  }

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
- Near-verbatim — facilitator reads and delivers
- STANDALONE — must work without slides visible
- Include: opening statement, key talking points, transitions to next slide
- Include: timing cues, engagement prompts, energy direction
- Activity slides: exact step-by-step with timing, debrief questions, expected outcomes
- Address any QC flags in your script (the reviewer flagged these for attention)

=== SCRIPT LENGTH BY SLIDE TYPE ===
- Title / Break / Closing slides: 150-200 words (brief, focused)
- Content / Discussion / Quote slides: 250-350 words (detailed delivery)
- Activity slides: 350-400 words (step-by-step instructions required)

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
    "energy_note": "REQUIRED. Facilitator energy and tone direction (1 sentence). Example: 'Start reflective and quiet, build energy through the reveal'",
    "modality_notes": {
      "virtual": "Specific virtual delivery adaptations (1-2 sentences)",
      "in_person": "Specific in-person delivery adaptations (1-2 sentences)"
    },
    "debrief_questions": ["REQUIRED for discussion/activity/questions slides (types 11,12,14). 2-3 probing debrief questions. Empty array [] for other slides."],
    "activity_run_of_show": "REQUIRED for activity slides (type 12). Step-by-step with timing: 'Step 1 (5 min): ... Step 2 (8 min): ...' Null for non-activity slides.",
    "estimated_duration_minutes": "REQUIRED. Integer. Estimated facilitator delivery time for this slide.",
    "optional_paths": [
      { "trigger": "What participant behaviour triggers an alternate path",
        "alternative": "What the facilitator should do instead" }
    ]
  }
}

CRITICAL FIELD RULES:
- energy_note MUST be a non-empty string for every slide (even "Neutral, conversational pace" is fine)
- debrief_questions MUST be a non-empty array for slides of type Discussion/Reflection, Activity, Questions
- activity_run_of_show MUST be a non-empty string with step-by-step timing for Activity slides
- estimated_duration_minutes MUST be an integer for every slide
- Do NOT embed debrief questions or activity run-of-show inside the facilitator_script text — put them in their dedicated fields

IMPORTANT: Return FLAT JSON per slide. Do NOT nest fields inside facilitator_script — facilitator_script is a STRING (the verbal script), not an object. All fields (energy_note, debrief_questions, estimated_duration_minutes, etc.) go at the TOP LEVEL of each slide entry.

EXAMPLE OUTPUT — Content slide (slide 9):
"slide_9": {
  "facilitator_script": "Let's talk about a tool that will change how you have every important conversation from this point forward. [PAUSE] How many of you have had a team member come to you with a problem, and your first instinct was to solve it for them? [SHOW OF HANDS] That instinct served you well as individual contributors. But as leaders, solving problems FOR your team actually makes them more dependent on you. The GROW model gives you a structured alternative. Four questions. That's it. Goal: What do you actually want to achieve here? Reality: Where are you right now? Options: What could you try? Will: What will you commit to doing? [POINT TO VISUAL] In your pre-reads, some of you flagged that structured models feel slow. Here's the truth: the first three conversations feel slow. By the fifth, it's faster than your old approach — because your team starts answering these questions before you ask them.",
  "visual_guidance": "Point to GROW compass diagram as each quadrant is introduced",
  "energy_note": "Start conversational and warm, build energy through the reveal of the four questions, then slow down for the 'truth' moment",
  "estimated_duration_minutes": 5,
  "modality_notes": { "virtual": "Use poll for show-of-hands question, share GROW visual via screen", "in_person": "Move to the front, use physical gestures for each GROW quadrant" },
  "debrief_questions": [],
  "activity_run_of_show": null,
  "optional_paths": [{ "trigger": "Group is skeptical about structured models", "alternative": "Ask 'Who has tried coaching without a framework? What happened?' — let peer stories build the case" }]
}

EXAMPLE OUTPUT — Activity slide (slide 12):
"slide_12": {
  "facilitator_script": "This is where you move from concepts to application. You'll rotate through four stations, each one targeting a different leadership challenge your teams actually face. At each station, you'll find a scenario card and a coaching framework reference. Your job: craft a 3-minute coaching conversation using what we've covered. [PAUSE] I want you to actually say the words out loud — not just think about what you'd say. Your partner will play the team member. After each round, give each other one piece of specific feedback. Ready? Let's move to your first station.",
  "visual_guidance": "Four station icons with rotation arrows and timer display",
  "energy_note": "High energy, facilitative — keep groups moving and on-task. Use a visible timer.",
  "estimated_duration_minutes": 35,
  "modality_notes": { "virtual": "Use breakout rooms as stations with shared whiteboards", "in_person": "Set up 4 physical stations with flip charts and scenario cards" },
  "debrief_questions": ["What patterns did you notice across the different scenarios?", "Which coaching question felt most unnatural — and why?", "What commitment feels most actionable for your team this week?"],
  "activity_run_of_show": "0-2min: Instructions and station assignments | 2-10min: Station 1 | 10-18min: Station 2 | 18-26min: Station 3 | 26-34min: Station 4 | 34-35min: Return to seats",
  "optional_paths": [{ "trigger": "One station finishes early", "alternative": "Give them a bonus challenge card with a harder scenario" }]
}

IMPORTANT:
- Return one entry per assigned slide
- facilitator_script is REQUIRED for every slide
- energy_note is REQUIRED for every slide — never leave empty
- estimated_duration_minutes is REQUIRED for every slide — integer value
- debrief_questions: REQUIRED non-empty array for slides 11, 12, 14 (discussion/activity/questions types)
- activity_run_of_show: REQUIRED for slide 12 (activity type) with step-by-step timing
- Do NOT repeat on-slide content — the script is what the facilitator SAYS, not what's on the slide

=== SESSION TYPE ===
Delivery format: ${validatedInput.session_constraints?.sessionType || validatedInput.session_constraints?.session_type || 'Not specified'}
Total duration: ${validatedInput.session_constraints?.totalDuration || validatedInput.session_constraints?.total_duration || 'Not specified'}
- Virtual: breakout rooms, screen sharing, chat polls, shorter pacing
- In-person: physical movement, group formations, props, whiteboard
Adapt all scripts and modality_notes to this session type.

${(validatedInput.session_constraints?.additionalInstructions || validatedInput.session_constraints?.additional_instructions) ? '=== USER GUIDELINES ===\n' + (validatedInput.session_constraints.additionalInstructions || validatedInput.session_constraints.additional_instructions) + '\nFollow these in your scripts unless they conflict with the session outline.' : ''}`;

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
