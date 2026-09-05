-- Beat · Şema v14 — "Endeks" varlık sınıfı
--
-- Amaç: S&P 500, Nasdaq, VIX, DXY gibi endeksleri ve EUR/USD gibi çapraz
-- kurları İZLEME amaçlı kataloğa alabilmek. Bunlar tutulan varlık değil,
-- referans: pozisyonu olmayan enstrüman zaten izleme satırı olarak görünüyor
-- (v_watchlist) ve hiçbir toplama girmiyor.
--
-- Neden yeni sınıf: mevcut sınıfların hiçbiri uymuyordu.
--   · stock_us/etf_us → yahoo zinciri doğru ama arayüzde "ABD Hissesi" yazardı
--   · fx             → truncgil/tcmb TL karşılığı döndürür, EUR/USD veremez
--
-- Fiyat kaynağı yahoo: sembol URL-kodlandığı için ^GSPC, DX-Y.NYB, EURUSD=X
-- gibi kodlar sorunsuz geçiyor (dokuz sembol canlı doğrulandı). Kanonik sembol
-- temiz tutulur (SP500, DXY, EURUSD), yahoo kodu instrument_sources'ta durur —
-- altın sınıfındaki ile aynı desen.
--
-- Takvim FX_24_5 + ritim hourly: motor takvimi zaten uygulamıyor (yalnız
-- cadence iş görüyor), çapraz kurlar da 7/24 değil 5 gün boyunca hareket
-- ediyor. Endeksler seans dışında taşınmış fiyatla durur.
--
-- default_currency USD: listedeki her enstrüman dolar cinsinden kote.

insert into asset_classes (code, name, default_currency, qty_precision, ui_group, sort_order)
values ('index', 'Endeks', 'USD', 4, 'Endeks', 65)
on conflict (code) do nothing;
