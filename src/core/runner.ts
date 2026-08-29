/**
 * Failover + batch çalıştırıcı.
 * Round mantığı: her turda, henüz fiyat alınamamış enstrümanların BİR SONRAKİ
 * priority adayını al, provider'a göre grupla, batch çağır. Alınanlar tamamlanır;
 * alınamayanlar bir sonraki turda bir alt öncelikli kaynağa düşer.
 * Böylece hem batch verimliliği hem enstrüman-bazlı failover korunur.
 */
import type { Candidate } from './db.js';
import type { FetchContext, Quote, SymbolRef } from './types.js';
import { getProvider } from './registry.js';

export interface RunOutput {
  quotes: Map<string, Quote>;                 // instrumentId -> kabul edilen quote
  failed: { symbol: string; reason: string }[];
  usedSource: Map<string, string>;            // instrumentId -> providerId
  health: Map<string, { status: 'ok' | 'degraded' | 'down'; latencyMs?: number; error?: string }>;
  skippedProviders: Set<string>;              // kayıtlı ama implemente edilmemiş (ör. bigpara)
}

export async function runFetch(
  plan: Map<string, Candidate[]>,
  fxSeed: Map<string, number>,
): Promise<RunOutput> {
  const out: RunOutput = {
    quotes: new Map(), failed: [], usedSource: new Map(),
    health: new Map(), skippedProviders: new Set(),
  };
  const tried = new Map<string, number>();     // instrumentId -> denenmiş aday sayısı
  const fx = new Map(fxSeed);                   // canlı güncellenen kur haritası
  const now = new Date();
  const ctx: FetchContext = {
    now,
    fxLookup: (base, quote) => (quote === 'TRY' ? fx.get(base) : undefined),
  };

  for (let round = 0; round < 6; round++) {
    // Bu turda denenecek adayları provider'a göre grupla.
    const groups = new Map<string, { cand: Candidate; ref: SymbolRef }[]>();
    for (const [id, cands] of plan) {
      if (out.quotes.has(id)) continue;
      let idx = tried.get(id) ?? 0;
      // Implemente edilmemiş provider'ları atla (adayı tüketmiş say).
      while (idx < cands.length && !getProvider(cands[idx].providerId)) {
        out.skippedProviders.add(cands[idx].providerId);
        idx++;
      }
      tried.set(id, idx);
      if (idx >= cands.length) continue;
      const cand = cands[idx];
      const ref: SymbolRef = {
        instrumentId: cand.instrumentId, symbol: cand.symbol,
        providerSymbol: cand.providerSymbol, classCode: cand.classCode, currency: cand.currency,
      };
      const g = groups.get(cand.providerId) ?? [];
      g.push({ cand, ref });
      groups.set(cand.providerId, g);
    }
    if (groups.size === 0) break;              // denenecek aday kalmadı

    for (const [providerId, items] of groups) {
      const provider = getProvider(providerId)!;
      const t0 = Date.now();
      try {
        const res = await provider.fetchQuotes(items.map((it) => it.ref), ctx);
        const gotBySymbol = new Map(res.quotes.map((q) => [q.symbol, q]));
        for (const it of items) {
          const q = gotBySymbol.get(it.ref.symbol);
          if (q) {
            out.quotes.set(it.cand.instrumentId, q);
            out.usedSource.set(it.cand.instrumentId, providerId);
            // fx sınıfıysa kur haritasını canlı besle (goldapi türetmesi için).
            if (it.cand.classCode === 'fx' && it.cand.symbol.length === 6) {
              fx.set(it.cand.symbol.slice(0, 3), q.price);
            }
          }
          tried.set(it.cand.instrumentId, (tried.get(it.cand.instrumentId) ?? 0) + 1);
        }
        const anyOk = res.quotes.length > 0;
        out.health.set(providerId, {
          status: anyOk ? 'ok' : 'degraded',
          latencyMs: Date.now() - t0,
          error: res.errors.length ? res.errors[0].message.slice(0, 200) : undefined,
        });
      } catch (e) {
        // Provider tümden patladı: tüm adayları bir sonraki tura düşür.
        for (const it of items) tried.set(it.cand.instrumentId, (tried.get(it.cand.instrumentId) ?? 0) + 1);
        out.health.set(providerId, { status: 'down', latencyMs: Date.now() - t0, error: String(e).slice(0, 200) });
      }
    }
  }

  // Hâlâ fiyat alınamayanları başarısız olarak işaretle.
  for (const [id, cands] of plan) {
    if (!out.quotes.has(id)) out.failed.push({ symbol: cands[0]?.symbol ?? id, reason: 'tüm kaynaklar başarısız' });
  }
  return out;
}
