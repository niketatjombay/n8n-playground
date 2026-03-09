# Pre-Work Summary Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix CTM extraction bug, fix model string, and add a pre-processing FilterContext LLM node to compress large inputs before the main slide generation call.

**Architecture:** A Python script makes all JSON changes to `main_workflow.json` safely (avoids manual JSON escaping of large prompt strings). Two new nodes are added: `2.5_FMT_FilterContext` (builds filter prompt) and `2.6_SUB_FilterLLM` (calls LLM sub-workflow). The main `3.2_FMT_BuildPrompt` node is updated to consume filtered context and use model `'sonnet'`. Connections are rewired so both paths (docs and no-docs) flow through the new filter nodes before reaching the main generation.

**Tech Stack:** Python 3 (json module), n8n REST API (`PUT /api/v1/workflows/{id}`, `POST activate`), bash (curl + jq), existing LLM sub-workflow `GDaWNcJJtLdY8Q6Y4Yv5p`

---

### Task 1: Read current workflow to understand node positions

This task is read-only — needed before any edits.

**Files:**
- Read: `n8n/workflows/staging/pre-work-summary/main_workflow.json`

**Step 1: Confirm node IDs**

Open the file and grep for the node IDs we will touch:

```bash
grep -E '"id":|"name":' n8n/workflows/staging/pre-work-summary/main_workflow.json | head -60
```

Expected IDs (confirm these match):
- `if-has-docs-001` → `2.1_IF_HasDocs`
- `js-split-urls-001` → `2.2_JS_SplitUrls`
- `js-collect-docs-001` → `2.4_JS_CollectDocs`
- `fmt-build-prompt-001` → `3.2_FMT_BuildPrompt`
- `sub-call-llm-001` → `4.1_SUB_CallLLM`

**Step 2: Confirm current connections**

```bash
python3 -c "
import json
with open('n8n/workflows/staging/pre-work-summary/main_workflow.json') as f:
    wf = json.load(f)
conns = wf.get('connections', {})
for k, v in conns.items():
    print(k, '->', v)
"
```

Note which nodes connect TO `3.2_FMT_BuildPrompt` — we will redirect them.

---

### Task 2: Write the update Python script

**Files:**
- Create: `/tmp/update_pre_work_summary.py`

**Step 1: Create the script**

```python
#!/usr/bin/env python3
"""
Updates n8n/workflows/staging/pre-work-summary/main_workflow.json with:
1. 2.1_IF_HasDocs: condition updated to check docs_urls OR ctm_google_drive_url
2. 2.2_JS_SplitUrls: includes CTM URL with type marker
3. 2.4_JS_CollectDocs: separates extracted_ctm from extracted_documents
4. NEW 2.5_FMT_FilterContext: Code node building the filter prompt
5. NEW 2.6_SUB_FilterLLM: executeWorkflow node calling LLM sub-workflow
6. 3.2_FMT_BuildPrompt: model fixed to 'sonnet', reads filtered context
7. Connections rewired: both paths flow through FilterContext before BuildPrompt
"""

import json
import copy

WORKFLOW_PATH = 'n8n/workflows/staging/pre-work-summary/main_workflow.json'

with open(WORKFLOW_PATH) as f:
    wf = json.load(f)

nodes = wf['nodes']

def find_node(name):
    for n in nodes:
        if n['name'] == name:
            return n
    raise ValueError(f'Node not found: {name}')

# ─── 1. Update 2.1_IF_HasDocs ────────────────────────────────────────────────
if_node = find_node('2.1_IF_HasDocs')
# Add second condition for ctm_google_drive_url, change combinator to "or"
if_node['parameters']['conditions']['combinator'] = 'or'
if_node['parameters']['conditions']['conditions'] = [
    {
        "id": "has-docs-001",
        "leftValue": "={{ $json.body.documents_urls }}",
        "rightValue": "",
        "operator": {
            "type": "string",
            "operation": "notEmpty"
        }
    },
    {
        "id": "has-ctm-001",
        "leftValue": "={{ $json.body.ctm_google_drive_url }}",
        "rightValue": "",
        "operator": {
            "type": "string",
            "operation": "notEmpty"
        }
    }
]
print("Updated 2.1_IF_HasDocs")

# ─── 2. Update 2.2_JS_SplitUrls ──────────────────────────────────────────────
split_node = find_node('2.2_JS_SplitUrls')
split_node['parameters']['jsCode'] = (
    "const items = [];\n"
    "const body = $('1.1_TRG_Webhook').first().json.body;\n"
    "\n"
    "if (body.documents_urls) {\n"
    "  const urls = body.documents_urls.split(',').map(u => u.trim()).filter(u => u.length > 0);\n"
    "  urls.forEach(url => items.push({ json: { mode: 'EXTRACT_CONTENT', google_drive_file_url: url, type: 'document' } }));\n"
    "}\n"
    "\n"
    "if (body.ctm_google_drive_url && body.ctm_google_drive_url.trim()) {\n"
    "  items.push({ json: { mode: 'EXTRACT_CONTENT', google_drive_file_url: body.ctm_google_drive_url.trim(), type: 'ctm' } });\n"
    "}\n"
    "\n"
    "return items;"
)
print("Updated 2.2_JS_SplitUrls")

# ─── 3. Update 2.4_JS_CollectDocs ────────────────────────────────────────────
collect_node = find_node('2.4_JS_CollectDocs')
collect_node['parameters']['jsCode'] = (
    "const docs = [];\n"
    "let ctm = null;\n"
    "\n"
    "for (const item of $input.all()) {\n"
    "  if (item.json.status === 'success' && item.json.extracted_text) {\n"
    "    if (item.json.type === 'ctm') {\n"
    "      ctm = item.json.extracted_text;\n"
    "    } else {\n"
    "      docs.push(item.json.extracted_text);\n"
    "    }\n"
    "  }\n"
    "}\n"
    "\n"
    "return [{ json: { extracted_documents: docs, extracted_ctm: ctm, has_documents: docs.length > 0 || ctm !== null } }];"
)
print("Updated 2.4_JS_CollectDocs")

# ─── 4. Build FilterContext prompt ───────────────────────────────────────────
FILTER_PROMPT = """You are a context extraction specialist. Your job is to read raw project inputs and extract structured information needed to generate 12 pre-work presentation slides for a leadership development programme.

CRITICAL RULES:
- Extract ONLY what is explicitly stated in the inputs — no inference, no fabrication
- Verbatim quotes must be character-exact from the source text — do not paraphrase or reconstruct
- Participant profile = program participants (people going through the development programme), NOT meeting speakers, FGD facilitators, or HR stakeholders
- If a section has no supporting data, use empty array [] or empty string "" — never invent content
- List all missing or unclear items in extraction_gaps — these will be flagged as gaps in the slides
- Output pure JSON only — no markdown fences, no explanatory text before or after

OUTPUT SCHEMA:
{
  "participant_profile": {
    "total_nominated": "<count as string, or empty string if unknown>",
    "level_breakdown": ["<level with percentage if known>"],
    "functions": ["<function name>"],
    "experience_range": "<years range as string, or empty string>",
    "locations": ["<location>"]
  },
  "competencies_in_scope": ["<competency name exactly as used in source>"],
  "company_profile": {
    "industry": "<industry string, or empty>",
    "scale": "<company scale/size, or empty>",
    "values": ["<stated organizational value>"],
    "geographic_presence": ["<country or region>"],
    "strategic_focus": ["<stated strategic priority>"]
  },
  "challenges": [
    {
      "competency": "<competency name>",
      "participant_observations": ["<what participants said or experienced>"],
      "manager_leader_observations": ["<what managers and leaders observed>"]
    }
  ],
  "current_vs_desired": [
    {
      "competency": "<competency name>",
      "current_behaviors": ["<observable behavior today>"],
      "desired_behaviors": ["<target behavior>"]
    }
  ],
  "verbatim_quotes": {
    "participant_fgd": ["<character-exact quote from participant FGD — must be traceable to input text>"],
    "manager_fgd": ["<character-exact quote from manager FGD>"],
    "leadership_interview": ["<character-exact quote from leadership interview>"]
  },
  "client_jargon": [
    { "term": "<term or acronym>", "definition": "<one-sentence definition from source>" }
  ],
  "out_of_scope_issues": ["<issue that requires non-learning intervention, with required intervention type>"],
  "insights": [
    {
      "pattern": "<observed pattern across sources>",
      "root_cause": "<root cause at L2-L3 depth — not surface symptom>",
      "learning_implications": ["<what development must address>"],
      "org_requirements": ["<what the organization must do in parallel>"]
    }
  ],
  "development_themes": [
    {
      "name": "<theme name>",
      "subtopics": ["<application-focused module or subtopic>"],
      "sequencing_logic": "<why this theme comes in this order>"
    }
  ],
  "additional_insights": ["<recommendations or insights beyond programme scope>"],
  "extraction_gaps": ["<what was missing, unclear, or ambiguous in the inputs>"]
}

INPUTS:
"""

# ─── 5. Build FilterContext jsCode ───────────────────────────────────────────
FILTER_JS = (
    "const webhook = $('1.1_TRG_Webhook').first().json.body;\n"
    "\n"
    "// Read extracted docs + CTM if the docs path ran\n"
    "let extractedDocuments = [];\n"
    "let extractedCtm = null;\n"
    "try {\n"
    "  const collectNode = $('2.4_JS_CollectDocs');\n"
    "  if (collectNode && collectNode.first()) {\n"
    "    extractedDocuments = collectNode.first().json.extracted_documents || [];\n"
    "    extractedCtm = collectNode.first().json.extracted_ctm || null;\n"
    "  }\n"
    "} catch (e) {\n"
    "  // No docs path — skip\n"
    "}\n"
    "\n"
    "let prompt = " + json.dumps(FILTER_PROMPT) + ";\n"
    "\n"
    "prompt += '\\n\\n<project_details>';\n"
    "prompt += webhook.project_details || '';\n"
    "prompt += '</project_details>\\n\\n';\n"
    "\n"
    "prompt += '<project_memory>';\n"
    "prompt += webhook.current_project_memory || '';\n"
    "prompt += '</project_memory>\\n\\n';\n"
    "\n"
    "if (extractedCtm) {\n"
    "  prompt += '<ctm>';\n"
    "  prompt += extractedCtm;\n"
    "  prompt += '</ctm>\\n\\n';\n"
    "}\n"
    "\n"
    "if (extractedDocuments.length > 0) {\n"
    "  prompt += '<project_documents>';\n"
    "  extractedDocuments.forEach(doc => {\n"
    "    prompt += '<document>' + doc + '</document>\\n\\n';\n"
    "  });\n"
    "  prompt += '</project_documents>\\n';\n"
    "}\n"
    "\n"
    "return [{\n"
    "  json: {\n"
    "    prompt: prompt,\n"
    "    model: 'sonnet',\n"
    "    max_tokens: 3000,\n"
    "    node_name: 'PreWorkFilter',\n"
    "    client_id: webhook.client_id,\n"
    "    project_id: webhook.project_id,\n"
    "    workflow_session_id: webhook.workflow_session_id,\n"
    "    workflow_id: webhook.workflow_id,\n"
    "    workflow_name: webhook.workflow_name,\n"
    "    workflow_session_name: webhook.workflow_session_name,\n"
    "    client_name: webhook.client_name,\n"
    "    project_name: webhook.project_name,\n"
    "    google_drive_folder_id: webhook.google_drive_folder_id\n"
    "  }\n"
    "}];"
)

# ─── 6. Add 2.5_FMT_FilterContext node ───────────────────────────────────────
filter_context_node = {
    "parameters": {
        "jsCode": FILTER_JS
    },
    "type": "n8n-nodes-base.code",
    "typeVersion": 2,
    "position": [-480, 0],
    "id": "fmt-filter-context-001",
    "name": "2.5_FMT_FilterContext",
    "notes": "Build filter prompt: extract slide-relevant context from project memory, details, CTM, and docs"
}
nodes.append(filter_context_node)
print("Added 2.5_FMT_FilterContext")

# ─── 7. Add 2.6_SUB_FilterLLM node ──────────────────────────────────────────
filter_llm_node = {
    "parameters": {
        "workflowId": {
            "__rl": True,
            "mode": "id",
            "value": "GDaWNcJJtLdY8Q6Y4Yv5p"
        },
        "options": {}
    },
    "type": "n8n-nodes-base.executeWorkflow",
    "typeVersion": 1.1,
    "position": [-256, 0],
    "id": "sub-filter-llm-001",
    "name": "2.6_SUB_FilterLLM",
    "retryOnFail": True,
    "maxTries": 2,
    "waitBetweenTries": 5000,
    "onError": "continueErrorOutput",
    "notes": "Call LLM sub-workflow to extract focused context JSON from raw inputs"
}
nodes.append(filter_llm_node)
print("Added 2.6_SUB_FilterLLM")

# ─── 8. Build new BuildPrompt JS ─────────────────────────────────────────────
# Read the existing BuildPrompt jsCode to extract the big prompt string,
# then replace Section 2 and update input injection + model string.

build_node = find_node('3.2_FMT_BuildPrompt')
old_js = build_node['parameters']['jsCode']

# The prompt is everything between 'let prompt = "' and the closing '";'
# We'll rebuild the BuildPrompt code to read filtered context from FilterLLM
# and inject it as <project_context>

# Extract the original prompt string (between first let prompt = " and \n\n## INPUTS)
# We keep everything up to and including "## 2. INPUT STRUCTURE\n\n" then replace
# the rest of section 2 and the injection code.

# Find the boundary: Section 2 starts after "## 1. ROLE & MISSION" block
# New Section 2 replaces the old variable-inputs section

# Strategy: rebuild the JS from scratch, keeping the big prompt constant
# but replacing Section 2 and the input injection block.

# Extract the original big prompt text (everything from after 'let prompt = '
# up to the INPUTS block at the bottom)
import re

# The original prompt starts after: let prompt = "# PRE-WORK SLIDE CONTENT GENERATION PROMPT
# and ends at: \n## INPUTS\n";
prompt_match = re.search(r'let prompt = (\".*?\\n## INPUTS\\n\");', old_js, re.DOTALL)
if not prompt_match:
    raise ValueError("Could not find prompt string in BuildPrompt JS")

old_prompt_json_str = prompt_match.group(1)

# Replace old Section 2 content with new slim version
OLD_SECTION_2 = (
    "## 2. INPUT STRUCTURE\\n\\n"
    "Inputs are appended at the end of this prompt.\\n\\n"
    "### Fixed Inputs (Always Present)\\n"
    "- **`<project_details>`** — Client name, industry, participant count, scope, timeline, delivery mode\\n"
    "- **`<project_summary>`** — Consolidated FGDs (participants, managers, leaders), interviews, discovery notes. **This is your PRIMARY evidence source.**\\n\\n"
    "### Variable Inputs (If Available)\\n"
    "- **`<ctm>`** — CTM or client's competency model\\n"
    "- **`<project_documents>`** — Strategy docs, values, org structure, other materials\\n\\n"
    "**Rule:** If variable inputs are absent, generate using fixed inputs. Flag in `gaps` where CTM/docs would strengthen content."
)

NEW_SECTION_2 = (
    "## 2. INPUT STRUCTURE\\n\\n"
    "A single pre-processed context block is provided at the end of this prompt.\\n\\n"
    "- **`<project_context>`** — Structured JSON containing: participant profile, competencies in scope, company profile, challenges per competency, current vs desired behaviors, verbatim quotes (T1), client jargon, out-of-scope issues, insights, development themes, and any extraction gaps.\\n\\n"
    "**Rule:** If `extraction_gaps` in the context contains items, treat them as missing data — flag in `gaps` for affected slides. Do not fabricate content for gaps."
)

if OLD_SECTION_2 not in old_prompt_json_str:
    print("WARNING: Could not find exact Section 2 text to replace — doing full rebuild")
    new_prompt_json_str = old_prompt_json_str
else:
    new_prompt_json_str = old_prompt_json_str.replace(OLD_SECTION_2, NEW_SECTION_2)
    print("Replaced Section 2 in BuildPrompt prompt")

# Build new BuildPrompt JS: use filtered context from 2.6_SUB_FilterLLM
NEW_BUILD_JS = (
    "const webhook = $('1.1_TRG_Webhook').first().json.body;\n"
    "const filteredContext = $input.first().json.llm_response;\n"
    "\n"
    "// Inline prompt template\n"
    "let prompt = " + new_prompt_json_str + ";\n"
    "\n"
    "// Inject pre-processed context\n"
    "prompt += '\\n\\n# Project Context\\n<project_context>';\n"
    "prompt += JSON.stringify(filteredContext || {});\n"
    "prompt += '</project_context>\\n';\n"
    "\n"
    "return [{\n"
    "  json: {\n"
    "    prompt: prompt,\n"
    "    model: 'sonnet',\n"
    "    node_name: 'PreWorkSummary',\n"
    "    client_id: webhook.client_id,\n"
    "    project_id: webhook.project_id,\n"
    "    workflow_session_id: webhook.workflow_session_id,\n"
    "    workflow_id: webhook.workflow_id,\n"
    "    workflow_name: webhook.workflow_name,\n"
    "    workflow_session_name: webhook.workflow_session_name,\n"
    "    client_name: webhook.client_name,\n"
    "    project_name: webhook.project_name,\n"
    "    google_drive_folder_id: webhook.google_drive_folder_id\n"
    "  }\n"
    "}];"
)

build_node['parameters']['jsCode'] = NEW_BUILD_JS
print("Updated 3.2_FMT_BuildPrompt")

# ─── 9. Update connections ────────────────────────────────────────────────────
conns = wf['connections']

# a) 2.1_IF_HasDocs NO branch: was 3.2_FMT_BuildPrompt → now 2.5_FMT_FilterContext
no_branch = conns.get('2.1_IF_HasDocs', {}).get('main', [[], []])
if len(no_branch) >= 2:
    no_branch[1] = [{"node": "2.5_FMT_FilterContext", "type": "main", "index": 0}]
    print("Rewired 2.1_IF_HasDocs NO → 2.5_FMT_FilterContext")

# b) 2.4_JS_CollectDocs: was 3.2_FMT_BuildPrompt → now 2.5_FMT_FilterContext
if '2.4_JS_CollectDocs' in conns:
    conns['2.4_JS_CollectDocs']['main'] = [
        [{"node": "2.5_FMT_FilterContext", "type": "main", "index": 0}]
    ]
    print("Rewired 2.4_JS_CollectDocs → 2.5_FMT_FilterContext")

# c) Add 2.5_FMT_FilterContext → 2.6_SUB_FilterLLM
conns['2.5_FMT_FilterContext'] = {
    "main": [[{"node": "2.6_SUB_FilterLLM", "type": "main", "index": 0}]]
}
print("Added connection 2.5_FMT_FilterContext → 2.6_SUB_FilterLLM")

# d) Add 2.6_SUB_FilterLLM → 3.2_FMT_BuildPrompt (success path only)
conns['2.6_SUB_FilterLLM'] = {
    "main": [[{"node": "3.2_FMT_BuildPrompt", "type": "main", "index": 0}]]
}
print("Added connection 2.6_SUB_FilterLLM → 3.2_FMT_BuildPrompt")

# e) Remove old direct connections to 3.2_FMT_BuildPrompt from IF/CollectDocs
# (already done above — IF NO branch now points to FilterContext, CollectDocs too)

# ─── 10. Write output ─────────────────────────────────────────────────────────
with open(WORKFLOW_PATH, 'w') as f:
    json.dump(wf, f, indent=2, ensure_ascii=False)

print("\nDone. Workflow written to", WORKFLOW_PATH)
```

**Step 2: Run the script**

```bash
cd /Users/niketpuranik/data/workspace/projects/ai/n8n-playground
python3 /tmp/update_pre_work_summary.py
```

Expected output:
```
Updated 2.1_IF_HasDocs
Updated 2.2_JS_SplitUrls
Updated 2.4_JS_CollectDocs
Added 2.5_FMT_FilterContext
Added 2.6_SUB_FilterLLM
Replaced Section 2 in BuildPrompt prompt
Updated 3.2_FMT_BuildPrompt
Rewired 2.1_IF_HasDocs NO → 2.5_FMT_FilterContext
Rewired 2.4_JS_CollectDocs → 2.5_FMT_FilterContext
Added connection 2.5_FMT_FilterContext → 2.6_SUB_FilterLLM
Added connection 2.6_SUB_FilterLLM → 3.2_FMT_BuildPrompt

Done. Workflow written to n8n/workflows/staging/pre-work-summary/main_workflow.json
```

If "WARNING: Could not find exact Section 2 text to replace" appears, stop and investigate before continuing.

**Step 3: Verify the JSON is valid**

```bash
python3 -c "import json; json.load(open('n8n/workflows/staging/pre-work-summary/main_workflow.json')); print('Valid JSON')"
```

Expected: `Valid JSON`

**Step 4: Verify key changes are present**

```bash
# Check new nodes exist
python3 -c "
import json
wf = json.load(open('n8n/workflows/staging/pre-work-summary/main_workflow.json'))
names = [n['name'] for n in wf['nodes']]
print('Nodes:', names)
print('Has FilterContext:', '2.5_FMT_FilterContext' in names)
print('Has FilterLLM:', '2.6_SUB_FilterLLM' in names)
"

# Check connections
python3 -c "
import json
wf = json.load(open('n8n/workflows/staging/pre-work-summary/main_workflow.json'))
c = wf['connections']
print('FilterContext connections:', c.get('2.5_FMT_FilterContext'))
print('FilterLLM connections:', c.get('2.6_SUB_FilterLLM'))
print('IF_HasDocs NO branch:', c.get('2.1_IF_HasDocs', {}).get('main', [[],[]])[1])
print('CollectDocs connections:', c.get('2.4_JS_CollectDocs'))
"

# Check model string is fixed
python3 -c "
import json
wf = json.load(open('n8n/workflows/staging/pre-work-summary/main_workflow.json'))
for n in wf['nodes']:
    if n['name'] == '3.2_FMT_BuildPrompt':
        code = n['parameters']['jsCode']
        print('Has sonnet:', \"model: 'sonnet'\" in code)
        print('Has old model ID:', 'global.anthropic' in code)
        print('Has filteredContext:', 'filteredContext' in code)
        print('Has project_context tag:', 'project_context' in code)
"
```

Expected:
- `Has FilterContext: True`
- `Has FilterLLM: True`
- FilterContext connections point to `2.6_SUB_FilterLLM`
- FilterLLM connections point to `3.2_FMT_BuildPrompt`
- IF_HasDocs NO branch points to `2.5_FMT_FilterContext`
- `Has sonnet: True`
- `Has old model ID: False`
- `Has filteredContext: True`
- `Has project_context tag: True`

**Step 5: Commit**

```bash
git add n8n/workflows/staging/pre-work-summary/main_workflow.json
git commit -m "feat(pre-work-summary): add FilterContext node, fix CTM extraction, fix model string"
```

---

### Task 3: Deploy to staging

The n8n API key and base URL are in `.env.local`. The workflow ID is `PDjuao8X0zSNWvvN`.

**Step 1: Load env vars**

```bash
export N8N_BASE_URL=$(grep N8N_BASE_URL .env.local | cut -d= -f2)
export N8N_API_KEY=$(grep N8N_API_KEY .env.local | cut -d= -f2)
echo "Base URL: $N8N_BASE_URL"
```

**Step 2: Strip settings fields that n8n rejects, then push**

n8n's API rejects `timeSavedMode` and `availableInMCP` in the settings object. Strip them before pushing:

```bash
jq '{name, nodes, connections, staticData, settings: {executionOrder, callerPolicy, executionTimeout, timezone}}' \
  n8n/workflows/staging/pre-work-summary/main_workflow.json \
  > /tmp/pre_work_payload.json

curl -s -X PUT \
  "$N8N_BASE_URL/api/v1/workflows/PDjuao8X0zSNWvvN" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  -H "Content-Type: application/json" \
  -d @/tmp/pre_work_payload.json \
  | jq '{id, name, updatedAt}'
```

Expected: response with `"id": "PDjuao8X0zSNWvvN"` and the current timestamp in `updatedAt`.

If the response contains `"message"` with an error, read it carefully — it usually names the exact field that failed validation.

**Step 3: Activate the workflow**

```bash
curl -s -X POST \
  "$N8N_BASE_URL/api/v1/workflows/PDjuao8X0zSNWvvN/activate" \
  -H "X-N8N-API-KEY: $N8N_API_KEY" \
  | jq '{id, active}'
```

Expected: `"active": true`

**Step 4: Verify in n8n UI**

Open `$N8N_BASE_URL` in browser, find `[STG] Pre-Work Summary`, confirm:
- Status is active
- Node list includes `2.5_FMT_FilterContext` and `2.6_SUB_FilterLLM`
- `3.2_FMT_BuildPrompt` connects from `2.6_SUB_FilterLLM`

**Step 5: Commit**

```bash
git add n8n/workflows/metadata.json  # if lastDeployedAt was updated
git commit -m "deploy(pre-work-summary): deploy and activate updated workflow on staging"
```

---

### Task 4: Smoke test with sample input

**Step 1: Check sample_input.json exists**

```bash
ls n8n/workflows/staging/pre-work-summary/
```

If `sample_input.json` exists, use it. If not, create a minimal one:

```bash
cat > n8n/workflows/staging/pre-work-summary/sample_input.json << 'EOF'
{
  "project_details": "Client: Test Corp. 20 mid-level managers. 6-month programme. Competencies: Decision Making, Collaboration.",
  "current_project_memory": "FGD 1: Managers report difficulty delegating. Leaders expect autonomous decision making. Jargon: DM = Decision Matrix internal tool.",
  "ctm_google_drive_url": "",
  "documents_urls": "",
  "client_id": "test-client-001",
  "project_id": "test-project-001",
  "workflow_session_id": "test-session-001",
  "workflow_id": "PDjuao8X0zSNWvvN",
  "workflow_name": "Pre-Work Summary",
  "workflow_session_name": "Test Session",
  "client_name": "Test Corp",
  "project_name": "Test Project",
  "google_drive_folder_id": ""
}
EOF
```

**Step 2: Trigger the webhook**

```bash
export WEBHOOK_BASE=$(grep N8N_WEBHOOK_BASE_URL .env.local | cut -d= -f2)
# If not set, use:
export WEBHOOK_BASE="$N8N_BASE_URL/webhook"

curl -s -X POST \
  "$WEBHOOK_BASE/staging/pre-work-summary" \
  -H "Content-Type: application/json" \
  -d @n8n/workflows/staging/pre-work-summary/sample_input.json
```

Expected: `200 OK` immediately (webhook responds before processing).

**Step 3: Check execution in n8n UI**

In the n8n UI, open `[STG] Pre-Work Summary` → Executions. Find the latest run. Verify:
- `2.5_FMT_FilterContext` ran and produced a prompt
- `2.6_SUB_FilterLLM` ran and produced `llm_response` (a JSON object)
- `3.2_FMT_BuildPrompt` received the filtered context and produced a prompt
- `4.1_SUB_CallLLM` ran successfully
- Execution completed without error

---

## Notes for Executor

**If Section 2 replacement fails:** The script prints a WARNING. This means the exact text of Section 2 in the current workflow doesn't match what was expected. In that case, open `main_workflow.json`, manually find the Section 2 block in `3.2_FMT_BuildPrompt`'s `jsCode`, and update it to the new text (referencing `<project_context>` instead of `<project_details>` + `<project_summary>`). Then re-run the script with `OLD_SECTION_2` updated to match the actual text.

**If n8n push fails with settings error:** Strip all settings except `{executionOrder, callerPolicy, executionTimeout, timezone}` and retry.

**If n8n push fails with node type error:** Check that `type: "n8n-nodes-base.executeWorkflow"` and `typeVersion: 1.1` match what the existing `4.1_SUB_CallLLM` node uses.

**LLM sub-workflow ID:** `GDaWNcJJtLdY8Q6Y4Yv5p` — this is the shared LLM sub-workflow. Used by `2.6_SUB_FilterLLM` and `4.1_SUB_CallLLM`. Do not change it.
