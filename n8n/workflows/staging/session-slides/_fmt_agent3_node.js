// 7.1_FMT_Agent3 — v2: QC Content Review (content-only, no facilitator scripts)
// v1 problem: 69K token prompt (slide_spec + facilitator_scripts + full pre-work + full agent1) → 300s TIMEOUT
// v2 fix: Content-only review (~8-11K tokens). Scripts reviewed separately after step 9.

const merged = $input.first().json;
const validatedInput = $('1.2_PREP_Input').first().json;
const agent1 = $('3.3_JS_ParseAgent1A').first().json.agent1_output;

const slideTemplate = validatedInput.slide_template || {};
const preWorkMeta = validatedInput.pre_work_metadata || {};

const systemPrompt = `ROLE: Senior COE Reviewer at Jombay (HR L&D consulting). You flag issues — you NEVER fix content.

You are reviewing SLIDE CONTENT ONLY (facilitator scripts are generated separately and reviewed later).

For every flag, provide:
1. What the issue is
2. Why it matters for the facilitator or learner
3. Direction for the fix (not the fix itself)

A slide that could belong to any client is a quality failure. Generic content is a flag, not a pass.

=== REVIEW CRITERIA ===

For EACH of the 17 slides, check:

A. STRUCTURAL COMPLETENESS
   - Has: slide_title, headline, subtext, bullets, visual_guidance
   - Activity slides: has_activity=true with instructions + duration

B. INSTRUCTIONAL ALIGNMENT
   - Slide type matches the blueprint intent
   - Gagné event honored (reference slide_template)
   - Kolb stage embedded where assigned (slides 9, 11, 12, 16)
   - AGES function applied

C. CONTENT QUALITY
   - Wise (grounded in theory + context), witty (energy), relevant (client-specific)
   - Bullets: max 4, each under 12 words
   - Headlines: punchy, not generic
   - Pre-work findings referenced where tagged

D. COMPLIANCE
   - No outcome guarantees
   - Sensitivity concerns flagged
   - Pre-work gaps/conflicts/ambiguity surfaced in reviewer_flags

E. PROVENANCE
   - Every slide has provenance tag (New/Reused/Adapted)
   - KB content used where tagged

=== FLAG FORMAT ===
{ "flag": "what", "reason": "why", "suggested_fix": "direction", "category": "structural | instructional | content | compliance | provenance" }

=== RULES ===
- NEVER rewrite content — only flag
- NEVER skip a slide — review all 17
- Every flag needs all three elements (what, why, fix direction)

=== OUTPUT SCHEMA ===
{
  "review_summary": {
    "overall_quality": "High | Medium | Low",
    "total_flags": 0,
    "critical_flags": 0
  },
  "slide_reviews": {
    "slide_1": {
      "status": "Clear | Flagged",
      "flags": [{ "flag": "string", "reason": "string", "suggested_fix": "string", "category": "string" }]
    },
    ... (all 17 slides)
  },
  "checklist_compliance": {
    "gagne_coverage": "All 9 events covered | Missing: [list]",
    "kolb_coverage": "All 4 stages covered | Missing: [list]",
    "provenance_coverage": "N/17 slides tagged"
  },
  "attention_items": [
    { "slide": "slide_N", "issue": "string", "priority": "High | Medium | Low" }
  ]
}

IMPORTANT:
- Return EXACTLY these 4 keys: review_summary, slide_reviews, checklist_compliance, attention_items
- slide_reviews must have entries for ALL 17 slides
- Be concise — 1-2 flags per slide is typical, 0 for clean slides`;

// Build compact blueprint reference (just intent + key_message per slide)
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

const userPrompt = 'Review the following slide content for quality, completeness, and instructional alignment.\n\n'
  + '=== SLIDE CONTENT (review every slide) ===\n'
  + JSON.stringify(merged.slide_spec) + '\n\n'
  + '=== SLIDE TEMPLATE (Gagné/Kolb/AGES reference — these are FIXED) ===\n'
  + JSON.stringify(slideTemplate) + '\n\n'
  + '=== BLUEPRINT REFERENCE (strategic intent per slide) ===\n'
  + JSON.stringify(blueprintRef) + '\n\n'
  + '=== SESSION OVERVIEW ===\n'
  + JSON.stringify(agent1.session_overview || {}) + '\n\n'
  + '=== CLIENT CONTEXT ===\n'
  + 'Client: ' + validatedInput.client_name + '\n'
  + 'Industry: ' + (validatedInput.project_details.industry || '') + '\n'
  + 'Audience: ' + (validatedInput.project_details.seniority_of_cohort || '') + '\n'
  + 'Program: ' + (validatedInput.project_details.name || '') + '\n\n'
  + '=== PRE-WORK SUMMARY (verify findings are reflected in content) ===\n'
  + 'Competencies: ' + (preWorkMeta.competencies || []).join(', ') + '\n'
  + 'Development themes: ' + (preWorkMeta.development_themes || []).join(', ') + '\n'
  + 'Total pre-work slides: ' + (preWorkMeta.total_slides || 0) + '\n\n'
  + '=== INSTRUCTIONS ===\n'
  + '1. Review every slide (all 17) — do not skip.\n'
  + '2. Cross-reference against blueprint intent and slide template.\n'
  + '3. Flag generic, incomplete, or misaligned content.\n'
  + '4. Verify provenance tags and KB usage.\n'
  + '5. Check that pre-work themes are reflected in relevant slides.\n\n'
  + 'Return your review as a single JSON object.';

return [{ json: {
  system_prompt: systemPrompt,
  prompt: userPrompt,
  model: 'global.anthropic.claude-sonnet-4-5-20250929-v1:0',
  node_name: 'Agent3_QAReviewer',
  memory_id: validatedInput.memory_id,
  knowledge_base_id: validatedInput.knowledge_base_id,
  workflow_session_id: validatedInput.workflow_session_id,
  workflow_id: validatedInput.workflow_id,
  project_id: validatedInput.project_id,
  client_id: validatedInput.client_id
}}];
