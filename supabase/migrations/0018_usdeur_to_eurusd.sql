-- Beat · Şema v18 — USDEUR kaldırıldı, yerine EURUSD (doğru kaynakla)
--
-- USDEUR kataloğa 'fx' sınıfından eklenmişti ve fiyatı BAŞKA BİR ÇİFTİN
-- fiyatıydı: döviz zincirinin iki kaynağı da (truncgil, tcmb) her şeyi TL
-- karşılığı kote ediyor ve baz para birimini bekliyor (GBPTRY -> GBP). Kotasyon
-- TL olmayınca da aynı kural işliyor, yani USDEUR için 'USD' soruluyor ve
-- gelen cevap USD/TRY oluyordu. Sonuç: Piyasa kartında "USDEUR 48,47 ₺" —
-- gerçek USD/EUR ~0,86 iken.
--
-- Doğru yol zaten kurulu: EURUSD 'index' sınıfının hazır parite listesinde
-- (lib/resolve.ts INDEX_OPTIONS), yahoo'dan `EURUSD=X` ile ve USD kote geliyor.
-- Yön de piyasa standardına dönüyor (EUR/USD = 1,16).
--
-- Kökü apps/web/src/lib/resolve.ts'te kapatıldı: resolveFx artık TL dışı
-- kotasyonlu bir çift için enstrüman kurmayı reddedip kullanıcıyı Endeks
-- sınıfına yönlendiriyor. Bu göç yalnız mevcut kaydı temizler.
--
-- USDEUR'ün pozisyonu yoktu (yalnız izleme listesi), bu yüzden hiçbir işlem,
-- snapshot ya da portföy büyüklüğü etkilenmiyor. Biriken 133 fiyat satırı da
-- gidiyor: hepsi yanlış çiftin fiyatıydı, saklamanın bir değeri yok.

do $$
declare
  old_id uuid;
  new_id uuid;
begin
  select id into old_id from instruments where symbol = 'USDEUR';

  if old_id is not null then
    -- Güvenlik kilidi: bir şekilde işlem girilmişse göç durur, sessizce veri
    -- silmez. O durumda önce pozisyonun ne olacağına karar verilmeli.
    if exists (select 1 from transactions where instrument_id = old_id) then
      raise exception 'USDEUR''e ait işlem var — otomatik silinmez, önce elle karar ver';
    end if;

    delete from prices             where instrument_id = old_id;
    delete from instrument_sources where instrument_id = old_id;
    delete from instruments        where id = old_id;
  end if;

  -- EURUSD zaten varsa (elle eklenmişse) dokunma.
  if not exists (select 1 from instruments where symbol = 'EURUSD') then
    insert into instruments (class_code, symbol, display_name, currency, calendar_code)
    values ('index', 'EURUSD', 'Euro / Dolar', 'USD', 'ENDEKS')
    returning id into new_id;

    insert into instrument_sources (instrument_id, provider_id, provider_symbol, priority)
    values (new_id, 'yahoo', 'EURUSD=X', 10);
  end if;
end $$;
