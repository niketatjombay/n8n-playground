import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const { listWorkflows } = require('@/n8n/services/list-workflows');
    const data = await listWorkflows({ grouped: searchParams.get('grouped') === 'true' });
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
