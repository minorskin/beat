import { NextRequest, NextResponse } from 'next/server';
import { expectedToken, COOKIE } from '@/lib/auth';

// İkonlar ve manifest korumanın DIŞINDA: tarayıcı sekme ikonunu ve "ana ekrana
// ekle" varlıklarını oturum açılmadan da ister; korumanın içinde kalırlarsa
// /login'e yönlenir, sekmede boş ikon görünür. "icon-.*" yalnız PNG türevlerini
// yakalıyordu — icon.svg (sekmede kullanılan asıl dosya) ve apple-touch-icon
// açıkta kalmıştı. Gizlenecek bir şey değiller, işaretin kendisi.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icon.svg|apple-touch-icon.png|icon-.*|login).*)'],
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
