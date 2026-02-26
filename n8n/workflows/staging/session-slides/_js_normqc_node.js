// 7.1h_JS_NormQC — Extract normalized QC from Haiku enforcer
// Best-effort: trust Haiku output, fallback to raw merge data on SUB error

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

// Fallback to raw merge data if SUB failed or empty response
if (isSubError || Object.keys(parsed).length === 0) {
  try {
    const raw = $('7.1e_JS_MergeQC').first().json;
    parsed = raw.raw_qc_results ? { raw_qc_results: raw.raw_qc_results } : raw;
  } catch (e) { /* not accessible */ }
}

// Haiku may return a flat array (indexed keys 0,1,2,...) or {slide_reviews: [...]}
// Detect array-like object (numeric keys) and convert to slide_reviews
let slideReviews = parsed.slide_reviews || {};
if (typeof slideReviews === 'object' && !Array.isArray(slideReviews) && Object.keys(slideReviews).length === 0) {
  // Check for numeric keys (Haiku flat array format)
  const numericKeys = Object.keys(parsed).filter(k => /^\d+$/.test(k));
  if (numericKeys.length > 0) {
    slideReviews = {};
    for (const k of numericKeys) {
      const item = parsed[k];
      if (item && typeof item === 'object') {
        const slideId = item.slide_id || ('slide_' + (item.slide_number || k));
        slideReviews[slideId] = item;
      }
    }
  }
  // Also check raw_qc_results array
  if (Object.keys(slideReviews).length === 0 && Array.isArray(parsed.raw_qc_results)) {
    for (const qcGroup of parsed.raw_qc_results) {
      const reviews = qcGroup.slide_reviews || qcGroup.reviews || [];
      const arr = Array.isArray(reviews) ? reviews : [];
      for (const item of arr) {
        const slideId = item.slide_id || ('slide_' + (item.slide_number || ''));
        if (slideId) slideReviews[slideId] = item;
      }
    }
  }
}
// Handle if slide_reviews is an array
if (Array.isArray(slideReviews)) {
  const obj = {};
  for (const item of slideReviews) {
    const slideId = item.slide_id || ('slide_' + (item.slide_number || ''));
    if (slideId) obj[slideId] = item;
  }
  slideReviews = obj;
}

return [{ json: {
  review_summary: parsed.review_summary || {},
  slide_reviews: slideReviews,
  checklist_compliance: parsed.checklist_compliance || {}
}}];
