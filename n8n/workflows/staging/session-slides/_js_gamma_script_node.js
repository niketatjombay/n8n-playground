// 8.2b_JS_GammaScript — Extract Gamma markdown from Haiku SUB
// Input: SUB output from 8.2_SUB_GammaScript (Haiku)
// Fallback: If SUB fails, generates basic markdown from slide data (degraded)

const response = $input.first().json;

// The FMT node passed through final_output for us
const output = response.final_output || $('8.1_JS_Assemble').first().json.final_output || {};
const workflowSessionId = response.workflow_session_id
  || $('8.1_JS_Assemble').first().json.workflow_session_id || '';

// Detect SUB error
const isSubError = !!(response.error || response.errorMessage
  || (response.executionStatus && response.executionStatus === 'error'));

let gammaScript = '';

if (!isSubError) {
  // Extract markdown from LLM response
  const llmResponse = response.llm_response || '';
  gammaScript = typeof llmResponse === 'string' ? llmResponse : JSON.stringify(llmResponse);
}

// Fallback: basic JS-generated markdown if SUB failed or empty
if (gammaScript.length < 100) {
  const meta = output.metadata || {};
  const overview = output.session_overview || {};
  const slides = output.slide_spec || {};
  const scripts = output.facilitator_script || {};

  const layoutMap = {
    'Session title': 'Title', 'Jombay intro': 'Image + Text', 'Trainer intro': 'Image + Text',
    'Agenda': 'Timeline', 'Working Agreement': 'List', 'Program overview': 'Timeline',
    'Objectives': 'List', 'Module breaker': 'Title', 'Content (AC)': 'Two Column',
    'Quote': 'Quote', 'Discussion/Reflection (RO)': 'Image + Text', 'Activity (CE)': 'List',
    'Break': 'Title', 'Questions': 'CTA', 'Feedback': 'List',
    'Call to Action (AE)': 'Two Column', 'Closing': 'CTA'
  };

  let md = '---\n# ' + (overview.workshop_title || meta.project_name || 'Workshop') + '\n';
  md += '**Client:** ' + (meta.client_name || '') + '\n---\n\n';

  for (let i = 1; i <= 17; i++) {
    const key = 'slide_' + i;
    const slide = slides[key] || {};
    const script = scripts[key] || {};
    const slideType = slide.slide_type || 'Content';
    const title = slide.slide_title || slide.headline || slide.title || 'Untitled';

    md += '## Slide ' + i + ': ' + title + '\n';
    md += '**Type:** ' + slideType + '\n[LAYOUT: ' + (layoutMap[slideType] || 'List') + ']\n';

    let vis = slide.visual_guidance || slide.visual_direction || '';
    if (typeof vis !== 'string') vis = JSON.stringify(vis);
    if (vis) md += '**Visual:** ' + vis + '\n';

    md += '**Content:**\n';
    if (slide.headline && slide.headline !== title) md += '- ' + slide.headline + '\n';
    if (slide.subtext) md += '- ' + slide.subtext + '\n';
    if (Array.isArray(slide.bullets)) {
      for (const b of slide.bullets) {
        const text = typeof b === 'string' ? b : (b.text || b.flag || JSON.stringify(b));
        if (text) md += '- ' + text + '\n';
      }
    }

    let scriptText = script.facilitator_script || script.script || '';
    if (typeof scriptText !== 'string') scriptText = JSON.stringify(scriptText);
    if (scriptText) md += '**Facilitator Note:** ' + scriptText + '\n';

    md += '\n---\n\n';
  }

  md += '**Gamma Design Direction:**\n';
  md += '- Color Palette: Professional navy + warm white + accent gold\n';
  md += '- Font Pairing: Bold geometric sans for titles / Light humanist sans for body\n';
  md += '- Visual Style: Clean & minimal with enterprise gravitas\n';
  md += '- Iconography: Flat line icons\n- Image Tone: Real people in professional settings\n';

  gammaScript = md;
}

// Attach gamma_script to output
output.gamma_script = gammaScript;

// Remove per-slide visual fields (consolidated in gamma_script)
for (let i = 1; i <= 17; i++) {
  const key = 'slide_' + i;
  if (output.slide_spec && output.slide_spec[key]) {
    delete output.slide_spec[key].visual_guidance;
    delete output.slide_spec[key].visual_direction;
  }
}

return [{ json: {
  final_output: output,
  workflow_session_id: workflowSessionId
}}];
