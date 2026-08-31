-- Beat · Şema v4 — varlık bazında kâr vergisi oranı
--
-- Stopaj/kâr vergisi enstrümanın kendi özelliği: aynı varlığın her lot'u aynı
-- orandan vergilenir, oran işlemle değil varlıkla gelir. Bu yüzden alan
-- instruments'ta duruyor, transactions'ta değil.
--
-- NULL = "girilmedi" (bilinmiyor), 0 = "vergi yok" — ikisi aynı şey değil,
-- bu yüzden varsayılan 0 değil NULL.

alter table instruments
  add column if not exists tax_rate numeric(6,3);

alter table instruments
  drop constraint if exists instruments_tax_rate_range;
alter table instruments
  add constraint instruments_tax_rate_range
  check (tax_rate is null or (tax_rate >= 0 and tax_rate <= 100));

comment on column instruments.tax_rate is
  'Kâr üzerinden kesilecek vergi oranı, yüzde (ör. 10 = %10). NULL: girilmedi.';
