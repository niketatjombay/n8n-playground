// 2.8_FMT_TagContent — Build content tagging prompt
// NEW in v2: Maps KB units + pre-work slides → 17 session slides
//
// Why this matters: Without tagging, 73K chars of pre-work data would either
// go to ALL 7 groups (timeout) or be dropped entirely (no grounding).
// With tagging, each group gets only its relevant pre-work slides.

const validatedInput = $('1.2_PREP_Input').first().json;
const kbData = $('2.7_JS_ParseKB').first().json;

const preWorkMeta = validatedInput.pre_work_metadata || {};
const slideSummary = preWorkMeta.slide_summary || [];
const slideTemplate = validatedInput.slide_template || {};
const kbResults = kbData.kb_results || [];

// Build compact session slide list
const sessionSlides = {};
for (const [key, val] of Object.entries(slideTemplate)) {
  sessionSlides[key] = val.type;
}

// Build compact KB summary (just id + title + type for tagging)
const kbSummary = kbResults.map(r => ({
  id: r.content_unit_id || r.id || '',
  title: r.title || '',
  type: r.content_type || ''
})).filter(r => r.id);

// Build compact pre-work summary (just id + title for tagging)
const pwSummary = slideSummary.map(s => ({
  id: s.id,
  title: s.title,
  confidence: s.confidence
}));

const systemPrompt = `You are a content mapping assistant. Given a list of session slides, pre-work slides, and knowledge base units, determine which pre-work slides and KB units are relevant to each session slide.

OUTPUT RULES:
- Return ONLY valid JSON with keys "slide_1" through "slide_17".
- Each key maps to: { "kb_units": ["id", ...], "pre_work_slides": ["id", ...] }
- A pre-work slide or KB unit can map to MULTIPLE session slides.
- Some session slides may have empty arrays (e.g., Break, Module breaker).
- Do NOT add commentary — ONLY the JSON object.

MAPPING GUIDANCE:
- slide_1 (Session title): pre-work project overview slides
- slide_6 (Program overview): pre-work project/company profile slides
- slide_7 (Objectives): pre-work themes, development goals
- slide_9 (Content): pre-work insights, challenges, behavioral themes + relevant KB frameworks
- slide_10 (Quote): KB units with quotes or thought leadership
- slide_11 (Discussion): pre-work challenges, current vs desired state
- slide_12 (Activity): KB units with activities, exercises + pre-work real examples
- slide_14 (Questions): pre-work challenges, participant pain points
- slide_16 (Call to Action): pre-work development themes, action-oriented content
- slides 2,3,4,5,8,13,15,17: typically empty or minimal mapping`;

const userPrompt = `Map the pre-work slides and KB units to session slides. Return ONLY the JSON object.

=== SESSION SLIDES (17 types) ===
${JSON.stringify(sessionSlides)}

=== PRE-WORK SLIDES (${pwSummary.length} items) ===
${JSON.stringify(pwSummary)}

=== KB UNITS (${kbSummary.length} items) ===
${JSON.stringify(kbSummary)}`;

return [{ json: {
  system_prompt: systemPrompt,
  prompt: userPrompt,
  model: 'global.anthropic.claude-haiku-4-5-20251001-v1:0',
  node_name: 'TagContent',
  memory_id: validatedInput.memory_id,
  knowledge_base_id: validatedInput.knowledge_base_id,
  workflow_session_id: validatedInput.workflow_session_id,
  workflow_id: validatedInput.workflow_id,
  project_id: validatedInput.project_id,
  client_id: validatedInput.client_id
}}];
