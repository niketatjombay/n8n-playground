// 2.0d_JS_AlignOutline — Extract slide plan and build dynamic template
// v2: Processes LLM-generated slide plan (dynamic count)
// Outputs: slide_plan, slide_template, outline_alignment, total_slides

const response = $input.first().json;

// Detect SUB error
const isSubError = !!(response.error || response.errorMessage || response.executionStatus === 'error');

let parsed = {};
if (!isSubError) {
  parsed = response.llm_response || response;
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed); } catch (e) { parsed = {}; }
  }
  // Unwrap common wrappers
  if (parsed.response && typeof parsed.response === 'object') parsed = parsed.response;
  if (parsed.data && typeof parsed.data === 'object' && parsed.data.slide_plan) parsed = parsed.data;
}

// Slide type vocabulary for Gagne/Kolb/AGES lookup
const typeMap = {
  'Session title':              { gagne: 'Gain Attention',     kolb: null, ages: 'Attention' },
  'Jombay intro':               { gagne: null,                 kolb: null, ages: 'Emotion' },
  'Trainer intro':              { gagne: null,                 kolb: null, ages: 'Emotion' },
  'Agenda':                     { gagne: null,                 kolb: null, ages: 'Attention' },
  'Working Agreement':          { gagne: null,                 kolb: null, ages: 'Generation' },
  'Program overview':           { gagne: 'Stimulate Recall',   kolb: null, ages: 'Attention' },
  'Objectives':                 { gagne: 'Inform Objectives',  kolb: null, ages: 'Attention' },
  'Module breaker':             { gagne: null,                 kolb: null, ages: 'Spacing' },
  'Content (AC)':               { gagne: 'Present Content',    kolb: 'AC', ages: 'Generation' },
  'Quote':                      { gagne: 'Provide Guidance',   kolb: null, ages: 'Emotion' },
  'Discussion/Reflection (RO)': { gagne: 'Stimulate Recall',   kolb: 'RO', ages: 'Generation' },
  'Activity (CE)':              { gagne: 'Elicit Performance', kolb: 'CE', ages: 'Generation' },
  'Break':                      { gagne: null,                 kolb: null, ages: 'Spacing' },
  'Questions':                  { gagne: 'Provide Feedback',   kolb: null, ages: 'Generation' },
  'Feedback':                   { gagne: 'Assess Performance', kolb: null, ages: 'Generation' },
  'Call to Action (AE)':        { gagne: 'Enhance Retention',  kolb: 'AE', ages: 'Generation' },
  'Closing':                    { gagne: 'Enhance Retention',  kolb: null, ages: 'Emotion' }
};

// Extract slide_plan
let slidePlan = parsed.slide_plan || [];
if (!Array.isArray(slidePlan)) slidePlan = [];

// If SUB failed or empty plan, check if we have a pre-built result (from fallback path)
if (slidePlan.length === 0 && parsed.slide_template) {
  return [{ json: parsed }];
}

const totalSlides = slidePlan.length || parsed.total_slides || 17;

// Build slide_template from slide_plan
const slideTemplate = {};
const outlineAlignment = {};
let slidesWithEvidence = 0;

for (const entry of slidePlan) {
  const num = entry.slide_number;
  const key = 'slide_' + num;
  const slideType = entry.slide_type || 'Content (AC)';
  const typeInfo = typeMap[slideType] || { gagne: null, kolb: null, ages: 'Generation' };

  slideTemplate[key] = {
    type: slideType,
    gagne: typeInfo.gagne,
    kolb: typeInfo.kolb,
    ages: typeInfo.ages
  };

  const hasEvidence = !!(entry.outline_excerpt && entry.outline_excerpt.length > 10);
  if (hasEvidence) slidesWithEvidence++;

  outlineAlignment[key] = {
    has_outline_evidence: hasEvidence,
    outline_section: entry.outline_ref || entry.outline_topic || null,
    outline_excerpt: entry.outline_excerpt || null,
    alignment_rationale: entry.alignment_rationale || ''
  };
}

return [{ json: {
  slide_plan: slidePlan,
  total_slides: totalSlides,
  slide_template: slideTemplate,
  outline_alignment: outlineAlignment,
  status: slidesWithEvidence >= Math.ceil(totalSlides * 0.5) ? 'aligned' : 'partial',
  slides_with_evidence: slidesWithEvidence
}}];
