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
  sources: (symbol: string, providerSymbol: string) => SourceSpec[];
}

export const CLASS_DEFAULTS: Record<string, ClassDefault> = {
  stock_us: {
    currency: 'USD', calendar: 'NYSE', cadence: 'market_hours',
    symbolHint: 'Borsa kodu — AAPL, MSFT',
    sources: (s) => [
      { provider: 'yahoo', providerSymbol: s, priority: 10 },
      { provider: 'twelvedata', providerSymbol: s, priority: 20 },
    ],
  },
  etf_us: {
    currency: 'USD', calendar: 'NYSE', cadence: 'market_hours',
    symbolHint: 'ETF kodu — VOO, QQQ',
    sources: (s) => [
      { provider: 'yahoo', providerSymbol: s, priority: 10 },
      { provider: 'twelvedata', providerSymbol: s, priority: 20 },
    ],
  },
  stock_tr: {
    currency: 'TRY', calendar: 'BIST', cadence: 'market_hours',
    symbolHint: 'BIST kodu — THYAO, ASELS',
    sources: (s) => [{ provider: 'yahoo', providerSymbol: `${s}.IS`, priority: 10 }],
  },
  fund_tr: {
    currency: 'TRY', calendar: 'TEFAS_DAILY', cadence: 'daily_close',
    symbolHint: 'TEFAS fon kodu — 3 harf, ör. THF',
    sources: (s) => [{ provider: 'tefas', providerSymbol: s, priority: 10 }],
  },
  gold: {
    currency: 'TRY', calendar: 'CRYPTO_24_7', cadence: 'hourly',
    symbolHint: '',
    sources: (_s, ps) => [{ provider: 'truncgil', providerSymbol: ps, priority: 10 }],
  },
  fx: {
    currency: 'TRY', calendar: 'FX_24_5', cadence: 'hourly',
    symbolHint: '6 harf — GBPTRY, CHFTRY · nakit TL için TRYTRY',
    // truncgil/tcmb baz para birimini bekler: GBPTRY -> GBP
    sources: (s) => [
      { provider: 'truncgil', providerSymbol: s.slice(0, 3), priority: 10 },
      { provider: 'tcmb', providerSymbol: s.slice(0, 3), priority: 20 },
    ],
  },
  realty: {
    // Fiyatını yayınlayan servis yok: değerlemeyi kullanıcı giriyor, sabit
    // sağlayıcı her turda onu yazıyor. providerSymbol = değerlemenin kendisi.
    currency: 'TRY', calendar: 'CRYPTO_24_7', cadence: 'hourly',
    symbolHint: 'Mülkün adı — ör. Ataşehir AVM',
    sources: (_s, ps) => [{ provider: 'constant', providerSymbol: ps, priority: 10 }],
  },
  crypto: {
    currency: 'USD', calendar: 'CRYPTO_24_7', cadence: 'hourly',
    symbolHint: 'Kısa kod — SOL, AVAX',
    sources: (_s, ps) => [{ provider: 'coingecko', providerSymbol: ps, priority: 10 }],
  },
};

/** Kullanıcının verdiği addan kanonik sembol: "Ataşehir AVM" -> ATASEHIR-AVM. */
export function symbolFromName(name: string): string {
  const TR: Record<string, string> = { 'Ç': 'C', 'Ğ': 'G', 'İ': 'I', 'Ö': 'O', 'Ş': 'S', 'Ü': 'U' };
  return name
    .toLocaleUpperCase('tr-TR')
    .replace(/[ÇĞİÖŞÜ]/g, (c) => TR[c])
    // Kalan aksanları (Â, Î, Û…) taşıyıcı harfe indir: "Dükkân" -> DUKKAN,
    // yoksa şapkalı harf ayraca dönüşüp "DUKK-N" gibi sembol üretiyordu.
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 20);
}

/**
 * Nakit = para biriminin kendisi (TRYTRY, USDUSD). Fiyatı tanım gereği 1;
 * hiçbir kur servisi bu satırı döndürmediği için sabit sağlayıcıya bağlanır.
 */
export const isCash = (classCode: string, symbol: string) =>
  classCode === 'fx' && symbol.length === 6 && symbol.slice(0, 3) === symbol.slice(3, 6);

/**
 * Sınıf varsayılanlarını SEMBOLE göre çözer. Nakit, döviz sınıfının içinde
 * yaşayan bir istisna: para birimi kendi kodundan gelir (TRYTRY -> TRY),
 * takvimi 7/24'tür (nakit "kapanmaz", yoksa hafta sonu "taşınmış fiyat"
 * damgası yer) ve fiyatı sabit sağlayıcıdan okunur.
 */
export function defaultsFor(classCode: string, symbol: string, providerSymbol = '') {
  const def = CLASS_DEFAULTS[classCode];
  if (!def) return null;
  if (isCash(classCode, symbol)) {
    return {
      currency: symbol.slice(0, 3),
      calendar: 'CRYPTO_24_7',
      cadence: 'hourly' as const,
      sources: [{ provider: 'constant', providerSymbol: '1', priority: 10 }],
    };
  }
  return {
    currency: def.currency,
    calendar: def.calendar,
    cadence: def.cadence,
    sources: def.sources(symbol, providerSymbol),
  };
}

/** Enstrüman sembolü: harf/rakam/nokta/tire, 2-20 karakter. */
export const SYMBOL_RE = /^[A-Z0-9.\-]{2,20}$/;
