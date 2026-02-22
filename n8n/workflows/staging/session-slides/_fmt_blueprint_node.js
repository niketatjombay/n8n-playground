// 3.1_FMT_Blueprint — Build v2 Blueprint prompt
// v2: Merges Agent 1A (strategic) + Agent 1B (per-slide blueprints) into a single Sonnet call.
//
// Key change: Gagné/Kolb/AGES are hardcoded in slide_template (step 1+2).
// Content tagging (KB + pre-work → slides) is done in step 5.
// This call focuses on: session narrative + compact per-slide strategic direction.

const validatedInput = $('1.2_PREP_Input').first().json;
const contentOutline = $('1.5_SUB_DriveUtils').first().json;
const extractedMemory = $('2.2_SUB_ExtractMemory').first().json;
const kbData = $('2.7_JS_ParseKB').first().json;
const tagData = $('2.10_JS_ParseTags').first().json;

// --- Gather inputs ---

const projectDetails = validatedInput.project_details || {};
const sessionConstraints = validatedInput.session_constraints || {};
const preWorkMeta = validatedInput.pre_work_metadata || {};
const slideTemplate = validatedInput.slide_template || {};
const contentTags = tagData.content_tags || {};

const extractedText = contentOutline.extracted_text || contentOutline.data?.extracted_text || '';

// Filtered memory (defensive 6-key filter)
const rawMemory = extractedMemory.llm_response || {};
const allowedMemoryKeys = ['previous_sessions', 'established_frameworks', 'facilitator_preferences',
  'client_delivery_notes', 'participant_pain_points', 'real_world_situations'];
const memoryData = {};
for (const key of allowedMemoryKeys) {
  if (rawMemory[key] !== undefined) memoryData[key] = rawMemory[key];
}

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

const systemPrompt = `ROLE: Senior Instructional Designer at Jombay (HR L&D consulting). Design a strategic blueprint for a 17-slide training session.

YOU RECEIVE:
- Client context, session constraints, pre-work metadata, filtered project memory
- Content outline (from client document), KB content units, content-to-slide tag mapping
- Slide template with pre-assigned Gagné/Kolb/AGES mappings (these are FIXED — do not re-assign)

YOUR JOB:
1. Design session narrative (title, themes, objectives, audience summary, arc)
2. For each of 17 slides, provide strategic direction: what goes on this slide and why
3. Identify which Jombay frameworks MUST appear and where
4. Flag any sensitivity concerns

RULES:
- Gagné/Kolb/AGES assignments are FIXED in the slide template. Do NOT re-map them.
- Content tags show which KB units and pre-work slides are relevant to each session slide. Use these to inform your direction.
- Reuse Jombay IP first (70% fit = Reused, 40-69% = Adapted, <40% = New)
- Flag gaps, conflicts, ambiguity — do NOT resolve them
- Be concise: 1-2 sentences per slide in the blueprint

OUTPUT (JSON object with exactly 4 top-level keys):
{
  "session_overview": {
    "workshop_title": "string",
    "key_themes": ["3-5 themes"],
    "learning_objectives": ["2-4 measurable objectives"],
    "audience_summary": "who they are and what they need (1-2 sentences)",
    "session_arc_narrative": "emotional and intellectual journey (2-3 sentences)"
  },
  "slide_blueprint": {
    "slide_1": {
      "intent": "what this slide achieves (1 sentence)",
      "content_direction": "what to put on this slide (1-2 sentences)",
      "key_message": "the one thing the participant should take away",
      "experience_anchors": ["real-world situation to reference"],
      "kb_units_to_use": ["CU_id"],
      "flags": ["any concerns — gaps, conflicts, sensitivity"]
    },
    "slide_2": { ... },
    ...
    "slide_17": { ... }
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
- slide_blueprint must have entries for ALL 17 slides (slide_1 through slide_17)
- Do NOT wrap in a container object. Return the JSON directly.`;

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
  + JSON.stringify(sessionConstraints) + '\n\n'
  + '=== SLIDE TEMPLATE (Gagné/Kolb/AGES are FIXED — do not re-assign) ===\n'
  + JSON.stringify(slideTypes) + '\n\n'
  + '=== CONTENT TAGS (which KB units and pre-work slides map to each session slide) ===\n'
  + JSON.stringify(contentTags) + '\n\n'
  + '=== PRE-WORK METADATA (slide summaries — full content will be provided to content generators) ===\n'
  + JSON.stringify(preWorkMeta) + '\n\n'
  + '=== KB CONTENT UNITS (summaries) ===\n'
  + JSON.stringify(kbSummary) + '\n\n'
  + '=== FILTERED PROJECT MEMORY ===\n'
  + JSON.stringify(memoryData) + '\n\n'
  + '=== CONTENT OUTLINE (extracted from client document) ===\n'
  + (extractedText || 'No content outline available.') + '\n\n'
  + '=== INSTRUCTIONS ===\n'
  + '1. Design a session narrative that connects client objectives to pre-work findings.\n'
  + '2. For each of 17 slides, provide strategic intent and content direction.\n'
  + '3. Reference tagged KB units in slide_blueprint where relevant.\n'
  + '4. Identify mandatory Jombay frameworks and assign to specific slides.\n'
  + '5. Flag any sensitivity concerns (cultural, organizational, participant-related).\n\n'
  + '=== REQUIRED OUTPUT FORMAT ===\n'
  + 'Return EXACTLY this JSON structure. Use EXACTLY these key names. slide_blueprint must be an OBJECT with keys slide_1 through slide_17 (NOT an array).\n\n'
  + '{\n'
  + '  "session_overview": { "workshop_title": "...", "key_themes": ["..."], "learning_objectives": ["..."], "audience_summary": "...", "session_arc_narrative": "..." },\n'
  + '  "slide_blueprint": {\n'
  + '    "slide_1": { "intent": "...", "content_direction": "...", "key_message": "...", "experience_anchors": [], "kb_units_to_use": [], "flags": [] },\n'
  + '    "slide_2": { "intent": "...", "content_direction": "...", "key_message": "...", "experience_anchors": [], "kb_units_to_use": [], "flags": [] },\n'
  + '    ... (all 17 slides)\n'
  + '    "slide_17": { "intent": "...", "content_direction": "...", "key_message": "...", "experience_anchors": [], "kb_units_to_use": [], "flags": [] }\n'
  + '  },\n'
  + '  "mandatory_jombay_frameworks": [{ "framework_name": "...", "target_slides": [9, 12], "why": "..." }],\n'
  + '  "sensitivity_log": [{ "slide_number": 9, "concern": "...", "action": "..." }]\n'
  + '}\n\n'
  + 'CRITICAL: Use ONLY these 4 top-level keys: session_overview, slide_blueprint, mandatory_jombay_frameworks, sensitivity_log.\n'
  + 'Do NOT use alternative names like session_narrative, slide_blueprints, mandatory_frameworks, etc.';

return [{ json: {
  system_prompt: systemPrompt,
  prompt: userPrompt,
  model: 'global.anthropic.claude-sonnet-4-5-20250929-v1:0',
  node_name: 'Blueprint',
  memory_id: validatedInput.memory_id,
  knowledge_base_id: validatedInput.knowledge_base_id,
  workflow_session_id: validatedInput.workflow_session_id,
  workflow_id: validatedInput.workflow_id,
  project_id: validatedInput.project_id,
  client_id: validatedInput.client_id
}}];
