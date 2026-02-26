// 2.8_FMT_TagContent — Build content tagging prompt
// NEW in v2: Maps KB units + pre-work slides → 17 session slides
//
// Why this matters: Without tagging, 73K chars of pre-work data would either
// go to ALL 7 groups (timeout) or be dropped entirely (no grounding).
// With tagging, each group gets only its relevant pre-work slides.

const validatedInput = $('1.2_PREP_Input').first().json;
const kbData = $('2.7_JS_ParseKB').first().json;

// Read outline alignment for mapping guidance
let outlineAlignment = {};
try {
  outlineAlignment = $('2.0d_JS_AlignOutline').first().json.outline_alignment || {};
} catch(e) { outlineAlignment = {}; }

// Content outline for mapping context
let contentOutline = {};
try {
  const outlineNode = $('2.0_SUB_Outline').first().json;
  contentOutline = outlineNode.formatted_outline || {};
  if (typeof contentOutline === 'string') {
    try { contentOutline = JSON.parse(contentOutline); } catch(e) { contentOutline = {}; }
  }
} catch(e) { contentOutline = {}; }

const preWorkMeta = validatedInput.pre_work_metadata || {};
const slideSummary = preWorkMeta.slide_summary || [];
const defaultSlideTemplate = validatedInput.slide_template || {};

// Read dynamic slide template from alignment node (Phase 2: dynamic slide count)
let slideTemplate = defaultSlideTemplate;
let totalSlides = 17;
try {
  const alignData = $('2.0d_JS_AlignOutline').first().json;
  const dynTemplate = alignData.slide_template || {};
  if (Object.keys(dynTemplate).length > 0) slideTemplate = dynTemplate;
  totalSlides = alignData.total_slides || Object.keys(slideTemplate).length || 17;
} catch(e) {
  totalSlides = Object.keys(slideTemplate).length || 17;
}
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

// Build compact pre-work summary (id + title + summary for tagging)
const pwSummary = slideSummary.map(s => ({
  id: s.id,
  title: s.title,
  confidence: s.confidence,
  summary: (s.summary || '').substring(0, 300)  // 300 chars max to keep prompt compact
}));

const systemPrompt = `You are a content mapping assistant. Given a list of session slides, pre-work slides, and knowledge base units, determine which pre-work slides and KB units are relevant to each session slide.

OUTPUT RULES:
- Return ONLY valid JSON with keys "slide_1" through "slide_${totalSlides}".
- Each key maps to: { "kb_units": ["id", ...], "pre_work_slides": ["id", ...] }
- A pre-work slide or KB unit can map to MULTIPLE session slides.
- Some session slides may have empty arrays (e.g., Break, Module breaker).
- Do NOT add commentary — ONLY the JSON object.

MAPPING GUIDANCE:
- Each pre-work slide includes a SUMMARY of its bullet content. Use these summaries (not just titles) to determine relevance to each session slide.
- Match by SLIDE TYPE, not by fixed slide number. The slide types and their mappings:
  * Session title: pre-work project overview slides
  * Program overview: pre-work project/company profile slides
  * Objectives: pre-work themes, development goals
  * Content (AC): pre-work insights, challenges, behavioral themes + relevant KB frameworks
  * Quote: KB units with quotes or thought leadership
  * Discussion/Reflection (RO): pre-work challenges, current vs desired state
  * Activity (CE): KB units with activities, exercises + pre-work real examples
  * Questions: pre-work challenges, participant pain points
  * Call to Action (AE): pre-work development themes, action-oriented content
  * Jombay intro, Trainer intro, Agenda, Working Agreement, Module breaker, Break, Feedback, Closing: typically empty or minimal mapping
- Use the CONTENT OUTLINE modules to understand which topics belong to which slides. Map KB units to the session slide whose outline module best matches.`;

const userPrompt = `Map the pre-work slides and KB units to session slides. Return ONLY the JSON object.

=== SESSION SLIDES (${totalSlides} slides) ===
${JSON.stringify(sessionSlides)}

=== PRE-WORK SLIDES (${pwSummary.length} items) ===
${JSON.stringify(pwSummary)}

=== KB UNITS (${kbSummary.length} items) ===
${JSON.stringify(kbSummary)}

=== CONTENT OUTLINE (module structure — use to guide mapping) ===
${Object.keys(contentOutline).length > 0 ? JSON.stringify(contentOutline) : 'No content outline available.'}`
+ '\n\n=== OUTLINE ALIGNMENT (use to guide KB mapping) ===\n'
+ 'Each slide has an outline_excerpt showing what content the client expects on that slide.\n'
+ 'Map KB units to slides whose outline content they best support.\n'
+ JSON.stringify(outlineAlignment);

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
