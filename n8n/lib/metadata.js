/**
 * Metadata helper — reads/writes metadata.json and resolves
 * sub-workflow IDs per environment.
 *
 * Structure:
 *   metadata.sub_workflows.<slug>.<env>.n8nId   — shared sub-workflow IDs
 *   metadata.<workflow-slug>.<env>.n8nId         — main workflow IDs
 *   metadata.<workflow-slug>.uses_sub_workflows  — list of sub-workflow slugs used
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

/**
 * Get the metadata entry for a main workflow slug (e.g. "case-study-creator").
 * Excludes the top-level "sub_workflows" key.
 */
function getWorkflow(slug) {
  const meta = readMetadata();
  if (slug === 'sub_workflows') {
    throw new Error('"sub_workflows" is a reserved key, not a workflow slug');
  }
  const entry = meta[slug];
  if (!entry) {
    throw new Error(`Workflow "${slug}" not found in metadata.json`);
  }
  return entry;
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
 * Get the top-level sub_workflows section.
 */
function getSubWorkflows() {
  const meta = readMetadata();
  return meta.sub_workflows || {};
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
 * Returns the n8nId string or null if not found / still a TODO placeholder.
 */
function resolveSubWorkflowId(subSlug, env) {
  const sub = getSubWorkflow(subSlug);
  const envBlock = sub[env];
  if (!envBlock) return null;
  if (envBlock.n8nId && envBlock.n8nId.startsWith('TODO')) return null;
  return envBlock.n8nId;
}

/**
 * Build a map of source-env sub-workflow n8n IDs → target-env n8n IDs.
 * Considers all sub-workflows referenced by a given main workflow slug.
 * Used by env-remap to swap IDs in executeWorkflow nodes.
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
 * Update a specific field in a main workflow's env block and persist.
 */
function updateWorkflowEnv(slug, env, updates) {
  const meta = readMetadata();
  if (!meta[slug]) {
    throw new Error(`Workflow "${slug}" not found in metadata.json`);
  }
  if (!meta[slug][env]) {
    meta[slug][env] = {};
  }
  Object.assign(meta[slug][env], updates);
  writeMetadata(meta);
}

/**
 * Update a specific field in a sub-workflow's env block and persist.
 */
function updateSubWorkflowEnv(subSlug, env, updates) {
  const meta = readMetadata();
  if (!meta.sub_workflows?.[subSlug]) {
    throw new Error(`Sub-workflow "${subSlug}" not found in metadata.json`);
  }
  if (!meta.sub_workflows[subSlug][env]) {
    meta.sub_workflows[subSlug][env] = {};
  }
  Object.assign(meta.sub_workflows[subSlug][env], updates);
  writeMetadata(meta);
}

/**
 * Return all main workflow slugs (excludes "sub_workflows" key).
 */
function listWorkflowSlugs() {
  const meta = readMetadata();
  return Object.keys(meta).filter(k => k !== 'sub_workflows');
}

/**
 * Return all sub-workflow slugs.
 */
function listSubWorkflowSlugs() {
  return Object.keys(getSubWorkflows());
}

/**
 * Check metadata for any remaining TODO placeholders and return them.
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
  findTodoPlaceholders
};
