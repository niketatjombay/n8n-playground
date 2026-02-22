// FMT Script for Group N — Generate facilitator scripts + delivery notes
// Replace GROUP_KEY and GROUP_NUM with actual values.
const data = $('7.3_JS_PrepScripts').first().json;
const group = data.groups.GROUP_KEY;

const userPrompt = 'Write facilitator delivery scripts for the following slide group.\n\n'
  + '=== SLIDE GROUP ===\n'
  + 'Group: ' + group.name + '\n'
  + 'Slides: ' + group.slide_types + '\n'
  + 'Slide Numbers: ' + group.slides.join(', ') + '\n\n'
  + '=== SLIDE TEMPLATE (Gagné/Kolb/AGES — reference for delivery approach) ===\n'
  + JSON.stringify(group.slide_template) + '\n\n'
  + '=== FINALIZED SLIDE CONTENT (what is ON the slides) ===\n'
  + JSON.stringify(group.content) + '\n\n'
  + '=== BLUEPRINT (strategic intent per slide) ===\n'
  + JSON.stringify(group.blueprint) + '\n\n'
  + '=== QC FLAGS (address these in your scripts) ===\n'
  + JSON.stringify(group.qc_flags) + '\n\n'
  + '=== SESSION OVERVIEW ===\n'
  + JSON.stringify(data.session_overview) + '\n\n'
  + '=== CLIENT CONTEXT ===\n'
  + JSON.stringify(data.client_context) + '\n\n'
  + '=== SESSION CONSTRAINTS ===\n'
  + JSON.stringify(data.session_constraints) + '\n\n'
  + '=== PRE-WORK DATA (tagged for this group — ground scripts in these findings) ===\n'
  + JSON.stringify(group.tagged_pre_work) + '\n\n'
  + '=== INSTRUCTIONS ===\n'
  + '1. Write a facilitator script for EACH slide in this group.\n'
  + '2. Scripts must be standalone — a facilitator should be able to deliver without seeing slides.\n'
  + '3. Include transitions between slides.\n'
  + '4. Address any QC flags in your delivery approach.\n'
  + '5. Ground scripts in pre-work data where available.\n\n'
  + 'Return your output as a single JSON object with one key per slide (slide_N).';

return [{ json: {
  system_prompt: data.script_system_prompt,
  prompt: userPrompt,
  model: 'global.anthropic.claude-sonnet-4-5-20250929-v1:0',
  node_name: 'Script_GroupGROUP_NUM',
  memory_id: data.memory_id,
  knowledge_base_id: data.knowledge_base_id,
  workflow_session_id: data.workflow_session_id,
  workflow_id: data.workflow_id,
  project_id: data.project_id,
  client_id: data.client_id
}}];
