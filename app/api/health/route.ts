import { NextResponse } from 'next/server';

export async function GET() {
  const result: Record<string, unknown> = {
    status: 'ok',
    timestamp: new Date().toISOString(),
  };

  // Check n8n connectivity
  try {
    const N8nClient = require('@/n8n/lib/n8n-client');
    const { loadEnv } = require('@/n8n/lib/env-loader');
    loadEnv();
    const client = new N8nClient();
    await client.request('/workflows?limit=1');
    result.n8n = {
      reachable: true,
      url: process.env.N8N_BASE_URL || 'http://localhost:5678',
    };
  } catch (err: any) {
    result.n8n = {
      reachable: false,
      error: err.message,
    };
    result.status = 'degraded';
  }

  // Check metadata
  try {
    const { readMetadata, listWorkflowSlugs, listSubWorkflowSlugs, findTodoPlaceholders } = require('@/n8n/lib/metadata');
    readMetadata();
    result.metadata = {
      workflows: listWorkflowSlugs().length,
      subWorkflows: listSubWorkflowSlugs().length,
      todoCount: findTodoPlaceholders().length,
    };
  } catch (err: any) {
    result.metadata = { error: err.message };
    result.status = 'degraded';
  }

  const httpStatus = result.status === 'ok' ? 200 : 503;
  return NextResponse.json(result, { status: httpStatus });
}
