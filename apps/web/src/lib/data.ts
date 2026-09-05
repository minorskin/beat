import { q } from './db';

export interface Snapshot {
  ts: string; total_value_try: number; total_value_usd: number;
  total_cost_try: number; unrealized_pnl_try: number;
  // Sahiplik boyutu: emanet (başkası adına tutulan) pay düşüldükten sonrası
  own_value_try: number; own_value_usd: number;
  own_cost_try: number; own_unrealized_pnl_try: number;
}
export interface Position {
  instrument_id: string;
  symbol: string; display_name: string; class_code: string; class_name: string; ui_group: string;
  quantity: number; price: number | null; currency: string; price_ts: string | null;
  is_stale: boolean; value_try: number | null; value_usd: number | null; weight_pct: number | null;
  avg_cost: number | null; pnl_try: number | null; pnl_pct: number | null;
  // Maliyeti bilinen pozisyonlar için TL maliyet; alış fiyatı girilmemişse null
  // (0 değil — meçhul). Toplam K/Z oranının paydası buradan toplanır.
  cost_try: number | null; own_cost_try: number | null;
  external_quantity: number; own_quantity: number;
  own_value_try: number | null; own_value_usd: number | null; own_weight_pct: number | null; own_pnl_try: number | null;
  // Güncel (açık) lot'un açılış/kapanış tarihi + kullanılan konumlar — transactions'tan hesaplanır.
  opened_at: string | null; closed_at: string | null; locations: string[];
  // Kâr üzerinden kesilecek vergi oranı (%) — girilmemişse null.
  tax_rate: number | null;
  // Fiyatın kote edildiği birim (prices.currency). currency alanı artık kur
  // riski etiketi olduğu için para birimi bilgisi buradan okunur.
  price_currency: string | null;
  // Tutuluyor ama kullanılabilir fiyat yok (motor henüz çekmedi ya da kotasyon
  // TRY/USD dışı) — değer/K-Z/ağırlık "—" kalır.
  pending: boolean;
}
export interface TxRow {
  id: string; instrument_id: string; type: string;
  quantity: number; unit_price: number | null; currency: string;
  executed_at: string; location: string | null; external_quantity: number;
}
/**
 * Bir gözlemde bir sembolün durumu:
 * [value_try, value_usd, own_value_try, own_value_usd, quantity, own_quantity]
 *
 * ADET de taşınıyor çünkü "% değişim" görünümü değeri değil BİRİM DEĞERİ
 * (value/adet) izlemek zorunda: para yatırınca adet artar, değer artar ama bu
 * getiri değildir. Adet olmadan grafik bir mevduatı %46 kazanç gibi çiziyordu.
 */
export type SymPoint = [number, number, number, number, number, number];
export interface SeriesPoint {
  ts: string; try: number; usd: number; own_try: number; own_usd: number;
  s: Record<string, SymPoint>;
}
export interface HistoryBundle { points: SeriesPoint[]; symbols: string[] }
export interface Instrument {
  id: string; symbol: string; display_name: string; class_code: string; currency: string;
  quantity: number; external_quantity: number;
}
export interface WatchItem {
  instrument_id: string; symbol: string; display_name: string; class_code: string;
  ui_group: string; currency: string; created_at: string;
  price: number | null; price_ts: string | null; source: string | null;
}
export interface AssetClass { code: string; name: string; ui_group: string }

export async function getLatestSnapshot(): Promise<Snapshot | null> {
  const r = await q<Snapshot>(
    `select ts, total_value_try, total_value_usd, total_cost_try, unrealized_pnl_try,
            own_value_try, own_value_usd, own_cost_try, own_unrealized_pnl_try
     from portfolio_snapshots order by ts desc limit 1`);
  return r[0] ?? null;
}

export async function getPositions(): Promise<Position[]> {
  return q<Position>(`
    with fx as (select rate from fx_rates where base='USD' and quote='TRY' order by ts desc limit 1),
         -- Güncel lot'un açılış/kapanış tarihi + konumları: buy/sell'i imzalı adet
         -- olarak biriktirip, adet sıfıra her indiğinde yeni bir "segment" başlat.
         -- Bir enstrümanın en güncel segmenti = o an açık (ya da en son kapanan) pozisyon.
         ledger as (
           select instrument_id, id, executed_at, location,
                  case when type='buy' then quantity when type='sell' then -quantity else 0 end as signed_qty
           from transactions
         ),
         running as (
           select *, sum(signed_qty) over (partition by instrument_id order by executed_at, id) as running_qty
           from ledger
         ),
         segmented as (
           -- coalesce ŞART: ilk satırda pencere çerçevesi boş, sum() null döner.
           -- Null segment kendi başına bir grup oluyor ve "order by segment_id desc"
           -- (Postgres'te NULLS FIRST) onu güncel lot sanıp EN ESKİ işlemin
           -- tarihini/konumunu gösteriyordu.
           select *,
             coalesce(sum(case when running_qty = 0 then 1 else 0 end)
               over (partition by instrument_id order by executed_at, id rows between unbounded preceding and 1 preceding), 0) as segment_id
           from running
         ),
         segments as (
           select instrument_id, segment_id,
             min(executed_at) filter (where signed_qty <> 0) as opened_at,
             max(executed_at) filter (where running_qty = 0) as closed_at,
             array_remove(array_agg(distinct location), null) as locations
           from segmented
           group by instrument_id, segment_id
         ),
         current_segment as (
           select distinct on (instrument_id) instrument_id, opened_at, closed_at, locations
           from segments
           order by instrument_id, segment_id desc
         ),
         -- Değer CANLI hesaplanır: adet v_holdings'ten, fiyat v_latest_price'tan.
         -- Snapshot'tan OKUNMAZ. Snapshot saat başı yazılır; bu arada girilen bir
         -- işlem adedi değiştirdiğinde tablo "116.000 adet × 1 ₺ = 79.370 ₺" gibi
         -- kendi içinde çelişen bir satır gösteriyordu (adet canlı, değer bayat).
         base as (
           select h.instrument_id, h.quantity, h.own_quantity, coalesce(h.external_qty, 0) as external_quantity,
                  h.avg_cost, i.cadence,
                  lp.price, lp.price_ts, lp.currency as price_currency,
                  -- Motorla (src/snapshot.ts) AYNI kural: çevrimde FİYATIN kendi
                  -- para birimi esastır, instruments.currency değil (o artık kur
                  -- riski etiketi). TRY/USD dışı bir kotasyonu çevirmek yerine
                  -- fiyatsız sayarız — yanlış çarpan üretmektense "—" gösteririz.
                  case when lp.currency = 'USD' then (select rate from fx) else 1 end as fx_mult,
                  (lp.price is not null and lp.currency in ('TRY','USD')) as priced
           from v_holdings h
           join instruments i on i.id = h.instrument_id
           left join v_latest_price lp on lp.instrument_id = h.instrument_id
           where h.quantity <> 0
         ),
         valued as (
           select b.*,
             case when b.priced then b.quantity     * b.price * b.fx_mult end as value_try,
             case when b.priced then b.own_quantity * b.price * b.fx_mult end as own_value_try,
             -- Alış fiyatı girilmemişse maliyet 0 DEĞİL meçhuldür: null kalır,
             -- yoksa varlığın tamamı kâr gibi görünür.
             case when b.avg_cost > 0 then b.avg_cost * b.quantity     * b.fx_mult end as cost_try,
             case when b.avg_cost > 0 then b.avg_cost * b.own_quantity * b.fx_mult end as own_cost_try
           from base b
         ),
         tot as (select sum(value_try) as t_try, sum(own_value_try) as t_own from valued)
    -- v_holdings tahrik eder: elde tutulan HER şey listelenir, motor fiyatı henüz
    -- çekmemiş olsa bile (fiyat/değer/ağırlık null → arayüzde "—"/"bekliyor").
    select i.id as instrument_id, i.symbol, i.display_name, i.class_code, ac.name as class_name, ac.ui_group,
           i.tax_rate, v.price_currency,
           v.quantity, v.price, i.currency, v.price_ts,
           -- Bayatlık da CANLI: motor durursa fiyat yaşlanır ama snapshot'taki
           -- is_stale donuk kalırdı. Eşikler src/snapshot.ts'teki STALE_WINDOW ile aynı.
           (v.price_ts is not null and extract(epoch from (now() - v.price_ts)) >
             case v.cadence when 'hourly' then 10800 when 'market_hours' then 21600
                            when 'daily_close' then 108000 else 21600 end) as is_stale,
           v.value_try,
           v.value_try / nullif((select rate from fx), 0) as value_usd,
           case when (select t_try from tot) > 0 then v.value_try / (select t_try from tot) * 100 end as weight_pct,
           v.own_quantity, v.own_value_try,
           v.own_value_try / nullif((select rate from fx), 0) as own_value_usd,
           case when (select t_own from tot) > 0 then v.own_value_try / (select t_own from tot) * 100 end as own_weight_pct,
           v.external_quantity, v.avg_cost, v.cost_try, v.own_cost_try,
           v.value_try - v.cost_try         as pnl_try,
           v.own_value_try - v.own_cost_try as own_pnl_try,
           case when v.avg_cost > 0 and v.price is not null then
             ((v.price - v.avg_cost) / v.avg_cost) * 100 end as pnl_pct,
           cs.opened_at, cs.closed_at, coalesce(cs.locations, '{}') as locations,
           (not v.priced) as pending
    from valued v
    join instruments i on i.id = v.instrument_id
    join asset_classes ac on ac.code = i.class_code
    left join current_segment cs on cs.instrument_id = v.instrument_id
    order by v.value_try desc nulls last`);
}

/** Bir enstrümana ait tüm işlemler, en yeniden eskiye — akordiyon paneli için. */
export async function getTransactionsByInstrument(): Promise<Record<string, TxRow[]>> {
  const rows = await q<TxRow>(`
    select instrument_id, id, type, quantity, unit_price, currency, executed_at, location, external_quantity
    from transactions
    order by instrument_id, executed_at desc, id desc`);
  const byInstrument: Record<string, TxRow[]> = {};
  for (const r of rows) (byInstrument[r.instrument_id] ??= []).push(r);
  return byInstrument;
}

/** Daha önce girilmiş konumlar — İşlem Ekle formunda otomatik tamamlama için. */
export async function getLocations(): Promise<string[]> {
  const rows = await q<{ location: string }>(
    `select distinct location from transactions where location is not null and location <> '' order by location`);
  return rows.map((r) => r.location);
}

/**
 * Aralık → (geriye bakış penceresi, kova genişliği).
 *
 * Grafiğin penceresi ile GRANÜLERLİĞİ ayrı iki karar:
 *   S  → son 24 saat, saatlik nokta
 *   G  → son 30 gün,  günlük nokta
 *   H  → son 1 yıl,   haftalık nokta
 *   A  → son 1 yıl,   haftalık nokta
 * H ve A grafikte aynı seriyi verir; ikisi yine de ayrı seçim çünkü birinci
 * karttaki değişim ve "öne çıkanlar" farklı dönemi ölçmeye devam ediyor
 * (H = 7 günlük değişim, A = 30 günlük).
 *
 * bucket = null → kova veriden türetilir (~120 nokta), eski davranış.
 */
const RANGE_SPEC: Record<string, { window: string; bucket: number | null }> = {
  'S':  { window: '24 hours', bucket: 3600 },    // saatlik
  'G':  { window: '30 days',  bucket: 86400 },   // günlük
  'H':  { window: '365 days', bucket: 604800 },  // haftalık
  'A':  { window: '365 days', bucket: 604800 },  // haftalık
  '3A': { window: '90 days',  bucket: null },
  '1Y': { window: '365 days', bucket: null },
};/**
 * Portföy geçmişi + her enstrümanın kendi değer serisi.
 * Kova başına SON snapshot alınır (ortalama değil) — böylece son nokta
 * her zaman gerçekten gözlenmiş bir andır, uydurma bir ara değer değil.
 */
export async function getHistory(range: string): Promise<HistoryBundle> {
  const spec = RANGE_SPEC[range] ?? RANGE_SPEC['A'];
  const rows = await q<{
    ts: string; t_try: number; t_usd: number; o_try: number; o_usd: number;
    symbol: string | null; p_try: number | null; p_usd: number | null;
    p_own_try: number | null; p_own_usd: number | null;
    p_qty: number | null; p_own_qty: number | null;
  }>(`
    with win as (
      select id, ts, total_value_try, total_value_usd, own_value_try, own_value_usd
      from portfolio_snapshots
      where ts >= now() - ($1)::interval
    ),
    span as (
      select coalesce(extract(epoch from (max(ts) - min(ts))), 0) as sec from win
    ),
    b as (
      -- İstenen granülerlik ($2) varsa o kullanılır — AMA elimizdeki geçmiş
      -- ona yetmiyorsa kova küçültülür. Portföy 3 günlükken "haftalık" tek
      -- kova demek, yani tek nokta: çizgi çizilmez ve grafik bozuk görünür.
      -- Bu yüzden istenen kova ile "en az ~24 nokta çıkaran" kova arasından
      -- KÜÇÜK olan seçilir; yeterli geçmiş birikince istenen granülerliğe
      -- kendiliğinden oturur.
      --
      -- $2 null ise eski davranış: kovayı tamamen veriden türet (~120 nokta).
      select case
               when ($2)::float8 is null then greatest(60, span.sec / 120)
               else least(($2)::float8, greatest(60, span.sec / 24))
             end as bucket
      from span
    ),
    snaps as (
      -- Kova sınırı Europe/Istanbul gün başına hizalanır (+10800 sn). Epoch
      -- doğrudan bölünseydi "günlük" nokta TR saatiyle 03:00'te kapanırdı;
      -- sayfanın geri kalanı da bu saat dilimine sabitli (bkz. lib/format).
      -- Türkiye 2016'dan beri yaz saati uygulamıyor, sabit ofset doğru.
      select distinct on (floor((extract(epoch from w.ts) + 10800) / b.bucket))
        w.id, w.ts, w.total_value_try, w.total_value_usd, w.own_value_try, w.own_value_usd
      from win w cross join b
      order by floor((extract(epoch from w.ts) + 10800) / b.bucket), w.ts desc
    )
    select s.ts,
           s.total_value_try t_try, s.total_value_usd t_usd,
           s.own_value_try o_try,   s.own_value_usd o_usd,
           i.symbol, pos.value_try p_try, pos.value_usd p_usd,
           pos.own_value_try p_own_try, pos.own_value_usd p_own_usd,
           pos.quantity p_qty, pos.own_quantity p_own_qty
    from snaps s
    left join position_snapshots pos on pos.snapshot_id = s.id
    left join instruments i on i.id = pos.instrument_id
    order by s.ts`, [spec.window, spec.bucket]);

  const byTs = new Map<string, SeriesPoint>();
  const symbols = new Set<string>();
  for (const r of rows) {
    const key = new Date(r.ts).toISOString();
    let pt = byTs.get(key);
    if (!pt) {
      pt = { ts: key, try: r.t_try, usd: r.t_usd, own_try: r.o_try, own_usd: r.o_usd, s: {} };
      byTs.set(key, pt);
    }
    if (r.symbol) {
      symbols.add(r.symbol);
      pt.s[r.symbol] = [r.p_try ?? 0, r.p_usd ?? 0, r.p_own_try ?? 0, r.p_own_usd ?? 0,
                        r.p_qty ?? 0, r.p_own_qty ?? 0];
    }
  }
  // Renk ataması sembol sırasına bağlı: alfabetik sıra render'dan render'a
  // değişmez, yani bir varlığın rengi bugün mavi yarın turuncu olmaz.
  return { points: [...byTs.values()], symbols: [...symbols].sort() };
}

// ── Günlük değişim (TR saatiyle bugün 00:00'dan bu yana) ─────────────────
/**
 * Bir enstrümanın bugünkü hareketi. Ölçü TL cinsinden BİRİM DEĞER: dolar
 * kotalı bir varlık dolar bazında yatay dursa bile TL zayıflarsa bu portföy
 * için gerçek bir değişimdir — oran ile tutarın işareti hep uyuşsun diye ikisi
 * de aynı bazdan çıkar (Öne Çıkanlar kartlarıyla da aynı dil).
 *
 * since = ölçünün başladığı gözlem. Normalde gece yarısından önceki son fiyat;
 * enstrüman bugün eklendiyse elimizdeki en erken fiyat.
 */
export interface DayChange { pct: number | null; abs_try: number; own_abs_try: number; since: string }

export async function getDayChanges(): Promise<Record<string, DayChange>> {
  const rows = await q<{
    instrument_id: string; base_ts: string;
    quantity: number; own_quantity: number;
    base_try: number; now_try: number;
  }>(`
    with t0 as (
      -- TR gün başı. date_trunc yerel duvar saatinde çalışsın diye önce
      -- 'at time zone' ile TR'ye çevrilir, sonra geri timestamptz yapılır.
      select (date_trunc('day', now() at time zone 'Europe/Istanbul')) at time zone 'Europe/Istanbul' as ts
    ),
    fx_now as (select rate from fx_rates where base='USD' and quote='TRY' order by ts desc limit 1),
    cand as (
      select i.id as instrument_id,
             coalesce(h.quantity, 0) as quantity, coalesce(h.own_quantity, 0) as own_quantity
      from instruments i
      left join v_holdings h on h.instrument_id = i.id
      where i.is_active
    ),
    b as (
      select c.*, coalesce(bb.ts, ff.ts) as base_ts,
             coalesce(bb.price, ff.price) as base_price,
             coalesce(bb.currency, ff.currency) as base_currency
      from cand c cross join t0
      left join lateral (
        select pr.ts, pr.price, pr.currency from prices pr
        where pr.instrument_id = c.instrument_id and pr.ts <= t0.ts
        order by pr.ts desc limit 1
      ) bb on true
      -- Gece yarısından önce hiç gözlem yoksa (bugün eklenmiş) en erkene düş.
      left join lateral (
        select pr.ts, pr.price, pr.currency from prices pr
        where pr.instrument_id = c.instrument_id
        order by pr.ts asc limit 1
      ) ff on true
    )
    select b.instrument_id, b.base_ts, b.quantity, b.own_quantity,
           b.base_price * case when b.base_currency='USD'
                               then coalesce(fxb.rate, (select rate from fx_now)) else 1 end as base_try,
           lp.price * case when lp.currency='USD' then (select rate from fx_now) else 1 end as now_try
    from b
    join v_latest_price lp on lp.instrument_id = b.instrument_id
    -- Baz anındaki kur: geçmiş bir fiyatı BUGÜNKÜ kurla çevirmek sahte bir
    -- hareket üretirdi.
    left join lateral (
      select fr.rate from fx_rates fr
      where fr.base='USD' and fr.quote='TRY' and fr.ts <= b.base_ts
      order by fr.ts desc limit 1
    ) fxb on true
    -- Baz gözlem AYNI ZAMANDA en güncel gözlemse bugün ölçülecek bir hareket
    -- yok (piyasa kapalı, fon NAV'ı gelmemiş): satır düşer, arayüzde "—".
    where b.base_ts is not null and b.base_ts < lp.price_ts`);

  const out: Record<string, DayChange> = {};
  for (const r of rows) {
    const d = r.now_try - r.base_try;
    out[r.instrument_id] = {
      pct: r.base_try > 0 ? (r.now_try / r.base_try - 1) * 100 : null,
      abs_try: d * r.quantity,
      own_abs_try: d * r.own_quantity,
      since: r.base_ts,
    };
  }
  return out;
}

/** İşlem formu için: tüm aktif enstrümanlar + mevcut adet/emanet durumu. */
export async function getInstruments(): Promise<Instrument[]> {
  return q<Instrument>(`
    select i.id, i.symbol, i.display_name, i.class_code, i.currency,
           coalesce(h.quantity, 0)     as quantity,
           coalesce(h.external_qty, 0) as external_quantity
    from instruments i
    left join v_holdings h on h.instrument_id = i.id
    where i.is_active
    order by i.class_code, i.symbol`);
}

/** Kataloğa eklenmiş ama henüz pozisyonu olmayan enstrümanlar. */
export async function getWatchlist(): Promise<WatchItem[]> {
  return q<WatchItem>(`
    select instrument_id, symbol, display_name, class_code, ui_group, currency,
           created_at, price, price_ts, source
    from v_watchlist
    order by ui_group, symbol`);
}

/** Güncel USD/TRY — TL cinsinden saklanan büyüklükleri USD görünümüne çevirmek için. */
export async function getUsdTry(): Promise<number> {
  const r = await q<{ rate: number }>(
    `select rate from fx_rates where base='USD' and quote='TRY' order by ts desc limit 1`);
  return r[0]?.rate ?? 0;
}

/** Elle girilmiş yıl sonu toplamları — motor öncesi geçmiş (yalnız toplam). */
export interface AnnualClosing { year: number; total_value_try: number; total_value_usd: number | null; note: string | null }

export async function getAnnualClosings(): Promise<AnnualClosing[]> {
  return q<AnnualClosing>(
    `select year, total_value_try, total_value_usd, note from annual_closings order by year`);
}

export async function getAssetClasses(): Promise<AssetClass[]> {
  return q<AssetClass>(`select code, name, ui_group from asset_classes order by sort_order`);
}

export async function getLastFetch(): Promise<{ kind: string; status: string; finished_at: string } | null> {
  const r = await q<{ kind: string; status: string; finished_at: string }>(
    `select kind, status, finished_at from fetch_runs where finished_at is not null order by started_at desc limit 1`);
  return r[0] ?? null;
}

// ── Dönemsel değişim (saat/gün/hafta/ay/çeyrek/yıl) ───────────────────────
// Hem toplam hem own_* için; own görünümünde payda da own alınır (yoksa yanlış oran).
// since = değişimin ÖLÇÜLDÜĞÜ baz gözlemin zamanı. Dönemin tamamına yetecek
// geçmiş yoksa bu, dönem başı değil elimizdeki EN ESKİ gözlemdir; sayı yine
// üretilir, hangi tarihten beri ölçüldüğü buradan okunur (bkz. getPeriodChanges).
export interface Change { abs: number; pct: number | null; since: string | null }
export type PeriodKey = 'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year';
export type PeriodChanges = Record<PeriodKey, { total: Change | null; own: Change | null }>;

export async function getPeriodChanges(): Promise<PeriodChanges> {
  // Dönemsel değişim = O DÖNEMİN BAŞINDA elde olan sepetin bugünkü fiyatlarla
  // değeri − o günkü değeri. İki snapshot'ın toplamını çıkarmak yanlıştı:
  // aradaki para yatırma/çekme de "kazanç" görünüyordu (116.000 TL nakde
  // 36.630 TL eklemek günlük kârı 36.630 TL artırıyordu). Adetler DÖNEM
  // BAŞINDA sabitlenince geriye yalnız fiyat hareketi kalır.
  //
  // Dönem içinde alınan varlık bu ölçüye girmez (o gün elde değildi);
  // tamamen satılan da girmez (bugünkü birim değeri bilinmiyor, satış zaten
  // bir nakit akışı). Kapsam ikisinde de aynı sepet olduğu için oran tutarlı.
  //
  // Dönemin tamamına yetecek geçmiş yoksa "—" YAZILMAZ: elimizdeki en eski
  // gözleme düşülür ve sayı oradan üretilir (piyasa uygulamalarının standardı
  // bu — 3 aylık bir hisseye "1 yıl" dendiğinde 3 aylık grafik gelir). Hangi
  // tarihten ölçüldüğü `since` ile taşınır, arayüzde ipucu olarak görünür.
  const rows = await q<{
    period: PeriodKey; base_ts: string | null;
    base_try: number | null; now_try: number | null;
    base_own: number | null; now_own: number | null;
  }>(`
    with cur as (
      select id, ts from portfolio_snapshots where granularity='hourly' order by ts desc limit 1
    ),
    first_snap as (
      select id, ts from portfolio_snapshots where granularity='hourly' order by ts limit 1
    ),
    periods(k, iv) as (
      values ('hour', interval '1 hour'), ('day', interval '1 day'), ('week', interval '7 days'),
             ('month', interval '30 days'), ('quarter', interval '90 days'), ('year', interval '365 days')
    ),
    bases as (
      -- coalesce = geriye düşüş: dönem başına ait snapshot yoksa en eskisi.
      -- Tek snapshot varken baz = güncel olurdu; o durumda satır elenir
      -- (kendisiyle karşılaştırılan sıfır bir ölçü değil, gürültüdür).
      select p.k,
             coalesce(b.id, f.id) as base_id,
             coalesce(b.ts, f.ts) as base_ts
      from periods p
      cross join cur c
      cross join first_snap f
      left join lateral (
        select ps.id, ps.ts from portfolio_snapshots ps
        where ps.granularity='hourly' and ps.ts <= c.ts - p.iv
        order by ps.ts desc limit 1
      ) b on true
      where coalesce(b.id, f.id) <> c.id
    ),
    -- Bugünkü BİRİM değer (TL cinsinden fiyat). Adet değil fiyat taşınır.
    now_unit as (
      select pos.instrument_id, pos.value_try / nullif(pos.quantity, 0) as unit_try
      from position_snapshots pos join cur c on c.id = pos.snapshot_id
      where pos.quantity <> 0
    )
    select b.k as period, max(b.base_ts) as base_ts,
           sum(bp.value_try)                as base_try,
           sum(bp.quantity * n.unit_try)    as now_try,
           sum(bp.own_value_try)            as base_own,
           sum(bp.own_quantity * n.unit_try) as now_own
    from bases b
    join position_snapshots bp on bp.snapshot_id = b.base_id
    join now_unit n on n.instrument_id = bp.instrument_id
    where n.unit_try is not null
    group by b.k`);

  const mk = (now: number | null, base: number | null, since: string | null): Change | null =>
    now == null || base == null
      ? null
      : { abs: now - base, pct: base ? ((now - base) / base) * 100 : null, since };
  const empty = { total: null, own: null };
  const out: PeriodChanges = {
    hour: empty, day: empty, week: empty, month: empty, quarter: empty, year: empty,
  };
  for (const r of rows) {
    out[r.period] = {
      total: mk(r.now_try, r.base_try, r.base_ts),
      own: mk(r.now_own, r.base_own, r.base_ts),
    };
  }
  return out;
}

// ── Dönem bazında varlık kâr/zararı (öne çıkanlar kartları) ────────────────
// "Alımdan bu yana" değil, SEÇİLEN DÖNEMDE ne oldu sorusunun cevabı.
//
// Ölçü birimi: TL cinsinden birim değer = value_try / quantity. Neden ham
// `price` değil: USD'li bir varlık dolar bazında yatay dursa bile TL zayıflarsa
// bu portföy için gerçek bir kazançtır; value_try ikisini birden içeriyor.
// Adet farkı (dönem içi alım/satım) oranı bozmasın diye birim değer üzerinden
// hesaplanıyor; tutar ise GÜNCEL adetle çarpılıyor.
export interface MoverRow { symbol: string; pct: number; abs: number; own_abs: number }
export type PeriodMovers = Record<PeriodKey, MoverRow[]>;

export async function getPeriodMovers(): Promise<PeriodMovers> {
  const rows = await q<{
    period: PeriodKey; symbol: string;
    quantity: number; own_quantity: number;
    now_unit: number; base_unit: number | null;
  }>(`
    with cur as (
      select id, ts from portfolio_snapshots where granularity='hourly' order by ts desc limit 1
    ),
    first_snap as (
      select id, ts from portfolio_snapshots where granularity='hourly' order by ts limit 1
    ),
    periods(k, iv) as (
      values ('hour', interval '1 hour'), ('day', interval '1 day'), ('week', interval '7 days'),
             ('month', interval '30 days'), ('quarter', interval '90 days'), ('year', interval '365 days')
    ),
    bases as (
      -- getPeriodChanges ile AYNI geriye düşüş: dönem başı yoksa en eski
      -- gözlem. İki kart aynı dönemi gösteriyor, ölçüleri de ayrışmamalı.
      select p.k, coalesce(b.id, f.id) as base_id
      from periods p
      cross join cur c
      cross join first_snap f
      left join lateral (
        select ps.id from portfolio_snapshots ps
        where ps.granularity='hourly' and ps.ts <= c.ts - p.iv
        order by ps.ts desc limit 1
      ) b on true
      where coalesce(b.id, f.id) <> c.id
    ),
    now_pos as (
      -- Birim değer snapshot'tan (dönem başıyla aynı ölçü), ADET ise
      -- v_holdings'ten canlı: tutar "bugün elimde olan adetle bu dönemde ne
      -- kazandım" demek. Snapshot adedi saat başı yazıldığı için az önce
      -- girilen bir işlemi görmüyordu.
      select pos.instrument_id, i.symbol,
             coalesce(h.quantity, pos.quantity)         as quantity,
             coalesce(h.own_quantity, pos.own_quantity) as own_quantity,
             pos.value_try / nullif(pos.quantity, 0) as unit_try
      from position_snapshots pos
      join cur c on c.id = pos.snapshot_id
      join instruments i on i.id = pos.instrument_id
      left join v_holdings h on h.instrument_id = pos.instrument_id
    )
    select b.k as period, n.symbol, n.quantity, n.own_quantity,
           n.unit_try as now_unit,
           bp.value_try / nullif(bp.quantity, 0) as base_unit
    from bases b
    join position_snapshots bp on bp.snapshot_id = b.base_id
    join now_pos n on n.instrument_id = bp.instrument_id
    where n.unit_try is not null`);

  const out = { hour: [], day: [], week: [], month: [], quarter: [], year: [] } as PeriodMovers;
  for (const r of rows) {
    if (r.base_unit == null || r.base_unit === 0) continue;
    const delta = r.now_unit - r.base_unit;
    out[r.period].push({
      symbol: r.symbol,
      pct: (delta / r.base_unit) * 100,
      abs: delta * r.quantity,
      own_abs: delta * r.own_quantity,
    });
  }
  return out;
}

/**
 * Büyüme projeksiyonunun beş sabit senaryo slotu (bkz. migration 0010).
 *
 * `monthly_try` TL cinsindendir — sayfa USD görünümündeyken bileşen güncel
 * kurla çevirir. Slot numarası aynı zamanda grafikteki rengi belirler, o
 * yüzden sıra korunarak okunur.
 */
export interface ProjectionScenario {
  slot: number; name: string; monthly_rate: number; monthly_try: number; months: number;
  // Aylık enflasyon % — geliri böler, gideri çarpar (bkz. migration 0011).
  monthly_inflation: number;
  monthly_expense_try: number;
}

export async function getProjectionScenarios(): Promise<ProjectionScenario[]> {
  return q<ProjectionScenario>(
    `select slot, name, monthly_rate, monthly_try, months,
            monthly_inflation, monthly_expense_try
       from projection_scenarios order by slot`);
}
