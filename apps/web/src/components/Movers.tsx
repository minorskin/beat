'use client';
import { money, conv, pct, type Cur } from '@/lib/format';
import type { PeriodKey, PeriodMovers, MoverRow } from '@/lib/data';

// Dönem artık üst bardaki tek anahtardan (?range) geliyor; kartların kendi
// seçicisi kaldırıldı. Kısaltmalar aynı dilde: S=saat, G=gün, H=hafta, A=ay.
const BY_RANGE: Record<string, { key: PeriodKey; long: string }> = {
  'S':  { key: 'hour',    long: 'son 1 saat' },
  'G':  { key: 'day',     long: 'son 1 gün' },
  'H':  { key: 'week',    long: 'son 1 hafta' },
  'A':  { key: 'month',   long: 'son 1 ay' },
  '3A': { key: 'quarter', long: 'son 3 ay' },
  '1Y': { key: 'year',    long: 'son 1 yıl' },
};

/**
 * İki kart tek bileşen — sayfadaki 4'lü grid'in iki hücresi olarak yerleşsin
 * diye Fragment döndürüyor.
 */
export default function Movers({ data, range, own, cur, rate }: {
  data: PeriodMovers; range: string; own: boolean; cur: Cur; rate: number;
}) {
  // Geriye düşüş artık SORGUDA: dönem başına ait snapshot yoksa getPeriodMovers
  // elimizdeki en eski gözlemi baz alıyor (bkz. bases/coalesce). Bileşenin
  // döneme göre kısalıp "yeterli geçmiş yok" yazan altyazısı bu yüzden kalktı —
  // hangi dönemin seçili olduğu zaten üst bardaki anahtarda duruyor.
  const meta = BY_RANGE[range] ?? BY_RANGE['A'];
  const rows = data[meta.key];
  // Tutarlar veritabanında TL; görüntüleme birimi USD ise güncel kurla çevrilir.
  const amountOf = (m: MoverRow) => conv(own ? m.own_abs : m.abs, cur, rate);

  const byPct = [...rows].sort((a, b) => b.pct - a.pct);
  const byAmt = [...rows].sort((a, b) => amountOf(b) - amountOf(a));

  const split = (sorted: MoverRow[], sign: (m: MoverRow) => number, n = 3): [MoverRow[], MoverRow[]] =>
    [sorted.filter((m) => sign(m) > 0).slice(0, n), sorted.filter((m) => sign(m) < 0).slice(-n).reverse()];

  const [pctUp, pctDown] = split(byPct, (m) => m.pct);
  const [amtUp, amtDown] = split(byAmt, amountOf);

  return (
    <>
      <Card title="Öne Çıkanlar — Oran" period={meta.long}
        up={pctUp.map((m) => ({ symbol: m.symbol, text: pct(m.pct), positive: m.pct >= 0 }))}
        down={pctDown.map((m) => ({ symbol: m.symbol, text: pct(m.pct), positive: m.pct >= 0 }))}
        empty={rows.length === 0} />
      <Card title="Öne Çıkanlar — Tutar" period={meta.long}
        up={amtUp.map((m) => ({ symbol: m.symbol, text: signed(amountOf(m), cur), positive: amountOf(m) >= 0 }))}
        down={amtDown.map((m) => ({ symbol: m.symbol, text: signed(amountOf(m), cur), positive: amountOf(m) >= 0 }))}
        empty={rows.length === 0} />
    </>
  );
}

const signed = (n: number, c: Cur) => `${n >= 0 ? '+' : ''}${money(n, c)}`;

interface Item { symbol: string; text: string; positive: boolean }

function Card({ title, period, up, down, empty }: {
  title: string; period: string; up: Item[]; down: Item[]; empty: boolean;
}) {
  return (
    <div className="panel p-3 sm:p-4 flex flex-col" title={`${title} · ${period}`}>
      <div className="min-w-0 mb-2">
        <div className="t-label truncate" style={{ color: 'var(--muted)' }}>{title}</div>
      </div>
      {empty ? (
        <div className="t-label flex-1 flex items-center" style={{ color: 'var(--faint)' }}>
          Bu dönem için yeterli geçmiş yok.
        </div>
      ) : (
        <>
          <List label="En çok kazandıran" items={up} />
          <div className="mt-2.5 flex-1"><List label="En çok kaybettiren" items={down} /></div>
        </>
      )}
    </div>
  );
}

function List({ label, items }: { label: string; items: Item[] }) {
  return (
    <>
      <div className="t-micro mb-1 truncate" style={{ color: 'var(--faint)' }}>{label}</div>
      {items.length === 0 ? (
        <div className="t-label" style={{ color: 'var(--faint)' }}>—</div>
      ) : (
        <ol className="space-y-1">
          {items.map((m) => (
            <li key={m.symbol} className="flex items-baseline justify-between gap-2 t-label min-w-0">
              <span className="truncate">{m.symbol}</span>
              <span className="tnum shrink-0" style={{ color: m.positive ? 'var(--up)' : 'var(--down)' }}>{m.text}</span>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}
