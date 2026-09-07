-- Beat · Şema v16 — enstrüman GRUBUNA bağlı güncelleme takvimi
--
-- Kaynak: "enstrüman grubu güncelleme gün, aralık, zaman dilimi ve sıklığı"
-- tablosu. Dokuz grubun her biri için gün, çalışma aralığı, zaman dilimi ve
-- sıklık verilmişti; buraya birebir taşındı:
--
--   grup             günler      aralık        sıklık
--   fon              pzt–paz     00:00–23:59   60 dk
--   döviz            pzt–paz     00:00–23:59   30 dk
--   kripto           pzt–paz     00:00–23:59   30 dk
--   tr hisse senedi  pzt–cum     10:00–18:30   30 dk
--   abd hisse senedi pzt–cum     16:00–23:59   30 dk  (belgede 23:00 — bkz. DST notu)
--   etf              pzt–cum     00:00–23:59   30 dk
--   altın            pzt–cum     00:00–23:59   30 dk
--   endeks           pzt–paz     00:00–23:59   30 dk
--   gayrimenkul      —           —             —      (hiç güncellenmez)
--
-- Zaman dilimi her satırda İstanbul (GMT+3) — tz kolonu bu yüzden hepsinde
-- 'Europe/Istanbul'.
--
-- NEDEN market_calendars: tablo zaten tam bu kavramdı (tz + açılış/kapanış +
-- günler) ama motor onu HİÇ okumuyordu; tek iş gören alan instruments.cadence
-- idi ve o da üç kaba kovadan (hourly/market_hours/daily_close) ibaretti.
-- Eksik olan tek şey "sıklık"tı; iki kolon eklenip takvim gerçekten
-- uygulanıyor. Takvimler artık piyasaya değil GRUBA ait olduğu için kodları da
-- grup adları (belgeyle satır satır karşılaştırılabilsin diye).
--
-- Uygulama sırası: bu migration ÖNCE çalışır, kod sonra deploy edilir. Eklenen
-- kolonlar eski kodu bozmaz (instruments.cadence yerinde bırakıldı), yeni kod
-- ise kolonlar olmadan çalışamaz.

-- ── 1) Takvime sıklık + bayatlık eşiği ────────────────────────────────────
alter table market_calendars
  add column if not exists interval_minutes    int,   -- null => hiç planlanmaz
  add column if not exists stale_after_minutes int;   -- null => hiçbir zaman bayat sayılmaz

comment on column market_calendars.interval_minutes is
  'Planlı güncelleme sıklığı (dk). null = bu grup zamanlanmış olarak hiç çekilmez.';
comment on column market_calendars.stale_after_minutes is
  'Fiyat kaç DAKİKALIK AÇIK TAKVİM SÜRESİ sonra taşınmış (bayat) sayılır. Kapalı geçen saatler sayılmaz — bkz. schedule_open_minutes.';

-- ── 2) Grup takvimleri ────────────────────────────────────────────────────
-- close_time 23:59: belgedeki "00:00-23:59" birebir. Gün sonu kapanışı olmayan
-- gruplarda pencere pratikte tüm gün.
--
-- stale_after_minutes belgede YOK; oradaki sıklık "ne kadar sık soruyoruz"
-- sorusunu cevaplıyor, bayatlık ise "fiyatın kendisi ne kadar sık değişiyor"
-- sorusunu. İkisi ayrı eksen: TEFAS'a saat başı sorsak da NAV günde bir kez
-- değişir. Bu yüzden eşikler eski STALE_WINDOW değerlerinden devralındı
-- (hourly 3sa, market_hours 6sa, daily_close 30sa) — davranış korunsun diye.
insert into market_calendars (code, tz, open_time, close_time, weekdays, interval_minutes, stale_after_minutes) values
  ('FON',         'Europe/Istanbul', null,    null,    '{1,2,3,4,5,6,7}', 60,   1800),
  ('DOVIZ',       'Europe/Istanbul', null,    null,    '{1,2,3,4,5,6,7}', 30,    180),
  ('KRIPTO',      'Europe/Istanbul', null,    null,    '{1,2,3,4,5,6,7}', 30,    180),
  ('HISSE_TR',    'Europe/Istanbul', '10:00', '18:30', '{1,2,3,4,5}',     30,    360),
  -- Kapanış belgede 23:00; burada 23:59. Sebep DST: NYSE seansı 09:30–16:00 ET,
  -- bu da TSİ ile YAZIN 16:30–23:00, KIŞIN 17:30–00:00 demek. 23:00'te kapatan
  -- bir pencere kışın seansın son saatini hiç görmezdi. 23:59 her iki durumu da
  -- kapsıyor ve mevsimlik bakım gerektirmiyor — EOD kesiminin 02:00'de olmasıyla
  -- aynı gerekçe (bkz. README). Kışın 00:00'de oluşan kapanış tick'i o günün
  -- penceresine yetişmez ama ertesi gün 16:00'daki ilk turda alınır: Yahoo yeni
  -- seans başlayana kadar son kapanışı döndürüyor, veri kaybı olmuyor.
  ('HISSE_ABD',   'Europe/Istanbul', '16:00', '23:59', '{1,2,3,4,5}',     30,    360),
  ('ETF',         'Europe/Istanbul', null,    null,    '{1,2,3,4,5}',     30,    360),
  ('ALTIN',       'Europe/Istanbul', null,    null,    '{1,2,3,4,5}',     30,    180),
  ('ENDEKS',      'Europe/Istanbul', null,    null,    '{1,2,3,4,5,6,7}', 30,    180),
  -- Gayrimenkul: belgede yedi günün tamamı "hayır", aralık ve sıklık boş.
  -- interval_minutes null => zamanlanmış çekim yok; stale_after null => fiyatı
  -- hiç yaşlanmaz (değerleme kullanıcıdan gelir, "bayat" damgası anlamsız).
  ('GAYRIMENKUL', 'Europe/Istanbul', null,    null,    '{}',              null,  null)
on conflict (code) do update set
  tz = excluded.tz, open_time = excluded.open_time, close_time = excluded.close_time,
  weekdays = excluded.weekdays, interval_minutes = excluded.interval_minutes,
  stale_after_minutes = excluded.stale_after_minutes;

-- ── 3) Enstrümanları grup takvimine bağla ─────────────────────────────────
-- Eşleme belge satırı -> varlık sınıfı; "fon" ile "etf" belgede AYRI satırlar
-- (ikisi de arayüzde 'Fon' grubunda görünse de farklı takvimleri var).
update instruments i set calendar_code = m.cal
from (values
  ('fund_tr','FON'), ('fx','DOVIZ'), ('crypto','KRIPTO'), ('stock_tr','HISSE_TR'),
  ('stock_us','HISSE_ABD'), ('etf_us','ETF'), ('gold','ALTIN'), ('index','ENDEKS'),
  ('realty','GAYRIMENKUL')
) as m(cls, cal)
where i.class_code = m.cls and i.calendar_code is distinct from m.cal;

-- Piyasa adıyla anılan eski takvimler artık kimse tarafından kullanılmıyor:
-- grup takvimleriyle birebir örtüşmüyorlar (ör. altın 7/24 idi, belgede hafta
-- içi) ve iki rakip takvim seti en zor fark edilen tutarsızlık olurdu.
delete from market_calendars
where code in ('CRYPTO_24_7','FX_24_5','BIST','NYSE','TEFAS_DAILY')
  and not exists (select 1 from instruments i where i.calendar_code = market_calendars.code);

-- ── 4) Motorun çekim damgası ──────────────────────────────────────────────
-- Sıklık kapısı bir "en son ne zaman denedik" damgası olmadan uygulanamaz:
-- prices.ts sağlayıcının kotasyon zamanıdır, piyasa kapalıyken hiç ilerlemez,
-- dolayısıyla "bu slotta çekildi mi" sorusunu cevaplayamaz.
alter table instruments add column if not exists last_fetch_at timestamptz;
comment on column instruments.last_fetch_at is
  'Motorun bu enstrümanı en son ÇEKMEYE ÇALIŞTIĞI an (başarı şart değil). Sıklık kapısı buna bakar.';

-- cadence emekli: gün/pencere/sıklık/bayatlık artık takvimde. Kolon şimdilik
-- duruyor ki bu migration eski kodu bozmadan uygulanabilsin; hiçbir sorgu
-- okumuyor.
comment on column instruments.cadence is
  'EMEKLİ (v16). Yerine market_calendars.interval_minutes + stale_after_minutes. Hiçbir sorgu okumuyor; ileride düşürülecek.';

-- ── 5) Takvim yardımcıları ────────────────────────────────────────────────
-- Bir grubun takvimine göre [a,b] arasında kaç DAKİKA "açık" geçti.
-- Bayatlık ölçüsü budur: BIST cuma 18:30'da kapanıp pazartesi 10:00'da
-- açıldığında aradaki 63,5 saat fiyatı yaşlandırmaz — o sürede yeni bir
-- gözlem beklemiyoruz zaten. Duvar saatiyle ölçen eski kural her hafta sonu
-- bütün hisseleri "bayat" damgalıyordu.
create or replace function schedule_open_minutes(p_cal text, p_from timestamptz, p_to timestamptz)
returns numeric
language sql stable as $$
  select coalesce(sum(greatest(0,
           extract(epoch from (least(seg.close_ts, p_to) - greatest(seg.open_ts, p_from))) / 60
         )), 0)
  from market_calendars c
  cross join lateral generate_series(
         (p_from at time zone c.tz)::date,
         (p_to   at time zone c.tz)::date,
         interval '1 day') as d(day)
  cross join lateral (select
         (d.day::date + coalesce(c.open_time,  time '00:00:00')) at time zone c.tz as open_ts,
         (d.day::date + coalesce(c.close_time, time '23:59:59')) at time zone c.tz as close_ts) seg
  where c.code = p_cal
    and p_to > p_from
    and extract(isodow from d.day)::int = any (c.weekdays)
$$;

-- Grup ŞU AN planlı çekim penceresinde mi? Arayüz "piyasa kapalı" ile
-- "veri gelmiyor" durumlarını bununla ayırıyor.
create or replace function schedule_is_open(p_cal text, p_at timestamptz)
returns boolean
language sql stable as $$
  select coalesce(bool_or(
           c.interval_minutes is not null
           and extract(isodow from (p_at at time zone c.tz))::int = any (c.weekdays)
           and (p_at at time zone c.tz)::time >= coalesce(c.open_time,  time '00:00:00')
           and (p_at at time zone c.tz)::time <= coalesce(c.close_time, time '23:59:59')
         ), false)
  from market_calendars c where c.code = p_cal
$$;

-- ── 6) İzleme satırları da planı görsün ───────────────────────────────────
-- Varlık tablosunda izlenen enstrüman pozisyonlarla AYNI listede duruyor;
-- "bu satır neden kımıldamıyor" sorusunun cevabı ikisinde de takvim.
-- (create or replace view yalnız SONA kolon eklemeye izin verir.)
create or replace view v_watchlist as
select i.id as instrument_id, i.symbol, i.display_name, i.class_code,
       i.currency, ac.ui_group, i.created_at,
       lp.price, lp.price_ts, lp.source,
       lp.currency as price_currency,
       i.calendar_code
from instruments i
join asset_classes ac on ac.code = i.class_code
left join v_latest_price lp on lp.instrument_id = i.id
left join v_holdings h on h.instrument_id = i.id
where i.is_active and coalesce(h.quantity,0) = 0;
