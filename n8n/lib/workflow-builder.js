/**
 * Workflow Builder Utilities
 * Helper functions to create workflow structures
 */

function generateNodeId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function createWorkflowStructure(name, nodes, connections, settings = {}) {
  return {
    name,
    nodes,
    connections,
    active: false,
    settings: {
      saveExecutionProgress: false,
      saveManualExecutions: false,
      saveDataErrorExecution: 'all',
      saveDataSuccessExecution: 'all',
      executionTimeout: 3600,
      timezone: 'Asia/Kolkata',
      ...settings
    },
    staticData: null,
    tags: [],
  };
}

// Common node templates
const nodeTemplates = {
  webhook: (path, method = 'POST') => ({
    id: generateNodeId(),
    name: 'Webhook',
    type: 'n8n-nodes-base.webhook',
    typeVersion: 2,
    position: [250, 300],
    parameters: {
      httpMethod: method,
      path: path,
      responseMode: 'responseNode',
      options: {}
    }
  }),

  httpRequest: (url, method = 'GET', name = 'HTTP Request') => ({
    id: generateNodeId(),
    name,
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: [450, 300],
    parameters: {
      url,
      authentication: 'none',
      requestMethod: method,
      options: {}
    }
  }),

  code: (jsCode, name = 'Code') => ({
    id: generateNodeId(),
    name,
    type: 'n8n-nodes-base.code',
    typeVersion: 2,
    position: [450, 300],
    parameters: {
      jsCode
    }
  }),

  respondToWebhook: (responseData = '={{ $json }}') => ({
    id: generateNodeId(),
    name: 'Respond to Webhook',
    type: 'n8n-nodes-base.respondToWebhook',
    typeVersion: 1.1,
    position: [650, 300],
    parameters: {
      respondWith: 'json',
      responseBody: responseData
    }
  }),

  schedule: (cronExpression = '0 9 * * *') => ({
    id: generateNodeId(),
    name: 'Schedule Trigger',
    type: 'n8n-nodes-base.scheduleTrigger',
    typeVersion: 1.2,
    position: [240, 300],
    parameters: {
      rule: {
        interval: [{
          field: 'cronExpression',
          expression: cronExpression
        }]
      }
    }
  })
};

module.exports = {
  generateNodeId,
  createWorkflowStructure,
  nodeTemplates
};
