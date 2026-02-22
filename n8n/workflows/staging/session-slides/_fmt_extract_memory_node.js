// 2.1_FMT_ExtractMemory — Build memory extraction prompt
// v2: Tight output cap (2K chars), concrete example, concise 6-key schema
//
// Problem solved: v1 Haiku returned 27+ keys and 48K chars (546s).
// Fix: Explicit char limit, example output, stricter instructions.

const input = $('1.2_PREP_Input').first().json;

const memory = (input.current_project_memory || '').trim();

const systemPrompt = `You are a data extraction assistant. Extract session-design-relevant facts from project memory.

OUTPUT RULES:
- Return ONLY valid JSON with EXACTLY 6 keys (listed below). No other keys.
- Each key maps to an array of short strings (1 sentence each, max 15 words).
- Max 5 items per array. If more exist, keep the 5 most relevant.
- Empty category → empty array [].
- Your ENTIRE JSON response must be under 2000 characters. This is a hard limit.
- Do NOT add commentary, explanation, or markdown — ONLY the JSON object.

THE 6 KEYS:
1. "previous_sessions" — context from earlier sessions in this program
2. "established_frameworks" — models/frameworks already introduced to this cohort
3. "facilitator_preferences" — facilitator delivery style or preferences
4. "client_delivery_notes" — client-specific constraints or delivery preferences
5. "participant_pain_points" — specific challenges surfaced by participants
6. "real_world_situations" — real-world scenarios usable as experience anchors

IGNORE: admin notes, meeting logistics, scheduling, timelines, project management, assessment setup, billing, stakeholder names.

EXAMPLE OUTPUT:
{
  "previous_sessions": ["Day 1 covered self-awareness using Johari Window", "Participants completed 360-degree feedback review"],
  "established_frameworks": ["GROW coaching model introduced in session 1", "Situational Leadership II framework"],
  "facilitator_preferences": ["Prefers storytelling over lecture", "Uses breakout rooms for reflection"],
  "client_delivery_notes": ["No role-play — client considers it too confrontational", "Must reference their internal competency framework"],
  "participant_pain_points": ["Struggle with giving upward feedback", "Feel overwhelmed by competing priorities"],
  "real_world_situations": ["Team leads managing hybrid remote teams", "Recent org restructure causing role ambiguity"]
}`;

// Embed schema instructions in user prompt too (system_prompt may be ignored by some API configs)
const schemaInstructions = `Extract session-design-relevant information from the project memory below.

REQUIRED OUTPUT FORMAT — Return ONLY a JSON object with EXACTLY these 6 keys:
1. "previous_sessions" — context from earlier sessions
2. "established_frameworks" — models/frameworks already introduced
3. "facilitator_preferences" — delivery style preferences
4. "client_delivery_notes" — client-specific constraints
5. "participant_pain_points" — challenges surfaced by participants
6. "real_world_situations" — real-world scenarios as experience anchors

RULES:
- Each key maps to an array of short strings (max 15 words each, max 5 items per array)
- Empty category → empty array []
- ENTIRE response must be under 2000 characters
- Return ONLY the JSON object — no markdown, no code fences, no commentary`;

const prompt = (!memory || memory.length < 50)
  ? 'No project memory available. Return empty arrays for all 6 keys:\n"previous_sessions", "established_frameworks", "facilitator_preferences", "client_delivery_notes", "participant_pain_points", "real_world_situations"'
  : `${schemaInstructions}\n\nPROJECT MEMORY:\n${memory}`;

return [{ json: {
  system_prompt: systemPrompt,
  prompt: prompt,
  model: 'global.anthropic.claude-haiku-4-5-20251001-v1:0',
  node_name: 'ExtractMemory',
  memory_id: input.memory_id,
  knowledge_base_id: input.knowledge_base_id,
  workflow_session_id: input.workflow_session_id,
  workflow_id: input.workflow_id,
  project_id: input.project_id,
  client_id: input.client_id
}}];
