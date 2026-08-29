/** Motorun kanonik tipleri. Çekirdek hiçbir zaman kaynağın adını bilmez. */

export type AssetClass =
  | 'stock_us' | 'etf_us' | 'stock_tr' | 'fund_tr' | 'gold' | 'fx' | 'crypto';

export interface SymbolRef {
  instrumentId?: string;
  symbol: string;          // kanonik sembol ('THYAO')
  providerSymbol: string;  // kaynağın kendi sembolü ('THYAO.IS')
  classCode: AssetClass;
  currency: string;
}

/** Her sağlayıcının çıktısı buna normalize edilir. */
export interface Quote {
  symbol: string;
  price: number;
  currency: string;
  ts: Date;               // fiyatın GÖZLEMLENDİĞİ an
  source: string;
  raw?: unknown;
}

export interface ProviderResult {
  quotes: Quote[];
  errors: { symbol: string; message: string }[];
}

export type HealthStatus = { status: 'ok' | 'degraded' | 'down'; latencyMs?: number; error?: string };

export interface FetchContext {
  now: Date;
  signal?: AbortSignal;
  /** Türetme yapan sağlayıcılar için (ör. XAU/USD -> gram TL) */
  fxLookup?: (base: string, quote: string) => number | undefined;
}

export interface PriceProvider {
  readonly id: string;
  readonly supports: AssetClass[];
  readonly capabilities: {
    batch: boolean;
    historical: boolean;
    rateLimit: { perMinute: number; perMonth?: number };
  };
  canHandle(sym: SymbolRef): boolean;
  fetchQuotes(syms: SymbolRef[], ctx: FetchContext): Promise<ProviderResult>;
  health(): Promise<HealthStatus>;
}

export const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

export const TROY_OUNCE_GRAMS = 31.1035;

export async function getJson<T>(url: string, init?: RequestInit & { timeoutMs?: number }): Promise<T> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), init?.timeoutMs ?? 20_000);
  try {
    const res = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: { 'User-Agent': UA, Accept: '*/*', ...(init?.headers ?? {}) },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(t);
  }
}
