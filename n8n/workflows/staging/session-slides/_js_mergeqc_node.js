// 7.1e_JS_MergeQC — Thin collector: merge 3 QC outputs into raw object
// Input: $input = items from 7.1d_MRG_QC (Merge node, 3 items appended)
// No normalization — that's handled by the Haiku enforcer downstream.

const items = $input.all();
const results = [];
for (const item of items) {
  const raw = item.json;
  if (raw.error || raw.errorMessage) continue;
  let parsed = raw.llm_response || raw;
  if (typeof parsed === 'string') {
    try { parsed = JSON.parse(parsed); } catch (e) { continue; }
  }
  results.push(parsed);
}
return [{ json: { raw_qc_results: results, calls_received: results.length }}];
