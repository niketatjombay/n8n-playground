# Case Study Creator — User Input Enforcement Fixes

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix 4 consultant-reported bugs where user settings (`challenge_approach`, `number_of_questions`, `behaviors`) are dropped or ignored in the case-study-creator pipeline.

**Architecture:** All fixes target inline jsCode in `n8n/workflows/staging/case-study-creator/main_workflow.json`. No new nodes needed — only jsCode patches to 5 existing nodes. Each task extracts the node's jsCode, patches it, syncs it back into the workflow JSON, and verifies via a dry-run script.

**Tech Stack:** Node.js, n8n workflow JSON, no tests (n8n inline code — validated via execution)

---

## Background

### Reported Bugs

1. **Behavior drift** — defined behaviors don't match what's tagged in challenges/questions
2. **"Separate challenges per behavior" ignored** — multiple behaviors per challenge even when `challenge_approach: "separate_per_behavior"`
3. **Question count wrong** — `questionsPerChallenge: 1` with 3 challenges should give 3 questions, but 6 generated
4. **Design context display errors** — wrong challenge count, missing behavior distributions in output

### Root Causes Found

| Root Cause | Nodes Affected | Impact |
|------------|---------------|--------|
| **Key name mismatch** in `5.3_MRG_Behavior` — reads `response.challenge_outlines` but LLM returns `response.behavior_mapping.challenges` | `5.3` → `6b.1` → `7.1` → `10.1` | Behavior mapping lost, challenges written without outlines, questions have no count constraint |
| **`challenge_approach` never enforced** — stored in `case_study_context` but no prompt explains what `combined` vs `separate_per_behavior` means | `2.1`, `5.1`, `6b.1` | LLM always uses combined approach regardless of setting |
| **`number_of_questions` semantic mismatch** — source field is `questionsPerChallenge` but labeled "Total Questions" in Stage 2 prompt; Stage 7 never reads it at all | `2.1`, `7.1` | LLM generates wrong question count |
| **`design_context` missing from output** — user settings not surfaced at top level | `10.1` | Frontend can't display what settings were used |

---

## Task 1: Fix `5.3_MRG_Behavior` — Key Name Mismatch

**Files:**
- Modify: `n8n/workflows/staging/case-study-creator/main_workflow.json` (node `5.3_MRG_Behavior` jsCode)

This is the **critical fix**. The merge node reads `response.challenge_outlines` but the LLM (prompted by `5.1_FMT_Behavior`) returns `response.behavior_mapping.challenges` and `response.behavior_mapping.questions`. Both the challenges and questions arrays are lost.

**Step 1: Extract current jsCode for `5.3_MRG_Behavior`**

Run:
```bash
node -e "
const wf = require('./n8n/workflows/staging/case-study-creator/main_workflow.json');
const node = wf.nodes.find(n => n.name === '5.3_MRG_Behavior');
console.log(node.parameters.jsCode);
"
```

Current code reads:
```js
behavior_mapping: { challenge_outlines: response.challenge_outlines || [] }
```

**Step 2: Replace the jsCode**

The LLM is instructed to return:
```json
{
  "behavior_mapping": {
    "challenges": [ { "number": 1, "title": "...", "behaviors": [...], ... } ],
    "questions": [ { "number": 1, "challenge_number": 1, "behaviors_tested": [...], ... } ]
  }
}
```

But `llm_response` from the sub-workflow wraps this, so `response` = `llm_response` which could be:
- `{ behavior_mapping: { challenges: [...], questions: [...] } }` — nested
- `{ challenges: [...], questions: [...] }` — flat (if LLM returned inner object)

Replace the full jsCode of `5.3_MRG_Behavior` with:

```js
// MERGE Node 5: Store behavior mapping (challenges + questions) in generated_case
const llmResult = $input.first().json;
const prev = $('4.3_MRG_Industry').first().json;

if (!llmResult.llm_response) {
  throw new Error('Node 5 LLM response missing');
}

const response = llmResult.llm_response;

// Handle both nested { behavior_mapping: { challenges, questions } }
// and flat { challenges, questions } LLM response formats
const mapping = response.behavior_mapping || response;
const challenges = mapping.challenges || response.challenge_outlines || [];
const questions = mapping.questions || [];

return [{
  json: {
    reference_case_text: prev.reference_case_text,
    case_study_context: prev.case_study_context,
    generated_case: {
      ...prev.generated_case,
      behavior_mapping: {
        challenges: challenges,
        questions: questions
      }
    },
    extraction_metadata: prev.extraction_metadata
  }
}];
```

**Step 3: Sync into workflow JSON**

Run:
```bash
node -e "
const fs = require('fs');
const wf = require('./n8n/workflows/staging/case-study-creator/main_workflow.json');
const node = wf.nodes.find(n => n.name === '5.3_MRG_Behavior');
node.parameters.jsCode = fs.readFileSync('/dev/stdin', 'utf8');
fs.writeFileSync('./n8n/workflows/staging/case-study-creator/main_workflow.json', JSON.stringify(wf, null, 2));
console.log('Synced 5.3_MRG_Behavior');
" <<'JSEOF'
// MERGE Node 5: Store behavior mapping (challenges + questions) in generated_case
const llmResult = $input.first().json;
const prev = $('4.3_MRG_Industry').first().json;

if (!llmResult.llm_response) {
  throw new Error('Node 5 LLM response missing');
}

const response = llmResult.llm_response;

// Handle both nested { behavior_mapping: { challenges, questions } }
// and flat { challenges, questions } LLM response formats
const mapping = response.behavior_mapping || response;
const challenges = mapping.challenges || response.challenge_outlines || [];
const questions = mapping.questions || [];

return [{
  json: {
    reference_case_text: prev.reference_case_text,
    case_study_context: prev.case_study_context,
    generated_case: {
      ...prev.generated_case,
      behavior_mapping: {
        challenges: challenges,
        questions: questions
      }
    },
    extraction_metadata: prev.extraction_metadata
  }
}];
JSEOF
```

**Step 4: Verify the fix**

Run:
```bash
node -e "
const wf = require('./n8n/workflows/staging/case-study-creator/main_workflow.json');
const node = wf.nodes.find(n => n.name === '5.3_MRG_Behavior');
const code = node.parameters.jsCode;
console.log('Has challenges:', code.includes('mapping.challenges'));
console.log('Has questions:', code.includes('mapping.questions'));
console.log('No challenge_outlines-only:', !code.includes('{ challenge_outlines:'));
"
```

Expected: All `true`.

**Step 5: Commit**

```bash
git add n8n/workflows/staging/case-study-creator/main_workflow.json
git commit -m "fix(case-study): 5.3_MRG_Behavior key mismatch — read challenges+questions not challenge_outlines"
```

---

## Task 2: Fix `6b.1_FMT_Challenge` — Read `challenges` from behavior_mapping

**Files:**
- Modify: `n8n/workflows/staging/case-study-creator/main_workflow.json` (node `6b.1_FMT_Challenge` jsCode)

Now that Task 1 stores `behavior_mapping.challenges` (not `challenge_outlines`), the downstream reader in `6b.1_FMT_Challenge` needs to be updated. Currently it reads:

```js
const challengeOutlines = behaviorMapping.challenge_outlines || behaviorMapping.challenges || [];
```

This already has the fallback `behaviorMapping.challenges`, so after Task 1 it will work. However, we should flip the priority and add `challenge_approach` enforcement.

**Step 1: Identify the line to change**

The current code has this line:
```js
const challengeOutlines = behaviorMapping.challenge_outlines || behaviorMapping.challenges || [];
```

**Step 2: Replace the jsCode**

In the full jsCode of `6b.1_FMT_Challenge`, make these changes:

1. Flip the lookup priority for challenge outlines
2. Add `challenge_approach` enforcement rules to the prompt

Find this line:
```js
const challengeOutlines = behaviorMapping.challenge_outlines || behaviorMapping.challenges || [];
```

Replace with:
```js
const challengeOutlines = behaviorMapping.challenges || behaviorMapping.challenge_outlines || [];
```

Find this block in the prompt string:
```
## CHALLENGE OUTLINES
${JSON.stringify(challengeOutlines, null, 2)}
```

Replace with:
```
## CHALLENGE APPROACH: ${ctx.challenge_approach || 'combined'}
${ctx.challenge_approach === 'separate_per_behavior'
  ? `CRITICAL: Each challenge MUST assess exactly ONE behavior. Do NOT combine multiple behaviors into a single challenge. Write ${challengeOutlines.length || 'one'} separate challenges, each focused on a single behavior.`
  : `Challenges may assess multiple behaviors each. Behaviors should be woven together into coherent scenarios as specified in the outlines below.`}

## CHALLENGE OUTLINES
${JSON.stringify(challengeOutlines, null, 2)}
```

**Step 3: Sync into workflow JSON**

Use the same node -e pattern as Task 1, targeting `6b.1_FMT_Challenge`.

**Step 4: Verify**

Run:
```bash
node -e "
const wf = require('./n8n/workflows/staging/case-study-creator/main_workflow.json');
const node = wf.nodes.find(n => n.name === '6b.1_FMT_Challenge');
const code = node.parameters.jsCode;
console.log('Has challenge_approach:', code.includes('challenge_approach'));
console.log('Has separate_per_behavior:', code.includes('separate_per_behavior'));
console.log('Reads challenges first:', code.includes('behaviorMapping.challenges || behaviorMapping.challenge_outlines'));
"
```

Expected: All `true`.

**Step 5: Commit**

```bash
git add n8n/workflows/staging/case-study-creator/main_workflow.json
git commit -m "fix(case-study): 6b.1_FMT_Challenge — enforce challenge_approach in prompt"
```

---

## Task 3: Fix `2.1_FMT_Context` — Challenge Approach Instructions + Question Semantics

**Files:**
- Modify: `n8n/workflows/staging/case-study-creator/main_workflow.json` (node `2.1_FMT_Context` jsCode)

Two issues in this node:
1. `challenge_approach` is passed as a raw string with no explanation
2. `number_of_questions` is labeled "Total Questions" but the source field is `questionsPerChallenge`

**Step 1: Identify the lines to change**

In the INPUTS block of the prompt:

```
- Challenge Approach: ${ctx.challenge_approach}
- Case Study Length: ${ctx.case_study_length}
- Total Questions: ${ctx.number_of_questions}
```

In Task 1 (challenge count determination):
```
1. Determine challenge count:
   - 2-3 behaviors per challenge (from challenge_approach)
   - Total challenges = ceil(behavior_count / 3), capped at 2-4
   - 100% behavior coverage, no repeats
```

**Step 2: Replace the relevant sections**

Replace the INPUTS block lines:
```
- Challenge Approach: ${ctx.challenge_approach}
- Case Study Length: ${ctx.case_study_length}
- Total Questions: ${ctx.number_of_questions}
```

With:
```
- Challenge Approach: ${ctx.challenge_approach}
  ${ctx.challenge_approach === 'separate_per_behavior'
    ? '→ SEPARATE: Each challenge assesses exactly ONE behavior. Number of challenges = number of behaviors.'
    : '→ COMBINED: Group 2-3 complementary behaviors per challenge. Number of challenges = ceil(behavior_count / 3), capped at 2-4.'}
- Case Study Length: ${ctx.case_study_length}
- Questions per Challenge: ${ctx.number_of_questions}
  → Total questions = questions_per_challenge × number_of_challenges
```

Replace the Task 1 block:
```
1. Determine challenge count:
   - 2-3 behaviors per challenge (from challenge_approach)
   - Total challenges = ceil(behavior_count / 3), capped at 2-4
   - 100% behavior coverage, no repeats
```

With:
```
1. Determine challenge count:
   - If challenge_approach is "separate_per_behavior": number_of_challenges = behavior_count. Each challenge assesses exactly ONE behavior.
   - If challenge_approach is "combined": number_of_challenges = ceil(behavior_count / 3), capped at 2-4. Each challenge assesses 2-3 behaviors.
   - 100% behavior coverage, no repeats
```

Replace the Task 3 block:
```
3. Distribute questions across challenges:
   - Total: ${ctx.number_of_questions}
   - Spread across challenges proportionally
   - Each question tests 2-3 behaviors from its challenge
```

With:
```
3. Distribute questions across challenges:
   - Questions per challenge: ${ctx.number_of_questions}
   - Total questions = ${ctx.number_of_questions} × number_of_challenges
   - Each challenge gets exactly ${ctx.number_of_questions} question(s)
   - If challenge_approach is "separate_per_behavior": each question tests only the ONE behavior assigned to that challenge
   - If challenge_approach is "combined": each question tests 2-3 behaviors from its challenge
```

**Step 3: Sync into workflow JSON**

Use the node -e pattern targeting `2.1_FMT_Context`. Write the complete updated jsCode.

**Step 4: Verify**

Run:
```bash
node -e "
const wf = require('./n8n/workflows/staging/case-study-creator/main_workflow.json');
const node = wf.nodes.find(n => n.name === '2.1_FMT_Context');
const code = node.parameters.jsCode;
console.log('Has separate_per_behavior:', code.includes('separate_per_behavior'));
console.log('Has Questions per Challenge:', code.includes('Questions per Challenge'));
console.log('No Total Questions:', !code.includes('Total Questions'));
console.log('Has per-challenge distribution:', code.includes('questions_per_challenge'));
"
```

Expected: All `true`.

**Step 5: Commit**

```bash
git add n8n/workflows/staging/case-study-creator/main_workflow.json
git commit -m "fix(case-study): 2.1_FMT_Context — enforce challenge_approach semantics + fix question count label"
```

---

## Task 4: Fix `5.1_FMT_Behavior` + `7.1_FMT_Questions` — Enforce User Constraints

**Files:**
- Modify: `n8n/workflows/staging/case-study-creator/main_workflow.json` (nodes `5.1_FMT_Behavior` and `7.1_FMT_Questions` jsCode)

### Part A: `5.1_FMT_Behavior` — Add `challenge_approach` enforcement

The current prompt has no reference to `challenge_approach`. Add it.

Find in the prompt:
```
For each challenge, create:
```

Insert BEFORE it:
```
CHALLENGE APPROACH: ${ctx.challenge_approach || 'combined'}
${ctx.challenge_approach === 'separate_per_behavior'
  ? `CRITICAL CONSTRAINT: Each challenge MUST assess exactly ONE behavior. Create ${(ctx.behaviors || []).length} challenges, one per behavior. Do NOT group multiple behaviors into a single challenge.`
  : `Group 2-3 complementary behaviors per challenge as specified in BEHAVIOR DISTRIBUTION above.`}

```

Also find:
```
RULES:
- Every behavior appears in exactly one challenge
```

Replace with:
```
RULES:
- Every behavior appears in exactly one challenge
${ctx.challenge_approach === 'separate_per_behavior'
  ? '- Each challenge contains exactly ONE behavior (separate_per_behavior mode)\n- Number of challenges MUST equal number of behaviors'
  : '- Each challenge contains 2-3 behaviors (combined mode)'}
```

### Part B: `7.1_FMT_Questions` — Add `number_of_questions` constraint

The current prompt has no reference to `ctx.number_of_questions`. Add explicit count constraint.

Find at the top of the prompt:
```
Generate assessment questions for this case study.
```

Replace with:
```
Generate assessment questions for this case study.

QUESTION COUNT CONSTRAINT:
- Questions per challenge: ${ctx.number_of_questions || 5}
- Total challenges: ${(challenges || []).length}
- Total questions to generate: ${(ctx.number_of_questions || 5) * (challenges || []).length}
- Generate EXACTLY ${ctx.number_of_questions || 5} question(s) for EACH challenge. No more, no less.
```

Also find:
```
RULES:
- ${wordLimits.per_question} words per question (situation summary + question combined)
- Each question tests 2-3 behaviors from its mapped challenge
```

Replace with:
```
RULES:
- Generate EXACTLY ${ctx.number_of_questions || 5} question(s) per challenge (${(ctx.number_of_questions || 5) * (challenges || []).length} total)
- ${wordLimits.per_question} words per question (situation summary + question combined)
${ctx.challenge_approach === 'separate_per_behavior'
  ? '- Each question tests the ONE behavior assigned to its challenge'
  : '- Each question tests 2-3 behaviors from its mapped challenge'}
```

**Step 1: Apply both changes to workflow JSON**

Use the node -e pattern to update both nodes.

**Step 2: Verify**

Run:
```bash
node -e "
const wf = require('./n8n/workflows/staging/case-study-creator/main_workflow.json');
const n5 = wf.nodes.find(n => n.name === '5.1_FMT_Behavior');
const n7 = wf.nodes.find(n => n.name === '7.1_FMT_Questions');
console.log('5.1 has challenge_approach:', n5.parameters.jsCode.includes('challenge_approach'));
console.log('5.1 has separate_per_behavior:', n5.parameters.jsCode.includes('separate_per_behavior'));
console.log('7.1 has number_of_questions:', n7.parameters.jsCode.includes('number_of_questions'));
console.log('7.1 has EXACTLY:', n7.parameters.jsCode.includes('EXACTLY'));
console.log('7.1 has challenge_approach:', n7.parameters.jsCode.includes('challenge_approach'));
"
```

Expected: All `true`.

**Step 3: Commit**

```bash
git add n8n/workflows/staging/case-study-creator/main_workflow.json
git commit -m "fix(case-study): enforce challenge_approach in 5.1 + question count in 7.1"
```

---

## Task 5: Fix `10.1_JS_Package` — Surface Design Context + Fix Behavior List

**Files:**
- Modify: `n8n/workflows/staging/case-study-creator/main_workflow.json` (node `10.1_JS_Package` jsCode)

Two issues:
1. `behaviors_list` is always `[]` because it reads `behaviorMapping.behaviors` which doesn't exist
2. User settings (`challenge_approach`, `number_of_questions`, etc.) not surfaced in output

**Step 1: Fix `behaviors_list` source**

Find:
```js
const behaviorsList = (behaviorMapping.behaviors || behaviorMapping.mapped_behaviors || [])
  .map(b => typeof b === 'string' ? b : b.name || b.behavior_name)
  .filter(Boolean);
```

Replace with:
```js
// Get behaviors from user input (authoritative source) or fall back to mapping
const behaviorsList = (ctx.behaviors || [])
  .map(b => typeof b === 'string' ? b : b.name || b.behavior_name)
  .filter(Boolean);
```

**Step 2: Add `design_context` to `final_output`**

Find:
```js
  case_study_context: {
    workflow_session_id: ctx.workflow_session_id,
    workflow_id: ctx.workflow_id,
    project_id: ctx.project_id,
    client_id: ctx.client_id,
    case_design_constraints: constraints
  },
```

Replace with:
```js
  case_study_context: {
    workflow_session_id: ctx.workflow_session_id,
    workflow_id: ctx.workflow_id,
    project_id: ctx.project_id,
    client_id: ctx.client_id,
    case_design_constraints: constraints
  },
  design_context: {
    challenge_approach: ctx.challenge_approach || 'combined',
    number_of_questions_per_challenge: ctx.number_of_questions || 5,
    total_questions_expected: (ctx.number_of_questions || 5) * challenges.length,
    total_questions_generated: questions.length,
    number_of_challenges: challenges.length,
    behaviors: behaviorsList,
    behavior_count: behaviorsList.length,
    target_level: ctx.target_level || 'Mid',
    case_study_length: ctx.case_study_length || 'standard',
    hide_behaviors_in_questions: ctx.hide_behaviors_in_questions || false
  },
```

**Step 3: Fix `behavior_coverage_analysis` to use authoritative behavior list**

Find:
```js
    behavior_coverage_analysis: {
      coverage_percentage: '100%',
      distribution: distribution
    },
```

Replace with:
```js
    behavior_coverage_analysis: {
      total_behaviors_defined: behaviorsList.length,
      behaviors_in_challenges: Object.values(distribution).flat().length,
      coverage_percentage: behaviorsList.length > 0
        ? Math.round((new Set(Object.values(distribution).flat()).size / behaviorsList.length) * 100) + '%'
        : '0%',
      distribution: distribution,
      missing_behaviors: behaviorsList.filter(b =>
        !Object.values(distribution).flat().includes(b)
      )
    },
```

**Step 4: Sync into workflow JSON, verify, commit**

Run:
```bash
node -e "
const wf = require('./n8n/workflows/staging/case-study-creator/main_workflow.json');
const node = wf.nodes.find(n => n.name === '10.1_JS_Package');
const code = node.parameters.jsCode;
console.log('Has design_context:', code.includes('design_context'));
console.log('Has challenge_approach:', code.includes('ctx.challenge_approach'));
console.log('Has number_of_questions_per_challenge:', code.includes('number_of_questions_per_challenge'));
console.log('Has ctx.behaviors source:', code.includes('ctx.behaviors'));
console.log('Has missing_behaviors:', code.includes('missing_behaviors'));
"
```

Expected: All `true`.

```bash
git add n8n/workflows/staging/case-study-creator/main_workflow.json
git commit -m "fix(case-study): 10.1_JS_Package — surface design_context + fix behaviors_list source"
```

---

## Task 6: Deploy to Staging and Smoke Test

**Files:**
- No file changes — deployment + verification only

**Step 1: Deploy to staging**

```bash
npm run n8n:deploy -- --env staging --workflow case-study-creator
```

**Step 2: Trigger a test execution**

Use the test page or CLI to trigger the case-study-creator webhook on staging with a sample input that includes:
- `challenge_approach: "separate_per_behavior"`
- `questionsPerChallenge: 1`
- 3 behaviors

**Step 3: Monitor execution**

```bash
node -e "
const { loadEnv } = require('./n8n/lib/env-loader');
const { clientForEnv } = require('./n8n/lib/client-for-env');
loadEnv();
const client = clientForEnv('staging');
async function poll() {
  const r = await client.getExecutions('WORKFLOW_ID', 3);
  const latest = (r.data || [])[0];
  if (latest) console.log(latest.id, '|', latest.status, '| started:', latest.startedAt, '| stopped:', latest.stoppedAt);
}
poll();
"
```

**Step 4: Verify fix via execution detail**

Once execution completes, check:
1. `5.3_MRG_Behavior` output has non-empty `behavior_mapping.challenges` and `behavior_mapping.questions`
2. `6b.1_FMT_Challenge` prompt includes `CHALLENGE APPROACH: separate_per_behavior` instruction
3. `7.1_FMT_Questions` prompt includes `EXACTLY 1 question(s) per challenge`
4. Final output `design_context` shows correct `challenge_approach`, `number_of_questions_per_challenge`, `total_questions_expected`
5. `quality_summary.behaviors_list` is non-empty
6. Question count matches: 1 question per challenge x 3 challenges = 3 questions total

---

## Verification Checklist

After deployment, verify each reported bug is resolved:

| Bug | How to Verify | Expected Result |
|-----|--------------|-----------------|
| Behavior drift | Check `design_context.behaviors` matches input | Exact same list |
| Separate per behavior ignored | Set `challenge_approach: "separate_per_behavior"` with 3 behaviors | 3 challenges, each with exactly 1 behavior |
| Question count wrong | Set `questionsPerChallenge: 1` with 3 challenges | Exactly 3 questions total (1 per challenge) |
| Design context display | Check `final_output.design_context` | All user settings present with correct values |
