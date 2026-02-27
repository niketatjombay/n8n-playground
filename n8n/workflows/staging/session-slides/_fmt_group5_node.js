// FMT for Group 5 — Engagement & Application (slides 11-12)
// v2: Targeted content, content-only (no facilitator scripts)
// Replace group_5 and 5 with actual values for each group.
const data = $('4.1_JS_SplitGroups').first().json;
const group = data.groups.group_5;

// Skip LLM call if group has no slides (v3: some groups may be empty)
if (!group || !group.slides || group.slides.length === 0) {
  return [{ json: {
    system_prompt: '',
    prompt: '',
    model: 'global.anthropic.claude-sonnet-4-6',
    node_name: 'Agent2_Group5',
    skip: true,
    memory_id: data.memory_id,
    knowledge_base_id: data.knowledge_base_id,
    workflow_session_id: data.workflow_session_id,
    workflow_id: data.workflow_id,
    project_id: data.project_id,
    client_id: data.client_id
  }}];
}

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
  + 'Session Type: ' + (data.session_constraints.sessionType || data.session_constraints.session_type || 'Not specified')
  + ' | Duration: ' + (data.session_constraints.totalDuration || data.session_constraints.total_duration || 'Not specified') + '\n'
  + 'Tailor content depth and activity design to this session format and duration.\n\n'
  + ((data.session_constraints.additionalInstructions || data.session_constraints.additional_instructions || '')
    ? '=== USER GUIDELINES ===\n'
      + (data.session_constraints.additionalInstructions || data.session_constraints.additional_instructions) + '\n'
      + 'Follow these unless they conflict with the session outline.\n\n'
    : '')
  + '=== CONTENT OUTLINE (client\'s intended content structure) ===\n'
  + JSON.stringify(data.common_context.content_outline || {}) + '\n\n'
  + '=== OUTLINE ALIGNMENT (PRIMARY CONTENT SOURCE) ===\n'
  + 'For each slide, the outline_excerpt is the CLIENT-APPROVED content that MUST appear on this slide.\n'
  + 'Generate content that faithfully delivers this outline content. Do not invent alternative content\n'
  + 'when outline evidence exists. For slides with has_outline_evidence: false, use blueprint direction\n'
  + 'and KB content to generate appropriate standard content.\n\n'
  + JSON.stringify(group.outline_alignment || {}) + '\n\n'
  + '=== PRE-WORK DATA (tagged for this group only) ===\n'
  + JSON.stringify(group.tagged_pre_work) + '\n\n'
  + '=== KB CONTENT PER SLIDE ===\n'
  + (function() {
    let kbSection = '';
    for (const slideKey of group.slides) {
      const slideKB = (group.per_slide_kb || {})[slideKey] || [];
      if (slideKB.length > 0) {
        kbSection += '--- ' + slideKey + ' ---\n';
        for (const unit of slideKB) {
          kbSection += 'KB Unit ' + (unit.content_unit_id || unit.id) + ': ' + (unit.title || '') + '\n'
            + 'Summary: ' + (unit.content_summary || '').substring(0, 300) + '\n\n';
        }
      } else {
        kbSection += '--- ' + slideKey + ': No KB content tagged (generate new content) ---\n';
      }
    }
    return kbSection;
  })() + '\n'
  + '=== INSTRUCTIONS ===\n'
  + '1. Generate content for EACH slide in this group.\n'
  + '2. Ground content in tagged pre-work data where available.\n'
  + '3. For each slide, USE the KB content listed under that slide above. If KB content exists with >=70% fit, set provenance="Reused" and provenance_source to the KB unit ID. If 40-69% fit, set provenance="Adapted". If <40% fit or no KB content, set provenance="New".\n'
  + '4. Follow blueprint direction for each slide.\n'
  + '5. Flag any pre-work gaps, conflicts, or sensitivity concerns.\n\n'
  + 'Return your output as a single JSON object with one key per slide (slide_N).';

return [{ json: {
  system_prompt: data.agent2_system_prompt,
  prompt: userPrompt,
  model: 'global.anthropic.claude-sonnet-4-6',
  node_name: 'Agent2_Group5',
  memory_id: data.memory_id,
  knowledge_base_id: data.knowledge_base_id,
  workflow_session_id: data.workflow_session_id,
  workflow_id: data.workflow_id,
  project_id: data.project_id,
  client_id: data.client_id
}}];
