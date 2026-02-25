# Hierarchical Metadata + Sync Design

**Date:** 2026-02-25
**Status:** Approved

## Problem

The platform currently fetches all workflows from the n8n instance and uses a flat `metadata.json` keyed by workflow slug. There is no scoping to a specific project or folder, and the metadata structure does not reflect the actual n8n folder hierarchy.

## Goal

- Scope the platform to project `JIV2elLHsVFXybZ2`, folder `KGg3wvRmKtMMmlIv`
- Restructure `metadata.json` to mirror the n8n folder tree
- Add a Sync button that reconciles metadata.json with live n8n state

## n8n Hierarchy

```
Project (JIV2elLHsVFXybZ2)
  └── Parent Folder (KGg3wvRmKtMMmlIv)
        └── Agent Folder (e.g. "case-study-creator")
              └── Env Folder (e.g. "development")
                    └── Workflow
```

## New metadata.json Schema

```json
{
  "project_id": "JIV2elLHsVFXybZ2",
  "project_name": "<from n8n API>",
  "folders": [
    {
      "folder_id": "KGg3wvRmKtMMmlIv",
      "folder_name": "<from n8n API>",
      "folders": [
        {
          "folder_id": "<agent-folder-id>",
          "folder_name": "case-study-creator",
          "folders": [
            {
              "folder_id": "b0ilmW1P95C76nj2",
              "folder_name": "development",
              "environment": "development",
              "folders": [],
              "workflows": [
                {
                  "n8nId": "FNuyZvKPcr3YlVeskVBMj",
                  "name": "[DEV] Case Study Creator",
                  "slug": "case-study-creator",
                  "webhookPath": "/development/case-study-creator",
                  "active": true,
                  "lastDeployedAt": "2026-02-10T01:53:08.826Z",
                  "archived": false
                }
              ]
            }
          ],
          "workflows": []
        }
      ],
      "workflows": []
    }
  ]
}
```

### Workflow entry fields

| Field | Source | Notes |
|---|---|---|
| `n8nId` | n8n API | Workflow ID |
| `name` | n8n API | Raw workflow name |
| `slug` | derived | Stripped of env prefix, kebab-case |
| `webhookPath` | n8n API | From webhook trigger node |
| `active` | n8n API | Current activation state |
| `lastDeployedAt` | metadata | Preserved from previous metadata; set on deploy |
| `archived` | sync logic | `true` if workflow no longer found in n8n |

Environment is inferred from the parent folder's `environment` field (not stored per-workflow).

## Sync Operation — `POST /api/sync`

### Steps

1. `GET /projects/{projectId}` — fetch project name
2. `GET /folders?projectId={projectId}` — fetch all folders, build tree rooted at `KGg3wvRmKtMMmlIv`
3. `GET /workflows?projectId={projectId}` — fetch all workflows, assign each to its folder node by `folder_id`
4. Merge with existing metadata.json:
   - **Existing workflow**: update `name`, `active`; preserve `lastDeployedAt` and `slug`
   - **Missing from n8n**: mark `archived: true`
   - **New in n8n**: add full entry with `archived: false`
   - **Never delete** archived entries
5. Write updated metadata.json

### What sync does NOT do

- Does not sync workflow node definitions (separate operation)
- Does not deploy or activate workflows
- Does not modify webhookPath (managed by deploy/promote)

## Service Layer

`n8n/lib/metadata.js` is updated to traverse the tree for lookups. Public interface (`getWorkflow`, `getWorkflowEnv`, etc.) stays the same — internal traversal changes. Existing deploy/promote/backup/activate services are unchanged.

New helpers added:
- `findWorkflowBySlugAndEnv(slug, env)` — tree traversal returning workflow entry + folder context
- `findAllWorkflows()` — flat list of all non-archived workflow entries with their env context
- `getFolderTree()` — returns full folder hierarchy

## Platform Display

- Workflows page reads from hierarchical metadata.json
- Shows folder tree: parent → agent folders → env folders → workflows
- Sync button calls `POST /api/sync` and refreshes the view
- Archived workflows shown with visual indicator (not removed)
- No longer shows untracked/external workflows from the n8n instance

## New n8n API Client Methods

- `getFolders(projectId)` — `GET /folders?projectId=...`
- `getProject(projectId)` — `GET /projects/{id}`

## Files Changed

| File | Change |
|---|---|
| `n8n/workflows/metadata.json` | Full restructure to hierarchical format |
| `n8n/lib/metadata.js` | Update helpers to traverse tree; add new helpers |
| `n8n/lib/n8n-client.js` | Add `getFolders`, `getProject` methods |
| `n8n/services/sync.js` | New — implements sync logic |
| `src/app/api/sync/route.ts` | New — `POST /api/sync` route |
| `src/app/workflows/page.tsx` | Update to render folder tree + Sync button |
