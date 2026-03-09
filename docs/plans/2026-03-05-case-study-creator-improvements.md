# Case Study Creator Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add FilterContext pre-processing (Stages 1.8–1.10), inject filtered FGD context into all content-generation stages, fix direct ctx field injection (tone/must_include/narrative_arc etc.) in Stage 6, and fix all 9 model strings.

**Architecture:** A Python script makes all JSON changes safely to avoid manual escaping of large prompt strings. Three new nodes compress `project_memory` into focused JSON stored at `ctx.filtered_context`. Seven FMT nodes get filtered_context injected plus direct ctx field fixes. All 9 model strings are updated.

**Tech Stack:** Python 3 (json, re modules), n8n REST API, existing LLM sub-workflow `GDaWNcJJtLdY8Q6Y4Yv5p`, bash (curl + jq)

---

### Key Reference

- **File to modify:** `n8n/workflows/staging/case-study-creator/main_workflow.json`
- **Workflow ID:** `Havb102ZBST1xaeHDhnAK`
- **LLM sub-workflow ID:** `GDaWNcJJtLdY8Q6Y4Yv5p`
- **ERR node name:** `11.1_ERR_Response`
- **Current model string (all 9 nodes):** `global.anthropic.claude-sonnet-4-5-20250929-v1:0`
- **Design doc:** `docs/plans/2026-03-05-case-study-creator-improvements-design.md`
- **Architecture doc:** `n8n/docs/case-study-prompts.md`

---

### Task 1: Write and run the Python update script

**Files:**
- Create: `/tmp/update_case_study.py`
- Modify: `n8n/workflows/staging/case-study-creator/main_workflow.json`

**Step 1: Write the script**

```python
#!/usr/bin/env python3
"""
Updates n8n/workflows/staging/case-study-creator/main_workflow.json:
1. Fix model strings: all 9 FMT nodes → 'sonnet' (stages 8,9 → 'haiku')
2. Add 1.8_FMT_FilterContext node
3. Add 1.9_SUB_FilterLLM node
4. Add 1.10_MRG_FilterContext node
5. Rewire connections: 1.7 YES → 1.8 → 1.9 → 1.10 → 2.1_FMT_Context
6. Add 1.9 error wire → 11.1_ERR_Response
7. Update 2.1_FMT_Context: use filtered_context instead of raw project_memory
8. Update 4.1_FMT_Industry: add filtered_context organizational context
9. Update 5.1_FMT_Behavior: add filtered_context behavioral evidence
10. Update 6a.1_FMT_SituationIntro: add filtered_context + tone + narrative_arc
11. Update 6b.1_FMT_Challenge: add filtered_context + tone + must_include + tension_patterns + decision_types
12. Update 6c.1_FMT_Conclusion: add filtered_context + tone
13. Update 7.1_FMT_Questions: add filtered_context language_and_tone
"""

import json, re

WORKFLOW_PATH = 'n8n/workflows/staging/case-study-creator/main_workflow.json'

with open(WORKFLOW_PATH) as f:
    wf = json.load(f)

nodes = wf['nodes']
conns = wf['connections']

def find_node(name):
    for n in nodes:
        if n['name'] == name:
            return n
    raise ValueError(f'Node not found: {name}')

# ─── 1. Fix model strings ─────────────────────────────────────────────────────
OLD_SONNET = 'global.anthropic.claude-sonnet-4-5-20250929-v1:0'
HAIKU_NODES = {'8.1_FMT_Quality', '9.1_FMT_Bias'}

for node in nodes:
    code = node.get('parameters', {}).get('jsCode', '')
    if not code:
        continue
    name = node.get('name', '')
    if OLD_SONNET in code:
        new_model = 'haiku' if name in HAIKU_NODES else 'sonnet'
        code = code.replace(f"model: '{OLD_SONNET}'", f"model: '{new_model}'")
        node['parameters']['jsCode'] = code
        print(f"Fixed model in {name} → '{new_model}'")

# ─── 2. Build FilterContext prompt ────────────────────────────────────────────
FILTER_PROMPT = """You are a context extraction specialist. Extract structured information from project FGD data to ground a case study in real client findings.

CRITICAL RULES:
- Extract ONLY what is explicitly stated — no inference, no fabrication
- behavioral_evidence entries must match behavior names exactly as given in <behaviors>
- specific_scenarios must be concrete situations from FGDs usable as case study narrative inspiration
- If a section has no data, use empty array [] — never invent content
- Output pure JSON only — no markdown fences, no explanatory text

OUTPUT SCHEMA:
{
  "organizational_challenges": ["<key challenge or pain point from FGDs>"],
  "behavioral_evidence": [
    {
      "behavior": "<behavior name — must match input exactly>",
      "observed_gaps": ["<specific gap observed in FGDs>"],
      "positive_examples": ["<positive example if present>"]
    }
  ],
  "key_themes": ["<recurring theme across FGD conversations>"],
  "specific_scenarios": ["<concrete situation or example usable as case study inspiration>"],
  "organizational_context": {
    "culture_dynamics": ["<cultural or organizational dynamic observed>"],
    "stakeholder_tensions": ["<cross-functional or leadership tensions>"],
    "strategic_pressures": ["<business pressures driving the programme>"]
  },
  "language_and_tone": ["<actual phrases, terminology, or expressions used by participants>"],
  "extraction_gaps": ["<what was missing or unclear in project_memory>"]
}

INPUTS:
"""

FILTER_JS = (
    "// FORMAT Node 1.8: Build FilterContext prompt\n"
    "const input = $input.first().json;\n"
    "const ctx = input.case_study_context;\n"
    "\n"
    "let prompt = " + json.dumps(FILTER_PROMPT) + ";\n"
    "\n"
    "prompt += '\\n<project_memory>';\n"
    "prompt += ctx.project_memory || 'No project memory provided';\n"
    "prompt += '</project_memory>\\n\\n';\n"
    "\n"
    "prompt += '<behaviors>';\n"
    "prompt += JSON.stringify(ctx.behaviors || []);\n"
    "prompt += '</behaviors>\\n\\n';\n"
    "\n"
    "prompt += '<client_context>';\n"
    "prompt += `client: ${ctx.client_name} | industry: ${ctx.industry} | level: ${ctx.target_level} | function: ${ctx.business_function}`;\n"
    "prompt += '</client_context>\\n';\n"
    "\n"
    "return [{ json: {\n"
    "  prompt: prompt,\n"
    "  model: 'sonnet',\n"
    "  max_tokens: 2000,\n"
    "  node_name: 'Node1_8_FilterContext',\n"
    "  // Pass all state through\n"
    "  reference_case_text: input.reference_case_text,\n"
    "  case_study_context: input.case_study_context,\n"
    "  generated_case: input.generated_case,\n"
    "  extraction_metadata: input.extraction_metadata\n"
    "}}];"
)

# ─── 3. Add 1.8_FMT_FilterContext node ───────────────────────────────────────
filter_fmt_node = {
    "parameters": {"jsCode": FILTER_JS},
    "type": "n8n-nodes-base.code",
    "typeVersion": 2,
    "position": [-17580, 7780],
    "id": "fmt-filter-context-cs-001",
    "name": "1.8_FMT_FilterContext",
    "notes": "Build filter prompt: compress project_memory into focused FGD context JSON"
}
nodes.append(filter_fmt_node)
print("Added 1.8_FMT_FilterContext")

# ─── 4. Add 1.9_SUB_FilterLLM node ──────────────────────────────────────────
filter_llm_node = {
    "parameters": {
        "workflowId": {"__rl": True, "mode": "id", "value": "GDaWNcJJtLdY8Q6Y4Yv5p"},
        "options": {}
    },
    "type": "n8n-nodes-base.executeWorkflow",
    "typeVersion": 1.1,
    "position": [-17360, 7780],
    "id": "sub-filter-llm-cs-001",
    "name": "1.9_SUB_FilterLLM",
    "retryOnFail": True,
    "maxTries": 2,
    "waitBetweenTries": 5000,
    "onError": "continueErrorOutput",
    "notes": "Call LLM sub-workflow to extract focused FGD context JSON"
}
nodes.append(filter_llm_node)
print("Added 1.9_SUB_FilterLLM")

# ─── 5. Add 1.10_MRG_FilterContext node ──────────────────────────────────────
MRG_JS = (
    "// MERGE Node 1.10: Add filtered_context to case_study_context\n"
    "const input = $input.first().json;\n"
    "const filteredContext = input.llm_response || {};\n"
    "\n"
    "return [{ json: {\n"
    "  reference_case_text: input.reference_case_text,\n"
    "  case_study_context: {\n"
    "    ...input.case_study_context,\n"
    "    filtered_context: filteredContext\n"
    "  },\n"
    "  generated_case: input.generated_case,\n"
    "  extraction_metadata: input.extraction_metadata\n"
    "}}];"
)

filter_mrg_node = {
    "parameters": {"jsCode": MRG_JS},
    "type": "n8n-nodes-base.code",
    "typeVersion": 2,
    "position": [-17140, 7780],
    "id": "mrg-filter-context-cs-001",
    "name": "1.10_MRG_FilterContext",
    "notes": "Merge filtered_context into case_study_context for downstream use"
}
nodes.append(filter_mrg_node)
print("Added 1.10_MRG_FilterContext")

# ─── 6. Rewire connections ────────────────────────────────────────────────────
# 1.7_IF_Extracted YES (index 0): was 2.1_FMT_Context → now 1.8_FMT_FilterContext
conns['1.7_IF_Extracted']['main'][0] = [
    {"node": "1.8_FMT_FilterContext", "type": "main", "index": 0}
]
print("Rewired 1.7_IF_Extracted YES → 1.8_FMT_FilterContext")

# 1.8_FMT_FilterContext → 1.9_SUB_FilterLLM
conns['1.8_FMT_FilterContext'] = {
    "main": [[{"node": "1.9_SUB_FilterLLM", "type": "main", "index": 0}]]
}

# 1.9_SUB_FilterLLM: success → 1.10_MRG_FilterContext, error → 11.1_ERR_Response
conns['1.9_SUB_FilterLLM'] = {
    "main": [
        [{"node": "1.10_MRG_FilterContext", "type": "main", "index": 0}],
        [{"node": "11.1_ERR_Response", "type": "main", "index": 0}]
    ]
}

# 1.10_MRG_FilterContext → 2.1_FMT_Context
conns['1.10_MRG_FilterContext'] = {
    "main": [[{"node": "2.1_FMT_Context", "type": "main", "index": 0}]]
}
print("Added connections: 1.8→1.9→1.10→2.1, 1.9 error→11.1_ERR_Response")

# ─── 7. Helpers ───────────────────────────────────────────────────────────────
FILTERED_CONTEXT_BLOCK = """

// Inject filtered FGD context
const filteredCtx = ctx.filtered_context || {};
prompt += '\\n\\n## FGD CONTEXT (filtered from project memory)\\n';
prompt += '<filtered_context>' + JSON.stringify(filteredCtx) + '</filtered_context>';
"""

def append_before_return(js_code, block):
    """Insert block just before the final return statement."""
    # Find last 'return [' occurrence
    idx = js_code.rfind('return [{')
    if idx == -1:
        idx = js_code.rfind('return [')
    if idx == -1:
        raise ValueError("Could not find return statement")
    return js_code[:idx] + block + '\n' + js_code[idx:]

# ─── 8. Update 2.1_FMT_Context: replace raw project_memory with filtered_context
node_2_1 = find_node('2.1_FMT_Context')
code = node_2_1['parameters']['jsCode']
# Replace the raw project_memory injection in the prompt
OLD_MEM = "PROJECT CONTEXT (from Focus Group Discussions):\\n${ctx.project_memory || 'No project memory provided'}"
NEW_MEM = "FGD CONTEXT (filtered and structured):\\n${JSON.stringify(ctx.filtered_context || {}, null, 2)}"
if OLD_MEM in code:
    code = code.replace(OLD_MEM, NEW_MEM)
    print("Updated 2.1_FMT_Context: replaced raw project_memory with filtered_context")
else:
    print("WARNING: Could not find project_memory in 2.1_FMT_Context — skipping replacement")
node_2_1['parameters']['jsCode'] = code

# ─── 9. Update 4.1_FMT_Industry: add filtered_context organizational context
node_4_1 = find_node('4.1_FMT_Industry')
code = node_4_1['parameters']['jsCode']
INDUSTRY_BLOCK = """

// Inject filtered organizational context for industry grounding
const filteredCtx = ctx.filtered_context || {};
if (filteredCtx.organizational_context) {
  prompt += '\\n\\n## ORGANIZATIONAL CONTEXT (from FGDs)\\n';
  prompt += '<organizational_context>' + JSON.stringify(filteredCtx.organizational_context) + '</organizational_context>';
}
if (filteredCtx.key_themes && filteredCtx.key_themes.length > 0) {
  prompt += '\\n\\n## KEY FGD THEMES\\n';
  prompt += filteredCtx.key_themes.map(t => '- ' + t).join('\\n');
}
"""
code = append_before_return(code, INDUSTRY_BLOCK)
node_4_1['parameters']['jsCode'] = code
print("Updated 4.1_FMT_Industry: added filtered organizational_context + key_themes")

# ─── 10. Update 5.1_FMT_Behavior: add behavioral_evidence
node_5_1 = find_node('5.1_FMT_Behavior')
code = node_5_1['parameters']['jsCode']
BEHAVIOR_BLOCK = """

// Inject behavioral evidence from FGDs to ground challenge outlines
const filteredCtx = ctx.filtered_context || {};
if (filteredCtx.behavioral_evidence && filteredCtx.behavioral_evidence.length > 0) {
  prompt += '\\n\\n## BEHAVIORAL EVIDENCE (from FGDs)\\n';
  prompt += '<behavioral_evidence>' + JSON.stringify(filteredCtx.behavioral_evidence) + '</behavioral_evidence>';
  prompt += '\\nUse these observed gaps and examples to make challenge outlines specific to this client.';
}
if (filteredCtx.organizational_challenges && filteredCtx.organizational_challenges.length > 0) {
  prompt += '\\n\\n## ORGANIZATIONAL CHALLENGES OBSERVED\\n';
  prompt += filteredCtx.organizational_challenges.map(c => '- ' + c).join('\\n');
}
"""
code = append_before_return(code, BEHAVIOR_BLOCK)
node_5_1['parameters']['jsCode'] = code
print("Updated 5.1_FMT_Behavior: added filtered behavioral_evidence + organizational_challenges")

# ─── 11. Update 6a.1_FMT_SituationIntro: add filtered_context + tone + narrative_arc
node_6a = find_node('6a.1_FMT_SituationIntro')
code = node_6a['parameters']['jsCode']
SITUATION_BLOCK = """

// Inject FGD context and writing settings
const filteredCtx = ctx.filtered_context || {};
prompt += '\\n\\n## WRITING SETTINGS\\n';
if (ctx.tone) prompt += `Tone: ${ctx.tone}\\n`;
if (ctx.narrative_arc && ctx.narrative_arc.length > 0) {
  prompt += `Narrative Arc: ${ctx.narrative_arc.join(', ')}\\n`;
}
if (filteredCtx.specific_scenarios && filteredCtx.specific_scenarios.length > 0) {
  prompt += '\\n## SPECIFIC SCENARIOS FROM FGDS (use as narrative inspiration)\\n';
  prompt += '<specific_scenarios>' + JSON.stringify(filteredCtx.specific_scenarios) + '</specific_scenarios>';
}
if (filteredCtx.organizational_context) {
  prompt += '\\n\\n## ORGANIZATIONAL CONTEXT\\n';
  prompt += '<organizational_context>' + JSON.stringify(filteredCtx.organizational_context) + '</organizational_context>';
}
"""
code = append_before_return(code, SITUATION_BLOCK)
node_6a['parameters']['jsCode'] = code
print("Updated 6a.1_FMT_SituationIntro: added filtered_context + tone + narrative_arc")

# ─── 12. Update 6b.1_FMT_Challenge: add filtered_context + tone + must_include + tension_patterns + decision_types
node_6b = find_node('6b.1_FMT_Challenge')
code = node_6b['parameters']['jsCode']
CHALLENGE_BLOCK = """

// Inject FGD context and all writing constraints
const filteredCtx = ctx.filtered_context || {};
prompt += '\\n\\n## WRITING SETTINGS\\n';
if (ctx.tone) prompt += `Tone: ${ctx.tone}\\n`;
if (ctx.must_include && ctx.must_include.length > 0) {
  prompt += `Must Include: ${ctx.must_include.join(', ')}\\n`;
}
if (ctx.tension_patterns && ctx.tension_patterns.length > 0) {
  prompt += `Tension Patterns: ${ctx.tension_patterns.join(', ')}\\n`;
}
if (ctx.decision_types && ctx.decision_types.length > 0) {
  prompt += `Decision Types: ${ctx.decision_types.join(', ')}\\n`;
}
if (filteredCtx.behavioral_evidence && filteredCtx.behavioral_evidence.length > 0) {
  prompt += '\\n## BEHAVIORAL EVIDENCE FROM FGDS (ground challenge beats in real observations)\\n';
  prompt += '<behavioral_evidence>' + JSON.stringify(filteredCtx.behavioral_evidence) + '</behavioral_evidence>';
}
if (filteredCtx.key_themes && filteredCtx.key_themes.length > 0) {
  prompt += '\\n\\n## KEY THEMES FROM FGDS\\n';
  prompt += filteredCtx.key_themes.map(t => '- ' + t).join('\\n');
}
if (filteredCtx.organizational_challenges && filteredCtx.organizational_challenges.length > 0) {
  prompt += '\\n\\n## ORGANIZATIONAL CHALLENGES\\n';
  prompt += filteredCtx.organizational_challenges.map(c => '- ' + c).join('\\n');
}
"""
code = append_before_return(code, CHALLENGE_BLOCK)
node_6b['parameters']['jsCode'] = code
print("Updated 6b.1_FMT_Challenge: added filtered_context + tone + must_include + tension_patterns + decision_types")

# ─── 13. Update 6c.1_FMT_Conclusion: add filtered_context + tone
node_6c = find_node('6c.1_FMT_Conclusion')
code = node_6c['parameters']['jsCode']
CONCLUSION_BLOCK = """

// Inject tone and key themes for conclusion grounding
const filteredCtx = ctx.filtered_context || {};
prompt += '\\n\\n## WRITING SETTINGS\\n';
if (ctx.tone) prompt += `Tone: ${ctx.tone}\\n`;
if (filteredCtx.key_themes && filteredCtx.key_themes.length > 0) {
  prompt += '\\n## KEY THEMES TO ECHO IN CONCLUSION\\n';
  prompt += filteredCtx.key_themes.map(t => '- ' + t).join('\\n');
}
"""
code = append_before_return(code, CONCLUSION_BLOCK)
node_6c['parameters']['jsCode'] = code
print("Updated 6c.1_FMT_Conclusion: added filtered key_themes + tone")

# ─── 14. Update 7.1_FMT_Questions: add language_and_tone from filtered_context
node_7_1 = find_node('7.1_FMT_Questions')
code = node_7_1['parameters']['jsCode']
QUESTIONS_BLOCK = """

// Inject client language so questions use actual terminology from FGDs
const filteredCtx = ctx.filtered_context || {};
if (filteredCtx.language_and_tone && filteredCtx.language_and_tone.length > 0) {
  prompt += '\\n\\n## CLIENT LANGUAGE AND TERMINOLOGY (use in question wording)\\n';
  prompt += '<language_and_tone>' + filteredCtx.language_and_tone.join('\\n') + '</language_and_tone>';
}
"""
code = append_before_return(code, QUESTIONS_BLOCK)
node_7_1['parameters']['jsCode'] = code
print("Updated 7.1_FMT_Questions: added filtered language_and_tone")

# ─── 15. Write output ─────────────────────────────────────────────────────────
with open(WORKFLOW_PATH, 'w') as f:
    json.dump(wf, f, indent=2, ensure_ascii=False)

print("\nDone. Workflow written to", WORKFLOW_PATH)
```

**Step 2: Run the script**

```bash
cd /Users/niketpuranik/data/workspace/projects/ai/n8n-playground
python3 /tmp/update_case_study.py
```

Expected output:
```
Fixed model in 2.1_FMT_Context → 'sonnet'
Fixed model in 3.1_FMT_ParseRef → 'sonnet'
Fixed model in 4.1_FMT_Industry → 'sonnet'
Fixed model in 5.1_FMT_Behavior → 'sonnet'
Fixed model in 6a.1_FMT_SituationIntro → 'sonnet'
Fixed model in 6b.1_FMT_Challenge → 'sonnet'
Fixed model in 6c.1_FMT_Conclusion → 'sonnet'
Fixed model in 7.1_FMT_Questions → 'sonnet'
Fixed model in 8.1_FMT_Quality → 'haiku'
Fixed model in 9.1_FMT_Bias → 'haiku'
Added 1.8_FMT_FilterContext
Added 1.9_SUB_FilterLLM
Added 1.10_MRG_FilterContext
Rewired 1.7_IF_Extracted YES → 1.8_FMT_FilterContext
Added connections: 1.8→1.9→1.10→2.1, 1.9 error→11.1_ERR_Response
Updated 2.1_FMT_Context: replaced raw project_memory with filtered_context
Updated 4.1_FMT_Industry: added filtered organizational_context + key_themes
Updated 5.1_FMT_Behavior: added filtered behavioral_evidence + organizational_challenges
Updated 6a.1_FMT_SituationIntro: added filtered_context + tone + narrative_arc
Updated 6b.1_FMT_Challenge: added filtered_context + tone + must_include + tension_patterns + decision_types
Updated 6c.1_FMT_Conclusion: added filtered key_themes + tone
Updated 7.1_FMT_Questions: added filtered language_and_tone
Done. Workflow written to n8n/workflows/staging/case-study-creator/main_workflow.json
```

If `WARNING: Could not find project_memory in 2.1_FMT_Context` appears — stop. Read the actual string in that node and update `OLD_MEM` in the script to match exactly.

**Step 3: Verify JSON is valid**

```bash
python3 -c "import json; json.load(open('n8n/workflows/staging/case-study-creator/main_workflow.json')); print('Valid JSON')"
```

Expected: `Valid JSON`

**Step 4: Verify all changes**

```bash
python3 -c "
import json, re
wf = json.load(open('n8n/workflows/staging/case-study-creator/main_workflow.json'))
nodes = wf['nodes']
conns = wf['connections']

# 1. New nodes exist
names = [n['name'] for n in nodes]
print('Has 1.8_FMT_FilterContext:', '1.8_FMT_FilterContext' in names)
print('Has 1.9_SUB_FilterLLM:', '1.9_SUB_FilterLLM' in names)
print('Has 1.10_MRG_FilterContext:', '1.10_MRG_FilterContext' in names)

# 2. Connections correct
print('1.7 YES branch:', conns['1.7_IF_Extracted']['main'][0])
print('1.9 success:', conns['1.9_SUB_FilterLLM']['main'][0])
print('1.9 error:', conns['1.9_SUB_FilterLLM']['main'][1])
print('1.10 output:', conns['1.10_MRG_FilterContext']['main'][0])

# 3. Model strings fixed
old_id = 'global.anthropic'
for n in nodes:
    code = n.get('parameters',{}).get('jsCode','')
    if old_id in code:
        print(f'STILL HAS OLD MODEL: {n[\"name\"]}')
print('Model check done (no output = all fixed)')

# 4. filtered_context injected in Stage 6
for name in ['6a.1_FMT_SituationIntro','6b.1_FMT_Challenge','6c.1_FMT_Conclusion']:
    for n in nodes:
        if n['name'] == name:
            code = n['parameters']['jsCode']
            print(f'{name} has filtered_context:', 'filtered_context' in code)
            print(f'{name} has tone:', 'ctx.tone' in code)
"
```

Expected:
- All 3 new nodes: True
- 1.7 YES branch → 1.8_FMT_FilterContext
- 1.9 success → 1.10_MRG_FilterContext
- 1.9 error → 11.1_ERR_Response
- No `STILL HAS OLD MODEL` lines
- All Stage 6 nodes: `filtered_context: True`, `tone: True`

**Step 5: Commit**

```bash
git add n8n/workflows/staging/case-study-creator/main_workflow.json
git commit -m "feat(case-study): add FilterContext node, inject FGD context into all stages, fix model strings"
```

---

### Task 2: Deploy and activate on staging

**Step 1: Load env vars**

```bash
export N8N_BASE_URL=$(grep N8N_BASE_URL .env.local | cut -d= -f2)
export N8N_API_KEY=$(grep N8N_API_KEY .env.local | cut -d= -f2)
echo "Base URL: $N8N_BASE_URL"
```

**Step 2: Strip settings and push**

```bash
jq '{name, nodes, connections, staticData, settings: {executionOrder, callerPolicy}}' \
  n8n/workflows/staging/case-study-creator/main_workflow.json \
  > /tmp/case_study_payload.json

curl -s -X PUT \
  "$N8N_BASE_URL/api/v1/workflows/Havb102ZBST1xaeHDhnAK" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  -H "Content-Type: application/json" \
  -d @/tmp/case_study_payload.json \
  | jq '{id, name, updatedAt}'
```

Expected: `"id": "Havb102ZBST1xaeHDhnAK"` with recent `updatedAt`.

If response contains `"message"` with an error — read it and fix before continuing. Common fix: adjust the `jq` filter to only include settings keys that exist in the file.

**Step 3: Activate**

```bash
curl -s -X POST \
  "$N8N_BASE_URL/api/v1/workflows/Havb102ZBST1xaeHDhnAK/activate" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  | jq '{id, active}'
```

Expected: `"active": true`

**Step 4: Verify node count on deployed workflow**

```bash
curl -s "$N8N_BASE_URL/api/v1/workflows/Havb102ZBST1xaeHDhnAK" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  | jq '[.nodes[].name] | sort | .[]' | grep -E "1\.(8|9|10)"
```

Expected: `1.10_MRG_FilterContext`, `1.8_FMT_FilterContext`, `1.9_SUB_FilterLLM` all appear.

**Step 5: Commit deploy metadata if metadata.json was updated**

```bash
git add n8n/workflows/metadata.json 2>/dev/null || true
git commit -m "deploy(case-study): deploy and activate updated workflow on staging" 2>/dev/null || echo "Nothing to commit"
```

---

## Notes for Executor

**If `append_before_return` raises ValueError:** The FMT node's jsCode doesn't end with a standard `return [{` pattern. Read the node's actual code, find its return statement, and adjust the helper to match.

**If 2.1_FMT_Context project_memory replacement warns:** The exact string `PROJECT CONTEXT (from Focus Group Discussions):\n${ctx.project_memory || 'No project memory provided'}` didn't match. Run:
```bash
python3 -c "
import json
wf = json.load(open('n8n/workflows/staging/case-study-creator/main_workflow.json'))
for n in wf['nodes']:
    if n['name'] == '2.1_FMT_Context':
        code = n['parameters']['jsCode']
        idx = code.find('project_memory')
        print(repr(code[max(0,idx-30):idx+80]))
"
```
Then update `OLD_MEM` in the script to match.

**If push fails with settings error:** The jq filter strips to `{executionOrder, callerPolicy}` only. If that fails too, try `settings: (.settings | {executionOrder})`.

**Node count:** The workflow should have 44 nodes after update (41 original + 3 new).
