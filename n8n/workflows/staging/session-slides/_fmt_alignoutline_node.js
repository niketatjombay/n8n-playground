// 2.0b_FMT_AlignOutline — Outline-driven slide planner
// v2: Plans slides dynamically from outline (15-25 slides)
// instead of mapping to fixed 17-slide template.
// If outline is empty/too short, falls back to default 17-slide template.

const validatedInput = $('1.2_PREP_Input').first().json;

// Slide type vocabulary (what the LLM can choose from)
const slideTypeVocab = [
  { type: 'Session title',              gagne: 'Gain Attention',     kolb: null, ages: 'Attention' },
  { type: 'Jombay intro',               gagne: null,                 kolb: null, ages: 'Emotion' },
  { type: 'Trainer intro',              gagne: null,                 kolb: null, ages: 'Emotion' },
  { type: 'Agenda',                     gagne: null,                 kolb: null, ages: 'Attention' },
  { type: 'Working Agreement',          gagne: null,                 kolb: null, ages: 'Generation' },
  { type: 'Program overview',           gagne: 'Stimulate Recall',   kolb: null, ages: 'Attention' },
  { type: 'Objectives',                 gagne: 'Inform Objectives',  kolb: null, ages: 'Attention' },
  { type: 'Module breaker',             gagne: null,                 kolb: null, ages: 'Spacing' },
  { type: 'Content (AC)',               gagne: 'Present Content',    kolb: 'AC', ages: 'Generation' },
  { type: 'Quote',                      gagne: 'Provide Guidance',   kolb: null, ages: 'Emotion' },
  { type: 'Discussion/Reflection (RO)', gagne: 'Stimulate Recall',   kolb: 'RO', ages: 'Generation' },
  { type: 'Activity (CE)',              gagne: 'Elicit Performance', kolb: 'CE', ages: 'Generation' },
  { type: 'Break',                      gagne: null,                 kolb: null, ages: 'Spacing' },
  { type: 'Questions',                  gagne: 'Provide Feedback',   kolb: null, ages: 'Generation' },
  { type: 'Feedback',                   gagne: 'Assess Performance', kolb: null, ages: 'Generation' },
  { type: 'Call to Action (AE)',        gagne: 'Enhance Retention',  kolb: 'AE', ages: 'Generation' },
  { type: 'Closing',                    gagne: 'Enhance Retention',  kolb: null, ages: 'Emotion' }
];

// Extract formatted outline from upstream
let formattedOutline = {};
let extractedText = '';
try {
  const outlineNode = $('2.0_SUB_Outline').first().json;
  formattedOutline = outlineNode.formatted_outline || {};
  if (typeof formattedOutline === 'string') {
    try { formattedOutline = JSON.parse(formattedOutline); } catch(e) { formattedOutline = {}; }
  }
  if (Object.keys(formattedOutline).length === 0 && outlineNode.llm_response) {
    const parsed = typeof outlineNode.llm_response === 'string'
      ? JSON.parse(outlineNode.llm_response) : outlineNode.llm_response;
    formattedOutline = parsed || {};
  }
  extractedText = outlineNode.extracted_text || '';
  if (!extractedText) {
    try { extractedText = $('1.2_PREP_Input').first().json.extracted_text || ''; } catch(e2) {}
  }
} catch(e) {
  formattedOutline = {};
}

// Check if outline has meaningful data
const hasModules = Array.isArray(formattedOutline.modules) && formattedOutline.modules.length > 0;
const hasSessions = formattedOutline.training_content && Array.isArray(formattedOutline.training_content.sessions) && formattedOutline.training_content.sessions.length > 0;
const hasTopics = Array.isArray(formattedOutline.topics) && formattedOutline.topics.length > 0;
const hasContent = Object.keys(formattedOutline).length > 0 && JSON.stringify(formattedOutline).length > 100;
const hasOutlineData = hasModules || hasSessions || hasTopics || hasContent;

// If no outline data, fall back to default 17-slide template
if (!hasOutlineData && extractedText.length < 50) {
  const defaultPlan = [];
  const defaultTemplate = {};
  for (let i = 0; i < slideTypeVocab.length; i++) {
    const num = i + 1;
    defaultPlan.push({
      slide_number: num,
      slide_type: slideTypeVocab[i].type,
      outline_ref: '',
      outline_topic: '',
      outline_excerpt: '',
      alignment_rationale: 'Default template — no outline available'
    });
    defaultTemplate['slide_' + num] = slideTypeVocab[i];
  }
  return [{ json: {
    slide_plan: defaultPlan,
    total_slides: 17,
    slide_template: defaultTemplate,
    outline_alignment: Object.fromEntries(defaultPlan.map(s => [
      'slide_' + s.slide_number,
      { has_outline_evidence: false, outline_section: null, outline_excerpt: null, alignment_rationale: 'No outline available' }
    ])),
    status: 'default_template',
    slides_with_evidence: 0
  }}];
}

const systemPrompt = `You are a training session architect at Jombay. Read a client-approved content outline and create a slide plan for the presentation.

THE OUTLINE IS THE SINGLE SOURCE OF TRUTH. Every slide must faithfully deliver outline content.

YOUR JOB:
1. Read the outline (time slots, topics, activities, breaks)
2. Determine how many slides are needed (typically 15-25)
3. Assign a slide type to each from the vocabulary below
4. Map each slide to its outline section with verbatim excerpt

SLIDE TYPE VOCABULARY (choose from these):
${JSON.stringify(slideTypeVocab.map(s => s.type))}

PLANNING RULES:
- Every session starts with: Session title, then Agenda (minimum)
- Every session ends with: Call to Action (AE), then Closing (minimum)
- Jombay intro and Trainer intro are optional — include if outline has opening formalities
- Each major content theme in the outline gets its OWN Content (AC) slide — do NOT merge multiple themes
- Each activity/exercise in the outline gets its OWN Activity (CE) slide
- Each discussion/debrief in the outline gets its OWN Discussion/Reflection (RO) slide
- Add Module breaker slides between major topic transitions
- Add Break slides where the outline indicates breaks/lunch/tea
- Total slides should be 15-25. If the outline is dense, use more slides. If sparse, use fewer.
- Working Agreement is optional — include if session is interactive
- Quote slides are optional — include if relevant

OUTPUT FORMAT (JSON object):
{
  "slide_plan": [
    {
      "slide_number": 1,
      "slide_type": "Session title",
      "outline_ref": "09:00-09:10",
      "outline_topic": "Opening & Welcome",
      "outline_excerpt": "EXACT text from outline for this slide",
      "alignment_rationale": "1 sentence explaining why"
    }
  ],
  "total_slides": N
}

Return ONLY the JSON object — no markdown, no commentary.`;

const userPrompt = 'Create a slide plan from the following content outline.\n\n'
  + '=== CONTENT OUTLINE ===\n'
  + JSON.stringify(formattedOutline) + '\n\n'
  + (extractedText ? '=== RAW OUTLINE TEXT (for additional context) ===\n' + extractedText.substring(0, 5000) + '\n\n' : '')
  + '=== INSTRUCTIONS ===\n'
  + 'Read the outline carefully. Create a slide_plan array with one entry per slide.\n'
  + 'Each major topic/theme gets its own Content (AC) slide. Each activity gets its own Activity (CE) slide.\n'
  + 'Total slides should be 15-25 depending on outline density.';

return [{ json: {
  system_prompt: systemPrompt,
  prompt: userPrompt,
  model: 'global.anthropic.claude-sonnet-4-6',
  node_name: 'AlignOutline',
  memory_id: validatedInput.memory_id,
  knowledge_base_id: validatedInput.knowledge_base_id,
  workflow_session_id: validatedInput.workflow_session_id,
  workflow_id: validatedInput.workflow_id,
  project_id: validatedInput.project_id,
  client_id: validatedInput.client_id
}}];
