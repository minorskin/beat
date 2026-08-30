-- Beat · Şema v2 — kısmi sahiplik (emanet) + izleme listesi
--
-- Sorun: bir pozisyondaki adedin tamamı bana ait olmayabilir; bir kısmını
-- başkası adına tutuyorum. Aynı enstrümanı iki kez kaydetmek maliyet bazını
-- bozardı, o yüzden sahiplik AYRI BİR BOYUT olarak işleniyor.
--
-- İlkeler:
--   1) transactions hâlâ tek doğruluk kaynağı. Her işlem satırı, o işlemdeki
--      adetin bana ait OLMAYAN kısmını (external_quantity) de taşır.
--   2) own = quantity - external_qty. Türetilmiş; hiçbir yerde ayrıca girilmez.
--   3) Snapshot'lar HEM toplam HEM bana-ait büyüklüğü saklar; böylece
--      "sadece bana ait" görünümü geçmiş grafiklerde de doğru çalışır.
--   4) İzleme listesi ayrı tablo değil: kataloğa eklenmiş ama pozisyonu
--      olmayan enstrüman = izlenen enstrüman. İlk alım yapıldığında
--      kendiliğinden pozisyona dönüşür.

-- ── 1) İşlem satırına sahiplik payı ────────────────────────────────────────
alter table transactions
  add column if not exists external_quantity numeric(28,10) not null default 0;

comment on column transactions.external_quantity is
  'Bu işlemdeki adetin başkası adına tutulan (emanet) kısmı. '
  '''transfer'' tipinde adet değişmez, yalnız emanet deltası taşınır (negatif olabilir).';

-- ── 2) v_holdings: sahiplik boyutu eklendi ─────────────────────────────────
-- 'transfer' artık anlamlı: adede dokunmadan emanet payını düzeltir.
drop view if exists v_holdings;
create view v_holdings as
with agg as (
  select instrument_id,
         sum(case when type='buy'  then quantity
                  when type='sell' then -quantity
                  else 0 end) as delta_qty,
         sum(case when type='buy'      then external_quantity
                  when type='sell'     then -external_quantity
                  when type='transfer' then external_quantity
                  else 0 end) as external_qty,
         sum(case when type='buy' then quantity*coalesce(unit_price,0)+fee else 0 end) as gross_cost,
         sum(case when type='buy' then quantity else 0 end) as bought_qty
  from transactions group by instrument_id
)
select i.id as instrument_id, i.symbol, i.display_name, i.class_code, i.currency,
       coalesce(a.delta_qty,0) as quantity,
       coalesce(a.external_qty,0) as external_qty,
       coalesce(a.delta_qty,0) - coalesce(a.external_qty,0) as own_quantity,
       case when coalesce(a.bought_qty,0) > 0 then a.gross_cost / a.bought_qty end as avg_cost
from instruments i left join agg a on a.instrument_id = i.id
where i.is_active;

-- ── 3) Snapshot'lara bana-ait büyüklükler ──────────────────────────────────
alter table portfolio_snapshots
  add column if not exists own_value_try          numeric(28,10) not null default 0,
  add column if not exists own_value_usd          numeric(28,10) not null default 0,
  add column if not exists own_cost_try           numeric(28,10) not null default 0,
  add column if not exists own_unrealized_pnl_try numeric(28,10) not null default 0;

-- Geçmiş snapshot'lar emanet kaydı yokken alındı: tamamı bana ait sayılır.
update portfolio_snapshots
   set own_value_try = total_value_try,
       own_value_usd = total_value_usd,
       own_cost_try  = total_cost_try,
       own_unrealized_pnl_try = unrealized_pnl_try
 where own_value_try = 0 and total_value_try <> 0;

alter table position_snapshots
  add column if not exists own_quantity   numeric(28,10) not null default 0,
  add column if not exists own_value_try  numeric(28,10) not null default 0,
  add column if not exists own_value_usd  numeric(28,10) not null default 0,
  add column if not exists own_weight_pct numeric(9,4)   not null default 0;

update position_snapshots
   set own_quantity   = quantity,
       own_value_try  = value_try,
       own_value_usd  = value_usd,
       own_weight_pct = weight_pct
 where own_quantity = 0 and quantity <> 0;

-- ── 4) İzleme listesi görünümü ─────────────────────────────────────────────
-- Kataloğa eklenmiş, fiyatı çekilen, ama henüz pozisyonu olmayan enstrümanlar.
create or replace view v_watchlist as
select i.id as instrument_id, i.symbol, i.display_name, i.class_code,
       i.currency, ac.ui_group, i.created_at,
       lp.price, lp.price_ts, lp.source
from instruments i
join asset_classes ac on ac.code = i.class_code
left join v_latest_price lp on lp.instrument_id = i.id
left join v_holdings h on h.instrument_id = i.id
where i.is_active and coalesce(h.quantity,0) = 0;
