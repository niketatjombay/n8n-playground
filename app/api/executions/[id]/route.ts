import { NextResponse } from 'next/server';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const env = searchParams.get('env');

    if (!env) {
      return NextResponse.json(
        { success: false, error: 'env query parameter is required' },
        { status: 400 }
      );
    }

    const { getExecutionDetail } = require('@/n8n/services/executions');
    const data = await getExecutionDetail({ executionId: id, env });

    if (!data.success) {
      return NextResponse.json(data, { status: 404 });
    }

    return NextResponse.json(data);
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}
