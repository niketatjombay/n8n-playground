// 2.0b_FMT_AlignOutline — Outline-driven slide planner
// v3: Maps outline to 17-SECTION structure with variable expansion,
// chronological ordering, seniority/session-type awareness, and timing.

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

// Extract session context from validated input
const sessionConstraints = validatedInput.session_constraints || {};
const projectDetails = validatedInput.project_details || {};
const seniority = projectDetails.seniority_of_cohort || 'Not specified';
const sessionType = sessionConstraints.sessionType || sessionConstraints.session_type || 'Not specified';
const totalDuration = sessionConstraints.totalDuration || sessionConstraints.total_duration || 'Not specified';
const additionalInstructions = sessionConstraints.additionalInstructions || sessionConstraints.additional_instructions || '';

// If no outline data, fall back to default 17-slide template
if (!hasOutlineData && extractedText.length < 50) {
  const defaultPlan = [];
  const defaultTemplate = {};
  const defaultDeliverySequence = [];
  const defaultSectionExpansion = {};
  for (let i = 0; i < slideTypeVocab.length; i++) {
    const num = i + 1;
    defaultPlan.push({
      slide_number: num,
      slide_type: slideTypeVocab[i].type,
      section_number: num,
      outline_ref: '',
      outline_topic: '',
      outline_excerpt: '',
      alignment_rationale: 'Default template — no outline available',
      estimated_duration_minutes: 0
    });
    defaultTemplate['slide_' + num] = slideTypeVocab[i];
    defaultDeliverySequence.push('slide_' + num);
    defaultSectionExpansion['section_' + num] = 1;
  }
  return [{ json: {
    section_expansion: defaultSectionExpansion,
    slide_plan: defaultPlan,
    delivery_sequence: defaultDeliverySequence,
    total_slides: 17,
    timing_source: 'estimated',
    slide_template: defaultTemplate,
    outline_alignment: Object.fromEntries(defaultPlan.map(s => [
      'slide_' + s.slide_number,
      { has_outline_evidence: false, outline_section: null, outline_excerpt: null, alignment_rationale: 'No outline available' }
    ])),
    status: 'default_template',
    slides_with_evidence: 0
  }}];
}

const systemPrompt = `You are an expert training-session presentation designer at Jombay. Your job is to read a client-approved content outline and map it to a structured slide plan using a strict 17-SECTION framework.

THE OUTLINE IS THE SINGLE SOURCE OF TRUTH. Every slide must faithfully deliver outline content in the chronological order it appears.

=== 17-SECTION FRAMEWORK ===
Each section has a fixed number and a cardinality rule. You MUST use ALL sections marked STATIC (exactly 1 slide each). Variable sections expand based on outline content.

| # | Section                       | Cardinality          | Notes                                                        |
|---|-------------------------------|----------------------|--------------------------------------------------------------|
| 1 | Session title                 | STATIC — always 1    | Title slide with session name, client, date                  |
| 2 | Jombay intro                  | STATIC — always 1    | Standard Jombay introduction                                 |
| 3 | Trainer intro                 | STATIC — always 1    | Facilitator introduction                                     |
| 4 | Agenda                        | STATIC — always 1    | Session agenda/flow overview                                 |
| 5 | Working Agreement             | 0-1 slides           | Include for interactive sessions                             |
| 6 | Program overview              | 1 slide              | Program context and background                               |
| 7 | Objectives                    | 1 slide              | Learning objectives for the session                          |
| 8 | Module breaker                | 0-N slides           | Visual separator between major modules/topics                |
| 9 | Content (AC)                  | 1-N slides           | One slide per content topic — NEVER merge multiple topics    |
| 10| Quote                         | 0-N slides           | Inspirational/thought-provoking quotes                       |
| 11| Discussion/Reflection (RO)    | 0-N slides           | One slide per discussion/debrief point                       |
| 12| Activity (CE)                 | 0-N slides           | One slide per activity/exercise                              |
| 13| Break                         | 0-N slides           | Tea/lunch/comfort breaks from outline                        |
| 14| Questions                     | STATIC — always 1    | Q&A / open questions                                         |
| 15| Feedback                      | STATIC — always 1    | Session feedback collection                                  |
| 16| Call to Action (AE)           | STATIC — always 1    | Post-session action items                                    |
| 17| Closing                       | STATIC — always 1    | Closing and thank-you                                        |

=== SLIDE TYPE VOCABULARY ===
${JSON.stringify(slideTypeVocab.map(s => s.type))}

=== AUDIENCE & SESSION CONTEXT ===
Seniority: ${seniority}
Session type: ${sessionType}
Total duration: ${totalDuration}
${additionalInstructions ? 'Additional instructions from user: ' + additionalInstructions : ''}

SENIORITY GUIDELINES:
- Senior audience: fewer activities, deeper content discussions, strategic framing, executive-level language
- Mid-level audience: balanced mix of content and activities, practical application focus
- Junior audience: more activities and exercises, foundational concepts, step-by-step explanations

SESSION TYPE GUIDELINES:
- Virtual: shorter activity durations (5-10 min), more frequent breaks (every 45-60 min), digital engagement tools, concise slides
- In-person: longer activity durations (10-20 min), standard breaks (every 75-90 min), group dynamics, richer discussion

DURATION GUIDELINES:
- Use the total duration to estimate per-slide timing
- If the outline includes explicit time slots (e.g., "09:00-09:30"), use those as timing_source: "outline"
- If no time slots, estimate based on total duration and set timing_source: "estimated"
- STATIC slides (title, intro, agenda, etc.) typically take 2-5 minutes each
- Content slides: 5-15 minutes depending on depth
- Activity slides: 10-20 minutes (shorter for virtual)
- Break slides: 10-15 minutes

=== CHRONOLOGICAL ORDER RULE ===
You MUST preserve the chronological order from the outline. Walk through the outline from top to bottom and map each block to the appropriate section. The delivery_sequence array must reflect the actual presentation order — interleaving Content, Activity, Discussion, Quote, Module breaker, and Break slides as they appear in the outline flow.

Sections 1-7 always come first (opening sequence).
Sections 8-13 interleave in the middle based on outline flow.
Sections 14-17 always come last (closing sequence).

=== PLANNING RULES ===
1. STATIC sections (1-4, 14-17) always appear — exactly one slide each
2. Each major content theme in the outline gets its OWN Content (AC) slide — do NOT merge
3. Each activity/exercise gets its OWN Activity (CE) slide
4. Each discussion/debrief gets its OWN Discussion/Reflection (RO) slide
5. Add Module breaker between major topic transitions
6. Add Break slides where the outline indicates breaks/lunch/tea
7. Working Agreement: include if the session is interactive or collaborative
8. Quote: include if contextually relevant to the topic
9. Program overview and Objectives: always include (1 slide each)
10. Decide the optimal number of slides — there is NO fixed limit. Let the outline dictate.

=== OUTPUT FORMAT ===
Return ONLY a JSON object with this exact structure — no markdown, no commentary:
{
  "section_expansion": {
    "section_1": 1,
    "section_2": 1,
    "section_3": 1,
    "section_4": 1,
    "section_5": 0,
    "section_6": 1,
    "section_7": 1,
    "section_8": 2,
    "section_9": 5,
    "section_10": 1,
    "section_11": 2,
    "section_12": 3,
    "section_13": 1,
    "section_14": 1,
    "section_15": 1,
    "section_16": 1,
    "section_17": 1
  },
  "slide_plan": [
    {
      "slide_number": 1,
      "slide_type": "Session title",
      "section_number": 1,
      "outline_ref": "09:00-09:10",
      "outline_topic": "Opening & Welcome",
      "outline_excerpt": "EXACT text from outline for this slide",
      "alignment_rationale": "1 sentence explaining why this section maps here",
      "estimated_duration_minutes": 5
    }
  ],
  "delivery_sequence": ["slide_1", "slide_2", "slide_3"],
  "total_slides": 25,
  "timing_source": "outline"
}

FIELD DEFINITIONS:
- section_expansion: how many slides each of the 17 sections expands to (keyed by section_N)
- slide_plan: ordered array of every slide with its section mapping and outline evidence
- delivery_sequence: ordered list of slide IDs as they should be presented
- total_slides: total number of slides in the plan
- timing_source: "outline" if the outline has explicit time slots, "estimated" otherwise
- section_number: which of the 17 sections this slide belongs to (1-17)
- estimated_duration_minutes: estimated presentation time for this slide in minutes`;

const userPrompt = 'Map the following content outline to the 17-section slide framework.\n\n'
  + '=== CONTENT OUTLINE ===\n'
  + JSON.stringify(formattedOutline) + '\n\n'
  + (extractedText ? '=== RAW OUTLINE TEXT (for additional context) ===\n' + extractedText.substring(0, 5000) + '\n\n' : '')
  + '=== INSTRUCTIONS ===\n'
  + 'Walk through the outline chronologically. For each block, decide which section (1-17) it belongs to and create a slide entry.\n'
  + 'Expand variable sections (8-13) as needed — one slide per content topic, one per activity, one per discussion.\n'
  + 'STATIC sections (1-4 and 14-17) must each have exactly 1 slide.\n'
  + 'The section_expansion object must account for every slide in the plan.\n'
  + 'The delivery_sequence must list every slide_N in presentation order.\n'
  + 'Return ONLY the JSON object.';

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
