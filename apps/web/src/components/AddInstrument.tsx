'use client';
import { useState, useTransition } from 'react';
import { addInstrument } from '@/app/actions';
import { CLASS_DEFAULTS } from '@/lib/catalog';
import type { AssetClass } from '@/lib/data';

/**
 * Henüz sahip olunmayan bir enstrümanı kataloğa ekler.
 * Para birimi, takvim, ritim ve kaynak zinciri varlık sınıfından türetilir —
 * kullanıcı yalnız sembol + ad girer.
 */
export default function AddInstrument({ classes }: { classes: AssetClass[] }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState('');
  const [cls, setCls] = useState('stock_us');
  const [symbol, setSymbol] = useState('');

  const def = CLASS_DEFAULTS[cls];
  const sym = symbol.trim().toUpperCase();
  const preview = def && sym ? def.sources(sym, '‹kaynak kodu›') : [];

  const reset = () => { setOpen(false); setMsg(''); setSymbol(''); };

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn btn-ghost">+ Enstrüman</button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ background: 'rgba(0,0,0,0.65)' }}
          onClick={reset}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            action={(fd) => start(async () => {
              const r = await addInstrument(fd);
              setMsg(r.ok ? 'Eklendi ✓ — fiyatı bir sonraki turda gelir' : r.error || 'Hata');
              if (r.ok) setTimeout(reset, 1600);
            })}
            className="sheet w-full sm:max-w-md p-4 sm:p-5 grid grid-cols-2 gap-3 max-h-[90vh] overflow-y-auto"
          >
            <div className="col-span-2 flex items-center justify-between mb-1">
              <h2 className="text-sm font-medium">Enstrüman Ekle</h2>
              <button type="button" onClick={reset} className="seg" aria-label="Kapat">✕</button>
            </div>

            <p className="col-span-2 text-[11px] -mt-2" style={{ color: 'var(--faint)' }}>
              Henüz almadığın bir varlığı ekle; izleme listesinde durur, fiyatı çekilmeye başlar.
              İlk alımı girdiğinde kendiliğinden pozisyona döner.
            </p>

            <label className="col-span-2 text-[11px]" style={{ color: 'var(--muted)' }}>
              Varlık Sınıfı
              <select name="class_code" className="field mt-1" value={cls} onChange={(e) => setCls(e.target.value)}>
                {classes.filter((c) => CLASS_DEFAULTS[c.code]).map((c) => (
                  <option key={c.code} value={c.code}>{c.name}</option>
                ))}
              </select>
            </label>

            <label className="col-span-2 sm:col-span-1 text-[11px]" style={{ color: 'var(--muted)' }}>
              Sembol
              <input
                name="symbol" required className="field mt-1 tnum uppercase"
                value={symbol} onChange={(e) => setSymbol(e.target.value)}
                autoCapitalize="characters" autoCorrect="off" spellCheck={false}
              />
              <span className="block mt-1" style={{ color: 'var(--faint)' }}>{def?.symbolHint}</span>
            </label>

            <label className="col-span-2 sm:col-span-1 text-[11px]" style={{ color: 'var(--muted)' }}>
              Görünen Ad
              <input name="display_name" required className="field mt-1" />
            </label>

            {def?.providerHint && (
              <label className="col-span-2 text-[11px]" style={{ color: 'var(--muted)' }}>
                Kaynak Kodu
                <input
                  name="provider_symbol" required={def.needsProviderSymbol}
                  className="field mt-1" autoCorrect="off" spellCheck={false}
                />
                <span className="block mt-1" style={{ color: 'var(--faint)' }}>{def.providerHint}</span>
              </label>
            )}

            {def && (
              <div className="col-span-2 text-[11px] tnum" style={{ color: 'var(--faint)' }}>
                {def.currency} · {def.calendar} · {def.cadence}
                {preview.length > 0 && (
                  <> · kaynak: {preview.map((s) => `${s.provider}(${s.providerSymbol})`).join(' → ')}</>
                )}
              </div>
            )}

            <div className="col-span-2 flex items-center gap-3 mt-1">
              <button type="submit" disabled={pending} className="btn btn-primary flex-1 sm:flex-none">
                {pending ? 'Ekleniyor…' : 'Ekle'}
              </button>
              {msg && <span className="text-xs" style={{ color: 'var(--muted)' }}>{msg}</span>}
            </div>
          </form>
        </div>
      )}
    </>
  );
}
