import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { env, slug } = body;

    if (!env) {
      return NextResponse.json({ success: false, error: 'env is required' }, { status: 400 });
    }

    const { deploy } = require('@/n8n/services/deploy');
    const data = await deploy({ env, slug: slug || null });
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
