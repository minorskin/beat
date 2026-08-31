'use client';
import { useParamNav } from './useParamNav';

/**
 * Bana Ait / Toplam anahtarı. Tüm sayfa (KPI, grafik, dağılım, tablo) tek
 * parametreye bakar: ?own=0 → toplam. VARSAYILAN "Bana Ait" (BT): günlük
 * kullanımda anlamlı olan emanet payı düşülmüş büyüklük.
 */
export default function OwnershipToggle({ own }: { own: boolean }) {
  const setParam = useParamNav();
  return (
    <div className="flex gap-1" role="group" aria-label="Büyüklük görünümü">
      <button
        onClick={() => setParam('own', null)}
        aria-pressed={own}
        title="Bana Ait — emanet pay düşülmüş"
        aria-label="Bana Ait"
        className={`seg ${own ? 'seg-on' : ''}`}
      >
        BT
      </button>
      <button
        onClick={() => setParam('own', '0')}
        aria-pressed={!own}
        className={`seg ${!own ? 'seg-on' : ''}`}
      >
        Toplam
      </button>
    </div>
  );
}
