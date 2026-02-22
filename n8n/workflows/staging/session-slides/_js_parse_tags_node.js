// 2.10_JS_ParseTags — Parse and validate content tagging output
// Ensures every session slide has a valid mapping entry.

const response = $input.first().json;
const llmResponse = response.llm_response || response;

// Parse the tagging output
let tagMap = {};

if (typeof llmResponse === 'object' && !Array.isArray(llmResponse)) {
  tagMap = llmResponse;
} else if (typeof llmResponse === 'string') {
  try { tagMap = JSON.parse(llmResponse); } catch (e) { tagMap = {}; }
}

// Ensure all 17 slides have entries with correct shape
const validatedTags = {};
for (let i = 1; i <= 17; i++) {
  const key = `slide_${i}`;
  const entry = tagMap[key] || {};
  validatedTags[key] = {
    kb_units: Array.isArray(entry.kb_units) ? entry.kb_units.filter(id => typeof id === 'string' && id.length > 0) : [],
    pre_work_slides: Array.isArray(entry.pre_work_slides) ? entry.pre_work_slides.filter(id => typeof id === 'string' && id.length > 0) : []
  };
}

// Compute stats for logging
let totalKBTags = 0;
let totalPWTags = 0;
for (const entry of Object.values(validatedTags)) {
  totalKBTags += entry.kb_units.length;
  totalPWTags += entry.pre_work_slides.length;
}

return [{ json: {
  status: 'tagged',
  content_tags: validatedTags,
  stats: {
    total_kb_tags: totalKBTags,
    total_pw_tags: totalPWTags,
    slides_with_kb: Object.values(validatedTags).filter(e => e.kb_units.length > 0).length,
    slides_with_pw: Object.values(validatedTags).filter(e => e.pre_work_slides.length > 0).length
  }
}}];
