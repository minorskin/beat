-- Beat · Şema v19 — harcama ve borç: adet hareketi ile sahiplik hareketi ayrışır
--
-- Üç yeni işlem tipi:
--   expense (Harcama)    : para gitti, geri gelmeyecek.      Toplam ↓, Bana Ait ↓
--   borrow  (Borç Alma)  : para elimde ama benim değil.      Toplam ↑, Bana Ait sabit
--   lend    (Borç Verme) : para elimden çıktı ama hâlâ benim. Toplam ↓, Bana Ait sabit
--
-- Borç, emanetin (0002) aynasıdır: emanet "elimde ama benim değil" demekti;
-- borç alınan para tam olarak budur. Bu yüzden yeni bir kolon ya da tablo
-- gerekmiyor, mevcut sahiplik boyutu ikisini de taşıyor (own = quantity -
-- external_qty):
--
--   borrow: quantity +q, external +q  → own sabit
--   lend  : quantity -q, external -q  → own sabit
--
-- lend'de external NEGATİFE düşer ve bu kasıtlı: "benim olan ama elimde
-- olmayan", emanetin işaret olarak tersidir. Sonuçta Toplam < Bana Ait olabilir
-- — borç verilmiş para portföyde görünmez ama servetten düşmez.
--
-- Emanet payı satırda SAKLANIR, borç payı ADETTEN TÜRETİLİR. Sebep: borçta
-- ikisi tanım gereği eşit; ayrıca yazılsaydı adet düzenlendiğinde ikisi
-- sessizce ayrışabilirdi.
--
-- GERİ ÖDEME ayrı bir tip değil, aynı tipe EKSİ adet:
--   borcu ödemek     → borrow -1000  (elden çıkar, own yine sabit)
--   alacağı tahsil   → lend   -1000  (ele girer,  own yine sabit)
--
-- Maliyet bazı: expense/lend birer ÇIKIŞ, yani sell gibi bazı oranla küçültür
-- — elden çıkan adet kendi payıyla gider, birim maliyet değişmez (bkz. 0013).
-- borrow bir GİRİŞ ama birim fiyatı çoğu zaman girilmez (nakit borcunda "fiyat"
-- diye bir şey yok): o durumda adet O ANKİ ortalama maliyetle içeri alınır,
-- yani ortalama kımıldamaz. 0 fiyatla eklenseydi borç alınan nakit "bedava
-- gelmiş" sayılıp maliyet tabanını çökertir, sahte kâr yazardı.
--
-- Kolon listesi DEĞİŞMEDİ; v_holdings yerinde değiştirilir, v_watchlist
-- düşürülmeye gerek kalmaz.

-- ── 1) Yeni tipler ─────────────────────────────────────────────────────────
alter table transactions
  drop constraint if exists transactions_type_check,
  add  constraint transactions_type_check
       check (type in ('buy','sell','dividend','fee','adjustment','transfer',
                       'expense','borrow','lend'));

comment on column transactions.type is
  'buy/sell: alım-satım · dividend/fee: nakit akışı · adjustment: adet düzeltme · '
  'transfer: saf emanet deltası · expense: harcama (toplam ve bana-ait ↓) · '
  'borrow: borç alma (toplam ↑, bana-ait sabit) · lend: borç verme (toplam ↓, '
  'bana-ait sabit). borrow/lend''de emanet payı adetten türetilir; geri ödeme '
  'aynı tipe eksi adettir.';

-- ── 2) v_holdings: giriş/çıkış kümeleri genişledi ──────────────────────────
create or replace view v_holdings as
with recursive
ledger as (
  select instrument_id, id, executed_at, type,
         quantity::numeric as quantity,
         coalesce(unit_price, 0)::numeric as unit_price,
         coalesce(fee, 0)::numeric as fee,
         external_quantity,
         case when type in ('buy','borrow')          then quantity
              when type in ('sell','expense','lend') then -quantity
              else 0 end::numeric as signed_qty,
         row_number() over (partition by instrument_id order by executed_at, id) as rn
  from transactions
),
-- Yürüyen durum: her işlemden SONRAKİ adet ve toplam maliyet bazı.
walk as (
  select l.instrument_id, l.rn,
         l.signed_qty as qty,
         case when l.type in ('buy','borrow') then l.quantity * l.unit_price + l.fee
              else 0 end as basis
  from ledger l
  where l.rn = 1
  union all
  select l.instrument_id, l.rn,
         w.qty + l.signed_qty,
         case
           when l.type = 'buy' then w.basis + l.quantity * l.unit_price + l.fee
           -- Birim fiyat girilmemişse ortalamayı bozmadan içeri al.
           when l.type = 'borrow' then w.basis + l.fee + l.quantity *
                  (case when l.unit_price > 0 then l.unit_price
                        when w.qty > 0        then w.basis / w.qty
                        else 0 end)
           -- Çıkan adet O ANKİ birim maliyetle gider. Elde kalan hiç yoksa
           -- (ya da eldekinden fazlası çıktıysa) baz sıfırlanır.
           when l.type in ('sell','expense','lend') then case
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
  select instrument_id,
         sum(signed_qty) as delta_qty,
         sum(case when type='buy'      then external_quantity
                  when type='sell'     then -external_quantity
                  when type='transfer' then external_quantity
                  -- Borçta emanet payı = adedin tamamı (bkz. başlık).
                  when type='borrow'   then quantity
                  when type='lend'     then -quantity
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

-- ── 3) İzleme listesi: "elde yok" artık "bana ait de yok" demek ────────────
-- Tamamı borç verilmiş bir varlıkta adet 0'a iner ama own > 0 kalır. Eski
-- koşul onu "pozisyonu yok" sayıp izleme listesine düşürüyordu.
create or replace view v_watchlist as
select i.id as instrument_id, i.symbol, i.display_name, i.class_code,
       i.currency, ac.ui_group, i.created_at,
       lp.price, lp.price_ts, lp.source,
       lp.currency as price_currency, i.calendar_code
from instruments i
join asset_classes ac on ac.code = i.class_code
left join v_latest_price lp on lp.instrument_id = i.id
left join v_holdings h on h.instrument_id = i.id
where i.is_active
  and coalesce(h.quantity, 0) = 0
  and coalesce(h.own_quantity, 0) = 0;
