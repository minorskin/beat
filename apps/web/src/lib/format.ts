export const tl = (n: number) =>
  new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 }).format(n);
export const usd = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
export const num = (n: number, d = 2) =>
  new Intl.NumberFormat('tr-TR', { minimumFractionDigits: d, maximumFractionDigits: d }).format(n);
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
export const timeAgo = (iso: string) => {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return `${s}sn önce`;
  if (s < 3600) return `${Math.floor(s / 60)}dk önce`;
  if (s < 86400) return `${Math.floor(s / 3600)}sa önce`;
  return `${Math.floor(s / 86400)}g önce`;
};
