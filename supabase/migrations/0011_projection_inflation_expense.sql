-- Beat · Şema v11 — projeksiyona enflasyon + gider, süre tavanı 10 yıl
--
-- Üç değişiklik:
--
-- 1. SENARYO ADLARI NÖTRLENDİ. 0010'daki 'Kötümser/Temkinli/…' isimleri bir
--    öneriydi; senaryoyu kimin nasıl adlandıracağı kullanıcının kararı. Slot
--    numarasından başka bir şey yazmıyoruz. Yalnız HÂLÂ o varsayılan adı
--    taşıyan satırlar yeniden adlandırılır — kullanıcının kendi verdiği bir
--    ad varsa ona dokunulmaz.
--
-- 2. SÜRE TAVANI 360 → 120 AY. Aylık bileşik oranla 30 yıl projeksiyon
--    yapmak sayı üretiyor ama bilgi üretmiyor; 10 yıl kaydırıcının her
--    adımını da anlamlı kılıyor.
--
-- 3. ENFLASYON VE GİDER. İkisi de AYLIK ve ikisi de negatif etkili:
--
--      v[m] = v[m-1] × (1+getiri)  +  gelir[m]  −  gider[m]
--      gelir[m] = aylık_ekleme ÷ (1+enflasyon)^m     ← enflasyon geliri düşürür
--      gider[m] = aylık_gider   × (1+enflasyon)^m    ← enflasyon gideri artırır
--
--    Yani enflasyon tek bir kaydırıcıyla makasın iki ağzını birden açıyor:
--    koyabildiğin küçülürken çıkardığın büyüyor. Getiri oranına DOKUNMAZ —
--    getiriyi de ayrıca reel'e çevirmek aynı etkiyi üçüncü kez saymak olurdu;
--    nominal getiriyi kullanıcı zaten kendi kaydırıcısından ayarlıyor.
--
--    Gider de aylık ekleme gibi TL saklanır; USD görünümünde güncel kurla
--    çevrilir (bkz. 0010).

alter table projection_scenarios
  add column if not exists monthly_inflation  numeric(6,2)  not null default 0,
  add column if not exists monthly_expense_try numeric(20,2) not null default 0;

alter table projection_scenarios
  drop constraint if exists projection_scenarios_monthly_inflation_check,
  add  constraint projection_scenarios_monthly_inflation_check
       check (monthly_inflation >= 0 and monthly_inflation <= 10);

alter table projection_scenarios
  drop constraint if exists projection_scenarios_monthly_expense_try_check,
  add  constraint projection_scenarios_monthly_expense_try_check
       check (monthly_expense_try >= 0 and monthly_expense_try <= 200000);

-- Süre tavanı: önce mevcut satırları sınıra çek, sonra kısıtı daralt.
update projection_scenarios set months = 120 where months > 120;
alter table projection_scenarios
  drop constraint if exists projection_scenarios_months_check,
  add  constraint projection_scenarios_months_check
       check (months between 1 and 120);

-- Adları nötrle — yalnız 0010'un bıraktığı varsayılanlar için.
update projection_scenarios set name = 'Senaryo ' || slot, updated_at = now()
 where (slot, name) in (
   (1,'Kötümser'), (2,'Temkinli'), (3,'Baz'), (4,'İyimser'), (5,'Agresif'));

comment on column projection_scenarios.monthly_inflation is
  'Aylık enflasyon %. Geliri (1+i)^m ile böler, gideri (1+i)^m ile çarpar.';
comment on column projection_scenarios.monthly_expense_try is
  'Aylık gider (TL). Portföyden düşülür; enflasyonla birlikte büyür.';
