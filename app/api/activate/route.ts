import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { slug, env, deactivate } = body;

    if (!slug || !env) {
      return NextResponse.json(
        { success: false, error: 'slug and env are required' },
        { status: 400 }
      );
    }

    const { activate } = require('@/n8n/services/activate');
    const data = await activate({ slug, env, deactivate: deactivate || false });
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
