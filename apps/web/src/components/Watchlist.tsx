'use client';
import { useState, useTransition } from 'react';
import { removeInstrument } from '@/app/actions';
import { num, timeAgo } from '@/lib/format';
import AddInstrument from './AddInstrument';
import type { AssetClass, WatchItem } from '@/lib/data';

/**
 * Kataloğa eklenmiş ama pozisyonu olmayan enstrümanlar.
 * Fiyatları normal fetch turunda çekilir; ilk alım girildiğinde satır
 * buradan düşer ve portföye geçer.
 */
export default function Watchlist({ items, classes }: { items: WatchItem[]; classes: AssetClass[] }) {
  const [pending, start] = useTransition();
  const [err, setErr] = useState('');

  const remove = (it: WatchItem) => {
    if (!confirm(`${it.symbol} izleme listesinden kaldırılsın mı? Toplanmış fiyat geçmişi de silinir.`)) return;
    const fd = new FormData();
    fd.set('instrument_id', it.instrument_id);
    start(async () => {
      const r = await removeInstrument(fd);
      setErr(r.ok ? '' : r.error || 'Silinemedi');
    });
  };

  return (
    <div className="panel overflow-hidden">
      <div className="px-4 sm:px-5 pt-4 pb-3 flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium" style={{ color: 'var(--muted)' }}>
          İzlenenler {items.length > 0 && <span className="tnum">({items.length})</span>}
        </h3>
        <AddInstrument classes={classes} />
      </div>

      {err && <div className="px-4 sm:px-5 pb-2 text-[11px]" style={{ color: 'var(--down)' }}>{err}</div>}

      {items.length === 0 ? (
        <div className="px-4 sm:px-5 pb-6 pt-2 text-sm" style={{ color: 'var(--faint)' }}>
          Liste boş. İleride alabileceğin varlıkları şimdiden ekle — fiyatları birikmeye başlasın.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="tbl w-full text-sm min-w-[420px]">
            <thead>
              <tr style={{ color: 'var(--muted)' }} className="text-[11px] uppercase tracking-wide">
                <th className="text-left font-medium px-4 sm:px-5 py-2.5">Varlık</th>
                <th className="text-left font-medium px-3 py-2.5 hidden sm:table-cell">Grup</th>
                <th className="text-right font-medium px-3 py-2.5">Fiyat</th>
                <th className="text-right font-medium px-3 py-2.5 hidden sm:table-cell">Güncelleme</th>
                <th className="px-4 sm:px-5 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.instrument_id}>
                  <td className="px-4 sm:px-5 py-3">
                    <div className="font-medium">{it.symbol}</div>
                    <div className="text-[11px] truncate max-w-[140px] sm:max-w-[220px]" style={{ color: 'var(--muted)' }}>
                      {it.display_name}
                    </div>
                  </td>
                  <td className="px-3 py-3 hidden sm:table-cell text-[11px]" style={{ color: 'var(--muted)' }}>
                    {it.ui_group}
                  </td>
                  <td className="text-right px-3 py-3 tnum whitespace-nowrap">
                    {it.price != null
                      ? `${num(it.price, 2)} ${it.currency === 'USD' ? '$' : '₺'}`
                      : <span style={{ color: 'var(--faint)' }}>bekliyor</span>}
                  </td>
                  <td className="text-right px-3 py-3 hidden sm:table-cell text-[11px] whitespace-nowrap" style={{ color: 'var(--muted)' }}>
                    {it.price_ts ? timeAgo(it.price_ts) : '—'}
                  </td>
                  <td className="text-right px-4 sm:px-5 py-3">
                    <button
                      onClick={() => remove(it)} disabled={pending}
                      className="seg" aria-label={`${it.symbol} kaldır`} title="İzlemeden kaldır"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
