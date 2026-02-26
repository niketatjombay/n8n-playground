/**
 * n8n API Client for Next.js
 * Handles all n8n API interactions using native fetch
 */

class N8nClient {
  constructor({ baseUrl, apiKey } = {}) {
    this.apiKey = apiKey || process.env.N8N_API_KEY;
    this.baseURL = baseUrl || process.env.N8N_BASE_URL || 'http://localhost:5678';

    if (!this.apiKey) {
      throw new Error('N8N_API_KEY not found in environment variables');
    }
  }

  async request(endpoint, options = {}) {
    const url = `${this.baseURL}/api/v1${endpoint}`;
    const response = await fetch(url, {
      ...options,
      headers: {
        'X-N8N-API-KEY': this.apiKey,
        'Content-Type': 'application/json',
        ...options.headers
      }
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`n8n API error: ${response.status} - ${error}`);
    }

    if (response.status === 204) return null;
    return response.json();
  }

  // Workflows
  async getAllWorkflows() {
    return this.request('/workflows');
  }

  // List all folders for a project
  async getFolders(projectId) {
    const params = new URLSearchParams({ projectId });
    return this.request(`/folders?${params}`);
  }

  // Get a single project by ID
  async getProject(projectId) {
    return this.request(`/projects/${projectId}`);
  }

  // List all workflows filtered by project
  async getWorkflowsByProject(projectId) {
    const params = new URLSearchParams({ projectId });
    return this.request(`/workflows?${params}`);
  }

  async getWorkflow(workflowId) {
    return this.request(`/workflows/${workflowId}`);
  }

  async createWorkflow(workflowData) {
    return this.request('/workflows', {
      method: 'POST',
      body: JSON.stringify(workflowData)
    });
  }

  async updateWorkflow(workflowId, workflowData) {
    return this.request(`/workflows/${workflowId}`, {
      method: 'PUT',
      body: JSON.stringify(workflowData)
    });
  }

  async deleteWorkflow(workflowId) {
    await this.request(`/workflows/${workflowId}`, { method: 'DELETE' });
    return true;
  }

  async activateWorkflow(workflowId) {
    return this.request(`/workflows/${workflowId}/activate`, { method: 'POST' });
  }

  async deactivateWorkflow(workflowId) {
    return this.request(`/workflows/${workflowId}/deactivate`, { method: 'POST' });
  }

  // Move workflow into a folder (requires n8n 1.68+)
  async moveWorkflowToFolder(workflowId, folderId) {
    return this.request(`/workflows/${workflowId}/move`, {
      method: 'PUT',
      body: JSON.stringify({ destinationFolderId: folderId })
    });
  }

  // Transfer workflow to a project
  async transferWorkflow(workflowId, projectId) {
    return this.request(`/workflows/${workflowId}/transfer`, {
      method: 'PUT',
      body: JSON.stringify({ destinationProjectId: projectId })
    });
  }

  // Executions
  async getExecutions(workflowId, limit = 10) {
    const params = new URLSearchParams({ workflowId, limit: String(limit) });
    return this.request(`/executions?${params}`);
  }

  async getExecution(executionId) {
    return this.request(`/executions/${executionId}?includeData=true`);
  }

  // Trigger workflow (if it has a webhook)
  async triggerWorkflow(webhookPath, data) {
    const webhookUrl = `${this.baseURL}/webhook/${webhookPath}`;
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    return response.json();
  }
}

module.exports = N8nClient;
