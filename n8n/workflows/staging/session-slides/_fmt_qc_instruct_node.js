// 7.1b_FMT_QC_Instruct — Instructional alignment review
// Input: $input = 6.4_JS_NormContent (normalized slide content)
// Reads via $(): 3.6_JS_NormBP (normalized blueprint), 1.2_PREP_Input (validated input)

const merged = $input.first().json;
const validatedInput = $('1.2_PREP_Input').first().json;
const agent1 = $('3.6_JS_NormBP').first().json.agent1_output;

const slideTemplate = validatedInput.slide_template || {};

// Build compact blueprint reference
const blueprintRef = {};
const bp = agent1.slide_blueprint || {};
for (let i = 1; i <= 17; i++) {
  const key = `slide_${i}`;
  const entry = bp[key] || {};
  blueprintRef[key] = {
    intent: entry.intent || '',
    key_message: entry.key_message || ''
  };
}

const systemPrompt = `ROLE: Senior COE Reviewer at Jombay. You flag issues — you NEVER fix content.

SCOPE: INSTRUCTIONAL ALIGNMENT ONLY. Do not review structural completeness or content quality.

For every flag, provide:
1. What the issue is
2. Why it matters for the learner's experience
3. Direction for the fix (not the fix itself)

=== INSTRUCTIONAL CHECKS (for EACH of 17 slides) ===

1. Slide type matches the blueprint intent (cross-reference blueprint)
2. Gagné event honored (reference slide_template)
3. Kolb stage embedded where assigned (slides 9=AC, 11=RO, 12=CE, 16=AE)
4. AGES function applied appropriately
5. Learning objectives are Bloom-appropriate (Apply and above for senior cohorts)
   - Flag any objective at Remember or Understand level for a senior/mid-level cohort
   - Verify bloom_level field matches the objective verb (e.g., "Apply the GROW model" should be "Apply", not "Understand")

=== CONTENT DEVELOPMENT CHECKLIST (MANDATORY — check all items) ===
A. Gagné's 9 Events: All 9 events must be represented across the 17 slides
B. Kolb Cycle: All 4 stages (AC, RO, CE, AE) must appear on their assigned slides
C. AGES: Every slide must have an AGES function applied
D. Provenance: Every slide must have a provenance tag (New/Reused/Adapted)
E. Activities: All activity slides must have runnable instructions with timing
F. Learning objectives: Must use Bloom verbs at Apply level or above for senior cohorts

=== FLAG FORMAT ===
{ "flag": "what", "reason": "why", "suggested_fix": "direction", "severity": "Critical|Medium|Low" }

Severity guide:
  Critical = blocks delivery (missing Gagné event, wrong Kolb stage)
  Medium   = affects quality (weak objective, misaligned intent)
  Low      = cosmetic (minor AGES alignment note)

=== OUTPUT SCHEMA ===
{
  "slide_reviews": {
    "slide_1": { "status": "Clear|Flagged", "flags": [] },
    ... (all 17 slides)
  },
  "checklist_compliance": {
    "gagne_coverage": "REQUIRED. List all 9 Gagné events and which slide covers each. Format: 'Gain Attention: slide 1, Stimulate Recall: slides 6,11, ...' If any event is missing, say 'MISSING: [event name]'",
    "kolb_coverage": "REQUIRED. For each of AC/RO/CE/AE, name the slide. Format: 'AC: slide 9, RO: slide 11, CE: slide 12, AE: slide 16'. If any stage is missing, say 'MISSING: [stage]'",
    "ages_coverage": "REQUIRED. Count of slides per AGES function. Format: 'Attention: 3, Generation: 8, Emotion: 3, Spacing: 2'",
    "provenance_coverage": "REQUIRED. Format: 'N/17 slides tagged. Reused: X, Adapted: Y, New: Z'",
    "bloom_compliance": "REQUIRED. Format: 'N objectives total. Apply+: X, Understand: Y, Remember: Z. Senior cohort target: Apply and above.'"
  },
  "attention_items": [
    { "slide": "slide_N", "issue": "string", "priority": "High|Medium|Low" }
  ],
  "category": "instructional"
}

CRITICAL: The checklist_compliance fields are MANDATORY — do NOT return empty strings. Fill each one with the actual coverage data from your review.

RULES:
- NEVER rewrite content — only flag
- NEVER skip a slide — review all 17
- Be concise — 0-2 flags per slide is typical
- Return ONLY the JSON — no markdown`;

// Pre-compute AGES counts from slide_template
const agesCounts = {};
for (let i = 1; i <= 17; i++) {
  const ages = (slideTemplate['slide_' + i] || {}).ages;
  if (ages) agesCounts[ages] = (agesCounts[ages] || 0) + 1;
}
const agesStr = Object.entries(agesCounts).map(([k, v]) => k + ': ' + v).join(', ');

// Pre-compute Bloom distribution from learning objectives
const bloomCounts = {};
const objectives = (agent1.session_overview || {}).learning_objectives || [];
for (const obj of objectives) {
  const level = obj.bloom_level || 'Unknown';
  bloomCounts[level] = (bloomCounts[level] || 0) + 1;
}
const bloomStr = Object.entries(bloomCounts).map(([k, v]) => k + ': ' + v).join(', ') + '. Total: ' + objectives.length;

// Pre-compute provenance counts from slide_spec
const provCounts = {};
const slideSpec = merged.slide_spec || {};
for (let i = 1; i <= 17; i++) {
  const prov = (slideSpec['slide_' + i] || {}).provenance;
  if (prov) provCounts[prov] = (provCounts[prov] || 0) + 1;
}
const provStr = Object.entries(provCounts).map(([k, v]) => k + ': ' + v).join(', ');

const userPrompt = 'Review instructional alignment of the following slide content.\n\n'
  + '=== SLIDE CONTENT (review every slide) ===\n'
  + JSON.stringify(merged.slide_spec) + '\n\n'
  + '=== SLIDE TEMPLATE (Gagné/Kolb/AGES reference — these are FIXED) ===\n'
  + JSON.stringify(slideTemplate) + '\n\n'
  + '=== BLUEPRINT REFERENCE (strategic intent per slide) ===\n'
  + JSON.stringify(blueprintRef) + '\n\n'
  + '=== SESSION OVERVIEW ===\n'
  + JSON.stringify(agent1.session_overview || {}) + '\n\n'
  + '=== LEARNING OBJECTIVES (verify Bloom levels) ===\n'
  + JSON.stringify(objectives) + '\n\n'
  + '=== PRE-COMPUTED REFERENCE DATA (verify and include in checklist_compliance) ===\n'
  + 'AGES distribution: ' + agesStr + '\n'
  + 'Bloom distribution: ' + bloomStr + '\n'
  + 'Provenance distribution: ' + provStr + '\n\n'
  + 'EXAMPLE checklist_compliance (fill all 5 fields with actual data from your review):\n'
  + '{\n'
  + '  "gagne_coverage": "All 9 events covered. Gain Attention: slide 1, Stimulate Recall: slides 6,11, Inform Objectives: slide 7, Present Content: slide 9, Provide Guidance: slide 10, Elicit Performance: slide 12, Provide Feedback: slide 14, Assess Performance: slide 15, Enhance Retention: slide 16",\n'
  + '  "kolb_coverage": "All 4 stages present. AC: slide 9, RO: slide 11, CE: slide 12, AE: slide 16",\n'
  + '  "ages_coverage": "Attention: 3, Generation: 8, Emotion: 3, Spacing: 2 — all 4 AGES factors represented",\n'
  + '  "provenance_coverage": "17/17 slides tagged. Reused: 3, Adapted: 5, New: 9 — 47% reuse rate",\n'
  + '  "bloom_compliance": "5 objectives total. Analyze: 2, Apply: 2, Create: 1. Senior cohort target met: all Apply or above"\n'
  + '}\n\n'
  + 'Return your review as a single JSON object.';

return [{ json: {
  system_prompt: systemPrompt,
  prompt: userPrompt,
  model: 'global.anthropic.claude-sonnet-4-6',
  node_name: 'QC_Instructional',
  memory_id: validatedInput.memory_id,
  knowledge_base_id: validatedInput.knowledge_base_id,
  workflow_session_id: validatedInput.workflow_session_id,
  workflow_id: validatedInput.workflow_id,
  project_id: validatedInput.project_id,
  client_id: validatedInput.client_id
}}];
