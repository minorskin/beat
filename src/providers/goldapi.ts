/**
 * gold-api — XAU/USD spot (keysiz, anahtar gerektirmez).
 *
 * İKİ İŞ GÖRÜR, çünkü kaynak tek bir sayı veriyor (ons başına USD) ve o sayı
 * iki ayrı soruya cevap:
 *
 *   1. `gold` sınıfı — "gram altın TL kaç": ons USD fiyatı USDTRY ile çarpılıp
 *      troy onsa bölünür. Türetme olduğu için fxLookup şart.
 *      truncgil GRA ile çapraz doğrulandı: 29.08.2026'da fark %0,07.
 *      Sapma büyürse kaynaklardan biri bozulmuş demektir -> provider_health'e yazılır.
 *   2. `fx` sınıfı, değerli maden paritesi (XAUUSD, XAGUSD) — "ons kaç dolar":
 *      kaynağın verdiği sayı zaten budur, hiçbir çevrim yapılmaz.
 *
 * (2) neden burada: XAU ISO 4217'de bir para birimi kodu, XAU/USD de düpedüz
 * bir parite — ama truncgil ve tcmb değerli madeni yalnız TL karşılığı kote
 * ediyor, dolayısıyla döviz zincirindeki iki kaynak da bu pariteyi veremiyor
 * (XAUUSD bu yüzden kataloğa girdiği günden beri fiyatsızdı). Ölçüyü değiştirip
 * vadeli altın sözleşmesini (Yahoo `GC=F`) spot diye yazmak yerine, spot fiyatı
 * zaten elinde olan sağlayıcıya paritenin kendisini de sordurmak doğrusu.
 */
import { PriceProvider, ProviderResult, Quote, SymbolRef, getJson, TROY_OUNCE_GRAMS } from '../core/types.js';

interface GoldApi { price: number; symbol: string; updatedAt: string }

/** Kaynağın kote edebildiği madenler — fx zincirinde yalnız bunlar buraya düşer. */
const METALS = ['XAU', 'XAG', 'XPT', 'XPD'];

/** fx sınıfında değerli maden / dolar paritesi mi (XAUUSD, XAGUSD…)? */
export const isMetalUsdPair = (symbol: string) =>
  symbol.length === 6 && METALS.includes(symbol.slice(0, 3)) && symbol.slice(3) === 'USD';

const handles = (s: SymbolRef) =>
  s.classCode === 'gold' || (s.classCode === 'fx' && isMetalUsdPair(s.symbol));

export const goldapiProvider: PriceProvider = {
  id: 'goldapi',
  supports: ['gold', 'fx'],
  capabilities: { batch: false, historical: false, rateLimit: { perMinute: 30 } },
  canHandle: handles,

  async fetchQuotes(syms, ctx): Promise<ProviderResult> {
    const quotes: Quote[] = [];
    const errors: ProviderResult['errors'] = [];
    // USDTRY yalnız gram TL TÜRETMESİ için gerekli. Parite sorgusu çevrim
    // yapmadığı için kur yokken de cevap verebilmeli — eskiden tek bir erken
    // return bütün sembolleri birden düşürüyordu.
    const usdtry = ctx.fxLookup?.('USD', 'TRY');

    for (const s of syms) {
      const derived = s.classCode === 'gold';
      if (derived && !usdtry) {
        errors.push({ symbol: s.symbol, message: 'USDTRY kuru yok' });
        continue;
      }
      try {
        const d = await getJson<GoldApi>(`https://api.gold-api.com/price/${s.providerSymbol}`);
        quotes.push({
          symbol: s.symbol,
          price: derived ? (d.price * usdtry!) / TROY_OUNCE_GRAMS : d.price,
          currency: derived ? 'TRY' : 'USD',
          ts: new Date(d.updatedAt),
          source: 'goldapi',
          raw: derived ? { ...d, usdtry } : d,
        });
      } catch (e) { errors.push({ symbol: s.symbol, message: String(e) }); }
    }
    return { quotes, errors };
  },

  async health() {
    const t0 = Date.now();
    try {
      const d = await getJson<GoldApi>('https://api.gold-api.com/price/XAU');
      return d.price > 0 ? { status: 'ok' as const, latencyMs: Date.now() - t0 }
                         : { status: 'degraded' as const, error: 'fiyat 0' };
    } catch (e) { return { status: 'down' as const, error: String(e) }; }
  },
};
