// ERROR FORMAT — Safely extract error info from any upstream node
// Guard: continueErrorOutput forwards the original input item (with all its fields)
// plus an `error` field on failure. Only treat it as a real error if the item
// looks like an intentional error payload (has error_message/error_type/status=error),
// NOT just any item with an `error` field (which can be LLM truncation noise).
const input = $input.first().json;

const isRealError = input.error_message || input.error_type || input.status === 'error';
if (!isRealError) {
  return [];  // Not a structured error — skip (likely continueErrorOutput passthrough)
}

const webhookBody = $('1.1_TRG_Webhook').first().json.body || {};

return [{ json: {
  status: 'error',
  error_message: input.error_message || input.message || 'Workflow execution failed',
  error_type: input.error_type || 'execution_error',
  error_node: input.error_node || 'unknown',
  workflow_session_id: webhookBody.workflow_session_id || input.workflow_session_id || ''
}}];