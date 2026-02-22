// 8.1_JS_Assemble — v2: Final output assembly
// Input: $input = 7.6_JS_MergeScripts (facilitator scripts)
// Reads via $(): 6.1_JS_Merge (slide content), 3.3_JS_ParseAgent1A (blueprint),
//   7.2_SUB_Agent3 (QC review), 1.2_PREP_Input (validated input)

const scriptMerge = $input.first().json;
const contentMerge = $('6.1_JS_Merge').first().json;
const agent1 = $('3.3_JS_ParseAgent1A').first().json.agent1_output;
const validatedInput = $('1.2_PREP_Input').first().json;

// QC review — Agent 3 output (accessed via $() not $input)
const agent3Raw = $('7.2_SUB_Agent3').first().json;
const agent3 = agent3Raw.llm_response || agent3Raw;

const slideSpec = contentMerge.slide_spec || {};
const facilitatorScript = scriptMerge.facilitator_script || {};
const slideTemplate = validatedInput.slide_template || {};
const sessionConstraints = validatedInput.session_constraints || {};

// Embed Agent 3 QC flags into slide_spec reviewer_flags
const slideReviews = agent3.slide_reviews || {};
for (const [slideId, review] of Object.entries(slideReviews)) {
  const slideKey = slideId.startsWith('slide_') ? slideId : 'slide_' + slideId;
  const flags = review.flags || [];
  if (slideSpec[slideKey] && flags.length > 0) {
    if (!Array.isArray(slideSpec[slideKey].reviewer_flags)) {
      slideSpec[slideKey].reviewer_flags = [];
    }
    slideSpec[slideKey].reviewer_flags.push(...flags);
  }
}

// --- Final validation pass (belt-and-suspenders after merge normalization) ---
for (let i = 1; i <= 17; i++) {
  const key = `slide_${i}`;
  const tmpl = slideTemplate[key] || {};

  // Ensure slide_spec entry exists with canonical keys
  if (!slideSpec[key]) {
    slideSpec[key] = { slide_number: key, slide_type: tmpl.type || '', headline: '', subtext: '', bullets: [], visual_guidance: '', key_message: '', reviewer_flags: [] };
  } else {
    const slide = slideSpec[key];
    if (!slide.slide_number) slide.slide_number = key;
    if (!slide.slide_type) slide.slide_type = tmpl.type || '';
    if (!slide.headline) slide.headline = slide.slide_title || slide.title || '';
    if (!Array.isArray(slide.reviewer_flags)) slide.reviewer_flags = [];
  }

  // Ensure facilitator_script entry exists with canonical keys
  if (!facilitatorScript[key]) {
    facilitatorScript[key] = { facilitator_script: '', visual_guidance: '', energy_note: '', modality_notes: { virtual: '', in_person: '' }, debrief_questions: [], activity_run_of_show: null };
  } else {
    const script = facilitatorScript[key];
    if (typeof script.facilitator_script !== 'string') script.facilitator_script = '';
  }
}

// Build provenance log from slide_spec
const provenanceLog = [];
for (let i = 1; i <= 17; i++) {
  const key = `slide_${i}`;
  const slide = slideSpec[key] || {};
  provenanceLog.push({
    slide_id: String(i),
    slide_type: (slideTemplate[key] || {}).type || '',
    provenance: slide.provenance || 'New',
    source: slide.provenance_source || '',
    rationale: slide.provenance_rationale || ''
  });
}

// Build Gagné map from deterministic slide_template
const gagneMap = {};
for (let i = 1; i <= 17; i++) {
  const key = `slide_${i}`;
  const tmpl = slideTemplate[key] || {};
  if (tmpl.gagne) {
    const eventKey = tmpl.gagne.toLowerCase().replace(/\s+/g, '_').replace(/'/g, '');
    if (!gagneMap[eventKey]) gagneMap[eventKey] = [];
    gagneMap[eventKey].push(String(i));
  }
}

// Build Kolb map from deterministic slide_template
const kolbMap = {};
for (let i = 1; i <= 17; i++) {
  const key = `slide_${i}`;
  const tmpl = slideTemplate[key] || {};
  if (tmpl.kolb) {
    kolbMap[tmpl.kolb] = String(i);
  }
}

// Session overview from blueprint
const sessionOverview = agent1.session_overview || {};

// Assemble final output
const finalOutput = {
  metadata: {
    project_name: validatedInput.project_details.name || '',
    client_name: validatedInput.client_name,
    session_type: sessionConstraints.sessionType || sessionConstraints.session_type || '',
    total_duration: sessionConstraints.totalDuration || sessionConstraints.total_duration || '',
    total_slides: 17,
    generated_date: new Date().toISOString().split('T')[0],
    overall_confidence: agent3.review_summary?.overall_quality || 'Medium',
    n8n_workflow_execution_id: $execution.id,
    n8n_workflow_execution_url: 'https://workflows.ur-nl.com/executions/' + $execution.id
  },
  session_overview: {
    workshop_title: sessionOverview.workshop_title || '',
    key_themes: sessionOverview.key_themes || [],
    learning_objectives: sessionOverview.learning_objectives || [],
    audience_summary: sessionOverview.audience_summary || '',
    session_arc_narrative: sessionOverview.session_arc_narrative || '',
    gagne_map: gagneMap,
    kolb_map: kolbMap
  },
  slide_spec: slideSpec,
  facilitator_script: facilitatorScript,
  mandatory_jombay_frameworks: agent1.mandatory_jombay_frameworks || [],
  sensitivity_log: agent1.sensitivity_log || [],
  checklist_compliance: agent3.checklist_compliance || { gagne_coverage: '', kolb_coverage: '', provenance_coverage: '' },
  attention_items: agent3.attention_items || [],
  provenance_log: provenanceLog
};

return [{ json: {
  final_output: finalOutput,
  workflow_session_id: validatedInput.workflow_session_id
}}];
