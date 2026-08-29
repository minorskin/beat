/** truncgil — canlı TL döviz + Kapalıçarşı altın. Tek istekte 86 alan; batch'in en verimlisi. */
import { PriceProvider, ProviderResult, Quote, getJson } from '../core/types.js';

const URL = 'https://finance.truncgil.com/api/today.json';
interface Payload { Meta_Data: { Update_Date: string }; Rates: Record<string, { Buying: number; Selling: number; Type: string }> }

export const truncgilProvider: PriceProvider = {
  id: 'truncgil',
  supports: ['fx', 'gold'],
  capabilities: { batch: true, historical: false, rateLimit: { perMinute: 30 } },
  canHandle: (s) => s.classCode === 'fx' || s.classCode === 'gold',

  async fetchQuotes(syms, ctx): Promise<ProviderResult> {
    const data = await getJson<Payload>(URL);
    // Update_Date TR yerel saati; fiyatın gerçekte gözlendiği an olarak kullanıyoruz.
    const ts = new Date(`${data.Meta_Data.Update_Date.replace(' ', 'T')}+03:00`);
    const quotes: Quote[] = [];
    const errors: ProviderResult['errors'] = [];
    for (const s of syms) {
      const row = data.Rates[s.providerSymbol];
      if (!row || !row.Selling) { errors.push({ symbol: s.symbol, message: `${s.providerSymbol} yok` }); continue; }
      // Satış fiyatı: alıcının gerçekte ödeyeceği fiyat.
      quotes.push({ symbol: s.symbol, price: row.Selling, currency: 'TRY', ts, source: 'truncgil', raw: row });
    }
    return { quotes, errors };
  },

  async health() {
    const t0 = Date.now();
    try {
      const d = await getJson<Payload>(URL);
      return d.Rates?.USD?.Selling
        ? { status: 'ok' as const, latencyMs: Date.now() - t0 }
        : { status: 'degraded' as const, error: 'USD alanı boş' };
    } catch (e) { return { status: 'down' as const, error: String(e) }; }
  },
};
