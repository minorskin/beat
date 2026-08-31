/**
 * TEFAS — Türk yatırım fonları.
 * DİKKAT: Eski `api/DB/BindHistoryInfo` endpoint'i 2026'da kapatıldı
 * ("Method not found or disabled!"). İnternetteki eski örnekler geçersiz.
 * Aşağıdaki yeni endpoint 29.08.2026'da canlı doğrulandı.
 * Kısıtlar: tek istekte en fazla 28 gün · dakikada ~6 istek · NAV günde 1 kez.
 */
import { PriceProvider, SymbolRef, FetchContext, ProviderResult, Quote, UA } from '../core/types.js';

const URL_INFO = 'https://www.tefas.gov.tr/api/funds/fonGnlBlgSiraliGetir';
const HEADERS = {
  'Content-Type': 'application/json',
  Accept: '*/*',
  Origin: 'https://www.tefas.gov.tr',
  Referer: 'https://www.tefas.gov.tr/tr/fon-verileri',
  'User-Agent': UA,
};

const ymd = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');

interface TefasRow { fonKodu: string; fonUnvan: string; tarih: string; fiyat: number }

async function queryFund(code: string, start: Date, end: Date): Promise<TefasRow[]> {
  const body = {
    fonTipi: 'YAT', fonKodu: code, aramaMetni: null, fonTurKod: null, fonGrubu: null,
    sfonTurKod: null, fonTurAciklama: null, kurucuKod: null,
    basTarih: ymd(start), bitTarih: ymd(end),
    basSira: 1, bitSira: 100000, dil: 'TR',
    sFonTurKod: '', fonKod: '', fonGrup: '', fonUnvanTip: '',
  };
  const res = await fetch(URL_INFO, {
    method: 'POST', headers: HEADERS, body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`TEFAS HTTP ${res.status}`);
  const data = (await res.json()) as { resultList?: TefasRow[]; errorMessage?: string };
  // Hafta sonu/tatilde TEFAS "Index 0 out of bounds" döner — bu hata değil, boş veri.
  const msg = data.errorMessage?.toLowerCase() ?? '';
  if (msg && !msg.includes('out of bounds') && !msg.includes('veri bulunamadı')) {
    throw new Error(`TEFAS: ${data.errorMessage}`);
  }
  return data.resultList ?? [];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * TEFAS tek tük istekte bağlantıyı düşürüyor ("TypeError: fetch failed") ve
 * tek denemede pes edilince fon o turda tamamen fiyatsız kalıyordu (DFI günler
 * boyu böyle düştü). Ağ hatası veriyle ilgili değil — kısa aralıkla tekrar
 * deniyoruz. Veri yokluğu (boş sonuç) yeniden denenmez, o gerçek bir cevaptır.
 */
async function queryFundRetry(code: string, start: Date, end: Date, tries = 3): Promise<TefasRow[]> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await queryFund(code, start, end);
    } catch (e) {
      last = e;
      if (i < tries - 1) await sleep(2000 * (i + 1));
    }
  }
  throw last;
}

export const tefasProvider: PriceProvider = {
  id: 'tefas',
  supports: ['fund_tr'],
  capabilities: { batch: false, historical: true, rateLimit: { perMinute: 6 } },
  canHandle: (s) => s.classCode === 'fund_tr',

  async fetchQuotes(syms, ctx: FetchContext): Promise<ProviderResult> {
    const quotes: Quote[] = [];
    const errors: ProviderResult['errors'] = [];
    // NAV geç yayınlanabilir; 14 günlük pencere çekip en yeni GEÇERLİ satırı
    // alıyoruz. Serbest fonlar her gün NAV yayınlamıyor ve TEFAS o günler için
    // fiyat=0 satırı döndürüyor — körlemesine "en yeni satır" alınırsa fon
    // kalıcı olarak fiyatsız kalıyor (DFI böyle düşmüştü).
    const end = ctx.now;
    const start = new Date(end.getTime() - 14 * 864e5);

    for (const s of syms) {
      try {
        const rows = await queryFundRetry(s.providerSymbol, start, end);
        if (!rows.length) { errors.push({ symbol: s.symbol, message: 'veri yok' }); continue; }
        const valid = rows.filter((r) => r.fiyat > 0).sort((a, b) => a.tarih.localeCompare(b.tarih));
        if (!valid.length) { errors.push({ symbol: s.symbol, message: 'son 14 günde NAV yayınlanmamış' }); continue; }
        const last = valid[valid.length - 1];
        quotes.push({
          symbol: s.symbol,
          price: last.fiyat,
          currency: 'TRY',
          ts: new Date(`${last.tarih}T18:00:00+03:00`), // NAV o işlem gününe ait
          source: 'tefas',
          raw: last,
        });
      } catch (e) {
        errors.push({ symbol: s.symbol, message: String(e) });
      }
      await sleep(10_500); // 6 istek/dk sınırına saygı
    }
    return { quotes, errors };
  },

  async health() {
    const t0 = Date.now();
    try {
      const end = new Date(); const start = new Date(end.getTime() - 7 * 864e5);
      const rows = await queryFundRetry('THF', start, end, 2);
      return rows.length
        ? { status: 'ok' as const, latencyMs: Date.now() - t0 }
        : { status: 'degraded' as const, latencyMs: Date.now() - t0, error: 'boş sonuç' };
    } catch (e) {
      return { status: 'down' as const, error: String(e) };
    }
  },
};
