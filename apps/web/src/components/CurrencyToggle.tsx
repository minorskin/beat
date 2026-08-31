'use client';
import { useParamNav } from './useParamNav';
import type { Cur } from '@/lib/format';

/**
 * Görüntüleme para birimi — ?cur=USD. Sayfadaki HER tutar bu tek anahtara
 * bakar (KPI, dönemsel K/Z, grafik, dağılım, tablo, projeksiyon); grafiğin
 * kendi kur düğmesi bu yüzden kaldırıldı — iki ayrı kaynak karışık görünüm
 * üretiyordu.
 */
export default function CurrencyToggle({ cur }: { cur: Cur }) {
  const setParam = useParamNav();
  return (
    <div className="flex gap-1" role="group" aria-label="Para birimi">
      <button
        onClick={() => setParam('cur', null)}
        aria-pressed={cur === 'TRY'}
        title="Türk lirası"
        className={`seg tnum ${cur === 'TRY' ? 'seg-on' : ''}`}
      >
        TRY
      </button>
      <button
        onClick={() => setParam('cur', 'USD')}
        aria-pressed={cur === 'USD'}
        title="ABD doları"
        className={`seg tnum ${cur === 'USD' ? 'seg-on' : ''}`}
      >
        USD
      </button>
    </div>
  );
}
