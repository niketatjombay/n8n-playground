// 3.3_JS_ParseBlueprint — Parse v2 Blueprint output
// Replaces the complex Agent 1A normalizer with a simpler parser
// for the compact 4-key Blueprint schema.

const response = $input.first().json;
let parsed = response.llm_response || response;

// Handle string response
if (typeof parsed === 'string') {
  try { parsed = JSON.parse(parsed); } catch (e) { parsed = {}; }
}

// Unwrap single container key (LLM sometimes wraps in { blueprint: {...} })
if (typeof parsed === 'object' && !Array.isArray(parsed)) {
  const keys = Object.keys(parsed);
  if (keys.length === 1 && typeof parsed[keys[0]] === 'object' && !Array.isArray(parsed[keys[0]])) {
    const inner = parsed[keys[0]];
    // Only unwrap if inner looks like our schema (handle alternative key names)
    if (inner.session_overview || inner.slide_blueprint || inner.session_narrative || inner.slide_blueprints) {
      parsed = inner;
    }
  }
}

// --- Extract and validate each section ---

// session_overview (handle alternative key: session_narrative)
const rawOverview = parsed.session_overview || parsed.session_narrative || {};
const sessionOverview = {};
sessionOverview.workshop_title = rawOverview.workshop_title || rawOverview.title || parsed.workshop_title || '';
sessionOverview.key_themes = rawOverview.key_themes || rawOverview.themes || parsed.key_themes || [];
sessionOverview.learning_objectives = rawOverview.learning_objectives || rawOverview.objectives || [];
sessionOverview.audience_summary = rawOverview.audience_summary || rawOverview.target_audience || '';
sessionOverview.session_arc_narrative = rawOverview.session_arc_narrative || rawOverview.learning_architecture || rawOverview.day_1_flow || '';

// slide_blueprint — handle both object {slide_1:{}} and array [{slide_number:1}] formats
let rawBlueprint = parsed.slide_blueprint || parsed.slides || parsed.slide_blueprints || {};

// If blueprint is an array, convert to object keyed by slide_N
if (Array.isArray(rawBlueprint)) {
  const converted = {};
  for (const item of rawBlueprint) {
    const num = item.slide_number || item.number || item.slide;
    if (num) converted[`slide_${num}`] = item;
  }
  rawBlueprint = converted;
}

const slideBlueprint = {};
for (let i = 1; i <= 17; i++) {
  const key = `slide_${i}`;
  const entry = rawBlueprint[key] || rawBlueprint[String(i)] || {};
  slideBlueprint[key] = {
    intent: entry.intent || entry.strategic_intent || entry.purpose || entry.design_intent || '',
    content_direction: entry.content_direction || entry.direction || entry.content || '',
    key_message: entry.key_message || entry.key_takeaway || entry.takeaway || '',
    experience_anchors: Array.isArray(entry.experience_anchors) ? entry.experience_anchors : [],
    kb_units_to_use: Array.isArray(entry.kb_units_to_use) ? entry.kb_units_to_use :
      (Array.isArray(entry.kb_units) ? entry.kb_units : []),
    flags: Array.isArray(entry.flags) ? entry.flags :
      (Array.isArray(entry.concerns) ? entry.concerns : [])
  };
}

// mandatory_jombay_frameworks (handle object {slide_N: [...]} or array [{...}])
let frameworks = parsed.mandatory_jombay_frameworks || parsed.mandatory_frameworks || [];
if (!Array.isArray(frameworks) && typeof frameworks === 'object') {
  // Convert {slide_2: ["framework"], ...} to [{framework_name, target_slides}]
  const converted = [];
  for (const [slideKey, fws] of Object.entries(frameworks)) {
    const slideNum = parseInt(slideKey.replace(/\D/g, ''));
    const fwList = Array.isArray(fws) ? fws : [fws];
    for (const fw of fwList) {
      const name = typeof fw === 'string' ? fw : fw.framework_name || fw.name || String(fw);
      const existing = converted.find(c => c.framework_name === name);
      if (existing) { existing.target_slides.push(slideNum); }
      else { converted.push({ framework_name: name, target_slides: [slideNum], why: '' }); }
    }
  }
  frameworks = converted;
}

// sensitivity_log (handle object {category: [...]} or array [{...}])
let sensitivityLog = parsed.sensitivity_log || parsed.sensitivity_considerations || [];
if (!Array.isArray(sensitivityLog) && typeof sensitivityLog === 'object') {
  const converted = [];
  for (const [category, items] of Object.entries(sensitivityLog)) {
    const itemList = Array.isArray(items) ? items : [items];
    for (const item of itemList) {
      converted.push({
        slide_number: 0,
        concern: typeof item === 'string' ? item : (item.concern || item.issue || JSON.stringify(item)),
        action: typeof item === 'object' ? (item.action || item.mitigation || '') : category
      });
    }
  }
  sensitivityLog = converted;
}

// --- Count filled blueprint entries for validation ---
let filledSlides = 0;
for (const entry of Object.values(slideBlueprint)) {
  if (entry.intent || entry.content_direction) filledSlides++;
}

// Output matches shape expected by 4.1_JS_SplitGroups:
// $input.first().json.agent1_output.slide_blueprint
return [{ json: {
  status: filledSlides >= 10 ? 'blueprint_parsed' : 'blueprint_partial',
  filled_slides: filledSlides,
  agent1_output: {
    session_overview: sessionOverview,
    slide_blueprint: slideBlueprint,
    mandatory_jombay_frameworks: frameworks,
    sensitivity_log: sensitivityLog,
    // Backward compat: downstream reads these but v2 doesn't produce them
    // (Gagné/Kolb are hardcoded in slide_template)
    gagne_map: {},
    kolb_map: {},
    slide_allocation_guidance: {}
  }
}}];
