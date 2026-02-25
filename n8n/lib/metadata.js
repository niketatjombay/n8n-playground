/**
 * Metadata helper — reads/writes metadata.json and resolves workflow data
 * from the hierarchical folder tree.
 *
 * New structure:
 *   metadata.project_id / project_name — top-level project info
 *   metadata.folders[].folders[].folders[].workflows[] — nested tree
 *   Each workflow entry: { n8nId, slug, type, environment (via parent folder), ... }
 *
 * Public API is unchanged from the old flat format so all existing callers work.
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
 * Collect all workflow entries from the tree as a flat list with context.
 * Returns: Array<{ entry, env, envFolderId }>
 */
function collectAllWorkflows(meta) {
  const results = [];

  function walk(folders, env) {
    for (const folder of (folders || [])) {
      const folderEnv = folder.environment || env;
      for (const wf of (folder.workflows || [])) {
        results.push({
          entry: wf,
          env: folderEnv,
          envFolderId: folder.folder_id
        });
      }
      walk(folder.folders, folderEnv);
    }
  }

  walk(meta.folders, null);
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
  const matches = collectAllWorkflows(meta).filter(
    ({ entry }) => entry.slug === slug && entry.type !== 'sub'
  );

  if (matches.length === 0) {
    throw new Error(`Workflow "${slug}" not found in metadata.json`);
  }

  const first = matches[0].entry;
  const result = {
    description: first.description || null,
    uses_sub_workflows: first.uses_sub_workflows || [],
    input: first.input || null
  };

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
 */
function getSubWorkflows() {
  const meta = readMetadata();
  const subs = collectAllWorkflows(meta).filter(({ entry }) => entry.type === 'sub');

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
 * Build source->target sub-workflow ID map for env remapping.
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
  const seen = new Set();
  for (const { entry } of collectAllWorkflows(meta)) {
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
 * Return the full folder tree (new helper used by the UI and list-workflows service).
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
