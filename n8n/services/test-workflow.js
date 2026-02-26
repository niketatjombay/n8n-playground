/**
 * Test-workflow service — triggers a workflow webhook and returns the response.
 *
 * Extracts logic from scripts/test-workflow.js but returns structured JSON.
 */

const { loadEnv } = require('../lib/env-loader');
const { getWorkflow, getWorkflowEnv } = require('../lib/metadata');
const { environments } = require('../config/environments.config');

const ENV_ALIASES = { dev: 'development', stg: 'staging', prod: 'production' };

function resolveEnv(input) {
  return ENV_ALIASES[input] || input;
}

/**
 * Test a workflow by hitting its webhook endpoint.
 *
 * @param {{ slug: string, env: string, payload?: object }} options
 * @returns {Promise<{ success: boolean, webhookUrl?: string, statusCode?: number, data?: any, error?: string }>}
 */
async function testWorkflow({ slug, env: envArg, payload = null }) {
  loadEnv();

  if (!slug || !envArg) {
    return {
      success: false,
      error: 'slug and env are required'
    };
  }

  const env = resolveEnv(envArg);
  const envCfg = environments[env];
  if (!envCfg) {
    return {
      success: false,
      error: `Unknown environment: ${env}`
    };
  }

  let entry;
  try {
    entry = getWorkflow(slug);
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }

  let envBlock;
  try {
    envBlock = getWorkflowEnv(slug, env);
  } catch (error) {
    return {
      success: false,
      error: error.message
    };
  }

  if (!envBlock.webhookPath) {
    return {
      success: false,
      error: `No webhookPath defined for ${slug}/${env}`
    };
  }

  const baseUrl = envCfg.n8nBaseUrl || process.env.N8N_BASE_URL;
  if (!baseUrl) {
    return {
      success: false,
      error: 'N8N_BASE_URL not set'
    };
  }

  const path = envBlock.webhookPath.startsWith('/') ? envBlock.webhookPath : `/${envBlock.webhookPath}`;
  const webhookUrl = `${baseUrl}/webhook${path}`;
  const body = payload || entry.input || {};

  const triggeredAt = new Date().toISOString();

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    const statusCode = response.status;
    const contentType = response.headers.get('content-type') || '';
    let responseBody;

    if (contentType.includes('application/json')) {
      responseBody = await response.json();
    } else {
      responseBody = await response.text();
    }

    return {
      success: statusCode < 400,
      webhookUrl,
      statusCode,
      data: responseBody,
      triggeredAt,
    };
  } catch (error) {
    return {
      success: false,
      webhookUrl,
      error: error.message,
      triggeredAt,
    };
  }
}

module.exports = { testWorkflow };
