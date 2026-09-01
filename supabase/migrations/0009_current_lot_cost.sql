-- Beat · Şema v9 — ortalama maliyet YALNIZ AÇIK LOT'tan hesaplanır
--
-- Sorun: v_holdings, avg_cost'u enstrümanın TÜM alışlarının ağırlıklı
-- ortalaması olarak veriyordu. Pozisyon bir kez tamamen satılıp (adet sıfır)
-- yeniden alındığında, artık geçerli olmayan eski alış fiyatları maliyete
-- karışıyor: 100@10 al → hepsini sat → 50@20 al senaryosunda maliyet 20 değil
-- 13,33 çıkıyor, Varlık tablosundaki K/Z sütunu da bu yüzden yanlış oluyordu.
--
-- Çözüm: işlemleri imzalı adetle biriktirip adet sıfıra her indiğinde yeni bir
-- "segment" (lot) başlat; maliyeti yalnız EN GÜNCEL segmentin alışlarından
-- hesapla. Arayüzün Açılış/Kapanış sütunları da aynı segment mantığını
-- kullanıyor — böylece "bu lot ne zaman açıldı" ile "bu lotun maliyeti"
-- aynı şeyi anlatır.
--
-- Adet, emanet ve diğer kolonlar DEĞİŞMEDİ. Hiç satış yapılmamış bir
-- enstrümanda sonuç eskisiyle bire bir aynıdır (tek segment vardır).
--
-- create or replace: kolon listesi aynı kaldığı için v_holdings'e bağlı
-- v_watchlist görünümü düşürülmeden yerinde güncellenir.

create or replace view v_holdings as
with ledger as (
  select instrument_id, id, executed_at, type, quantity, unit_price, fee, external_quantity,
         case when type='buy' then quantity when type='sell' then -quantity else 0 end as signed_qty
  from transactions
), running as (
  select *, sum(signed_qty) over (partition by instrument_id order by executed_at, id) as running_qty
  from ledger
), segmented as (
  -- Adedin sıfırlandığı satır KAPANAN lota aittir; bir sonraki satır yeni lotu açar.
  -- coalesce ŞART: ilk satırda pencere çerçevesi boş olduğu için sum() null döner;
  -- null segment hiçbir eşitliği sağlamaz ve o alışlar maliyetten düşerdi.
  select *,
         coalesce(sum(case when running_qty = 0 then 1 else 0 end)
           over (partition by instrument_id order by executed_at, id
                 rows between unbounded preceding and 1 preceding), 0) as segment_id
  from running
), cur_seg as (
  select instrument_id, max(segment_id) as segment_id from segmented group by instrument_id
), agg as (
  select s.instrument_id,
         sum(s.signed_qty) as delta_qty,
         sum(case when s.type='buy'      then s.external_quantity
                  when s.type='sell'     then -s.external_quantity
                  when s.type='transfer' then s.external_quantity
                  else 0 end) as external_qty,
         -- Maliyet yalnız açık lottan; adet ve emanet TÜM geçmişten.
         sum(case when s.type='buy' and s.segment_id = c.segment_id
                  then s.quantity * coalesce(s.unit_price, 0) + s.fee else 0 end) as gross_cost,
         sum(case when s.type='buy' and s.segment_id = c.segment_id
                  then s.quantity else 0 end) as bought_qty
  from segmented s
  join cur_seg c on c.instrument_id = s.instrument_id
  group by s.instrument_id
)
select i.id as instrument_id, i.symbol, i.display_name, i.class_code, i.currency,
       coalesce(a.delta_qty, 0) as quantity,
       coalesce(a.external_qty, 0) as external_qty,
       coalesce(a.delta_qty, 0) - coalesce(a.external_qty, 0) as own_quantity,
       case when coalesce(a.bought_qty, 0) > 0 then a.gross_cost / a.bought_qty end as avg_cost
from instruments i left join agg a on a.instrument_id = i.id
where i.is_active;
