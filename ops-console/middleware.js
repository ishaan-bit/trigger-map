import { NextResponse } from 'next/server';

// Protect all pages except /login and /api/auth/*
export function middleware(request) {
  const { pathname } = request.nextUrl;

  // Allow login page, auth API, and static assets
  if (
    pathname === '/login' ||
    pathname.startsWith('/api/auth/') ||
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/favicon') ||
    pathname === '/404'
  ) {
    return NextResponse.next();
  }

  // For API routes, check session cookie
  const sessionCookie = request.cookies.get('ops_session');
  if (!sessionCookie?.value) {
    // API routes get 401, pages get redirected
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
