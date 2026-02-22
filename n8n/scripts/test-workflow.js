#!/usr/bin/env node
/**
 * Test a workflow by hitting its webhook with the sample input from metadata.json.
 *
 * Usage:
 *   node test-workflow.js case-study-creator dev
 *   node test-workflow.js case-study-creator stg
 *   node test-workflow.js case-study-creator prod
 */

const { loadEnv } = require('../lib/env-loader');
loadEnv();

const { getWorkflow, getWorkflowEnv } = require('../lib/metadata');
const { environments } = require('../config/environments.config');

const ENV_ALIASES = { dev: 'development', stg: 'staging', prod: 'production' };

function resolveEnv(input) {
  return ENV_ALIASES[input] || input;
}

async function testWorkflow() {
  const [slug, envArg] = process.argv.slice(2);

  if (!slug || !envArg) {
    console.error('Usage: node test-workflow.js <workflow-slug> <env>');
    console.error('  Envs: dev | stg | prod');
    console.error('  Example: node test-workflow.js case-study-creator dev');
    process.exit(1);
  }

  const env = resolveEnv(envArg);
  const envCfg = environments[env];
  if (!envCfg) {
    console.error(`Unknown environment: ${env}`);
    process.exit(1);
  }

  const entry = getWorkflow(slug);
  const envBlock = getWorkflowEnv(slug, env);

  if (!envBlock.webhookPath) {
    console.error(`No webhookPath defined for ${slug}/${env}`);
    process.exit(1);
  }

  const baseUrl = envCfg.n8nBaseUrl || process.env.N8N_BASE_URL;
  if (!baseUrl) {
    console.error('N8N_BASE_URL not set');
    process.exit(1);
  }

  const webhookUrl = `${baseUrl}/webhook/${envBlock.webhookPath}`;
  const payload = entry.input || {};

  console.log(`Testing: ${slug} [${env}]`);
  console.log(`  Webhook: ${webhookUrl}`);
  console.log(`  Payload keys: ${Object.keys(payload).join(', ')}\n`);

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const status = response.status;
    const contentType = response.headers.get('content-type') || '';
    let body;

    if (contentType.includes('application/json')) {
      body = await response.json();
    } else {
      body = await response.text();
    }

    console.log(`Status: ${status}`);
    console.log(`Response:`);
    console.log(typeof body === 'string' ? body : JSON.stringify(body, null, 2));

    if (status >= 400) {
      process.exit(1);
    }
  } catch (error) {
    console.error(`Request failed: ${error.message}`);
    process.exit(1);
  }
}

testWorkflow();
