-- Beat · Şema v13 — ortalama maliyete SATIŞLAR da ağırlığıyla girer
--
-- 0009 maliyeti "açık lot'un ALIŞLARININ ağırlıklı ortalaması" yapmıştı. Bu,
-- lot tamamen kapanıp yeniden açıldığı durumu düzeltiyordu ama lot İÇİNDEKİ
-- kısmi satışları görmüyordu:
--
--     100 adet @10 al · 50 adet sat · 50 adet @20 al
--     0009      → (100×10 + 50×20) / 150 = 13,33   ← satılan 50 hâlâ ortalamayı çekiyor
--     bu göç    → 15,00                            ← doğru
--
-- Doğru ölçü YÜRÜYEN AĞIRLIKLI ORTALAMA (moving weighted average):
--   alış  : maliyet += adet×fiyat + masraf ;  adet += alınan
--   satış : adet -= satılan ;  maliyet -= satılan × (o anki birim maliyet)
--
-- Satış birim maliyeti DEĞİŞTİRMEZ, yalnız toplam bazı orantılı küçültür —
-- elden çıkan adet kendi payıyla birlikte gider. Adet sıfıra indiğinde baz da
-- kendiliğinden sıfırlanır, yani 0009'un segment sıfırlaması bedavaya gelir:
-- hiç satış yapılmamış bir enstrümanda sonuç 0009 ile bire bir aynıdır.
--
-- Sıra bağımlı bir birikim olduğu için pencere fonksiyonu yetmez (her adım bir
-- öncekinin ortalamasına bakar), recursive CTE şart. transactions küçük bir
-- tablo, maliyeti önemsiz.
--
-- Satış masrafı baza girmez: o gerçekleşmiş K/Z kalemidir, elde kalan adedin
-- maliyeti değil. Alış masrafı (fee) baza girer — 0009'daki gibi.
--
-- ADET, EMANET ve kolon listesi DEĞİŞMEDİ; v_watchlist bu yüzden düşürülmeden
-- yerinde güncellenir.

create or replace view v_holdings as
with recursive
ledger as (
  select instrument_id, id, executed_at, type,
         quantity::numeric as quantity,
         coalesce(unit_price, 0)::numeric as unit_price,
         coalesce(fee, 0)::numeric as fee,
         external_quantity,
         case when type='buy' then quantity when type='sell' then -quantity else 0 end::numeric as signed_qty,
         row_number() over (partition by instrument_id order by executed_at, id) as rn
  from transactions
),
-- Yürüyen durum: her işlemden SONRAKİ adet ve toplam maliyet bazı.
walk as (
  select l.instrument_id, l.rn,
         l.signed_qty as qty,
         case when l.type='buy' then l.quantity * l.unit_price + l.fee else 0 end as basis
  from ledger l
  where l.rn = 1
  union all
  select l.instrument_id, l.rn,
         w.qty + l.signed_qty,
         case
           when l.type = 'buy'  then w.basis + l.quantity * l.unit_price + l.fee
           -- Satılan adet O ANKİ birim maliyetle çıkar. Elde kalan hiç yoksa
           -- (ya da eldekinden fazlası satıldıysa) baz sıfırlanır.
           when l.type = 'sell' then case
                                       when w.qty > 0
                                         then greatest(w.basis - l.quantity * (w.basis / w.qty), 0)
                                       else 0
                                     end
           else w.basis
         end
  from walk w
  join ledger l on l.instrument_id = w.instrument_id and l.rn = w.rn + 1
),
last_state as (
  select distinct on (instrument_id) instrument_id, qty, basis
  from walk
  order by instrument_id, rn desc
),
agg as (
  -- Adet ve emanet 0009'daki hesabın AYNISI; yalnız maliyet değişti.
  select instrument_id,
         sum(signed_qty) as delta_qty,
         sum(case when type='buy'      then external_quantity
                  when type='sell'     then -external_quantity
                  when type='transfer' then external_quantity
                  else 0 end) as external_qty
  from ledger
  group by instrument_id
)
select i.id as instrument_id, i.symbol, i.display_name, i.class_code, i.currency,
       coalesce(a.delta_qty, 0) as quantity,
       coalesce(a.external_qty, 0) as external_qty,
       coalesce(a.delta_qty, 0) - coalesce(a.external_qty, 0) as own_quantity,
       case when coalesce(s.qty, 0) > 0 and s.basis > 0 then s.basis / s.qty end as avg_cost
from instruments i
left join agg a on a.instrument_id = i.id
left join last_state s on s.instrument_id = i.id
where i.is_active;
