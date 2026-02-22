import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const apiKey = process.env.PLAYGROUND_API_KEY;

  // If no API key is configured, auth is disabled
  if (!apiKey) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;

  // Allow login page and health check without auth
  if (pathname === '/login' || pathname === '/api/health') {
    return NextResponse.next();
  }

  // API routes: check Authorization header
  if (pathname.startsWith('/api/')) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${apiKey}`) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.next();
  }

  // Pages: check cookie
  const token = request.cookies.get('playground-token')?.value;
  if (token !== apiKey) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
