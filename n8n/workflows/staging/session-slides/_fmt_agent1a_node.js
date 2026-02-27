// 3.1_FMT_Blueprint — Build v2 Blueprint prompt
// v2: Merges Agent 1A (strategic) + Agent 1B (per-slide blueprints) into a single Sonnet call.
//
// Key change: Gagné/Kolb/AGES are hardcoded in slide_template (step 1+2).
// Content tagging (KB + pre-work → slides) is done in step 5.
// This call focuses on: session narrative + compact per-slide strategic direction.

const validatedInput = $('1.2_PREP_Input').first().json;
const contentOutline = $('1.5_SUB_DriveUtils').first().json;
const extractedMemory = ($('2.2_SUB_ExtractMemory').first() || {}).json || {};
const kbData = $('2.7_JS_ParseKB').first().json;
const tagData = $('2.10_JS_ParseTags').first().json;

// Read outline alignment — PRIMARY direction source
let outlineAlignment = {};
try {
  outlineAlignment = $('2.0d_JS_AlignOutline').first().json.outline_alignment || {};
} catch(e) { outlineAlignment = {}; }

// --- Gather inputs ---

const projectDetails = validatedInput.project_details || {};
const sessionConstraints = validatedInput.session_constraints || {};
const preWorkMeta = validatedInput.pre_work_metadata || {};
const defaultSlideTemplate = validatedInput.slide_template || {};
const contentTags = tagData.content_tags || {};
const additionalInstructions = sessionConstraints.additionalInstructions
  || sessionConstraints.additional_instructions || '';

// Read dynamic slide template from alignment node (Phase 2: dynamic slide count)
let totalSlides = 17;
let slideTemplate = defaultSlideTemplate;
try {
  const alignData = $('2.0d_JS_AlignOutline').first().json;
  const dynTemplate = alignData.slide_template || {};
  if (Object.keys(dynTemplate).length > 0) slideTemplate = dynTemplate;
  totalSlides = alignData.total_slides || Object.keys(slideTemplate).length || 17;
} catch(e) {
  totalSlides = Object.keys(slideTemplate).length || 17;
}

let formattedOutline = {};
try {
  const outlineNode = $('2.0_SUB_Outline').first().json;
  formattedOutline = outlineNode.formatted_outline || {};
  // If LLM returned a string, parse it
  if (typeof formattedOutline === 'string') {
    try { formattedOutline = JSON.parse(formattedOutline); } catch (e) { formattedOutline = {}; }
  }
  // Handle llm_response wrapper
  if (!formattedOutline.modules && outlineNode.llm_response) {
    const parsed = typeof outlineNode.llm_response === 'string'
      ? JSON.parse(outlineNode.llm_response) : outlineNode.llm_response;
    formattedOutline = parsed || {};
  }
} catch (e) {
  formattedOutline = {};
}
// Fallback: raw text for backward compatibility
const extractedText = contentOutline.extracted_text || contentOutline.data?.extracted_text || '';

// Filtered memory (defensive 6-key filter)
const rawMemory = extractedMemory.llm_response || {};
const allowedMemoryKeys = ['previous_sessions', 'established_frameworks', 'facilitator_preferences',
  'client_delivery_notes', 'participant_pain_points', 'real_world_situations'];
const memoryData = {};
for (const key of allowedMemoryKeys) {
  if (rawMemory[key] !== undefined) memoryData[key] = rawMemory[key];
}

const extraKeys = Object.keys(rawMemory).filter(k => !allowedMemoryKeys.includes(k));
const memoryWarning = extraKeys.length > 0
  ? `Memory extraction returned ${Object.keys(rawMemory).length} keys (expected 6). Dropped: ${extraKeys.join(', ')}`
  : null;

// KB summaries (compact — just id + title for blueprint context)
const kbResults = kbData.kb_results || [];
const kbSummary = kbResults.map(r => ({
  id: r.content_unit_id || r.id || '',
  title: r.title || '',
  type: r.content_type || ''
})).filter(r => r.id);

// Slide types with framework mappings (compact)
const slideTypes = {};
for (const [key, val] of Object.entries(slideTemplate)) {
  slideTypes[key] = {
    type: val.type,
    gagne: val.gagne || null,
    kolb: val.kolb || null,
    ages: val.ages || null
  };
}

// ----- SYSTEM PROMPT -----

const systemPrompt = `ROLE: Senior Instructional Designer at Jombay (HR L&D consulting). Design a strategic blueprint for a ${totalSlides}-slide training session.

YOU RECEIVE:
- Client context, session constraints, pre-work metadata, filtered project memory
- Content outline (from client document), KB content units, content-to-slide tag mapping
- Slide template with pre-assigned Gagné/Kolb/AGES mappings (these are FIXED — do not re-assign)

YOUR JOB:
1. Design session narrative (title, themes, objectives, audience summary, arc)
2. For each of ${totalSlides} slides, provide strategic direction: what goes on this slide and why
3. Identify which Jombay frameworks MUST appear and where
4. Flag any sensitivity concerns
5. Use outline alignment as the PRIMARY source for each slide's content_direction — the outline_excerpt tells you what the client approved for that slide

RULES:
- Gagné/Kolb/AGES assignments are FIXED in the slide template. Do NOT re-map them.
- OUTLINE ALIGNMENT is your primary input. Each slide's content_direction should directly reference its outline_excerpt. Do not invent new content when the outline provides direction.
- Content tags show which KB units and pre-work slides are relevant to each session slide. Use these to inform your direction.
- Reuse Jombay IP first (70% fit = Reused, 40-69% = Adapted, <40% = New)
- Flag gaps, conflicts, ambiguity — do NOT resolve them
- Be concise: 1-2 sentences per slide in the blueprint
- experience_anchors: REQUIRED for every slide. List 1-3 real-world situations from the pre-work data or client context that participants will recognize. Even administrative slides (Agenda, Break) should anchor to participant reality. NEVER return an empty array — always provide at least one anchor.

BLOOM'S TAXONOMY:
Learning objectives MUST be Bloom-appropriate. For each objective, specify the Bloom level.
Bloom levels (prefer Apply and above for senior cohorts):
  Remember | Understand | Apply | Analyze | Evaluate | Create

Format each objective as: { "objective": "...", "bloom_level": "Apply" }

Example:
  GOOD: { "objective": "Apply the GROW model to structure a real coaching conversation", "bloom_level": "Apply" }
  BAD:  { "objective": "Understand the GROW model", "bloom_level": "Understand" }
  (Too low for a leadership cohort — prefer Apply and above)

AUDIENCE ADAPTATION:
Seniority: ${projectDetails.seniority_of_cohort || 'Not specified'}
- Senior (Director/VP/C-suite): Strategic framing, skip basic definitions, business impact language, provocative questions. Content direction should reflect executive-level depth.
- Mid-level (Manager/Senior IC): Balance theory + application, connect to daily reality, scenario-based approaches.
- Junior (IC/New hire): Foundational scaffolding, define terms, structured exercises, more guidance and context.

Adapt your blueprint direction, key messages, and experience anchors for this audience level.

APPLICATION MOMENTS:
Identify all points where participants actively apply learning — not just formal activities.
Types: "embedded" (apply a concept mid-discussion), "formal_activity" (structured exercise),
       "commitment" (personal action planning or pledge).
Include the slide number, type, and a brief description.

EXAMPLE slide_blueprint ENTRY:
"slide_9": {
  "intent": "Introduce the core leadership model through client-relevant scenarios",
  "content_direction": "Present GROW coaching model with 3 Microland-specific application scenarios. Use comparison table showing current vs. growth approach.",
  "key_message": "Structured conversations drive better outcomes than ad-hoc problem solving",
  "experience_anchors": ["Team leads defaulting to directive style in escalations", "Manager skip-level feedback showing coaching gaps", "High-performer attrition linked to micromanagement"],
  "kb_units_to_use": ["CU_012"],
  "facilitation_design": {
    "tension_level": "Medium",
    "rationale": "Participants may resist structured model as 'too slow' — need to show speed comes from practice",
    "signal": "Defensive body language or comments like 'we don't have time for this'"
  },
  "flags": ["Pre-work slide_2_1 has low confidence on coaching readiness — hedge content"]
}

OUTPUT (JSON object with exactly 4 top-level keys):
{
  "session_overview": {
    "workshop_title": "string",
    "key_themes": ["3-5 themes"],
    "learning_objectives": [{ "objective": "measurable objective text", "bloom_level": "Apply" }],
    "audience_summary": "who they are and what they need (1-2 sentences)",
    "session_arc_narrative": "emotional and intellectual journey (2-3 sentences)",
    "application_moments": [
      { "slide": 9, "type": "embedded", "description": "Participants apply framework to a case" },
      { "slide": 12, "type": "formal_activity", "description": "Role-play exercise" },
      { "slide": 16, "type": "commitment", "description": "Write one action for next 30 days" }
    ]
  },
  "slide_blueprint": {
    "slide_1": {
      "intent": "what this slide achieves (1 sentence)",
      "content_direction": "what to put on this slide (1-2 sentences)",
      "key_message": "the one thing the participant should take away",
      "experience_anchors": ["real-world situation to reference"],
      "kb_units_to_use": ["CU_id"],
      "facilitation_design": {
        "tension_level": "High | Medium | Low",
        "rationale": "Why this slide needs tension or safety (1 sentence)",
        "signal": "What participant behaviour signals it's time to ease off (1 sentence)"
      },
      "flags": ["any concerns — gaps, conflicts, sensitivity"]
    },
    "slide_2": { ... },
    ...
    "slide_${totalSlides}": { ... }
  },
  "mandatory_jombay_frameworks": [
    { "framework_name": "string", "target_slides": [9, 12], "why": "string" }
  ],
  "sensitivity_log": [
    { "slide_number": 9, "concern": "string", "action": "string" }
  ]
}

IMPORTANT:
- Return EXACTLY 4 keys: session_overview, slide_blueprint, mandatory_jombay_frameworks, sensitivity_log
- slide_blueprint must have entries for ALL ${totalSlides} slides (slide_1 through slide_${totalSlides})
- Do NOT wrap in a container object. Return the JSON directly.
- session_overview MUST include session_arc_narrative: a 3-5 sentence description of how the session flows from opening to closing, describing the emotional and cognitive journey.${additionalInstructions ? '\n\nUSER GUIDELINES:\n' + additionalInstructions + '\nFollow these unless they conflict with the session outline (outline takes precedence).' : ''}`;

// ----- USER PROMPT -----

const userPrompt = 'Design the strategic blueprint for this training session.\n\n'
  + '=== CLIENT CONTEXT ===\n'
  + JSON.stringify({
      client_name: validatedInput.client_name,
      industry: projectDetails.industry || '',
      seniority_of_cohort: projectDetails.seniority_of_cohort || '',
      program_name: projectDetails.name || '',
      content_type: projectDetails.content_type || '',
      program_type: projectDetails.program_type || '',
      client_objective: projectDetails.client_objective || '',
      background: projectDetails.background || '',
      facilitators_name: projectDetails.facilitators_name || ''
    }) + '\n\n'
  + '=== SESSION CONSTRAINTS ===\n'
  + 'Session Type: ' + (sessionConstraints.sessionType || sessionConstraints.session_type || 'Not specified') + '\n'
  + 'Total Duration: ' + (sessionConstraints.totalDuration || sessionConstraints.total_duration || 'Not specified') + '\n'
  + 'Additional Instructions: ' + (sessionConstraints.additionalInstructions || sessionConstraints.additional_instructions || 'None') + '\n'
  + '\nIMPORTANT: Design the session arc, activity depth, and timing based on session type and total duration.\n'
  + '- Virtual sessions: shorter activities, more frequent breaks, digital-first engagement\n'
  + '- In-person sessions: longer activities, physical energizers, group work emphasis\n'
  + '- Duration drives depth: half-day = surface coverage, full-day = deep dives, multi-day = full cycle\n\n'
  + '=== SLIDE TEMPLATE (Gagné/Kolb/AGES are FIXED — do not re-assign) ===\n'
  + JSON.stringify(slideTypes) + '\n\n'
  + '=== OUTLINE ALIGNMENT (PRIMARY — outline content dictates slide content) ===\n'
  + JSON.stringify(outlineAlignment) + '\n\n'
  + 'IMPORTANT: The outline represents the client-approved content plan. Your blueprint MUST direct\n'
  + 'each slide to deliver its aligned outline content. Do NOT invent alternative narratives when\n'
  + 'outline evidence exists. The outline_excerpt for each slide is the ground truth for what that\n'
  + 'slide should contain. For slides with has_outline_evidence: false, use standard content for\n'
  + 'that slide type.\n\n'
  + '=== CONTENT TAGS (which KB units and pre-work slides map to each session slide) ===\n'
  + JSON.stringify(contentTags) + '\n\n'
  + '=== PRE-WORK METADATA (slide summaries — full content will be provided to content generators) ===\n'
  + JSON.stringify(preWorkMeta) + '\n\n'
  + '=== KB CONTENT UNITS (summaries) ===\n'
  + JSON.stringify(kbSummary) + '\n\n'
  + '=== FILTERED PROJECT MEMORY ===\n'
  + JSON.stringify(memoryData) + '\n\n'
  + '=== CONTENT OUTLINE (structured from client document) ===\n'
  + (Object.keys(formattedOutline).length > 0
    ? JSON.stringify(formattedOutline)
    : (extractedText || 'No content outline available.'));

return [{ json: {
  system_prompt: systemPrompt,
  prompt: userPrompt,
  model: 'global.anthropic.claude-sonnet-4-6',
  node_name: 'Blueprint',
  memory_validation: {
    expected_keys: 6,
    received_keys: Object.keys(rawMemory).length,
    extra_keys_dropped: extraKeys,
    warning: memoryWarning
  },
  memory_id: validatedInput.memory_id,
  knowledge_base_id: validatedInput.knowledge_base_id,
  workflow_session_id: validatedInput.workflow_session_id,
  workflow_id: validatedInput.workflow_id,
  project_id: validatedInput.project_id,
  client_id: validatedInput.client_id
}}];
