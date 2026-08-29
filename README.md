# Beat · Finansal Portföy ve Varlık Takip

Sıfır maliyetli (\$0), 7/24 çalışan kişisel portföy takip sistemi.
BIST · ABD hisse/ETF · TEFAS fonları · kripto · altın · döviz.

## Mimari

| Katman | Servis | Neden |
|---|---|---|
| Zamanlama | GitHub Actions cron | Tam Node runtime; kırılgan kaynakları debug etmek kolay |
| Veritabanı | Supabase (Postgres) | Zaman serisi rollup'ları için `date_trunc` / pencere fonksiyonları |
| Arayüz | Cloudflare Pages (PWA) | Sınırsız statik hosting |
| Watchdog | Cloudflare Workers cron | GH cron gecikmesi + 60-gün otomatik kapanma sigortası |

Yerelde hiçbir bileşen çalışmaz. Mac kapalıyken de veri toplanır.

## Veri modeli — üç ilke

1. **`transactions` tek doğruluk kaynağıdır.** Pozisyonlar ondan türetilir; maliyet bazı ve K/Z bedavaya gelir.
2. **`prices` yalnızca gerçekten gözlemlenen tick'leri tutar.** Sentetik satır asla yazılmaz.
3. **Taşınan fiyat işaretlenir.** Piyasa kapalıyken snapshot son fiyatı taşır ama `is_stale=true` ve gerçek `price_ts` ile.

> Portföyün TL değeri tüm piyasalar kapalıyken bile değişir — USDTRY 7/24 hareket eder.
> Bu yüzden döviz katmanı hisse fiyatlarından bağımsız, kendi ritminde çekilir.

## Enstrüman ritimleri

| Sınıf | Takvim | Cadence |
|---|---|---|
| Kripto | 7/24 | saatlik |
| Döviz / Altın | 7/24 | saatlik |
| BIST | 10:00–18:10 TR | piyasa saatleri |
| ABD hisse/ETF | 09:30–16:00 NY | piyasa saatleri |
| TEFAS fonları | akşam NAV | günde 1 |

**EOD kesimi 02:00 TR'de** çalışır ve bir önceki işlem günü etiketlenir.
Sebep: NYSE kapanışı yazın 23:00 TR, **kışın 00:00 TR (ertesi takvim günü)**. 02:00 her iki
DST durumunu da kapsar ve GH cron'un 15–30 dk sapmasına geniş tolerans bırakır.

## Veri kaynakları (29.08.2026 canlı doğrulandı)

| Provider | Kapsam | Not |
|---|---|---|
| `yahoo` | ABD hisse/ETF, BIST (`.IS`) | Resmi değil; **rate-limit'e duyarlı** — ardışık istekler 429 tetikliyor, aralarında bekleme şart |
| `twelvedata` | ABD hisse/ETF | Yahoo yedeği; ücretsiz key 800 istek/gün |
| `tefas` | Türk yatırım fonları | Yeni API. Eski `BindHistoryInfo` **kapatıldı** |
| `coingecko` | Kripto | Batch; 10.000 çağrı/ay |
| `truncgil` | Döviz + Kapalıçarşı altın | Tek istekte 86 alan |
| `tcmb` | Resmi kurlar | `truncgil` yedeği |
| `goldapi` | XAU/USD | Gram TL'ye türetir; `truncgil` GRA ile çapraz doğrulanır (fark %0,07) |

## Kurulum

```bash
npm install
cp .env.example .env      # Supabase + Twelve Data anahtarları
npm run probe             # kaynak sağlığı (buluttan çalıştırmak esas)
npm run typecheck
```

Şema: `supabase/migrations/0001_init.sql` → ardından `supabase/seed.sql`.

## Bilinen eksik

- **`DIF` fon kodu bulunamadı.** TEFAS kataloğundaki 2468 fonun tamamı 3 karakterli;
  beş fon tipinde de (YAT/EMK/BYF/GYF/GSYF) eşleşme yok. Doğru kod netleşince seed'e eklenecek.
