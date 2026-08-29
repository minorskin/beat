/** Twelve Data — Yahoo'nun yedeği. Ücretsiz key: 800 istek/gün, 8/dk. Bizim ihtiyaç ~50/gün. */
import { PriceProvider, ProviderResult, Quote, getJson } from '../core/types.js';

const KEY = () => process.env.TWELVEDATA_API_KEY ?? 'demo';

export const twelvedataProvider: PriceProvider = {
  id: 'twelvedata',
  supports: ['stock_us', 'etf_us'],
  capabilities: { batch: true, historical: true, rateLimit: { perMinute: 8, perMonth: 24_000 } },
  canHandle: (s) => ['stock_us', 'etf_us'].includes(s.classCode),

  async fetchQuotes(syms, ctx): Promise<ProviderResult> {
    if (!syms.length) return { quotes: [], errors: [] };
    const list = syms.map((s) => s.providerSymbol).join(',');
    const d = await getJson<Record<string, unknown>>(
      `https://api.twelvedata.com/price?symbol=${list}&apikey=${KEY()}`);
    const quotes: Quote[] = [];
    const errors: ProviderResult['errors'] = [];
    // Tek sembolde {price}, çoklu sembolde {SYM:{price}} döner.
    const single = typeof (d as { price?: string }).price === 'string';
    for (const s of syms) {
      const raw = single ? d : (d[s.providerSymbol] as { price?: string } | undefined);
      const p = Number((raw as { price?: string })?.price);
      if (!p || Number.isNaN(p)) { errors.push({ symbol: s.symbol, message: 'fiyat yok' }); continue; }
      quotes.push({ symbol: s.symbol, price: p, currency: s.currency, ts: ctx.now, source: 'twelvedata', raw });
    }
    return { quotes, errors };
  },

  async health() {
    const t0 = Date.now();
    try {
      const d = await getJson<{ price?: string }>(`https://api.twelvedata.com/price?symbol=AAPL&apikey=${KEY()}`);
      return d.price ? { status: 'ok' as const, latencyMs: Date.now() - t0 }
                     : { status: 'degraded' as const, error: JSON.stringify(d).slice(0, 120) };
    } catch (e) { return { status: 'down' as const, error: String(e) }; }
  },
};
