// 6.1_JS_Merge — v2: Merge 7 group content outputs + normalize to canonical schema
// Handles 2 LLM output formats:
//   A) { slide_1: { slide_title, headline, ... }, slide_2: { ... } }  — preferred
//   B) { slides: [ { slide_id, slide_title, ... } ] }  — array format
//
// Post-merge normalization ensures every slide has canonical keys regardless
// of which variant names the LLM used (title/headline/slide_title, etc.).

const items = $input.all();
const slideTemplate = $('1.2_PREP_Input').first().json.slide_template || {};

let mergedSlides = {};
let allGroupNotes = [];

function normalizeKey(id) {
  if (!id) return null;
  const s = String(id);
  return s.startsWith('slide_') ? s : 'slide_' + s;
}

// --- Extract flat bullets from various content structures ---
function extractBullets(slide) {
  if (Array.isArray(slide.bullets) && slide.bullets.length > 0) return slide.bullets;

  // content_blocks: array of objects or strings
  if (Array.isArray(slide.content_blocks)) {
    const bullets = [];
    for (const block of slide.content_blocks) {
      if (typeof block === 'string') {
        bullets.push(block);
      } else if (typeof block === 'object' && block !== null) {
        // Common sub-structures: { items: [...] }, { heading: "...", items: [...] }
        if (Array.isArray(block.items)) {
          for (const item of block.items) {
            bullets.push(typeof item === 'string' ? item : (item.text || item.point || JSON.stringify(item)));
          }
        } else if (Array.isArray(block.column_1_items)) {
          bullets.push(...block.column_1_items.filter(i => typeof i === 'string'));
        } else if (block.heading && !block.items) {
          bullets.push(block.heading);
        }
      }
    }
    return bullets.slice(0, 8);
  }

  // content / body_content / on_screen_text as string
  const textContent = slide.content || slide.body_content || slide.on_screen_text;
  if (typeof textContent === 'string' && textContent.length > 0) {
    return textContent.split(/\n/).map(s => s.replace(/^[\s•\-–—*]+/, '').trim()).filter(s => s.length > 3).slice(0, 8);
  }

  return [];
}

// --- Normalize reviewer_flags from various formats ---
function normalizeFlags(slide) {
  if (Array.isArray(slide.reviewer_flags) && slide.reviewer_flags.length > 0) return slide.reviewer_flags;

  const raw = slide.flags || slide.sensitivity_flags || [];
  if (!Array.isArray(raw)) return [];

  return raw.map(f => {
    if (typeof f === 'string') return { flag: f, reason: '' };
    if (typeof f === 'object' && f !== null) return { flag: f.flag || f.concern || f.issue || JSON.stringify(f), reason: f.reason || '' };
    return null;
  }).filter(Boolean);
}

// --- Normalize visual_guidance from various formats ---
function normalizeVisual(slide) {
  if (typeof slide.visual_guidance === 'string' && slide.visual_guidance) return slide.visual_guidance;
  if (typeof slide.visual_direction === 'string' && slide.visual_direction) return slide.visual_direction;
  if (typeof slide.visual_cues === 'string' && slide.visual_cues) return slide.visual_cues;
  if (Array.isArray(slide.visual_elements)) return slide.visual_elements.join('; ');
  if (typeof slide.visual_elements === 'string' && slide.visual_elements) return slide.visual_elements;
  if (Array.isArray(slide.visual_cues)) return slide.visual_cues.join('; ');
  return '';
}

// --- Merge groups ---

for (let i = 0; i < items.length; i++) {
  const data = items[i].json;
  const response = data.llm_response || data;

  // Format A: slide_N as top-level keys (most common with v2 prompt)
  for (const [k, v] of Object.entries(response)) {
    if (/^slide_\d+$/.test(k) && typeof v === 'object' && v !== null) {
      mergedSlides[k] = v;
    }
  }

  // Format B: slides as array
  if (Array.isArray(response.slides)) {
    for (const slide of response.slides) {
      const key = normalizeKey(slide.slide_id || slide.slide_number);
      if (!key) continue;
      mergedSlides[key] = slide;
    }
  }

  // Legacy Format: slide_specs at top level (v1 compat)
  if (response.slide_specs && typeof response.slide_specs === 'object') {
    for (const [k, v] of Object.entries(response.slide_specs)) {
      const key = normalizeKey(k);
      if (key) mergedSlides[key] = v;
    }
  }

  // Group notes
  const notes = response.group_notes || response.group_summary;
  if (notes) allGroupNotes.push(typeof notes === 'string' ? notes : JSON.stringify(notes));
}

// --- Normalize each slide to canonical schema ---
// Canonical content keys: slide_number, slide_type, headline, subtext, bullets,
//   visual_guidance, key_message, activity, provenance, provenance_source, reviewer_flags
// Extra LLM fields (content_blocks, experience_anchors, etc.) are preserved as-is.

for (let i = 1; i <= 17; i++) {
  const key = `slide_${i}`;
  const slide = mergedSlides[key];

  if (!slide) {
    mergedSlides[key] = {
      slide_number: key,
      slide_type: (slideTemplate[key] || {}).type || '',
      headline: '', subtext: '', bullets: [],
      visual_guidance: '', key_message: '',
      activity: { has_activity: false, instructions: null, duration_minutes: null, debrief_questions: [] },
      provenance: 'New', provenance_source: '',
      reviewer_flags: [{ flag: 'MISSING', reason: 'No content generated for this slide' }]
    };
    continue;
  }

  // slide_number + slide_type (from template — authoritative source)
  slide.slide_number = key;
  slide.slide_type = (slideTemplate[key] || {}).type || slide.slide_type || slide.type || '';

  // headline: the primary display text for the slide
  if (!slide.headline) {
    slide.headline = slide.heading || slide.title || slide.slide_title || slide.quote_text || '';
  }
  // slide_title: descriptive title (may differ from headline)
  if (!slide.slide_title) {
    slide.slide_title = slide.heading || slide.title || slide.headline || '';
  }

  // subtext: supporting context line
  if (!slide.subtext) {
    slide.subtext = slide.subheading || slide.subheadline || slide.subtitle || slide.tagline || '';
  }

  // bullets: flat array of strings
  slide.bullets = extractBullets(slide);

  // visual_guidance: string description
  slide.visual_guidance = normalizeVisual(slide);

  // key_message: single string
  if (!slide.key_message) {
    if (Array.isArray(slide.key_messages)) {
      slide.key_message = slide.key_messages.join(' | ');
    } else {
      slide.key_message = '';
    }
  }

  // activity: object with canonical shape
  if (!slide.activity || typeof slide.activity !== 'object') {
    slide.activity = {
      has_activity: false,
      instructions: null,
      duration_minutes: slide.duration_minutes || null,
      debrief_questions: slide.debrief_questions || []
    };
  }

  // provenance + provenance_source
  // LLM sometimes returns provenance as an object — coerce to string
  if (typeof slide.provenance !== 'string') {
    if (typeof slide.provenance === 'object' && slide.provenance !== null) {
      slide.provenance = slide.provenance.status || slide.provenance.type || 'New';
    } else {
      slide.provenance = slide.provenance_notes ? 'Adapted' : 'New';
    }
  }
  if (!slide.provenance_source) {
    slide.provenance_source = (Array.isArray(slide.kb_units_referenced) && slide.kb_units_referenced.length > 0)
      ? slide.kb_units_referenced[0] : '';
  }

  // reviewer_flags: array of { flag, reason }
  slide.reviewer_flags = normalizeFlags(slide);
}

const filledCount = Object.values(mergedSlides).filter(s => s.headline || s.slide_title).length;

return [{ json: {
  status: filledCount >= 14 ? 'content_merged' : 'content_partial',
  slide_spec: mergedSlides,
  group_notes: allGroupNotes,
  total_slides: Object.keys(mergedSlides).length,
  filled_slides: filledCount
}}];
