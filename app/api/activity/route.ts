import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const slug = searchParams.get('slug') || undefined;
    const action = searchParams.get('action') || undefined;

    const { getActivityLog } = require('@/n8n/services/activity-log');
    const entries = getActivityLog({ limit, slug, action });
    return NextResponse.json({ success: true, entries });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
