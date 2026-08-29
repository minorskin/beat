/**
 * Kaynak sağlık probe'u — BULUTTAN çalıştırılır (GitHub Actions).
 * Amacı: hangi kaynağın Azure çıkış IP'sinden erişilebildiğini KANITLAMAK.
 * TR IP'sinden yapılan yerel testler bu soruyu cevaplamıyor (Yahoo TR'de 429, TEFAS TR'de çalışıyor).
 */
import { tefasProvider } from './providers/tefas.js';
import { coingeckoProvider } from './providers/coingecko.js';
import { truncgilProvider } from './providers/truncgil.js';
import { tcmbProvider } from './providers/tcmb.js';
import { goldapiProvider } from './providers/goldapi.js';
import { yahooProvider } from './providers/yahoo.js';
import { twelvedataProvider } from './providers/twelvedata.js';
import { UA, getJson } from './core/types.js';

const providers = [
  yahooProvider, twelvedataProvider, tefasProvider,
  coingeckoProvider, truncgilProvider, tcmbProvider, goldapiProvider,
];

/** BIST fiyat kaynağı için aday endpoint'ler — hangisi buluttan açık, ölçerek bulacağız. */
const BIST_CANDIDATES: { name: string; url: string; expect: string }[] = [
  { name: 'yahoo THYAO.IS',   url: 'https://query1.finance.yahoo.com/v8/finance/chart/THYAO.IS?range=1d&interval=1h', expect: 'regularMarketPrice' },
  { name: 'bigpara list',     url: 'https://bigpara.hurriyet.com.tr/api/v1/hisse/list', expect: 'THYAO' },
  { name: 'bigpara detay',    url: 'https://bigpara.hurriyet.com.tr/api/v1/hisse/detay/THYAO', expect: 'THYAO' },
  { name: 'truncgil XU100',   url: 'https://finance.truncgil.com/api/today.json', expect: 'XU100' },
];

async function main() {
  const ip = await getJson<{ ip: string; country?: string; org?: string }>('https://ipinfo.io/json').catch(() => null);
  console.log(`\nÇıkış IP: ${ip?.ip ?? '?'} · ülke: ${ip?.country ?? '?'} · ${ip?.org ?? ''}\n`);

  console.log('SAĞLAYICI SAĞLIĞI');
  console.log('─'.repeat(78));
  let down = 0;
  for (const p of providers) {
    const h = await p.health();
    if (h.status === 'down') down++;
    const icon = h.status === 'ok' ? 'OK  ' : h.status === 'degraded' ? 'ZAYIF' : 'DOWN';
    console.log(`${icon.padEnd(6)} ${p.id.padEnd(12)} ${String(h.latencyMs ?? '-').padStart(6)}ms  ${h.error ?? ''}`.slice(0, 160));
  }

  console.log('\nBIST FİYAT KAYNAĞI ADAYLARI');
  console.log('─'.repeat(78));
  for (const c of BIST_CANDIDATES) {
    try {
      const res = await fetch(c.url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15_000) });
      const body = await res.text();
      const hit = body.includes(c.expect);
      console.log(`${res.ok && hit ? 'OK  ' : 'HAYIR'}  ${c.name.padEnd(20)} http=${res.status} beklenen-alan=${hit}`);
    } catch (e) {
      console.log(`HATA   ${c.name.padEnd(20)} ${String(e).slice(0, 60)}`);
    }
  }

  console.log('\nÇAPRAZ DOĞRULAMA · gram altın');
  console.log('─'.repeat(78));
  try {
    const now = new Date();
    const fx = await truncgilProvider.fetchQuotes(
      [{ symbol: 'USDTRY', providerSymbol: 'USD', classCode: 'fx', currency: 'TRY' }], { now });
    const usdtry = fx.quotes[0]?.price;
    const direct = await truncgilProvider.fetchQuotes(
      [{ symbol: 'GRAMALTIN', providerSymbol: 'GRA', classCode: 'gold', currency: 'TRY' }], { now });
    const derived = await goldapiProvider.fetchQuotes(
      [{ symbol: 'GRAMALTIN', providerSymbol: 'XAU', classCode: 'gold', currency: 'TRY' }],
      { now, fxLookup: (b, q) => (b === 'USD' && q === 'TRY' ? usdtry : undefined) });
    const a = direct.quotes[0]?.price, b = derived.quotes[0]?.price;
    if (a && b) {
      const diff = (Math.abs(a - b) / a) * 100;
      console.log(`truncgil GRA : ${a.toFixed(2)} TL`);
      console.log(`XAU türetme  : ${b.toFixed(2)} TL  (USDTRY=${usdtry})`);
      console.log(`fark         : %${diff.toFixed(3)}  ${diff < 1 ? '-> tutarlı' : '-> UYARI: kaynaklardan biri bozuk olabilir'}`);
    } else console.log('karşılaştırma yapılamadı');
  } catch (e) { console.log('HATA:', String(e).slice(0, 120)); }

  console.log('');
  if (down) { console.error(`${down} sağlayıcı DOWN.`); process.exit(1); }
}

main().catch((e) => { console.error(e); process.exit(1); });
