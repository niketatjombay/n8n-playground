#!/usr/bin/env node
/**
 * Activate or deactivate a workflow in a specific environment.
 *
 * Usage:
 *   node activate.js case-study-creator dev          # activate
 *   node activate.js case-study-creator dev --off    # deactivate
 */

const { loadEnv } = require('../lib/env-loader');
loadEnv();

const { clientForEnv } = require('../lib/client-for-env');
const { getWorkflowEnv, updateWorkflowEnv } = require('../lib/metadata');

const ENV_ALIASES = { dev: 'development', stg: 'staging', prod: 'production' };

function resolveEnv(input) {
  return ENV_ALIASES[input] || input;
}

async function activate() {
  const args = process.argv.slice(2);
  const slug = args[0];
  const envArg = args[1];
  const deactivate = args.includes('--off');

  if (!slug || !envArg) {
    console.error('Usage: node activate.js <workflow-slug> <env> [--off]');
    console.error('  Envs: dev | stg | prod');
    console.error('  Example: node activate.js case-study-creator dev');
    console.error('  Example: node activate.js case-study-creator prod --off');
    process.exit(1);
  }

  const env = resolveEnv(envArg);
  const envBlock = getWorkflowEnv(slug, env);
  const n8nId = envBlock.n8nId;

  if (!n8nId || n8nId.startsWith('TODO')) {
    console.error(`Workflow "${slug}" has no valid n8n ID for ${env} (got: ${n8nId})`);
    console.error('Deploy or promote first.');
    process.exit(1);
  }

  const client = clientForEnv(env);
  const action = deactivate ? 'deactivate' : 'activate';

  try {
    if (deactivate) {
      await client.deactivateWorkflow(n8nId);
    } else {
      await client.activateWorkflow(n8nId);
    }

    updateWorkflowEnv(slug, env, { active: !deactivate });

    console.log(`${deactivate ? 'Deactivated' : 'Activated'}: ${slug} [${env}] (${n8nId})`);
  } catch (error) {
    console.error(`Failed to ${action} ${slug} [${env}]: ${error.message}`);
    process.exit(1);
  }
}

activate();
