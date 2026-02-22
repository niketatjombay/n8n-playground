import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const slug = searchParams.get('slug');
    const sourceEnv = searchParams.get('sourceEnv');
    const targetEnv = searchParams.get('targetEnv');

    if (!slug || !sourceEnv || !targetEnv) {
      return NextResponse.json(
        { success: false, error: 'slug, sourceEnv, and targetEnv are required' },
        { status: 400 }
      );
    }

    const { promotePreview } = require('@/n8n/services/promote-preview');
    const data = promotePreview({ slug, sourceEnv, targetEnv });
    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
