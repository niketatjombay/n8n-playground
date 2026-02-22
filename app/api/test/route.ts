import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { slug, env, payload } = body;

    if (!slug || !env) {
      return NextResponse.json(
        { success: false, error: 'slug and env are required' },
        { status: 400 }
      );
    }

    const { testWorkflow } = require('@/n8n/services/test-workflow');
    const data = await testWorkflow({ slug, env, payload: payload || null });
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
