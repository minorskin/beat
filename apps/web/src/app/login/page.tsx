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
      <form action={login} className="panel p-6 w-full max-w-xs">
        <h1 className="text-lg font-semibold mb-1">Beat</h1>
        <p className="text-xs mb-4" style={{ color: 'var(--muted)' }}>Portföyüne erişmek için şifre gir</p>
        <input name="password" type="password" autoFocus placeholder="Şifre"
          className="w-full p-2.5 rounded-md mb-3" style={{ background: 'var(--panel-2)', color: 'var(--text)', border: '1px solid var(--border)' }} />
        {err && <p className="text-xs mb-3" style={{ color: 'var(--down)' }}>Yanlış şifre</p>}
        <button type="submit" className="w-full py-2.5 rounded-lg text-sm font-medium" style={{ background: 'var(--accent)', color: '#fff' }}>
          Giriş
        </button>
      </form>
    </main>
  );
}
