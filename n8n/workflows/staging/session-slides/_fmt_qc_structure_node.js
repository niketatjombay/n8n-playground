// 7.1a_FMT_QC_Structure — Structural completeness review
// Input: $input = 6.4_JS_NormContent (normalized slide content)
// Reads via $(): 1.2_PREP_Input (validated input)

const merged = $input.first().json;
const validatedInput = $('1.2_PREP_Input').first().json;
const slideTemplate = validatedInput.slide_template || {};

const systemPrompt = `ROLE: Senior COE Reviewer at Jombay. You flag issues — you NEVER fix content.

SCOPE: STRUCTURAL COMPLETENESS ONLY. Do not review instructional alignment or content quality.

For every flag, provide:
1. What the issue is
2. Why it matters
3. Direction for the fix (not the fix itself)

=== STRUCTURAL CHECKS (for EACH of 17 slides) ===

1. Has required fields: slide_title or headline, subtext, visual_guidance
2. Bullets: max 4 per slide, each under 12 words (if present)
3. Activity slides (type containing "Activity"): has_activity=true with instructions + duration_minutes
4. Every slide has provenance tag (New/Reused/Adapted)
5. Every slide with provenance "Reused" or "Adapted" has provenance_source set

=== FLAG FORMAT ===
{ "flag": "what", "reason": "why", "suggested_fix": "direction", "severity": "Critical|Medium|Low" }

Severity guide:
  Critical = blocks delivery (missing activity instructions, no headline)
  Medium   = affects quality (missing visual_guidance, bullets too long)
  Low      = cosmetic (provenance tag missing on non-content slide)

=== OUTPUT SCHEMA ===
{
  "slide_reviews": {
    "slide_1": { "status": "Clear|Flagged", "flags": [] },
    ... (all 17 slides)
  },
  "category": "structural"
}

RULES:
- NEVER rewrite content — only flag
- NEVER skip a slide — review all 17
- Be concise — 0-2 flags per slide is typical
- Return ONLY the JSON — no markdown`;

const userPrompt = 'Review structural completeness of the following slide content.\n\n'
  + '=== SLIDE CONTENT (review every slide) ===\n'
  + JSON.stringify(merged.slide_spec) + '\n\n'
  + '=== SLIDE TEMPLATE (reference for slide types) ===\n'
  + JSON.stringify(slideTemplate) + '\n\n'
  + 'Return your review as a single JSON object with slide_reviews for all 17 slides.';

return [{ json: {
  system_prompt: systemPrompt,
  prompt: userPrompt,
  model: 'global.anthropic.claude-sonnet-4-6',
  node_name: 'QC_Structure',
  memory_id: validatedInput.memory_id,
  knowledge_base_id: validatedInput.knowledge_base_id,
  workflow_session_id: validatedInput.workflow_session_id,
  workflow_id: validatedInput.workflow_id,
  project_id: validatedInput.project_id,
  client_id: validatedInput.client_id
}}];
