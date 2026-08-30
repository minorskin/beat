'use client';
import { Fragment, useState } from 'react';
import { tl, num, pct, dateStr } from '@/lib/format';
import type { Position, TxRow } from '@/lib/data';
import EditInstrument from './EditInstrument';
import EditTransaction from './EditTransaction';

const TX_LABEL: Record<string, string> = {
  buy: 'Alış', sell: 'Satış', dividend: 'Temettü', fee: 'Ücret',
  adjustment: 'Adet Düzelt', transfer: 'Emanet Düzelt',
};

const ANIM_MS = 160;

type ColKey = 'symbol' | 'class' | 'currency' | 'location' | 'qty' | 'price' | 'value' | 'pnl' | 'weight' | 'opened' | 'closed';
type SortDir = 'asc' | 'desc';

export default function PositionsTable({
  rows, own, transactions, locations,
}: {
  rows: Position[]; own: boolean; transactions: Record<string, TxRow[]>; locations: string[];
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<ColKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [filters, setFilters] = useState<Partial<Record<ColKey, string>>>({});

  const toggle = (id: string) => {
    if (openId === id) {
      setOpenId(null);
      setClosingId(id);
      setTimeout(() => setClosingId((c) => (c === id ? null : c)), ANIM_MS);
    } else {
      setOpenId(id);
      setClosingId(null);
    }
  };

  const qtyOf = (p: Position) => (own ? p.own_quantity : p.quantity);
  const valOf = (p: Position) => (own ? p.own_value_try : p.value_try);
  const wOf = (p: Position) => (own ? p.own_weight_pct : p.weight_pct);

  const columns: { key: ColKey; label: string; align: 'left' | 'right'; cls: string; sortVal: (p: Position) => string | number; filterVal: (p: Position) => string }[] = [
    { key: 'symbol', label: 'Varlık', align: 'left', cls: 'px-4 sm:px-5',
      sortVal: (p) => p.symbol, filterVal: (p) => `${p.symbol} ${p.display_name}` },
    { key: 'class', label: 'Grup', align: 'left', cls: 'px-3 hidden md:table-cell',
      sortVal: (p) => p.class_name, filterVal: (p) => p.class_name },
    { key: 'currency', label: 'Döviz', align: 'left', cls: 'px-3 hidden md:table-cell',
      sortVal: (p) => p.currency, filterVal: (p) => p.currency },
    { key: 'location', label: 'Konum', align: 'left', cls: 'px-3 hidden lg:table-cell',
      sortVal: (p) => p.locations.join(', '), filterVal: (p) => p.locations.join(', ') },
    { key: 'qty', label: 'Adet', align: 'right', cls: 'px-3',
      sortVal: (p) => qtyOf(p), filterVal: (p) => String(qtyOf(p)) },
    { key: 'price', label: 'Fiyat', align: 'right', cls: 'px-3',
      sortVal: (p) => p.price ?? -Infinity, filterVal: (p) => (p.price != null ? String(p.price) : '') },
    { key: 'value', label: 'Değer (₺)', align: 'right', cls: 'px-3',
      sortVal: (p) => valOf(p) ?? -Infinity, filterVal: (p) => (valOf(p) != null ? String(valOf(p)) : '') },
    { key: 'pnl', label: 'Kar/Zarar', align: 'right', cls: 'px-3 hidden sm:table-cell',
      sortVal: (p) => p.pnl_pct ?? -Infinity, filterVal: (p) => (p.pnl_pct != null ? String(p.pnl_pct) : '') },
    { key: 'weight', label: 'Ağırlık', align: 'right', cls: 'px-3 hidden sm:table-cell',
      sortVal: (p) => wOf(p) ?? -Infinity, filterVal: (p) => (wOf(p) != null ? String(wOf(p)) : '') },
    { key: 'opened', label: 'Açılış', align: 'left', cls: 'px-3 hidden lg:table-cell',
      sortVal: (p) => p.opened_at ?? '', filterVal: (p) => (p.opened_at ? dateStr(p.opened_at) : '') },
    { key: 'closed', label: 'Kapanış', align: 'left', cls: 'px-4 sm:px-5 hidden lg:table-cell',
      sortVal: (p) => p.closed_at ?? '', filterVal: (p) => (p.closed_at ? dateStr(p.closed_at) : '') },
  ];

  const toggleSort = (key: ColKey) => {
    if (sortKey !== key) { setSortKey(key); setSortDir('asc'); }
    else if (sortDir === 'asc') setSortDir('desc');
    else { setSortKey(null); setSortDir('asc'); }
  };

  const setFilter = (key: ColKey, v: string) => setFilters((f) => ({ ...f, [key]: v }));

  const norm = (s: string) => s.toLocaleLowerCase('tr-TR');

  let displayRows = rows.filter((p) =>
    columns.every((c) => {
      const f = filters[c.key];
      return !f || norm(c.filterVal(p)).includes(norm(f));
    }));

  if (sortKey) {
    const c = columns.find((c) => c.key === sortKey)!;
    displayRows = [...displayRows].sort((a, b) => {
      const av = c.sortVal(a), bv = c.sortVal(b);
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv), 'tr-TR');
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }

  return (
    <div className="panel overflow-hidden">
      <div className="overflow-x-auto">
        <table className="tbl w-full text-sm min-w-[720px]">
          <thead>
            <tr style={{ color: 'var(--muted)' }} className="text-[11px] uppercase tracking-wide">
              {columns.map((c) => (
                <th key={c.key} className={`font-medium py-2.5 ${c.cls}`} style={{ textAlign: c.align }}>
                  <button
                    type="button"
                    onClick={() => toggleSort(c.key)}
                    className={`inline-flex items-center gap-1 ${c.align === 'right' ? 'flex-row-reverse' : ''}`}
                  >
                    <span>{c.label}</span>
                    <span className="tnum" style={{ opacity: sortKey === c.key ? 1 : 0.3 }}>
                      {sortKey === c.key ? (sortDir === 'asc' ? '▲' : '▼') : '▲'}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
            <tr style={{ color: 'var(--faint)' }}>
              {columns.map((c) => (
                <th key={c.key} className={`font-normal pb-2 ${c.cls}`}>
                  <input
                    value={filters[c.key] ?? ''}
                    onChange={(e) => setFilter(c.key, e.target.value)}
                    placeholder="filtre…"
                    className="field w-full px-1.5 py-1 text-[11px] normal-case"
                    style={{ textAlign: c.align }}
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayRows.map((p) => {
              const isOpen = openId === p.instrument_id;
              const isClosing = closingId === p.instrument_id;
              const tx = transactions[p.instrument_id] ?? [];
              return (
                <Fragment key={p.instrument_id}>
                  <tr
                    onClick={() => toggle(p.instrument_id)}
                    className="cursor-pointer"
                    aria-expanded={isOpen}
                  >
                    <td className="px-4 sm:px-5 py-3">
                      <div className="font-medium flex items-center gap-2">
                        {p.symbol}
                        {p.pending && <span title="Fiyat bekleniyor — bir sonraki turda gelir" className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'var(--c3)' }} />}
                        {!p.pending && p.is_stale && <span title="Taşınmış fiyat (piyasa kapalı)" className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'var(--faint)' }} />}
                        <EditInstrument id={p.instrument_id} symbol={p.symbol} displayName={p.display_name} />
                      </div>
                      <div className="text-[11px] truncate max-w-[120px] sm:max-w-[180px]" style={{ color: 'var(--muted)' }}>{p.display_name}</div>
                      <div className="text-[11px] mt-0.5 md:hidden" style={{ color: 'var(--faint)' }}>{p.class_name} · {p.currency}</div>
                      <div className="text-[11px] tnum mt-0.5 sm:hidden" style={{ color: (p.pnl_pct ?? 0) >= 0 ? 'var(--up)' : 'var(--down)' }}>
                        {p.pnl_pct != null ? pct(p.pnl_pct) : '—'}
                      </div>
                    </td>
                    <td className="px-3 py-3 hidden md:table-cell text-[11px]" style={{ color: 'var(--muted)' }}>{p.class_name}</td>
                    <td className="px-3 py-3 hidden md:table-cell text-[11px] tnum" style={{ color: 'var(--muted)' }}>{p.currency}</td>
                    <td className="px-3 py-3 hidden lg:table-cell text-[11px]" style={{ color: 'var(--muted)' }}>
                      {p.locations.length ? p.locations.join(', ') : '—'}
                    </td>
                    <td className="text-right px-3 py-3 tnum whitespace-nowrap">
                      {num(qtyOf(p), Math.abs(qtyOf(p)) < 1 ? 4 : 2)}
                      {p.external_quantity > 0 && (
                        <div className="text-[11px]" style={{ color: 'var(--faint)' }}>
                          {own
                            ? `${num(p.quantity, p.quantity < 1 ? 4 : 2)} toplam`
                            : `${num(p.external_quantity, p.external_quantity < 1 ? 4 : 2)} emanet`}
                        </div>
                      )}
                    </td>
                    <td className="text-right px-3 py-3 tnum whitespace-nowrap">
                      {p.price != null ? `${num(p.price, 2)} ${p.currency === 'USD' ? '$' : '₺'}` : <span style={{ color: 'var(--faint)' }}>bekliyor</span>}
                    </td>
                    <td className="text-right px-3 py-3 tnum whitespace-nowrap">{valOf(p) != null ? tl(valOf(p)!) : '—'}</td>
                    <td className="text-right px-3 py-3 tnum hidden sm:table-cell whitespace-nowrap" style={{ color: (p.pnl_pct ?? 0) >= 0 ? 'var(--up)' : 'var(--down)' }}>
                      {p.pnl_pct != null ? pct(p.pnl_pct) : '—'}
                    </td>
                    <td className="text-right px-3 py-3 tnum hidden sm:table-cell whitespace-nowrap" style={{ color: 'var(--muted)' }}>
                      {wOf(p) != null ? `%${num(wOf(p)!, 1)}` : '—'}
                    </td>
                    <td className="px-3 py-3 hidden lg:table-cell whitespace-nowrap" style={{ color: 'var(--muted)' }}>
                      {p.opened_at ? dateStr(p.opened_at) : '—'}
                    </td>
                    <td className="px-4 sm:px-5 py-3 hidden lg:table-cell whitespace-nowrap" style={{ color: 'var(--muted)' }}>
                      {p.closed_at ? dateStr(p.closed_at) : '—'}
                    </td>
                  </tr>
                  {(isOpen || isClosing) && tx.length === 0 && (
                    <tr className={`tx-row ${isClosing ? 'tx-row-out' : ''}`}>
                      <td colSpan={11} className="px-4 sm:px-5 py-3 text-[11px]" style={{ color: 'var(--faint)' }}>İşlem kaydı yok.</td>
                    </tr>
                  )}
                  {(isOpen || isClosing) && tx.map((t) => {
                    // Ana satırla AYNI sütunlar, aynı hizada — ayrı başlıklı bir mini
                    // tablo yerine tarih, alış/satış tarihi olarak Açılış/Kapanış
                    // sütununa yerleşir (diğer tipler Açılış'ta gösterilir).
                    const dateInOpen = t.type !== 'sell';
                    return (
                      <tr key={t.id} className={`tx-row ${isClosing ? 'tx-row-out' : ''}`}>
                        <td className="px-4 sm:px-5 py-2 text-[12px] font-medium">
                          <div className="flex items-center gap-2">
                            {TX_LABEL[t.type] ?? t.type}
                            <EditTransaction tx={t} locations={locations} />
                          </div>
                        </td>
                        <td className="px-3 py-2 hidden md:table-cell text-[11px]" style={{ color: 'var(--muted)' }}>—</td>
                        <td className="px-3 py-2 hidden md:table-cell text-[11px] tnum" style={{ color: 'var(--muted)' }}>{t.currency}</td>
                        <td className="px-3 py-2 hidden lg:table-cell text-[11px]" style={{ color: 'var(--muted)' }}>{t.location ?? '—'}</td>
                        <td className="text-right px-3 py-2 tnum whitespace-nowrap text-[12px]">
                          {num(t.quantity, Math.abs(t.quantity) < 1 ? 4 : 2)}
                          {t.external_quantity > 0 && (
                            <div className="text-[11px]" style={{ color: 'var(--faint)' }}>{num(t.external_quantity, 2)} emanet</div>
                          )}
                        </td>
                        <td className="text-right px-3 py-2 tnum whitespace-nowrap text-[12px]">
                          {t.unit_price != null ? `${num(t.unit_price, 2)} ${t.currency === 'USD' ? '$' : '₺'}` : '—'}
                        </td>
                        <td className="text-right px-3 py-2 tnum whitespace-nowrap text-[12px]" style={{ color: 'var(--muted)' }}>—</td>
                        <td className="text-right px-3 py-2 tnum hidden sm:table-cell whitespace-nowrap text-[12px]" style={{ color: 'var(--muted)' }}>—</td>
                        <td className="text-right px-3 py-2 tnum hidden sm:table-cell whitespace-nowrap text-[12px]" style={{ color: 'var(--muted)' }}>—</td>
                        <td className="px-3 py-2 hidden lg:table-cell text-[12px] whitespace-nowrap" style={{ color: 'var(--muted)' }}>
                          {dateInOpen ? dateStr(t.executed_at) : '—'}
                        </td>
                        <td className="px-4 sm:px-5 py-2 hidden lg:table-cell text-[12px] whitespace-nowrap" style={{ color: 'var(--muted)' }}>
                          {dateInOpen ? '—' : dateStr(t.executed_at)}
                        </td>
                      </tr>
                    );
                  })}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
