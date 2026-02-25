# Hierarchical Metadata + Sync Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Restructure metadata.json to mirror the n8n folder hierarchy (project → folders → sub-folders → workflows) and add a Sync button that reconciles metadata with live n8n state.

**Architecture:** The n8n folder tree is fetched once (on Sync) and written to metadata.json. All existing services (deploy, promote, backup) continue to work via updated metadata.js helpers that traverse the tree using the same public interface. The Workflows UI shows the folder tree instead of the previous flat/grouped list.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Node.js services (CommonJS), n8n REST API v1

---

## Context

**Project ID (fixed):** `JIV2elLHsVFXybZ2`
**Parent folder ID (fixed):** `KGg3wvRmKtMMmlIv`

**Current metadata.json** is flat — top-level keys are workflow slugs plus a `sub_workflows` block.

**New metadata.json** is hierarchical:
```json
{
  "project_id": "JIV2elLHsVFXybZ2",
  "project_name": "...",
  "folders": [
    {
      "folder_id": "KGg3wvRmKtMMmlIv",
      "folder_name": "...",
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
                  "type": "main",
                  "webhookPath": "/development/case-study-creator",
                  "active": true,
                  "lastDeployedAt": "2026-02-10T01:53:08.826Z",
                  "archived": false,
                  "description": "...",
                  "uses_sub_workflows": ["llm-sub-workflow", "drive-utils"]
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

**Environment detection:** env folders have a `folder_name` matching `development`/`staging`/`production` (case-insensitive) OR an explicit `environment` field set during sync.

**Backward compatibility:** `n8n/lib/metadata.js` helpers (`getWorkflow`, `getWorkflowEnv`, etc.) keep the **same signature** — only their internal implementation changes to traverse the tree.

---

## Task 1: Add folder and project API methods to N8nClient

**Files:**
- Modify: `n8n/lib/n8n-client.js:36-110`

**Step 1: Add three new methods after the existing `getAllWorkflows` method**

Open `n8n/lib/n8n-client.js` and add after line 39 (after `getAllWorkflows`):

```js
// List all folders for a project
async getFolders(projectId) {
  const params = new URLSearchParams({ projectId });
  return this.request(`/folders?${params}`);
}

// Get a single project by ID
async getProject(projectId) {
  return this.request(`/projects/${projectId}`);
}

// List all workflows filtered by project
async getWorkflowsByProject(projectId) {
  const params = new URLSearchParams({ projectId });
  return this.request(`/workflows?${params}`);
}
```

**Step 2: Verify the n8n API supports these endpoints**

```bash
# From the project root — check what endpoints n8n exposes
node -e "
const { loadEnv } = require('./n8n/lib/env-loader');
loadEnv();
const N8nClient = require('./n8n/lib/n8n-client');
const c = new N8nClient();

// Test folders endpoint
c.getFolders('JIV2elLHsVFXybZ2')
  .then(r => console.log('FOLDERS:', JSON.stringify(r, null, 2)))
  .catch(e => console.error('FOLDERS ERROR:', e.message));

// Test project endpoint
c.getProject('JIV2elLHsVFXybZ2')
  .then(r => console.log('PROJECT:', JSON.stringify(r, null, 2)))
  .catch(e => console.error('PROJECT ERROR:', e.message));

// Test filtered workflows
c.getWorkflowsByProject('JIV2elLHsVFXybZ2')
  .then(r => console.log('WORKFLOWS COUNT:', r.data?.length, 'First:', JSON.stringify(r.data?.[0], null, 2)))
  .catch(e => console.error('WORKFLOWS ERROR:', e.message));
"
```

Expected: You'll see JSON for folders (array with `id`, `name`, `parentFolderId`, `projectId`) and project (with `id`, `name`), and workflows (array with `id`, `name`, `folderId` or `parentFolderId`).

> **IMPORTANT:** If the response shape differs (e.g. folders have `parent_folder_id` instead of `parentFolderId`, or workflows have `projectFolderId`), note the actual field names — you'll need them in Task 2.

**Step 3: Commit**

```bash
git add n8n/lib/n8n-client.js
git commit -m "feat: add getFolders, getProject, getWorkflowsByProject to N8nClient"
```

---

## Task 2: Create sync service

**Files:**
- Create: `n8n/services/sync.js`

This service fetches the live folder + workflow tree from n8n and merges it into metadata.json.

**Step 1: Create `n8n/services/sync.js`**

```js
/**
 * Sync service — reconciles metadata.json with live n8n folder/workflow state.
 *
 * What sync does:
 *   - Fetches project name, folder tree, and workflows from n8n API
 *   - Builds a hierarchical metadata.json mirroring the n8n folder structure
 *   - Preserves: webhookPath, lastDeployedAt, description, uses_sub_workflows, input
 *   - Updates: name, active (from live state)
 *   - Marks archived: true for entries no longer found in n8n
 *   - Adds new entries for folders/workflows not yet in metadata
 *
 * What sync does NOT do:
 *   - Does not deploy or activate workflows
 *   - Does not sync workflow node definitions
 */

const { loadEnv } = require('../lib/env-loader');
const N8nClient = require('../lib/n8n-client');
const { readMetadata, writeMetadata } = require('../lib/metadata');

const PROJECT_ID = 'JIV2elLHsVFXybZ2';
const PARENT_FOLDER_ID = 'KGg3wvRmKtMMmlIv';
const ENV_NAMES = ['development', 'staging', 'production'];

/**
 * Detect environment from a folder name.
 * Returns 'development' | 'staging' | 'production' | null
 */
function detectEnvironment(folderName) {
  const lower = folderName.toLowerCase();
  if (lower.includes('dev')) return 'development';
  if (lower.includes('stag') || lower.includes('stg')) return 'staging';
  if (lower.includes('prod')) return 'production';
  return null;
}

/**
 * Build a nested folder tree from a flat array of folder objects.
 * @param {Array} folders - flat list from n8n API, each with { id, name, parentFolderId }
 * @param {string} parentId - start from this parent
 * @returns {Array} nested folder nodes
 */
function buildFolderTree(folders, parentId) {
  return folders
    .filter(f => (f.parentFolderId || f.parent_folder_id || null) === parentId)
    .map(f => ({
      folder_id: f.id,
      folder_name: f.name,
      environment: detectEnvironment(f.name),
      folders: buildFolderTree(folders, f.id),
      workflows: []
    }));
}

/**
 * Build a lookup: n8nId -> existing workflow entry from current metadata.
 * Used to preserve user-managed fields on re-sync.
 */
function buildExistingWorkflowLookup(meta) {
  const lookup = {};

  function walkFolders(folders) {
    for (const folder of (folders || [])) {
      for (const wf of (folder.workflows || [])) {
        if (wf.n8nId) lookup[wf.n8nId] = wf;
      }
      walkFolders(folder.folders);
    }
  }

  walkFolders(meta.folders);
  return lookup;
}

/**
 * Mark all existing workflow entries as archived (will be un-archived if found in live sync).
 */
function markAllArchived(folders) {
  for (const folder of (folders || [])) {
    for (const wf of (folder.workflows || [])) {
      wf.archived = true;
    }
    markAllArchived(folder.folders);
  }
}

/**
 * Derive a slug from a workflow name by stripping env prefixes and converting to kebab-case.
 * e.g. "[DEV] Case Study Creator" -> "case-study-creator"
 */
function deriveSlug(name) {
  return name
    .replace(/^\[(DEV|STG|PROD|STAGING|PRODUCTION)\]\s*/i, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Main sync function.
 * @returns {{ added: number, updated: number, archived: number, folders: number }}
 */
async function sync() {
  loadEnv();
  const client = new N8nClient();

  // 1. Fetch project name
  let projectName = PROJECT_ID;
  try {
    const project = await client.getProject(PROJECT_ID);
    projectName = project.name || PROJECT_ID;
  } catch {
    // project endpoint may not be available — use ID as fallback
  }

  // 2. Fetch all folders for the project
  const foldersResult = await client.getFolders(PROJECT_ID);
  const allFolders = foldersResult.data || foldersResult || [];

  // 3. Fetch all workflows for the project
  const workflowsResult = await client.getWorkflowsByProject(PROJECT_ID);
  const allWorkflows = workflowsResult.data || [];

  // 4. Load existing metadata to preserve user-managed fields
  let existingMeta;
  try {
    existingMeta = readMetadata();
  } catch {
    existingMeta = { project_id: PROJECT_ID, project_name: projectName, folders: [] };
  }

  const existingLookup = buildExistingWorkflowLookup(existingMeta);

  // 5. Build folder tree rooted at PARENT_FOLDER_ID
  const tree = buildFolderTree(allFolders, PARENT_FOLDER_ID);

  // Include the parent folder itself if it exists in allFolders
  const parentFolder = allFolders.find(f => f.id === PARENT_FOLDER_ID);
  const rootNode = {
    folder_id: PARENT_FOLDER_ID,
    folder_name: parentFolder?.name || 'Workflows',
    environment: null,
    folders: tree,
    workflows: []
  };

  // 6. Mark all existing entries as archived (will be revived if found in live data)
  markAllArchived(existingMeta.folders);

  // 7. Build a flat folder lookup for quick access: folder_id -> folderNode
  const folderLookup = {};
  function indexFolders(folders) {
    for (const f of (folders || [])) {
      folderLookup[f.folder_id] = f;
      indexFolders(f.folders);
    }
  }
  indexFolders([rootNode]);

  // 8. Place each workflow into its folder node
  let added = 0, updated = 0, archived = 0;

  for (const wf of allWorkflows) {
    // n8n may use folderId or parentFolderId depending on version
    const folderId = wf.folderId || wf.parentFolderId || wf.folder_id || null;
    if (!folderId) continue; // skip workflows not in any folder

    const folderNode = folderLookup[folderId];
    if (!folderNode) continue; // not under our parent folder — skip

    const existing = existingLookup[wf.id];
    const slug = existing?.slug || deriveSlug(wf.name);

    if (existing) {
      // Update live fields, preserve user-managed fields
      existing.name = wf.name;
      existing.active = wf.active;
      existing.archived = false;
      // Re-attach to correct folder node (in case it moved)
      if (!folderNode.workflows.find(w => w.n8nId === wf.id)) {
        folderNode.workflows.push(existing);
      }
      updated++;
    } else {
      // New workflow — add with defaults
      const newEntry = {
        n8nId: wf.id,
        name: wf.name,
        slug,
        type: 'main', // default; sub-workflows can be identified by naming convention
        webhookPath: null,
        active: wf.active,
        lastDeployedAt: null,
        archived: false
      };
      folderNode.workflows.push(newEntry);
      added++;
    }
  }

  // 9. Count archived
  function countArchived(folders) {
    let count = 0;
    for (const f of (folders || [])) {
      for (const wf of (f.workflows || [])) {
        if (wf.archived) count++;
      }
      count += countArchived(f.folders);
    }
    return count;
  }
  archived = countArchived([rootNode]);

  // 10. Write new metadata
  const newMeta = {
    project_id: PROJECT_ID,
    project_name: projectName,
    folders: [rootNode]
  };
  writeMetadata(newMeta);

  return {
    added,
    updated,
    archived,
    folders: allFolders.filter(f => {
      const pid = f.parentFolderId || f.parent_folder_id || null;
      return pid === PARENT_FOLDER_ID || f.id === PARENT_FOLDER_ID;
    }).length
  };
}

module.exports = { sync };
```

**Step 2: Test the sync service manually**

```bash
node -e "
const { loadEnv } = require('./n8n/lib/env-loader');
loadEnv();
const { sync } = require('./n8n/services/sync');
sync().then(r => console.log('Sync result:', r)).catch(e => console.error('Error:', e));
"
```

Expected output: `Sync result: { added: N, updated: N, archived: N, folders: N }`

Then inspect the new metadata.json:
```bash
node -e "console.log(JSON.stringify(require('./n8n/workflows/metadata.json'), null, 2))" | head -80
```

Verify: `project_id`, `project_name`, `folders` array with nested structure.

> **If the n8n API returns a different field name for `parentFolderId`** (e.g. `parent_folder_id`, `parentId`), update `buildFolderTree` and the workflow placement code accordingly. Run the test again.

**Step 3: Commit**

```bash
git add n8n/services/sync.js
git commit -m "feat: add sync service to reconcile metadata with n8n folder hierarchy"
```

---

## Task 3: Run initial sync and commit new metadata.json

**Step 1: Back up current metadata.json**

```bash
cp n8n/workflows/metadata.json n8n/workflows/metadata.json.bak
```

**Step 2: Run sync**

```bash
node -e "
const { loadEnv } = require('./n8n/lib/env-loader');
loadEnv();
const { sync } = require('./n8n/services/sync');
sync().then(r => {
  console.log('Sync complete:', r);
}).catch(e => {
  console.error('Sync failed:', e);
  process.exit(1);
});
"
```

**Step 3: Inspect the result**

```bash
node -e "
const meta = require('./n8n/workflows/metadata.json');
console.log('project_id:', meta.project_id);
console.log('project_name:', meta.project_name);
console.log('top-level folders:', meta.folders.length);

// Walk and print all workflows
function walkFolders(folders, depth) {
  for (const f of folders) {
    console.log(' '.repeat(depth*2) + f.folder_name + ' (' + f.folder_id + ')' + (f.environment ? ' [' + f.environment + ']' : ''));
    for (const wf of (f.workflows || [])) {
      console.log(' '.repeat((depth+1)*2) + '- ' + wf.name + ' slug=' + wf.slug + ' active=' + wf.active + ' archived=' + wf.archived);
    }
    walkFolders(f.folders || [], depth + 1);
  }
}
walkFolders(meta.folders, 0);
"
```

Expected: You should see the folder tree with all known workflows, each with a `slug`, `active` status, and `archived: false`.

**Step 4: Fix slugs and types if needed**

If any workflow entries have wrong `slug` or `type`, manually edit `n8n/workflows/metadata.json` to correct them. Sub-workflows (llm-sub-workflow, drive-utils) should have `type: "sub"`.

**Step 5: Add missing fields for service compatibility**

For workflows used by the deploy/promote services, make sure each entry has:
- `slug` — kebab-case identifier
- `webhookPath` — copy from the `.bak` file if known
- `lastDeployedAt` — copy from `.bak`
- `uses_sub_workflows` — copy from `.bak` (for main workflows)
- `description` — copy from `.bak`

You can do this with a one-time migration script:

```bash
node -e "
const fs = require('fs');
const path = require('path');

const newMeta = JSON.parse(fs.readFileSync('n8n/workflows/metadata.json', 'utf8'));
const oldMeta = JSON.parse(fs.readFileSync('n8n/workflows/metadata.json.bak', 'utf8'));

// Build slug -> old metadata map
const oldBySlug = {};
for (const [key, val] of Object.entries(oldMeta)) {
  if (key !== 'sub_workflows') oldBySlug[key] = val;
}
const oldSubsBySlug = oldMeta.sub_workflows || {};

function patchWorkflow(wf) {
  const slug = wf.slug;
  const old = oldBySlug[slug] || oldSubsBySlug[slug];
  if (!old) return;

  // Environment-specific fields: find env from parent folder, then patch from old env block
  // (env is determined by the calling context, not the workflow entry itself)
  if (!wf.description && old.description) wf.description = old.description;
  if (!wf.uses_sub_workflows && old.uses_sub_workflows) wf.uses_sub_workflows = old.uses_sub_workflows;
  if (!wf.input && old.input) wf.input = old.input;
  if (old.used_by) wf.used_by = old.used_by;
  if (wf.type === 'main' && oldSubsBySlug[slug]) wf.type = 'sub';
}

function patchWorkflowWithEnv(wf, env) {
  const slug = wf.slug;
  const old = oldBySlug[slug] || oldSubsBySlug[slug];
  if (!old) return;

  const envBlock = old[env];
  if (!envBlock) return;
  if (!wf.webhookPath && envBlock.webhookPath) wf.webhookPath = envBlock.webhookPath;
  if (!wf.lastDeployedAt && envBlock.lastDeployedAt) wf.lastDeployedAt = envBlock.lastDeployedAt;
}

function walkFolders(folders) {
  for (const folder of (folders || [])) {
    for (const wf of (folder.workflows || [])) {
      patchWorkflow(wf);
      if (folder.environment) patchWorkflowWithEnv(wf, folder.environment);
    }
    walkFolders(folder.folders);
  }
}

walkFolders(newMeta.folders);
fs.writeFileSync('n8n/workflows/metadata.json', JSON.stringify(newMeta, null, 2) + '\n');
console.log('Patched metadata.json with fields from backup.');
"
```

**Step 6: Verify the patched result**

```bash
node -e "
const meta = require('./n8n/workflows/metadata.json');
function walkFolders(folders) {
  for (const f of (folders || [])) {
    for (const wf of (f.workflows || [])) {
      console.log(wf.slug, '|', f.environment || 'no-env', '| webhook:', wf.webhookPath, '| deployed:', wf.lastDeployedAt);
    }
    walkFolders(f.folders);
  }
}
walkFolders(meta.folders);
"
```

Expected: workflows show their webhookPaths and lastDeployedAt values from the old metadata.

**Step 7: Commit**

```bash
git add n8n/workflows/metadata.json
git commit -m "feat: restructure metadata.json to hierarchical folder tree"
```

---

## Task 4: Update metadata.js helpers to traverse the tree

**Files:**
- Modify: `n8n/lib/metadata.js` (full rewrite)

The public API stays identical. Internal implementation uses tree traversal.

**Step 1: Replace entire content of `n8n/lib/metadata.js`**

```js
/**
 * Metadata helper — reads/writes metadata.json and resolves workflow data
 * from the hierarchical folder tree.
 *
 * Structure:
 *   metadata.project_id / project_name — top-level project info
 *   metadata.folders[].folders[].folders[].workflows[] — nested tree
 *   Each workflow entry: { n8nId, slug, type, environment (via parent folder), ... }
 *
 * Public API is unchanged from the old flat format.
 */

const fs = require('fs');
const path = require('path');

const METADATA_PATH = path.join(process.cwd(), 'n8n', 'workflows', 'metadata.json');

function readMetadata() {
  const raw = fs.readFileSync(METADATA_PATH, 'utf8');
  return JSON.parse(raw);
}

function writeMetadata(data) {
  fs.writeFileSync(METADATA_PATH, JSON.stringify(data, null, 2) + '\n');
}

// ---------------------------------------------------------------------------
// Internal tree traversal helpers
// ---------------------------------------------------------------------------

/**
 * Walk all folders recursively, calling visitor(folder, parentEnv) for each.
 */
function walkFolders(folders, visitor, parentEnv = null) {
  for (const folder of (folders || [])) {
    const env = folder.environment || parentEnv;
    visitor(folder, env);
    walkFolders(folder.folders, visitor, env);
  }
}

/**
 * Collect all workflow entries from the tree as flat list with context.
 * Returns: Array<{ entry, env, envFolderId, agentFolderName }>
 */
function collectAllWorkflows(meta) {
  const results = [];
  let currentAgentName = null;

  function walk(folders, depth, env) {
    for (const folder of (folders || [])) {
      const folderEnv = folder.environment || env;
      // depth=1 is direct children of root (agent folders)
      if (depth === 1) currentAgentName = folder.folder_name;

      for (const wf of (folder.workflows || [])) {
        results.push({
          entry: wf,
          env: folderEnv,
          envFolderId: folder.folder_id,
          agentFolderName: currentAgentName
        });
      }
      walk(folder.folders, depth + 1, folderEnv);
    }
  }

  walk(meta.folders, 0, null);
  return results;
}

// ---------------------------------------------------------------------------
// Public read helpers
// ---------------------------------------------------------------------------

/**
 * Get the metadata entry for a main workflow slug.
 * Returns an object matching the old flat format:
 *   { description, uses_sub_workflows, input, development: {...}, staging: {...}, production: {...} }
 */
function getWorkflow(slug) {
  const meta = readMetadata();
  const allWfs = collectAllWorkflows(meta);
  const matches = allWfs.filter(({ entry }) => entry.slug === slug && entry.type !== 'sub');

  if (matches.length === 0) {
    throw new Error(`Workflow "${slug}" not found in metadata.json`);
  }

  // Use first match for top-level fields
  const first = matches[0].entry;
  const result = {
    description: first.description || null,
    uses_sub_workflows: first.uses_sub_workflows || [],
    input: first.input || null
  };

  // Build env blocks
  for (const { entry, env, envFolderId } of matches) {
    if (!env) continue;
    result[env] = {
      n8nId: entry.n8nId,
      project_id: meta.project_id,
      folder_id: envFolderId,
      webhookPath: entry.webhookPath || null,
      active: entry.active || false,
      lastDeployedAt: entry.lastDeployedAt || null
    };
  }

  return result;
}

/**
 * Get the environment-specific block for a main workflow.
 */
function getWorkflowEnv(slug, env) {
  const entry = getWorkflow(slug);
  const envBlock = entry[env];
  if (!envBlock) {
    throw new Error(`Environment "${env}" not found for workflow "${slug}"`);
  }
  return envBlock;
}

/**
 * Get sub-workflows as an object keyed by slug (old format).
 * Reconstructed from tree by collecting entries with type="sub".
 */
function getSubWorkflows() {
  const meta = readMetadata();
  const allWfs = collectAllWorkflows(meta);
  const subs = allWfs.filter(({ entry }) => entry.type === 'sub');

  const result = {};
  for (const { entry, env, envFolderId } of subs) {
    if (!result[entry.slug]) {
      result[entry.slug] = {
        description: entry.description || null,
        used_by: entry.used_by || [],
        api_endpoint: entry.api_endpoint || null,
        nodes: entry.nodes || [],
        input: entry.input || null,
        output: entry.output || null,
        notes: entry.notes || null
      };
    }
    if (env) {
      result[entry.slug][env] = {
        n8nId: entry.n8nId,
        project_id: meta.project_id,
        folder_id: envFolderId
      };
    }
  }
  return result;
}

/**
 * Get a specific sub-workflow entry.
 */
function getSubWorkflow(subSlug) {
  const subs = getSubWorkflows();
  const entry = subs[subSlug];
  if (!entry) {
    throw new Error(`Sub-workflow "${subSlug}" not found in metadata.json sub_workflows`);
  }
  return entry;
}

/**
 * Resolve the n8n ID for a sub-workflow in a given environment.
 */
function resolveSubWorkflowId(subSlug, env) {
  const sub = getSubWorkflow(subSlug);
  const envBlock = sub[env];
  if (!envBlock) return null;
  if (envBlock.n8nId && envBlock.n8nId.startsWith('TODO')) return null;
  return envBlock.n8nId;
}

/**
 * Build source→target sub-workflow ID map for env remapping.
 */
function buildSubWorkflowIdMap(slug, sourceEnv, targetEnv) {
  const entry = getWorkflow(slug);
  const subSlugs = entry.uses_sub_workflows || [];
  const allSubs = getSubWorkflows();

  const idMap = {};
  for (const subSlug of subSlugs) {
    const sub = allSubs[subSlug];
    if (!sub) continue;
    const srcId = sub[sourceEnv]?.n8nId;
    const tgtId = sub[targetEnv]?.n8nId;
    if (srcId && tgtId && !tgtId.startsWith('TODO')) {
      idMap[srcId] = tgtId;
    }
  }
  return idMap;
}

/**
 * List all main workflow slugs (non-sub, non-archived).
 */
function listWorkflowSlugs() {
  const meta = readMetadata();
  const allWfs = collectAllWorkflows(meta);
  const seen = new Set();
  for (const { entry } of allWfs) {
    if (entry.type !== 'sub' && !entry.archived && entry.slug) {
      seen.add(entry.slug);
    }
  }
  return [...seen];
}

/**
 * List all sub-workflow slugs.
 */
function listSubWorkflowSlugs() {
  return Object.keys(getSubWorkflows());
}

/**
 * Return full folder tree (new helper for UI).
 */
function getFolderTree() {
  return readMetadata().folders || [];
}

// ---------------------------------------------------------------------------
// Public write helpers
// ---------------------------------------------------------------------------

/**
 * Update fields in a main workflow's env entry and persist.
 */
function updateWorkflowEnv(slug, env, updates) {
  const meta = readMetadata();
  let found = false;

  function walk(folders) {
    for (const folder of (folders || [])) {
      if (folder.environment === env) {
        for (const wf of (folder.workflows || [])) {
          if (wf.slug === slug && wf.type !== 'sub') {
            Object.assign(wf, updates);
            found = true;
            return;
          }
        }
      }
      walk(folder.folders);
      if (found) return;
    }
  }

  walk(meta.folders);
  if (!found) throw new Error(`Workflow "${slug}" not found for env "${env}"`);
  writeMetadata(meta);
}

/**
 * Update fields in a sub-workflow's env entry and persist.
 */
function updateSubWorkflowEnv(subSlug, env, updates) {
  const meta = readMetadata();
  let found = false;

  function walk(folders) {
    for (const folder of (folders || [])) {
      if (folder.environment === env) {
        for (const wf of (folder.workflows || [])) {
          if (wf.slug === subSlug && wf.type === 'sub') {
            Object.assign(wf, updates);
            found = true;
            return;
          }
        }
      }
      walk(folder.folders);
      if (found) return;
    }
  }

  walk(meta.folders);
  if (!found) throw new Error(`Sub-workflow "${subSlug}" not found for env "${env}"`);
  writeMetadata(meta);
}

/**
 * Check metadata for any remaining TODO placeholders.
 */
function findTodoPlaceholders() {
  const meta = readMetadata();
  const todos = [];

  function walk(obj, pathParts) {
    if (typeof obj === 'string' && obj.startsWith('TODO')) {
      todos.push({ path: pathParts.join('.'), value: obj });
    } else if (obj && typeof obj === 'object') {
      for (const [key, val] of Object.entries(obj)) {
        walk(val, [...pathParts, key]);
      }
    }
  }

  walk(meta, []);
  return todos;
}

module.exports = {
  readMetadata,
  writeMetadata,
  getWorkflow,
  getWorkflowEnv,
  getSubWorkflows,
  getSubWorkflow,
  resolveSubWorkflowId,
  buildSubWorkflowIdMap,
  updateWorkflowEnv,
  updateSubWorkflowEnv,
  listWorkflowSlugs,
  listSubWorkflowSlugs,
  getFolderTree,
  findTodoPlaceholders
};
```

**Step 2: Test all helpers against the new metadata**

```bash
node -e "
const m = require('./n8n/lib/metadata');

// Test listWorkflowSlugs
console.log('Main slugs:', m.listWorkflowSlugs());

// Test listSubWorkflowSlugs
console.log('Sub slugs:', m.listSubWorkflowSlugs());

// Test getWorkflow
const wf = m.getWorkflow('case-study-creator');
console.log('case-study-creator keys:', Object.keys(wf));
console.log('dev n8nId:', wf.development?.n8nId);

// Test getWorkflowEnv
const devEnv = m.getWorkflowEnv('case-study-creator', 'development');
console.log('dev env block:', devEnv);

// Test getSubWorkflow
const sub = m.getSubWorkflow('llm-sub-workflow');
console.log('llm-sub-workflow dev n8nId:', sub.development?.n8nId);

// Test getFolderTree
const tree = m.getFolderTree();
console.log('Root folders:', tree.map(f => f.folder_name));
"
```

Expected: same values as before (matching existing n8nIds), no errors.

**Step 3: Smoke test existing services still work**

```bash
node -e "
const { getStatus } = require('./n8n/services/status');
const status = getStatus();
console.log('Sub-workflows:', status.subWorkflows.map(s => s.slug));
console.log('Main workflows:', status.workflows.map(w => w.slug));
console.log('TODOs:', status.todos.length);
"
```

Expected: same output as before the change.

**Step 4: Commit**

```bash
git add n8n/lib/metadata.js
git commit -m "refactor: update metadata.js helpers to traverse hierarchical folder tree"
```

---

## Task 5: Add `/api/sync` route

**Files:**
- Create: `app/api/sync/route.ts`

**Step 1: Create the route**

```ts
import { NextResponse } from 'next/server';

export async function POST() {
  try {
    const { sync } = require('@/n8n/services/sync');
    const result = await sync();
    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
```

**Step 2: Test via curl**

```bash
curl -s -X POST http://localhost:3001/api/sync | node -e "
const chunks = [];
process.stdin.on('data', c => chunks.push(c));
process.stdin.on('end', () => console.log(JSON.parse(Buffer.concat(chunks).toString())));
"
```

Expected: `{ success: true, data: { added: N, updated: N, archived: N, folders: N } }`

**Step 3: Commit**

```bash
git add app/api/sync/route.ts
git commit -m "feat: add POST /api/sync route"
```

---

## Task 6: Update list-workflows service to use folder tree

**Files:**
- Modify: `n8n/services/list-workflows.js`

The grouped view now reads directly from the folder tree rather than matching n8n API IDs.

**Step 1: Replace `n8n/services/list-workflows.js`**

```js
/**
 * List-workflows service — returns workflow data from the local metadata folder tree.
 * No longer calls the n8n API directly (sync does that instead).
 */

const { getFolderTree, readMetadata } = require('../lib/metadata');

/**
 * List workflows from the local metadata tree.
 *
 * @returns {{
 *   project_id: string,
 *   project_name: string,
 *   folders: Array   (full hierarchical tree with workflows embedded)
 * }}
 */
async function listWorkflows() {
  const meta = readMetadata();
  return {
    project_id: meta.project_id,
    project_name: meta.project_name,
    folders: meta.folders || []
  };
}

module.exports = { listWorkflows };
```

**Step 2: Test**

```bash
node -e "
const { listWorkflows } = require('./n8n/services/list-workflows');
listWorkflows().then(r => {
  console.log('project:', r.project_name);
  console.log('root folders:', r.folders.map(f => f.folder_name));
});
"
```

**Step 3: Commit**

```bash
git add n8n/services/list-workflows.js
git commit -m "refactor: list-workflows service reads from metadata folder tree"
```

---

## Task 7: Replace Workflows page with folder tree + Sync button

**Files:**
- Modify: `app/workflows/page.tsx` (full rewrite)

**Step 1: Replace `app/workflows/page.tsx`**

```tsx
'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiFetch } from '@/lib/api';

interface WorkflowEntry {
  n8nId: string;
  name: string;
  slug: string;
  type: 'main' | 'sub';
  webhookPath: string | null;
  active: boolean;
  lastDeployedAt: string | null;
  archived: boolean;
}

interface FolderNode {
  folder_id: string;
  folder_name: string;
  environment: string | null;
  folders: FolderNode[];
  workflows: WorkflowEntry[];
}

interface WorkflowsData {
  project_id: string;
  project_name: string;
  folders: FolderNode[];
}

const ENV_COLORS: Record<string, string> = {
  development: 'text-blue-400 bg-blue-500/10 border-blue-500/20',
  staging: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  production: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20',
};

function WorkflowRow({ wf }: { wf: WorkflowEntry }) {
  return (
    <div className={`px-4 py-2.5 flex items-center gap-3 text-sm ${wf.archived ? 'opacity-40' : ''}`}>
      <span className={`text-xs px-1.5 py-0.5 rounded border ${
        wf.active ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-zinc-800 text-zinc-500 border-zinc-700'
      }`}>
        {wf.active ? 'active' : 'off'}
      </span>
      <span className="text-zinc-200 flex-1 truncate">{wf.name}</span>
      {wf.archived && <span className="text-xs text-zinc-600 italic">archived</span>}
      {wf.type === 'sub' && <span className="text-xs text-zinc-500">sub</span>}
      <span className="font-mono text-xs text-zinc-600">{wf.n8nId}</span>
    </div>
  );
}

function FolderTree({ folder, depth = 0 }: { folder: FolderNode; depth?: number }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = folder.folders.length > 0 || folder.workflows.length > 0;
  const envClass = folder.environment ? ENV_COLORS[folder.environment] : null;

  return (
    <div className={depth > 0 ? 'ml-4 border-l border-zinc-800 pl-3 mt-1' : ''}>
      <button
        onClick={() => setExpanded(e => !e)}
        className="flex items-center gap-2 py-1.5 text-sm w-full text-left hover:text-zinc-100 transition-colors"
        disabled={!hasChildren}
      >
        <span className="text-zinc-500 text-xs w-3">{hasChildren ? (expanded ? '▾' : '▸') : ' '}</span>
        <span className={`font-medium ${envClass ? 'text-zinc-300' : 'text-zinc-200'}`}>
          {folder.folder_name}
        </span>
        {folder.environment && (
          <span className={`text-xs px-1.5 py-0.5 rounded border ${envClass}`}>
            {folder.environment}
          </span>
        )}
        {folder.workflows.length > 0 && (
          <span className="text-xs text-zinc-600 ml-auto">
            {folder.workflows.filter(w => !w.archived).length} workflow{folder.workflows.filter(w => !w.archived).length !== 1 ? 's' : ''}
          </span>
        )}
      </button>

      {expanded && hasChildren && (
        <div>
          {folder.workflows.length > 0 && (
            <div className="ml-3 border border-zinc-800 rounded-lg overflow-hidden mb-2 divide-y divide-zinc-800/50">
              {folder.workflows.map(wf => (
                <WorkflowRow key={wf.n8nId} wf={wf} />
              ))}
            </div>
          )}
          {folder.folders.map(child => (
            <FolderTree key={child.folder_id} folder={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function WorkflowsPage() {
  const [data, setData] = useState<WorkflowsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncResult, setSyncResult] = useState<string | null>(null);

  const fetchData = useCallback(() => {
    setLoading(true);
    setError(null);
    apiFetch('/api/workflows')
      .then(res => res.json())
      .then(json => {
        if (!json.success) throw new Error(json.error || 'Unknown error');
        setData(json.data);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    setError(null);
    try {
      const res = await apiFetch('/api/sync', { method: 'POST' });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || 'Sync failed');
      const r = json.data;
      setSyncResult(`Synced — ${r.added} added, ${r.updated} updated, ${r.archived} archived`);
      fetchData();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-100">Workflows</h1>
          <p className="text-sm text-zinc-400 mt-1">
            {data ? `${data.project_name} · ${data.project_id}` : 'Loading project...'}
          </p>
        </div>

        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg text-zinc-200 transition-colors disabled:opacity-50"
        >
          {syncing ? 'Syncing...' : 'Sync'}
        </button>
      </div>

      {syncResult && (
        <div className="mt-3 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded-lg px-3 py-2">
          {syncResult}
        </div>
      )}

      {error && (
        <div className="mt-3 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-3 text-sm text-red-400">
          {error}
        </div>
      )}

      {loading && (
        <div className="mt-6 space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-8 bg-zinc-900 border border-zinc-800 rounded animate-pulse" />
          ))}
        </div>
      )}

      {!loading && !error && data && (
        <div className="mt-6">
          {data.folders.map(folder => (
            <FolderTree key={folder.folder_id} folder={folder} depth={0} />
          ))}
        </div>
      )}
    </div>
  );
}
```

**Step 2: Update `/api/workflows` route to return new shape**

The `listWorkflows` service now returns `{ project_id, project_name, folders }` directly. The route at `app/api/workflows/route.ts` already wraps it as `{ success: true, data: ... }` — no changes needed.

**Step 3: Start the dev server and verify**

```bash
npm run dev
```

Open http://localhost:3001/workflows in a browser.

Expected:
- Page shows the project name and ID in the subtitle
- Folder tree renders with parent folder → agent folders → env folders → workflow rows
- Each workflow shows active/off badge, name, archived indicator if applicable
- "Sync" button in top-right triggers sync and shows result message

**Step 4: Commit**

```bash
git add app/workflows/page.tsx
git commit -m "feat: replace workflows page with folder tree and sync button"
```

---

## Done

After all tasks are complete, run a final smoke test:

```bash
# Verify existing services still work
node -e "
const { getStatus } = require('./n8n/services/status');
const s = getStatus();
console.log('workflows:', s.workflows.map(w => w.slug + '/' + Object.keys(s.workflows[0].environments)));
console.log('todos:', s.todos.length);
"
```

```bash
# Verify the app builds
npm run build
```
