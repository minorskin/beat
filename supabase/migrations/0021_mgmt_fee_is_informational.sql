-- Beat · Şema v21 — yönetim ücreti bir KESİNTİ değil, künye bilgisi
--
-- 0020 bu kolonu "güncel tutardan kesilecek oran" diye tanımlamıştı; yanlıştı.
-- TEFAS fonlarında yönetim ücreti yatırımcıdan ayrıca tahsil edilmez: fon
-- varlığından her gün yıllık oranın 1/365'i kadar kesilir ve birim pay değeri
-- bu kesintiden SONRA oluşur. Yani çekilen fiyat ücretten zaten arınmıştır;
-- güncel tutardan bir kez daha düşmek onu ikinci kez saymak olur.
--
-- Aynı sebeple stopajın matrahı "satış bedeli − alış bedeli"dir: ücret matrahtan
-- indirilmez, çünkü fiyata çoktan yansımıştır.
--
-- Kolon duruyor (fonun künyesi, arayüzde "fiyata dahil" notuyla gösteriliyor),
-- yalnız ne olduğu düzeltiliyor. Veri değişmiyor.

comment on column instruments.mgmt_fee_rate is
  'Fonun yıllık yönetim ücreti oranı, yüzde (ör. 2 = %2). KESİNTİ DEĞİL: ücret '
  'fon varlığından günlük kesilip birim pay değerine yansıdığı için fiyat zaten '
  'ondan arınmıştır. Yalnız künye bilgisi. NULL: girilmedi.';
