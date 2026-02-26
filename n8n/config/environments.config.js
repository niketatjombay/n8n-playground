/**
 * Multi-environment configuration for n8n workflows.
 *
 * Two n8n instances:
 *   dev_staging — https://workflows.ur-nl.com  (development + staging)
 *   production  — https://workflows.jombay.com (production)
 *
 * Per-env settings: name prefix, API URLs, credentials.
 */

const instances = {
  dev_staging: {
    baseUrlVar: 'N8N_BASE_URL',
    apiKeyVar: 'N8N_API_KEY',
    webhookBaseUrlVar: 'N8N_WEBHOOK_BASE_URL',
  },
  production: {
    baseUrlVar: 'N8N_PRODUCTION_BASE_URL',
    apiKeyVar: 'N8N_PRODUCTION_API_KEY',
    webhookBaseUrlVar: 'N8N_PRODUCTION_WEBHOOK_BASE_URL',
  },
};

const environments = {
  development: {
    prefix: '[DEV]',
    instance: 'dev_staging',
    coreApiUrl: 'https://coreapi.ur-nl.com',
    llmApiUrl: 'https://agentcoreapi.jombay.com',
    credentials: {
      httpHeaderAuth: { id: '9fZP8bOKRNJtilO1', name: 'Jombay Staging API' }
    }
  },
  staging: {
    prefix: '[STG]',
    instance: 'dev_staging',
    coreApiUrl: 'https://coreapi.ur-nl.com',
    llmApiUrl: 'https://agentcoreapi.jombay.com',
    credentials: {
      httpHeaderAuth: { id: '9fZP8bOKRNJtilO1', name: 'Jombay Staging API' }
    }
  },
  production: {
    prefix: '[PROD]',
    instance: 'production',
    coreApiUrl: 'https://coreapi.jombay.com',
    assetsApiUrl: 'https://assetsapi.jombay.com',
    llmApiUrl: 'https://agentcoreapi.jombay.com',
    credentials: {
      httpHeaderAuth: { id: 'AhWR4DuDqFOGBNyo', name: 'Jombay Production API' }
    }
  }
};

/**
 * Return the full config for an environment with live process.env values
 * (n8nBaseUrl, n8nApiKey) resolved at call time.
 * Safe to destructure — closes over local constants, not `this`.
 */
function getEnvironmentConfig(env) {
  const envConfig = environments[env];
  if (!envConfig) return null;
  const instance = instances[envConfig.instance];
  return {
    ...envConfig,
    n8nBaseUrl: process.env[instance.baseUrlVar] || null,
    n8nApiKey: process.env[instance.apiKeyVar] || null,
  };
}

module.exports = {
  instances,
  environments,
  promotionOrder: ['development', 'staging', 'production'],
  getEnvironmentConfig,
};
