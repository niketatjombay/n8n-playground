// 7.1e_JS_MergeQC — Merge 3 parallel QC review outputs into unified schema
// Input: $input = items from 7.1d_MRG_QC (Merge node, 3 items appended)
//
// Each item has: { llm_response: { slide_reviews, checklist_compliance?, attention_items?, category } }
// If a QC call failed (onError: continueErrorOutput), it may have an error field instead.
//
// Output matches the shape previously produced by 7.2_SUB_Agent3:
// { review_summary, slide_reviews, checklist_compliance, attention_items }

const items = $input.all();

// Parse each QC result
const results = { structural: null, instructional: null, quality: null };
for (const item of items) {
  const raw = item.json;
  // Skip error items
  if (raw.error || raw.errorMessage) continue;

  let parsed = raw.llm_response || raw;
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed); } catch (e) { continue; }
  }

  const category = parsed.category || 'unknown';
  if (category === 'structural') results.structural = parsed;
  else if (category === 'instructional') results.instructional = parsed;
  else if (category === 'quality') results.quality = parsed;
  else {
    // Try to detect by checking for checklist_compliance (instructional) or severity patterns
    if (parsed.checklist_compliance) results.instructional = parsed;
    else if (!results.structural) results.structural = parsed;
    else if (!results.quality) results.quality = parsed;
  }
}

// Merge slide_reviews from all 3 calls
const mergedReviews = {};
let totalFlags = 0;
let criticalFlags = 0;

for (let i = 1; i <= 17; i++) {
  const key = `slide_${i}`;
  const allFlags = [];

  for (const [cat, result] of Object.entries(results)) {
    if (!result) continue;
    const slideReview = (result.slide_reviews || {})[key];
    if (slideReview && Array.isArray(slideReview.flags)) {
      // Tag each flag with its category
      for (const flag of slideReview.flags) {
        if (!flag.category) flag.category = cat;
        allFlags.push(flag);
      }
    }
  }

  totalFlags += allFlags.length;
  criticalFlags += allFlags.filter(f =>
    (f.severity || '').toLowerCase() === 'critical'
  ).length;

  mergedReviews[key] = {
    status: allFlags.length > 0 ? 'Flagged' : 'Clear',
    flags: allFlags
  };
}

// Determine overall quality
let overallQuality = 'High';
if (criticalFlags > 0) overallQuality = 'Low';
else if (totalFlags > 10) overallQuality = 'Medium';

// Merge checklist_compliance from instructional call
let checklist = (results.instructional || {}).checklist_compliance || {};

// Fallback: if LLM used different top-level keys, construct from available data
if (!checklist.gagne_coverage) {
  const instr = results.instructional || {};
  // Try extracting from instructional_sequence_review or overall_assessment
  if (instr.instructional_sequence_review) {
    const isr = instr.instructional_sequence_review;
    checklist.gagne_coverage = checklist.gagne_coverage || isr.gagne_coverage || isr.gagne_events || '';
    checklist.kolb_coverage = checklist.kolb_coverage || isr.kolb_coverage || isr.kolb_cycle || '';
    checklist.ages_coverage = checklist.ages_coverage || isr.ages_coverage || isr.ages_analysis || '';
  }
  if (instr.overall_assessment) {
    const oa = instr.overall_assessment;
    checklist.provenance_coverage = checklist.provenance_coverage || oa.provenance_coverage || oa.provenance_analysis || '';
    checklist.bloom_compliance = checklist.bloom_compliance || oa.bloom_compliance || oa.bloom_analysis || '';
    // Also try coverage fields at this level
    checklist.gagne_coverage = checklist.gagne_coverage || oa.gagne_coverage || '';
    checklist.kolb_coverage = checklist.kolb_coverage || oa.kolb_coverage || '';
    checklist.ages_coverage = checklist.ages_coverage || oa.ages_coverage || '';
  }
  if (instr.learning_objectives_review) {
    const lor = instr.learning_objectives_review;
    checklist.bloom_compliance = checklist.bloom_compliance || lor.bloom_compliance || lor.bloom_analysis || lor.summary || '';
  }
  // Try content_development_checklist (another variant)
  if (instr.content_development_checklist) {
    const cdc = instr.content_development_checklist;
    checklist.gagne_coverage = checklist.gagne_coverage || cdc.gagne_coverage || cdc.gagne_events || '';
    checklist.kolb_coverage = checklist.kolb_coverage || cdc.kolb_coverage || cdc.kolb_cycle || '';
    checklist.ages_coverage = checklist.ages_coverage || cdc.ages_coverage || cdc.ages || '';
    checklist.provenance_coverage = checklist.provenance_coverage || cdc.provenance_coverage || cdc.provenance || '';
    checklist.bloom_compliance = checklist.bloom_compliance || cdc.bloom_compliance || cdc.bloom || '';
  }
}

// Ensure all expected fields exist
const checklistFinal = {
  gagne_coverage: checklist.gagne_coverage || '',
  kolb_coverage: checklist.kolb_coverage || '',
  ages_coverage: checklist.ages_coverage || '',
  provenance_coverage: checklist.provenance_coverage || '',
  bloom_compliance: checklist.bloom_compliance || ''
};

// Merge attention_items from instructional + quality calls
const attentionItems = [
  ...((results.instructional || {}).attention_items || []),
  ...((results.quality || {}).attention_items || [])
];

return [{ json: {
  review_summary: {
    overall_quality: overallQuality,
    total_flags: totalFlags,
    critical_flags: criticalFlags,
    calls_completed: Object.values(results).filter(Boolean).length
  },
  slide_reviews: mergedReviews,
  checklist_compliance: checklistFinal,
  attention_items: attentionItems,
  // For debugging
  _qc_categories_received: Object.entries(results)
    .filter(([_, v]) => v !== null)
    .map(([k]) => k)
}}];
