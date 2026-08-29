/** TCMB resmi kurlar (XML). Günde 1 kez güncellenir; truncgil'in yedeği ve resmi referans. */
import { PriceProvider, ProviderResult, Quote, UA } from '../core/types.js';

const URL = 'https://www.tcmb.gov.tr/kurlar/today.xml';

async function fetchXml(): Promise<string> {
  const res = await fetch(URL, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`TCMB HTTP ${res.status}`);
  return res.text();
}

function parse(xml: string): { date: Date; rates: Record<string, number> } {
  const dateStr = /Tarih="(\d{2})\.(\d{2})\.(\d{4})"/.exec(xml);
  const date = dateStr
    ? new Date(`${dateStr[3]}-${dateStr[2]}-${dateStr[1]}T15:30:00+03:00`)
    : new Date();
  const rates: Record<string, number> = {};
  for (const m of xml.matchAll(/<Currency[^>]*Kod="([A-Z]{3})"[\s\S]*?<\/Currency>/g)) {
    const sell = /<ForexSelling>([\d.]+)<\/ForexSelling>/.exec(m[0]);
    if (sell?.[1]) rates[m[1]] = Number(sell[1]);
  }
  return { date, rates };
}

export const tcmbProvider: PriceProvider = {
  id: 'tcmb',
  supports: ['fx'],
  capabilities: { batch: true, historical: true, rateLimit: { perMinute: 20 } },
  canHandle: (s) => s.classCode === 'fx',

  async fetchQuotes(syms): Promise<ProviderResult> {
    const { date, rates } = parse(await fetchXml());
    const quotes: Quote[] = [];
    const errors: ProviderResult['errors'] = [];
    for (const s of syms) {
      const r = rates[s.providerSymbol];
      if (!r) { errors.push({ symbol: s.symbol, message: `${s.providerSymbol} yok` }); continue; }
      quotes.push({ symbol: s.symbol, price: r, currency: 'TRY', ts: date, source: 'tcmb' });
    }
    return { quotes, errors };
  },

  async health() {
    const t0 = Date.now();
    try {
      const { rates } = parse(await fetchXml());
      return rates.USD ? { status: 'ok' as const, latencyMs: Date.now() - t0 }
                       : { status: 'degraded' as const, error: 'USD yok' };
    } catch (e) { return { status: 'down' as const, error: String(e) }; }
  },
};
