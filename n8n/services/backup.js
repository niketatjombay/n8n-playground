/**
 * Backup service — downloads workflow JSON from n8n and saves locally.
 *
 * Extracts logic from scripts/backup.js but returns structured JSON.
 */

const { loadEnv } = require('../lib/env-loader');
const N8nClient = require('../lib/n8n-client');
const { readMetadata, listWorkflowSlugs, getSubWorkflows } = require('../lib/metadata');
const fs = require('fs');
const path = require('path');

/**
 * Backup workflows from n8n to local JSON files.
 *
 * @param {{ env: string, slug?: string }} options
 * @returns {Promise<{ env: string, steps: Array<{type, slug, status, id?, file?, error?, reason?}> }>}
 */
async function backup({ env, slug = null }) {
  loadEnv();

  if (!env) {
    throw new Error('env is required');
  }

  const client = new N8nClient();
  const meta = readMetadata();
  const steps = [];

  // --- Back up main workflows ---
  const slugs = slug ? [slug] : listWorkflowSlugs();

  for (const wfSlug of slugs) {
    const entry = meta[wfSlug];
    if (!entry) {
      steps.push({
        type: 'main',
        slug: wfSlug,
        status: 'skipped',
        reason: 'not found in metadata'
      });
      continue;
    }

    const envBlock = entry[env];
    if (!envBlock) {
      steps.push({
        type: 'main',
        slug: wfSlug,
        status: 'skipped',
        reason: `no "${env}" config in metadata`
      });
      continue;
    }

    const mainId = envBlock.n8nId;
    if (!mainId || mainId.startsWith('TODO')) {
      steps.push({
        type: 'main',
        slug: wfSlug,
        status: 'skipped',
        reason: 'n8nId is placeholder'
      });
      continue;
    }

    try {
      const mainDir = path.join(process.cwd(), 'n8n', 'workflows', env, wfSlug);
      fs.mkdirSync(mainDir, { recursive: true });

      const wf = await client.getWorkflow(mainId);
      const mainPath = path.join(mainDir, 'main_workflow.json');
      fs.writeFileSync(mainPath, JSON.stringify(wf, null, 2) + '\n');

      steps.push({
        type: 'main',
        slug: wfSlug,
        status: 'success',
        id: mainId,
        file: `${env}/${wfSlug}/main_workflow.json`
      });
    } catch (error) {
      steps.push({
        type: 'main',
        slug: wfSlug,
        status: 'error',
        id: mainId,
        error: error.message
      });
    }
  }

  // --- Back up shared sub-workflows ---
  const allSubs = getSubWorkflows();
  for (const [subSlug, subEntry] of Object.entries(allSubs)) {
    const subEnv = subEntry[env];
    if (!subEnv) {
      steps.push({
        type: 'sub-workflow',
        slug: subSlug,
        status: 'skipped',
        reason: `no "${env}" config`
      });
      continue;
    }

    const subId = subEnv.n8nId;
    if (!subId || subId.startsWith('TODO')) {
      steps.push({
        type: 'sub-workflow',
        slug: subSlug,
        status: 'skipped',
        reason: 'n8nId is placeholder'
      });
      continue;
    }

    try {
      const subDir = path.join(process.cwd(), 'n8n', 'workflows', env, 'sub_workflows');
      fs.mkdirSync(subDir, { recursive: true });

      const subWf = await client.getWorkflow(subId);
      const subPath = path.join(subDir, `${subSlug}.json`);
      fs.writeFileSync(subPath, JSON.stringify(subWf, null, 2) + '\n');

      steps.push({
        type: 'sub-workflow',
        slug: subSlug,
        status: 'success',
        id: subId,
        file: `${env}/sub_workflows/${subSlug}.json`
      });
    } catch (error) {
      steps.push({
        type: 'sub-workflow',
        slug: subSlug,
        status: 'error',
        id: subId,
        error: error.message
      });
    }
  }

  return { env, steps };
}

module.exports = { backup };
