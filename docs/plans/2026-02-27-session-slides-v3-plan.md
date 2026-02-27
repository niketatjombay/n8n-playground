# Session Slides v3 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix three consultant-reported issues — outline sequence not followed, activities missed, target audience ignored — by rebuilding the alignment, grouping, and content generation stages of the session-slides pipeline.

**Architecture:** Rewrite the outline alignment step to map client outlines to a 17-section structure with dynamic slide expansion. Rebuild group packing to use outline modules instead of even distribution. Inject outline evidence, seniority, and session constraints into every LLM prompt. Add programmatic coverage validation before QC.

**Tech Stack:** n8n workflow (JSON), JavaScript (Code nodes), Claude Sonnet/Haiku (via sub-workflows)

---

## Context for Implementers

### How This Codebase Works

The session-slides pipeline is an **n8n workflow** defined in `n8n/workflows/staging/session-slides/main_workflow.json`. Each n8n Code node has JavaScript embedded in its `jsCode` property. The standalone `_*.js` files in the same directory are **reference copies** of that JS — they're what we edit, and then sync into the workflow JSON.

### Key Conventions

- **Slide IDs**: `slide_1`, `slide_2`, ..., `slide_N` (sequential numbering)
- **Section types**: The 17 types (Session title, Jombay intro, ..., Closing) are sections, not fixed slides. Currently the pipeline creates exactly 17 slides but v3 allows expansion (e.g., 24 slides with multiple Content slides).
- **Node naming**: `Step.SubStep_TYPE_Name` (e.g., `2.0b_FMT_AlignOutline`)
- **LLM calls**: All go through sub-workflow `GDaWNcJJtLdY8Q6Y4Yv5p` with `system_prompt`, `prompt`, `model` fields
- **7 parallel groups**: Content generation uses 7 hardcoded FMT→SUB node pairs. Groups with no slides should skip the LLM call.
- **Files to modify are in**: `n8n/workflows/staging/session-slides/`

### Design Doc

Full design at `docs/plans/2026-02-27-session-slides-v3-design.md`.

---

## Task 1: Rewrite AlignOutline Prompt

**Files:**
- Modify: `n8n/workflows/staging/session-slides/_fmt_alignoutline_node.js`

**What changes:** The alignment prompt must map the outline to the 17-section structure (not arbitrary types), preserve chronological order, consider seniority and session type, and let the LLM decide how many slides each section needs.

**Step 1: Read the current file**

Read `_fmt_alignoutline_node.js` to understand current structure (fallback logic, slide type vocabulary, outline extraction). Keep the fallback path and input extraction unchanged.

**Step 2: Rewrite the system prompt**

Replace the current `systemPrompt` string with:

```javascript
const seniority = validatedInput.project_details?.seniority_of_cohort || 'Not specified';
const sessionType = (validatedInput.session_constraints?.sessionType
  || validatedInput.session_constraints?.session_type || 'Not specified');
const totalDuration = (validatedInput.session_constraints?.totalDuration
  || validatedInput.session_constraints?.total_duration || 'Not specified');
const additionalInstructions = (validatedInput.session_constraints?.additionalInstructions
  || validatedInput.session_constraints?.additional_instructions || '');

const systemPrompt = `You are an expert presentation architect at Jombay (HR L&D consulting). Read a client-approved content outline and map it to a 17-SECTION presentation structure.

THE OUTLINE IS THE SINGLE SOURCE OF TRUTH. Every outline item must map to a slide. Every slide must follow the outline's chronological order.

THE 17 SECTIONS (in delivery order):
1. Session title       [STATIC — always 1 slide]
2. Jombay intro        [STATIC — always 1 slide]
3. Trainer intro       [STATIC — always 1 slide]
4. Agenda              [STATIC — always 1 slide]
5. Working Agreement   [0-1 slides — include for interactive sessions]
6. Program overview    [1 slide]
7. Objectives          [1 slide]
8. Module breaker      [0-N slides — one per major topic transition in outline]
9. Content (AC)        [1-N slides — one per content topic/theme in outline]
10. Quote              [0-N slides — where relevant to outline themes]
11. Discussion/Reflection (RO) [0-N slides — per debrief/discussion in outline]
12. Activity (CE)      [0-N slides — per activity/exercise/role-play in outline]
13. Break              [0-N slides — where outline indicates breaks/lunch/tea]
14. Questions          [STATIC — always 1 slide]
15. Feedback           [STATIC — always 1 slide]
16. Call to Action (AE)[STATIC — always 1 slide]
17. Closing            [STATIC — always 1 slide]

AUDIENCE SENIORITY: ${seniority}
- Senior (Director/VP/C-suite): Fewer introductory slides, deeper content, strategic activities, skip basic definitions
- Mid-level (Manager/Senior IC): Balanced theory + application, scenario-based activities
- Junior (IC/New hire): More scaffolding, structured exercises, define terms, more context slides

SESSION TYPE: ${sessionType}
- Virtual: Shorter activities, digital engagement, breakout rooms
- In-person: Longer group work, physical movement, hands-on exercises

TIMING:
- If outline has time slots (e.g., "09:00-09:30") → use as ground truth for duration
- If outline has NO time details → use total duration (${totalDuration}) to allocate proportionally
- Include estimated_duration_minutes for each slide

PLANNING RULES:
- PRESERVE CHRONOLOGICAL ORDER from the outline — the outline IS the delivery sequence
- Each outline time slot maps to one or more slides IN ASCENDING slide numbers
- NEVER reorder outline content for "pedagogical flow" — the outline defines the flow
- DO NOT merge multiple outline topics into one slide — each topic gets its own slide
- DO NOT skip any outline item — every topic, activity, discussion, break must have a slide
- Each activity/exercise in outline gets its OWN Activity (CE) slide
- Each discussion/debrief gets its OWN Discussion/Reflection (RO) slide
- Each content theme gets its OWN Content (AC) slide
- Add Module breaker slides between major topic transitions
- Static sections (1-4 and 14-17) are always present, always 1 slide each
- You decide the optimal total number of slides — no fixed limit

${additionalInstructions ? '\\nUSER GUIDELINES:\\n' + additionalInstructions + '\\n' : ''}

SLIDE TYPE VOCABULARY (choose from these):
${JSON.stringify(slideTypeVocab.map(s => s.type))}

OUTPUT FORMAT (JSON object):
{
  "section_expansion": {
    "slide_1": 1,
    "slide_2": 1,
    "slide_9": 3,
    "slide_12": 2
  },
  "slide_plan": [
    {
      "slide_number": 1,
      "slide_type": "Session title",
      "section_number": 1,
      "outline_ref": "09:00-09:10",
      "outline_topic": "Opening & Welcome",
      "outline_excerpt": "EXACT text from outline for this slide",
      "alignment_rationale": "1 sentence explaining why this maps here",
      "estimated_duration_minutes": 10
    }
  ],
  "delivery_sequence": ["slide_1", "slide_2", "slide_3", ...],
  "total_slides": N,
  "timing_source": "outline | estimated"
}

IMPORTANT:
- section_expansion maps each section NUMBER (1-17) to how many slides it expands to
- slide_plan has one entry per actual slide, numbered sequentially (slide_1, slide_2, ..., slide_N)
- Each entry includes section_number indicating which of the 17 sections this slide belongs to
- delivery_sequence is the ordered list of all slide IDs matching slide_plan order
- Return ONLY the JSON object — no markdown, no commentary`;
```

**Step 3: Update the user prompt**

Replace the current `userPrompt` with:

```javascript
const userPrompt = 'Create a slide plan by mapping this content outline to the 17-section structure.\n\n'
  + '=== CONTENT OUTLINE ===\n'
  + JSON.stringify(formattedOutline) + '\n\n'
  + (extractedText ? '=== RAW OUTLINE TEXT (for additional context) ===\n' + extractedText.substring(0, 5000) + '\n\n' : '')
  + '=== INSTRUCTIONS ===\n'
  + 'Read the outline carefully. Map every outline item to the appropriate section type.\n'
  + 'Each content topic gets its own Content (AC) slide. Each activity gets its own Activity (CE) slide.\n'
  + 'Preserve the outline\'s chronological order exactly.\n'
  + 'Include section_number for each slide so downstream systems know which section it belongs to.';
```

**Step 4: Update the return statement**

Add `session_constraints` and `seniority` to the output for downstream consumption:

```javascript
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
```

**Step 5: Verify fallback path is intact**

Ensure the `if (!hasOutlineData && extractedText.length < 50)` fallback block still returns a valid default plan with the 17-slide template. The default plan must include `section_number` and `delivery_sequence` fields matching the new format.

Update the fallback to include:

```javascript
if (!hasOutlineData && extractedText.length < 50) {
  const defaultPlan = [];
  const defaultTemplate = {};
  const deliverySeq = [];
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
    deliverySeq.push('slide_' + num);
  }
  return [{ json: {
    slide_plan: defaultPlan,
    total_slides: 17,
    slide_template: defaultTemplate,
    outline_alignment: Object.fromEntries(defaultPlan.map(s => [
      'slide_' + s.slide_number,
      { has_outline_evidence: false, outline_section: null, outline_excerpt: null, alignment_rationale: 'No outline available', section_number: s.section_number }
    ])),
    delivery_sequence: deliverySeq,
    section_expansion: Object.fromEntries(slideTypeVocab.map((_, i) => ['slide_' + (i + 1), 1])),
    status: 'default_template',
    slides_with_evidence: 0,
    timing_source: 'none'
  }}];
}
```

**Step 6: Commit**

```bash
git add n8n/workflows/staging/session-slides/_fmt_alignoutline_node.js
git commit -m "feat(session-slides): rewrite AlignOutline prompt for 17-section mapping

Adds chronological order preservation, seniority awareness, session type
consideration, and section_number + delivery_sequence output fields."
```

---

## Task 2: Update AlignOutline Parser

**Files:**
- Modify: `n8n/workflows/staging/session-slides/_js_alignoutline_node.js`

**What changes:** Parse the new output format including `section_number`, `delivery_sequence`, `section_expansion`, and `timing_source`. Build the dynamic slide_template with proper Gagné/Kolb/AGES lookups.

**Step 1: Read the current file**

Read `_js_alignoutline_node.js`. The core logic (typeMap, LLM response parsing, template building) stays the same. We add new fields.

**Step 2: Update the parser to extract new fields**

Replace the template-building loop and return statement:

```javascript
// Extract new v3 fields
const deliverySequence = parsed.delivery_sequence || [];
const sectionExpansion = parsed.section_expansion || {};
const timingSource = parsed.timing_source || 'unknown';

for (const entry of slidePlan) {
  const num = entry.slide_number;
  const key = 'slide_' + num;
  const slideType = entry.slide_type || 'Content (AC)';
  const typeInfo = typeMap[slideType] || { gagne: null, kolb: null, ages: 'Generation' };

  slideTemplate[key] = {
    type: slideType,
    gagne: typeInfo.gagne,
    kolb: typeInfo.kolb,
    ages: typeInfo.ages,
    section_number: entry.section_number || num
  };

  const hasEvidence = !!(entry.outline_excerpt && entry.outline_excerpt.length > 10);
  if (hasEvidence) slidesWithEvidence++;

  outlineAlignment[key] = {
    has_outline_evidence: hasEvidence,
    outline_section: entry.outline_ref || entry.outline_topic || null,
    outline_excerpt: entry.outline_excerpt || null,
    alignment_rationale: entry.alignment_rationale || '',
    section_number: entry.section_number || num,
    estimated_duration_minutes: entry.estimated_duration_minutes || 0
  };
}

// Build delivery_sequence if LLM didn't provide it (fallback to slide order)
const finalSequence = deliverySequence.length > 0
  ? deliverySequence
  : slidePlan.map(e => 'slide_' + e.slide_number);

return [{ json: {
  slide_plan: slidePlan,
  total_slides: totalSlides,
  slide_template: slideTemplate,
  outline_alignment: outlineAlignment,
  delivery_sequence: finalSequence,
  section_expansion: sectionExpansion,
  timing_source: timingSource,
  status: slidesWithEvidence >= Math.ceil(totalSlides * 0.5) ? 'aligned' : 'partial',
  slides_with_evidence: slidesWithEvidence
}}];
```

**Step 3: Commit**

```bash
git add n8n/workflows/staging/session-slides/_js_alignoutline_node.js
git commit -m "feat(session-slides): update AlignOutline parser for v3 output format

Adds section_number, delivery_sequence, section_expansion, timing_source
to parsed alignment output."
```

---

## Task 3: Update Content Tagging for Expanded Slides

**Files:**
- Modify: `n8n/workflows/staging/session-slides/_fmt_tag_content_node.js`

**What changes:** Tag KB units and pre-work slides to expanded slide IDs (e.g., `slide_9`, `slide_10` when section 9 expands to 2 slides) instead of the fixed 17 section types. Needs the dynamic slide list from alignment.

**Step 1: Read the current file**

Read `_fmt_tag_content_node.js`. Current mapping guidance hardcodes "slide_1 through slide_17". This must become dynamic.

**Step 2: Update to read dynamic slide template from alignment**

Replace the `sessionSlides` building logic:

```javascript
// Read dynamic slide template from alignment (v3: expanded slides)
let slideTemplate = validatedInput.slide_template || {};
let outlineAlignment = {};
try {
  const alignData = $('2.0d_JS_AlignOutline').first().json;
  if (alignData.slide_template && Object.keys(alignData.slide_template).length > 0) {
    slideTemplate = alignData.slide_template;
  }
  outlineAlignment = alignData.outline_alignment || {};
} catch(e) {}

// Build session slide list with outline context for better tagging
const sessionSlides = {};
for (const [key, val] of Object.entries(slideTemplate)) {
  const alignment = outlineAlignment[key] || {};
  sessionSlides[key] = {
    type: val.type,
    outline_topic: alignment.outline_section || '',
    outline_excerpt: (alignment.outline_excerpt || '').substring(0, 200)
  };
}
```

**Step 3: Update the system prompt**

Replace the hardcoded mapping guidance with dynamic guidance:

```javascript
const systemPrompt = `You are a content mapping assistant. Given a list of session slides (with their types and outline topics), pre-work slides, and knowledge base units, determine which pre-work slides and KB units are relevant to each session slide.

OUTPUT RULES:
- Return ONLY valid JSON with keys matching the session slide IDs provided.
- Each key maps to: { "kb_units": ["id", ...], "pre_work_slides": ["id", ...] }
- A pre-work slide or KB unit can map to MULTIPLE session slides.
- Some session slides may have empty arrays (e.g., Break, Module breaker).
- Do NOT add commentary — ONLY the JSON object.

MAPPING GUIDANCE:
- Each session slide has a TYPE and an OUTLINE TOPIC. Use both to determine relevance.
- Match KB units to slides whose outline topic aligns with the KB unit's subject matter.
- Match pre-work slides to session slides based on content similarity.
- Content (AC) slides about specific topics should get KB units about those same topics.
- Activity (CE) slides should get KB units with exercises/activities related to the topic.
- Discussion/Reflection (RO) slides should get pre-work slides with challenges/examples.
- Static slides (Session title, Jombay intro, Trainer intro, Agenda, Break, Closing) typically get empty arrays.
- Use the outline excerpts to understand WHAT each slide is about — map KB/pre-work to the right topic.`;
```

**Step 4: Update user prompt**

```javascript
const userPrompt = `Map the pre-work slides and KB units to session slides. Return ONLY the JSON object.

=== SESSION SLIDES (${Object.keys(sessionSlides).length} slides with types and outline topics) ===
${JSON.stringify(sessionSlides)}

=== PRE-WORK SLIDES (${pwSummary.length} items) ===
${JSON.stringify(pwSummary)}

=== KB UNITS (${kbSummary.length} items) ===
${JSON.stringify(kbSummary)}

=== CONTENT OUTLINE (module structure — use to guide mapping) ===
${Object.keys(contentOutline).length > 0 ? JSON.stringify(contentOutline) : 'No content outline available.'}`;
```

**Step 5: Commit**

```bash
git add n8n/workflows/staging/session-slides/_fmt_tag_content_node.js
git commit -m "feat(session-slides): update content tagging for expanded slide IDs

Tags KB and pre-work to specific expanded slides using outline topics
instead of hardcoded 17-section types."
```

---

## Task 4: Update Blueprint Node

**Files:**
- Modify: `n8n/workflows/staging/session-slides/_fmt_agent1a_node.js`

**What changes:** Add `additionalInstructions` as USER GUIDELINES section. Update seniority handling beyond just Bloom's. Read dynamic totalSlides from alignment. Pass `additionalInstructions` through to downstream.

**Step 1: Read the current file**

Read `_fmt_agent1a_node.js`. The blueprint prompt already receives outline alignment, seniority (for Bloom's), and content tags. We need to:
1. Add USER GUIDELINES section with additionalInstructions
2. Enhance seniority handling in the system prompt
3. Update slide count references to use dynamic total

**Step 2: Add additionalInstructions and enhanced seniority to system prompt**

After the existing BLOOM'S TAXONOMY section, add:

```javascript
// Add to systemPrompt before the closing backtick:

`
AUDIENCE ADAPTATION:
Seniority: ${projectDetails.seniority_of_cohort || 'Not specified'}
- Senior (Director/VP/C-suite): Strategic framing, skip basic definitions, business impact language, provocative questions
- Mid-level (Manager/Senior IC): Balance theory + application, connect to daily reality
- Junior (IC/New hire): Foundational scaffolding, define terms, structured exercises, more guidance

Adapt your blueprint direction for each slide based on this seniority level.
Content direction, key messages, and experience anchors should all reflect the audience level.

${additionalInstructions ? 'USER GUIDELINES:\\n' + additionalInstructions + '\\nFollow these unless they conflict with the session outline.' : ''}`
```

**Step 3: Extract additionalInstructions from session constraints**

Add near the top of the file after `sessionConstraints` is defined:

```javascript
const additionalInstructions = sessionConstraints.additionalInstructions
  || sessionConstraints.additional_instructions || '';
```

**Step 4: Update hardcoded slide count references**

Replace any `17` references in the prompt with `${totalSlides}`:
- "slide_1 through slide_17" → `slide_1 through slide_${totalSlides}`
- "all 17 slides" → `all ${totalSlides} slides`

**Step 5: Commit**

```bash
git add n8n/workflows/staging/session-slides/_fmt_agent1a_node.js
git commit -m "feat(session-slides): add seniority adaptation and user guidelines to Blueprint

Adds AUDIENCE ADAPTATION section and USER GUIDELINES (additionalInstructions)
to blueprint prompt. Updates slide count to dynamic."
```

---

## Task 5: Rewrite SplitGroups for Module-Based Packing

**Files:**
- Modify: `n8n/workflows/staging/session-slides/_js_splitgroups_node.js`

**What changes:** Pack slides by outline module boundaries instead of even count distribution. Add seniority and session type to Agent 2 system prompt. Add additionalInstructions as user guidelines.

**Step 1: Read the current file**

Read `_js_splitgroups_node.js`. Key sections to replace:
1. The group distribution logic (currently even by count)
2. The Agent 2 system prompt (add seniority + session type + additionalInstructions)

**Step 2: Replace the group distribution logic**

Replace everything from `// Dynamic group distribution` through `const groupDefs = groupNames.map(...)` with module-based packing:

```javascript
// Module-based group packing (v3)
// Group 1: Static opening (sections 1-4)
// Groups 2-6: Outline modules (content sections packed by outline module)
// Group 7: Static closing (sections 14-17)

const STATIC_OPEN = [1, 2, 3, 4];   // Session title through Agenda
const STATIC_CLOSE = [14, 15, 16, 17]; // Questions through Closing

// Classify each slide by section_number
const openingSlides = [];
const closingSlides = [];
const contentSlides = []; // All non-static slides

for (let i = 1; i <= totalSlides; i++) {
  const key = 'slide_' + i;
  const sectionNum = (slideTemplate[key] || {}).section_number || i;

  if (STATIC_OPEN.includes(sectionNum)) {
    openingSlides.push(key);
  } else if (STATIC_CLOSE.includes(sectionNum)) {
    closingSlides.push(key);
  } else {
    contentSlides.push({ key, sectionNum, outline: outlineAlignment[key] || {} });
  }
}

// Group content slides by their outline module (outline_section)
const moduleGroups = [];
let currentModule = null;
let currentGroup = [];

for (const slide of contentSlides) {
  const moduleId = slide.outline.outline_section || 'section_' + slide.sectionNum;
  if (moduleId !== currentModule && currentGroup.length > 0) {
    moduleGroups.push({ module: currentModule, slides: currentGroup.map(s => s.key) });
    currentGroup = [];
  }
  currentModule = moduleId;
  currentGroup.push(slide);
}
if (currentGroup.length > 0) {
  moduleGroups.push({ module: currentModule, slides: currentGroup.map(s => s.key) });
}

// Pack into 5 content slots (groups 2-6)
// If <=5 modules, one per slot. If >5, merge smallest adjacent.
let packedModules = [...moduleGroups];
while (packedModules.length > 5) {
  // Find smallest adjacent pair to merge
  let minSize = Infinity;
  let minIdx = 0;
  for (let i = 0; i < packedModules.length - 1; i++) {
    const combined = packedModules[i].slides.length + packedModules[i + 1].slides.length;
    if (combined < minSize) {
      minSize = combined;
      minIdx = i;
    }
  }
  // Merge
  const merged = {
    module: packedModules[minIdx].module + ' + ' + packedModules[minIdx + 1].module,
    slides: [...packedModules[minIdx].slides, ...packedModules[minIdx + 1].slides]
  };
  packedModules.splice(minIdx, 2, merged);
}

// Build final 7 group definitions
const groupDefs = [];

// Group 1: Static opening
groupDefs.push({
  key: 'group_1',
  name: 'Opening',
  slides: openingSlides,
  types: openingSlides.map(k => (slideTemplate[k] || {}).type || '').join(', ')
});

// Groups 2-6: Content modules
for (let i = 0; i < 5; i++) {
  if (i < packedModules.length) {
    const mod = packedModules[i];
    groupDefs.push({
      key: 'group_' + (i + 2),
      name: mod.module || 'Content ' + (i + 1),
      slides: mod.slides,
      types: mod.slides.map(k => (slideTemplate[k] || {}).type || '').join(', ')
    });
  } else {
    // Empty group — no slides
    groupDefs.push({
      key: 'group_' + (i + 2),
      name: 'Empty',
      slides: [],
      types: ''
    });
  }
}

// Group 7: Static closing
groupDefs.push({
  key: 'group_7',
  name: 'Closing',
  slides: closingSlides,
  types: closingSlides.map(k => (slideTemplate[k] || {}).type || '').join(', ')
});
```

**Step 3: Add seniority and session type to Agent 2 system prompt**

At the end of the existing `agent2SystemPrompt` string, BEFORE the closing backtick, add:

```javascript
// Add after the existing IMPORTANT section:

`
=== AUDIENCE ADAPTATION ===
Target audience seniority: ${validatedInput.project_details?.seniority_of_cohort || 'Not specified'}

SENIOR (Director/VP/C-suite):
- Strategic framing — "why this matters for your business unit"
- Skip foundational definitions — assume they know the basics
- Business impact language, not training jargon
- Activities: strategic application, not skill-building drills
- Fewer bullets, more provocative questions
- Examples from P&L, strategy, cross-functional leadership

MID-LEVEL (Manager/Senior IC):
- Balance theory + practical application
- Connect to daily reality (team, projects, cross-functional work)
- Activities: scenario practice with realistic complexity

JUNIOR (Individual Contributor/New hire):
- Step-by-step scaffolding, define terms
- Activities: structured exercises with clear instructions
- More bullets, more guidance, concrete examples

=== SESSION TYPE ===
Delivery format: ${validatedInput.session_constraints?.sessionType || validatedInput.session_constraints?.session_type || 'Not specified'}
Total duration: ${validatedInput.session_constraints?.totalDuration || validatedInput.session_constraints?.total_duration || 'Not specified'}
- Virtual: digital-first engagement, screen-sharing, breakout rooms, shorter activities
- In-person: group work, physical movement, handouts, longer exercises
Tailor content depth and activity design to this format and duration.

${(validatedInput.session_constraints?.additionalInstructions || validatedInput.session_constraints?.additional_instructions) ? '=== USER GUIDELINES ===\\n' + (validatedInput.session_constraints.additionalInstructions || validatedInput.session_constraints.additional_instructions) + '\\nFollow these unless they conflict with the session outline.' : ''}`
```

**Step 4: Store delivery_sequence in output**

Add to the return statement:

```javascript
// Add to the returned json object:
delivery_sequence: deliverySequence,  // from alignment node
```

Where `deliverySequence` is read from alignment:

```javascript
let deliverySequence = [];
try {
  deliverySequence = $('2.0d_JS_AlignOutline').first().json.delivery_sequence || [];
} catch(e) { deliverySequence = []; }
```

**Step 5: Commit**

```bash
git add n8n/workflows/staging/session-slides/_js_splitgroups_node.js
git commit -m "feat(session-slides): module-based group packing + seniority in Agent 2

Packs slides by outline modules instead of even distribution. Adds
AUDIENCE ADAPTATION and SESSION TYPE sections to Agent 2 system prompt."
```

---

## Task 6: Update Group Template and Individual Group Nodes

**Files:**
- Modify: `n8n/workflows/staging/session-slides/_fmt_group_template.js`
- Modify: `n8n/workflows/staging/session-slides/_fmt_group1_node.js` through `_fmt_group7_node.js`

**What changes:** The template and individual group nodes need empty-group handling (skip LLM call if group has no slides). The template needs to be updated to match the individual nodes which already have outline alignment injection.

**Step 1: Add empty-group guard to the template**

At the top of `_fmt_group_template.js`, after `const group = data.groups.GROUP_KEY;`, add:

```javascript
// Skip LLM call if group has no slides (v3: some groups may be empty)
if (!group || !group.slides || group.slides.length === 0) {
  return [{ json: {
    system_prompt: '',
    prompt: '',
    model: 'global.anthropic.claude-sonnet-4-6',
    node_name: 'Agent2_GroupGROUP_NUM',
    skip: true,
    memory_id: data.memory_id,
    knowledge_base_id: data.knowledge_base_id,
    workflow_session_id: data.workflow_session_id,
    workflow_id: data.workflow_id,
    project_id: data.project_id,
    client_id: data.client_id
  }}];
}
```

**Step 2: Add the same empty-group guard to each `_fmt_group1..7_node.js`**

Apply the same guard to each individual group node, replacing `GROUP_KEY` with `group_1` through `group_7` and `GROUP_NUM` with `1` through `7`.

**Step 3: Verify outline alignment injection exists in all group nodes**

All 7 group nodes already have the `=== OUTLINE ALIGNMENT ===` section (verified). Ensure the template also has it (it currently does NOT — the template lags behind the individual nodes).

Update `_fmt_group_template.js` to match the individual nodes by adding the outline alignment section. The individual group nodes (e.g., `_fmt_group1_node.js`) are the source of truth.

**Step 4: Add additionalInstructions to user prompt**

In both the template and individual nodes, add after the `=== SESSION CONSTRAINTS ===` section:

```javascript
  + ((data.session_constraints.additionalInstructions || data.session_constraints.additional_instructions || '')
    ? '=== USER GUIDELINES ===\n'
      + (data.session_constraints.additionalInstructions || data.session_constraints.additional_instructions) + '\n'
      + 'Follow these unless they conflict with the session outline.\n\n'
    : '')
```

**Step 5: Commit**

```bash
git add n8n/workflows/staging/session-slides/_fmt_group_template.js
git add n8n/workflows/staging/session-slides/_fmt_group{1,2,3,4,5,6,7}_node.js
git commit -m "feat(session-slides): add empty-group guard and user guidelines to group nodes

Skips LLM call for empty groups. Adds additionalInstructions as USER
GUIDELINES section to content generation prompts."
```

---

## Task 7: Create Outline Coverage Validation Node

**Files:**
- Create: `n8n/workflows/staging/session-slides/_js_coverage_check_node.js`

**What changes:** New pure-JS node that cross-checks every outline item against generated slides. Runs after content merge, before QC.

**Step 1: Write the coverage check node**

```javascript
// 6.2_JS_CoverageCheck — Outline coverage validation (v3)
// Input: $input = 6.1_JS_Merge (merged content from all groups)
// Reads: 2.0d_JS_AlignOutline (outline alignment with slide plan)
// Output: coverage_report for QC consumption
//
// Pure JS — no LLM call. Validates every outline item has a generated slide.

const mergedContent = $input.first().json;
const rawSlides = mergedContent.raw_slides || {};

let outlineAlignment = {};
let slidePlan = [];
let deliverySequence = [];
try {
  const alignData = $('2.0d_JS_AlignOutline').first().json;
  outlineAlignment = alignData.outline_alignment || {};
  slidePlan = alignData.slide_plan || [];
  deliverySequence = alignData.delivery_sequence || [];
} catch(e) {}

const covered = [];
const missing = [];
const extraSlides = [];

// Check each outline-mapped slide
for (const entry of slidePlan) {
  const slideKey = 'slide_' + entry.slide_number;
  const hasOutlineEvidence = !!(entry.outline_excerpt && entry.outline_excerpt.length > 10);

  if (!hasOutlineEvidence) continue; // Static slides without outline mapping — skip

  const slideContent = rawSlides[slideKey];
  const hasContent = slideContent && (slideContent.slide_title || slideContent.headline);

  if (hasContent) {
    covered.push({
      slide_id: slideKey,
      outline_ref: entry.outline_ref || '',
      outline_topic: entry.outline_topic || '',
      section_type: entry.slide_type || ''
    });
  } else {
    missing.push({
      slide_id: slideKey,
      outline_ref: entry.outline_ref || '',
      outline_topic: entry.outline_topic || '',
      section_type: entry.slide_type || '',
      status: 'MISSING'
    });
  }
}

// Check for generated slides not in the plan
for (const slideKey of Object.keys(rawSlides)) {
  const num = parseInt(slideKey.replace('slide_', ''), 10);
  const inPlan = slidePlan.some(e => e.slide_number === num);
  if (!inPlan) {
    extraSlides.push({ slide_id: slideKey, status: 'EXTRA' });
  }
}

const totalOutlineItems = covered.length + missing.length;
const coveragePercentage = totalOutlineItems > 0
  ? Math.round(covered.length / totalOutlineItems * 100)
  : 100;

return [{ json: {
  ...mergedContent,
  coverage_report: {
    coverage_percentage: coveragePercentage,
    total_outline_items: totalOutlineItems,
    covered_count: covered.length,
    missing_count: missing.length,
    covered_items: covered,
    missing_items: missing,
    extra_slides: extraSlides,
    total_slides_generated: Object.keys(rawSlides).length,
    delivery_sequence: deliverySequence
  }
}}];
```

**Step 2: Commit**

```bash
git add n8n/workflows/staging/session-slides/_js_coverage_check_node.js
git commit -m "feat(session-slides): add outline coverage validation node

Pure JS node that cross-checks every outline item against generated
slides. Reports coverage percentage, missing items, and extra slides."
```

---

## Task 8: Update QC Quality Node

**Files:**
- Modify: `n8n/workflows/staging/session-slides/_fmt_qc_quality_node.js`

**What changes:** Receive coverage report data, validate session type compliance, update hardcoded "17 slides" to dynamic count, add additionalInstructions awareness.

**Step 1: Read the current file**

Read `_fmt_qc_quality_node.js`. It currently hardcodes "17 slides" and doesn't receive coverage data.

**Step 2: Read coverage report from upstream**

Add after existing data reads:

```javascript
// Read coverage report (v3)
const coverageReport = merged.coverage_report || {};
const totalSlides = coverageReport.total_slides_generated || 17;
```

**Step 3: Update hardcoded slide references**

Replace `for (let i = 1; i <= 17; i++)` with `for (let i = 1; i <= totalSlides; i++)`.

Replace "all 17 slides" in the system prompt with `all ${totalSlides} slides`.

**Step 4: Add coverage and session type checks to system prompt**

Add to the system prompt after the existing COMPLIANCE CHECKS:

```javascript
// Add to systemPrompt:
`
=== OUTLINE COVERAGE CHECK ===
Coverage: ${coverageReport.coverage_percentage || 'N/A'}%
${(coverageReport.missing_items || []).length > 0
  ? 'MISSING OUTLINE ITEMS (flag these as Critical):\\n'
    + (coverageReport.missing_items || []).map(m => '- ' + m.slide_id + ': ' + m.outline_topic + ' (' + m.outline_ref + ')').join('\\n')
  : 'All outline items covered.'}

=== SESSION TYPE COMPLIANCE ===
Session type: ${validatedInput.session_constraints?.sessionType || validatedInput.session_constraints?.session_type || 'Not specified'}
- Virtual: flag any reference to physical movement, handouts, room setup
- In-person: flag any reference to breakout rooms, screen sharing, chat polling
`
```

**Step 5: Add seniority to user prompt context**

This is already present (`Audience: seniority_of_cohort`). Verify it's there.

**Step 6: Commit**

```bash
git add n8n/workflows/staging/session-slides/_fmt_qc_quality_node.js
git commit -m "feat(session-slides): add coverage check and session type compliance to QC

QC quality node now receives outline coverage report and flags missing
items. Validates content matches session type (virtual vs in-person)."
```

---

## Task 9: Update PrepScripts for Dynamic Groups

**Files:**
- Modify: `n8n/workflows/staging/session-slides/_js_prep_scripts_node.js`

**What changes:** Replace hardcoded 7 group definitions with dynamic group definitions from SplitGroups. Add session type to script system prompt.

**Step 1: Read the current file**

Read `_js_prep_scripts_node.js`. It has hardcoded `groupDefs` array with fixed slide assignments. This must match the dynamic groups from SplitGroups.

**Step 2: Replace hardcoded group definitions**

Replace the hardcoded `groupDefs` array with dynamic group reading:

```javascript
// Read dynamic group definitions from SplitGroups (v3)
const splitGroupsData = $('4.1_JS_SplitGroups').first().json;
const dynamicGroups = splitGroupsData.groups || {};

// Build group definitions from SplitGroups output
const groupDefs = [];
for (let i = 1; i <= 7; i++) {
  const groupKey = 'group_' + i;
  const group = dynamicGroups[groupKey];
  if (group && group.slides && group.slides.length > 0) {
    groupDefs.push({
      key: groupKey,
      name: group.name,
      slides: group.slides,
      types: group.slide_types || group.slides.map(k => (slideTemplate[k] || {}).type || '').join(', ')
    });
  } else {
    groupDefs.push({
      key: groupKey,
      name: 'Empty',
      slides: [],
      types: ''
    });
  }
}
```

**Step 3: Add empty-group handling in group data building**

In the loop that builds `groups`, add a skip for empty groups:

```javascript
for (const def of groupDefs) {
  if (def.slides.length === 0) {
    groups[def.key] = { name: 'Empty', slides: [], slide_types: '', content: {}, blueprint: {}, slide_template: {}, qc_flags: {}, tagged_pre_work: {} };
    continue;
  }
  // ... existing per-slide data building
}
```

**Step 4: Add additionalInstructions and session type to script system prompt**

In the `scriptSystemPrompt`, add after the QUALITY BAR section:

```javascript
`
=== SESSION TYPE ===
Delivery format: ${validatedInput.session_constraints?.sessionType || validatedInput.session_constraints?.session_type || 'Not specified'}
Total duration: ${validatedInput.session_constraints?.totalDuration || validatedInput.session_constraints?.total_duration || 'Not specified'}
- Virtual: breakout rooms, screen sharing, chat polls, shorter pacing
- In-person: physical movement, group formations, props, whiteboard
Adapt all scripts and modality_notes to this session type.

${(validatedInput.session_constraints?.additionalInstructions || validatedInput.session_constraints?.additional_instructions) ? '=== USER GUIDELINES ===\\n' + (validatedInput.session_constraints.additionalInstructions || validatedInput.session_constraints.additional_instructions) + '\\nFollow these in your scripts unless they conflict with the session outline.' : ''}`
```

**Step 5: Commit**

```bash
git add n8n/workflows/staging/session-slides/_js_prep_scripts_node.js
git commit -m "feat(session-slides): dynamic group definitions in PrepScripts

Reads groups from SplitGroups instead of hardcoded definitions. Adds
session type and user guidelines to facilitator script system prompt."
```

---

## Task 10: Update Facilitator Script Group Nodes

**Files:**
- Modify: `n8n/workflows/staging/session-slides/_fmt_scr1_node.js` through `_fmt_scr7_node.js`
- Modify: `n8n/workflows/staging/session-slides/_fmt_script_template.js`

**What changes:** Add empty-group guard (same pattern as content group nodes). Add additionalInstructions to user prompt.

**Step 1: Add empty-group guard**

At the top of each `_fmt_scrN_node.js` and the template, after `const group = data.groups.group_N;`, add:

```javascript
// Skip LLM call if group has no slides
if (!group || !group.slides || group.slides.length === 0) {
  return [{ json: {
    system_prompt: '',
    prompt: '',
    model: 'global.anthropic.claude-sonnet-4-6',
    node_name: 'Script_GroupN',
    skip: true,
    memory_id: data.memory_id,
    knowledge_base_id: data.knowledge_base_id,
    workflow_session_id: data.workflow_session_id,
    workflow_id: data.workflow_id,
    project_id: data.project_id,
    client_id: data.client_id
  }}];
}
```

**Step 2: Add additionalInstructions to user prompt**

In each script node, add after the SESSION CONSTRAINTS section:

```javascript
  + ((data.session_constraints.additionalInstructions || data.session_constraints.additional_instructions || '')
    ? '=== USER GUIDELINES ===\n'
      + (data.session_constraints.additionalInstructions || data.session_constraints.additional_instructions) + '\n'
      + 'Follow these in your scripts unless they conflict with the session outline.\n\n'
    : '')
```

**Step 3: Commit**

```bash
git add n8n/workflows/staging/session-slides/_fmt_scr{1,2,3,4,5,6,7}_node.js
git add n8n/workflows/staging/session-slides/_fmt_script_template.js
git commit -m "feat(session-slides): add empty-group guard and user guidelines to script nodes

Skips LLM call for empty groups. Adds additionalInstructions as USER
GUIDELINES to facilitator script generation prompts."
```

---

## Task 11: Update Assembly Node

**Files:**
- Modify: `n8n/workflows/staging/session-slides/_js_assemble_node.js`

**What changes:** Handle variable slide count (not hardcoded 17). Order output slides by `delivery_sequence`. Include coverage report in output metadata.

**Step 1: Read the current file**

Read `_js_assemble_node.js`. Find all `17` references and loops that assume fixed slide count.

**Step 2: Read dynamic slide count and delivery sequence**

Add near the top:

```javascript
// v3: dynamic slide count from alignment
let totalSlides = 17;
let deliverySequence = [];
try {
  const alignData = $('2.0d_JS_AlignOutline').first().json;
  totalSlides = alignData.total_slides || 17;
  deliverySequence = alignData.delivery_sequence || [];
} catch(e) {}

// Fallback: build delivery_sequence from slide count
if (deliverySequence.length === 0) {
  for (let i = 1; i <= totalSlides; i++) {
    deliverySequence.push('slide_' + i);
  }
}
```

**Step 3: Replace hardcoded `for (let i = 1; i <= 17; i++)` loops**

Replace all `for (let i = 1; i <= 17; i++)` with `for (const slideKey of deliverySequence)` and adjust the inner logic to use `slideKey` directly instead of `'slide_' + i`.

**Step 4: Add coverage report to output metadata**

In the final output object, add:

```javascript
// In metadata section:
coverage_report: coverageReport,  // from merged content

// Read coverage from upstream
const coverageReport = mergedContent.coverage_report || {};
```

**Step 5: Update total_slides in metadata**

Replace hardcoded `total_slides: 17` with `total_slides: totalSlides`.

**Step 6: Commit**

```bash
git add n8n/workflows/staging/session-slides/_js_assemble_node.js
git commit -m "feat(session-slides): handle variable slide count in assembly

Uses delivery_sequence for slide ordering. Includes coverage report
in output metadata. Dynamic total_slides instead of hardcoded 17."
```

---

## Task 12: Sync JS Files to Workflow JSON

**Files:**
- Modify: `n8n/workflows/staging/session-slides/main_workflow.json`

**What changes:** Update the `jsCode` property of each modified Code node in the workflow JSON. Add the new coverage check node. Update connections.

**Step 1: Write a sync script**

Create a temporary Node.js script that reads each JS file and updates the corresponding node in `main_workflow.json`:

```javascript
// sync_v3.js — Run with: node n8n/workflows/staging/session-slides/sync_v3.js
const fs = require('fs');
const path = require('path');

const dir = __dirname; // or the session-slides directory
const wfPath = path.join(dir, 'main_workflow.json');
const wf = JSON.parse(fs.readFileSync(wfPath, 'utf8'));

// Map: node name → JS file
const nodeFileMap = {
  '2.0b_FMT_AlignOutline': '_fmt_alignoutline_node.js',
  '2.0d_JS_AlignOutline': '_js_alignoutline_node.js',
  '2.8_FMT_TagContent': '_fmt_tag_content_node.js',
  '3.1_FMT_Blueprint': '_fmt_agent1a_node.js',
  '4.1_JS_SplitGroups': '_js_splitgroups_node.js',
  '5a.1_FMT_Group1': '_fmt_group1_node.js',
  '5b.1_FMT_Group2': '_fmt_group2_node.js',
  '5c.1_FMT_Group3': '_fmt_group3_node.js',
  '5d.1_FMT_Group4': '_fmt_group4_node.js',
  '5e.1_FMT_Group5': '_fmt_group5_node.js',
  '5f.1_FMT_Group6': '_fmt_group6_node.js',
  '5g.1_FMT_Group7': '_fmt_group7_node.js',
  '7.1c_FMT_QC_Quality': '_fmt_qc_quality_node.js',
  '7.3_JS_PrepScripts': '_js_prep_scripts_node.js',
  '7.4a.1_FMT_Scr1': '_fmt_scr1_node.js',
  '7.4b.1_FMT_Scr2': '_fmt_scr2_node.js',
  '7.4c.1_FMT_Scr3': '_fmt_scr3_node.js',
  '7.4d.1_FMT_Scr4': '_fmt_scr4_node.js',
  '7.4e.1_FMT_Scr5': '_fmt_scr5_node.js',
  '7.4f.1_FMT_Scr6': '_fmt_scr6_node.js',
  '7.4g.1_FMT_Scr7': '_fmt_scr7_node.js',
  '8.1_JS_Assemble': '_js_assemble_node.js'
};

let updated = 0;
for (const node of wf.nodes) {
  const jsFile = nodeFileMap[node.name];
  if (jsFile) {
    const filePath = path.join(dir, jsFile);
    if (fs.existsSync(filePath)) {
      const code = fs.readFileSync(filePath, 'utf8');
      if (node.parameters && node.parameters.jsCode !== undefined) {
        node.parameters.jsCode = code;
        updated++;
        console.log(`Updated: ${node.name} <- ${jsFile}`);
      }
    }
  }
}

console.log(`\nTotal nodes updated: ${updated}`);
fs.writeFileSync(wfPath, JSON.stringify(wf, null, 2));
console.log('Workflow saved.');
```

**Step 2: Add the coverage check node to the workflow JSON**

The new `6.2_JS_CoverageCheck` node needs to be added to `main_workflow.json`:
- Type: `n8n-nodes-base.code`
- Position: between `6.1_JS_Merge` and the QC nodes
- Read the `_js_coverage_check_node.js` file for its `jsCode`
- Connection: `6.1_JS_Merge` → `6.2_JS_CoverageCheck` → fan out to 3 QC FMT nodes

The implementer should:
1. Find `6.1_JS_Merge` in the workflow JSON
2. Note its current connections (what it connects TO)
3. Add the new node pointing to those same downstream nodes
4. Rewire `6.1_JS_Merge` to connect to `6.2_JS_CoverageCheck` instead

**Step 3: Run the sync script**

```bash
cd n8n/workflows/staging/session-slides
node sync_v3.js
```

**Step 4: Verify the workflow JSON**

```bash
# Check it's valid JSON
node -e "JSON.parse(require('fs').readFileSync('n8n/workflows/staging/session-slides/main_workflow.json'))"
# Count nodes
node -e "const wf = JSON.parse(require('fs').readFileSync('n8n/workflows/staging/session-slides/main_workflow.json')); console.log('Nodes:', wf.nodes.length)"
```

**Step 5: Commit**

```bash
git add n8n/workflows/staging/session-slides/main_workflow.json
git add n8n/workflows/staging/session-slides/sync_v3.js
git commit -m "feat(session-slides): sync v3 JS files to workflow JSON

Updates 22 node jsCode properties. Adds 6.2_JS_CoverageCheck node.
Rewires connections for coverage validation before QC."
```

---

## Task 13: Deploy to Staging and Smoke Test

**Files:**
- No file changes — deployment and verification only

**Step 1: Deploy to staging**

```bash
node -e "
const deploy = require('./n8n/services/deploy');
deploy.deployWorkflow('session-slides', 'staging').then(r => console.log(JSON.stringify(r, null, 2)));
"
```

If deploy service fails (known issue with CLI script), use direct API:

```bash
# Get workflow ID from metadata
node -e "const m = require('./n8n/workflows/metadata.json'); console.log(m.workflows['session-slides'].environments.staging.id)"

# Deploy via n8n API
curl -X PUT "https://workflows.ur-nl.com/api/v1/workflows/{WORKFLOW_ID}" \
  -H "X-N8N-API-KEY: $(grep N8N_API_KEY .env.local | cut -d= -f2)" \
  -H "Content-Type: application/json" \
  -d @n8n/workflows/staging/session-slides/main_workflow.json
```

**Step 2: Trigger smoke test**

Use the sample input to trigger the workflow:

```bash
# Read sample input
cat n8n/workflows/staging/session-slides/sample_input.json

# Trigger webhook
curl -X POST "https://workflows.ur-nl.com/webhook/{WEBHOOK_PATH}" \
  -H "Content-Type: application/json" \
  -d @n8n/workflows/staging/session-slides/sample_input.json
```

**Step 3: Verify execution**

```bash
# Check latest executions
node -e "
const { n8nApi } = require('./n8n/lib/api');
n8nApi('executions', { params: { workflowId: '{WORKFLOW_ID}', limit: 3 }}).then(r => {
  for (const e of r.data) {
    console.log(e.id, e.status, e.startedAt);
  }
});
"
```

**Step 4: Check output quality**

Verify:
- [ ] Slides follow outline chronological order
- [ ] All outline activities appear as Activity (CE) slides
- [ ] Content adapts to seniority (check vocabulary and depth)
- [ ] Coverage report shows ≥95% coverage
- [ ] No empty groups triggered unnecessary LLM calls
- [ ] delivery_sequence in output matches outline order
- [ ] Total slides > 17 (confirms expansion worked)

**Step 5: Commit any fixes**

If smoke test reveals issues, fix and re-deploy. Commit all fixes.

---

## Summary

| Task | Files | Purpose |
|---|---|---|
| 1 | `_fmt_alignoutline_node.js` | 17-section mapping, chronological order, seniority |
| 2 | `_js_alignoutline_node.js` | Parse new output format |
| 3 | `_fmt_tag_content_node.js` | Tag to expanded slide IDs |
| 4 | `_fmt_agent1a_node.js` | Seniority + additionalInstructions in blueprint |
| 5 | `_js_splitgroups_node.js` | Module-based group packing + Agent 2 prompt |
| 6 | `_fmt_group{1-7}_node.js` + template | Empty-group guard + user guidelines |
| 7 | `_js_coverage_check_node.js` (NEW) | Outline coverage validation |
| 8 | `_fmt_qc_quality_node.js` | Coverage report + session type compliance |
| 9 | `_js_prep_scripts_node.js` | Dynamic groups + session type in scripts |
| 10 | `_fmt_scr{1-7}_node.js` + template | Empty-group guard + user guidelines |
| 11 | `_js_assemble_node.js` | Variable slide count + delivery_sequence |
| 12 | `main_workflow.json` | Sync all JS + add coverage node |
| 13 | — | Deploy + smoke test |
