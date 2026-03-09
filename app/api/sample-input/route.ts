import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const slug = searchParams.get('slug');
  const env = searchParams.get('env');

  if (!slug || !env) {
    return NextResponse.json(
      { success: false, error: 'slug and env are required' },
      { status: 400 }
    );
  }

  const filePath = path.join(
    process.cwd(),
    'n8n',
    'workflows',
    env,
    slug,
    'sample_input.json'
  );

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const data = JSON.parse(raw);
    return NextResponse.json({ success: true, data });
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return NextResponse.json({ success: false, error: 'No sample input found' });
    }
    return NextResponse.json(
      { success: false, error: err.message },
      { status: 500 }
    );
  }
}
