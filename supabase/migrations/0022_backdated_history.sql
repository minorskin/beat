-- Beat · Şema v22 — geriye dönük işlem GEÇMİŞİ de düzeltsin
--
-- Sorun: portfolio_snapshots/position_snapshots saat başı yazılan TARİHSEL
-- kayıtlar. v_holdings'in zaman filtresi yok — motor her turda "şu an elimde ne
-- var" diye bakıyor. Bu yüzden bir işlemin tarihi geriye çekildiğinde (ya da
-- geçmişe dönük yeni bir işlem girildiğinde) canlı sayılar anında düzeliyor ama
-- grafik/dönemsel kartlar işlemi hâlâ DEFTERE GİRDİĞİ anda gösteriyordu.
--
-- Çözüm üç parça:
--   1) v_holdings_walk — defterin yürüyen durumu (her işlemden SONRAKİ adet,
--      emanet ve maliyet bazı). v_holdings artık bunun son satırı; hesap
--      değişmedi, yalnız tek yerde toplandı.
--   2) holdings_at(ts) — aynı yürüyüşün "o ana kadar" kesiti. Snapshot motoru
--      ne hesaplıyorsa onu geçmişteki herhangi bir an için verir.
--   3) rebuild_snapshots(from_ts) — verilen andan sonraki snapshot'ları defterle
--      yeniden hizalar. FİYATA DOKUNMAZ: her snapshot kendi kayıtlı fiyatını
--      korur, yalnız adetler ve onlardan türeyen tutarlar yeniden hesaplanır.
--      Böylece "o gün fiyat neydi" bilgisi yeniden yazılmaz — yalnız "o gün
--      elimde ne vardı" düzelir.
--
-- Kasıtlı kısıt: from_ts ZORUNLU. Argümansız bir "hepsini onar" defterin bugünkü
-- halini portföyün doğduğu güne kadar geriye yansıtırdı; oysa ilk snapshot'lar
-- test verisiyle alınmıştı. Onarım her zaman değişen işlemin tarihinden başlar.

-- ── 1) Defterin yürüyen durumu ─────────────────────────────────────────────
-- Hesap 0019'daki v_holdings ile birebir aynı; tek fark her ADIMIN kendi satırı
-- olarak dışarı verilmesi (executed_at + rn ile). Sıra bağımlı birikim olduğu
-- için recursive CTE şart: satış/harcama, elden çıkan adedi O ANKİ birim
-- maliyetle götürüyor.
create or replace view v_holdings_walk as
with recursive ledger as (
  select instrument_id, id, executed_at, type,
         quantity::numeric as quantity,
         coalesce(unit_price, 0)::numeric as unit_price,
         coalesce(fee, 0)::numeric as fee,
         case when type in ('buy','borrow')          then quantity
              when type in ('sell','expense','lend') then -quantity
              else 0 end::numeric as signed_qty,
         case when type = 'buy'      then external_quantity
              when type = 'sell'     then -external_quantity
              when type = 'transfer' then external_quantity
              -- Borçta emanet payı = adedin tamamı (bkz. 0019).
              when type = 'borrow'   then quantity
              when type = 'lend'     then -quantity
              else 0 end::numeric as signed_ext,
         row_number() over (partition by instrument_id order by executed_at, id) as rn
  from transactions
),
walk as (
  select l.instrument_id, l.rn, l.id, l.executed_at,
         l.signed_qty as qty, l.signed_ext as ext,
         case when l.type in ('buy','borrow') then l.quantity * l.unit_price + l.fee
              else 0 end as basis
  from ledger l
  where l.rn = 1
  union all
  select l.instrument_id, l.rn, l.id, l.executed_at,
         w.qty + l.signed_qty, w.ext + l.signed_ext,
         case
           when l.type = 'buy' then w.basis + l.quantity * l.unit_price + l.fee
           when l.type = 'borrow' then w.basis + l.fee + l.quantity *
                  (case when l.unit_price > 0 then l.unit_price
                        when w.qty > 0        then w.basis / w.qty
                        else 0 end)
           when l.type in ('sell','expense','lend') then case
                                       when w.qty > 0
                                         then greatest(w.basis - l.quantity * (w.basis / w.qty), 0)
                                       else 0
                                     end
           else w.basis
         end
  from walk w
  join ledger l on l.instrument_id = w.instrument_id and l.rn = w.rn + 1
)
select instrument_id, rn, id as transaction_id, executed_at,
       qty as quantity, ext as external_qty, qty - ext as own_quantity, basis,
       case when qty > 0 and basis > 0 then basis / qty end as avg_cost
from walk;

comment on view v_holdings_walk is
  'Defterin yürüyen durumu: her işlemden SONRAKİ adet/emanet/maliyet bazı. '
  'v_holdings son satır, holdings_at(ts) ise "o ana kadarki" son satırdır.';

-- ── 2) v_holdings artık yürüyüşün son satırı ───────────────────────────────
-- Kolon listesi ve sonuçlar 0019 ile AYNI (adet = signed_qty toplamı = son
-- yürüyen adet). create or replace: v_watchlist bu görünüme bağlı.
create or replace view v_holdings as
with last_state as (
  select distinct on (instrument_id)
         instrument_id, quantity, external_qty, own_quantity, avg_cost
  from v_holdings_walk
  order by instrument_id, rn desc
)
select i.id as instrument_id, i.symbol, i.display_name, i.class_code, i.currency,
       coalesce(s.quantity, 0) as quantity,
       coalesce(s.external_qty, 0) as external_qty,
       coalesce(s.own_quantity, 0) as own_quantity,
       s.avg_cost
from instruments i
left join last_state s on s.instrument_id = i.id
where i.is_active;

-- ── 3) Belirli bir ana göre pozisyon ───────────────────────────────────────
create or replace function holdings_at(asof timestamptz)
returns table (instrument_id uuid, symbol text, display_name text, class_code text,
               currency text, quantity numeric, external_qty numeric,
               own_quantity numeric, avg_cost numeric)
language sql stable as $$
  with state as (
    select distinct on (w.instrument_id)
           w.instrument_id, w.quantity, w.external_qty, w.own_quantity, w.avg_cost
    from v_holdings_walk w
    where w.executed_at <= asof
    order by w.instrument_id, w.rn desc
  )
  select i.id, i.symbol, i.display_name, i.class_code, i.currency,
         coalesce(s.quantity, 0), coalesce(s.external_qty, 0),
         coalesce(s.own_quantity, 0), s.avg_cost
  from instruments i
  left join state s on s.instrument_id = i.id
  where i.is_active;
$$;

comment on function holdings_at(timestamptz) is
  'v_holdings''in "o an" hali: yalnız executed_at <= asof olan işlemler sayılır.';

-- ── 4) Bir snapshot'ın OLMASI GEREKEN pozisyonları ─────────────────────────
-- Kural motorla (src/snapshot.ts) aynı: değer çevriminde FİYATIN kendi para
-- birimi esas, USD değeri TL değerin kurla bölümü, maliyet yalnız avg_cost > 0
-- olan pozisyonlarda sayılır (meçhul maliyet 0 değildir).
--
-- Fiyat kaynağı sırası bilerek "önce kayıtlı olan": snapshot o an hangi fiyatı
-- gördüyse o kalır. Yalnız o snapshot'ta hiç satırı olmayan bir enstrüman için
-- (geçmişe dönük işlem yeni bir pozisyon açtıysa) prices'tan o ana ait son
-- gözlem alınır. Kur çapası da snapshot'ın kendi TL/USD oranından çıkarılır —
-- güncel kuru kullanmak geçmişin dolar eksenini bozardı.
--
-- Dönüş tipi ADLANDIRILMIŞ bir composite: onarım fonksiyonu satırları geçici
-- tabloya değil diziye alıyor (aşağıda gerekçesi var), bunun için tipin adı
-- olmalı.
do $$ begin
  if not exists (select 1 from pg_type where typname = 'snapshot_position') then
    create type snapshot_position as (
      instrument_id uuid, quantity numeric, own_quantity numeric,
      price numeric, price_ts timestamptz, is_stale boolean,
      value_try numeric, value_usd numeric,
      own_value_try numeric, own_value_usd numeric,
      cost_try numeric, own_cost_try numeric, has_cost boolean
    );
  end if;
end $$;

create or replace function snapshot_positions_at(snap_id uuid)
returns setof snapshot_position
language sql stable as $$
  with snap as (
    select ps.id, ps.ts,
           case when ps.total_value_usd > 0 then ps.total_value_try / ps.total_value_usd
                else (select f.rate from fx_rates f
                       where f.base = 'USD' and f.quote = 'TRY' and f.ts <= ps.ts
                       order by f.ts desc limit 1)
           end as usdtry
    from portfolio_snapshots ps
    where ps.id = snap_id
  ),
  held as (
    select h.* from snap, holdings_at(snap.ts) h
    where h.quantity <> 0 or h.own_quantity <> 0
  ),
  px as (
    select held.instrument_id, held.quantity, held.own_quantity, held.avg_cost, snap.usdtry,
           coalesce(old.price, np.price) as price,
           coalesce(old.price_ts, np.ts) as price_ts,
           case when old.instrument_id is not null then coalesce(oldc.currency, i.currency)
                else coalesce(np.currency, i.currency) end as price_currency,
           case when old.instrument_id is not null then old.is_stale
                else (np.ts is not null and c.stale_after_minutes is not null
                      and schedule_open_minutes(i.calendar_code, np.ts, snap.ts) > c.stale_after_minutes)
           end as is_stale
    from snap cross join held
    join instruments i on i.id = held.instrument_id
    join market_calendars c on c.code = i.calendar_code
    left join position_snapshots old
           on old.snapshot_id = snap.id and old.instrument_id = held.instrument_id
    left join lateral (select pr.currency from prices pr
                        where pr.instrument_id = held.instrument_id and pr.ts = old.price_ts) oldc on true
    left join lateral (select pr.price, pr.ts, pr.currency from prices pr
                        where pr.instrument_id = held.instrument_id and pr.ts <= snap.ts
                        order by pr.ts desc limit 1) np on true
  ),
  val as (
    select px.*,
           case when px.price_currency = 'USD' then px.quantity * px.price * px.usdtry
                else px.quantity * px.price end as v_try,
           case when px.price_currency = 'USD' then px.own_quantity * px.price * px.usdtry
                else px.own_quantity * px.price end as ov_try,
           case when px.price_currency = 'USD' then coalesce(px.avg_cost, 0) * px.quantity * px.usdtry
                else coalesce(px.avg_cost, 0) * px.quantity end as c_try,
           case when px.price_currency = 'USD' then coalesce(px.avg_cost, 0) * px.own_quantity * px.usdtry
                else coalesce(px.avg_cost, 0) * px.own_quantity end as oc_try
    from px
    where px.price is not null and px.price_ts is not null
      and px.price_currency in ('TRY','USD') and px.usdtry > 0
  )
  select instrument_id, quantity, own_quantity, price, price_ts, is_stale,
         v_try, v_try / usdtry, ov_try, ov_try / usdtry,
         c_try, oc_try, coalesce(avg_cost, 0) > 0
  from val;
$$;

-- ── 5) Defter başlangıcı ───────────────────────────────────────────────────
-- Onarımın inebileceği en eski an = defterin bugünkü halinin yazıldığı an
-- (2026-09-08 14:43 UTC, portföyün toplu girişi). Gerekçe: ilk snapshot'lar
-- 2026-08-31'de, portföy henüz parça parça girilirken alındı. O snapshot'lar
-- "o gün beyan edilmiş" gerçeği taşıyor — bugünkü defteri oraya yansıtmak
-- geçmişi EKSİK bir defterle yeniden yazmak olurdu (ölçüldü: 8 Eylül öncesi
-- 0,5–3,1 milyon TL ayrışıyor). Bu yüzden onarım varsayılan olarak buranın
-- altına inmez; bilerek inmek gerekirse `npm run rebuild -- <tarih> --force`.
--
-- Bilerek veri, sabit değil: taban değişirse (ör. eski işlemler de girilirse)
-- tek satırlık bir update yeter, kod dağıtımı gerekmez.
create table if not exists app_settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);
insert into app_settings (key, value) values ('ledger_epoch', '2026-09-08T14:43:31Z')
on conflict (key) do nothing;

comment on table app_settings is
  'Küçük sistem ayarları. ledger_epoch = geçmiş onarımının inebileceği en eski an.';

-- ── 6) Onarım ──────────────────────────────────────────────────────────────
-- from_ts'ten sonraki saatlik snapshot'ları defterle hizalar. Yalnız GERÇEKTEN
-- farklı olanlara dokunur (adet ya da maliyet farkı) — böylece tekrar tekrar
-- çalıştırmak zararsızdır ve fiyat geçmişi gereksiz yere yeniden yazılmaz.
--
-- İstenen satırlar önce bir DİZİYE alınır: snapshot_positions_at kayıtlı
-- fiyatı position_snapshots'tan okuyor, yani satırları silmeden ÖNCE
-- hesaplanmış olması şart. (Geçici tablo da olurdu ama plpgsql'in önbelleğe
-- aldığı planlar her çağrıda yeniden yaratılan bir temp tabloyla kırılganlaşır.)
-- İmza değişti (ignore_epoch eklendi): eski tek argümanlı sürüm kalırsa
-- tek argümanlı çağrılar iki aday arasında belirsiz kalır.
drop function if exists rebuild_snapshots(timestamptz);

create or replace function rebuild_snapshots(from_ts timestamptz, ignore_epoch boolean default false)
returns table (rebuilt_at timestamptz, positions int)
language plpgsql as $$
declare
  s record;
  epoch timestamptz;
  start_ts timestamptz;
  want snapshot_position[];
  changed boolean;
  tt numeric; tu numeric; ot numeric; ou numeric;
  ct numeric; oct numeric; cv numeric; ocv numeric;
  n int;
begin
  if from_ts is null then
    raise exception 'rebuild_snapshots: başlangıç anı zorunlu (geçmişin tamamını körlemesine yeniden yazma)';
  end if;

  select value::timestamptz into epoch from app_settings where key = 'ledger_epoch';
  start_ts := from_ts;
  if not ignore_epoch and epoch is not null and start_ts < epoch then
    start_ts := epoch;
  end if;

  for s in
    select ps.id, ps.ts as snap_ts, ps.total_cost_try as old_cost
    from portfolio_snapshots ps
    where ps.granularity = 'hourly' and ps.ts >= date_trunc('hour', start_ts)
    order by ps.ts
  loop
    select coalesce(array_agg(w), '{}') into want from snapshot_positions_at(s.id) w;

    select coalesce(sum(w.value_try), 0), coalesce(sum(w.value_usd), 0),
           coalesce(sum(w.own_value_try), 0), coalesce(sum(w.own_value_usd), 0),
           coalesce(sum(w.cost_try) filter (where w.has_cost), 0),
           coalesce(sum(w.own_cost_try) filter (where w.has_cost), 0),
           coalesce(sum(w.value_try) filter (where w.has_cost), 0),
           coalesce(sum(w.own_value_try) filter (where w.has_cost), 0),
           count(*)
      into tt, tu, ot, ou, ct, oct, cv, ocv, n
      from unnest(want) w;

    -- Fiyatı hiç bulunamayan bir an: eksik veri yüzünden dolu bir snapshot
    -- boşaltılmasın.
    if n = 0 then continue; end if;

    select exists (
             select 1
             from unnest(want) w
             full outer join (select * from position_snapshots p where p.snapshot_id = s.id) p
               on p.instrument_id = w.instrument_id
             where w.instrument_id is null or p.instrument_id is null
                or abs(w.quantity - p.quantity) > 1e-9
                or abs(w.own_quantity - p.own_quantity) > 1e-9
           )
           or abs(ct - s.old_cost) > greatest(0.01, abs(s.old_cost) * 1e-9)
      into changed;

    if not changed then continue; end if;

    delete from position_snapshots where snapshot_id = s.id;
    insert into position_snapshots (snapshot_id, instrument_id, quantity, price, price_ts, is_stale,
                                    value_try, value_usd, weight_pct,
                                    own_quantity, own_value_try, own_value_usd, own_weight_pct)
    select s.id, w.instrument_id, w.quantity, w.price, w.price_ts, w.is_stale,
           w.value_try, w.value_usd, case when tt > 0 then w.value_try / tt * 100 else 0 end,
           w.own_quantity, w.own_value_try, w.own_value_usd,
           case when ot > 0 then w.own_value_try / ot * 100 else 0 end
    from unnest(want) w;

    update portfolio_snapshots ps
       set total_value_try = tt, total_value_usd = tu,
           total_cost_try = ct, unrealized_pnl_try = cv - ct,
           own_value_try = ot, own_value_usd = ou,
           own_cost_try = oct, own_unrealized_pnl_try = ocv - oct
     where ps.id = s.id;

    rebuilt_at := s.snap_ts;
    positions := n;
    return next;
  end loop;
end $$;

comment on function rebuild_snapshots(timestamptz, boolean) is
  'Verilen andan sonraki saatlik snapshot''ları defterle hizalar. Kayıtlı '
  'fiyatlara dokunmaz; yalnız adetler ve onlardan türeyen tutarlar düzelir. '
  'Başlangıç app_settings.ledger_epoch ile sınırlıdır (ignore_epoch ile aşılır).';
