// 8.2a_FMT_GammaScript — Format prompt for full-content Gamma markdown
// Input: final_output from 8.1_JS_Assemble
// Output: Haiku prompt to generate 15-25K chars of complete presentation markdown

const assembled = $input.first().json;
const output = assembled.final_output || {};
const validatedInput = $('1.2_PREP_Input').first().json;

const meta = output.metadata || {};
const overview = output.session_overview || {};
const slides = output.slide_spec || {};
const scripts = output.facilitator_script || {};

// Layout mapping (same as current gamma script)
const layoutMap = {
  'Session title': 'Title',
  'Jombay intro': 'Image + Text',
  'Trainer intro': 'Image + Text',
  'Agenda': 'Timeline',
  'Working Agreement': 'List',
  'Program overview': 'Timeline',
  'Objectives': 'List',
  'Module breaker': 'Title',
  'Content (AC)': 'Two Column',
  'Quote': 'Quote',
  'Discussion/Reflection (RO)': 'Image + Text',
  'Activity (CE)': 'List',
  'Break': 'Title',
  'Questions': 'CTA',
  'Feedback': 'List',
  'Call to Action (AE)': 'Two Column',
  'Closing': 'CTA'
};

// Build structured slide data for the prompt
const slideData = [];
for (let i = 1; i <= 17; i++) {
  const key = 'slide_' + i;
  const slide = slides[key] || {};
  const script = scripts[key] || {};
  const slideType = slide.slide_type || 'Content';
  const layout = layoutMap[slideType] || 'List';

  slideData.push({
    slide_number: i,
    slide_type: slideType,
    layout: layout,
    title: slide.slide_title || slide.headline || slide.title || 'Untitled',
    headline: slide.headline || '',
    subtext: slide.subtext || '',
    bullets: slide.bullets || [],
    visual_guidance: slide.visual_guidance || slide.visual_direction || '',
    activity: slide.activity || {},
    facilitation_tips: slide.facilitation_tips || [],
    modality_notes: slide.modality_notes || {},
    provenance: slide.provenance || 'New',
    provenance_source: slide.provenance_source || '',
    facilitator_script: script.facilitator_script || script.script || ''
  });
}

const systemPrompt = `You are a presentation script generator. Convert structured slide data into a complete Gamma-ready markdown presentation.

OUTPUT RULES:
- Generate COMPLETE markdown — no truncation, no summarization, no "..." placeholders
- Include EVERY detail from the slide data: all bullets, full visual guidance, complete activity instructions, full facilitator notes
- Target output: 15,000-25,000 characters
- Use markdown formatting: # for title, ## for slide headers, ** for emphasis, - for bullets
- Each slide gets a [LAYOUT: ...] tag

PER-SLIDE FORMAT:
## Slide N: [Title]
**Type:** [slide_type]
[LAYOUT: layout_tag]

**Visual:** [full visual_guidance — do NOT truncate]

**Content:**
- [headline if different from title]
- [subtext]
- [ALL bullets — include every one]

**Activity:** [full instructions with duration and debrief questions, if applicable]

**Facilitator Note:** [COMPLETE facilitator script — do NOT truncate or summarize]

**Modality Notes:**
- Virtual: [virtual adaptation]
- In-person: [in-person adaptation]

**Provenance:** [provenance] [provenance_source if applicable]

---

END WITH:
**Gamma Design Direction:**
- Color Palette: Professional navy + warm white + accent gold
- Font Pairing: Bold geometric sans for titles / Light humanist sans for body
- Visual Style: Clean & minimal with enterprise gravitas
- Iconography: Flat line icons
- Image Tone: Real people in professional settings

Return ONLY the markdown — no JSON, no commentary.`;

const userPrompt = 'Generate the complete Gamma presentation script.\n\n'
  + '=== SESSION OVERVIEW ===\n'
  + 'Workshop: ' + (overview.workshop_title || meta.project_name || 'Workshop') + '\n'
  + 'Client: ' + (meta.client_name || '') + '\n'
  + 'Themes: ' + (overview.key_themes || []).join(', ') + '\n\n'
  + '=== SLIDE DATA (17 slides) ===\n'
  + JSON.stringify(slideData) + '\n\n'
  + '=== INSTRUCTIONS ===\n'
  + 'Generate COMPLETE markdown for all 17 slides. Include every bullet, every visual cue, every facilitator note.\n'
  + 'Do NOT truncate or summarize any field. The output should be a ready-to-use Gamma presentation script.';

return [{ json: {
  system_prompt: systemPrompt,
  prompt: userPrompt,
  model: 'global.anthropic.claude-haiku-4-5-20251001-v1:0',
  node_name: 'GammaScriptGen',
  final_output: output,
  workflow_session_id: assembled.workflow_session_id,
  memory_id: validatedInput.memory_id,
  knowledge_base_id: validatedInput.knowledge_base_id,
  workflow_session_id: validatedInput.workflow_session_id,
  workflow_id: validatedInput.workflow_id,
  project_id: validatedInput.project_id,
  client_id: validatedInput.client_id
}}];
