// 2.5b_FMT_KBSearch2 — Format KB search prompt (slides 6-10)
// v2: Explicitly requests Drive URLs from AgentCore.
// Finds 5 content units relevant to slides 6-10 using outline alignment.

const validatedInput = $('1.2_PREP_Input').first().json;
const projectDetails = validatedInput.project_details || {};
const sessionConstraints = validatedInput.session_constraints || {};

let outlineAlignment = {};
let totalSlides = 17;
try {
  const alignData = $('2.0d_JS_AlignOutline').first().json;
  outlineAlignment = alignData.outline_alignment || {};
  totalSlides = alignData.total_slides || 17;
} catch(e) { outlineAlignment = {}; }

// KB search 2: middle third of slides
const searchStart2 = Math.ceil(totalSlides / 3) + 1;
const searchEnd2 = Math.ceil(totalSlides * 2 / 3);

const slideExcerpts = [];
for (let i = searchStart2; i <= searchEnd2; i++) {
  const key = 'slide_' + i;
  const entry = outlineAlignment[key] || {};
  if (entry.has_outline_evidence && entry.outline_excerpt) {
    slideExcerpts.push('Slide ' + i + ' (' + (entry.outline_section || '') + '): ' + entry.outline_excerpt);
  }
}

const preWorkMeta = validatedInput.pre_work_metadata || {};
const competencies = Array.isArray(preWorkMeta.competencies) ? preWorkMeta.competencies : [];
const themes = Array.isArray(preWorkMeta.development_themes) ? preWorkMeta.development_themes : [];
const fallbackTerms = [...competencies, ...themes].filter(Boolean).join(', ');

const systemPrompt = 'You are a knowledge base search assistant at Jombay. '
  + 'Search for frameworks, models, and reusable content units relevant to the specified slides. '
  + 'Call search_knowledge_base with targeted queries based on the slide content provided.\n\n'
  + 'RULES:\n'
  + '- Find exactly 5 content units most relevant to slides ' + searchStart2 + '-' + searchEnd2 + '\n'
  + '- These slides cover core content, program overview, and objectives — search for substantive frameworks\n'
  + '- Return results as a JSON array of content units\n'
  + '- Include: content_unit_id, title, content_summary, content_type, document_url (MUST be the Google Drive URL of the source document, not S3)\n'
  + '- Do NOT fabricate results — only return what the search tool returns\n'
  + '- For document_url: always use the Google Drive or Google Docs URL (drive.google.com or docs.google.com)';

const userPrompt = 'Search the knowledge base for content relevant to slides ' + searchStart2 + '-' + searchEnd2 + ' of this training session.\n\n'
  + '=== SESSION CONTEXT ===\n'
  + 'Client: ' + (validatedInput.client_name || '') + '\n'
  + 'Industry: ' + (projectDetails.industry || 'Not specified') + '\n'
  + 'Audience level: ' + (projectDetails.seniority_of_cohort || 'Not specified') + '\n'
  + 'Program: ' + (projectDetails.name || 'Not specified') + '\n'
  + 'Session type: ' + (sessionConstraints.sessionType || sessionConstraints.session_type || 'Not specified') + '\n\n'
  + '=== SLIDE CONTENT TO MATCH (slides ' + searchStart2 + '-' + searchEnd2 + ') ===\n'
  + (slideExcerpts.length > 0
    ? slideExcerpts.join('\n\n')
    : 'No outline excerpts available. Search using: ' + (fallbackTerms || 'program name and content type'))
  + '\n\n'
  + '=== INSTRUCTIONS ===\n'
  + '1. Call search_knowledge_base with queries derived from the slide content above\n'
  + '2. Focus on core frameworks, models, and substantive content for the main body of the session\n'
  + '3. Return exactly 5 results as a JSON array with content_unit_id, title, content_summary, content_type, document_url\n'
  + '4. For document_url, always return the Google Drive URL (drive.google.com or docs.google.com) — never return S3 URLs';

return [{ json: {
  system_prompt: systemPrompt,
  prompt: userPrompt,
  model: 'global.anthropic.claude-haiku-4-5-20251001-v1:0',
  node_name: 'KBSearch_Slides' + searchStart2 + 'to' + searchEnd2,
  memory_id: validatedInput.memory_id,
  knowledge_base_id: validatedInput.knowledge_base_id,
  workflow_session_id: validatedInput.workflow_session_id,
  workflow_id: validatedInput.workflow_id,
  project_id: validatedInput.project_id,
  client_id: validatedInput.client_id
}}];
