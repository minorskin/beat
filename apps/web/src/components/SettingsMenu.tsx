'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useParamNav } from './useParamNav';
import ConfirmDialog from './ConfirmDialog';
import AnnualClosingsDialog from './AnnualClosings';
import type { Cur } from '@/lib/format';
import type { AnnualClosing } from '@/lib/data';

/**
 * Üst bardaki dişli. Barda yalnız sürekli dokunulan iki şey kalır (sekmeler ve
 * dönem); görünümü belirleyen ama gün içinde nadiren değişen her şey burada
 * toplanır: büyüklük, net/brüt, para birimi, yıl kapanışları, çıkış.
 */
export default function SettingsMenu({
  cur, own, net, closings, logoutAction,
}: {
  cur: Cur; own: boolean; net: boolean; closings: AnnualClosing[]; logoutAction: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [ask, setAsk] = useState(false);
  const [years, setYears] = useState(false);
  const [pending, start] = useTransition();
  const boxRef = useRef<HTMLDivElement>(null);
  const setParam = useParamNav();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="relative shrink-0" ref={boxRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        title="Ayarlar"
        aria-label="Ayarlar"
        className={`navlink inline-flex items-center px-2 ${open ? 'navlink-on' : ''}`}
      >
        {/* Dolu dişli. Önceki ikon ince çizgili bir İngiliz anahtarıydı: hem
            "ayar" demiyordu (tamir/onarım çağrışımı) hem de 15 pikselde tek
            piksellik konturuyla bardaki diğer öğelerin yanında siliniyordu.
            Dolu gövde aynı boyutta çok daha fazla mürekkep bırakıyor; dişler
            merkez etrafında 45°'lik adımlarla dönen aynı dikdörtgen, delik ise
            evenodd ile deliniyor (ikinci bir renk gerekmesin diye). */}
        <svg viewBox="0 0 16 16" width="16" height="16" fill="currentColor" aria-hidden="true">
          <g>
          <rect x="6.9" y="0.9" width="2.2" height="3.1" rx="0.7" transform="rotate(0 8 8)" />
          <rect x="6.9" y="0.9" width="2.2" height="3.1" rx="0.7" transform="rotate(45 8 8)" />
          <rect x="6.9" y="0.9" width="2.2" height="3.1" rx="0.7" transform="rotate(90 8 8)" />
          <rect x="6.9" y="0.9" width="2.2" height="3.1" rx="0.7" transform="rotate(135 8 8)" />
          <rect x="6.9" y="0.9" width="2.2" height="3.1" rx="0.7" transform="rotate(180 8 8)" />
          <rect x="6.9" y="0.9" width="2.2" height="3.1" rx="0.7" transform="rotate(225 8 8)" />
          <rect x="6.9" y="0.9" width="2.2" height="3.1" rx="0.7" transform="rotate(270 8 8)" />
          <rect x="6.9" y="0.9" width="2.2" height="3.1" rx="0.7" transform="rotate(315 8 8)" />
          </g>
          <path fillRule="evenodd" clipRule="evenodd"
            d="M8 2.9a5.1 5.1 0 1 0 0 10.2 5.1 5.1 0 0 0 0-10.2zm0 3.05a2.05 2.05 0 1 1 0 4.1 2.05 2.05 0 0 1 0-4.1z" />
        </svg>
      </button>

      {open && (
        <div role="menu" className="menu absolute right-0 top-full mt-1 p-2.5 w-[230px] z-50">
          <MenuGroup label="Büyüklük">
            <Seg on={own} onClick={() => setParam('own', null)} title="Emanet pay düşülmüş">Bana Ait</Seg>
            <Seg on={!own} onClick={() => setParam('own', '0')}>Toplam</Seg>
          </MenuGroup>

          {/* Net varsayılan: "elimde ne kalır" günlük kullanımda sorulan soru.
              Kesinti oranı girilmemiş varlıkta net ile brüt aynı sayıdır, yani
              varsayılan hiçbir şeyi bozmadan doğru tarafta duruyor. */}
          <MenuGroup label="Tutar">
            <Seg on={net} onClick={() => setParam('net', null)}
              title="Net — vergi ve yönetim ücreti düşülmüş">Net</Seg>
            <Seg on={!net} onClick={() => setParam('net', '0')}
              title="Brüt — kesintisiz piyasa değeri">Brüt</Seg>
          </MenuGroup>

          <MenuGroup label="Para Birimi">
            <Seg on={cur === 'TRY'} onClick={() => setParam('cur', null)}>TRY</Seg>
            <Seg on={cur === 'USD'} onClick={() => setParam('cur', 'USD')}>USD</Seg>
          </MenuGroup>

          <div className="h-px my-2" style={{ background: 'var(--panel-3)' }} />

          <MenuItem
            onClick={() => { setOpen(false); setYears(true); }}
            icon={
              <svg viewBox="0 0 15 15" width="14" height="14" fill="none" stroke="currentColor"
                strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <rect x="1.8" y="2.8" width="11.4" height="10.4" rx="1.4" />
                <path d="M1.8 6h11.4M5 1.8v2M10 1.8v2" />
              </svg>
            }
          >
            Yıl Kapanışları
            {closings.length > 0 && (
              <span className="ml-auto tnum t-body" style={{ color: 'var(--faint)' }}>{closings.length}</span>
            )}
          </MenuItem>

          <MenuItem
            onClick={() => { setOpen(false); setAsk(true); }}
            icon={
              <svg viewBox="0 0 15 15" width="14" height="14" fill="none" stroke="currentColor"
                strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M6 2H3.2A1.2 1.2 0 0 0 2 3.2v8.6A1.2 1.2 0 0 0 3.2 13H6" />
                <path d="M10 10.5 13 7.5 10 4.5" />
                <path d="M13 7.5H5.5" />
              </svg>
            }
          >
            Çıkış
          </MenuItem>
        </div>
      )}

      {years && <AnnualClosingsDialog rows={closings} onClose={() => setYears(false)} />}

      {ask && (
        <ConfirmDialog
          title="Çıkış yapılsın mı?"
          message="Oturum kapanır ve tekrar şifre sorulur. Girdiğin veriler etkilenmez."
          confirmLabel="Çıkış yap"
          pending={pending}
          onCancel={() => setAsk(false)}
          onConfirm={() => start(async () => { await logoutAction(); })}
        />
      )}
    </div>
  );
}

function MenuGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-2 last:mb-0">
      <div className="t-micro mb-1 px-0.5" style={{ color: 'var(--faint)' }}>{label}</div>
      <div className="flex gap-1">{children}</div>
    </div>
  );
}

function Seg({ on, onClick, title, children }: {
  on: boolean; onClick: () => void; title?: string; children: React.ReactNode;
}) {
  return (
    <button
      type="button" onClick={onClick} aria-pressed={on} title={title}
      className={`seg flex-1 text-center tnum ${on ? 'seg-on' : ''}`}
    >
      {children}
    </button>
  );
}

function MenuItem({ icon, onClick, children }: {
  icon: React.ReactNode; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      type="button" role="menuitem" onClick={onClick}
      className="menu-item w-full flex items-center gap-2 px-1.5 py-1.5 t-body rounded"
      style={{ color: 'var(--muted)' }}
    >
      {icon}
      {children}
    </button>
  );
}
