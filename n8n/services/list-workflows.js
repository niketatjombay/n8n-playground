/**
 * List-workflows service — returns workflow data from the local metadata folder tree.
 * No longer calls the n8n API directly (sync does that instead).
 */

const { readMetadata } = require('../lib/metadata');

/**
 * List workflows from the local metadata tree.
 *
 * @returns {{
 *   project_id: string,
 *   project_name: string,
 *   folders: Array
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
