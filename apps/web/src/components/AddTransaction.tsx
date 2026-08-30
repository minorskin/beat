'use client';
import { useState, useTransition } from 'react';
import { addTransaction } from '@/app/actions';
import { num } from '@/lib/format';
import type { Instrument } from '@/lib/data';

export default function AddTransaction({ instruments }: { instruments: Instrument[] }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState('');
  const [cur, setCur] = useState('TRY');
  const [type, setType] = useState('buy');
  const [insId, setInsId] = useState('');
  // "Bana ait olmayan kısım" alanı varsayılan olarak gizli — işlemlerin
  // çoğunda emanet yok, formu her seferinde kalabalıklaştırmasın.
  const [showExt, setShowExt] = useState(false);
  const [extTarget, setExtTarget] = useState('');

  const sel = instruments.find((i) => i.id === insId);
  const isTransfer = type === 'transfer';
  // Emanet düzeltmesinde kullanıcı YENİ TOPLAMI girer; sunucuya delta gider.
  const extDelta = isTransfer ? (Number(extTarget) || 0) - (sel?.external_quantity ?? 0) : 0;

  const reset = () => { setMsg(''); setOpen(false); setShowExt(false); setExtTarget(''); setType('buy'); setInsId(''); };

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
          onClick={reset}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            action={(fd) => start(async () => {
              const r = await addTransaction(fd);
              setMsg(r.ok ? 'Eklendi ✓' : r.error || 'Hata');
              if (r.ok) setTimeout(reset, 1200);
            })}
            className="sheet w-full sm:max-w-md p-4 sm:p-5 grid grid-cols-2 gap-3 max-h-[90vh] overflow-y-auto"
          >
            <div className="col-span-2 flex items-center justify-between mb-1">
              <h2 className="text-sm font-medium">{isTransfer ? 'Emanet Düzelt' : 'İşlem Ekle'}</h2>
              <button type="button" onClick={reset} className="seg" aria-label="Kapat">✕</button>
            </div>

            <label className="col-span-2 text-[11px]" style={{ color: 'var(--muted)' }}>
              Enstrüman
              <select
                name="instrument_id" required className="field mt-1" value={insId}
                onChange={(e) => {
                  setInsId(e.target.value);
                  const ins = instruments.find((i) => i.id === e.target.value);
                  if (ins) { setCur(ins.currency); setExtTarget(String(ins.external_quantity || '')); }
                }}
              >
                <option value="">Seç…</option>
                {instruments.map((i) => <option key={i.id} value={i.id}>{i.symbol} — {i.display_name}</option>)}
              </select>
            </label>

            {sel && (
              <div className="col-span-2 text-[11px] tnum -mt-1" style={{ color: 'var(--faint)' }}>
                Mevcut: {num(sel.quantity, sel.quantity < 1 ? 4 : 2)} adet
                {sel.external_quantity > 0 && ` · ${num(sel.external_quantity, sel.external_quantity < 1 ? 4 : 2)} emanet`}
              </div>
            )}

            <label className={`${isTransfer ? 'col-span-2' : 'col-span-2 sm:col-span-1'} text-[11px]`} style={{ color: 'var(--muted)' }}>
              İşlem
              <select
                name="type" className="field mt-1" value={type}
                onChange={(e) => { setType(e.target.value); setShowExt(false); }}
              >
                <option value="buy">Alım</option><option value="sell">Satım</option>
                <option value="adjustment">Adet Düzelt</option><option value="dividend">Temettü</option>
                <option value="transfer">Emanet Düzelt</option>
              </select>
            </label>

            {isTransfer ? (
              <>
                <label className="col-span-2 text-[11px]" style={{ color: 'var(--muted)' }}>
                  Bana ait olmayan adet (yeni toplam)
                  <input
                    type="number" step="any" min="0" inputMode="decimal" className="field mt-1 tnum"
                    value={extTarget} onChange={(e) => setExtTarget(e.target.value)}
                    max={sel ? sel.quantity : undefined}
                  />
                </label>
                <input type="hidden" name="external_quantity" value={extDelta} />
                <p className="col-span-2 text-[11px] -mt-1" style={{ color: 'var(--faint)' }}>
                  Adet değişmez, yalnız sahiplik payı güncellenir.
                  {sel && extTarget !== '' && (
                    <> Bana ait kalan: <span className="tnum">{num(sel.quantity - (Number(extTarget) || 0), 2)}</span></>
                  )}
                </p>
              </>
            ) : (
              <>
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

                {(type === 'buy' || type === 'sell') && (
                  showExt ? (
                    <label className="col-span-2 text-[11px]" style={{ color: 'var(--muted)' }}>
                      Bu adetin bana ait olmayan kısmı
                      <input
                        name="external_quantity" type="number" step="any" min="0" defaultValue=""
                        inputMode="decimal" className="field mt-1 tnum" placeholder="0"
                      />
                      <span className="block mt-1" style={{ color: 'var(--faint)' }}>
                        Başkası adına aldığın miktar. Toplam büyüklüğe girer, “Bana Ait” görünümünden düşülür.
                      </span>
                    </label>
                  ) : (
                    <button
                      type="button" onClick={() => setShowExt(true)}
                      className="col-span-2 btn btn-ghost text-left"
                    >
                      + Bir kısmı bana ait değil
                    </button>
                  )
                )}
              </>
            )}

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
