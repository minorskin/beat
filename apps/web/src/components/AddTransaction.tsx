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
      <button onClick={() => setOpen((v) => !v)}
        className="px-3 py-2 rounded-lg text-sm font-medium"
        style={{ background: 'var(--accent)', color: '#fff' }}>
        {open ? 'Kapat' : '+ İşlem Ekle'}
      </button>
      {open && (
        <form
          action={(fd) => start(async () => {
            const r = await addTransaction(fd);
            setMsg(r.ok ? 'Eklendi ✓' : r.error || 'Hata');
            if (r.ok) setTimeout(() => setMsg(''), 2000);
          })}
          className="panel p-4 mt-3 grid grid-cols-2 gap-3">
          <label className="col-span-2 text-xs" style={{ color: 'var(--muted)' }}>
            Enstrüman
            <select name="instrument_id" required onChange={(e) => {
              const ins = instruments.find((i) => i.id === e.target.value);
              if (ins) setCur(ins.currency);
            }} className="w-full mt-1 p-2 rounded-md" style={{ background: 'var(--panel-2)', color: 'var(--text)', border: '1px solid var(--border)' }}>
              <option value="">Seç…</option>
              {instruments.map((i) => <option key={i.id} value={i.id}>{i.symbol} — {i.display_name}</option>)}
            </select>
          </label>
          <label className="text-xs" style={{ color: 'var(--muted)' }}>
            İşlem
            <select name="type" defaultValue="buy" className="w-full mt-1 p-2 rounded-md" style={{ background: 'var(--panel-2)', color: 'var(--text)', border: '1px solid var(--border)' }}>
              <option value="buy">Alım</option><option value="sell">Satım</option>
              <option value="adjustment">Adet Düzelt</option><option value="dividend">Temettü</option>
            </select>
          </label>
          <label className="text-xs" style={{ color: 'var(--muted)' }}>
            Adet
            <input name="quantity" type="number" step="any" required className="w-full mt-1 p-2 rounded-md tnum" style={{ background: 'var(--panel-2)', color: 'var(--text)', border: '1px solid var(--border)' }} />
          </label>
          <label className="text-xs" style={{ color: 'var(--muted)' }}>
            Birim Fiyat ({cur})
            <input name="unit_price" type="number" step="any" className="w-full mt-1 p-2 rounded-md tnum" style={{ background: 'var(--panel-2)', color: 'var(--text)', border: '1px solid var(--border)' }} />
          </label>
          <label className="text-xs" style={{ color: 'var(--muted)' }}>
            Tarih
            <input name="executed_at" type="datetime-local" className="w-full mt-1 p-2 rounded-md" style={{ background: 'var(--panel-2)', color: 'var(--text)', border: '1px solid var(--border)' }} />
          </label>
          <input type="hidden" name="currency" value={cur} />
          <div className="col-span-2 flex items-center gap-3">
            <button type="submit" disabled={pending} className="px-4 py-2 rounded-lg text-sm font-medium" style={{ background: 'var(--up)', color: '#04120a', opacity: pending ? 0.6 : 1 }}>
              {pending ? 'Kaydediliyor…' : 'Kaydet'}
            </button>
            {msg && <span className="text-xs" style={{ color: 'var(--muted)' }}>{msg}</span>}
          </div>
        </form>
      )}
    </>
  );
}
