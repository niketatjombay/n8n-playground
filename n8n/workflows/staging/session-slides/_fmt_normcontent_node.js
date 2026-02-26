// 6.2_FMT_NormContent — Format Content normalizer prompt for Haiku
const raw = $input.first().json;
const defaultSlideTemplate = $('1.2_PREP_Input').first().json.slide_template || {};

// Read dynamic slide template from alignment node (Phase 2: dynamic slide count)
let slideTemplate = defaultSlideTemplate;
try {
  const dynTemplate = $('2.0d_JS_AlignOutline').first().json.slide_template || {};
  if (Object.keys(dynTemplate).length > 0) slideTemplate = dynTemplate;
} catch(e) {}

// Build compact slide type reference
const slideCount = Object.keys(slideTemplate).length || 17;
const slideTypes = {};
for (let i = 1; i <= slideCount; i++) {
  const t = slideTemplate['slide_' + i] || {};
  slideTypes['slide_' + i] = t.type || '';
}

const systemPrompt = `ROLE: JSON Schema Normalizer for training slide content.

RULES:
- Output MUST be a JSON object with keys slide_1 through slide_${slideCount}
- Each slide MUST have ALL canonical fields (see schema below)
- Map alternative key names to canonical names
- Do NOT invent content — only reorganize what exists
- If a slide is completely missing, create a skeleton with empty fields and a MISSING reviewer flag

TARGET SCHEMA (per slide):
{
  "slide_N": {
    "slide_number": "slide_N",
    "slide_type": "from reference data",
    "headline": "string (from title/heading/slide_title/quote_text)",
    "slide_title": "string",
    "subtext": "string (from subtitle/subheadline/subheading/tagline)",
    "bullets": ["string array, max 8 items (from content_blocks/body_content/on_screen_text)"],
    "visual_guidance": "string (from visual_direction/visual_cues/visual_elements)",
    "key_message": "string",
    "activity": {
      "has_activity": "boolean",
      "instructions": "string or null",
      "duration_minutes": "integer or null",
      "debrief_questions": ["string array"]
    },
    "provenance": "New|Reused|Adapted",
    "provenance_source": "string or empty",
    "reviewer_flags": [{"flag": "string", "reason": "string"}]
  }
}

SLIDE TYPE REFERENCE: ${JSON.stringify(slideTypes)}

COMMON REMAPPING PATTERNS:
- "heading" or "title" -> headline AND slide_title
- "subheading" or "subtitle" or "subheadline" or "tagline" -> subtext
- "content_blocks" (array of objects with items/heading) -> flatten to bullets array
- "body_content" or "on_screen_text" (string) -> split by newlines into bullets
- "visual_direction" or "visual_cues" or "visual_elements" -> visual_guidance
- "key_messages" (array) -> join with " | " into key_message (string)
- "flags" or "sensitivity_flags" -> reviewer_flags

FIELDS TO PRESERVE AS-IS (do NOT rename, remove, or merge these):
- Facilitator fields: facilitator_script, facilitator_notes, facilitator_instruction, facilitator_prompt, talking_points, debrief_questions
- Framework fields: gagne, kolb, ages
- Provenance fields: provenance, provenance_source
- Visual fields: visual_guidance, visual_direction, layout_recommendation, graphic_notes, color_cues
- Activity fields: activity_name, purpose, instructions, duration
- Any other extra fields (content_blocks, experience_anchors, body_sections, etc.) — keep alongside canonical fields`;

// Truncate raw data to fit within Haiku context limits (~30K chars max for user prompt)
let rawStr = JSON.stringify(raw.raw_slides || raw);
if (rawStr.length > 20000) rawStr = rawStr.substring(0, 20000) + '... [TRUNCATED]';

const userPrompt = `Normalize this merged content output to match the TARGET SCHEMA. Return ONLY valid JSON, no markdown.

RAW INPUT:
${rawStr}`;

const validatedInput = $('1.2_PREP_Input').first().json;
return [{ json: {
  system_prompt: systemPrompt,
  prompt: userPrompt,
  model: 'global.anthropic.claude-haiku-4-5-20251001-v1:0',
  node_name: 'NormContent',
  memory_id: validatedInput.memory_id,
  knowledge_base_id: validatedInput.knowledge_base_id,
  workflow_session_id: validatedInput.workflow_session_id,
  workflow_id: validatedInput.workflow_id,
  project_id: validatedInput.project_id,
  client_id: validatedInput.client_id
}}];
