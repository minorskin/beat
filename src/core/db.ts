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
  calendarCode: string;
  providerId: string;
  providerSymbol: string;
  priority: number;
}

/**
 * Aktif enstrümanları failover adaylarıyla (priority sırasında) döndürür.
 *
 * ÇEKİM KAPISI ARTIK GRUBUN TAKVİMİ (market_calendars, bkz. migration 0016).
 * Kullanıcının verdiği "enstrüman grubu güncelleme" tablosu dört şey söylüyor:
 * hangi günler, hangi saat aralığı, hangi zaman dilimi, hangi sıklık. Dördü de
 * takvim satırında duruyor ve kapı burada uygulanıyor:
 *
 *   1. Bugün bu grubun güncelleme günü mü?   (weekdays)
 *   2. Şu an çalışma aralığında mıyız?       (open_time–close_time, tz)
 *   3. Bu SIKLIK DİLİMİNDE daha çekmedik mi? (interval_minutes)
 *
 * Üçüncü koşul neden slot: tetikleyiciler tam :00/:30'a oturmuyor (Worker 30
 * dk'da bir, GH Actions ayrıca 10 dk'da bir denemeye çalışıyor). "Son çekimden
 * beri N dakika geçti mi" kuralı bu kaymayı biriktirip sıklığı kaydırırdı;
 * duvar saatini interval_minutes'lik dilimlere bölüp "bu dilimde bir kez"
 * demek, tetikleyici ne zaman gelirse gelsin belgedeki sıklığı verir.
 *
 * Neden prices değil last_fetch_at: prices.ts sağlayıcının KOTASYON zamanıdır.
 * Piyasa kapalıyken hiç ilerlemez, aynı tick tekrar gelirse yeni satır da
 * yazılmaz — yani "bu dilimde çekildi mi" sorusunu cevaplayamaz. Damga
 * denemenin kendisine ait (bkz. markFetched).
 *
 * İKİ İSTİSNA:
 *
 * FAIL-OPEN — hiç fiyatı olmayan enstrüman (yeni eklenmiş) GÜN ve PENCERE
 * kapısına takılmaz; cuma akşamı eklenen bir BIST hissesi pazartesi 10:00'a
 * kadar fiyatsız kalmasın diye. Sıklık kapısına yine uyar: sınırsız fail-open,
 * hiçbir kaynağın veremediği bir sembolü sonsuza dek 10 dk'da bir sordurur ve
 * başka kimsenin sırası gelmediği turları tek başına "hepsi başarısız"a
 * çevirirdi.
 *
 * PLANSIZ GRUP (gayrimenkul) — belgede yedi gün de "hayır": zamanlanmış çekim
 * yok. Ama fiyatı sabit sağlayıcıdan gelen bir DEĞERLEME ve kullanıcı onu
 * arayüzden değiştirebiliyor. Beyan edilen değer son yazılan fiyattan farklıysa
 * bir kereliğine çekilir; değer oturduğu anda koşul düşer ve enstrüman bir daha
 * sorgulanmaz. Böylece "hiç güncellenmez" kuralı bozulmadan değerleme
 * değişikliği tabloya yansır.
 *
 * `now` yalnız test için: verilmezse veritabanının kendi saati kullanılır.
 */
export async function loadCandidates(now?: Date): Promise<CandidatePlan> {
  const { rows } = await pool.query<Candidate & { due: boolean }>(`
    with n as (select coalesce($1::timestamptz, now()) as at)
    select i.id as "instrumentId", i.symbol, i.class_code as "classCode",
           i.currency, i.calendar_code as "calendarCode",
           s.provider_id as "providerId", s.provider_symbol as "providerSymbol",
           s.priority,
           (
             -- FAIL-OPEN: hiç gözlem yok → gün/pencere kapısına takılmaz.
             -- Sıklık kapısına YİNE UYAR. Sınırsız bırakılınca hiç fiyat
             -- alınamayan bir enstrüman (kaynağı olmayan bir sembol) her turda,
             -- yani 10 dk'da bir sorgulanıyor ve başka kimsenin sırası gelmediği
             -- turları tek başına doldurup "hepsi başarısız" gösteriyordu.
             (
               not exists (select 1 from prices p where p.instrument_id = i.id)
               and (
                 -- plansız grupta (gayrimenkul) sıklık yok: ilk fiyat için koşulsuz
                 c.interval_minutes is null
                 or i.last_fetch_at is null
                 or floor(extract(epoch from n.at)            / (c.interval_minutes * 60))
                  > floor(extract(epoch from i.last_fetch_at) / (c.interval_minutes * 60))
               )
             )
             -- planlı grup: gün + pencere + sıklık dilimi
             or (
               c.interval_minutes is not null
               and extract(isodow from (n.at at time zone c.tz))::int = any (c.weekdays)
               and (n.at at time zone c.tz)::time >= coalesce(c.open_time,  time '00:00:00')
               and (n.at at time zone c.tz)::time <= coalesce(c.close_time, time '23:59:59')
               and (
                 i.last_fetch_at is null
                 or floor(extract(epoch from n.at)          / (c.interval_minutes * 60))
                  > floor(extract(epoch from i.last_fetch_at) / (c.interval_minutes * 60))
               )
             )
             -- plansız grup: yalnız beyan edilen sabit değer değiştiyse
             or (
               c.interval_minutes is null
               and exists (
                 select 1
                 from instrument_sources cs
                 join v_latest_price lp on lp.instrument_id = i.id
                 where cs.instrument_id = i.id and cs.is_active
                   and cs.provider_id = 'constant'
                   and cs.provider_symbol ~ '^[0-9]+([.][0-9]+)?$'
                   and cs.provider_symbol::numeric <> lp.price
               )
             )
           ) as due
    from instruments i
    join instrument_sources s on s.instrument_id = i.id and s.is_active
    join market_calendars c on c.code = i.calendar_code
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

/**
 * Çekim damgası — planlanan her enstrüman için, sonuç ne olursa olsun.
 *
 * Neden başarısızlar da damgalanıyor: belgedeki sıklık "ne kadar sık SORARIZ"
 * sözü. Hata alan enstrümanı damgasız bırakmak onu bir sonraki turda (10 dk
 * sonra) yeniden sorduruyordu — yani kaynak bozulduğunda tam da en çok
 * yüklenmemesi gereken anda sıklık kendiliğinden artıyordu. Damga denemenin
 * kendisine ait; hata bir sonraki dilimde tekrar denenir.
 */
export async function markFetched(instrumentIds: string[], now?: Date): Promise<void> {
  if (!instrumentIds.length) return;
  await pool.query(
    `update instruments set last_fetch_at = coalesce($2::timestamptz, now()) where id = any($1::uuid[])`,
    [instrumentIds, now ?? null]);
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
