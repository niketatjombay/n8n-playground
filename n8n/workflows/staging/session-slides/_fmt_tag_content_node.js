// 2.8_FMT_TagContent — Build content tagging prompt
// v3: Maps KB units + pre-work slides → dynamic session slides (expanded from alignment)
//
// Why this matters: Without tagging, 73K chars of pre-work data would either
// go to ALL groups (timeout) or be dropped entirely (no grounding).
// With tagging, each group gets only its relevant pre-work slides.

const validatedInput = $('1.2_PREP_Input').first().json;
const kbData = $('2.7_JS_ParseKB').first().json;

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
const kbResults = kbData.kb_results || [];

// Read dynamic slide template from alignment (v3: expanded slides)
let slideTemplate = validatedInput.slide_template || {};
let outlineAlignment = {};
try {
  const alignData = $('2.0d_JS_AlignOutline').first().json;
  if (alignData.slide_template && Object.keys(alignData.slide_template).length > 0) {
    slideTemplate = alignData.slide_template;
  }
  outlineAlignment = alignData.outline_alignment || {};
} catch(e) {}

// Build session slide list with outline context for better tagging
const sessionSlides = {};
for (const [key, val] of Object.entries(slideTemplate)) {
  const alignment = outlineAlignment[key] || {};
  sessionSlides[key] = {
    type: val.type,
    outline_topic: alignment.outline_section || '',
    outline_excerpt: (alignment.outline_excerpt || '').substring(0, 200)
  };
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

const systemPrompt = `You are a content mapping assistant. Given a list of session slides (with their types and outline topics), pre-work slides, and knowledge base units, determine which pre-work slides and KB units are relevant to each session slide.

OUTPUT RULES:
- Return ONLY valid JSON with keys matching the session slide IDs provided.
- Each key maps to: { "kb_units": ["id", ...], "pre_work_slides": ["id", ...] }
- A pre-work slide or KB unit can map to MULTIPLE session slides.
- Some session slides may have empty arrays (e.g., Break, Module breaker).
- Do NOT add commentary — ONLY the JSON object.

MAPPING GUIDANCE:
- Each session slide has a TYPE and an OUTLINE TOPIC. Use both to determine relevance.
- Match KB units to slides whose outline topic aligns with the KB unit's subject matter.
- Match pre-work slides to session slides based on content similarity.
- Content (AC) slides about specific topics should get KB units about those same topics.
- Activity (CE) slides should get KB units with exercises/activities related to the topic.
- Discussion/Reflection (RO) slides should get pre-work slides with challenges/examples.
- Static slides (Session title, Jombay intro, Trainer intro, Agenda, Break, Closing) typically get empty arrays.
- Use the outline excerpts to understand WHAT each slide is about — map KB/pre-work to the right topic.`;

const userPrompt = `Map the pre-work slides and KB units to session slides. Return ONLY the JSON object.

=== SESSION SLIDES (${Object.keys(sessionSlides).length} slides with types and outline topics) ===
${JSON.stringify(sessionSlides)}

=== PRE-WORK SLIDES (${pwSummary.length} items) ===
${JSON.stringify(pwSummary)}

=== KB UNITS (${kbSummary.length} items) ===
${JSON.stringify(kbSummary)}

=== CONTENT OUTLINE (module structure — use to guide mapping) ===
${Object.keys(contentOutline).length > 0 ? JSON.stringify(contentOutline) : 'No content outline available.'}`;

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
