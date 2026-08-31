-- Beat · Şema v8 — geçmiş yıl kapanışları
--
-- 2021-2025 gibi motor devreye girmeden önceki yılların portföy büyüklüğü.
-- Kullanıcı bunları yalnız TOPLAM olarak biliyor (varlık kırılımı yok), o
-- yüzden position_snapshots'a yazılamaz ve portfolio_snapshots'a da karışmaz:
-- oradaki her satır motorun gerçekten gözlemlediği bir andır, burada ise
-- elle girilmiş bir tarihsel not var. İkisini ayrı tutmak, "hangi sayı
-- ölçüldü, hangisi beyan edildi" sorusunu ileride de cevaplanabilir tutuyor.
--
-- USD alanı isteğe bağlı: geçmiş kur bilinmiyorsa arayüz güncel kurla
-- yaklaşık çevirir ve bunu söyler.

create table if not exists annual_closings (
  year            int primary key check (year between 1990 and 2100),
  total_value_try numeric(20,2) not null check (total_value_try >= 0),
  total_value_usd numeric(20,2) check (total_value_usd >= 0),
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

comment on table annual_closings is
  'Elle girilmiş yıl sonu portföy toplamı (motor öncesi geçmiş). Ölçüm değil beyan.';
