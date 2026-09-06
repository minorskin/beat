'use client';
import { useEffect, useState, type ReactNode } from 'react';

const KEY = 'beat_hide_balance';

/**
 * Birinci kartın büyüklük satırı + gizleme anahtarı.
 *
 * Omuz üstünden bakan göze karşı: kafede, toplantıda, ekran paylaşırken
 * portföyün büyüklüğü tek tıkla kapanır. Kapsam BİLEREK dar — yalnız bu iki
 * satır. Dönemsel kutular, öne çıkanlar ve grafik oranla konuşuyor; asıl
 * saklanacak sayı buradaki mutlak tutar.
 *
 * GÜVENLİK DEĞİL, MAHREMİYET: gerçek tutar sunucudan gelen yükte duruyor,
 * yalnız çizilmiyor. Amaç yandaki gözü engellemek, veriyi korumak değil.
 *
 * Tercih localStorage'da (bu tarayıcıya özel, sunucuya gitmez). İlk çizimde
 * açık başlar, sonra depodaki tercihe geçer — kapalıyken sayfa yenilenirse
 * bir kare boyunca görünür. Bunun alternatifi her açılışta noktaların
 * titremesiydi; günlük kullanımda o daha rahatsız edici.
 */
export default function Balance({ main, alt, badge }: {
  main: string; alt: string; badge: ReactNode;
}) {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    try { setHidden(localStorage.getItem(KEY) === '1'); } catch { /* özel pencere */ }
  }, []);

  const toggle = () => {
    setHidden((prev) => {
      const next = !prev;
      try { localStorage.setItem(KEY, next ? '1' : '0'); } catch { /* özel pencere */ }
      return next;
    });
  };

  // Para birimi simgesi KALIR, rakamlar gider: hangi birime baktığın bilgisi
  // gizlenecek şey değil, tutar.
  const mask = (s: string) => {
    const sym = s.match(/[₺$]/)?.[0] ?? '';
    return `${sym}••••••`;
  };

  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <div className="t-kpi font-semibold tnum truncate">{hidden ? mask(main) : main}</div>
        <div className="t-label mt-0.5 tnum truncate" style={{ color: 'var(--muted)' }}>
          {hidden ? mask(alt) : alt}
        </div>
      </div>
      <div className="shrink-0 flex items-center gap-2 pt-0.5">
        <button
          onClick={toggle}
          aria-pressed={hidden}
          aria-label={hidden ? 'Tutarları göster' : 'Tutarları gizle'}
          title={hidden ? 'Tutarları göster' : 'Tutarları gizle'}
          className="cursor-pointer leading-none transition-colors"
          style={{ color: hidden ? 'var(--muted)' : 'var(--faint)' }}
        >
          {hidden ? <EyeOff /> : <Eye />}
        </button>
        {badge}
      </div>
    </div>
  );
}

// Simgeler satır içi: tek ikon için paket kurmak, o paketin tamamını istemci
// paketine sokmak demek.
const ICON = {
  width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: 2,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
};

function Eye() {
  return (
    <svg {...ICON} aria-hidden>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOff() {
  return (
    <svg {...ICON} aria-hidden>
      <path d="M10.6 6.2A9.9 9.9 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-2.6 3.5M6.6 6.8A17 17 0 0 0 2 12s3.6 7 10 7a9.6 9.6 0 0 0 4.3-1" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="m3 3 18 18" />
    </svg>
  );
}
