import { NextResponse } from 'next/server';

export async function POST() {
  try {
    const { sync } = require('@/n8n/services/sync');
    const result = await sync();
    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
