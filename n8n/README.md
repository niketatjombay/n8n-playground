# n8n Workflow Management

Multi-environment workflow management for a single n8n CE instance (`workflows.ur-nl.com`).

Environments: **development** → **staging** → **production** (manual promotion).

## Setup

### 1. Environment Variables

Add to `.env.local`:

```bash
N8N_API_KEY=your_api_key
N8N_BASE_URL=https://workflows.ur-nl.com
N8N_WEBHOOK_BASE_URL=https://workflows.ur-nl.com/webhook

# Optional: separate production instance (defaults to N8N_BASE_URL)
# N8N_PROD_BASE_URL=https://prod-workflows.jombay.com
# N8N_PROD_API_KEY=your_prod_api_key
```

### 2. Test Connection

```bash
npm run n8n:test
```

### 3. Fill metadata.json

After creating n8n folders and workflows in the UI, fill in the `TODO_*` placeholders in `n8n/workflows/metadata.json`. Run `npm run n8n:status` to see what's missing.

---

## CLI Commands

| Command | Description |
|---------|-------------|
| `npm run n8n:test` | Test n8n API connectivity |
| `npm run n8n:status` | Overview of all envs and deployment status |
| `npm run n8n:list` | List all workflows from n8n API |
| `npm run n8n:list:grouped` | List workflows grouped by environment |
| `npm run n8n:backup -- --env <env>` | Back up workflows from n8n to local JSON |
| `npm run n8n:deploy -- --env <env>` | Deploy local JSON files to n8n |
| `npm run n8n:promote -- <slug> <src> <tgt>` | Promote a workflow between environments |
| `npm run n8n:activate -- <slug> <env>` | Activate a workflow |
| `npm run n8n:activate -- <slug> <env> --off` | Deactivate a workflow |
| `npm run n8n:test-workflow -- <slug> <env>` | Hit webhook with sample input |

Environment shorthand: `dev` = development, `stg` = staging, `prod` = production.

### Examples

```bash
# Back up development workflows
npm run n8n:backup -- --env development

# Back up a specific workflow
npm run n8n:backup -- --env development --slug case-study-creator

# Promote dev → staging
npm run n8n:promote -- case-study-creator dev stg

# Promote staging → production
npm run n8n:promote -- case-study-creator stg prod

# Test the staging webhook
npm run n8n:test-workflow -- case-study-creator stg

# Activate production
npm run n8n:activate -- case-study-creator prod

# Check status
npm run n8n:status
```

---

## Directory Structure

```
n8n/
  config/
    environments.config.js   # Per-env config (URLs, credentials, folder IDs)
    workflows.config.js       # Legacy workflow definitions
  lib/
    env-loader.js             # .env.local loader
    env-remap.js              # Remap workflow JSON between environments
    metadata.js               # Read/write metadata.json
    n8n-client.js             # n8n REST API client
    workflow-builder.js       # Node template utilities
  scripts/
    activate.js               # Activate/deactivate workflows
    backup.js                 # Back up from n8n → local JSON
    deploy.js                 # Deploy local JSON → n8n
    list-workflows.js         # List workflows (flat or grouped)
    promote.js                # Promote between environments
    status.js                 # Deployment status overview
    test-connection.js        # Test API connectivity
    test-workflow.js          # Hit webhook with sample payload
  workflows/
    metadata.json             # Central registry — the only file at this level
    development/
      case-study-creator/
        main_workflow.json    # Main workflow JSON
      sub_workflows/          # Shared sub-workflows (env-level, not per-workflow)
        llm-sub-workflow.json
        drive-utils.json
    staging/
      case-study-creator/
        main_workflow.json
      sub_workflows/
        llm-sub-workflow.json
        drive-utils.json
    production/
      case-study-creator/
        main_workflow.json
      sub_workflows/
        llm-sub-workflow.json
        drive-utils.json
```

Sub-workflows are **shared resources** — they live at `{env}/sub_workflows/`, not nested under each main workflow. A main workflow declares which sub-workflows it uses via `uses_sub_workflows` in metadata.

---

## metadata.json Structure

Two top-level sections: `sub_workflows` (shared) and one key per main workflow (the "slug").

### Sub-workflows (shared)

```json
{
  "sub_workflows": {
    "llm-sub-workflow": {
      "description": "Generic LLM utility — calls agentcoreapi, parses JSON response",
      "used_by": ["case-study-creator"],
      "api_endpoint": "https://agentcoreapi.jombay.com",
      "input": {
        "prompt": "string — the full prompt to send to the LLM",
        "model": "string — Bedrock model ID",
        "node_name": "string — calling node name for error logging",
        "workflow_session_id": "string",
        "workflow_id": "string",
        "project_id": "string",
        "client_id": "string"
      },
      "output": {
        "llm_response": "object — parsed JSON from the LLM"
      },
      "development": { "n8nId": "1DR7SBmbHnVajdbxTl5Vu", "project_id": "...", "folder_id": "..." },
      "staging": { "n8nId": "GDaWNcJJtLdY8Q6Y4Yv5p", "project_id": "...", "folder_id": "..." },
      "production": { "n8nId": "TODO_PROD_LLM_ID", "project_id": "TODO_...", "folder_id": "TODO_..." }
    },
    "drive-utils": {
      "description": "Google Drive document extraction",
      "used_by": ["case-study-creator"],
      "input": { "mode": "string", "google_drive_file_url": "string" },
      "output": { "extracted_text": "string", "status": "string" },
      "development": { "n8nId": "1qoBroTFrN02UbZvJOBIJ", "project_id": "...", "folder_id": "..." },
      "staging": { "n8nId": "8N4Pzq6oTI5liegt4r8ZJ4", "project_id": "...", "folder_id": "..." },
      "production": { "n8nId": "TODO_PROD_DRIVE_ID", "project_id": "TODO_...", "folder_id": "TODO_..." }
    }
  }
}
```

### Main workflows

```json
{
  "case-study-creator": {
    "description": "Main case study creator workflow",
    "uses_sub_workflows": ["llm-sub-workflow", "drive-utils"],
    "input": { /* sample webhook payload for testing */ },
    "development": {
      "n8nId": "FNuyZvKPcr3YlVeskVBMj",
      "project_id": "...",
      "folder_id": "...",
      "webhookPath": "/development/case-study-creator",
      "active": true,
      "lastDeployedAt": "2025-01-15T..."
    },
    "staging": { /* same shape */ },
    "production": { /* same shape */ }
  }
}
```

Key points:
- Sub-workflow n8n IDs live in `sub_workflows.<slug>.<env>.n8nId` (not per-workflow)
- Main workflows reference subs via `uses_sub_workflows: [...]` (just slugs, no IDs)
- Each env block has `project_id` (n8n project/team) and `folder_id` (env folder within the project)
- On create, the promote script assigns the workflow to `project_id` and moves it into `folder_id`
- Environment tag is a **name prefix**: `[DEV] Case Study Creator`, `[STG] Case Study Creator`
- Webhook paths have a leading `/`: `/development/case-study-creator`, `/staging/case-study-creator`

---

## What Changes Per Environment

| Aspect | Development | Staging | Production |
|--------|------------|---------|------------|
| Name prefix | `[DEV]` | `[STG]` | `[PROD]` |
| Webhook path | `/development/case-study-creator` | `/staging/case-study-creator` | `/case-study-creator` |
| coreapi URL | `coreapi.ur-nl.com` | `coreapi.ur-nl.com` | `coreapi.jombay.com` |
| LLM URL | `agentcoreapi.jombay.com` | same | same |
| Credentials | Jombay Staging API | Jombay Staging API | Jombay Production API |

The promote script handles all of this automatically.

---

## Adding a New Workflow

1. **Build in n8n UI** — create the workflow inside the Development folder
2. **Back up locally:**
   ```bash
   npm run n8n:backup -- --env development
   ```
3. **Add to metadata.json** — add a new top-level key with the workflow slug:
   ```json
   {
     "my-new-workflow": {
       "description": "What this workflow does",
       "uses_sub_workflows": ["llm-sub-workflow"],
       "input": { /* sample test payload */ },
       "development": {
         "n8nId": "THE_N8N_ID",
         "project_id": "YOUR_PROJECT_ID",
         "folder_id": "YOUR_DEV_FOLDER_ID",
         "webhookPath": "/development/my-new-workflow",
         "active": true,
         "lastDeployedAt": null
       },
       "staging": {
         "n8nId": "TODO_STG_WORKFLOW_ID",
         "project_id": "YOUR_PROJECT_ID",
         "folder_id": "YOUR_STG_FOLDER_ID",
         "webhookPath": "/staging/my-new-workflow",
         "active": false,
         "lastDeployedAt": null
       },
       "production": {
         "n8nId": "TODO_PROD_WORKFLOW_ID",
         "project_id": "TODO_PROD_PROJECT_ID",
         "folder_id": "TODO_PROD_FOLDER_ID",
         "webhookPath": "/my-new-workflow",
         "active": false,
         "lastDeployedAt": null
       }
     }
   }
   ```
   If the workflow uses new sub-workflows, add them to the `sub_workflows` section too.
4. **Promote to staging:**
   ```bash
   npm run n8n:promote -- my-new-workflow dev stg
   ```
   The script creates the workflow in n8n and fills in the staging n8nId automatically.
5. **Test staging:**
   ```bash
   npm run n8n:test-workflow -- my-new-workflow stg
   ```
6. **Promote to production:**
   ```bash
   npm run n8n:promote -- my-new-workflow stg prod
   ```

---

## Workflow Architecture

### Case Study Creator

The main workflow uses a **Stage.SubNode** naming convention with 9 LLM stages:

```
X.1_FMT → X.2_LLM → X.3_MRG
```

| Prefix | Purpose |
|--------|---------|
| `FMT` | Builds prompt from core objects |
| `LLM` | Calls LLM sub-workflow |
| `MRG` | Merges response into `generated_case` |

### Stages

| Stage | Model | Purpose |
|-------|-------|---------|
| 1 | — | Input validation & Drive extraction |
| 2 | Sonnet | Context & design constraints |
| 3 | Sonnet | Parse reference case |
| 4 | Sonnet | Industry adaptation |
| 5 | Sonnet | Behavior mapping + outline |
| 6 | Sonnet | Challenge writing |
| 7 | Sonnet | Questions + assessor guidance |
| 8 | Haiku | Quality scoring + auto-fix |
| 9 | Haiku | Bias check |
| 10 | JS | Package final output |
| 11 | — | Output & error handling |

### Sub-workflows

- **LLM Sub-workflow** — Generic LLM call utility (Bedrock via agentcoreapi)
- **Drive Utils** — Google Drive document content extraction

---

## Troubleshooting

### "runtimeSessionId too short" Error
AWS Bedrock requires `runtimeSessionId` ≥ 33 characters. The LLM sub-workflow generates this automatically.

### Webhook Returns Immediately
Configured with `responseMode: "onReceived"`. Check execution via n8n UI or API.

### JSON Parse Errors
The LLM sub-workflow handles markdown fences, prefixes, and malformed JSON. On failure, the error includes the raw response for debugging.

### TODO Placeholders
Run `npm run n8n:status` to see which IDs still need to be filled in. Create the resources in n8n UI first, then update `metadata.json`.
