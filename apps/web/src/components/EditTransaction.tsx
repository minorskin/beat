'use client';
import { useState, useTransition } from 'react';
import { updateTransaction } from '@/app/actions';
import type { TxRow } from '@/lib/data';

const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** Var olan bir işlem kaydını düzenler. Enstrüman sabit — yalnız işlemin kendi alanları değişir. */
export default function EditTransaction({ tx, locations }: { tx: TxRow; locations: string[] }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState('');
  const [type, setType] = useState(tx.type);
  const isTransfer = type === 'transfer';

  const reset = () => { setOpen(false); setMsg(''); setType(tx.type); };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 text-[11px] leading-none opacity-50 hover:opacity-100"
        style={{ color: 'var(--muted)' }}
        title="İşlemi düzenle"
        aria-label="İşlemi düzenle"
      >
        ✎
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 whitespace-normal text-left normal-case tracking-normal"
          style={{ background: 'rgba(0,0,0,0.65)' }}
          onClick={reset}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            action={(fd) => start(async () => {
              const r = await updateTransaction(fd);
              setMsg(r.ok ? 'Kaydedildi ✓' : r.error || 'Hata');
              if (r.ok) setTimeout(reset, 1200);
            })}
            className="sheet w-full sm:max-w-md p-4 sm:p-5 grid grid-cols-2 gap-3 max-h-[90vh] overflow-y-auto"
          >
            <div className="col-span-2 flex items-center justify-between mb-1">
              <h2 className="text-sm font-medium">İşlemi Düzenle</h2>
              <button type="button" onClick={reset} className="seg text-[15px] leading-none" aria-label="Kapat">✕</button>
            </div>

            <input type="hidden" name="id" value={tx.id} />
            <input type="hidden" name="currency" value={tx.currency} />

            <label className={`${isTransfer ? 'col-span-2' : 'col-span-2 sm:col-span-1'} text-[11px]`} style={{ color: 'var(--muted)' }}>
              İşlem
              <select
                name="type" className="field mt-1" value={type}
                onChange={(e) => setType(e.target.value)}
              >
                <option value="buy">Alım</option><option value="sell">Satım</option>
                <option value="adjustment">Adet Düzelt</option><option value="dividend">Temettü</option>
                <option value="transfer">Emanet Düzelt</option>
              </select>
            </label>

            {isTransfer ? (
              <label className="col-span-2 text-[11px]" style={{ color: 'var(--muted)' }}>
                Emanet adedi değişimi (delta)
                <input
                  name="external_quantity" type="number" step="any" inputMode="decimal"
                  defaultValue={tx.external_quantity} className="field mt-1 tnum"
                />
              </label>
            ) : (
              <>
                <label className="col-span-2 sm:col-span-1 text-[11px]" style={{ color: 'var(--muted)' }}>
                  Adet
                  <input
                    name="quantity" type="number" step="any" required inputMode="decimal"
                    defaultValue={tx.quantity} className="field mt-1 tnum"
                  />
                </label>

                <label className="col-span-2 sm:col-span-1 text-[11px]" style={{ color: 'var(--muted)' }}>
                  Birim Fiyat ({tx.currency})
                  <input
                    name="unit_price" type="number" step="any" inputMode="decimal"
                    defaultValue={tx.unit_price ?? ''} className="field mt-1 tnum"
                  />
                </label>

                <label className="col-span-2 sm:col-span-1 text-[11px]" style={{ color: 'var(--muted)' }}>
                  Tarih
                  <input
                    name="executed_at" type="datetime-local"
                    defaultValue={toLocalInput(tx.executed_at)} className="field mt-1"
                  />
                </label>

                <label className="col-span-2 sm:col-span-1 text-[11px]" style={{ color: 'var(--muted)' }}>
                  Konum
                  <input
                    name="location" list={`edit-location-options-${tx.id}`} autoComplete="off"
                    defaultValue={tx.location ?? ''} className="field mt-1" placeholder="ör. İş Yatırım"
                  />
                  <datalist id={`edit-location-options-${tx.id}`}>
                    {locations.map((l) => <option key={l} value={l} />)}
                  </datalist>
                </label>

                {(type === 'buy' || type === 'sell') && (
                  <label className="col-span-2 text-[11px]" style={{ color: 'var(--muted)' }}>
                    Bu adetin bana ait olmayan kısmı
                    <input
                      name="external_quantity" type="number" step="any" min="0"
                      defaultValue={tx.external_quantity} inputMode="decimal"
                      className="field mt-1 tnum" placeholder="0"
                    />
                  </label>
                )}
              </>
            )}

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
