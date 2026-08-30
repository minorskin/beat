# Beat — Kontrol Noktası (2026-08-30)

Bu dosya, oturum kapanırken bırakılan durumu ve **doğrulanmış** bilgileri özetler.
Yeni bir oturum açıldığında önce burayı oku.

## Sistem durumu: ÇALIŞIYOR ✅

```
📡 Motor        GitHub Actions (fetch.yml) — CF Worker tarafından her 30dk tetikleniyor
🗄️  Veritabanı   Supabase Postgres (Frankfurt) — jcbikyquijcealtqafvk
📊 Dashboard    Vercel (Frankfurt) — https://web-kohl-one-20.vercel.app · şifre — bkz. Vercel env APP_PASSWORD (buraya asla yazma)
⏰ Cron         Cloudflare Worker (beat-cron) — GH schedule ölü olduğu için asıl tetikleyici bu
```

## En kritik doğrulanmış gerçek: cron zinciri

**GitHub'ın kendi scheduled cron'u bu repoda kalıcı olarak ölü** (00:11 UTC'den sonra
saatlerce hiç tetiklenmedi, birden fazla fix denendi, hiçbiri işe yaramadı — bkz. memory
`beat-project.md`). Bu yüzden **tek güvenilir tetikleyici Cloudflare Worker'dır.**

**2026-08-30 10:47 UTC'de doğrulandı:**
```
gh run list --workflow=fetch.yml --limit 10 --json createdAt,event
```
çıktısı: 09:00, 09:30, 10:00, 10:30'da dört ardışık `workflow_dispatch` koşusu, tam 30dk
arayla. Bunlar Worker'ın tetiklediği koşulardı (GH'nin `schedule` event'i değil). **Zincir
çalışıyor.**

### Eğer veri akışı yeniden durursa, ilk bakılacak yerler:
1. `gh run list --workflow=fetch.yml --limit 10` → event `workflow_dispatch` mi geliyor mu?
   Gelmiyorsa Worker durmuş demektir.
2. Cloudflare dashboard → Workers & Pages → `beat-cron` → **Cron Triggers** sekmesi → son
   çalışma zamanı ve hata var mı bak. Ya da `cd infra/cron-worker && npx wrangler tail`
   ile canlı log izle (bir sonraki :00/:30'u bekle).
3. `npx wrangler secret list` → `GH_TOKEN` hâlâ orada mı? (Fine-grained PAT süresi
   dolmuş olabilir — GitHub'da yeniden oluşturup `wrangler secret put GH_TOKEN` ile
   güncelle.)
4. Supabase'de doğrudan kontrol:
   ```sql
   select kind, status, started_at, ok_count from fetch_runs order by started_at desc limit 10;
   ```
   `started_at` değerleri ~30dk aralıklarla düzenli mi?

**Önemli:** Tek bir yeşil GH Actions koşusuna bakıp "çalışıyor" deme — GH schedule da
tek seferliğine ateşleyip sonra ölmüştü. Asıl kanıt: **düzenli aralıklı, `workflow_dispatch`
event'li, birbirini takip eden koşular.**

## Worker güvenliği (bilerek böyle kuruldu)

`infra/cron-worker/wrangler.jsonc` → `"workers_dev": false` — Worker'ın public HTTP
adresi **kasıtlı olarak kapalı**. Sadece cron tetikleyici olarak çalışır, dışarıdan
hiçbir istek kabul etmez. `/trigger` endpoint'i kodda var ama yalnız opsiyonel
`TRIGGER_KEY` secret'ı ayarlanmışsa çalışır — ayarlanmadıysa (varsayılan durum) her
istek 404 döner. Bunu **değiştirme** — sebebi: BIST'in tek fiyat kaynağı Yahoo, o
rate-limit'e karşı hassas; auth'suz public bir tetikleyici olsaydı biri flood atıp
Yahoo'yu bloklatabilirdi.

## Repo public — bilerek

`minorskin/beat` bilerek **public** yapıldı (public repo = GitHub Actions'ta sınırsız
dakika, aksi halde cron sık çalıştıkça kota biterdi). Push öncesi tam sır taraması
yapıldı, sıfır sır bulundu. Tüm gerçek sırlar (DB şifresi, dashboard şifresi, API
anahtarları, GH_TOKEN) ya GitHub Secrets'ta ya Vercel env'de ya Cloudflare Worker
secret'ında — hiçbiri kodda değil.

## Bilinen açık işler

- **BIST failover yok** — tek kaynak Yahoo (buluttan çalıştığı doğrulandı). `bigpara`
  denendi, fiyat endpoint'leri 403 veriyor (bot koruması), kullanılamaz. truncgil'de
  de bireysel BIST hissesi yok (sadece XU100 endeksi). Şimdilik risk kabul edildi.
- **Test verisi hâlâ DB'de** — `transactions` tablosunda `note='ornek'` etiketli 8
  işlem var. Kullanıcı gerçek portföyünü girdiğinde şu SQL ile temizlenebilir:
  ```sql
  delete from transactions where note='ornek';
  ```
- **Dönemsel değişim şeridi kısmen dolu** — Gün/Hafta/Ay pencereleri yeterli geçmiş
  snapshot birikince otomatik dolacak (şu an sadece "Başından" değeri var).

## Son commit'ler (bu oturumda)

```
1328ce0  fix(worker): HTTP yüzeyini kapat (workers_dev:false) + /trigger'ı secret'la koru
2d33a64  feat: Cloudflare Worker cron watchdog
c76761e  feat: dönemsel değişim şeridi (gün/hafta/ay/başından)
446280b  feat: kısmi sahiplik (emanet) + izleme listesi
a03678e  style: grafiklerde renk geri, sticky header + Dashboard/Portföy bölümleri
edfbe44  style: siyah-tema redesign — border'sız, düşük radius, responsive
```

## Detaylı proje hafızası

Bu dosya bir özet/checkpoint'tir. Mimari kararlar, veri modeli, tam kaynak listesi ve
geçmiş kararların gerekçeleri için:
`~/.claude/projects/-Users-harmony-Projects-Beat/memory/beat-project.md`
