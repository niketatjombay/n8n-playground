# Unified Folder Tree Design

**Date:** 2026-02-26

## Goal

Show all workflows (dev, staging, production) in a single unified folder tree rooted at folder `KGg3wvRmKtMMmlIv` within project `JIV2elLHsVFXybZ2`. Remove the separate "Dev & Staging" / "Production" split from both metadata and UI.

## Current State

`metadata.json` has two separate trees:
- `folders` — dev + staging workflows under `KGg3wvRmKtMMmlIv` (workflow-name-group → environment-folder → workflows)
- `production_folders` — flat list of production-specific workflow folders

UI (`app/workflows/page.tsx`) renders these as two separate sections.

## Target Structure

### metadata.json
Single `folders` tree; `production_folders` removed.

```
KGg3wvRmKtMMmlIv ("Workflows")
  ├── pre-work-summary (virtual, folder_id: null)
  │     ├── development  (m5AiRuQt3X0eKcqr)
  │     ├── staging      (4CVfzzsCrNOwoWic)
  │     └── production   (KFGT2bzbDxqr0EVv)
  ├── session-slides (virtual)
  │     ├── development  (b0ilmW1P95C76nj2)
  │     ├── staging      (WsDARKycwjpCD4zQ)
  │     └── production   (jsqMCrJc7HVWluaL)
  ├── case-study-creator (virtual)
  │     ├── development  (b0ilmW1P95C76nj2)
  │     ├── staging      (6VQbrghLDVpWuwdv)
  │     └── production   (RatBUwE0G8nbgnwa)
  ├── document-summary-extractor (virtual)
  │     ├── development  (null)
  │     ├── staging      (null)
  │     └── production   (4JLkQmhzFV2M76tX)
  ├── project-memory-updater (virtual)
  │     ├── development  (Cj8Wfkq6WS7w1Gg9)
  │     ├── staging      (c6ZI4UXcv20OKrHM)
  │     └── production   (4JLkQmhzFV2M76tX)
  ├── llm-sub-workflow (virtual)
  │     ├── development  (b0ilmW1P95C76nj2)
  │     ├── staging      (6VQbrghLDVpWuwdv)
  │     └── production   (4JLkQmhzFV2M76tX)
  └── drive-utils (virtual)
        ├── development  (b0ilmW1P95C76nj2)
        ├── staging      (6VQbrghLDVpWuwdv)
        └── production   (4JLkQmhzFV2M76tX)
```

Production n8nIds (already deployed):
- pre-work-summary: `utFKJbzCl6GrA7en`
- session-slides: `RI1h4abSVfI7N6kG`
- case-study-creator: `g011GkLODOjGe5qm`
- document-summary-extractor: `slT9cjHoFs06m9e1`
- project-memory-updater: `Iryma4b8pY0SFXkC`
- llm-sub-workflow: `D6fFCdu4vBDxklaE`
- drive-utils: `KA0PQtx4oJHoDoTo`

## Changes Required

### 1. `n8n/workflows/metadata.json`
- Add `production` environment-folder node under each workflow-name-group in `folders`
- Move workflow entries from `production_folders` into these new production nodes
- Remove `production_folders` key
- Remove `production_project_id` key (same as `project_id`, redundant)

### 2. `n8n/lib/metadata.js`
- `collectAllWorkflows`: remove `walk(meta.production_folders || [], 'production')`
- `updateWorkflowEnv`: remove `if (!found) walk(meta.production_folders || [])`
- `updateSubWorkflowEnv`: same removal

### 3. `n8n/services/list-workflows.js`
- Remove `production_project_id` and `production_folders` from return value
- Return just `{ project_id, project_name, folders, instancesByEnv }`

### 4. `n8n/services/sync.js`
- Walk unified `folders` tree
- When a folder has `environment: "production"`, use production n8n client
- Remove separate production tree walk

### 5. `app/workflows/page.tsx`
- Remove `production_project_id` and `production_folders` from `WorkflowsData` interface
- Remove the two-section layout ("Dev & Staging" / "Production")
- Render one `<FolderTree>` from `data.folders`
- Keep per-environment color badges on env-leaf folders
