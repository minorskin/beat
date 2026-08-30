import { q } from './db';

export interface Snapshot {
  ts: string; total_value_try: number; total_value_usd: number;
  total_cost_try: number; unrealized_pnl_try: number;
  // Sahiplik boyutu: emanet (başkası adına tutulan) pay düşüldükten sonrası
  own_value_try: number; own_value_usd: number;
  own_cost_try: number; own_unrealized_pnl_try: number;
}
export interface Position {
  symbol: string; display_name: string; class_code: string; ui_group: string;
  quantity: number; price: number; currency: string; price_ts: string;
  is_stale: boolean; value_try: number; value_usd: number; weight_pct: number;
  avg_cost: number | null; pnl_try: number; pnl_pct: number | null;
  external_quantity: number; own_quantity: number;
  own_value_try: number; own_value_usd: number; own_weight_pct: number; own_pnl_try: number;
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
         fx as (select rate from fx_rates where base='USD' and quote='TRY' order by ts desc limit 1)
    select i.symbol, i.display_name, i.class_code, ac.ui_group,
           ps.quantity, ps.price, i.currency, ps.price_ts, ps.is_stale,
           ps.value_try, ps.value_usd, ps.weight_pct,
           ps.own_quantity, ps.own_value_try, ps.own_value_usd, ps.own_weight_pct,
           coalesce(h.external_qty, 0) as external_quantity,
           h.avg_cost,
           (ps.value_try - coalesce(h.avg_cost,0) * ps.quantity *
              case when i.currency='USD' then (select rate from fx) else 1 end
           ) as pnl_try,
           (ps.own_value_try - coalesce(h.avg_cost,0) * ps.own_quantity *
              case when i.currency='USD' then (select rate from fx) else 1 end
           ) as own_pnl_try,
           case when h.avg_cost > 0 then
             ((ps.price - h.avg_cost) / h.avg_cost) * 100 end as pnl_pct
    from position_snapshots ps
    join latest l on l.id = ps.snapshot_id
    join instruments i on i.id = ps.instrument_id
    join asset_classes ac on ac.code = i.class_code
    left join v_holdings h on h.instrument_id = ps.instrument_id
    order by ps.value_try desc`);
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
