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
  // Tutuluyor ama motor henüz fiyat çekmedi — bir sonraki turda gelir, o ana kadar değer/K-Z/ağırlık "—".
  pending: boolean;
}
export interface TxRow {
  id: string; instrument_id: string; type: string;
  quantity: number; unit_price: number | null; currency: string;
  executed_at: string; location: string | null; external_quantity: number;
}
export interface HistoryPoint { ts: string; try: number; usd: number; own_try: number; own_usd: number }
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
           h.quantity, ps.price, i.currency, ps.price_ts, coalesce(ps.is_stale, false) as is_stale,
           ps.value_try, ps.value_usd, ps.weight_pct,
           h.own_quantity, ps.own_value_try, ps.own_value_usd, ps.own_weight_pct,
           coalesce(h.external_qty, 0) as external_quantity,
           h.avg_cost,
           (ps.value_try - coalesce(h.avg_cost,0) * h.quantity *
              case when i.currency='USD' then (select rate from fx) else 1 end
           ) as pnl_try,
           (ps.own_value_try - coalesce(h.avg_cost,0) * h.own_quantity *
              case when i.currency='USD' then (select rate from fx) else 1 end
           ) as own_pnl_try,
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

export async function getHistory(range: string): Promise<HistoryPoint[]> {
  const interval: Record<string, string> = {
    '1G': '1 day', '1H': '7 days', '1A': '1 month', '1Y': '1 year', 'TUM': '100 years',
  };
  return q<HistoryPoint>(`
    select ts, total_value_try as try, total_value_usd as usd,
           own_value_try as own_try, own_value_usd as own_usd
    from portfolio_snapshots
    where ts >= now() - ($1)::interval
    order by ts`, [interval[range] ?? '1 month']);
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

export async function getAssetClasses(): Promise<AssetClass[]> {
  return q<AssetClass>(`select code, name, ui_group from asset_classes order by sort_order`);
}

export async function getLastFetch(): Promise<{ kind: string; status: string; finished_at: string } | null> {
  const r = await q<{ kind: string; status: string; finished_at: string }>(
    `select kind, status, finished_at from fetch_runs where finished_at is not null order by started_at desc limit 1`);
  return r[0] ?? null;
}

// ── Dönemsel değişim (gün/hafta/ay/başından beri) ──────────────────────────
// Hem toplam hem own_* için; own görünümünde payda da own alınır (yoksa yanlış oran).
export interface Change { abs: number; pct: number | null }
export interface PeriodChanges {
  day: { total: Change | null; own: Change | null };
  week: { total: Change | null; own: Change | null };
  month: { total: Change | null; own: Change | null };
  all: { total: Change | null; own: Change | null; since: string | null };
}

export async function getPeriodChanges(): Promise<PeriodChanges> {
  const rows = await q<{
    t_now: number; o_now: number;
    t_d: number | null; o_d: number | null;
    t_w: number | null; o_w: number | null;
    t_m: number | null; o_m: number | null;
    t_a: number | null; o_a: number | null; a_ts: string | null;
  }>(`
    with cur as (
      select ts, total_value_try, own_value_try
      from portfolio_snapshots where granularity='hourly' order by ts desc limit 1
    )
    select cur.total_value_try t_now, cur.own_value_try o_now,
      b1.total_value_try t_d,  b1.own_value_try o_d,
      b7.total_value_try t_w,  b7.own_value_try o_w,
      b30.total_value_try t_m, b30.own_value_try o_m,
      bf.total_value_try t_a,  bf.own_value_try o_a, bf.ts a_ts
    from cur
    left join lateral (select total_value_try, own_value_try from portfolio_snapshots
      where granularity='hourly' and ts <= cur.ts - interval '1 day'  order by ts desc limit 1) b1 on true
    left join lateral (select total_value_try, own_value_try from portfolio_snapshots
      where granularity='hourly' and ts <= cur.ts - interval '7 days' order by ts desc limit 1) b7 on true
    left join lateral (select total_value_try, own_value_try from portfolio_snapshots
      where granularity='hourly' and ts <= cur.ts - interval '30 days' order by ts desc limit 1) b30 on true
    left join lateral (select total_value_try, own_value_try, ts from portfolio_snapshots
      where granularity='hourly' order by ts asc limit 1) bf on true`);

  const r = rows[0];
  const mk = (now: number, base: number | null): Change | null =>
    base == null ? null : { abs: now - base, pct: base ? ((now - base) / base) * 100 : null };
  if (!r) {
    const n = { total: null, own: null };
    return { day: n, week: n, month: n, all: { total: null, own: null, since: null } };
  }
  return {
    day: { total: mk(r.t_now, r.t_d), own: mk(r.o_now, r.o_d) },
    week: { total: mk(r.t_now, r.t_w), own: mk(r.o_now, r.o_w) },
    month: { total: mk(r.t_now, r.t_m), own: mk(r.o_now, r.o_m) },
    all: { total: mk(r.t_now, r.t_a), own: mk(r.o_now, r.o_a), since: r.a_ts ?? null },
  };
}
