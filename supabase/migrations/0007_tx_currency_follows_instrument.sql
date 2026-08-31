-- Beat · Şema v7 — işlem para birimi enstrümanın para birimini izler
--
-- transactions.currency, işlemin birim fiyatının hangi cinsten girildiğini
-- söyler. Bu, enstrümanın fiyat para biriminden bağımsız olamaz: enstrüman
-- TL fiyatlanıyorsa alış bedeli de TL'dir. İşlem eklendiği anda enstrümanın
-- o günkü para birimi kopyalanıyordu; enstrümanınki sonradan düzelince
-- (bkz. 0006) işlemler eski değerde kalıyordu — USDTRY'nin bir alımı 'USD'
-- damgalı kalmıştı.
--
-- Bundan sonrası updateInstrument'ta: para birimi değişince o enstrümanın
-- TÜM işlemleri de güncelleniyor.

update transactions t
set currency = i.currency
from instruments i
where i.id = t.instrument_id and t.currency is distinct from i.currency;
