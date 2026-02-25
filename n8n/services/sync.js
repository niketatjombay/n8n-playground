/**
 * Sync service — reconciles metadata.json workflow status with live n8n API.
 *
 * What sync does:
 *   - Fetches all workflows for the project from n8n API
 *   - For each workflow in metadata: updates name and active from live data
 *   - Marks archived: true for workflows whose n8nId is no longer found in n8n
 *
 * What sync does NOT do:
 *   - Does not add new workflows (folder API unavailable; metadata is source of truth)
 *   - Does not deploy or activate workflows
 *   - Does not sync workflow node definitions
 *
 * Returns: { updated: number, archived: number, errors: string[] }
 */

const { loadEnv } = require('../lib/env-loader');
const N8nClient = require('../lib/n8n-client');
const { readMetadata, writeMetadata } = require('../lib/metadata');

const PROJECT_ID = 'JIV2elLHsVFXybZ2';

/**
 * Build a lookup: n8nId -> live workflow data from the n8n API.
 */
function buildLiveLookup(workflows) {
  const lookup = {};
  for (const wf of workflows) {
    lookup[wf.id] = wf;
  }
  return lookup;
}

/**
 * Walk all folders in the metadata tree and call visitor for each workflow entry.
 * @param {Array} folders - metadata folders array
 * @param {Function} visitor - called with (workflow, folder) for each workflow found
 */
function walkWorkflows(folders, visitor) {
  for (const folder of (folders || [])) {
    for (const wf of (folder.workflows || [])) {
      visitor(wf, folder);
    }
    walkWorkflows(folder.folders, visitor);
  }
}

/**
 * Main sync function.
 * @returns {{ updated: number, archived: number, errors: string[] }}
 */
async function sync() {
  loadEnv();
  const client = new N8nClient();
  const errors = [];

  // Fetch all workflows for the project
  let allWorkflows;
  try {
    const result = await client.getWorkflowsByProject(PROJECT_ID);
    allWorkflows = result.data || [];
  } catch (err) {
    throw new Error(`Failed to fetch workflows from n8n: ${err.message}`);
  }

  const liveLookup = buildLiveLookup(allWorkflows);

  // Load metadata
  const meta = readMetadata();

  // Guard: requires new hierarchical format
  if (!meta.folders) {
    return { updated: 0, archived: 0, errors: ['metadata.json is in flat format — run migration first'] };
  }

  let updated = 0;
  let archived = 0;

  walkWorkflows(meta.folders, (wf) => {
    if (!wf.n8nId) return;

    const live = liveLookup[wf.n8nId];

    if (live) {
      wf.name = live.name;
      wf.active = live.active;
      wf.archived = false;
      updated++;
    } else {
      if (!wf.archived) {
        wf.archived = true;
        archived++;
      }
    }
  });

  writeMetadata(meta);

  return { updated, archived, errors };
}

module.exports = { sync };
