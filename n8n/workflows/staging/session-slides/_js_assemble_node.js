// 8.1_JS_Assemble — Final output assembly (tab-based)
// Reads all upstream normalizers + input, builds structured output.
// Each slide has 4 tabs: content, facilitator, framework, gamma_details.

const scriptMerge = $input.first().json;
const contentMerge = $('6.4_JS_NormContent').first().json;
const agent1 = $('3.6_JS_NormBP').first().json.agent1_output || {};
const validatedInput = $('1.2_PREP_Input').first().json;
const agent3 = $('7.1h_JS_NormQC').first().json;
const kbData = $('2.7_JS_ParseKB').first().json;
const tagData = $('2.10_JS_ParseTags').first().json;

// Read outline alignment for outline_ref and outline_topic
let outlineAlignment = {};
try {
  outlineAlignment = $('2.0d_JS_AlignOutline').first().json.outline_alignment || {};
} catch(e) { outlineAlignment = {}; }

const rawSlideSpec = contentMerge.slide_spec || {};
const facilitatorScript = scriptMerge.facilitator_script || {};
const sessionConstraints = validatedInput.session_constraints || {};
const sessionOverview = agent1.session_overview || {};
const contentTags = (tagData.content_tags || {});
const kbResults = kbData.kb_results || [];

// Build a lookup: content_unit_id → KB result object (for sources)
const kbLookup = {};
for (const kb of kbResults) {
  const id = kb.content_unit_id || kb.id || '';
  if (id) kbLookup[id] = kb;
}

// Backfill missing slides from blueprint
const slideBlueprint = agent1.slide_blueprint || {};
for (const [key, bp] of Object.entries(slideBlueprint)) {
  if (!rawSlideSpec[key] && bp && typeof bp === 'object') {
    rawSlideSpec[key] = {
      slide_number: bp.slide_number,
      slide_type: bp.slide_type || bp.type || '',
      title: bp.title || '',
      headline: bp.title || '',
      gagne: bp.gagne || null,
      kolb: bp.kolb || null,
      ages: bp.ages || null,
      timing_minutes: bp.timing_minutes || 0,
      provenance: 'Blueprint',
      _generation_failed: true
    };
  }
}

// Embed QC reviewer_flags into slide data
const slideReviews = agent3.slide_reviews || {};
for (const [slideId, review] of Object.entries(slideReviews)) {
  const key = slideId.startsWith('slide_') ? slideId : 'slide_' + slideId;
  const flags = (review && review.flags) || [];
  if (rawSlideSpec[key] && flags.length > 0) {
    if (!Array.isArray(rawSlideSpec[key].reviewer_flags)) rawSlideSpec[key].reviewer_flags = [];
    rawSlideSpec[key].reviewer_flags.push(...flags);
  }
}

// --- Field classification sets ---
const FACILITATOR_FIELDS = new Set([
  'facilitator_script', 'facilitator_notes', 'facilitator_instruction',
  'facilitator_prompt', 'talking_points', 'debrief_questions',
  'speaker_notes', 'trainer_notes'
]);

const FRAMEWORK_FIELDS = new Set([
  'gagne', 'kolb', 'ages',
  'provenance', 'provenance_source',
  'reviewer_flags', 'mandatory_frameworks_used',
  'flags', 'sensitivity_flags'
]);

const GAMMA_FIELDS = new Set([
  'visual_guidance', 'visual_direction', 'visual_cues', 'visual_elements',
  'layout_recommendation', 'graphic_notes', 'color_cues',
  'slide_dimensions', 'visual'
]);

// These fields go to the slide root level, not into any tab
const ROOT_FIELDS = new Set([
  'slide_number', 'outline_ref', 'outline_topic'
]);

// --- Build tab-structured slides ---
const slides = {};

for (const [key, rawSlide] of Object.entries(rawSlideSpec)) {
  if (!/^slide_\d+$/.test(key)) continue;

  const alignment = outlineAlignment[key] || {};
  const slideScript = facilitatorScript[key] || {};
  const slideTags = contentTags[key] || {};
  const kbUnitIds = slideTags.kb_units || [];

  // Build sources array from KB mapping
  const sources = [];
  for (const unitId of kbUnitIds) {
    const kb = kbLookup[unitId];
    if (kb) {
      sources.push({
        content_unit_id: kb.content_unit_id || kb.id || unitId,
        title: kb.title || '',
        content_type: kb.content_type || '',
        document_url: kb.document_url || ''
      });
    }
  }

  // Classify raw slide fields into tabs
  const content = {};
  const facilitator = {};
  const framework = {};
  const gamma_details = {};

  for (const [field, value] of Object.entries(rawSlide)) {
    if (ROOT_FIELDS.has(field)) continue;
    if (field === 'slide_number') continue;

    if (FACILITATOR_FIELDS.has(field)) {
      facilitator[field] = value;
    } else if (FRAMEWORK_FIELDS.has(field)) {
      framework[field] = value;
    } else if (GAMMA_FIELDS.has(field)) {
      gamma_details[field] = value;
    } else {
      content[field] = value;
    }
  }

  // Merge facilitator_script data from separate merge node
  if (typeof slideScript === 'object' && slideScript !== null) {
    for (const [field, value] of Object.entries(slideScript)) {
      if (field === 'slide_number' || field === 'slide_ref' || field === 'slide_id') continue;
      facilitator[field] = value;
    }
  }

  // Add sources to content
  content.sources = sources;

  slides[key] = {
    slide_number: rawSlide.slide_number || parseInt(key.replace('slide_', ''), 10),
    outline_ref: alignment.outline_section || '',
    outline_topic: alignment.outline_section || '',
    content,
    facilitator,
    framework,
    gamma_details
  };
}

// Build slide_mapping for knowledge_bank
const slideMapping = {};
for (const [key, tags] of Object.entries(contentTags)) {
  if (/^slide_\d+$/.test(key) && tags.kb_units && tags.kb_units.length > 0) {
    slideMapping[key] = tags.kb_units;
  }
}

const totalSlides = Object.keys(slides).length;

const finalOutput = {
  metadata: {
    project_name: (validatedInput.project_details || {}).name || '',
    client_name: validatedInput.client_name || '',
    session_type: sessionConstraints.sessionType || sessionConstraints.session_type || '',
    total_duration: sessionConstraints.totalDuration || sessionConstraints.total_duration || '',
    total_slides: totalSlides,
    generated_date: new Date().toISOString().split('T')[0],
    overall_confidence: (agent3.review_summary || {}).overall_quality || 'Medium',
    run_id: validatedInput.run_id || $execution.id,
    input_hash: validatedInput.input_hash || '',
    n8n_workflow_execution_id: $execution.id,
    n8n_workflow_execution_url: 'https://workflows.ur-nl.com/executions/' + $execution.id
  },
  session_overview: {
    workshop_title: sessionOverview.workshop_title || '',
    key_themes: sessionOverview.key_themes || [],
    learning_objectives: sessionOverview.learning_objectives || [],
    audience_summary: sessionOverview.audience_summary || '',
    session_arc_narrative: sessionOverview.session_arc_narrative || '',
    application_moments: sessionOverview.application_moments || [],
    gagne_map: sessionOverview.gagne_map || {},
    kolb_map: sessionOverview.kolb_map || {}
  },
  slides: slides,
  mandatory_jombay_frameworks: agent1.mandatory_jombay_frameworks || [],
  checklist_compliance: agent3.checklist_compliance || {},
  knowledge_bank: {
    kb_results: kbResults,
    kb_result_count: kbResults.length,
    slide_mapping: slideMapping,
    stats: tagData.stats || {}
  }
};

return [{ json: {
  final_output: finalOutput,
  workflow_session_id: validatedInput.workflow_session_id
}}];
