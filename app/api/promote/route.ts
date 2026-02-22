import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { slug, sourceEnv, targetEnv } = body;

    if (!slug || !sourceEnv || !targetEnv) {
      return NextResponse.json(
        { success: false, error: 'slug, sourceEnv, and targetEnv are all required' },
        { status: 400 }
      );
    }

    const { promote } = require('@/n8n/services/promote');
    const data = await promote({ slug, sourceEnv, targetEnv });
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
