-- Beat · Şema v12 — "Gram Has Altın" → "HAS GRAM"
--
-- Yalnız GÖRÜNEN ad değişiyor. Fiyat akışı etkilenmez: truncgil sorgusu
-- instrument_sources.provider_symbol = 'HAS' üzerinden gider, instruments.symbol
-- bu enstrüman için saf bir görüntü anahtarıdır (grafik lejantı, dağılım
-- kutucuğu, öne çıkanlar listesi hep onu yazar).
--
-- Geçmiş de kaybolmaz: prices ve position_snapshots instrument_id'ye bağlı,
-- eski gözlemler de yeni adla çizilir.
--
-- Sembolde boşluk var; catalog.ts'teki SYMBOL_RE buna izin vermiyor ama o kural
-- yalnız ELLE girilen sembolleri (gerçek tickerlar) bağlar. Altın seçenekleri
-- lib/resolve.ts'teki GOLD_OPTIONS listesinden gelir ve orası da bu adı üretecek
-- biçimde güncellendi — ikisi aynı tutulmalı.

update instruments
   set symbol = 'HAS GRAM', display_name = 'HAS GRAM'
 where symbol = 'GRAMHASALTIN';
