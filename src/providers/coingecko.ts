/** CoinGecko — kripto. Batch destekli. Demo kotası 10.000 çağrı/ay; bizim kullanım ~730. */
import { PriceProvider, ProviderResult, Quote, getJson } from '../core/types.js';

export const coingeckoProvider: PriceProvider = {
  id: 'coingecko',
  supports: ['crypto'],
  capabilities: { batch: true, historical: true, rateLimit: { perMinute: 100, perMonth: 10_000 } },
  canHandle: (s) => s.classCode === 'crypto',

  async fetchQuotes(syms, ctx): Promise<ProviderResult> {
    if (!syms.length) return { quotes: [], errors: [] };
    const ids = syms.map((s) => s.providerSymbol).join(',');
    const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd,try`;
    const data = await getJson<Record<string, { usd?: number; try?: number }>>(url);
    const quotes: Quote[] = [];
    const errors: ProviderResult['errors'] = [];
    for (const s of syms) {
      const row = data[s.providerSymbol];
      if (!row?.usd) { errors.push({ symbol: s.symbol, message: 'fiyat yok' }); continue; }
      quotes.push({ symbol: s.symbol, price: row.usd, currency: 'USD', ts: ctx.now, source: 'coingecko', raw: row });
    }
    return { quotes, errors };
  },

  async health() {
    const t0 = Date.now();
    try {
      await getJson('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd');
      return { status: 'ok' as const, latencyMs: Date.now() - t0 };
    } catch (e) { return { status: 'down' as const, error: String(e) }; }
  },
};
