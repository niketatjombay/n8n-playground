# Unified Folder Tree Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Merge `production_folders` into the main `folders` tree in `metadata.json` and update all services + UI to use the single unified tree rooted at folder `KGg3wvRmKtMMmlIv`.

**Architecture:** `metadata.json` currently keeps production workflows in a separate flat `production_folders` array. After this change, production workflows sit under a "production" environment-folder inside each workflow-name-group in the main `folders` tree — matching the existing dev/staging pattern. Services and UI are simplified by removing all `production_folders` handling.

**Tech Stack:** Node.js (migration script), Next.js/React/TypeScript (UI), Tailwind CSS 4.

---

## Context: Current metadata.json structure

The main `folders` tree (rooted at `KGg3wvRmKtMMmlIv`) has this 3-level pattern:
```
KGg3wvRmKtMMmlIv
  └── <workflow-name> (virtual, folder_id: null)
        ├── development (folder_id: <id>, environment: "development") → [workflow entries]
        └── staging     (folder_id: <id>, environment: "staging")    → [workflow entries]
```

`production_folders` is a separate flat array:
```
[
  { folder_id: "KFGT2bzbDxqr0EVv", folder_name: "pre-work-summary", environment: "production", workflows: [...] },
  ...7 entries total
]
```

After this change, each workflow-name-group gets a third child:
```
        └── production  (folder_id: <id>, environment: "production") → [workflow entries]
```

And `production_folders` is deleted from metadata.json.

---

### Task 1: Migrate metadata.json via a script

This is the most important step — data migration. Write and run a one-time migration script.

**Files:**
- Create: `scripts/migrate-unified-folders.js`
- Modify: `n8n/workflows/metadata.json` (output of running the script)

**Step 1: Write the migration script**

Create `scripts/migrate-unified-folders.js`:

```js
#!/usr/bin/env node
/**
 * One-time migration: moves production_folders into the main folders tree.
 * Each production entry becomes a "production" environment-folder under the
 * matching workflow-name-group in folders[0].folders.
 */
const fs = require('fs');
const path = require('path');

const META_PATH = path.join(__dirname, '../n8n/workflows/metadata.json');
const meta = JSON.parse(fs.readFileSync(META_PATH, 'utf8'));

const prodFolders = meta.production_folders || [];
if (prodFolders.length === 0) {
  console.log('No production_folders to migrate.');
  process.exit(0);
}

// Build lookup: workflow-name-group slug → production folder entry
const prodByName = {};
for (const pf of prodFolders) {
  prodByName[pf.folder_name] = pf;
}

// Walk the main tree; for each workflow-name-group, add the production env-folder
function addProductionFolders(folders) {
  for (const folder of (folders || [])) {
    if (folder.environment === null && folder.folder_id === null) {
      // This is a workflow-name-group (virtual folder)
      const prod = prodByName[folder.folder_name];
      if (prod) {
        const alreadyHasProd = (folder.folders || []).some(f => f.environment === 'production');
        if (!alreadyHasProd) {
          folder.folders = folder.folders || [];
          folder.folders.push({
            folder_id: prod.folder_id,
            folder_name: 'production',
            environment: 'production',
            folders: [],
            workflows: prod.workflows || []
          });
          console.log(`  Added production folder to: ${folder.folder_name} (folder_id: ${prod.folder_id})`);
        } else {
          console.log(`  Already has production: ${folder.folder_name} (skipped)`);
        }
      } else {
        console.log(`  No production entry for: ${folder.folder_name}`);
      }
    }
    addProductionFolders(folder.folders);
  }
}

console.log('Migrating production_folders into main tree...');
addProductionFolders(meta.folders);

// Remove production_folders and production_project_id
delete meta.production_folders;
delete meta.production_project_id;

fs.writeFileSync(META_PATH, JSON.stringify(meta, null, 2) + '\n');
console.log('\nDone. metadata.json updated.');
console.log('production_folders and production_project_id removed.');
```

**Step 2: Run the script**

```bash
node scripts/migrate-unified-folders.js
```

Expected output:
```
Migrating production_folders into main tree...
  Added production folder to: pre-work-summary (folder_id: KFGT2bzbDxqr0EVv)
  Added production folder to: session-slides (folder_id: jsqMCrJc7HVWluaL)
  Added production folder to: case-study-creator (folder_id: RatBUwE0G8nbgnwa)
  Added production folder to: document-summary-extractor (folder_id: 4JLkQmhzFV2M76tX)
  Added production folder to: project-memory-updater (folder_id: 4JLkQmhzFV2M76tX)
  Added production folder to: llm-sub-workflow (folder_id: 4JLkQmhzFV2M76tX)
  Added production folder to: drive-utils (folder_id: 4JLkQmhzFV2M76tX)

Done. metadata.json updated.
production_folders and production_project_id removed.
```

**Step 3: Verify the structure**

```bash
node -e "
const m = require('./n8n/workflows/metadata.json');
console.log('production_folders exists:', 'production_folders' in m);
console.log('production_project_id exists:', 'production_project_id' in m);
m.folders[0].folders.forEach(g => {
  const envs = g.folders.map(f => f.environment);
  console.log(g.folder_name + ':', envs.join(', '));
});
"
```

Expected output:
```
production_folders exists: false
production_project_id exists: false
pre-work-summary: development, staging, production
session-slides: development, staging, production
case-study-creator: development, staging, production
document-summary-extractor: development, staging, production
project-memory-updater: development, staging, production
llm-sub-workflow: development, staging, production
drive-utils: development, staging, production
```

**Step 4: Commit**

```bash
git add scripts/migrate-unified-folders.js n8n/workflows/metadata.json
git commit -m "feat: migrate production_folders into unified folders tree"
```

---

### Task 2: Update `n8n/lib/metadata.js`

Remove all references to `production_folders`. Three lines to delete.

**Files:**
- Modify: `n8n/lib/metadata.js`

**Step 1: Remove `production_folders` walk from `collectAllWorkflows`**

In `n8n/lib/metadata.js`, find the `collectAllWorkflows` function (around line 35–55). It currently ends with:
```js
  walk(meta.folders, null);
  walk(meta.production_folders || [], 'production');
  return results;
```

Change it to:
```js
  walk(meta.folders, null);
  return results;
```

**Step 2: Remove `production_folders` fallback from `updateWorkflowEnv`**

Find `updateWorkflowEnv` (around line 220–244). It currently ends with:
```js
  walk(meta.folders);
  if (!found) walk(meta.production_folders || []);
  if (!found) throw new Error(`Workflow "${slug}" not found for env "${env}"`);
```

Change to:
```js
  walk(meta.folders);
  if (!found) throw new Error(`Workflow "${slug}" not found for env "${env}"`);
```

**Step 3: Remove `production_folders` fallback from `updateSubWorkflowEnv`**

Find `updateSubWorkflowEnv` (around line 249–273). It currently ends with:
```js
  walk(meta.folders);
  if (!found) walk(meta.production_folders || []);
  if (!found) throw new Error(`Sub-workflow "${subSlug}" not found for env "${env}"`);
```

Change to:
```js
  walk(meta.folders);
  if (!found) throw new Error(`Sub-workflow "${subSlug}" not found for env "${env}"`);
```

**Step 4: Verify with node**

```bash
node -e "
const { getWorkflow } = require('./n8n/lib/metadata');
const wf = getWorkflow('pre-work-summary');
console.log('development n8nId:', wf.development?.n8nId);
console.log('staging n8nId:', wf.staging?.n8nId);
console.log('production n8nId:', wf.production?.n8nId);
"
```

Expected:
```
development n8nId: CBaqe4Yykxf5ba57WJHPr
staging n8nId: PDjuao8X0zSNWvvN
production n8nId: utFKJbzCl6GrA7en
```

**Step 5: Commit**

```bash
git add n8n/lib/metadata.js
git commit -m "refactor: remove production_folders references from metadata.js"
```

---

### Task 3: Update `n8n/services/list-workflows.js`

Simplify the return value — no more `production_project_id` or `production_folders`.

**Files:**
- Modify: `n8n/services/list-workflows.js`

**Step 1: Update `listWorkflows` return**

Current return (around line 34–42):
```js
  return {
    project_id: meta.project_id,
    project_name: meta.project_name,
    production_project_id: meta.production_project_id,
    folders: meta.folders || [],
    production_folders: meta.production_folders || [],
    instancesByEnv: getInstancesByEnv(),
  };
```

Replace with:
```js
  return {
    project_id: meta.project_id,
    project_name: meta.project_name,
    folders: meta.folders || [],
    instancesByEnv: getInstancesByEnv(),
  };
```

**Step 2: Verify**

```bash
node -e "
require('./n8n/lib/env-loader').loadEnv();
const { listWorkflows } = require('./n8n/services/list-workflows');
listWorkflows().then(d => {
  console.log('project_id:', d.project_id);
  console.log('has production_folders:', 'production_folders' in d);
  console.log('folders count:', d.folders.length);
});
"
```

Expected:
```
project_id: JIV2elLHsVFXybZ2
has production_folders: false
folders count: 1
```

**Step 3: Commit**

```bash
git add n8n/services/list-workflows.js
git commit -m "refactor: simplify list-workflows — remove production_folders"
```

---

### Task 4: Update `n8n/services/sync.js`

The unified tree now contains production env-folders, so `walkWorkflows(meta.folders, reconcile)` will visit them automatically. Remove the separate `production_folders` walk. Also fix the `fetchLiveLookup` call for production to use `meta.project_id` (since `production_project_id` is gone).

**Files:**
- Modify: `n8n/services/sync.js`

**Step 1: Fix the production `fetchLiveLookup` call**

Find (around line 85):
```js
  const productionLookup = await fetchLiveLookup('production', meta.production_project_id, errors);
```

Replace with:
```js
  const productionLookup = await fetchLiveLookup('production', meta.project_id, errors);
```

**Step 2: Remove the separate `production_folders` walk**

Find (around line 107):
```js
  walkWorkflows(meta.folders, reconcile);
  walkWorkflows(meta.production_folders || [], reconcile, 'production');
```

Replace with:
```js
  walkWorkflows(meta.folders, reconcile);
```

**Step 3: Commit**

```bash
git add n8n/services/sync.js
git commit -m "refactor: remove production_folders walk from sync — unified tree handles it"
```

---

### Task 5: Update `app/workflows/page.tsx`

Replace the two-section UI ("Dev & Staging" + "Production") with a single unified `FolderTree`. The `instancesByEnv` prop is still used to show instance hostnames next to environment badges on leaf folders.

**Files:**
- Modify: `app/workflows/page.tsx`

**Step 1: Update the `WorkflowsData` interface**

Current interface (around line 25–33):
```typescript
interface WorkflowsData {
  project_id: string;
  project_name: string;
  production_project_id: string | null;
  folders: FolderNode[];
  production_folders: FolderNode[];
  instancesByEnv: Record<string, string | null>;
}
```

Replace with:
```typescript
interface WorkflowsData {
  project_id: string;
  project_name: string;
  folders: FolderNode[];
  instancesByEnv: Record<string, string | null>;
}
```

**Step 2: Replace the two-section rendering with one unified tree**

The current return JSX (around line 191–227) renders two separate `<div>` sections for dev/staging and production. Replace the entire `{!loading && !error && data && (...)}` block with:

```tsx
      {!loading && !error && data && (
        <div className="mt-6">
          {data.folders.map(folder => (
            <FolderTree
              key={folder.folder_id ?? folder.folder_name}
              folder={folder}
              depth={0}
              instancesByEnv={data.instancesByEnv}
            />
          ))}
        </div>
      )}
```

**Step 3: Verify the build has no TypeScript errors**

```bash
npm run build 2>&1 | tail -20
```

Expected: build completes without TypeScript errors.

**Step 4: Start dev server and visually verify**

```bash
npm run dev
```

Open http://localhost:3001/workflows in browser. Confirm:
- One unified folder tree (no "Dev & Staging" / "Production" split)
- "Workflows" top-level folder expands to show workflow-name groups
- Each workflow-name group has development, staging, production sub-folders
- Environment badges (blue/yellow/green) still appear on env-leaf folders

**Step 5: Commit**

```bash
git add app/workflows/page.tsx
git commit -m "feat: unified workflows UI — single folder tree, remove production split"
```
