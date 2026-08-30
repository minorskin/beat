# beat-cron — Cloudflare Worker watchdog

GitHub scheduled cron bu repoda ateşlemiyor (dispatch çalışıyor). Bu Worker her 30 dk'da
`fetch.yml`'i `workflow_dispatch` ile tetikler. Worker motoru çalıştırmaz; sadece güvenilir tetikleyici.

**Güvenlik:** `workers_dev: false` → public HTTP yüzeyi YOK, sadece cron. `/trigger` yalnız
opsiyonel `TRIGGER_KEY` secret'ı ayarlıysa ve `X-Beat-Key` başlığı eşleşirse çalışır; aksi halde 404.

## Kurulum
```bash
cd infra/cron-worker
npm install
npx wrangler login                 # tarayıcı açılır, Cloudflare'ı yetkilendir
npx wrangler secret put GH_TOKEN   # GitHub fine-grained PAT (repo: minorskin/beat, Actions: R+W)
npx wrangler deploy
```

## Doğrulama (tek yeşil koşu YETMEZ)
- `npx wrangler tail` → her 30 dk "dispatch ok (204)" logu
- Supabase `fetch_runs` → started_at'lerin ~30 dk'da bir DÜZENLİ olduğunu gör
- GitHub Actions → workflow_dispatch koşuları düzenli geliyor mu

## GH token
Fine-grained PAT · yalnız `minorskin/beat` · Permissions → Actions: Read and write · kısa süreli.
