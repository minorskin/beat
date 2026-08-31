'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { useParamNav } from './useParamNav';
import ConfirmDialog from './ConfirmDialog';
import type { Cur } from '@/lib/format';

/**
 * Üst bardaki dişli. Sık kullanılan anahtarlar (sekmeler, sahiplik, dönem)
 * barda açıkta durur; seyrek dokunulan ikisi — para birimi ve çıkış — burada
 * toplanır. Böylece bar kalabalıklaşmıyor ve çıkışa kazara basmak iyice
 * zorlaşıyor (üstüne bir de onay kutusu var).
 */
export default function SettingsMenu({ cur, logoutAction }: { cur: Cur; logoutAction: () => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [ask, setAsk] = useState(false);
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
        <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor"
          strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="8" cy="8" r="2.3" />
          <path d="M8 1.5v1.6M8 12.9v1.6M14.5 8h-1.6M3.1 8H1.5M12.6 3.4l-1.1 1.1M4.5 11.5l-1.1 1.1M12.6 12.6l-1.1-1.1M4.5 4.5 3.4 3.4" />
        </svg>
      </button>

      {open && (
        <div role="menu" className="menu absolute right-0 top-full mt-1 p-2 min-w-[190px] z-50">
          <div className="text-[10px] mb-1.5 px-1" style={{ color: 'var(--faint)' }}>Para Birimi</div>
          <div className="flex gap-1 mb-2">
            {(['TRY', 'USD'] as const).map((c) => (
              <button
                key={c}
                onClick={() => { setParam('cur', c === 'TRY' ? null : 'USD'); setOpen(false); }}
                aria-pressed={cur === c}
                className={`seg tnum flex-1 text-center ${cur === c ? 'seg-on' : ''}`}
              >
                {c}
              </button>
            ))}
          </div>

          <div className="h-px my-1" style={{ background: 'var(--panel-3)' }} />

          <button
            type="button"
            onClick={() => { setOpen(false); setAsk(true); }}
            className="w-full flex items-center gap-2 px-1.5 py-1.5 text-[12px] rounded"
            style={{ color: 'var(--muted)' }}
          >
            <svg viewBox="0 0 15 15" width="14" height="14" fill="none" stroke="currentColor"
              strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M6 2H3.2A1.2 1.2 0 0 0 2 3.2v8.6A1.2 1.2 0 0 0 3.2 13H6" />
              <path d="M10 10.5 13 7.5 10 4.5" />
              <path d="M13 7.5H5.5" />
            </svg>
            Çıkış
          </button>
        </div>
      )}

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
