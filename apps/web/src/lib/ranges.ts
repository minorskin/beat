/**
 * Dönem anahtarının tanımı — sayfanın TEK zaman ekseni.
 *
 * Bu liste bilerek `'use client'` taşıyan RangeSwitcher'ın DIŞINDA duruyor:
 * bir client modülünden dışa açılan sabit, sunucu bileşenine import edilince
 * gerçek diziyi değil bir client-reference proxy'sini veriyor ve `.find`
 * çağrısı çalışma anında patlıyor (tip denetimi bunu yakalamaz). Nötr bir
 * modülde durunca hem sunucu hem istemci aynı diziyi okuyor.
 */
export const RANGES = [
  { id: 'S', long: 'son 1 saat' },
  { id: 'G', long: 'son 1 gün' },
  { id: 'H', long: 'son 1 hafta' },
  { id: 'A', long: 'son 1 ay' },
  { id: '3A', long: 'son 3 ay' },
  { id: '1Y', long: 'son 1 yıl' },
  { id: 'TÜM', long: 'tüm geçmiş — elle girilen yıl kapanışları + bugün' },
] as const;

export const rangeLongOf = (id: string) =>
  RANGES.find((r) => r.id === id)?.long ?? id;
