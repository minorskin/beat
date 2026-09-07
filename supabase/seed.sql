-- Beat · başlangıç kataloğu
--
-- Yalnız YAPISAL katalog: varlık sınıfları ve piyasa takvimleri. Enstrümanlar
-- ve fiyat kaynakları buraya girmez — onları kullanıcı arayüzden ekler.

insert into asset_classes (code,name,default_currency,qty_precision,ui_group,sort_order) values
  ('stock_us','ABD Hisse','USD',6,'Hisse',10),
  ('etf_us',  'ABD ETF',  'USD',6,'Fon',  20),
  ('stock_tr','BIST Hisse','TRY',6,'Hisse',30),
  ('fund_tr', 'Yatırım Fonu','TRY',8,'Fon', 40),
  ('gold',    'Altın',    'TRY',6,'Emtia',50),
  ('fx',      'Döviz',    'TRY',4,'Döviz',60),
  ('crypto',  'Kripto',   'USD',10,'Kripto',70);

-- Takvim = enstrüman GRUBUNUN güncelleme planı (gün + aralık + zaman dilimi +
-- sıklık). Değerler kullanıcının verdiği grup tablosundan birebir gelir;
-- gerekçeler migration 0016'da. stale_after_minutes: fiyatın kaç dakikalık
-- AÇIK takvim süresi sonra taşınmış sayılacağı (sıklıktan ayrı eksen).
insert into market_calendars (code,tz,open_time,close_time,weekdays,interval_minutes,stale_after_minutes) values
  ('FON',        'Europe/Istanbul', null,   null,   '{1,2,3,4,5,6,7}', 60,  1800),
  ('DOVIZ',      'Europe/Istanbul', null,   null,   '{1,2,3,4,5,6,7}', 30,   180),
  ('KRIPTO',     'Europe/Istanbul', null,   null,   '{1,2,3,4,5,6,7}', 30,   180),
  ('HISSE_TR',   'Europe/Istanbul','10:00','18:30', '{1,2,3,4,5}',     30,   360),
  -- Kapanış belgede 23:00; 23:59 yaz ve kış saatinin ikisini de kapsıyor (0016).
  ('HISSE_ABD',  'Europe/Istanbul','16:00','23:59', '{1,2,3,4,5}',     30,   360),
  ('ETF',        'Europe/Istanbul', null,   null,   '{1,2,3,4,5}',     30,   360),
  ('ALTIN',      'Europe/Istanbul', null,   null,   '{1,2,3,4,5}',     30,   180),
  ('ENDEKS',     'Europe/Istanbul', null,   null,   '{1,2,3,4,5,6,7}', 30,   180),
  -- Gayrimenkul belgede yedi gün de "hayır": zamanlanmış çekim yok, fiyatı
  -- yaşlanmaz. Değerleme değiştiğinde motor tek seferlik yazar (bkz. db.ts).
  ('GAYRIMENKUL','Europe/Istanbul', null,   null,   '{}',              null, null);

-- Enstrüman YOK — bilerek.
--
-- Katalog kullanıcının kendi varlıklarıyla dolar: arayüzdeki "+ Enstrüman"
-- görünen adı ve fiyat kaynaklarını otomatik çözer (bkz. lib/resolve.ts,
-- lib/catalog.ts CLASS_DEFAULTS). Buraya örnek enstrüman koymak, sıfırdan
-- kurulan her sistemi tanımadığı varlıklarla ve onların boşuna çekilen
-- fiyatlarıyla başlatır — bu yüzden örnek portföy seed'i kaldırıldı
-- (canlıda da temizlendi, 31.08.2026).
