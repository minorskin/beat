'use client';
import { useState, useTransition } from 'react';
import { addTransaction } from '@/app/actions';
import type { Instrument } from '@/lib/data';

export default function AddTransaction({ instruments }: { instruments: Instrument[] }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState('');
  const [cur, setCur] = useState('TRY');

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn btn-primary">
        <span className="sm:hidden">+ İşlem</span>
        <span className="hidden sm:inline">+ İşlem Ekle</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ background: 'rgba(0,0,0,0.65)' }}
          onClick={() => setOpen(false)}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            action={(fd) => start(async () => {
              const r = await addTransaction(fd);
              setMsg(r.ok ? 'Eklendi ✓' : r.error || 'Hata');
              if (r.ok) setTimeout(() => { setMsg(''); setOpen(false); }, 1200);
            })}
            className="sheet w-full sm:max-w-md p-4 sm:p-5 grid grid-cols-2 gap-3 max-h-[90vh] overflow-y-auto"
          >
            <div className="col-span-2 flex items-center justify-between mb-1">
              <h2 className="text-sm font-medium">İşlem Ekle</h2>
              <button type="button" onClick={() => setOpen(false)} className="seg" aria-label="Kapat">✕</button>
            </div>

            <label className="col-span-2 text-[11px]" style={{ color: 'var(--muted)' }}>
              Enstrüman
              <select name="instrument_id" required className="field mt-1" onChange={(e) => {
                const ins = instruments.find((i) => i.id === e.target.value);
                if (ins) setCur(ins.currency);
              }}>
                <option value="">Seç…</option>
                {instruments.map((i) => <option key={i.id} value={i.id}>{i.symbol} — {i.display_name}</option>)}
              </select>
            </label>

            <label className="col-span-2 sm:col-span-1 text-[11px]" style={{ color: 'var(--muted)' }}>
              İşlem
              <select name="type" defaultValue="buy" className="field mt-1">
                <option value="buy">Alım</option><option value="sell">Satım</option>
                <option value="adjustment">Adet Düzelt</option><option value="dividend">Temettü</option>
              </select>
            </label>

            <label className="col-span-2 sm:col-span-1 text-[11px]" style={{ color: 'var(--muted)' }}>
              Adet
              <input name="quantity" type="number" step="any" required inputMode="decimal" className="field mt-1 tnum" />
            </label>

            <label className="col-span-2 sm:col-span-1 text-[11px]" style={{ color: 'var(--muted)' }}>
              Birim Fiyat ({cur})
              <input name="unit_price" type="number" step="any" inputMode="decimal" className="field mt-1 tnum" />
            </label>

            <label className="col-span-2 sm:col-span-1 text-[11px]" style={{ color: 'var(--muted)' }}>
              Tarih
              <input name="executed_at" type="datetime-local" className="field mt-1" />
            </label>

            <input type="hidden" name="currency" value={cur} />

            <div className="col-span-2 flex items-center gap-3 mt-1">
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
