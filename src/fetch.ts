/**
 * Beat fetch motoru — giriş noktası.
 * Aktif enstrümanları yükler, failover zinciriyle fiyatları çeker,
 * prices + fx_rates'e yazar, fetch_runs + provider_health'e loglar.
 */
import './core/env.js';
import { loadCandidates, loadLatestFx, startRun, finishRun,
         writePrices, writeFxRates, logHealth, pool } from './core/db.js';
import { runFetch } from './core/runner.js';
import type { Quote } from './core/types.js';

async function main() {
  const kind = process.argv[2] ?? 'manual';
  const runId = await startRun(kind);
  const plan = await loadCandidates();
  const fxSeed = await loadLatestFx();
  console.log(`\nBeat fetch · kind=${kind} · ${plan.size} enstrüman · seed FX: ${[...fxSeed].map(([b, r]) => `${b}=${r}`).join(' ') || 'yok'}`);

  const out = await runFetch(plan, fxSeed);

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
  if (ok === 0) process.exit(1);
}

main().catch(async (e) => { console.error(e); try { await pool.end(); } catch {} process.exit(1); });
