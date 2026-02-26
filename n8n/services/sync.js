/**
 * Sync service — reconciles metadata.json workflow status with live n8n APIs.
 *
 * Two n8n instances are synced separately:
 *   dev_staging → development + staging workflows via N8N_BASE_URL
 *   production  → production workflows via N8N_PRODUCTION_BASE_URL
 *
 * What sync does:
 *   - Fetches all workflows for each project from its n8n instance
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
const { clientForEnv } = require('../lib/client-for-env');
const { readMetadata, writeMetadata } = require('../lib/metadata');

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
 * Resolves the environment from folder ancestry so we know which instance to check.
 */
function walkWorkflows(folders, visitor, parentEnv = null) {
  for (const folder of (folders || [])) {
    const env = folder.environment || parentEnv;
    for (const wf of (folder.workflows || [])) {
      visitor(wf, env);
    }
    walkWorkflows(folder.folders, visitor, env);
  }
}

/**
 * Fetch all workflows for a project from a given n8n instance.
 * Returns a live lookup or null if the project ID is not yet configured.
 */
async function fetchLiveLookup(env, projectId, errors) {
  if (!projectId) {
    errors.push(`${env}: project_id not configured — skipping sync for this instance`);
    return null;
  }
  try {
    const client = clientForEnv(env);
    const result = await client.getWorkflowsByProject(projectId);
    return buildLiveLookup(result.data || []);
  } catch (err) {
    errors.push(`${env}: failed to fetch workflows — ${err.message}`);
    return null;
  }
}

/**
 * Main sync function.
 * @returns {{ updated: number, archived: number, errors: string[] }}
 */
async function sync() {
  loadEnv();

  const meta = readMetadata();
  if (!meta.folders) {
    return { updated: 0, archived: 0, errors: ['metadata.json is in flat format — run migration first'] };
  }

  const errors = [];

  // Fetch live lookups per instance
  const devStagingLookup = await fetchLiveLookup('development', meta.project_id, errors);
  const productionLookup = await fetchLiveLookup('production', meta.project_id, errors);

  let updated = 0;
  let archived = 0;

  const reconcile = (wf, env) => {
    if (!wf.n8nId) return;
    const liveLookup = env === 'production' ? productionLookup : devStagingLookup;
    if (!liveLookup) return;
    const live = liveLookup[wf.n8nId];
    if (live) {
      wf.name = live.name;
      wf.active = live.active;
      wf.archived = false;
      updated++;
    } else if (!wf.archived) {
      wf.archived = true;
      archived++;
    }
  };

  walkWorkflows(meta.folders, reconcile);

  writeMetadata(meta);

  return { updated, archived, errors };
}

module.exports = { sync };
