const { loadEnv } = require('../lib/env-loader');
const N8nClient = require('../lib/n8n-client');
const { getWorkflowEnv } = require('../lib/metadata');

const ENV_ALIASES = { dev: 'development', stg: 'staging', prod: 'production' };
function resolveEnv(input) { return ENV_ALIASES[input] || input; }

async function getExecutions({ slug, env: envArg, limit = 20 }) {
  loadEnv();

  if (!slug || !envArg) {
    return { success: false, error: 'slug and env are required' };
  }

  const env = resolveEnv(envArg);
  let envBlock;
  try {
    envBlock = getWorkflowEnv(slug, env);
  } catch (error) {
    return { success: false, error: error.message };
  }

  const n8nId = envBlock.n8nId;
  if (!n8nId || n8nId.startsWith('TODO')) {
    return { success: false, error: `No valid n8n ID for ${slug}/${env}` };
  }

  try {
    const client = new N8nClient();
    const result = await client.getExecutions(n8nId, limit);
    const executions = (result.data || []).map((exec) => ({
      id: exec.id,
      status: exec.status,
      startedAt: exec.startedAt,
      stoppedAt: exec.stoppedAt,
      mode: exec.mode,
      duration: exec.stoppedAt && exec.startedAt
        ? new Date(exec.stoppedAt).getTime() - new Date(exec.startedAt).getTime()
        : null,
    }));

    return { success: true, slug, env, n8nId, executions };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

module.exports = { getExecutions };
