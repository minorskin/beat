-- Beat · Şema v6 — enstrüman para birimini sınıftan türet
--
-- instruments.currency, fiyatın HANGİ CİNSTEN geldiğini söyler; kullanıcı
-- tercihi değildir, fiyat kaynağı belirler (truncgil altını TL, Yahoo ABD
-- hissesini USD verir). Arayüzdeki "Döviz" açılır listesi bunu düzenlenebilir
-- gösteriyordu ve yanlış seçim değeri sessizce kurla İKİNCİ kez çarpıyordu:
-- 450 gram altın 3,1M TL yerine 148M TL görünüyordu.
--
-- Alan artık salt okunur (bkz. EditInstrument/updateInstrument). Bu migration
-- mevcut kayıtları sınıfın doğrusuna çeker.

update instruments i
set currency = d.cur
from (values
  ('stock_us','USD'), ('etf_us','USD'), ('stock_tr','TRY'),
  ('fund_tr','TRY'),  ('gold','TRY'),   ('crypto','USD'), ('realty','TRY')
) as d(code, cur)
where i.class_code = d.code and i.currency is distinct from d.cur;

-- Döviz sınıfı: fiyat TL cinsindendir (USDTRY = 48,26 TL). Tek istisna nakit
-- (USDUSD gibi kendi kendine eşit çift): orada birim, para biriminin kendisi.
update instruments
set currency = case when left(symbol, 3) = substr(symbol, 4, 3) then left(symbol, 3) else 'TRY' end
where class_code = 'fx'
  and currency is distinct from
      (case when left(symbol, 3) = substr(symbol, 4, 3) then left(symbol, 3) else 'TRY' end);
