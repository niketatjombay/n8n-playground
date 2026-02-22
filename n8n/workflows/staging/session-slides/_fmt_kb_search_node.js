// 2.5_FMT_KBSearch — Format KB search prompt
// v2: Fixed field references to match 1.2_PREP_Input output,
//     improved prompt for targeted search with concise results.
//
// Bugs fixed:
//   - pre_work_summary → pre_work_metadata (correct field name)
//   - metadata.competencies → preWorkMeta.competencies (direct access)
//   - metadata.themes → preWorkMeta.development_themes
//   - projectDetails.seniority → seniority_of_cohort
//   - projectDetails.project_name → name

const validatedInput = $('1.2_PREP_Input').first().json;
const preWorkMeta = validatedInput.pre_work_metadata || {};
const projectDetails = validatedInput.project_details || {};
const sessionConstraints = validatedInput.session_constraints || {};

// Build search terms from pre-work metadata (already extracted in step 1+2)
const competencies = Array.isArray(preWorkMeta.competencies) ? preWorkMeta.competencies : [];
const themes = Array.isArray(preWorkMeta.development_themes) ? preWorkMeta.development_themes : [];

const searchTerms = [...competencies, ...themes].filter(Boolean);
const competencyList = searchTerms.join(', ');

const systemPrompt = 'You are a knowledge base search assistant at Jombay. '
  + 'Search for frameworks, models, and reusable content units relevant to the session context. '
  + 'Call search_knowledge_base with targeted queries based on the competencies and themes provided.\n\n'
  + 'RULES:\n'
  + '- Search for each competency/theme — use 2-3 focused search calls\n'
  + '- Return results as a JSON array of content units\n'
  + '- Include: content_unit_id, title, content_summary, content_type\n'
  + '- Do NOT fabricate results — only return what the search tool returns';

const userPrompt = 'Search the knowledge base for Jombay content relevant to this training session.\n\n'
  + '=== SESSION CONTEXT ===\n'
  + 'Client: ' + validatedInput.client_name + '\n'
  + 'Industry: ' + (projectDetails.industry || 'Not specified') + '\n'
  + 'Audience level: ' + (projectDetails.seniority_of_cohort || 'Not specified') + '\n'
  + 'Program: ' + (projectDetails.name || 'Not specified') + '\n'
  + 'Content type: ' + (projectDetails.content_type || 'Not specified') + '\n'
  + 'Session type: ' + (sessionConstraints.sessionType || sessionConstraints.session_type || 'Not specified') + '\n\n'
  + '=== COMPETENCIES & THEMES TO SEARCH ===\n'
  + (competencyList || 'No specific competencies extracted — search using program name and content type') + '\n\n'
  + '=== INSTRUCTIONS ===\n'
  + '1. Call search_knowledge_base for each major competency/theme\n'
  + '2. Search for frameworks, models, assessment tools, and content summaries\n'
  + '3. Return all results as a JSON array with content_unit_id, title, content_summary';

return [{ json: {
  system_prompt: systemPrompt,
  prompt: userPrompt,
  model: 'global.anthropic.claude-haiku-4-5-20251001-v1:0',
  node_name: 'KBPreFetch',
  memory_id: validatedInput.memory_id,
  knowledge_base_id: validatedInput.knowledge_base_id,
  workflow_session_id: validatedInput.workflow_session_id,
  workflow_id: validatedInput.workflow_id,
  project_id: validatedInput.project_id,
  client_id: validatedInput.client_id
}}];
