// 6.4_JS_NormContent — Extract normalized content from Haiku enforcer
// Best-effort: trust Haiku output, fallback to raw merge data on SUB error or truncation

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

// Helper: convert any slide source to keyed object {slide_N: {...}}
function toKeyedSlides(src) {
  if (!src) return {};
  // Already keyed object with slide_N keys
  if (!Array.isArray(src) && typeof src === 'object') {
    const keys = Object.keys(src);
    if (keys.some(k => /^slide_\d+$/.test(k))) return src;
  }
  // Array format
  const arr = Array.isArray(src) ? src : (src.slides || []);
  if (!Array.isArray(arr)) return typeof src === 'object' ? src : {};
  const obj = {};
  for (const item of arr) {
    let num = item.slide_number || item.slide_ref || item.slide_id || item.number;
    if (typeof num === 'string') num = num.replace(/^slide_/i, '');
    if (num) obj['slide_' + num] = item;
  }
  return obj;
}

// Try Haiku output first
let slideSpec = toKeyedSlides(parsed.slide_spec || parsed.slides || parsed);

// Fallback to raw merge if SUB failed, empty, or Haiku truncated (fewer than raw)
let rawSlides = {};
try {
  const raw = $('6.1_JS_Merge').first().json;
  rawSlides = raw.raw_slides || {};
} catch (e) { /* not accessible */ }

const rawCount = Object.keys(rawSlides).length;
const haikuCount = Object.keys(slideSpec).length;

if (isSubError || haikuCount === 0 || (rawCount > 0 && haikuCount < rawCount)) {
  // Merge: use raw as base, overlay Haiku data where available (Haiku may have cleaner formatting)
  const merged = { ...rawSlides };
  for (const [k, v] of Object.entries(slideSpec)) {
    if (v && typeof v === 'object') merged[k] = v;
  }
  slideSpec = merged;
}

const filledCount = Object.values(slideSpec).filter(s => s && (s.headline || s.slide_title || s.title)).length;

return [{ json: {
  status: filledCount >= 14 ? 'content_merged' : 'content_partial',
  slide_spec: slideSpec,
  total_slides: Object.keys(slideSpec).length || 17,
  filled_slides: filledCount
}}];
