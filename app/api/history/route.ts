import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const slug = searchParams.get('slug');
    const env = searchParams.get('env');
    const commitHash = searchParams.get('commit');

    if (!slug || !env) {
      return NextResponse.json(
        { success: false, error: 'slug and env are required' },
        { status: 400 }
      );
    }

    if (commitHash) {
      const { getVersion } = require('@/n8n/services/history');
      const data = getVersion({ slug, env, commitHash });
      return NextResponse.json(data);
    }

    const { getHistory } = require('@/n8n/services/history');
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const data = getHistory({ slug, env, limit });
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
