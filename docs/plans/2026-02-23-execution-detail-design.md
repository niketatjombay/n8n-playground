# Execution Detail Page Design

## Summary

Add an execution detail page at `/executions/[id]` that shows the full execution flow with node-level input/output data, timing, sub-workflow execution data inline, and LLM token usage summarized by model.

## Requirements

- Navigate from execution list to detail page by clicking an execution ID
- Show execution metadata: status, duration, mode, timestamps, workflow name
- Vertical timeline of nodes in execution order, each expandable to show input/output JSON
- Sub-workflows fetched and nested inline under their Execute Workflow parent node
- LLM token usage: extract actual usage from node output, fallback to tiktoken estimation
- Token summary table at execution level grouped by model (input tokens, output tokens, source)
- Error details for failed executions (message, stack trace)
- View Raw button to inspect full raw execution JSON

## Data Layer

### n8n Client (`n8n/lib/n8n-client.js`)

Add `getExecution(executionId)`:
- `GET /api/v1/executions/{id}?includeData=true`
- Returns full execution object with `data.resultData.runData` and `workflowData`

### Service (`n8n/services/executions.js`)

Add `getExecutionDetail({ executionId, env })`:

1. Fetch main execution with `includeData=true`
2. Scan `runData` for Execute Workflow nodes (`n8n-nodes-base.executeWorkflow`)
3. For each, extract child execution ID from output, fetch recursively
4. Build ordered node list from workflow connections + runData
5. Extract token usage from LLM node outputs (`usage.prompt_tokens`, `usage.completion_tokens`)
6. For LLM nodes without usage data, estimate via tiktoken
7. Aggregate tokens into summary grouped by model
8. Include error details from `resultData.error` for failed executions
9. Return raw execution JSON alongside processed data

**Return shape:**
```json
{
  "execution": {
    "id", "status", "startedAt", "stoppedAt", "duration", "mode", "finished",
    "workflowName", "error": { "message", "stack" } | null
  },
  "nodes": [
    {
      "name", "type", "status", "executionTimeMs", "startTime",
      "inputData", "outputData",
      "tokenUsage": { "model", "inputTokens", "outputTokens", "source" } | null,
      "isSubWorkflow": false,
      "children": null
    },
    {
      "name": "Execute Sub-Workflow",
      "type": "n8n-nodes-base.executeWorkflow",
      "isSubWorkflow": true,
      "subExecution": {
        "id", "workflowName", "status",
        "nodes": [ /* same node shape, recursively */ ]
      }
    }
  ],
  "tokenSummary": {
    "gpt-4o": { "inputTokens": 2450, "outputTokens": 890, "source": "actual" },
    "claude-3.5-sonnet": { "inputTokens": 1200, "outputTokens": 450, "source": "estimated" }
  },
  "raw": { /* full unprocessed execution response */ }
}
```

### API Route (`app/api/executions/[id]/route.ts`)

- `GET /api/executions/[id]?env=development`
- Calls `getExecutionDetail`, returns JSON
- Error handling: 404 if execution not found, 500 for API failures

## UI Design

### Page: `/executions/[id]`

**Header Card:**
- Back link to `/executions`
- Execution ID, status badge (color-coded), mode badge
- Workflow name, started timestamp, duration

**Token Summary Table:**
- Columns: Model, Input Tokens, Output Tokens, Source (actual/estimated)
- Only shown when LLM nodes are present

**Execution Flow (Vertical Timeline):**
- Nodes listed top-to-bottom in execution order
- Each node shows: name, type icon, execution time, status indicator
- LLM nodes show inline token badge: model name + input/output counts
- Click to expand: collapsible JSON viewer for input and output data
- Failed nodes: red status, error message shown inline

**Sub-Workflow Nesting:**
- Execute Workflow nodes render a bordered, indented block
- Shows sub-execution ID, workflow name
- Sub-workflow nodes rendered recursively inside the block

**View Raw:**
- Button in the flow header
- Opens a section/modal with the full raw execution JSON
- Syntax-highlighted, copyable

**Error State:**
- Failed execution: error banner at top with message
- Failed nodes: red timeline marker, error details in expandable section

## Token Extraction Logic

1. Identify LLM nodes by type: `@n8n/n8n-nodes-langchain.lmChatOpenAi`, `@n8n/n8n-nodes-langchain.lmChatAnthropic`, etc.
2. Check node output `json` for `usage` object with `prompt_tokens`/`completion_tokens`
3. Also check nested paths: `response.usage`, `message.usage`
4. If usage found: use actual values, record source as "actual"
5. If not found and node has text input/output: estimate with tiktoken, record source as "estimated"
6. Detect model name from node parameters or output metadata
7. Aggregate across all nodes (including sub-workflows) into tokenSummary keyed by model

## Dependencies

- `tiktoken` (or `js-tiktoken`) npm package for token estimation fallback
