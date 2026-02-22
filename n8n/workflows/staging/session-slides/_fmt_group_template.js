// FMT for Group N — v2: Targeted content, content-only (no facilitator scripts)
// Replace GROUP_KEY and GROUP_NUM with actual values for each group.
const data = $('4.1_JS_SplitGroups').first().json;
const group = data.groups.GROUP_KEY;

const userPrompt = 'Generate on-slide content for the following slide group.\n\n'
  + '=== SLIDE GROUP ===\n'
  + 'Group: ' + group.name + '\n'
  + 'Slides: ' + group.slide_types + '\n'
  + 'Slide Numbers: ' + group.slides.join(', ') + '\n\n'
  + '=== SLIDE TEMPLATE (Gagné/Kolb/AGES — FIXED, do not re-assign) ===\n'
  + JSON.stringify(group.slide_template) + '\n\n'
  + '=== BLUEPRINT FOR THIS GROUP ===\n'
  + JSON.stringify(group.blueprints) + '\n\n'
  + '=== SESSION OVERVIEW ===\n'
  + JSON.stringify(data.common_context.session_overview) + '\n\n'
  + '=== CLIENT CONTEXT ===\n'
  + JSON.stringify(data.client_context) + '\n\n'
  + '=== SESSION CONSTRAINTS ===\n'
  + JSON.stringify(data.session_constraints) + '\n\n'
  + '=== PRE-WORK DATA (tagged for this group only) ===\n'
  + JSON.stringify(group.tagged_pre_work) + '\n\n'
  + '=== KB CONTENT (tagged for this group only) ===\n'
  + JSON.stringify(group.tagged_kb) + '\n\n'
  + '=== INSTRUCTIONS ===\n'
  + '1. Generate content for EACH slide in this group.\n'
  + '2. Ground content in tagged pre-work data where available.\n'
  + '3. Align with tagged KB content units — apply 70% provenance rule.\n'
  + '4. Follow blueprint direction for each slide.\n'
  + '5. Flag any pre-work gaps, conflicts, or sensitivity concerns.\n\n'
  + 'Return your output as a single JSON object with one key per slide (slide_N).';

return [{ json: {
  system_prompt: data.agent2_system_prompt,
  prompt: userPrompt,
  model: 'global.anthropic.claude-sonnet-4-5-20250929-v1:0',
  node_name: 'Agent2_GroupGROUP_NUM',
  memory_id: data.memory_id,
  knowledge_base_id: data.knowledge_base_id,
  workflow_session_id: data.workflow_session_id,
  workflow_id: data.workflow_id,
  project_id: data.project_id,
  client_id: data.client_id
}}];
