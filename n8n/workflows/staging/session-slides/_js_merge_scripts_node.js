// 7.6_JS_MergeScripts — Merge 7 group script outputs + normalize to canonical schema
// Handles 2 LLM output formats:
//   A) { slide_1: { facilitator_script, visual_guidance, ... }, slide_2: { ... } }  — preferred
//   B) { scripts: [ { slide_id, facilitator_script, ... } ] }  — array format
//
// Post-merge normalization ensures:
//   - `facilitator_script` is always a string (flattens objects with setup/opening/etc.)
//   - `script` key is renamed to `facilitator_script`
//   - All canonical keys exist: visual_guidance, energy_note, modality_notes,
//     debrief_questions, activity_run_of_show

const items = $input.all();

let mergedScripts = {};

function normalizeKey(id) {
  if (!id) return null;
  const s = String(id);
  return s.startsWith('slide_') ? s : 'slide_' + s;
}

// --- Flatten object-type facilitator_script to string ---
// Some LLM groups return { setup: "...", opening: "...", key_talking_points: [...], ... }
// instead of a flat string. Concatenate all text parts in order.
function flattenScript(val) {
  if (typeof val === 'string') return val;
  if (typeof val !== 'object' || val === null) return '';

  const parts = [];
  for (const [, v] of Object.entries(val)) {
    if (typeof v === 'string' && v.length > 0) {
      parts.push(v);
    } else if (Array.isArray(v)) {
      const textItems = v.map(item => {
        if (typeof item === 'string') return item;
        if (typeof item === 'object' && item !== null) return item.text || item.point || item.question || JSON.stringify(item);
        return '';
      }).filter(Boolean);
      if (textItems.length > 0) parts.push(textItems.join('\n'));
    } else if (typeof v === 'object' && v !== null) {
      // Recurse one level for nested objects (e.g., timing: { total: "30 min", ... })
      const inner = flattenScript(v);
      if (inner) parts.push(inner);
    }
  }
  return parts.join('\n\n');
}

// --- Merge groups ---

for (let i = 0; i < items.length; i++) {
  const data = items[i].json;
  const response = data.llm_response || data;

  // Format A: slide_N as top-level keys (most common)
  for (const [k, v] of Object.entries(response)) {
    if (/^slide_\d+$/.test(k) && typeof v === 'object' && v !== null) {
      mergedScripts[k] = v;
    }
  }

  // Format B: scripts as array
  if (Array.isArray(response.scripts)) {
    for (const script of response.scripts) {
      const key = normalizeKey(script.slide_id || script.slide_number);
      if (!key) continue;
      mergedScripts[key] = script;
    }
  }

  // Legacy: facilitator_scripts at top level
  if (response.facilitator_scripts && typeof response.facilitator_scripts === 'object') {
    for (const [k, v] of Object.entries(response.facilitator_scripts)) {
      const key = normalizeKey(k);
      if (key) mergedScripts[key] = v;
    }
  }
}

// --- Normalize each script entry to canonical schema ---
// Canonical keys: facilitator_script (string), visual_guidance, energy_note,
//   modality_notes ({ virtual, in_person }), debrief_questions ([]), activity_run_of_show

for (let i = 1; i <= 17; i++) {
  const key = `slide_${i}`;
  const entry = mergedScripts[key];

  if (!entry) {
    mergedScripts[key] = {
      facilitator_script: '',
      visual_guidance: '',
      energy_note: '',
      modality_notes: { virtual: '', in_person: '' },
      debrief_questions: [],
      activity_run_of_show: null,
      estimated_duration_minutes: null
    };
    continue;
  }

  // --- Normalize key variations from LLM ---
  // LLM sometimes returns estimated_time_minutes instead of estimated_duration_minutes
  if (entry.estimated_time_minutes !== undefined && entry.estimated_duration_minutes === undefined) {
    entry.estimated_duration_minutes = entry.estimated_time_minutes;
  }

  // Extract fields from nested facilitator_script object if LLM nested them
  if (typeof entry.facilitator_script === 'object' && entry.facilitator_script !== null) {
    const fs = entry.facilitator_script;
    // Pull up energy/delivery notes from nested structure
    if (!entry.energy_note && (fs.energy_note || fs.delivery_notes || fs.tone_guidance)) {
      entry.energy_note = fs.energy_note || fs.delivery_notes || fs.tone_guidance || '';
      if (Array.isArray(entry.energy_note)) entry.energy_note = entry.energy_note.join('; ');
    }
    if (!entry.debrief_questions && fs.debrief_questions) {
      entry.debrief_questions = fs.debrief_questions;
    }
    // Flatten facilitator_script to string
    if (fs.verbal_script) {
      entry.facilitator_script = fs.verbal_script;
    } else if (fs.script) {
      entry.facilitator_script = fs.script;
    } else {
      // Fall through to flattenScript below
      entry.facilitator_script = fs;
    }
  }

  // facilitator_script: ensure it exists as a string
  // Handle: `script` key (some groups use this instead of facilitator_script)
  // Handle: `delivery_script` key (another variant)
  // Handle: object-type facilitator_script (some groups return objects with setup/opening/etc.)
  let rawScript = entry.facilitator_script || entry.script || entry.delivery_script || '';
  entry.facilitator_script = flattenScript(rawScript);
  // Clean up variant keys
  if (entry.script) delete entry.script;
  if (entry.delivery_script) delete entry.delivery_script;

  // visual_guidance: string
  if (typeof entry.visual_guidance !== 'string') {
    entry.visual_guidance = entry.visual_direction || '';
    if (Array.isArray(entry.visual_elements)) {
      entry.visual_guidance = entry.visual_elements.join('; ');
    }
  }

  // energy_note: string
  if (typeof entry.energy_note !== 'string') {
    entry.energy_note = '';
  }

  // modality_notes: object with virtual + in_person
  if (typeof entry.modality_notes !== 'object' || entry.modality_notes === null) {
    entry.modality_notes = { virtual: '', in_person: '' };
  } else {
    if (typeof entry.modality_notes.virtual !== 'string') entry.modality_notes.virtual = '';
    if (typeof entry.modality_notes.in_person !== 'string') entry.modality_notes.in_person = '';
  }

  // debrief_questions: array of strings
  if (!Array.isArray(entry.debrief_questions)) {
    entry.debrief_questions = [];
  }

  // activity_run_of_show: string or null
  if (typeof entry.activity_run_of_show !== 'string') {
    entry.activity_run_of_show = null;
  }

  // optional_paths: array of { trigger, alternative }
  if (!Array.isArray(entry.optional_paths)) {
    entry.optional_paths = [];
  }

  // estimated_duration_minutes: integer or null
  if (typeof entry.estimated_duration_minutes === 'number') {
    // keep it
  } else if (typeof entry.estimated_duration_minutes === 'string') {
    const parsed = parseInt(entry.estimated_duration_minutes, 10);
    entry.estimated_duration_minutes = isNaN(parsed) ? null : parsed;
  } else {
    entry.estimated_duration_minutes = null;
  }
}

const filledCount = Object.values(mergedScripts).filter(s =>
  typeof s.facilitator_script === 'string' && s.facilitator_script.length > 10
).length;

return [{ json: {
  status: filledCount >= 14 ? 'scripts_merged' : 'scripts_partial',
  facilitator_script: mergedScripts,
  filled_scripts: filledCount
}}];
