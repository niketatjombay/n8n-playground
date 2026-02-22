/**
 * Multi-environment configuration for n8n workflows.
 *
 * Per-env settings: name prefix, API URLs, n8n folder ID, credentials.
 * Folder IDs and credential IDs marked TODO must be filled in after
 * creating the corresponding resources in the n8n UI.
 */

module.exports = {
  environments: {
    development: {
      prefix: '[DEV]',
      coreApiUrl: 'https://coreapi.ur-nl.com',
      llmApiUrl: 'https://agentcoreapi.jombay.com',
      n8nBaseUrl: process.env.N8N_BASE_URL,
      n8nApiKey: process.env.N8N_API_KEY,
      n8nFolderId: 'TODO_DEV_FOLDER_ID',
      credentials: {
        httpHeaderAuth: { id: '9fZP8bOKRNJtilO1', name: 'Jombay Staging API' }
      }
    },
    staging: {
      prefix: '[STG]',
      coreApiUrl: 'https://coreapi.ur-nl.com',
      llmApiUrl: 'https://agentcoreapi.jombay.com',
      n8nBaseUrl: process.env.N8N_BASE_URL,
      n8nApiKey: process.env.N8N_API_KEY,
      n8nFolderId: 'TODO_STG_FOLDER_ID',
      credentials: {
        httpHeaderAuth: { id: '9fZP8bOKRNJtilO1', name: 'Jombay Staging API' }
      }
    },
    production: {
      prefix: '[PROD]',
      coreApiUrl: 'https://coreapi.jombay.com',
      llmApiUrl: 'https://agentcoreapi.jombay.com',
      n8nBaseUrl: process.env.N8N_PROD_BASE_URL || process.env.N8N_BASE_URL,
      n8nApiKey: process.env.N8N_PROD_API_KEY || process.env.N8N_API_KEY,
      n8nFolderId: 'TODO_PROD_FOLDER_ID',
      credentials: {
        httpHeaderAuth: { id: 'TODO_PROD_CRED_ID', name: 'Jombay Production API' }
      }
    }
  },
  promotionOrder: ['development', 'staging', 'production']
};
