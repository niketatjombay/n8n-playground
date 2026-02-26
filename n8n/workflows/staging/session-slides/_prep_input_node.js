// 1.1_PREP_Input — Parse, Validate, Filter, Build Template
// Replaces old 1.2_VAL_Input with v2 architecture:
//   1. Parse webhook body + handle camelCase keys from frontend
//   2. Guard: client_name required
//   3. Filter project_details to session-relevant fields
//   4. Extract pre-work metadata (competencies, themes) for KB search
//   5. Build deterministic slide template (17 types + Gagné + Kolb + AGES)

const body = $input.first().json.body || $input.first().json;

// ============================================================
// STEP 1: PARSE INPUTS (handle camelCase from frontend)
// ============================================================

function parseJSON(value, fieldName) {
  if (!value) return null;
  if (typeof value === 'object') return value;
  if (typeof value === 'string') {
    try { return JSON.parse(value); } catch (e) {
      return null;
    }
  }
  return null;
}

const projectDetails = parseJSON(body.project_details, 'project_details') || {};
const inputJson = parseJSON(body.input_json, 'input_json') || {};

// Handle camelCase keys from frontend
const preWorkSlides = inputJson.preWorkSummaryOutputJson
  || inputJson.pre_work_summary_output_json
  || {};

const sessionConstraints = inputJson.sessionConstraints
  || inputJson.session_constraints
  || {};

const contentOutlineUrl = inputJson.contentOutlineUrl
  || inputJson.content_outline_url
  || '';

// Fallback: if content_outline_url is empty, check documents_urls
const documentsUrls = body.documents_urls || '';

const clientName = body.client_name || '';

// ============================================================
// STEP 2: GUARD — client_name required
// ============================================================

if (!clientName) {
  return [{ json: {
    status: 'error',
    error_type: 'validation_error',
    error_message: 'Missing client_name'
  }}];
}

// ============================================================
// STEP 3: FILTER PROJECT_DETAILS
// ============================================================

const KEEP_FIELDS = [
  'name', 'industry', 'seniority_of_cohort', 'background',
  'client_objective', 'content_type', 'facilitators_name',
  'program_type', 'project_notes', 'project_components'
];

const filteredProjectDetails = {};
for (const field of KEEP_FIELDS) {
  if (projectDetails[field] !== undefined && projectDetails[field] !== null && projectDetails[field] !== '') {
    filteredProjectDetails[field] = projectDetails[field];
  }
}

// ============================================================
// STEP 4: EXTRACT PRE-WORK METADATA (for KB search in step 4)
// ============================================================

// Helper: extract readable summary from slide bullets
function buildSlideSummary(slide) {
  const bullets = slide.bullets || {};
  const parts = [];
  for (const [k, v] of Object.entries(bullets)) {
    if (typeof v === 'string') parts.push(k + ': ' + v);
    else if (Array.isArray(v)) parts.push(k + ': ' + v.join('; '));
    else if (typeof v === 'object' && v !== null) {
      for (const [sk, sv] of Object.entries(v)) {
        if (typeof sv === 'string') parts.push(sk + ': ' + sv);
        else if (Array.isArray(sv)) parts.push(sk + ': ' + sv.join('; '));
      }
    }
  }
  return parts.join(' | ').substring(0, 500);
}

const competencies = [];
const developmentThemes = [];
const slideSummary = [];

const slideKeys = Object.keys(preWorkSlides).sort();
for (const key of slideKeys) {
  const slide = preWorkSlides[key];
  if (!slide || typeof slide !== 'object') continue;

  // Build slide summary (for step 5 tagging)
  slideSummary.push({
    id: key,
    slide_id: slide.slide_id || key,
    title: slide.slide_title || '',
    template_ref: String(slide.template_reference || ''),
    confidence: slide.confidence || '',
    size_chars: JSON.stringify(slide).length,
    summary: buildSlideSummary(slide)
  });

  const bullets = slide.bullets || {};

  // Extract competencies from slide_1_1 key_themes
  if (key === 'slide_1_1' && bullets.key_themes) {
    for (const theme of bullets.key_themes) {
      // Extract competency name (text before colon)
      const comp = theme.includes(':') ? theme.split(':')[0].trim() : theme.trim();
      if (comp) competencies.push(comp);
    }
  }

  // Extract development themes from slide_3_3 theme_N_name
  if (key === 'slide_3_3') {
    for (const [bk, bv] of Object.entries(bullets)) {
      if (bk.match(/^theme_\d+_name$/) && typeof bv === 'string') {
        developmentThemes.push(bv.trim());
      }
    }
  }

  // Extract behavioral themes from slide_3_2 section names
  if (key === 'slide_3_2') {
    for (const sectionName of Object.keys(bullets)) {
      // Convert section_name to readable: most_common_mentioned_... → "Most Common (70%+)"
      // Keep raw for now — LLM will interpret these
      if (sectionName && !competencies.includes(sectionName)) {
        // Don't add raw section names as competencies — they're frequency labels, not competency names
        // The actual competency names are in the bullet content, which the LLM will see
      }
    }
  }
}

const preWorkMetadata = {
  competencies,
  development_themes: developmentThemes,
  total_slides: slideKeys.length,
  slide_summary: slideSummary
};

// ============================================================
// STEP 5: BUILD DETERMINISTIC SLIDE TEMPLATE
// ============================================================

const slideTemplate = {
  slide_1:  { type: 'Session title',              gagne: 'Gain Attention',       kolb: null,  ages: 'Attention' },
  slide_2:  { type: 'Jombay intro',               gagne: null,                   kolb: null,  ages: 'Emotion' },
  slide_3:  { type: 'Trainer intro',              gagne: null,                   kolb: null,  ages: 'Emotion' },
  slide_4:  { type: 'Agenda',                     gagne: null,                   kolb: null,  ages: 'Attention' },
  slide_5:  { type: 'Working Agreement',          gagne: null,                   kolb: null,  ages: 'Generation' },
  slide_6:  { type: 'Program overview',           gagne: 'Stimulate Recall',     kolb: null,  ages: 'Attention' },
  slide_7:  { type: 'Objectives',                 gagne: 'Inform Objectives',    kolb: null,  ages: 'Attention' },
  slide_8:  { type: 'Module breaker',             gagne: null,                   kolb: null,  ages: 'Spacing' },
  slide_9:  { type: 'Content (AC)',               gagne: 'Present Content',      kolb: 'AC',  ages: 'Generation' },
  slide_10: { type: 'Quote',                      gagne: 'Provide Guidance',     kolb: null,  ages: 'Emotion' },
  slide_11: { type: 'Discussion/Reflection (RO)', gagne: 'Stimulate Recall',     kolb: 'RO',  ages: 'Generation' },
  slide_12: { type: 'Activity (CE)',              gagne: 'Elicit Performance',   kolb: 'CE',  ages: 'Generation' },
  slide_13: { type: 'Break',                      gagne: null,                   kolb: null,  ages: 'Spacing' },
  slide_14: { type: 'Questions',                  gagne: 'Provide Feedback',     kolb: null,  ages: 'Generation' },
  slide_15: { type: 'Feedback',                   gagne: 'Assess Performance',   kolb: null,  ages: 'Generation' },
  slide_16: { type: 'Call to Action (AE)',        gagne: 'Enhance Retention',    kolb: 'AE',  ages: 'Generation' },
  slide_17: { type: 'Closing',                    gagne: 'Enhance Retention',    kolb: null,  ages: 'Emotion' }
};

// ============================================================
// STEP 6: GENERATE RUN ID + INPUT HASH
// ============================================================

// run_id: unique per execution
const run_id = $execution.id;

// input_hash: deterministic hash of key inputs for duplicate detection
// Uses: client_name + project_id + content_outline_url + pre_work slide count + session_constraints
const hashInput = JSON.stringify({
  client_name: clientName,
  project_id: body.project_id || '',
  content_outline_url: contentOutlineUrl || documentsUrls,
  pre_work_slide_count: slideKeys.length,
  session_type: sessionConstraints.sessionType || sessionConstraints.session_type || '',
  total_duration: sessionConstraints.totalDuration || sessionConstraints.total_duration || ''
});

// Simple string hash (djb2) — sufficient for duplicate detection, no crypto needed
let hash = 5381;
for (let i = 0; i < hashInput.length; i++) {
  hash = ((hash << 5) + hash) + hashInput.charCodeAt(i);
  hash = hash & hash; // Convert to 32-bit integer
}
const input_hash = Math.abs(hash).toString(36);

// ============================================================
// OUTPUT
// ============================================================

return [{ json: {
  status: 'validated',

  // Identity
  client_name: clientName,
  client_id: body.client_id || '',
  project_id: body.project_id || '',
  workflow_id: body.workflow_id || '',
  workflow_session_id: body.workflow_session_id || '',
  workflow_session_name: body.workflow_session_name || '',

  // Filtered project details
  project_details: filteredProjectDetails,

  // Pre-work: full slides (for step 5 distribution)
  pre_work_slides: preWorkSlides,

  // Extracted metadata (for step 4 KB search)
  pre_work_metadata: preWorkMetadata,

  // Session constraints
  session_constraints: sessionConstraints,

  // URLs
  content_outline_url: contentOutlineUrl || documentsUrls,
  documents_urls: documentsUrls,

  // Raw memory (for step 3 LLM filtering)
  current_project_memory: body.current_project_memory || '',

  // Sub-workflow IDs
  memory_id: body.memory_id || '',
  knowledge_base_id: body.knowledge_base_id || inputJson.knowledge_base_id || 'Q6OYS6AUC8',

  // Run tracking
  run_id: run_id,
  input_hash: input_hash,

  // Deterministic slide template
  slide_template: slideTemplate
}}];
// test comment
