import pg from 'pg';

// Hot-reload'da bağlantı tükenmesin diye global singleton havuz.
const g = globalThis as unknown as { _beatPool?: pg.Pool };
export const pool =
  g._beatPool ??
  new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 3,
    ssl: { rejectUnauthorized: false },
  });
if (!g._beatPool) g._beatPool = pool;

pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));

export async function q<T>(text: string, params?: unknown[]): Promise<T[]> {
  const res = await pool.query(text, params);
  return res.rows as T[];
}
