/**
 * List-workflows service — returns workflow data from the local metadata folder tree.
 * No longer calls the n8n API directly (sync does that instead).
 */

const { readMetadata } = require('../lib/metadata');
const { environments, instances } = require('../config/environments.config');

/**
 * Build a map of environment -> n8n instance base URL.
 * Resolved from process.env at call time.
 */
function getInstancesByEnv() {
  const result = {};
  for (const [env, config] of Object.entries(environments)) {
    const instance = instances[config.instance];
    result[env] = process.env[instance.baseUrlVar] || null;
  }
  return result;
}

/**
 * List workflows from the local metadata tree.
 *
 * @returns {{
 *   project_id: string,
 *   project_name: string,
 *   folders: Array,
 *   instancesByEnv: Record<string, string|null>
 * }}
 */
async function listWorkflows() {
  const meta = readMetadata();
  return {
    project_id: meta.project_id,
    project_name: meta.project_name,
    folders: meta.folders || [],
    instancesByEnv: getInstancesByEnv(),
  };
}

module.exports = { listWorkflows };
