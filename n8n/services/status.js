/**
 * Status service — returns structured deployment status for all workflows.
 *
 * Extracts logic from scripts/status.js but returns JSON instead of printing.
 */

const {
  readMetadata, listWorkflowSlugs, getSubWorkflows, findTodoPlaceholders
} = require('../lib/metadata');
const { promotionOrder } = require('../config/environments.config');

/**
 * Get deployment status overview for all (or one) workflow(s).
 *
 * @param {string|null} slugFilter - Optional slug to filter to a single workflow
 * @returns {{
 *   subWorkflows: Array<{slug, description, usedBy, environments: Object}>,
 *   workflows: Array<{slug, description, usesSubWorkflows, environments: Object}>,
 *   todos: Array<{path, value}>,
 *   environments: string[]
 * }}
 */
function getStatus(slugFilter = null) {
  const meta = readMetadata();

  // --- Shared sub-workflows ---
  const allSubs = getSubWorkflows();
  const subWorkflows = Object.entries(allSubs).map(([subSlug, sub]) => {
    const environments = {};
    for (const env of promotionOrder) {
      const envBlock = sub[env];
      if (!envBlock) {
        environments[env] = null;
      } else {
        const id = envBlock.n8nId || null;
        const isTodo = id ? id.startsWith('TODO') : false;
        environments[env] = {
          n8nId: id,
          isTodo,
          projectId: envBlock.project_id || null,
          folderId: envBlock.folder_id || null
        };
      }
    }

    return {
      slug: subSlug,
      description: sub.description || null,
      usedBy: sub.used_by || [],
      environments
    };
  });

  // --- Main workflows ---
  const slugs = slugFilter ? [slugFilter] : listWorkflowSlugs();
  const workflows = [];

  for (const slug of slugs) {
    const entry = meta[slug];
    if (!entry) continue;

    const environments = {};
    for (const env of promotionOrder) {
      const envBlock = entry[env];
      if (!envBlock) {
        environments[env] = null;
      } else {
        const id = envBlock.n8nId || null;
        const isTodo = id ? id.startsWith('TODO') : false;
        environments[env] = {
          n8nId: id,
          isTodo,
          active: envBlock.active || false,
          webhookPath: envBlock.webhookPath || null,
          lastDeployedAt: envBlock.lastDeployedAt || null,
          projectId: envBlock.project_id || null,
          folderId: envBlock.folder_id || null
        };
      }
    }

    workflows.push({
      slug,
      description: entry.description || null,
      usesSubWorkflows: entry.uses_sub_workflows || [],
      input: entry.input || null,
      environments
    });
  }

  // --- TODOs ---
  const todos = findTodoPlaceholders();

  return {
    subWorkflows,
    workflows,
    todos,
    environments: [...promotionOrder]
  };
}

module.exports = { getStatus };
