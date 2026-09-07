/**
 * Beat fetch motoru — giriş noktası.
 * Aktif enstrümanları yükler, failover zinciriyle fiyatları çeker,
 * prices + fx_rates'e yazar, fetch_runs + provider_health'e loglar.
 */
import './core/env.js';
import { loadCandidates, loadLatestFx, startRun, finishRun,
         writePrices, writeFxRates, logHealth, markFetched, pool } from './core/db.js';
import { runFetch } from './core/runner.js';
import type { Quote } from './core/types.js';

async function main() {
  const kind = process.argv[2] ?? 'manual';
  const runId = await startRun(kind);
  const { plan, skipped } = await loadCandidates();
  const fxSeed = await loadLatestFx();
  console.log(`\nBeat fetch · kind=${kind} · ${plan.size} enstrüman · seed FX: ${[...fxSeed].map(([b, r]) => `${b}=${r}`).join(' ') || 'yok'}`);
  // Takvim kapısı: her grup kendi gün/aralık/sıklık planına göre çekilir
  // (bkz. loadCandidates). Atlananları yazıyoruz ki "bu varlık neden
  // çekilmedi" sorusu log'dan cevaplanabilsin.
  if (skipped.size) console.log(`atlandı (takvim): ${[...skipped.values()].join(', ')}`);

  const out = await runFetch(plan, fxSeed);

  // Çekim damgası: planlanan HER enstrüman, sonucu ne olursa olsun. Sıklık
  // kapısı buna bakıyor — başarısızı damgasız bırakmak bir sonraki turda
  // (10 dk) yeniden sorduracağı için belgedeki sıklığı bozardı.
  await markFetched([...plan.keys()]);

  // prices
  const priceRows = [...out.quotes].map(([instrumentId, q]) => ({ instrumentId, q }));
  const pricesWritten = await writePrices(priceRows);

  // fx_rates: fx sınıfı 6 harfli semboller (USDTRY -> USD/TRY)
  const fxRows: { base: string; quote: string; q: Quote }[] = [];
  for (const [instrumentId, q] of out.quotes) {
    const cand = plan.get(instrumentId)?.[0];
    // Nakit (TRYTRY) bir kur değil: TRY/TRY=1 satırı fx_rates'e yazılmaz.
    const base = cand?.symbol.slice(0, 3), quote = cand?.symbol.slice(3);
    if (cand?.classCode === 'fx' && cand.symbol.length === 6 && base !== quote) {
      fxRows.push({ base: base!, quote: quote!, q });
    }
  }
  const fxWritten = await writeFxRates(fxRows);

  // sağlık logu
  await logHealth([...out.health].map(([providerId, h]) => ({ providerId, ...h })));

  const ok = out.quotes.size;
  const fail = out.failed.length;
  await finishRun(runId, ok, fail, {
    usedSource: Object.fromEntries(out.usedSource),
    failed: out.failed,
    skippedProviders: [...out.skippedProviders],
  });

  // Özet
  console.log('\nSONUÇ');
  console.log('─'.repeat(64));
  for (const [instrumentId, q] of out.quotes) {
    const sym = plan.get(instrumentId)?.[0]?.symbol ?? '?';
    const src = out.usedSource.get(instrumentId);
    console.log(`OK   ${sym.padEnd(10)} ${String(q.price).padStart(14)} ${q.currency.padEnd(4)} ${src}`);
  }
  for (const f of out.failed) console.log(`FAIL ${f.symbol.padEnd(10)} ${f.reason}`);
  if (out.skippedProviders.size) console.log(`\n(atlanmış provider'lar: ${[...out.skippedProviders].join(', ')})`);
  console.log('─'.repeat(64));
  console.log(`prices +${pricesWritten} · fx_rates +${fxWritten} · başarı ${ok}/${plan.size} · hata ${fail}\n`);

  await pool.end();
  // BOŞ TUR HATA DEĞİLDİR. Takvim kapısı devreye girdiğinden beri turların bir
  // kısmı hiç aday bulmuyor: tetikleyici 10 dk'da bir denerken gruplar 30/60
  // dk'da bir güncelleniyor, yani saatin :10 ve :20'sinde kimsenin sırası
  // gelmiyor. Koşulsuz exit(1) bu turları kırmızı gösterip "motor bozuk"
  // yanılgısı üretirdi. Hata ancak DENENDİ VE HİÇBİRİ ALINAMADI ise vardır.
  if (plan.size > 0 && ok === 0) process.exit(1);
}

main().catch(async (e) => { console.error(e); try { await pool.end(); } catch {} process.exit(1); });
