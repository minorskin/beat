-- Beat · Şema v10 — büyüme projeksiyonu senaryoları
--
-- Projeksiyon paneli şimdiye kadar tek bir varsayım kümesi (getiri / aylık
-- ekleme / süre) tutuyordu ve bu küme yalnız bileşen state'inde yaşıyordu:
-- sayfa yenilenince kayboluyordu. "Kötümser ile iyimser arasında ne kadar
-- fark var" sorusu ise ancak İKİ eğri aynı eksende çizilince cevaplanıyor.
--
-- Bu yüzden senaryolar kalıcı hale geliyor ve SABİT BEŞ SLOT olarak
-- tutuluyor. Serbest sayıda satır değil, çünkü:
--   1. Her slotun rengi slot numarasından türetiliyor (grafikte renk↔senaryo
--      eşlemesi kayıt silinip eklendikçe kaymasın diye).
--   2. Beşten fazla eğri aynı eksende üst üste okunmuyor — CVD altında
--      ayırt edilebilir ton sayısı zaten sınırlı.
-- Slotlar silinmez, üzerine yazılır: "yeni senaryo" = boş bir slotu düzenlemek.
--
-- Aylık ekleme TL cinsinden saklanır (monthly_try). Arayüz USD görünümündeyken
-- güncel kurla çevirip gösterir ve kaydederken geri çevirir — projeksiyon
-- zaten geleceğe dair bir varsayım, tek para biriminde tutmak iki kolonun
-- birbirinden kopması riskinden iyidir.

create table if not exists projection_scenarios (
  slot         smallint primary key check (slot between 1 and 5),
  name         text not null check (length(btrim(name)) between 1 and 24),
  -- AYLIK getiri yüzdesi (yıllık değil) — birikim de aylık işlediği için
  -- ikisi aynı periyotta olmak zorunda.
  monthly_rate numeric(6,2) not null check (monthly_rate >= 0 and monthly_rate <= 20),
  monthly_try  numeric(20,2) not null check (monthly_try >= 0),
  months       int not null check (months between 1 and 360),
  updated_at   timestamptz not null default now()
);

comment on table projection_scenarios is
  'Büyüme projeksiyonunun beş sabit senaryo slotu. Ölçüm değil varsayım.';

-- Başlangıç kümesi: aynı aylık eklemeyle yalnız getiri varsayımı değişiyor,
-- böylece ilk açılışta beş eğri "getiri oranı ne kadar fark yaratıyor"
-- sorusunu doğrudan gösteriyor.
insert into projection_scenarios (slot, name, monthly_rate, monthly_try, months) values
  (1, 'Kötümser', 1.0, 10000, 60),
  (2, 'Temkinli', 1.8, 10000, 60),
  (3, 'Baz',      2.5, 10000, 60),
  (4, 'İyimser',  3.2, 10000, 60),
  (5, 'Agresif',  4.0, 10000, 60)
on conflict (slot) do nothing;

-- Not: en agresif senaryo doğrusal eksende diğerlerini ezer — 60 ayda aylık
-- %1 ile %4 arasındaki fark on kata çıkar. Arayüzdeki "Log" düğmesi tam bu
-- yüzden var; başlangıç değerleri de kasten dar tutuldu.
