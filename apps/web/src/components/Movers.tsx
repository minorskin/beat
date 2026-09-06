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
 * Öne çıkanlar — TEK kart, iki yarı: solda oransal, sağda tutarsal sıralama.
 *
 * Eskiden iki ayrı karttı ve 4'lü grid'in iki hücresini birden yiyordu. İkisi
 * de aynı listeye iki farklı ölçüyle bakıyor; yan yana durunca "yüzdesi büyük
 * ama tutarı küçük" ayrımı tek bakışta okunuyor, üstelik bir hücre serbest
 * kalıyor.
 *
 * Grup başlıkları ("En çok kazandıran") HER İKİ yarıda da tekrar ediyor.
 * Ortak tek başlık daha az mürekkepti ama sağdaki listeye bakan göz başlığı
 * soldan almak zorunda kalıyordu — ayraç tam ortada dururken bu okuma kesiliyor.
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

  const item = (text: (m: MoverRow) => string, positive: (m: MoverRow) => boolean) =>
    (m: MoverRow): Item => ({ symbol: m.symbol, text: text(m), positive: positive(m) });
  const asPct = item((m) => pct(m.pct), (m) => m.pct >= 0);
  const asAmt = item((m) => signed(amountOf(m), cur), (m) => amountOf(m) >= 0);

  return (
    <div className="panel p-3 sm:p-4 flex flex-col" title={`Öne çıkanlar · ${meta.long}`}>
      <div className="flex items-baseline justify-between gap-2 mb-2 min-w-0">
        <div className="t-label truncate" style={{ color: 'var(--muted)' }}>Öne Çıkanlar</div>
        <div className="t-micro shrink-0 tnum" style={{ color: 'var(--faint)' }}>{meta.long}</div>
      </div>

      {rows.length === 0 ? (
        <div className="t-label flex-1 flex items-center" style={{ color: 'var(--faint)' }}>
          Bu dönem için yeterli geçmiş yok.
        </div>
      ) : (
        // Ayraç border DEĞİL: globals.css bütün border'ları kapatıyor. Mutlak
        // konumlu 1px'lik şerit iki yarının tam ortasında, grup başlıklarının
        // altından da kesintisiz geçer.
        <div className="relative flex-1">
          <div className="absolute inset-y-0 left-1/2 w-px" style={{ background: 'var(--panel-3)' }} />
          <div className="grid grid-cols-2 gap-x-3">
            <ColHead>Oran</ColHead>
            <ColHead pad>Tutar</ColHead>

            <GroupHead>En çok kazandıran</GroupHead>
            <GroupHead pad>En çok kazandıran</GroupHead>
            <List items={pctUp.map(asPct)} />
            <List items={amtUp.map(asAmt)} pad />

            <GroupHead spaced>En çok kaybettiren</GroupHead>
            <GroupHead spaced pad>En çok kaybettiren</GroupHead>
            <List items={pctDown.map(asPct)} />
            <List items={amtDown.map(asAmt)} pad />
          </div>
        </div>
      )}
    </div>
  );
}

const signed = (n: number, c: Cur) => `${n >= 0 ? '+' : ''}${money(n, c)}`;

interface Item { symbol: string; text: string; positive: boolean }

// Sağ yarı ayraca yapışmasın diye 0.75rem içeriden başlar.
function ColHead({ children, pad }: { children: React.ReactNode; pad?: boolean }) {
  return (
    <div className={`t-micro truncate mb-1 ${pad ? 'pl-3' : ''}`} style={{ color: 'var(--muted)' }}>
      {children}
    </div>
  );
}

// Her yarının kendi grup başlığı — iki sütun da tek başına okunabilsin.
function GroupHead({ children, spaced, pad }: {
  children: React.ReactNode; spaced?: boolean; pad?: boolean;
}) {
  return (
    <div
      className={`t-micro truncate mb-1 ${spaced ? 'mt-2' : ''} ${pad ? 'pl-3' : ''}`}
      style={{ color: 'var(--faint)' }}
    >
      {children}
    </div>
  );
}

/**
 * Punto burada bilerek bir kademe küçük (t-micro): kart iki yarıda İKİŞER
 * liste taşıyor ve her biri üçe kadar çıkabiliyor. "En çok kaybettiren"
 * tarafı dolduğunda t-label ile 4'lü grid'in hücre yüksekliğine sığmıyordu —
 * kartın kendi yüksekliği komşularına bağlı, tek başına uzayamıyor.
 */
function List({ items, pad }: { items: Item[]; pad?: boolean }) {
  if (items.length === 0) {
    return <div className={`t-micro ${pad ? 'pl-3' : ''}`} style={{ color: 'var(--faint)' }}>—</div>;
  }
  return (
    <ol className={`space-y-0.5 min-w-0 ${pad ? 'pl-3' : ''}`}>
      {items.map((m) => (
        <li key={m.symbol} className="flex items-baseline justify-between gap-1.5 t-micro min-w-0">
          <span className="truncate">{m.symbol}</span>
          <span className="tnum shrink-0 truncate" style={{ color: m.positive ? 'var(--up)' : 'var(--down)' }}>{m.text}</span>
        </li>
      ))}
    </ol>
  );
}
