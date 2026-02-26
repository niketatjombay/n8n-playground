// 2.7b_JS_MergeKB — Merge 3 parallel KB search results
// Input: 3 items from 2.7a_MRG_KB (wait node)
// Output: Deduplicated KB results array, capped at 15

const items = $input.all();
let allResults = [];

for (const item of items) {
  const data = item.json;
  const llmResponse = data.llm_response || data;

  let results = [];
  if (Array.isArray(llmResponse)) {
    results = llmResponse;
  } else if (typeof llmResponse === 'object' && llmResponse !== null) {
    results = llmResponse.search_results
      || llmResponse.knowledge_base_results
      || llmResponse.results
      || llmResponse.content_units
      || llmResponse.kb_results
      || [];
    if (results.length === 0 && llmResponse.data) {
      results = Array.isArray(llmResponse.data) ? llmResponse.data : [llmResponse.data];
    }
  }

  if (!Array.isArray(results)) results = [results];
  allResults.push(...results);
}

// Deduplicate by content_unit_id
const seen = {};
const deduped = [];
for (const r of allResults) {
  if (!r || typeof r !== 'object') continue;
  const id = r.content_unit_id || r.id || '';
  if (!id || seen[id]) continue;
  seen[id] = true;

  // Strip s3_location and redundant URL fields, resolve document_url
  const { s3_location, result_index, source_url, drive_url, url, ...rest } = r;

  // Collect all candidate URLs
  const candidates = [
    rest.document_url,
    source_url,
    drive_url,
    url,
    s3_location
  ].filter(Boolean);

  // Prefer Drive URLs over everything else
  const isDriveUrl = (u) =>
    typeof u === 'string' && (u.includes('drive.google.com') || u.includes('docs.google.com'));

  rest.document_url = candidates.find(isDriveUrl) || candidates[0] || '';

  if (!rest.content_type) {
    const title = (rest.title || '').toLowerCase();
    if (title.includes('framework') || title.includes('model')) rest.content_type = 'framework';
    else if (title.includes('case study') || title.includes('scenario')) rest.content_type = 'case_study';
    else if (title.includes('exercise') || title.includes('activity')) rest.content_type = 'activity';
    else if (title.includes('video') || title.includes('watch')) rest.content_type = 'video';
    else if (title.includes('assessment') || title.includes('tool')) rest.content_type = 'tool';
    else rest.content_type = 'reference';
  }
  deduped.push(rest);
}

const kbResults = deduped.slice(0, 15);

return [{ json: {
  status: 'kb_merged',
  kb_results: kbResults,
  kb_result_count: kbResults.length,
  sources_merged: items.length
}}];
