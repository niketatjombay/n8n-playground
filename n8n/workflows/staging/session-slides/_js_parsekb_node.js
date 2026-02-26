// 2.7_JS_ParseKB — Parse KB results (reads from merged KB)
// v3: Now reads from 2.7b_JS_MergeKB (merged 3 parallel searches)
// instead of a single SUB output. The merge node already handles
// parsing, dedup, and content_type inference.

const mergedKB = $input.first().json;

return [{ json: {
  status: mergedKB.status || 'kb_fetched',
  kb_results: mergedKB.kb_results || [],
  kb_result_count: mergedKB.kb_result_count || 0
}}];
