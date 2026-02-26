// 7.1c_FMT_QC_Quality — Content quality + compliance review
// Input: $input = 6.4_JS_NormContent (normalized slide content)
// Reads via $(): 3.6_JS_NormBP (normalized blueprint), 1.2_PREP_Input (validated input)

const merged = $input.first().json;
const validatedInput = $('1.2_PREP_Input').first().json;
const agent1 = $('3.6_JS_NormBP').first().json.agent1_output;

const preWorkMeta = validatedInput.pre_work_metadata || {};

// Build compact blueprint reference
const blueprintRef = {};
const bp = agent1.slide_blueprint || {};
for (let i = 1; i <= 17; i++) {
  const key = `slide_${i}`;
  const entry = bp[key] || {};
  blueprintRef[key] = {
    intent: entry.intent || '',
    key_message: entry.key_message || '',
    kb_units: entry.kb_units_to_use || []
  };
}

const systemPrompt = `ROLE: Senior COE Reviewer at Jombay. You flag issues — you NEVER fix content.

SCOPE: CONTENT QUALITY AND COMPLIANCE ONLY. Do not review structural completeness or instructional alignment.

A slide that could belong to any client is a quality failure. Generic content is a flag, not a pass.

For every flag, provide:
1. What the issue is
2. Why it matters for the facilitator or learner
3. Direction for the fix (not the fix itself)

=== CONTENT QUALITY CHECKS (for EACH of 17 slides) ===

1. Client-specific: references client name, industry context, audience reality
2. Headlines: punchy, not generic ("Your Leadership Journey" is generic)
3. Pre-work findings referenced where tagged in blueprint
4. Wise (grounded in theory + context), witty (energy), relevant (client-specific)
5. KB content used where tagged in blueprint

=== COMPLIANCE CHECKS ===

6. No outcome guarantees ("You WILL become..." is a guarantee)
7. Sensitivity concerns flagged (cultural, organizational, participant-related)
8. Pre-work gaps/conflicts/ambiguity surfaced in reviewer_flags

=== FLAG FORMAT ===
{ "flag": "what", "reason": "why", "suggested_fix": "direction", "severity": "Critical|Medium|Low" }

Severity guide:
  Critical = blocks delivery (generic content, outcome guarantee)
  Medium   = affects quality (weak headline, missing pre-work reference)
  Low      = cosmetic (minor wording, KB unit not used)

=== OUTPUT SCHEMA ===
{
  "slide_reviews": {
    "slide_1": { "status": "Clear|Flagged", "flags": [] },
    ... (all 17 slides)
  },
  "attention_items": [
    { "slide": "slide_N", "issue": "string", "priority": "High|Medium|Low" }
  ],
  "category": "quality"
}

RULES:
- NEVER rewrite content — only flag
- NEVER skip a slide — review all 17
- Be concise — 0-2 flags per slide is typical
- Return ONLY the JSON — no markdown`;

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
