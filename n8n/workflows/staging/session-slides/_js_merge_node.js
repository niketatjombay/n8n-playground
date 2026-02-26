// 6.1_JS_Merge — Thin collector: merge 7 group outputs into raw object
// Handles 2 LLM output formats:
//   A) { slide_1: { ... }, slide_2: { ... } }  — preferred
//   B) { slides: [ { slide_id, ... } ] }  — array format
// No normalization — that's handled by the Haiku enforcer downstream.

const items = $input.all();
let mergedSlides = {};

function normalizeKey(id) {
  if (!id) return null;
  const s = String(id);
  return s.startsWith('slide_') ? s : 'slide_' + s;
}

for (const item of items) {
  const data = item.json;
  const response = data.llm_response || data;

  // Format A: slide_N as top-level keys
  for (const [k, v] of Object.entries(response)) {
    if (/^slide_\d+$/.test(k) && typeof v === 'object' && v !== null) {
      mergedSlides[k] = v;
    }
  }
  // Format B: slides array
  if (Array.isArray(response.slides)) {
    for (const slide of response.slides) {
      const key = normalizeKey(slide.slide_id || slide.slide_number);
      if (key) mergedSlides[key] = slide;
    }
  }
  // Legacy: slide_specs
  if (response.slide_specs && typeof response.slide_specs === 'object') {
    for (const [k, v] of Object.entries(response.slide_specs)) {
      const key = normalizeKey(k);
      if (key) mergedSlides[key] = v;
    }
  }
}

return [{ json: { raw_slides: mergedSlides, total_collected: Object.keys(mergedSlides).length }}];
