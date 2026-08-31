'use client';
import { useState, useTransition } from 'react';
import { upsertAnnualClosing, removeAnnualClosing } from '@/app/actions';
import { tl, usd } from '@/lib/format';
import type { AnnualClosing } from '@/lib/data';

/**
 * Motor öncesi yılların kapanış büyüklüğü. Kullanıcı bu yılları yalnız TOPLAM
 * olarak biliyor; varlık kırılımı yok. Bu yüzden ayrı bir tabloda duruyor ve
 * grafikte yalnız "TÜM" aralığında, tek çizgi olarak çiziliyor.
 */
export default function AnnualClosings({ rows }: { rows: AnnualClosing[] }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState('');
  const [edit, setEdit] = useState<AnnualClosing | null>(null);

  const reset = () => { setOpen(false); setMsg(''); setEdit(null); };
  const thisYear = new Date().getFullYear();

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn btn-ghost" title="Geçmiş yıl kapanışları">
        Yıl Kapanışı
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ background: 'rgba(0,0,0,0.65)' }}
          onClick={reset}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="sheet w-full sm:max-w-md p-4 sm:p-5 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-sm font-medium">Yıl Kapanışları</h2>
              <button type="button" onClick={reset} className="seg text-[15px] leading-none" aria-label="Kapat">✕</button>
            </div>
            <p className="text-[11px] mb-3" style={{ color: 'var(--faint)' }}>
              Motor devreye girmeden önceki yılların yıl sonu toplamı. Grafikte
              üst bardaki <span className="tnum">TÜM</span> aralığında görünür.
              Varlık kırılımı olmadığı için yalnız toplam çizilir.
            </p>

            {rows.length > 0 && (
              <div className="mb-3">
                {rows.map((r) => (
                  <div key={r.year} className="flex items-baseline gap-2 text-[12px] py-1.5">
                    <span className="tnum font-medium w-10 shrink-0">{r.year}</span>
                    <span className="tnum truncate">{tl(r.total_value_try)}</span>
                    {r.total_value_usd != null && (
                      <span className="tnum text-[11px] shrink-0" style={{ color: 'var(--muted)' }}>
                        {usd(r.total_value_usd)}
                      </span>
                    )}
                    <span className="ml-auto flex gap-2 shrink-0">
                      <button
                        type="button" onClick={() => { setEdit(r); setMsg(''); }}
                        className="text-[11px] underline underline-offset-2" style={{ color: 'var(--muted)' }}
                      >
                        düzenle
                      </button>
                      <button
                        type="button" disabled={pending}
                        onClick={() => start(async () => {
                          const fd = new FormData();
                          fd.set('year', String(r.year));
                          const res = await removeAnnualClosing(fd);
                          setMsg(res.ok ? `${r.year} silindi` : res.error || 'Silinemedi');
                        })}
                        className="text-[11px] underline underline-offset-2" style={{ color: 'var(--down)' }}
                      >
                        sil
                      </button>
                    </span>
                  </div>
                ))}
              </div>
            )}

            <form
              key={edit?.year ?? 'new'}
              action={(fd) => start(async () => {
                const res = await upsertAnnualClosing(fd);
                setMsg(res.ok ? 'Kaydedildi ✓' : res.error || 'Hata');
                if (res.ok) setEdit(null);
              })}
              className="grid grid-cols-2 gap-3"
            >
              <label className="col-span-2 sm:col-span-1 text-[11px]" style={{ color: 'var(--muted)' }}>
                Yıl
                <input
                  name="year" required inputMode="numeric" className="field mt-1 tnum"
                  defaultValue={edit?.year ?? ''} placeholder={String(thisYear - 1)}
                />
              </label>

              <label className="col-span-2 sm:col-span-1 text-[11px]" style={{ color: 'var(--muted)' }}>
                Toplam (₺)
                <input
                  name="total_value_try" required inputMode="decimal" className="field mt-1 tnum"
                  defaultValue={edit?.total_value_try ?? ''} placeholder="ör. 1.250.000"
                />
              </label>

              <label className="col-span-2 text-[11px]" style={{ color: 'var(--muted)' }}>
                Toplam ($) <span style={{ color: 'var(--faint)' }}>— isteğe bağlı</span>
                <input
                  name="total_value_usd" inputMode="decimal" className="field mt-1 tnum"
                  defaultValue={edit?.total_value_usd ?? ''} placeholder="o yılın dolar karşılığı"
                />
                <span className="block mt-1" style={{ color: 'var(--faint)' }}>
                  Boş bırakırsan USD görünümünde bugünkü kurla yaklaşık çevrilir — o yılın gerçek kuru değil.
                </span>
              </label>

              <label className="col-span-2 text-[11px]" style={{ color: 'var(--muted)' }}>
                Not <span style={{ color: 'var(--faint)' }}>— isteğe bağlı</span>
                <input name="note" className="field mt-1" defaultValue={edit?.note ?? ''} placeholder="ör. yıl sonu ekstre" />
              </label>

              <div className="col-span-2 flex items-center gap-3 mt-1">
                <button type="submit" disabled={pending} className="btn btn-primary flex-1 sm:flex-none">
                  {pending ? 'Kaydediliyor…' : edit ? `${edit.year} güncelle` : 'Ekle'}
                </button>
                {edit && (
                  <button type="button" onClick={() => setEdit(null)} className="btn btn-ghost">Vazgeç</button>
                )}
                {msg && <span className="text-xs" style={{ color: 'var(--muted)' }}>{msg}</span>}
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
