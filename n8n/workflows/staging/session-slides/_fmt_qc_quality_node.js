// 7.1c_FMT_QC_Quality — Content quality + compliance review
// Input: $input = 6.4_JS_NormContent (normalized slide content)
// Reads via $(): 3.6_JS_NormBP (normalized blueprint), 1.2_PREP_Input (validated input)

const merged = $input.first().json;
const validatedInput = $('1.2_PREP_Input').first().json;
const agent1 = $('3.6_JS_NormBP').first().json.agent1_output;

const preWorkMeta = validatedInput.pre_work_metadata || {};

// Read coverage report (v3)
const coverageReport = merged.coverage_report || {};
const totalSlides = coverageReport.total_slides_generated || Object.keys(merged.slide_spec || merged.raw_slides || {}).length || 17;

// Build compact blueprint reference
const blueprintRef = {};
const bp = agent1.slide_blueprint || {};
for (let i = 1; i <= totalSlides; i++) {
  const key = `slide_${i}`;
  const entry = bp[key] || {};
  blueprintRef[key] = {
    intent: entry.intent || '',
    key_message: entry.key_message || '',
    kb_units: entry.kb_units_to_use || []
  };
}

const systemPrompt = 'ROLE: Senior COE Reviewer at Jombay. You flag issues — you NEVER fix content.\n\n'
+ 'SCOPE: CONTENT QUALITY AND COMPLIANCE ONLY. Do not review structural completeness or instructional alignment.\n\n'
+ 'A slide that could belong to any client is a quality failure. Generic content is a flag, not a pass.\n\n'
+ 'For every flag, provide:\n'
+ '1. What the issue is\n'
+ '2. Why it matters for the facilitator or learner\n'
+ '3. Direction for the fix (not the fix itself)\n\n'
+ '=== CONTENT QUALITY CHECKS (for EACH of ' + totalSlides + ' slides) ===\n\n'
+ '1. Client-specific: references client name, industry context, audience reality\n'
+ '2. Headlines: punchy, not generic ("Your Leadership Journey" is generic)\n'
+ '3. Pre-work findings referenced where tagged in blueprint\n'
+ '4. Wise (grounded in theory + context), witty (energy), relevant (client-specific)\n'
+ '5. KB content used where tagged in blueprint\n\n'
+ '=== COMPLIANCE CHECKS ===\n\n'
+ '6. No outcome guarantees ("You WILL become..." is a guarantee)\n'
+ '7. Sensitivity concerns flagged (cultural, organizational, participant-related)\n'
+ '8. Pre-work gaps/conflicts/ambiguity surfaced in reviewer_flags\n\n'
+ '=== OUTLINE COVERAGE CHECK ===\n'
+ 'Coverage: ' + (coverageReport.coverage_percentage || 'N/A') + '%\n'
+ ((coverageReport.missing_items || []).length > 0
  ? 'MISSING OUTLINE ITEMS (flag these as Critical):\n'
    + (coverageReport.missing_items || []).map(m => '- ' + m.slide_id + ': ' + m.outline_topic + ' (' + m.outline_ref + ')').join('\n') + '\n\n'
  : 'All outline items covered.\n\n')
+ '=== SESSION TYPE COMPLIANCE ===\n'
+ 'Session type: ' + (validatedInput.session_constraints?.sessionType || validatedInput.session_constraints?.session_type || 'Not specified') + '\n'
+ '- Virtual: flag any reference to physical movement, handouts, room setup\n'
+ '- In-person: flag any reference to breakout rooms, screen sharing, chat polling\n\n'
+ '=== FLAG FORMAT ===\n'
+ '{ "flag": "what", "reason": "why", "suggested_fix": "direction", "severity": "Critical|Medium|Low" }\n\n'
+ 'Severity guide:\n'
+ '  Critical = blocks delivery (generic content, outcome guarantee)\n'
+ '  Medium   = affects quality (weak headline, missing pre-work reference)\n'
+ '  Low      = cosmetic (minor wording, KB unit not used)\n\n'
+ '=== OUTPUT SCHEMA ===\n'
+ '{\n'
+ '  "slide_reviews": {\n'
+ '    "slide_1": { "status": "Clear|Flagged", "flags": [] },\n'
+ '    ... (all ' + totalSlides + ' slides)\n'
+ '  },\n'
+ '  "attention_items": [\n'
+ '    { "slide": "slide_N", "issue": "string", "priority": "High|Medium|Low" }\n'
+ '  ],\n'
+ '  "category": "quality"\n'
+ '}\n\n'
+ 'RULES:\n'
+ '- NEVER rewrite content — only flag\n'
+ '- NEVER skip a slide — review all ' + totalSlides + '\n'
+ '- Be concise — 0-2 flags per slide is typical\n'
+ '- Return ONLY the JSON — no markdown';

const userPrompt = 'Review content quality and compliance of the following slide content.\n\n'
  + '=== SLIDE CONTENT (review every slide) ===\n'
  + JSON.stringify(merged.slide_spec) + '\n\n'
  + '=== BLUEPRINT REFERENCE (strategic intent per slide) ===\n'
  + JSON.stringify(blueprintRef) + '\n\n'
  + '=== CLIENT CONTEXT ===\n'
  + 'Client: ' + validatedInput.client_name + '\n'
  + 'Industry: ' + (validatedInput.project_details.industry || '') + '\n'
  + 'Audience: ' + (validatedInput.project_details.seniority_of_cohort || '') + '\n'
  + 'Program: ' + (validatedInput.project_details.name || '') + '\n\n'
  + '=== PRE-WORK SUMMARY (verify findings are reflected in content) ===\n'
  + 'Competencies: ' + (preWorkMeta.competencies || []).join(', ') + '\n'
  + 'Development themes: ' + (preWorkMeta.development_themes || []).join(', ') + '\n'
  + 'Total pre-work slides: ' + (preWorkMeta.total_slides || 0) + '\n\n'
  + 'Return your review as a single JSON object.';

return [{ json: {
  system_prompt: systemPrompt,
  prompt: userPrompt,
  model: 'global.anthropic.claude-sonnet-4-6',
  node_name: 'QC_Quality',
  memory_id: validatedInput.memory_id,
  knowledge_base_id: validatedInput.knowledge_base_id,
  workflow_session_id: validatedInput.workflow_session_id,
  workflow_id: validatedInput.workflow_id,
  project_id: validatedInput.project_id,
  client_id: validatedInput.client_id
}}];
