-- Beat · başlangıç kataloğu
-- Fiyat kaynakları canlı test edildi (29.08.2026). priority = failover sırası.

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

insert into instruments (class_code,symbol,display_name,currency,calendar_code,cadence) values
  ('stock_us','AAPL','Apple Inc.','USD','NYSE','market_hours'),
  ('stock_us','NVDA','NVIDIA Corp.','USD','NYSE','market_hours'),
  ('etf_us',  'VOO','Vanguard S&P 500 ETF','USD','NYSE','market_hours'),
  ('etf_us',  'QQQ','Invesco QQQ Trust','USD','NYSE','market_hours'),
  ('stock_tr','THYAO','Türk Hava Yolları','TRY','BIST','market_hours'),
  ('stock_tr','ASELS','Aselsan','TRY','BIST','market_hours'),
  ('fund_tr', 'THF','Tera Portföy Hisse Senedi (TL) Fonu','TRY','TEFAS_DAILY','daily_close'),
  ('fund_tr', 'TLY','Tera Portföy Birinci Serbest Fon','TRY','TEFAS_DAILY','daily_close'),
  ('gold',    'GRAMALTIN','Gram Altın','TRY','CRYPTO_24_7','hourly'),
  ('fx',      'USDTRY','ABD Doları / TL','TRY','FX_24_5','hourly'),
  ('fx',      'EURTRY','Euro / TL','TRY','FX_24_5','hourly'),
  ('crypto',  'BTC','Bitcoin','USD','CRYPTO_24_7','hourly'),
  ('crypto',  'ETH','Ethereum','USD','CRYPTO_24_7','hourly');

-- Failover zincirleri
insert into instrument_sources (instrument_id,provider_id,provider_symbol,priority)
select id,'yahoo',symbol,10       from instruments where class_code in ('stock_us','etf_us') union all
select id,'twelvedata',symbol,20  from instruments where class_code in ('stock_us','etf_us') union all
select id,'yahoo',symbol||'.IS',10 from instruments where class_code='stock_tr' union all
select id,'bigpara',symbol,20     from instruments where class_code='stock_tr' union all
select id,'tefas',symbol,10       from instruments where class_code='fund_tr' union all
select id,'truncgil','GRA',10     from instruments where symbol='GRAMALTIN' union all
select id,'goldapi','XAU',20      from instruments where symbol='GRAMALTIN' union all
select id,'truncgil','USD',10     from instruments where symbol='USDTRY' union all
select id,'tcmb','USD',20         from instruments where symbol='USDTRY' union all
select id,'truncgil','EUR',10     from instruments where symbol='EURTRY' union all
select id,'tcmb','EUR',20         from instruments where symbol='EURTRY' union all
select id,'coingecko','bitcoin',10  from instruments where symbol='BTC' union all
select id,'coingecko','ethereum',10 from instruments where symbol='ETH';

-- TODO: 'DIF' fon kodu TEFAS kataloğunda (2468 fon, YAT/EMK/BYF/GYF/GSYF) bulunamadı.
-- Doğru kod netleşince buraya eklenecek.
