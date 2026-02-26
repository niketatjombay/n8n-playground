/**
 * Factory that returns an N8nClient configured for the correct n8n instance
 * based on the target environment.
 *
 * Two instances:
 *   dev_staging → N8N_BASE_URL + N8N_API_KEY
 *   production  → N8N_PRODUCTION_BASE_URL + N8N_PRODUCTION_API_KEY
 */

const N8nClient = require('./n8n-client');
const { environments, instances } = require('../config/environments.config');

/**
 * @param {string} env - 'development' | 'staging' | 'production'
 * @returns {N8nClient}
 */
function clientForEnv(env) {
  const envConfig = environments[env];
  if (!envConfig) throw new Error(`Unknown environment: ${env}`);

  const instance = instances[envConfig.instance];
  return new N8nClient({
    baseUrl: process.env[instance.baseUrlVar],
    apiKey: process.env[instance.apiKeyVar],
  });
}

module.exports = { clientForEnv };
