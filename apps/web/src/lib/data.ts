import { q } from './db';

export interface Snapshot {
  ts: string; total_value_try: number; total_value_usd: number;
  total_cost_try: number; unrealized_pnl_try: number;
}
export interface Position {
  symbol: string; display_name: string; class_code: string; ui_group: string;
  quantity: number; price: number; currency: string; price_ts: string;
  is_stale: boolean; value_try: number; value_usd: number; weight_pct: number;
  avg_cost: number | null; pnl_try: number; pnl_pct: number | null;
}
export interface HistoryPoint { ts: string; try: number; usd: number }
export interface Instrument { id: string; symbol: string; display_name: string; class_code: string; currency: string }

export async function getLatestSnapshot(): Promise<Snapshot | null> {
  const r = await q<Snapshot>(
    `select ts, total_value_try, total_value_usd, total_cost_try, unrealized_pnl_try
     from portfolio_snapshots order by ts desc limit 1`);
  return r[0] ?? null;
}

export async function getPositions(): Promise<Position[]> {
  return q<Position>(`
    with latest as (select id from portfolio_snapshots order by ts desc limit 1)
    select i.symbol, i.display_name, i.class_code, ac.ui_group,
           ps.quantity, ps.price, i.currency, ps.price_ts, ps.is_stale,
           ps.value_try, ps.value_usd, ps.weight_pct,
           h.avg_cost,
           (ps.value_try - coalesce(h.avg_cost,0) * ps.quantity *
              case when i.currency='USD' then (select rate from fx_rates where base='USD' and quote='TRY' order by ts desc limit 1) else 1 end
           ) as pnl_try,
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
    select ts, total_value_try as try, total_value_usd as usd
    from portfolio_snapshots
    where ts >= now() - ($1)::interval
    order by ts`, [interval[range] ?? '1 month']);
}

export async function getInstruments(): Promise<Instrument[]> {
  return q<Instrument>(
    `select id, symbol, display_name, class_code, currency from instruments where is_active order by class_code, symbol`);
}

export async function getLastFetch(): Promise<{ kind: string; status: string; finished_at: string } | null> {
  const r = await q<{ kind: string; status: string; finished_at: string }>(
    `select kind, status, finished_at from fetch_runs where finished_at is not null order by started_at desc limit 1`);
  return r[0] ?? null;
}
