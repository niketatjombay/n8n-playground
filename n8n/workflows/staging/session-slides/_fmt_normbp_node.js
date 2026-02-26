// 3.4_FMT_NormBP — Format Blueprint normalizer prompt for Haiku
// Input: raw parsed blueprint from 3.3_JS_ParseAgent1A

const raw = $input.first().json;
const rawBlueprint = raw.raw_blueprint || raw;
const rawJson = JSON.stringify(rawBlueprint);

const systemPrompt = `ROLE: JSON Schema Normalizer. You receive raw LLM output and MUST reshape it to match the TARGET SCHEMA exactly.

RULES:
- Output MUST match TARGET SCHEMA — same keys, same types, same nesting
- If a field exists in input under a different key name, MAP it to the correct key
- If a field is completely missing, provide a reasonable default:
  - Strings: empty string ""
  - Arrays: empty array [] EXCEPT experience_anchors which MUST have at least 1 entry per slide
  - Numbers: null
  - Objects: empty object with required sub-keys
- Do NOT invent new content — only reorganize, rename, and normalize what exists
- ALL 17 slides (slide_1 through slide_17) MUST be present in slide_blueprint
- experience_anchors: Extract from ANY field that contains real-world situations, client context, or participant references. If truly nothing exists, generate 1 anchor from the slide's intent/content_direction.

TARGET SCHEMA:
{
  "session_overview": {
    "workshop_title": "string",
    "key_themes": ["string array, 3-5 items"],
    "learning_objectives": [{"objective": "string", "bloom_level": "Remember|Understand|Apply|Analyze|Evaluate|Create"}],
    "audience_summary": "string, 1-2 sentences",
    "session_arc_narrative": "string, 3-5 sentences describing emotional/cognitive journey",
    "application_moments": [{"slide": "integer", "type": "embedded|formal_activity|commitment", "description": "string"}]
  },
  "slide_blueprint": {
    "slide_1": {
      "intent": "string, what this slide achieves",
      "content_direction": "string, what to put on this slide",
      "key_message": "string, one takeaway",
      "experience_anchors": ["string, 1-3 real-world situations (NEVER empty)"],
      "kb_units_to_use": ["string, content unit IDs"],
      "facilitation_design": {
        "tension_level": "High|Medium|Low",
        "rationale": "string",
        "signal": "string"
      },
      "flags": ["string, concerns or gaps"]
    }
  },
  "mandatory_jombay_frameworks": [
    {"framework_name": "string", "target_slides": ["integer array"], "why": "string"}
  ],
  "sensitivity_log": [
    {"slide_number": "integer", "concern": "string", "action": "string"}
  ]
}

COMMON REMAPPING PATTERNS:
- "session_blueprint" or "strategic_blueprint" -> use as source for slide_blueprint
- "slides" (array) -> convert to slide_blueprint object keyed by slide_N
- "session_narrative" or "meta" -> map to session_overview
- "session_arc" or "design_rationale" -> map to session_arc_narrative
- "objectives" or "session_objectives" -> map to learning_objectives
- If bloom_level missing, infer from the verb: apply->Apply, analyze->Analyze, create->Create, evaluate->Evaluate, understand->Understand, remember->Remember. Default: Apply.
- Any "experience_anchors" or "real_world_situations" or "context_connections" -> map to experience_anchors
- "mandatory_frameworks" -> map to mandatory_jombay_frameworks
- "sensitivity_considerations" -> map to sensitivity_log`;

const userPrompt = `Normalize this raw LLM output to match the TARGET SCHEMA exactly. Return ONLY valid JSON, no markdown.

RAW INPUT:
${rawJson}`;

return [{ json: {
  system_prompt: systemPrompt,
  prompt: userPrompt,
  model: 'global.anthropic.claude-haiku-4-5-20251001-v1:0',
  node_name: 'NormBP',
  memory_id: raw.memory_id || '',
  knowledge_base_id: raw.knowledge_base_id || '',
  workflow_session_id: raw.workflow_session_id || '',
  workflow_id: raw.workflow_id || '',
  project_id: raw.project_id || '',
  client_id: raw.client_id || ''
}}];
