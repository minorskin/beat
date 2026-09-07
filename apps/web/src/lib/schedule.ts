/**
 * Grup güncelleme planının insan dili karşılığı.
 *
 * Tek kaynak market_calendars (bkz. migration 0016) — kullanıcının verdiği
 * "enstrüman grubu güncelleme gün, aralık, zaman dilimi ve sıklığı" tablosu
 * oraya birebir girildi. Burada yalnız BİÇİMLENDİRME var; gün/saat/sıklık
 * değerleri koda kopyalanmaz, yoksa tablo değiştiğinde arayüz sessizce yalan
 * söylemeye devam ederdi.
 */
import type { Calendar } from './data';

const DAY_SHORT = ['', 'Pzt', 'Sal', 'Çrş', 'Prş', 'Cum', 'Cmt', 'Paz'];

/** '10:00:00' -> '10:00'; null (pencere yok) -> null. */
const hhmm = (t: string | null) => (t ? t.slice(0, 5) : null);

/** Günler: 7 gün -> "her gün", 1-5 -> "hafta içi", aksi halde kısa adlar. */
export function daysLabel(weekdays: number[]): string {
  const set = [...weekdays].sort((a, b) => a - b);
  if (set.length === 0) return 'hiçbir gün';
  if (set.length === 7) return 'her gün';
  if (set.length === 5 && set.every((d, i) => d === i + 1)) return 'hafta içi';
  return set.map((d) => DAY_SHORT[d] ?? d).join(', ');
}

/** Çalışma aralığı. Açılış/kapanış yoksa gün boyu demektir. */
export function windowLabel(cal: Calendar): string {
  const open = hhmm(cal.open_time) ?? '00:00';
  const close = hhmm(cal.close_time) ?? '23:59';
  return `${open}–${close}`;
}

/** Sıklık: 60 dk "saat başı", 30 dk "yarım saatte bir", geri kalanı ham dakika. */
export function frequencyLabel(minutes: number | null): string {
  if (minutes == null) return 'güncellenmez';
  if (minutes === 60) return 'saat başı';
  if (minutes === 30) return 'yarım saatte bir';
  if (minutes % 60 === 0) return `${minutes / 60} saatte bir`;
  return `${minutes} dk'da bir`;
}

/**
 * Tek satırlık özet: "hafta içi 10:00–18:30 · yarım saatte bir".
 * Gün boyu çalışan gruplarda aralık yazılmaz — "her gün 00:00–23:59" satırın
 * yarısını hiçbir şey söylemeyen bir sabite harcıyordu.
 */
export function scheduleLabel(cal: Calendar | undefined): string {
  if (!cal) return 'plan bilinmiyor';
  if (cal.interval_minutes == null) return 'zamanlanmış güncelleme yok';
  const allDay = cal.open_time == null && cal.close_time == null;
  const parts = [daysLabel(cal.weekdays)];
  if (!allDay) parts.push(windowLabel(cal));
  return `${parts.join(' ')} · ${frequencyLabel(cal.interval_minutes)}`;
}

/** Takvimin zaman dilimi — İstanbul dışındaysa ayrıca yazılır. */
export function tzLabel(cal: Calendar | undefined): string {
  if (!cal || cal.tz === 'Europe/Istanbul') return '';
  return ` (${cal.tz})`;
}

/** code -> Calendar sözlüğü; bileşenler diziyi her satırda taramasın diye. */
export const byCode = (cals: Calendar[]): Record<string, Calendar> =>
  Object.fromEntries(cals.map((c) => [c.code, c]));
