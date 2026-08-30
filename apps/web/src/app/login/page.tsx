import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { tokenFor, expectedToken, COOKIE } from '@/lib/auth';

async function login(formData: FormData) {
  'use server';
  const pw = String(formData.get('password') || '');
  if (await tokenFor(pw) === await expectedToken()) {
    (await cookies()).set(COOKIE, await expectedToken(), {
      httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 60 * 60 * 24 * 30,
    });
    redirect('/');
  }
  redirect('/login?e=1');
}

export default async function Login({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const err = (await searchParams).e;
  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <form action={login} className="panel p-5 sm:p-6 w-full max-w-xs">
        <h1 className="text-lg font-semibold mb-1">Beat</h1>
        <p className="text-[11px] mb-4" style={{ color: 'var(--muted)' }}>Portföyüne erişmek için şifre gir</p>
        <input name="password" type="password" autoFocus placeholder="Şifre" className="field mb-3" />
        {err && <p className="text-[11px] mb-3" style={{ color: 'var(--down)' }}>Yanlış şifre</p>}
        <button type="submit" className="btn btn-primary w-full py-2.5">
          Giriş
        </button>
      </form>
    </main>
  );
}
