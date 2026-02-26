// 7.6_JS_MergeScripts — Merge 7 script group outputs
// No Haiku enforcer — script data is too large for Haiku context.
// Best-effort: collect from all groups, pass through as-is.

const items = $input.all();
const merged = {};

function toKey(id) {
  if (!id) return null;
  const s = String(id);
  return s.startsWith('slide_') ? s : 'slide_' + s;
}

for (const item of items) {
  const data = item.json;
  const response = data.llm_response || data;

  // Format A: direct slide_N keys
  for (const [k, v] of Object.entries(response)) {
    if (/^slide_\d+$/.test(k) && typeof v === 'object' && v !== null) {
      merged[k] = v;
    }
  }

  // Format B: facilitator_script wrapper (object)
  if (typeof response.facilitator_script === 'object' && response.facilitator_script !== null && !Array.isArray(response.facilitator_script)) {
    for (const [k, v] of Object.entries(response.facilitator_script)) {
      const key = toKey(k);
      if (key && typeof v === 'object' && v !== null) merged[key] = v;
    }
  }

  // Format C: array with slide_number (scripts, facilitator_script, or slides)
  const arr = response.scripts || response.slides ||
    (Array.isArray(response.facilitator_script) ? response.facilitator_script : null);
  if (Array.isArray(arr)) {
    for (const script of arr) {
      let num = script.slide_number || script.slide_ref || script.slide_id || script.number;
      if (typeof num === 'string') num = num.replace(/^slide_/i, '');
      if (num) merged['slide_' + num] = script;
    }
  }

  // Legacy: facilitator_scripts (plural)
  if (response.facilitator_scripts && typeof response.facilitator_scripts === 'object' && !Array.isArray(response.facilitator_scripts)) {
    for (const [k, v] of Object.entries(response.facilitator_scripts)) {
      const key = toKey(k);
      if (key) merged[key] = v;
    }
  }
}

const filledCount = Object.values(merged).filter(s =>
  s && (typeof s.facilitator_script === 'string' ? s.facilitator_script.length > 10 :
    typeof s.script === 'string' ? s.script.length > 10 : Object.keys(s).length > 1)
).length;

return [{ json: {
  status: filledCount >= 14 ? 'scripts_merged' : 'scripts_partial',
  facilitator_script: merged,
  filled_scripts: filledCount
}}];
