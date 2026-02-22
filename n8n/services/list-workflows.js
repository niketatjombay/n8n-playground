/**
 * List-workflows service — fetches workflows from the n8n API.
 *
 * Extracts logic from scripts/list-workflows.js but returns JSON instead of printing.
 */

const { loadEnv } = require('../lib/env-loader');
const N8nClient = require('../lib/n8n-client');
const { readMetadata, listWorkflowSlugs, getSubWorkflows } = require('../lib/metadata');
const { promotionOrder } = require('../config/environments.config');

/**
 * List all workflows from the n8n API.
 *
 * @param {{ grouped?: boolean }} options
 * @returns {Promise<
 *   { count: number, workflows: Array<{id, name, active, nodeCount, updatedAt}> } |
 *   { count: number, groups: Object<string, Array> }
 * >}
 */
async function listWorkflows({ grouped = false } = {}) {
  loadEnv();
  const client = new N8nClient();
  const result = await client.getAllWorkflows();
  const workflows = result.data;

  if (!grouped) {
    return {
      count: workflows.length,
      workflows: workflows.map(wf => ({
        id: wf.id,
        name: wf.name,
        active: wf.active,
        nodeCount: wf.nodes?.length || 0,
        updatedAt: wf.updatedAt
      }))
    };
  }

  // Grouped by environment
  const meta = readMetadata();

  // Build a lookup: n8nId -> { slug, env, type, subSlug? }
  const idLookup = {};

  // Main workflows
  for (const slug of listWorkflowSlugs()) {
    const entry = meta[slug];
    for (const env of promotionOrder) {
      const envBlock = entry[env];
      if (!envBlock) continue;
      if (envBlock.n8nId && !envBlock.n8nId.startsWith('TODO')) {
        idLookup[envBlock.n8nId] = { slug, env, type: 'main' };
      }
    }
  }

  // Shared sub-workflows
  const allSubs = getSubWorkflows();
  for (const [subSlug, subEntry] of Object.entries(allSubs)) {
    for (const env of promotionOrder) {
      const envBlock = subEntry[env];
      if (!envBlock) continue;
      if (envBlock.n8nId && !envBlock.n8nId.startsWith('TODO')) {
        idLookup[envBlock.n8nId] = { slug: subSlug, env, type: 'sub', subSlug };
      }
    }
  }

  // Group workflows
  const groups = {};
  for (const env of promotionOrder) {
    groups[env] = [];
  }
  groups.untracked = [];

  for (const wf of workflows) {
    const info = idLookup[wf.id];
    const item = {
      id: wf.id,
      name: wf.name,
      active: wf.active,
      nodeCount: wf.nodes?.length || 0,
      updatedAt: wf.updatedAt
    };

    if (info) {
      item.slug = info.slug;
      item.type = info.type;
      if (info.subSlug) item.subSlug = info.subSlug;
      groups[info.env].push(item);
    } else {
      groups.untracked.push(item);
    }
  }

  return {
    count: workflows.length,
    groups
  };
}

module.exports = { listWorkflows };
