import { NextRequest, NextResponse } from 'next/server';
import { expectedToken, COOKIE } from '@/lib/auth';

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icon-.*|login).*)'],
};

export async function middleware(req: NextRequest) {
  // Şifre tanımlı değilse koruma kapalı (yerel geliştirme kolaylığı).
  if (!process.env.APP_PASSWORD) return NextResponse.next();
  const cookie = req.cookies.get(COOKIE)?.value;
  if (cookie && cookie === (await expectedToken())) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  return NextResponse.redirect(url);
}
