// 3.3_JS_ParseAgent1A — Thin passthrough for enforcer
// Just unwraps container key and forwards raw data to Haiku normalizer
const response = $input.first().json;
let parsed = response.llm_response || response;
if (typeof parsed === 'string') {
  try { parsed = JSON.parse(parsed); } catch (e) { parsed = {}; }
}

// Unwrap single container key (LLM often wraps in { strategic_blueprint: {...} } etc.)
if (typeof parsed === 'object' && !Array.isArray(parsed)) {
  const keys = Object.keys(parsed);
  if (keys.length === 1 && typeof parsed[keys[0]] === 'object' && !Array.isArray(parsed[keys[0]])) {
    parsed = parsed[keys[0]];
  }
}

// Pass metadata through for enforcer FMT node
const validatedInput = $('1.2_PREP_Input').first().json;
return [{ json: {
  raw_blueprint: parsed,
  memory_id: validatedInput.memory_id,
  knowledge_base_id: validatedInput.knowledge_base_id,
  workflow_session_id: validatedInput.workflow_session_id,
  workflow_id: validatedInput.workflow_id,
  project_id: validatedInput.project_id,
  client_id: validatedInput.client_id
}}];
