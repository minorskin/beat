/**
 * Yeni enstrüman eklerken kullanılan sınıf varsayılanları.
 *
 * Motor "yeni varlık = yeni satır" ilkesiyle çalışır: migration gerekmez.
 * Ama her sınıfın kendi para birimi, takvimi, ritmi ve failover zinciri var —
 * bunları kullanıcıya sordurmak yerine sınıftan türetiyoruz. Kullanıcı yalnız
 * sembolü ve adı girer; kripto/altın gibi kaynağın kendi kodunu kullanan
 * sınıflarda ek olarak o kodu ister.
 *
 * seed.sql'deki zincirlerle aynı tutulmalı.
 */

export interface SourceSpec { provider: string; providerSymbol: string; priority: number }

export interface ClassDefault {
  currency: string;
  calendar: string;
  cadence: 'hourly' | 'market_hours' | 'daily_close';
  /** Kanonik sembol için ipucu */
  symbolHint: string;
  /** Kaynak sembolü alanı için ipucu; boşsa alan gizlenir */
  providerHint?: string;
  /** Kaynak sembolü zorunlu mu (kanonik semboldan türetilemiyorsa) */
  needsProviderSymbol: boolean;
  sources: (symbol: string, providerSymbol: string) => SourceSpec[];
}

export const CLASS_DEFAULTS: Record<string, ClassDefault> = {
  stock_us: {
    currency: 'USD', calendar: 'NYSE', cadence: 'market_hours',
    symbolHint: 'Borsa kodu — AAPL, MSFT', needsProviderSymbol: false,
    sources: (s) => [
      { provider: 'yahoo', providerSymbol: s, priority: 10 },
      { provider: 'twelvedata', providerSymbol: s, priority: 20 },
    ],
  },
  etf_us: {
    currency: 'USD', calendar: 'NYSE', cadence: 'market_hours',
    symbolHint: 'ETF kodu — VOO, QQQ', needsProviderSymbol: false,
    sources: (s) => [
      { provider: 'yahoo', providerSymbol: s, priority: 10 },
      { provider: 'twelvedata', providerSymbol: s, priority: 20 },
    ],
  },
  stock_tr: {
    currency: 'TRY', calendar: 'BIST', cadence: 'market_hours',
    symbolHint: 'BIST kodu — THYAO, ASELS', needsProviderSymbol: false,
    sources: (s) => [{ provider: 'yahoo', providerSymbol: `${s}.IS`, priority: 10 }],
  },
  fund_tr: {
    currency: 'TRY', calendar: 'TEFAS_DAILY', cadence: 'daily_close',
    symbolHint: 'TEFAS fon kodu — 3 harf, ör. THF', needsProviderSymbol: false,
    sources: (s) => [{ provider: 'tefas', providerSymbol: s, priority: 10 }],
  },
  gold: {
    currency: 'TRY', calendar: 'CRYPTO_24_7', cadence: 'hourly',
    symbolHint: 'Kendi verdiğin ad — CEYREKALTIN', needsProviderSymbol: true,
    providerHint: 'truncgil alan adı — GRA, CEYREK_ALTIN, YARIM_ALTIN',
    sources: (_s, ps) => [{ provider: 'truncgil', providerSymbol: ps, priority: 10 }],
  },
  fx: {
    currency: 'TRY', calendar: 'FX_24_5', cadence: 'hourly',
    symbolHint: '6 harf — GBPTRY, CHFTRY', needsProviderSymbol: false,
    // truncgil/tcmb baz para birimini bekler: GBPTRY -> GBP
    sources: (s) => [
      { provider: 'truncgil', providerSymbol: s.slice(0, 3), priority: 10 },
      { provider: 'tcmb', providerSymbol: s.slice(0, 3), priority: 20 },
    ],
  },
  crypto: {
    currency: 'USD', calendar: 'CRYPTO_24_7', cadence: 'hourly',
    symbolHint: 'Kısa kod — SOL, AVAX', needsProviderSymbol: true,
    providerHint: 'CoinGecko id — solana, avalanche-2 (küçük harf)',
    sources: (_s, ps) => [{ provider: 'coingecko', providerSymbol: ps, priority: 10 }],
  },
};

/** Enstrüman sembolü: harf/rakam/nokta/tire, 2-20 karakter. */
export const SYMBOL_RE = /^[A-Z0-9.\-]{2,20}$/;
