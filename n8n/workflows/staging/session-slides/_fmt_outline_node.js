// 2.0_FMT_Outline — Format raw outline text into structured JSON
// Input: $input = 1.5_SUB_DriveUtils (extracted Google Drive text)
// Reads via $(): 1.2_PREP_Input (validated input for metadata passthrough)
//
// If extracted text is too short (<50 chars), skips LLM and returns empty structure.
// Otherwise, sends to Haiku to structure into modules/themes/objectives JSON.

const driveOutput = $input.first().json;
const validatedInput = $('1.2_PREP_Input').first().json;

const extractedText = (driveOutput.extracted_text || driveOutput.data?.extracted_text || '').trim();

// Skip LLM if no meaningful content
if (extractedText.length < 50) {
  return [{ json: {
    formatted_outline: {
      modules: [],
      themes: [],
      objectives: [],
      total_duration: null,
      delivery_format: 'unknown',
      key_frameworks: []
    },
    outline_source: 'empty',
    // Passthrough for downstream nodes that read from this node
    extracted_text: extractedText
  }}];
}

const systemPrompt = `You are a training content structuring assistant. Convert raw document text into a clean structured JSON for use in session design.

Output EXACTLY this schema:
{
  "modules": [
    { "name": "Module title", "topics": ["topic1", "topic2"], "duration_minutes": 90 }
  ],
  "themes": ["theme1", "theme2"],
  "objectives": ["objective1", "objective2"],
  "total_duration": "2 days",
  "delivery_format": "in_person | virtual | hybrid | unknown",
  "key_frameworks": ["framework1", "framework2"]
}

Rules:
- Extract ONLY what is explicitly in the document. Do NOT invent content.
- If duration is not specified, use null for that module's duration_minutes.
- If delivery format is not mentioned, use "unknown".
- themes: extract 3-7 overarching development themes.
- key_frameworks: extract named models, frameworks, or methodologies mentioned.
- Max 2000 characters total output.
- Return ONLY the JSON object — no markdown, no commentary.`;

const userPrompt = 'Structure the following training content outline into the required JSON format.\n\n'
  + 'DOCUMENT TEXT:\n'
  + extractedText;

return [{ json: {
  system_prompt: systemPrompt,
  prompt: userPrompt,
  model: 'global.anthropic.claude-haiku-4-5-20251001-v1:0',
  node_name: 'OutlineFormatter',
  memory_id: validatedInput.memory_id,
  knowledge_base_id: validatedInput.knowledge_base_id,
  workflow_session_id: validatedInput.workflow_session_id,
  workflow_id: validatedInput.workflow_id,
  project_id: validatedInput.project_id,
  client_id: validatedInput.client_id,
  // Passthrough for downstream
  extracted_text: extractedText
}}];
