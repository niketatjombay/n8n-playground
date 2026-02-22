import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const slug = searchParams.get('slug');
    const env = searchParams.get('env');
    const limit = parseInt(searchParams.get('limit') || '20', 10);

    if (!slug || !env) {
      return NextResponse.json(
        { success: false, error: 'slug and env are required' },
        { status: 400 }
      );
    }

    const { getExecutions } = require('@/n8n/services/executions');
    const data = await getExecutions({ slug, env, limit });
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
