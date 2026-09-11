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

## Veri modeli — dört ilke

1. **`transactions` tek doğruluk kaynağıdır.** Pozisyonlar ondan türetilir; maliyet bazı ve K/Z bedavaya gelir.
2. **`prices` yalnızca gerçekten gözlemlenen tick'leri tutar.** Sentetik satır asla yazılmaz.
3. **Taşınan fiyat işaretlenir.** Piyasa kapalıyken snapshot son fiyatı taşır ama `is_stale=true` ve gerçek `price_ts` ile.
4. **Sahiplik ayrı bir boyuttur.** Bir pozisyonun adedinin tamamı bana ait olmayabilir; bu adeti bölmekle değil, her satıra emanet payı yazmakla çözülür.

> Portföyün TL değeri tüm piyasalar kapalıyken bile değişir — USDTRY 7/24 hareket eder.
> Bu yüzden döviz katmanı hisse fiyatlarından bağımsız, kendi ritminde çekilir.

## Geriye dönük işlem → geçmiş de düzelir

Snapshot'lar saat başı yazılan **tarihsel** kayıtlardır; motor her turda "şu an elimde ne
var" diye bakar. Bu yüzden geçmişe dönük bir işlem (ya da tarihi geriye çekilen bir işlem)
canlı sayıları anında düzeltirken grafik ve dönemsel kartlar işlemi **deftere girdiği**
anda göstermeye devam ediyordu.

`rebuild_snapshots(from_ts)` (migration `0022`) o andan sonraki snapshot'ları defterle
yeniden hizalar:

- **Fiyata dokunmaz.** Her snapshot kendi kayıtlı fiyatını, `price_ts`'ini ve bayatlık
  damgasını korur; yalnız adetler ve onlardan türeyen tutarlar (değer, maliyet, K/Z,
  ağırlık) yeniden hesaplanır. "O gün fiyat neydi" bilgisi yeniden yazılmaz — yalnız
  "o gün elimde ne vardı" düzelir.
- **Yalnız gerçekten farklı olana dokunur**, yani tekrar tekrar çalıştırmak zararsızdır.
- **Arayüz otomatik çağırır**: işlem eklenince/düzenlenince (`app/actions.ts`). Tarihi
  taşınan bir işlemde eski ve yeni tarihin **eskisinden** başlar.
- **Tabanı vardır**: `app_settings.ledger_epoch`. Portföy sisteme parça parça girildiği
  için o tarihten önceki snapshot'lar bugünkü defterle örtüşmez (ölçüldü: 0,5–3,1 milyon
  TL). Onarım oraya inmez; bilerek inmek için `--force`.

```bash
npm run rebuild -- 2026-09-09T13:00:00Z          # kuru çalıştırma, ne değişecek yazar
npm run rebuild -- 2026-09-09T13:00:00Z --apply  # uygular
```

Defterin "o ana göre" hali `holdings_at(ts)` ile alınır; `v_holdings` artık aynı
yürüyüşün (`v_holdings_walk`) son satırıdır — iki hesap ayrışamaz.

### Tarih alanı TR duvar saati konuşur

`datetime-local` dilimsiz bir değer taşır. Tarayıcı onu kendi diliminde okur, sunucu ve
veritabanı ise UTC'de çalışır; araya çeviri konmazsa ekranda 16:53 yazan işlem veritabanına
16:53Z = TR 19:53 olarak düşer — **her kaydetmede +3 saat, üstelik birikerek**. Giriş
(`fromLocalInput`) ve forma basma (`toLocalInput`) `lib/format`'ta, sayfanın geri kalanıyla
aynı dilime (Europe/Istanbul) sabitlendi.

## Kısmi sahiplik (emanet)

Bir pozisyondaki adetin bir kısmı başkası adına tutulabiliyor. Aynı enstrümanı ikiye
bölmek maliyet bazını bozacağı için sahiplik **ayrı bir boyut** olarak işleniyor:

- Her işlem satırı `external_quantity` taşır — o işlemdeki adetin bana ait olmayan kısmı.
- `own = quantity - external_qty`; `v_holdings` her ikisini de verir.
- Snapshot'lar **hem toplam hem bana-ait** büyüklüğü yazar (`own_value_try`, `own_cost_try`, …).
  Bu yüzden arayüzdeki **Toplam / Bana Ait** anahtarı geçmiş grafiklerde de doğru çalışır —
  istemcide oransal tahmin yapılmaz.
- Mevcut bir pozisyonu geriye dönük paylaştırmak için `transfer` tipi kullanılır:
  adet değişmez, yalnız emanet payı güncellenir.

## İzleme listesi

Ayrı tablo yok. **Kataloğa eklenmiş ama pozisyonu olmayan enstrüman = izlenen enstrüman**
(`v_watchlist`). Arayüzden eklenen enstrümanın para birimi, güncelleme takvimi ve
failover zinciri varlık sınıfından türetilir (`apps/web/src/lib/catalog.ts`; `seed.sql`'deki
zincirlerle aynı tutulmalı). Fiyatı bir sonraki fetch turundan itibaren birikmeye başlar;
ilk alım girildiğinde satır kendiliğinden portföye geçer.

## Enstrüman grubu güncelleme planı

Her enstrüman grubunun kendi **günü, çalışma aralığı, zaman dilimi ve sıklığı** var.
Plan koda gömülü değil, `market_calendars` tablosunda durur ve motor onu birebir
uygular (`loadCandidates`, `supabase/migrations/0016_group_schedules.sql`).

| Grup | Takvim kodu | Günler | Çalışma aralığı (TSİ) | Sıklık |
|---|---|---|---|---|
| Fon | `FON` | her gün | 00:00–23:59 | saat başı |
| Döviz | `DOVIZ` | her gün | 00:00–23:59 | yarım saatte bir |
| Kripto | `KRIPTO` | her gün | 00:00–23:59 | yarım saatte bir |
| TR hisse senedi | `HISSE_TR` | hafta içi | 10:00–18:30 | yarım saatte bir |
| ABD hisse senedi | `HISSE_ABD` | hafta içi | 16:00–23:59 * | yarım saatte bir |
| ETF | `ETF` | hafta içi | 00:00–23:59 | yarım saatte bir |
| Altın | `ALTIN` | hafta içi | 00:00–23:59 | yarım saatte bir |
| Endeks | `ENDEKS` | her gün | 00:00–23:59 | yarım saatte bir |
| Gayrimenkul | `GAYRIMENKUL` | — | — | güncellenmez |

Zaman dilimi hepsinde `Europe/Istanbul`.

\* Tabloda verilen kapanış 23:00'ti; **23:59 kullanılıyor.** NYSE seansı 09:30–16:00 ET,
yani TSİ ile yazın 16:30–23:00 ama **kışın 17:30–00:00**. 23:00'te kapatan bir pencere
kışın seansın son saatini hiç görmezdi; 23:59 her iki DST durumunu da kapsıyor ve
mevsimlik bakım gerektirmiyor (EOD kesiminin 02:00'de olmasıyla aynı gerekçe). Kışın
00:00'de oluşan kapanış tick'i o günün penceresine yetişmez, ertesi gün 16:00'daki ilk
turda alınır — Yahoo yeni seans başlayana kadar son kapanışı döndürdüğü için veri
kaybolmuyor.

**Sıklık nasıl uygulanıyor:** tetikleyiciler tam :00/:30'a oturmuyor (Worker 30 dk'da
bir, GH Actions ayrıca 10 dk'da bir denemeye çalışıyor). Motor duvar saatini
`interval_minutes`lik dilimlere böler ve bir enstrümanı **bir dilimde en fazla bir kez**
çeker; damga `instruments.last_fetch_at`'te durur (deneme başarısız olsa da atılır —
kaynak bozulduğunda sorgu sıklığı kendiliğinden artmasın diye).

**İki istisna:**

- **Fail-open** — hiç fiyatı olmayan enstrüman **gün ve pencere** kapısına takılmaz;
  yoksa cuma akşamı eklenen bir BIST hissesi pazartesi 10:00'a kadar fiyatsız kalırdı.
  Sıklık kapısına yine uyar: sınırsız bırakılınca hiçbir kaynağın veremediği bir sembol
  sonsuza dek 10 dk'da bir sorulur ve başka kimsenin sırası gelmediği turları tek başına
  "hepsi başarısız"a çevirirdi.
- **Gayrimenkul** — zamanlanmış çekimi yok. Fiyatı `constant` sağlayıcıdan gelen bir
  değerleme; kullanıcı arayüzden değiştirdiğinde motor beyan edilen değerin son yazılan
  fiyattan farklı olduğunu görür ve **tek seferlik** çeker.

> **Not — fonlar artık gün boyu sorgulanıyor.** Belgedeki plan "her gün, 00:00–23:59,
> saat başı" diyor. Önceki tasarım fonları yalnız hafta içi 06:00–10:00 arası ve o günün
> NAV'ı gelene kadar sorguluyordu (fon başına ~6 istek/gün); yeni plan fon başına
> 24 istek/gün demek. TEFAS günde tek NAV yayınladığı için bu isteklerin çoğu aynı
> değeri döndürür — `prices` tarafında yeni satır oluşmaz, maliyet yalnız boşa giden
> istek. TEFAS'ın ~6 istek/dk sınırı aşılmıyor (tur başına fon sayısı kadar istek).
>
> Yayın saatleri ölçüldü (saatlik `position_snapshots`'ta `price_ts`'in atladığı an):
> THF 07:00 · 07:00 · 07:00 — DFI 09:00 · 08:00 — TLY 10:00 · 08:00 · 07:00. Gün boyu
> sorgulama, eski penceredeki "NAV 10:00'dan sonra gelirse o gün hiç yazılmaz" sınırını
> da ortadan kaldırıyor.

### Bayatlık ayrı bir eksen

`interval_minutes` "ne kadar sık **soruyoruz**", `stale_after_minutes` "fiyatın kendisi
ne kadar sıklıkla **değişiyor**" sorusunu cevaplar — ikisi aynı şey değil (TEFAS'a saat
başı sorsak da NAV günde bir değişir). Bir fiyat, grubun **açık geçen** dakikaları
eşiği aşınca taşınmış sayılır (`schedule_open_minutes`): BIST cuma 18:30'da kapanıp
pazartesi 10:00'da açtığında aradaki hafta sonu fiyatı yaşlandırmaz. Eşikler:
fon 30 sa · döviz/kripto/altın/endeks 3 sa · hisse ve ETF 6 sa · gayrimenkul hiç.

Arayüzde bu, sembolün yanındaki gri noktadır; açıklaması pencerenin o an açık olup
olmadığına göre değişir ("penceresi kapalı" ≠ "pencere açık ama veri gelmedi").

**Boş tur hata değildir.** Tetikleyici 10 dk'da bir denerken gruplar 30/60 dk'da bir
güncellendiği için saatin :10 ve :20'sinde hiçbir enstrümanın sırası gelmez; motor bu
turlarda sıfır adayla çıkar ve başarıyla biter. Hata ancak *denendi ve hiçbiri alınamadı*
ise vardır. Özet kartındaki güncelleme rozeti de "en son biten tur"a değil **fiyatın
gerçekten geldiği son tura** (`ok_count > 0`) bakar.

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
| `goldapi` | XAU/USD spot | İki iş görür: `gold` sınıfında gram TL'ye türetir (`truncgil` GRA ile çapraz doğrulanır, fark %0,07), maden/dolar paritesinde (`XAUUSD`) ham USD fiyatını döndürür |
| `constant` | Nakit (`TRYTRY`, `USDUSD`) | Ağa çıkmaz; bir para biriminin kendi cinsinden fiyatı tanım gereği 1 |

## Kurulum

```bash
npm install
cp .env.example .env      # Supabase + Twelve Data anahtarları
npm run probe             # kaynak sağlığı (buluttan çalıştırmak esas)
npm run typecheck
```

Şema: `supabase/migrations/0001_init.sql` → … → `0022_backdated_history.sql` (sırayla) →
ardından `supabase/seed.sql`.
Migration'lar sıralı ve idempotent'e yakındır (`add column if not exists`); mevcut kurulumda
yalnız yeni olanı çalıştırmak yeterli.

## Bilinen eksik

- ~~**XAUUSD fiyat alamıyor.**~~ **Çözüldü (07.09.2026).** Döviz zincirindeki iki kaynak
  (truncgil, tcmb) değerli madeni yalnız TL karşılığı kote ettiği için XAU/USD paritesini
  veremiyordu; enstrüman kataloğa girdiği günden beri fiyatsızdı. Artık `goldapi`
  sağlayıcısı maden/dolar paritesinde çevrim yapmadan ons başına USD fiyatını döndürüyor
  (migration `0017`). Yahoo alternatifi elendi: `XAUUSD=X` diye bir sembol yok, karşılığı
  `GC=F` ise COMEX vadelisi — spot değil.
- **`DIF` fon kodu bulunamadı.** TEFAS kataloğundaki 2468 fonun tamamı 3 karakterli;
  beş fon tipinde de (YAT/EMK/BYF/GYF/GSYF) eşleşme yok. Doğru kod netleşince arayüzden “+ Enstrüman” ile eklenecek.
