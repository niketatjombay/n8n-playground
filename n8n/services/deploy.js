/**
 * Deploy service — deploys workflow JSON files to n8n via API.
 *
 * Extracts logic from scripts/deploy.js but returns structured JSON.
 * Deploys shared sub-workflows first, then main workflows.
 */

const { loadEnv } = require('../lib/env-loader');
const { clientForEnv } = require('../lib/client-for-env');
const {
  listWorkflowSlugs, getSubWorkflows,
  getWorkflow, getWorkflowEnv,
  updateWorkflowEnv, updateSubWorkflowEnv
} = require('../lib/metadata');
const fs = require('fs');
const path = require('path');

/**
 * Filter a workflow JSON to only the fields needed for the n8n API payload.
 */
function filterWorkflowPayload(workflow) {
  return {
    name: workflow.name,
    nodes: workflow.nodes,
    connections: workflow.connections,
    settings: {
      executionOrder: workflow.settings?.executionOrder || 'v1'
    }
  };
}

/**
 * Deploy a single workflow — update if it exists, otherwise create.
 * Returns { id, action } where action is 'created' or 'updated'.
 */
async function deploySingle(client, workflow, existingId) {
  const payload = filterWorkflowPayload(workflow);

  if (existingId && !existingId.startsWith('TODO')) {
    try {
      await client.getWorkflow(existingId);
      await client.updateWorkflow(existingId, payload);
      return { id: existingId, action: 'updated' };
    } catch {
      // Workflow not found in n8n — fall through to create
    }
  }

  const created = await client.createWorkflow(payload);
  return { id: created.id, action: 'created' };
}

/**
 * Deploy workflows from local JSON files to n8n.
 *
 * @param {{ env: string, slug?: string }} options
 * @returns {Promise<{ env: string, steps: Array<{type, slug, status, action?, id?, error?, reason?}> }>}
 */
async function deploy({ env, slug = null, dryRun = false }) {
  loadEnv();

  if (!env) {
    throw new Error('env is required');
  }

  const client = clientForEnv(env);
  const steps = [];

  // --- Deploy shared sub-workflows first ---
  const allSubs = getSubWorkflows();
  for (const [subSlug, subEntry] of Object.entries(allSubs)) {
    const subPath = path.join(
      process.cwd(), 'n8n', 'workflows', env, 'sub_workflows', `${subSlug}.json`
    );

    if (!fs.existsSync(subPath)) {
      steps.push({
        type: 'sub-workflow',
        slug: subSlug,
        status: 'skipped',
        reason: 'file not found'
      });
      continue;
    }

    if (dryRun) {
      const existingId = subEntry[env]?.n8nId;
      steps.push({
        type: 'sub-workflow',
        slug: subSlug,
        status: 'success',
        action: (existingId && !existingId.startsWith('TODO')) ? 'would-update' : 'would-create',
        id: existingId || '(new)',
      });
      continue;
    }

    try {
      const subWf = JSON.parse(fs.readFileSync(subPath, 'utf8'));
      const existingId = subEntry[env]?.n8nId;
      const result = await deploySingle(client, subWf, existingId);

      if (result.action === 'created') {
        updateSubWorkflowEnv(subSlug, env, { n8nId: result.id });
      }

      steps.push({
        type: 'sub-workflow',
        slug: subSlug,
        status: 'success',
        action: result.action,
        id: result.id
      });
    } catch (error) {
      steps.push({
        type: 'sub-workflow',
        slug: subSlug,
        status: 'error',
        error: error.message
      });
    }
  }

  // --- Deploy main workflows ---
  const slugs = slug ? [slug] : listWorkflowSlugs();

  for (const wfSlug of slugs) {
    let envBlock;
    try {
      envBlock = getWorkflowEnv(wfSlug, env);
    } catch (err) {
      steps.push({
        type: 'main',
        slug: wfSlug,
        status: 'skipped',
        reason: err.message
      });
      continue;
    }

    const mainPath = path.join(
      process.cwd(), 'n8n', 'workflows', env, wfSlug, 'main_workflow.json'
    );
    if (!fs.existsSync(mainPath)) {
      steps.push({
        type: 'main',
        slug: wfSlug,
        status: 'skipped',
        reason: 'file not found'
      });
      continue;
    }

    if (dryRun) {
      steps.push({
        type: 'main',
        slug: wfSlug,
        status: 'success',
        action: (envBlock.n8nId && !envBlock.n8nId.startsWith('TODO')) ? 'would-update' : 'would-create',
        id: envBlock.n8nId || '(new)',
      });
      continue;
    }

    try {
      const mainWf = JSON.parse(fs.readFileSync(mainPath, 'utf8'));
      const result = await deploySingle(client, mainWf, envBlock.n8nId);

      if (result.action === 'created') {
        updateWorkflowEnv(wfSlug, env, {
          n8nId: result.id,
          lastDeployedAt: new Date().toISOString()
        });
      } else {
        updateWorkflowEnv(wfSlug, env, {
          lastDeployedAt: new Date().toISOString()
        });
      }

      steps.push({
        type: 'main',
        slug: wfSlug,
        status: 'success',
        action: result.action,
        id: result.id
      });
    } catch (error) {
      steps.push({
        type: 'main',
        slug: wfSlug,
        status: 'error',
        error: error.message
      });
    }
  }

  if (!dryRun) {
    const { logActivity } = require('./activity-log');
    logActivity({
      action: 'deploy',
      slug: slug || 'all',
      env,
      result: steps.some(s => s.status === 'error') ? 'error' : 'success',
      steps,
    });
  }

  return { env, steps };
}

module.exports = { deploy };
