import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const { listWorkflows } = require('@/n8n/services/list-workflows');
    const data = await listWorkflows();
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
