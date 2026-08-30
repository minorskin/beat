# beat-cron — Cloudflare Worker watchdog

GitHub scheduled cron bu repoda ateşlemiyor (dispatch çalışıyor). Bu Worker her 30 dk'da
`fetch.yml`'i `workflow_dispatch` ile tetikler.

## Kurulum
```bash
cd infra/cron-worker
npm install
# 1) Cloudflare girişi (tarayıcı açılır, yetkilendir):
npx wrangler login
# 2) GitHub fine-grained PAT'ı secret olarak ekle (repo: minorskin/beat, Actions: R+W):
npx wrangler secret put GH_TOKEN
# 3) Deploy:
npx wrangler deploy
```
Doğrulama: `npx wrangler tail` (cron log) VE Supabase `fetch_runs` yeni satır (workflow yeşili yetmez).
Manuel test: deploy sonrası `<worker-url>/trigger` → 200 + GitHub'da yeni koşu.
