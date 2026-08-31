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
  external_quantity: number; own_quantity: number;
  own_value_try: number | null; own_value_usd: number | null; own_weight_pct: number | null; own_pnl_try: number | null;
  // Güncel (açık) lot'un açılış/kapanış tarihi + kullanılan konumlar — transactions'tan hesaplanır.
  opened_at: string | null; closed_at: string | null; locations: string[];
  // Kâr üzerinden kesilecek vergi oranı (%) — girilmemişse null.
  tax_rate: number | null;
  // Tutuluyor ama motor henüz fiyat çekmedi — bir sonraki turda gelir, o ana kadar değer/K-Z/ağırlık "—".
  pending: boolean;
}
export interface TxRow {
  id: string; instrument_id: string; type: string;
  quantity: number; unit_price: number | null; currency: string;
  executed_at: string; location: string | null; external_quantity: number;
}
export interface SeriesPoint {
  ts: string; try: number; usd: number; own_try: number; own_usd: number;
  /** sembol → [value_try, value_usd, own_value_try, own_value_usd] */
  s: Record<string, [number, number, number, number]>;
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
    with latest as (select id from portfolio_snapshots order by ts desc limit 1),
         latest_ps as (select ps.* from position_snapshots ps join latest l on l.id = ps.snapshot_id),
         fx as (select rate from fx_rates where base='USD' and quote='TRY' order by ts desc limit 1),
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
           select *,
             sum(case when running_qty = 0 then 1 else 0 end)
               over (partition by instrument_id order by executed_at, id rows between unbounded preceding and 1 preceding) as segment_id
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
         )
    -- v_holdings tahrik eder: elde tutulan HER şey listelenir, motor fiyatı henüz
    -- çekmemiş olsa bile (snapshot yoksa fiyat/değer/ağırlık null → arayüzde "—"/"bekliyor").
    select i.id as instrument_id, i.symbol, i.display_name, i.class_code, ac.name as class_name, ac.ui_group,
           i.tax_rate,
           h.quantity, ps.price, i.currency, ps.price_ts, coalesce(ps.is_stale, false) as is_stale,
           ps.value_try, ps.value_usd, ps.weight_pct,
           h.own_quantity, ps.own_value_try, ps.own_value_usd, ps.own_weight_pct,
           coalesce(h.external_qty, 0) as external_quantity,
           h.avg_cost,
           -- Alış fiyatı girilmemişse maliyet 0 DEĞİL meçhuldür: K/Z null kalır,
           -- yoksa varlığın tamamı kâr gibi görünür.
           case when h.avg_cost > 0 then
             ps.value_try - h.avg_cost * h.quantity *
               case when i.currency='USD' then (select rate from fx) else 1 end
           end as pnl_try,
           case when h.avg_cost > 0 then
             ps.own_value_try - h.avg_cost * h.own_quantity *
               case when i.currency='USD' then (select rate from fx) else 1 end
           end as own_pnl_try,
           case when h.avg_cost > 0 and ps.price is not null then
             ((ps.price - h.avg_cost) / h.avg_cost) * 100 end as pnl_pct,
           cs.opened_at, cs.closed_at, coalesce(cs.locations, '{}') as locations,
           (ps.instrument_id is null) as pending
    from v_holdings h
    join instruments i on i.id = h.instrument_id
    join asset_classes ac on ac.code = i.class_code
    left join latest_ps ps on ps.instrument_id = h.instrument_id
    left join current_segment cs on cs.instrument_id = h.instrument_id
    where h.quantity <> 0
    order by ps.value_try desc nulls last`);
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

// Aralık → geriye bakış penceresi. Kova genişliği burada SABİT DEĞİL; aşağıda
// elimizdeki verinin gerçek uzunluğundan türetiliyor (bkz. sorgudaki `b`).
const RANGE_INTERVAL: Record<string, string> = {
  'S': '1 hour', 'G': '1 day', 'H': '7 days', 'A': '30 days', '3A': '90 days', '1Y': '365 days',
};/**
 * Portföy geçmişi + her enstrümanın kendi değer serisi.
 * Kova başına SON snapshot alınır (ortalama değil) — böylece son nokta
 * her zaman gerçekten gözlenmiş bir andır, uydurma bir ara değer değil.
 */
export async function getHistory(range: string): Promise<HistoryBundle> {
  const interval = RANGE_INTERVAL[range] ?? RANGE_INTERVAL['A'];
  const rows = await q<{
    ts: string; t_try: number; t_usd: number; o_try: number; o_usd: number;
    symbol: string | null; p_try: number | null; p_usd: number | null;
    p_own_try: number | null; p_own_usd: number | null;
  }>(`
    with win as (
      select id, ts, total_value_try, total_value_usd, own_value_try, own_value_usd
      from portfolio_snapshots
      where ts >= now() - ($1)::interval
    ),
    b as (
      -- Kova, aralığın NOMİNAL uzunluğundan değil verinin GERÇEK uzunluğundan
      -- türetiliyor (~120 nokta hedefi). Aksi halde portföy 1 günlükken "1Y"
      -- seçilince her şey tek kovaya düşüyor, tek noktalı çizgi de çizilmiyor.
      select greatest(60, coalesce(extract(epoch from (max(ts) - min(ts))), 0) / 120) as bucket
      from win
    ),
    snaps as (
      select distinct on (floor(extract(epoch from w.ts) / b.bucket))
        w.id, w.ts, w.total_value_try, w.total_value_usd, w.own_value_try, w.own_value_usd
      from win w cross join b
      order by floor(extract(epoch from w.ts) / b.bucket), w.ts desc
    )
    select s.ts,
           s.total_value_try t_try, s.total_value_usd t_usd,
           s.own_value_try o_try,   s.own_value_usd o_usd,
           i.symbol, pos.value_try p_try, pos.value_usd p_usd,
           pos.own_value_try p_own_try, pos.own_value_usd p_own_usd
    from snaps s
    left join position_snapshots pos on pos.snapshot_id = s.id
    left join instruments i on i.id = pos.instrument_id
    order by s.ts`, [interval]);

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
      pt.s[r.symbol] = [r.p_try ?? 0, r.p_usd ?? 0, r.p_own_try ?? 0, r.p_own_usd ?? 0];
    }
  }
  // Renk ataması sembol sırasına bağlı: alfabetik sıra render'dan render'a
  // değişmez, yani bir varlığın rengi bugün mavi yarın turuncu olmaz.
  return { points: [...byTs.values()], symbols: [...symbols].sort() };
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
export interface Change { abs: number; pct: number | null }
export type PeriodKey = 'hour' | 'day' | 'week' | 'month' | 'quarter' | 'year';
export type PeriodChanges = Record<PeriodKey, { total: Change | null; own: Change | null }>;

export async function getPeriodChanges(): Promise<PeriodChanges> {
  const rows = await q<{
    t_now: number; o_now: number;
    t_h: number | null; o_h: number | null;
    t_d: number | null; o_d: number | null;
    t_w: number | null; o_w: number | null;
    t_m: number | null; o_m: number | null;
    t_q: number | null; o_q: number | null;
    t_y: number | null; o_y: number | null;
  }>(`
    with cur as (
      select ts, total_value_try, own_value_try
      from portfolio_snapshots where granularity='hourly' order by ts desc limit 1
    )
    select cur.total_value_try t_now, cur.own_value_try o_now,
      bh.total_value_try t_h,  bh.own_value_try o_h,
      b1.total_value_try t_d,  b1.own_value_try o_d,
      b7.total_value_try t_w,  b7.own_value_try o_w,
      b30.total_value_try t_m, b30.own_value_try o_m,
      b90.total_value_try t_q, b90.own_value_try o_q,
      b365.total_value_try t_y, b365.own_value_try o_y
    from cur
    left join lateral (select total_value_try, own_value_try from portfolio_snapshots
      where granularity='hourly' and ts <= cur.ts - interval '1 hour'   order by ts desc limit 1) bh on true
    left join lateral (select total_value_try, own_value_try from portfolio_snapshots
      where granularity='hourly' and ts <= cur.ts - interval '1 day'    order by ts desc limit 1) b1 on true
    left join lateral (select total_value_try, own_value_try from portfolio_snapshots
      where granularity='hourly' and ts <= cur.ts - interval '7 days'   order by ts desc limit 1) b7 on true
    left join lateral (select total_value_try, own_value_try from portfolio_snapshots
      where granularity='hourly' and ts <= cur.ts - interval '30 days'  order by ts desc limit 1) b30 on true
    left join lateral (select total_value_try, own_value_try from portfolio_snapshots
      where granularity='hourly' and ts <= cur.ts - interval '90 days'  order by ts desc limit 1) b90 on true
    left join lateral (select total_value_try, own_value_try from portfolio_snapshots
      where granularity='hourly' and ts <= cur.ts - interval '365 days' order by ts desc limit 1) b365 on true`);

  const r = rows[0];
  const mk = (now: number, base: number | null): Change | null =>
    base == null ? null : { abs: now - base, pct: base ? ((now - base) / base) * 100 : null };
  const empty = { total: null, own: null };
  if (!r) {
    return { hour: empty, day: empty, week: empty, month: empty, quarter: empty, year: empty };
  }
  return {
    hour:    { total: mk(r.t_now, r.t_h), own: mk(r.o_now, r.o_h) },
    day:     { total: mk(r.t_now, r.t_d), own: mk(r.o_now, r.o_d) },
    week:    { total: mk(r.t_now, r.t_w), own: mk(r.o_now, r.o_w) },
    month:   { total: mk(r.t_now, r.t_m), own: mk(r.o_now, r.o_m) },
    quarter: { total: mk(r.t_now, r.t_q), own: mk(r.o_now, r.o_q) },
    year:    { total: mk(r.t_now, r.t_y), own: mk(r.o_now, r.o_y) },
  };
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
    periods(k, iv) as (
      values ('hour', interval '1 hour'), ('day', interval '1 day'), ('week', interval '7 days'),
             ('month', interval '30 days'), ('quarter', interval '90 days'), ('year', interval '365 days')
    ),
    bases as (
      select p.k, b.id as base_id
      from periods p
      cross join cur c
      left join lateral (
        select ps.id from portfolio_snapshots ps
        where ps.granularity='hourly' and ps.ts <= c.ts - p.iv
        order by ps.ts desc limit 1
      ) b on true
    ),
    now_pos as (
      select pos.instrument_id, i.symbol, pos.quantity, pos.own_quantity,
             pos.value_try / nullif(pos.quantity, 0) as unit_try
      from position_snapshots pos
      join cur c on c.id = pos.snapshot_id
      join instruments i on i.id = pos.instrument_id
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
