-- Beat · Şema v5 — gayrimenkul varlık sınıfı
--
-- Borsada işlem görmeyen, fiyatını yayınlayan bir servis olmayan varlık:
-- değerlemeyi kullanıcı giriyor ve `constant` sağlayıcısı her turda o değeri
-- yazıyor (bkz. src/providers/constant.ts). Adet = 1 (mülkün kendisi),
-- fiyat = güncel değerleme; kâr/zarar = değerleme − alış bedeli.
--
-- Takvim 7/24: gayrimenkulün "kapanışı" yok, hafta sonu bayat sayılmamalı.

insert into asset_classes (code, name, default_currency, qty_precision, ui_group, sort_order)
values ('realty', 'Gayrimenkul', 'TRY', 4, 'Gayrimenkul', 45)
on conflict (code) do nothing;
