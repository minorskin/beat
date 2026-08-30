'use client';
import { useState, useTransition } from 'react';
import { updateInstrument } from '@/app/actions';

/** Var olan bir enstrümanın görünen adını düzenler — sembol/sınıf/kaynak sabit kalır. */
export default function EditInstrument({ id, symbol, displayName }: { id: string; symbol: string; displayName: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState('');
  const [name, setName] = useState(displayName);

  const reset = () => { setOpen(false); setMsg(''); setName(displayName); };

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className="shrink-0 text-[11px] leading-none opacity-50 hover:opacity-100"
        style={{ color: 'var(--muted)' }}
        title="Varlığı düzenle"
        aria-label="Varlığı düzenle"
      >
        ✎
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ background: 'rgba(0,0,0,0.65)' }}
          onClick={(e) => { e.stopPropagation(); reset(); }}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            action={(fd) => start(async () => {
              const r = await updateInstrument(fd);
              setMsg(r.ok ? 'Kaydedildi ✓' : r.error || 'Hata');
              if (r.ok) setTimeout(reset, 1200);
            })}
            className="sheet w-full sm:max-w-sm p-4 sm:p-5 grid grid-cols-1 gap-3"
          >
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-sm font-medium">Varlığı Düzenle</h2>
              <button type="button" onClick={reset} className="seg" aria-label="Kapat">✕</button>
            </div>

            <input type="hidden" name="instrument_id" value={id} />

            <label className="text-[11px]" style={{ color: 'var(--muted)' }}>
              {symbol} — Görünen Ad
              <input
                name="display_name" required className="field mt-1"
                value={name} onChange={(e) => setName(e.target.value)}
              />
            </label>

            <div className="flex items-center gap-3 mt-1">
              <button type="submit" disabled={pending} className="btn btn-primary flex-1 sm:flex-none">
                {pending ? 'Kaydediliyor…' : 'Kaydet'}
              </button>
              {msg && <span className="text-xs" style={{ color: 'var(--muted)' }}>{msg}</span>}
            </div>
          </form>
        </div>
      )}
    </>
  );
}
