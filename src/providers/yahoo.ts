/**
 * Yahoo Finance — ABD hisse/ETF + BIST (.IS). Resmi değil, sözleşmesiz.
 * DOĞRULANMIŞ RİSK: 29.08.2026'da TR mobil IP'sinden (AS20978) v7/v8/query2 hepsi HTTP 429.
 * GitHub Actions (Azure) IP'sinden çalışıp çalışmadığı `npm run probe` ile bulutta ölçülür.
 * Bu yüzden twelvedata yedeği zincirde priority=20 olarak duruyor.
 */
import { PriceProvider, ProviderResult, Quote, getJson } from '../core/types.js';

interface ChartResp {
  chart: { result?: [{ meta: { symbol: string; regularMarketPrice: number; currency: string; regularMarketTime: number } }]; error?: unknown };
}

async function one(providerSymbol: string) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(providerSymbol)}?range=1d&interval=1h`;
  const d = await getJson<ChartResp>(url);
  const meta = d.chart.result?.[0]?.meta;
  if (!meta?.regularMarketPrice) throw new Error('meta/price yok');
  return meta;
}

export const yahooProvider: PriceProvider = {
  id: 'yahoo',
  supports: ['stock_us', 'etf_us', 'stock_tr'],
  capabilities: { batch: false, historical: true, rateLimit: { perMinute: 60 } },
  canHandle: (s) => ['stock_us', 'etf_us', 'stock_tr'].includes(s.classCode),

  async fetchQuotes(syms): Promise<ProviderResult> {
    const quotes: Quote[] = [];
    const errors: ProviderResult['errors'] = [];
    for (const s of syms) {
      try {
        const m = await one(s.providerSymbol);
        quotes.push({
          symbol: s.symbol, price: m.regularMarketPrice, currency: m.currency,
          ts: new Date(m.regularMarketTime * 1000), source: 'yahoo', raw: m,
        });
      } catch (e) { errors.push({ symbol: s.symbol, message: String(e) }); }
      await new Promise((r) => setTimeout(r, 400));
    }
    return { quotes, errors };
  },

  async health() {
    const t0 = Date.now();
    try { await one('AAPL'); return { status: 'ok' as const, latencyMs: Date.now() - t0 }; }
    catch (e) { return { status: 'down' as const, error: String(e) }; }
  },
};
