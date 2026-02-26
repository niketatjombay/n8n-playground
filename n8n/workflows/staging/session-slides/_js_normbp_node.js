// 3.6_JS_NormBP — Extract normalized blueprint from Haiku enforcer
// Best-effort: trust Haiku output, fallback to raw parse data on SUB error

const response = $input.first().json;

// Detect SUB error
const isSubError = !!(response.error || response.errorMessage || response.executionStatus === 'error');

let parsed = {};
if (!isSubError) {
  parsed = response.llm_response || response;
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed); } catch (e) { parsed = {}; }
  }
}

// Fallback to raw parse data if SUB failed or empty response
if (isSubError || Object.keys(parsed).length === 0) {
  try {
    const raw = $('3.3_JS_ParseAgent1A').first().json;
    parsed = raw.raw_blueprint || raw;
  } catch (e) { /* not accessible */ }
}

// Unwrap common wrappers: agent1_output, response, data
const unwrapped = parsed.agent1_output || parsed.response || parsed.data || parsed;

const rawOverview = unwrapped.session_overview || parsed.session_overview || parsed.meta || {};

// Map alternative Haiku key names to expected schema
const sessionOverview = {
  workshop_title: rawOverview.workshop_title || rawOverview.session_title || rawOverview.title || '',
  key_themes: rawOverview.key_themes || parsed.key_themes || [],
  learning_objectives: rawOverview.learning_objectives || parsed.learning_objectives || [],
  audience_summary: rawOverview.audience_summary || rawOverview.cohort || '',
  session_arc_narrative: rawOverview.session_arc_narrative || '',
  application_moments: rawOverview.application_moments || [],
  gagne_map: rawOverview.gagne_map || {},
  kolb_map: rawOverview.kolb_map || {}
};

// slide_blueprint: may come as "slides" array, "session_arc" array, or keyed object
let slideBlueprint = unwrapped.slide_blueprint || parsed.slide_blueprint || {};
if (Object.keys(slideBlueprint).length === 0) {
  // Convert array formats (slides, session_arc) to keyed object
  const arr = parsed.slides || parsed.session_arc || unwrapped.slides || [];
  if (Array.isArray(arr) && arr.length > 0) {
    for (const item of arr) {
      let num = item.slide_number || item.slide_id || item.slide_ref || item.number || item.slide;
      if (typeof num === 'string') num = num.replace(/^slide_/i, '');
      if (num) slideBlueprint['slide_' + num] = item;
    }
  }
  // Also try flat slide_N keys on parsed
  if (Object.keys(slideBlueprint).length === 0 && parsed.slide_1) {
    for (const [k, v] of Object.entries(parsed)) {
      if (/^slide_\d+$/.test(k) && typeof v === 'object') slideBlueprint[k] = v;
    }
  }
}

const frameworks = Array.isArray(unwrapped.mandatory_jombay_frameworks) ? unwrapped.mandatory_jombay_frameworks :
  (Array.isArray(parsed.mandatory_jombay_frameworks) ? parsed.mandatory_jombay_frameworks : []);
const sensitivityLog = Array.isArray(unwrapped.sensitivity_log) ? unwrapped.sensitivity_log :
  (Array.isArray(parsed.sensitivity_log) ? parsed.sensitivity_log :
    (Array.isArray(parsed.sensitivity_considerations) ? parsed.sensitivity_considerations : []));

const filledSlides = Object.values(slideBlueprint).filter(s => s && (s.intent || s.content_direction || s.title)).length;

// Dynamic threshold: 60% of total slides
let totalSlides = 17;
try {
  totalSlides = $('2.0d_JS_AlignOutline').first().json.total_slides || 17;
} catch(e) {}

return [{ json: {
  status: filledSlides >= Math.ceil(totalSlides * 0.6) ? 'blueprint_parsed' : 'blueprint_partial',
  filled_slides: filledSlides,
  agent1_output: {
    session_overview: sessionOverview,
    slide_blueprint: slideBlueprint,
    mandatory_jombay_frameworks: frameworks,
    sensitivity_log: sensitivityLog
  }
}}];
