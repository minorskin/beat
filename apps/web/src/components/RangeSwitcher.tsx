'use client';
import { useParamNav } from './useParamNav';

/**
 * Dönem anahtarı — sayfanın TEK zaman ekseni. Hem varlık değişimi grafiğini
 * hem öne çıkanlar kartlarını sürer; ikisinin ayrı seçicisi olduğunda grafik
 * bir dönemi, kartlar başka dönemi gösteriyordu.
 *
 * Üst barın sağ ucunda iki satır: üstte kısa dönemler, altta uzunlar.
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

export default function RangeSwitcher({ range }: { range: string }) {
  const setParam = useParamNav();
  return (
    <div className="grid grid-cols-4 gap-0.5 shrink-0" role="group" aria-label="Dönem">
      {RANGES.map((r) => (
        <button
          key={r.id}
          type="button"
          onClick={() => setParam('range', r.id)}
          aria-pressed={range === r.id}
          title={r.long}
          className={`seg seg-xs tnum text-center ${range === r.id ? 'seg-on' : ''}`}
        >
          {r.id}
        </button>
      ))}
    </div>
  );
}
