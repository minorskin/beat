export const tl = (n: number) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(n);
export const usd = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
export const num = (n: number, d = 2) =>
  new Intl.NumberFormat('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
/**
 * Tam sayı gösterimi — ADET sütunu için.
 *
 * Tek istisna: 1'in ALTINDAKİ değerler. 0,08 BTC'yi "0" diye yazmak sayıyı
 * bilgi olmaktan çıkarır; orada iki anlamlı basamağa yuvarlanır.
 */
export const numInt = (n: number) => {
  const a = Math.abs(n);
  return a > 0 && a < 1
    ? new Intl.NumberFormat('tr-TR', { maximumSignificantDigits: 2 }).format(n)
    : new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(n);
};
/**
 * FİYAT gösterimi. Kural "ondalık yok" ama 100'ün altında iki hane kalır:
 * EUR/USD 1,1621 → "1" olurdu, yani sayı olmaktan çıkardı. Aynı sorun küçük
 * fiyatlı her şeyde var (fon NAV'ı 2,7844 · VIX 14,53 · DXY 99,16).
 * 100 ve üzeri hâlâ tam sayı — büyük fiyatlarda kuruş gürültüden başka bir şey
 * değil (9.441 ₺, 4.500.000 ₺).
 */
export const numPrice = (n: number) => {
  const a = Math.abs(n);
  if (a > 0 && a < 1) return new Intl.NumberFormat('tr-TR', { maximumSignificantDigits: 2 }).format(n);
  if (a < 100) return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(n);
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(n);
};
/**
 * Kısaltılmış tutar: 2.340.000 → "2,3m". Dar yerlerde (dağılım kırılımı)
 * tam tutar satırı taşırıyor; büyüklük sırası zaten okunan tek şey.
 * b = bin · m = milyon · mr = milyar · tn = trilyon.
 */
const SHORT_UNITS = [
  { at: 1e12, s: 'tn' }, { at: 1e9, s: 'mr' }, { at: 1e6, s: 'm' }, { at: 1e3, s: 'b' },
] as const;
export const shortNum = (n: number) => {
  const a = Math.abs(n);
  const u = SHORT_UNITS.find((x) => a >= x.at);
  const v = u ? n / u.at : n;
  // 10'un altında bir ondalık (2,3m), üstünde hiç (23m) — üç haneli bir
  // kısaltmada ondalık gürültüden başka bir şey değil.
  const d = u && Math.abs(v) < 10 ? 1 : 0;
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: d }).format(v) + (u?.s ?? '');
};
export const pct = (n: number) => `${n >= 0 ? '+' : ''}${num(n, 2)}%`;
/**
 * gg.aa.yy — saat dilimi AÇIKÇA Europe/Istanbul'a sabitli.
 *
 * Yerel getDate()/getMonth() kullanılırsa sunucu (Vercel: UTC) ile tarayıcı
 * (UTC+3) farklı gün yazar: 30.07 22:30Z sunucuda "30.07.26", istemcide
 * "31.07.26" olur. Bu hem hydration hatası verir hem de kullanıcıya bir gün
 * kaymış tarih gösterir. Sabit dilim ikisini de çözer.
 */
const dtfDate = new Intl.DateTimeFormat('tr-TR', {
  timeZone: 'Europe/Istanbul', day: '2-digit', month: '2-digit', year: '2-digit',
});
export const dateStr = (iso: string) => dtfDate.format(new Date(iso));
const dtfDateTime = new Intl.DateTimeFormat('tr-TR', {
  timeZone: 'Europe/Istanbul', day: '2-digit', month: '2-digit', year: '2-digit',
  hour: '2-digit', minute: '2-digit',
});
export const dateTimeStr = (iso: string) => dtfDateTime.format(new Date(iso));
export const timeAgo = (iso: string) => {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}sn önce`;
  if (s < 3600) return `${Math.floor(s / 60)}dk önce`;
  if (s < 86400) return `${Math.floor(s / 3600)}sa önce`;
  return `${Math.floor(s / 86400)}g önce`;
};
/**
 * timeAgo'nun en kısa hâli: "9sn" · "10dk" · "2sa" · "3g". Kartın sağ üst
 * köşesinde tek başına duruyor; birim harfi timeAgo ile aynı aileden, tam
 * zaman damgası title'da.
 */
export const timeAgoShort = (iso: string) => {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}sn`;
  if (s < 3600) return `${Math.floor(s / 60)}dk`;
  if (s < 86400) return `${Math.floor(s / 3600)}sa`;
  return `${Math.floor(s / 86400)}g`;
};

// ── Para birimi ──────────────────────────────────────────────────────────
// Sayfanın tamamı tek bir görüntüleme birimine bakar (?cur=USD). TL cinsinden
// tutulan büyüklükler (maliyet, K/Z, dönemsel tutarlar) güncel USD/TRY ile
// çevrilir; snapshot'ta ikisi de saklanan büyüklükler (portföy/pozisyon değeri)
// doğrudan kendi kolonundan okunur — çevrim hatası birikmesin.
export type Cur = 'TRY' | 'USD';
export const curSymbol = (c: Cur) => (c === 'USD' ? '$' : '₺');
export const money = (n: number, c: Cur) => (c === 'USD' ? usd(n) : tl(n));
export const moneyShort = (n: number, c: Cur) => `${curSymbol(c)}${shortNum(n)}`;
export const conv = (tryValue: number, c: Cur, rate: number) =>
  c === 'USD' ? (rate > 0 ? tryValue / rate : 0) : tryValue;

/**
 * Kullanıcının yazdığı tutarı sayıya çevirir: "25.000.000", "25000000",
 * "1.234,56" ve "1234.56" hepsi çalışır. Ondalık ayırıcı SON nokta/virgüldür
 * — ama ardından tam 3 basamak geliyorsa binlik ayırıcı sayılır ("1.500" =
 * 1500, "25,50" = 25.5). Geçersizse null.
 */
export function parseAmount(raw: string): number | null {
  const s = raw.trim().replace(/\s/g, '');
  if (!s || !/^[0-9.,]+$/.test(s)) return null;
  const dec = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'));
  const hasFrac = dec >= 0 && s.length - dec - 1 !== 3;
  const intPart = (hasFrac ? s.slice(0, dec) : s).replace(/[.,]/g, '');
  const frac = hasFrac ? s.slice(dec + 1).replace(/[.,]/g, '') : '';
  const n = Number(frac ? `${intPart}.${frac}` : intPart);
  return Number.isFinite(n) ? n : null;
}
