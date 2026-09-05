-- Beat · Şema v15 — v_watchlist fiyatın KENDİ para birimini de versin
--
-- instruments.currency artık "kur riski etiketi" (bkz. 0006): USDTRY'nin
-- currency'si 'USD' çünkü o pozisyon kur karşısında korunaklı — ama FİYATI
-- TL cinsinden kote. Pozisyon tablosu bunu zaten doğru yapıyor, fiyat birimini
-- prices.currency'den (price_currency) okuyor.
--
-- İzleme satırı ise v_watchlist'te o kolon olmadığı için kur riski etiketine
-- düşüyordu: "Euro / TL 56,36 $" gibi yanlış bir simge yazıyordu. Kolon
-- sonuna eklenince (create or replace view buna izin verir) satır da
-- pozisyonlarla aynı kuralı kullanabiliyor.

create or replace view v_watchlist as
select i.id as instrument_id, i.symbol, i.display_name, i.class_code,
       i.currency, ac.ui_group, i.created_at,
       lp.price, lp.price_ts, lp.source,
       lp.currency as price_currency
from instruments i
join asset_classes ac on ac.code = i.class_code
left join v_latest_price lp on lp.instrument_id = i.id
left join v_holdings h on h.instrument_id = i.id
where i.is_active and coalesce(h.quantity,0) = 0;
