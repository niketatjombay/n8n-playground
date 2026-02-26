/**
 * Activate service — activates or deactivates a workflow in n8n.
 *
 * Extracts logic from scripts/activate.js but returns structured JSON.
 */

const { loadEnv } = require('../lib/env-loader');
const { clientForEnv } = require('../lib/client-for-env');
const { getWorkflowEnv, updateWorkflowEnv } = require('../lib/metadata');

const ENV_ALIASES = { dev: 'development', stg: 'staging', prod: 'production' };

function resolveEnv(input) {
  return ENV_ALIASES[input] || input;
}

/**
 * Activate or deactivate a workflow.
 *
 * @param {{ slug: string, env: string, deactivate?: boolean }} options
 * @returns {Promise<{ success: boolean, slug?: string, env?: string, n8nId?: string, active?: boolean, error?: string }>}
 */
async function activate({ slug, env: envArg, deactivate = false }) {
  loadEnv();

  if (!slug || !envArg) {
    return {
      success: false,
      error: 'slug and env are required'
    };
  }

  const env = resolveEnv(envArg);

  let envBlock;
  try {
    envBlock = getWorkflowEnv(slug, env);
  } catch (error) {
    return {
      success: false,
      slug,
      env,
      error: error.message
    };
  }

  const n8nId = envBlock.n8nId;
  if (!n8nId || n8nId.startsWith('TODO')) {
    return {
      success: false,
      slug,
      env,
      error: `Workflow "${slug}" has no valid n8n ID for ${env} (got: ${n8nId || 'undefined'}). Deploy or promote first.`
    };
  }

  try {
    const client = clientForEnv(env);

    if (deactivate) {
      await client.deactivateWorkflow(n8nId);
    } else {
      await client.activateWorkflow(n8nId);
    }

    updateWorkflowEnv(slug, env, { active: !deactivate });

    const { logActivity } = require('./activity-log');
    logActivity({
      action: deactivate ? 'deactivate' : 'activate',
      slug,
      env,
      result: 'success',
    });

    return {
      success: true,
      slug,
      env,
      n8nId,
      active: !deactivate
    };
  } catch (error) {
    return {
      success: false,
      slug,
      env,
      n8nId,
      error: error.message
    };
  }
}

module.exports = { activate };
