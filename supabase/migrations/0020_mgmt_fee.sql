-- Beat · Şema v20 — varlık bazında yönetim ücreti oranı
--
-- Vergi (0004) kârdan kesilir; yönetim ücreti ise KÂRDAN DEĞİL, elde tutulan
-- tutardan kesilir: fon/portföy yönetim ücreti varlığın büyüklüğü üzerinden
-- alınır, kazandırsa da kaybettirse de. İkisi ayrı kolon çünkü ayrı matrahları
-- var; bir varlıkta yalnız biri, ikisi birden ya da hiçbiri olabilir.
--
-- Oran enstrümanın kendi özelliği (aynı fonun her lot'u aynı orandan ücretlenir),
-- bu yüzden işlemde değil instruments'ta duruyor — tax_rate ile birebir aynı
-- gerekçe.
--
-- NULL = "girilmedi", 0 = "ücret yok". İkisi aynı şey değil: biri bilgi eksikliği,
-- diğeri bilginin kendisi. tax_rate'te de kural bu.

alter table instruments
  add column if not exists mgmt_fee_rate numeric(6,3);

alter table instruments
  drop constraint if exists instruments_mgmt_fee_range;
alter table instruments
  add constraint instruments_mgmt_fee_range
  check (mgmt_fee_rate is null or (mgmt_fee_rate >= 0 and mgmt_fee_rate <= 100));

comment on column instruments.mgmt_fee_rate is
  'Güncel tutar üzerinden alınan yönetim ücreti oranı, yüzde (ör. 2 = %2). NULL: girilmedi.';
