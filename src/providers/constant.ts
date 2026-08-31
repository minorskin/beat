/**
 * Nakit sağlayıcısı — ağa hiç çıkmaz.
 *
 * Bir para biriminin kendi cinsinden fiyatı tanım gereği 1'dir (TRYTRY,
 * USDUSD). Hiçbir kur servisi böyle bir satır döndürmez; truncgil/tcmb'ye
 * sorulursa "TRY yok" hatası döner ve enstrüman kalıcı olarak fiyatsız kalır.
 * Bu yüzden nakit, sabit fiyat yazan kendi sağlayıcısını kullanır.
 *
 * Aynı mekanizma gayrimenkulde de kullanılır: bir dairenin/AVM'nin piyasa
 * fiyatını yayınlayan bir servis yok, değerlemeyi kullanıcı giriyor.
 * providerSymbol = fiyatın kendisi (nakit için 1, gayrimenkul için güncel
 * değerleme). Her turda yazılır ki pozisyon "taşınmış fiyat" damgası yemesin.
 */
import { PriceProvider, ProviderResult } from '../core/types.js';

export const constantProvider: PriceProvider = {
  id: 'constant',
  supports: ['fx', 'realty'],
  capabilities: { batch: true, historical: false, rateLimit: { perMinute: 100_000 } },
  canHandle: (s) =>
    s.classCode === 'realty' ||
    (s.classCode === 'fx' && s.symbol.slice(0, 3) === s.symbol.slice(3, 6)),

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
