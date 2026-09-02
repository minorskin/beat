/** Postgres erişimi (Supabase pooler). Motor doğrudan SQL yazar; REST/service_role kullanılmaz. */
import pg from 'pg';
import { required } from './env.js';
import type { AssetClass, Quote } from './types.js';

const { Pool } = pg;
export const pool = new Pool({
  connectionString: required('DATABASE_URL'),
  max: 4,
  ssl: { rejectUnauthorized: false },
});

// numeric sütunlar string döner; sayıya çevir.
pg.types.setTypeParser(1700, (v) => (v === null ? null : Number(v)));

export interface CandidatePlan {
  /** Bu turda çekilecek enstrümanlar (instrumentId -> failover adayları) */
  plan: Map<string, Candidate[]>;
  /** Takvim kapısına takılıp atlananlar (instrumentId -> sembol) */
  skipped: Map<string, string>;
}

export interface Candidate {
  instrumentId: string;
  symbol: string;
  classCode: AssetClass;
  currency: string;
  cadence: string;
  providerId: string;
  providerSymbol: string;
  priority: number;
}

/**
 * TEFAS NAV'ının yayınlandığı saat (Europe/Istanbul).
 *
 * Tahmin değil ölçüm: saatlik position_snapshots'ta fonların `price_ts` alanı
 * iki gün üst üste 06:00 ile 07:00 arasında yeni NAV'a atladı, sonra ertesi
 * sabaha kadar hiç kıpırdamadı. Pencereyi 06:00'da açıyoruz — bir saat erken
 * başlamak veri kaybettirmez, yalnız ilk sorguyu boşa çıkarır; geç başlamak
 * ise NAV'ı saatlerce geç yakalamak demek olurdu.
 */
const FUND_POLL_FROM_HOUR = 6;

/**
 * Aktif enstrümanları failover adaylarıyla (priority sırasında) döndürür.
 *
 * `daily_close` ritmindeki enstrümanlar (TEFAS fonları) HER TURDA ÇEKİLMEZ.
 * Kaynak günde tek NAV yayınlıyor; 10 dakikada bir sormak günde 144 istekten
 * 143'ünü boşa harcıyor ve TEFAS'ın 6 istek/dk sınırına gereksiz yükleniyordu.
 * Kapı üç koşullu:
 *
 *   1. Hafta içi mi?           (TEFAS hafta sonu NAV yayınlamaz)
 *   2. Yayın saati geçti mi?   (>= 06:00 TR)
 *   3. Bugünün NAV'ı elimizde YOK mu?
 *
 * Üçü de sağlanıyorsa çekilir; NAV geldiği anda 3. koşul düşer ve fon o gün
 * bir daha sorgulanmaz. Günde ~144 istek yerine ~6.
 *
 * FAIL-OPEN: hiç fiyatı olmayan enstrüman (yeni eklenmiş fon) pencereye ve
 * güne bakılmaksızın her turda çekilir. Aksi halde cumartesi eklenen bir fon
 * pazartesi sabahına kadar fiyatsız kalırdı — oysa cuma NAV'ı hazır duruyor.
 *
 * `now` yalnız test için: verilmezse veritabanının kendi saati kullanılır.
 */
export async function loadCandidates(now?: Date): Promise<CandidatePlan> {
  const { rows } = await pool.query<Candidate & { due: boolean }>(`
    with n as (select coalesce($1::timestamptz, now()) at time zone 'Europe/Istanbul' as tr)
    select i.id as "instrumentId", i.symbol, i.class_code as "classCode",
           i.currency, i.cadence,
           s.provider_id as "providerId", s.provider_symbol as "providerSymbol",
           s.priority,
           (
             i.cadence <> 'daily_close'
             -- hiç gözlem yok → koşulsuz çek (yeni enstrüman)
             or not exists (select 1 from prices p where p.instrument_id = i.id)
             or (
               extract(isodow from n.tr) <= 5
               and extract(hour from n.tr) >= ${FUND_POLL_FROM_HOUR}
               and not exists (
                 select 1 from prices p
                 where p.instrument_id = i.id
                   and (p.ts at time zone 'Europe/Istanbul')::date = n.tr::date
               )
             )
           ) as due
    from instruments i
    join instrument_sources s on s.instrument_id = i.id and s.is_active
    cross join n
    where i.is_active
    order by i.id, s.priority`, [now ?? null]);

  // Filtre SQL'de değil burada: atlanan enstrümanlar da geri dönüyor ki
  // çalıştırma çıktısında "neden çekilmedi" görünsün. Sessizce eksilen bir
  // enstrüman, motor bozulduğunda fark edilmesi en zor arıza olurdu.
  const plan = new Map<string, Candidate[]>();
  const skipped = new Map<string, string>();
  for (const r of rows) {
    if (r.due) {
      const list = plan.get(r.instrumentId) ?? [];
      list.push(r);
      plan.set(r.instrumentId, list);
    } else {
      skipped.set(r.instrumentId, r.symbol);
    }
  }
  return { plan, skipped };
}

/** Snapshot ve goldapi türetmesi için son bilinen USD/EUR -> TRY kurları. */
export async function loadLatestFx(): Promise<Map<string, number>> {
  const { rows } = await pool.query<{ base: string; rate: number }>(`
    select distinct on (base) base, rate
    from fx_rates where quote = 'TRY'
    order by base, ts desc`);
  return new Map(rows.map((r) => [r.base, r.rate]));
}

export async function startRun(kind: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into fetch_runs (kind, status) values ($1,'running') returning id`, [kind]);
  return rows[0].id;
}

export async function finishRun(id: string, ok: number, fail: number, detail: unknown): Promise<void> {
  const status = fail === 0 ? 'ok' : ok === 0 ? 'failed' : 'partial';
  await pool.query(
    `update fetch_runs set finished_at=now(), status=$2, ok_count=$3, fail_count=$4, detail=$5 where id=$1`,
    [id, status, ok, fail, JSON.stringify(detail)]);
}

/** prices tablosuna yazar. Aynı (instrument, ts) varsa yok sayar — sentetik/duplike satır yazılmaz. */
export async function writePrices(rows: { instrumentId: string; q: Quote }[]): Promise<number> {
  if (!rows.length) return 0;
  const vals: unknown[] = [];
  const tuples = rows.map((r, i) => {
    const b = i * 5;
    vals.push(r.instrumentId, r.q.ts, r.q.price, r.q.currency, r.q.source);
    return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5})`;
  });
  const res = await pool.query(
    `insert into prices (instrument_id, ts, price, currency, source)
     values ${tuples.join(',')}
     on conflict (instrument_id, ts) do nothing`, vals);
  return res.rowCount ?? 0;
}

/** fx-sınıfı quote'lardan döviz katmanını besler (USDTRY -> base USD, quote TRY). */
export async function writeFxRates(rows: { base: string; quote: string; q: Quote }[]): Promise<number> {
  if (!rows.length) return 0;
  const vals: unknown[] = [];
  const tuples = rows.map((r, i) => {
    const b = i * 5;
    vals.push(r.base, r.quote, r.q.ts, r.q.price, r.q.source);
    return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5})`;
  });
  const res = await pool.query(
    `insert into fx_rates (base, quote, ts, rate, source)
     values ${tuples.join(',')}
     on conflict (base, quote, ts) do nothing`, vals);
  return res.rowCount ?? 0;
}

export async function logHealth(
  rows: { providerId: string; status: 'ok' | 'degraded' | 'down'; latencyMs?: number; error?: string }[],
): Promise<void> {
  for (const r of rows) {
    await pool.query(
      `insert into provider_health (provider_id, status, latency_ms, error) values ($1,$2,$3,$4)`,
      [r.providerId, r.status, r.latencyMs ?? null, r.error ?? null]);
  }
}
