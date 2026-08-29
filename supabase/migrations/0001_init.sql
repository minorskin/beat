-- Beat · Finansal Portföy Takip · Şema v1
-- Tasarım ilkeleri:
--   1) transactions tek doğruluk kaynağıdır; holdings ondan türetilir.
--   2) prices SADECE gerçekten gözlemlenen tick'leri tutar; sentetik satır yazılmaz.
--   3) Taşınan (carry-forward) fiyat position_snapshots'ta is_stale ile işaretlenir.
--   4) Yeni varlık sınıfı / veri kaynağı eklemek migration gerektirmez (tablo tabanlı katalog).

create extension if not exists pgcrypto;

-- ── Katalog ────────────────────────────────────────────────────────────────
create table asset_classes (
  code             text primary key,          -- 'stock_us','stock_tr','etf_us','fund_tr','gold','fx','crypto'
  name             text not null,
  default_currency text not null,
  qty_precision    int  not null default 8,
  ui_group         text not null,
  sort_order       int  not null default 100
);

-- Piyasa takvimi: her enstrümanın kendi ritmi var (bkz. cadence).
create table market_calendars (
  code       text primary key,                -- 'CRYPTO_24_7','BIST','NYSE','FX_24_5','TEFAS_DAILY'
  tz         text not null,
  open_time  time,                            -- null => 7/24
  close_time time,
  weekdays   int[] not null default '{1,2,3,4,5}',  -- ISO: 1=Pzt .. 7=Paz
  holidays   jsonb not null default '[]'::jsonb
);

create table instruments (
  id            uuid primary key default gen_random_uuid(),
  class_code    text not null references asset_classes(code),
  symbol        text not null unique,          -- kanonik: 'AAPL','THYAO','THF','XAUTRY_GRAM'
  display_name  text not null,
  currency      text not null,                 -- fiyatın PARA BİRİMİ ('USD','TRY')
  calendar_code text not null references market_calendars(code),
  cadence       text not null default 'market_hours'
                check (cadence in ('hourly','market_hours','daily_close')),
  is_active     boolean not null default true,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);
create index on instruments (class_code) where is_active;

-- Bir enstrüman N kaynaktan çekilebilir; priority failover sırasıdır.
create table instrument_sources (
  instrument_id   uuid not null references instruments(id) on delete cascade,
  provider_id     text not null,               -- 'yahoo','tefas','coingecko','tcmb','truncgil',...
  provider_symbol text not null,               -- kaynağın kendi sembolü: 'THYAO.IS','bitcoin','THF'
  priority        int  not null default 100,
  is_active       boolean not null default true,
  primary key (instrument_id, provider_id)
);

-- ── Kullanıcı girdisi ──────────────────────────────────────────────────────
create table transactions (
  id            uuid primary key default gen_random_uuid(),
  instrument_id uuid not null references instruments(id) on delete cascade,
  type          text not null check (type in ('buy','sell','dividend','fee','adjustment','transfer')),
  quantity      numeric(28,10) not null,       -- adjustment: mutlak hedef adet; diğerleri: delta
  unit_price    numeric(28,10),                -- adjustment/fee için null olabilir
  currency      text not null,
  fee           numeric(28,10) not null default 0,
  executed_at   timestamptz not null,
  note          text,
  created_at    timestamptz not null default now()
);
create index on transactions (instrument_id, executed_at);

-- ── Motor çıktısı (yalnızca gözlemlenen veri) ──────────────────────────────
create table prices (
  instrument_id uuid not null references instruments(id) on delete cascade,
  ts            timestamptz not null,
  price         numeric(28,10) not null,
  currency      text not null,
  source        text not null,
  primary key (instrument_id, ts)
);
create index on prices (instrument_id, ts desc);

create table fx_rates (
  base   text not null,
  quote  text not null,
  ts     timestamptz not null,
  rate   numeric(28,10) not null,
  source text not null,
  primary key (base, quote, ts)
);
create index on fx_rates (base, quote, ts desc);

-- ── Snapshot ───────────────────────────────────────────────────────────────
create table portfolio_snapshots (
  id                 uuid primary key default gen_random_uuid(),
  ts                 timestamptz not null,
  granularity        text not null check (granularity in ('hourly','eod')),
  session_date       date,                     -- yalnız eod: hangi işlem gününü temsil ediyor
  total_value_try    numeric(28,10) not null,
  total_value_usd    numeric(28,10) not null,
  total_cost_try     numeric(28,10) not null,
  unrealized_pnl_try numeric(28,10) not null,
  unique (granularity, ts)
);
create unique index on portfolio_snapshots (session_date) where granularity = 'eod';

create table position_snapshots (
  snapshot_id   uuid not null references portfolio_snapshots(id) on delete cascade,
  instrument_id uuid not null references instruments(id) on delete cascade,
  quantity      numeric(28,10) not null,
  price         numeric(28,10) not null,
  price_ts      timestamptz not null,          -- fiyat GERÇEKTE ne zaman gözlendi
  is_stale      boolean not null default false,-- taşınmış (carry-forward) fiyat mı
  value_try     numeric(28,10) not null,
  value_usd     numeric(28,10) not null,
  weight_pct    numeric(9,4)   not null,
  primary key (snapshot_id, instrument_id)
);

-- ── Gözlemlenebilirlik ─────────────────────────────────────────────────────
create table fetch_runs (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null,                   -- 'hourly','eod','backfill','probe'
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  status      text not null default 'running' check (status in ('running','ok','partial','failed')),
  ok_count    int not null default 0,
  fail_count  int not null default 0,
  detail      jsonb not null default '{}'::jsonb
);
create index on fetch_runs (kind, started_at desc);

create table provider_health (
  id          bigserial primary key,
  provider_id text not null,
  ts          timestamptz not null default now(),
  status      text not null check (status in ('ok','degraded','down')),
  latency_ms  int,
  error       text
);
create index on provider_health (provider_id, ts desc);

-- ── Türetilmiş görünümler ──────────────────────────────────────────────────
-- Son gözlemlenen fiyat (carry-forward'ın kaynağı)
create view v_latest_price as
select distinct on (instrument_id) instrument_id, ts as price_ts, price, currency, source
from prices order by instrument_id, ts desc;

-- Pozisyonlar: adjustment mutlak hedef, diğerleri delta olarak işlenir
create view v_holdings as
with ordered as (
  select instrument_id, type, quantity, unit_price, fee, executed_at,
         row_number() over (partition by instrument_id order by executed_at, id) rn
  from transactions
), agg as (
  select instrument_id,
         sum(case when type='buy' then quantity
                  when type='sell' then -quantity
                  else 0 end) as delta_qty,
         max(case when type='adjustment' then executed_at end) as last_adj_at,
         sum(case when type='buy' then quantity*coalesce(unit_price,0)+fee else 0 end) as gross_cost,
         sum(case when type='buy' then quantity else 0 end) as bought_qty
  from ordered group by instrument_id
)
select i.id as instrument_id, i.symbol, i.display_name, i.class_code, i.currency,
       coalesce(a.delta_qty,0) as quantity,
       case when coalesce(a.bought_qty,0) > 0 then a.gross_cost / a.bought_qty end as avg_cost
from instruments i left join agg a on a.instrument_id = i.id
where i.is_active;
