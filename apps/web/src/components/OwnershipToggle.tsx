'use client';
import { useParamNav } from './useParamNav';

/**
 * Toplam / Bana Ait anahtarı. Tüm sayfa (KPI, grafik, dağılım, tablo) tek
 * parametreye bakar: ?own=1. Sunucuda okunduğu için grafik geçmişi de
 * doğru seriyi çizer — istemcide filtre uygulanmaz.
 */
export default function OwnershipToggle({ own }: { own: boolean }) {
  const setParam = useParamNav();
  return (
    <div className="flex gap-1" role="group" aria-label="Büyüklük görünümü">
      <button
        onClick={() => setParam('own', null)}
        aria-pressed={!own}
        className={`seg ${!own ? 'seg-on' : ''}`}
      >
        Toplam
      </button>
      <button
        onClick={() => setParam('own', '1')}
        aria-pressed={own}
        className={`seg ${own ? 'seg-on' : ''}`}
      >
        Bana Ait
      </button>
    </div>
  );
}
