/**
 * Nakit sağlayıcısı — ağa hiç çıkmaz.
 *
 * Bir para biriminin kendi cinsinden fiyatı tanım gereği 1'dir (TRYTRY,
 * USDUSD). Hiçbir kur servisi böyle bir satır döndürmez; truncgil/tcmb'ye
 * sorulursa "TRY yok" hatası döner ve enstrüman kalıcı olarak fiyatsız kalır.
 * Bu yüzden nakit, sabit fiyat yazan kendi sağlayıcısını kullanır.
 *
 * providerSymbol = fiyatın kendisi (varsayılan 1). Kur değil BİRİM sayısı
 * olduğu için zamanla değişmez; her turda yazılır ki pozisyon "taşınmış
 * fiyat" olarak işaretlenmesin.
 */
import { PriceProvider, ProviderResult } from '../core/types.js';

export const constantProvider: PriceProvider = {
  id: 'constant',
  supports: ['fx'],
  capabilities: { batch: true, historical: false, rateLimit: { perMinute: 100_000 } },
  canHandle: (s) => s.classCode === 'fx' && s.symbol.slice(0, 3) === s.symbol.slice(3, 6),

  async fetchQuotes(syms, ctx): Promise<ProviderResult> {
    return {
      quotes: syms.map((s) => ({
        symbol: s.symbol,
        price: Number(s.providerSymbol) || 1,
        currency: s.currency,
        ts: ctx.now,
        source: 'constant',
      })),
      errors: [],
    };
  },

  async health() {
    return { status: 'ok', latencyMs: 0 };
  },
};
