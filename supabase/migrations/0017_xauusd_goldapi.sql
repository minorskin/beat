-- Beat · Şema v17 — XAUUSD'ye çalışan bir fiyat kaynağı
--
-- XAUUSD kataloğa girdiği günden beri hiç fiyat alamadı (prices'ta sıfır satır,
-- her turda "tüm kaynaklar başarısız"). Sebep zincirdeydi: döviz sınıfının
-- kaynakları truncgil ve tcmb, ikisi de değerli madeni yalnız TL karşılığı
-- kote ediyor — XAU/USD paritesini veremiyorlar.
--
-- Çözüm: gold-api. Kaynak ons başına USD fiyatını zaten yayınlıyor (keysiz,
-- 07.09.2026'da canlı doğrulandı: 4394,70 $/ons) ve motorda `goldapi` olarak
-- kayıtlı. Sağlayıcı bugüne kadar yalnız gram TL türetmesi yapıyordu; artık
-- maden/dolar paritesinde çevrim yapmadan ham USD fiyatını döndürüyor
-- (bkz. src/providers/goldapi.ts).
--
-- Neden Yahoo değil: Yahoo'da `XAUUSD=X` diye bir sembol yok ("No data found").
-- Karşılığı `GC=F`, o da COMEX VADELİ sözleşmesi — spot değil, tipik olarak
-- contango kadar yüksek. Vadeliyi spot diye yazmak sayıyı sessizce yanlış
-- yapardı; sembolün adı XAUUSD ise değeri de spot olmalı.

update instrument_sources s
   set provider_id = 'goldapi', provider_symbol = 'XAU', priority = 10
 from instruments i
where i.id = s.instrument_id and i.symbol = 'XAUUSD' and s.provider_id = 'truncgil';

delete from instrument_sources s
 using instruments i
where i.id = s.instrument_id and i.symbol = 'XAUUSD' and s.provider_id = 'tcmb';

-- Fiyat dolar cinsinden kote: kur riski etiketi de USD (zaten öyleydi, teyit).
update instruments set currency = 'USD' where symbol = 'XAUUSD' and currency <> 'USD';
