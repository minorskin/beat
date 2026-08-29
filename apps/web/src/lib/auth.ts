/** Basit tek-kullanıcı şifre koruması. Cookie = sha256(APP_PASSWORD + SECRET). */
const enc = new TextEncoder();

export async function tokenFor(password: string): Promise<string> {
  const secret = process.env.AUTH_SECRET ?? 'beat-default-secret-change-me';
  const buf = await crypto.subtle.digest('SHA-256', enc.encode(password + '::' + secret));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function expectedToken(): Promise<string> {
  return tokenFor(process.env.APP_PASSWORD ?? '');
}

export const COOKIE = 'beat_auth';
