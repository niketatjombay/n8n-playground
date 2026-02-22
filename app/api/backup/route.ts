import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { env, slug } = body;

    if (!env) {
      return NextResponse.json({ success: false, error: 'env is required' }, { status: 400 });
    }

    const { backup } = require('@/n8n/services/backup');
    const data = await backup({ env, slug: slug || null });
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
