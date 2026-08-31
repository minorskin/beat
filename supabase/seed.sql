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

insert into market_calendars (code,tz,open_time,close_time,weekdays) values
  ('CRYPTO_24_7','UTC',        null,      null,      '{1,2,3,4,5,6,7}'),
  ('FX_24_5',    'UTC',        null,      null,      '{1,2,3,4,5}'),
  ('BIST',       'Europe/Istanbul','10:00','18:10',  '{1,2,3,4,5}'),
  ('NYSE',       'America/New_York','09:30','16:00', '{1,2,3,4,5}'),
  ('TEFAS_DAILY','Europe/Istanbul','20:00','20:30',  '{1,2,3,4,5}');

-- Enstrüman YOK — bilerek.
--
-- Katalog kullanıcının kendi varlıklarıyla dolar: arayüzdeki "+ Enstrüman"
-- görünen adı ve fiyat kaynaklarını otomatik çözer (bkz. lib/resolve.ts,
-- lib/catalog.ts CLASS_DEFAULTS). Buraya örnek enstrüman koymak, sıfırdan
-- kurulan her sistemi tanımadığı varlıklarla ve onların boşuna çekilen
-- fiyatlarıyla başlatır — bu yüzden örnek portföy seed'i kaldırıldı
-- (canlıda da temizlendi, 31.08.2026).
