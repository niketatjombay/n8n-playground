// 6.2_JS_CoverageCheck — Outline coverage validation (v3)
// Input: $input = 6.1_JS_Merge (merged content from all groups)
// Reads: 2.0d_JS_AlignOutline (outline alignment with slide plan)
// Output: merged content + coverage_report for QC consumption
//
// Pure JS — no LLM call. Validates every outline item has a generated slide.

const mergedContent = $input.first().json;
const rawSlides = mergedContent.raw_slides || {};

let outlineAlignment = {};
let slidePlan = [];
let deliverySequence = [];
try {
  const alignData = $('2.0d_JS_AlignOutline').first().json;
  outlineAlignment = alignData.outline_alignment || {};
  slidePlan = alignData.slide_plan || [];
  deliverySequence = alignData.delivery_sequence || [];
} catch(e) {}

const covered = [];
const missing = [];
const extraSlides = [];

// Check each outline-mapped slide
for (const entry of slidePlan) {
  const slideKey = 'slide_' + entry.slide_number;
  const hasOutlineEvidence = !!(entry.outline_excerpt && entry.outline_excerpt.length > 10);

  if (!hasOutlineEvidence) continue; // Static slides without outline mapping — skip

  const slideContent = rawSlides[slideKey];
  const hasContent = slideContent && (slideContent.slide_title || slideContent.headline);

  if (hasContent) {
    covered.push({
      slide_id: slideKey,
      outline_ref: entry.outline_ref || '',
      outline_topic: entry.outline_topic || '',
      section_type: entry.slide_type || ''
    });
  } else {
    missing.push({
      slide_id: slideKey,
      outline_ref: entry.outline_ref || '',
      outline_topic: entry.outline_topic || '',
      section_type: entry.slide_type || '',
      status: 'MISSING'
    });
  }
}

// Check for generated slides not in the plan
for (const slideKey of Object.keys(rawSlides)) {
  const num = parseInt(slideKey.replace('slide_', ''), 10);
  const inPlan = slidePlan.some(e => e.slide_number === num);
  if (!inPlan) {
    extraSlides.push({ slide_id: slideKey, status: 'EXTRA' });
  }
}

const totalOutlineItems = covered.length + missing.length;
const coveragePercentage = totalOutlineItems > 0
  ? Math.round(covered.length / totalOutlineItems * 100)
  : 100;

return [{ json: {
  ...mergedContent,
  coverage_report: {
    coverage_percentage: coveragePercentage,
    total_outline_items: totalOutlineItems,
    covered_count: covered.length,
    missing_count: missing.length,
    covered_items: covered,
    missing_items: missing,
    extra_slides: extraSlides,
    total_slides_generated: Object.keys(rawSlides).length,
    delivery_sequence: deliverySequence
  }
}}];
