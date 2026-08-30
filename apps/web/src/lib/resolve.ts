/**
 * Enstrüman ekleme sırasında "görünen ad" ve (gerekliyse) kaynak kodunu
 * kullanıcıya sormak yerine ilgili kaynaktan otomatik çeker.
 *
 * Motor (src/providers) ile aynı stratejiyi kullanır ama apps/web ayrı
 * dağıtılan bir paket olduğu için (Vercel Root Directory=apps/web) kodu
 * içeri kopyalıyoruz — cross-package import monorepo tooling'i gerektirirdi.
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36';

async function getJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { 'User-Agent': UA, Accept: '*/*', ...(init?.headers ?? {}) } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()) as T;
}

export type Resolved = { display_name: string; provider_symbol: string };
export type ResolveResult = Resolved | { error: string };

/** Truncgil'de gerçekten satılan altın ürünleri — sabit liste, kullanıcı kod bilmek zorunda kalmasın. */
export const GOLD_OPTIONS: { code: string; symbol: string; display_name: string }[] = [
  { code: 'GRA', symbol: 'GRAMALTIN', display_name: 'Gram Altın' },
  { code: 'HAS', symbol: 'GRAMHASALTIN', display_name: 'Gram Has Altın' },
  { code: 'CEYREKALTIN', symbol: 'CEYREKALTIN', display_name: 'Çeyrek Altın' },
  { code: 'YARIMALTIN', symbol: 'YARIMALTIN', display_name: 'Yarım Altın' },
  { code: 'TAMALTIN', symbol: 'TAMALTIN', display_name: 'Tam Altın' },
  { code: 'IKIBUCUKALTIN', symbol: 'IKIBUCUKALTIN', display_name: 'İkibuçuk Altın' },
  { code: 'BESLIALTIN', symbol: 'BESLIALTIN', display_name: 'Beşli Altın' },
  { code: 'CUMHURIYETALTINI', symbol: 'CUMHURIYETALTINI', display_name: 'Cumhuriyet Altını' },
  { code: 'ATAALTIN', symbol: 'ATAALTIN', display_name: 'Ata Altın' },
  { code: 'RESATALTIN', symbol: 'RESATALTIN', display_name: 'Reşat Altını' },
  { code: 'HAMITALTIN', symbol: 'HAMITALTIN', display_name: 'Hamit Altını' },
  { code: 'GREMSEALTIN', symbol: 'GREMSEALTIN', display_name: 'Gremse Altın' },
  { code: 'YIA', symbol: '22AYARBILEZIK', display_name: '22 Ayar Bilezik' },
  { code: '18AYARALTIN', symbol: '18AYARALTIN', display_name: '18 Ayar Altın' },
  { code: '14AYARALTIN', symbol: '14AYARALTIN', display_name: '14 Ayar Altın' },
];

const CCY_NAMES: Record<string, string> = {
  USD: 'ABD Doları', EUR: 'Euro', GBP: 'İngiliz Sterlini', CHF: 'İsviçre Frangı',
  JPY: 'Japon Yeni', CAD: 'Kanada Doları', AUD: 'Avustralya Doları', SEK: 'İsveç Kronu',
  NOK: 'Norveç Kronu', DKK: 'Danimarka Kronu', RUB: 'Rus Rublesi', CNY: 'Çin Yuanı',
  SAR: 'Suudi Riyali', AED: 'BAE Dirhemi', QAR: 'Katar Riyali',
};

interface YahooChartResp {
  chart: { result?: [{ meta: { longName?: string; shortName?: string } }]; error?: unknown };
}

async function resolveYahoo(providerSymbol: string): Promise<ResolveResult> {
  try {
    const d = await getJson<YahooChartResp>(
      `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(providerSymbol)}?range=1d&interval=1h`);
    const meta = d.chart.result?.[0]?.meta;
    const name = meta?.longName ?? meta?.shortName;
    if (!name) return { error: `${providerSymbol} bulunamadı — sembolü kontrol et` };
    return { display_name: name, provider_symbol: providerSymbol };
  } catch {
    return { error: `${providerSymbol} bulunamadı — sembolü kontrol et` };
  }
}

interface TefasRow { fonKodu: string; fonUnvan: string }
async function resolveTefas(symbol: string): Promise<ResolveResult> {
  const end = new Date();
  const start = new Date(end.getTime() - 10 * 864e5);
  const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');
  try {
    const res = await fetch('https://www.tefas.gov.tr/api/funds/fonGnlBlgSiraliGetir', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json', Accept: '*/*', 'User-Agent': UA,
        Origin: 'https://www.tefas.gov.tr', Referer: 'https://www.tefas.gov.tr/tr/fon-verileri',
      },
      body: JSON.stringify({
        fonTipi: 'YAT', fonKodu: symbol, aramaMetni: null, fonTurKod: null, fonGrubu: null,
        sfonTurKod: null, fonTurAciklama: null, kurucuKod: null,
        basTarih: ymd(start), bitTarih: ymd(end), basSira: 1, bitSira: 5, dil: 'TR',
        sFonTurKod: '', fonKod: '', fonGrup: '', fonUnvanTip: '',
      }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = (await res.json()) as { resultList?: TefasRow[] };
    const row = data.resultList?.[0];
    if (!row?.fonUnvan) return { error: `${symbol} TEFAS'ta bulunamadı — fon kodunu kontrol et` };
    return { display_name: row.fonUnvan, provider_symbol: symbol };
  } catch {
    return { error: `${symbol} TEFAS'ta bulunamadı — fon kodunu kontrol et` };
  }
}

interface CoinGeckoSearch { coins: { id: string; name: string; symbol: string; market_cap_rank: number | null }[] }
async function resolveCoinGecko(symbol: string): Promise<ResolveResult> {
  try {
    const d = await getJson<CoinGeckoSearch>(`https://api.coingecko.com/api/v3/search?query=${encodeURIComponent(symbol)}`);
    const matches = d.coins.filter((c) => c.symbol.toUpperCase() === symbol.toUpperCase());
    const pick = (matches.length ? matches : d.coins)
      .sort((a, b) => (a.market_cap_rank ?? Infinity) - (b.market_cap_rank ?? Infinity))[0];
    if (!pick) return { error: `${symbol} kripto listesinde bulunamadı` };
    return { display_name: pick.name, provider_symbol: pick.id };
  } catch {
    return { error: `${symbol} kripto listesinde bulunamadı` };
  }
}

function resolveFx(symbol: string): ResolveResult {
  const base = symbol.slice(0, 3).toUpperCase();
  const quote = symbol.slice(3, 6).toUpperCase();
  const baseName = CCY_NAMES[base] ?? base;
  const quoteName = quote === 'TRY' ? 'TL' : (CCY_NAMES[quote] ?? quote);
  return { display_name: `${baseName} / ${quoteName}`, provider_symbol: base };
}

/** class_code + kanonik sembolden görünen adı ve kaynak kodunu çözer. Kullanıcıya hiçbirini sormaz. */
export async function resolveInstrumentMeta(class_code: string, symbol: string): Promise<ResolveResult> {
  switch (class_code) {
    case 'stock_us':
    case 'etf_us':
      return resolveYahoo(symbol);
    case 'stock_tr':
      return resolveYahoo(`${symbol}.IS`);
    case 'fund_tr':
      return resolveTefas(symbol);
    case 'crypto':
      return resolveCoinGecko(symbol);
    case 'fx':
      return resolveFx(symbol);
    default:
      return { error: 'Desteklenmeyen varlık sınıfı' };
  }
}
