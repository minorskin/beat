/**
 * gold-api — XAU/USD spot (keysiz). Gram TL'ye türetme yapar, bu yüzden fxLookup ister.
 * truncgil GRA ile çapraz doğrulandı: 29.08.2026'da fark %0,07.
 * Sapma büyürse kaynaklardan biri bozulmuş demektir -> provider_health'e yazılır.
 */
import { PriceProvider, ProviderResult, Quote, getJson, TROY_OUNCE_GRAMS } from '../core/types.js';

interface GoldApi { price: number; symbol: string; updatedAt: string }

export const goldapiProvider: PriceProvider = {
  id: 'goldapi',
  supports: ['gold'],
  capabilities: { batch: false, historical: false, rateLimit: { perMinute: 30 } },
  canHandle: (s) => s.classCode === 'gold',

  async fetchQuotes(syms, ctx): Promise<ProviderResult> {
    const quotes: Quote[] = [];
    const errors: ProviderResult['errors'] = [];
    const usdtry = ctx.fxLookup?.('USD', 'TRY');
    if (!usdtry) return { quotes, errors: syms.map((s) => ({ symbol: s.symbol, message: 'USDTRY kuru yok' })) };

    for (const s of syms) {
      try {
        const d = await getJson<GoldApi>(`https://api.gold-api.com/price/${s.providerSymbol}`);
        quotes.push({
          symbol: s.symbol,
          price: (d.price * usdtry) / TROY_OUNCE_GRAMS,
          currency: 'TRY',
          ts: new Date(d.updatedAt),
          source: 'goldapi',
          raw: { ...d, usdtry },
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
