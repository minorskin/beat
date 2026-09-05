'use client';
import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { money, conv, num, numInt, pct, dateStr, dateTimeStr, curSymbol, type Cur } from '@/lib/format';
import type { AssetClass, DayChange, Position, TxRow, WatchItem } from '@/lib/data';
import EditInstrument from './EditInstrument';
import EditTransaction from './EditTransaction';

const TX_LABEL: Record<string, string> = {
  buy: 'Alış', sell: 'Satış', dividend: 'Temettü', fee: 'Ücret',
  adjustment: 'Adet Düzelt', transfer: 'Emanet Düzelt',
};

const ANIM_MS = 160;
const NO_LOC = '__konumsuz__'; // "konumu girilmemiş" için sentinel — gerçek konum adıyla çakışmaz

type ColKey = 'symbol' | 'class' | 'currency' | 'location' | 'qty' | 'avgCost' | 'price' | 'value' | 'day' | 'pnl' | 'weight' | 'opened' | 'closed';
type FilterKey = 'class' | 'currency' | 'location' | 'weight';
type SortDir = 'asc' | 'desc';
/**
 * Tablonun satırı iki şeyden biri: elde tutulan pozisyon ya da yalnız izlenen
 * enstrüman. İkisi TEK listede yaşar — ayrı bölüm yok — ama izlenen satır
 * hiçbir toplama girmez (bkz. totals: yalnız kind==='pos' sayılır).
 */
type Item =
  | { kind: 'pos'; id: string; p: Position }
  | { kind: 'watch'; id: string; w: WatchItem };

/** Ağırlık sürekli bir sayı — dropdown'da anlamlı olması için kovalara bölünür. */
const WEIGHT_BUCKETS = [
  { id: 'w10', label: '%10 ve üzeri', test: (w: number) => w >= 10 },
  { id: 'w5', label: '%5 – %10', test: (w: number) => w >= 5 && w < 10 },
  { id: 'w1', label: '%1 – %5', test: (w: number) => w >= 1 && w < 5 },
  { id: 'w0', label: '%1 altı', test: (w: number) => w < 1 },
];

// Sunucuda useLayoutEffect uyarı basar; ölçüm işi yalnız tarayıcıda anlamlı.
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

// K/Z rengi: hesaplanamayan satır (alış fiyatı yok) yeşil görünmesin — "—"
// yazarken yükseliş rengi kullanmak kâr varmış izlenimi veriyordu.
const pnlColor = (v: number | null) => (v == null ? 'var(--faint)' : v >= 0 ? 'var(--up)' : 'var(--down)');
const dayColor = (d: { pct: number | null } | null) => pnlColor(d?.pct ?? null);

/**
 * Kur riski göstergesi: TL fiyatlı varlık kur karşısında açık pozisyondur
 * (kırmızı), dolar fiyatlı olan korunaklıdır (yeşil). Renk tek başına anlam
 * taşımasın diye kod hem title'da hem ekran okuyucu etiketinde duruyor.
 */
function CurrencyDot({ currency }: { currency: string }) {
  const usd = currency === 'USD';
  return (
    <span
      title={usd ? `${currency} — kur riski yok` : `${currency} — kur riski var`}
      aria-label={currency}
      className="inline-block w-2 h-2 rounded-full align-middle"
      style={{ background: usd ? 'var(--up)' : 'var(--down)' }}
    />
  );
}

/**
 * İzlenen enstrüman satırı. Pozisyonlarla AYNI listede ve aynı sütun düzeninde
 * durur; ayrımı soluk ton ile Adet sütunundaki "izleniyor" taşır. Adet olmadığı
 * için değer, K/Z ve ağırlık hesaplanmaz — ve hiçbir toplama girmez.
 */
function WatchRow({ wi, d, className, classes, locations }: {
  wi: WatchItem; d: DayChange | null; className: string;
  classes: AssetClass[]; locations: string[];
}) {
  return (
    <tr title={`${wi.symbol} — yalnız izleniyor, hesaba katılmaz`}>
      <td className="px-4 sm:px-5 py-3 w-[1%]">
        <div className="font-medium flex items-center gap-2 whitespace-nowrap" style={{ color: 'var(--muted)' }}>
          {wi.symbol}
          {wi.price == null && <span title="Fiyat bekleniyor — bir sonraki turda gelir" className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'var(--c3)' }} />}
          <EditInstrument
            id={wi.instrument_id} symbol={wi.symbol} displayName={wi.display_name}
            classCode={wi.class_code} currency={wi.currency} price={wi.price}
            taxRate={null} txCount={0} positionLocations={[]}
            classes={classes} locations={locations}
          />
        </div>
        <div className="t-label truncate max-w-[84px] sm:max-w-[104px]" style={{ color: 'var(--faint)' }}>{wi.display_name}</div>
      </td>
      <td className="text-right px-3 py-3 tnum whitespace-nowrap" style={{ color: 'var(--muted)' }}
          title={wi.price != null ? num(wi.price, 4) : undefined}>
        {wi.price != null
          ? `${numInt(wi.price)} ${wi.currency === 'USD' ? '$' : '₺'}`
          : <span style={{ color: 'var(--faint)' }}>bekliyor</span>}
      </td>
      <td className="px-3 py-3 t-label" style={{ color: 'var(--muted)' }}>{className}</td>
      <td className="px-3 py-3 text-center"><CurrencyDot currency={wi.currency} /></td>
      {/* Adet yerine ne olduğunu söyleyen tek kelime: boş satır bozuk veri gibi durur. */}
      <td className="px-3 py-3 t-label" style={{ color: 'var(--faint)' }}>—</td>
      <td className="text-right px-3 py-3 t-label" style={{ color: 'var(--faint)' }}>izleniyor</td>
      <td className="text-right px-3 py-3 t-label" style={{ color: 'var(--faint)' }}>—</td>
      <td className="text-right px-3 py-3 t-label" style={{ color: 'var(--faint)' }}>—</td>
      {/* Günlük oran var (fiyatı çekiliyor); tutar yok, elde adet yok. */}
      <td className="text-right px-3 py-3 tnum whitespace-nowrap" style={{ color: dayColor(d) }}
          title={d ? `Ölçüm başlangıcı ${dateTimeStr(d.since)}` : 'Bugün yeni fiyat gözlemi yok'}>
        {d?.pct != null ? pct(d.pct) : '—'}
      </td>
      <td className="text-right px-3 py-3 t-label" style={{ color: 'var(--faint)' }}>—</td>
      <td className="text-right px-3 py-3 t-label" style={{ color: 'var(--faint)' }}>—</td>
      <td className="px-3 py-3 whitespace-nowrap t-label" style={{ color: 'var(--faint)' }} title="İzlemeye alındığı tarih">
        {dateStr(wi.created_at)}
      </td>
      <td className="px-4 sm:px-5 py-3 t-label" style={{ color: 'var(--faint)' }}>—</td>
    </tr>
  );
}

function FunnelIcon() {
  return (
    <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true" className="shrink-0">
      <path d="M1 2h10L7.2 6.4V11L4.8 9.4V6.4z" fill="currentColor" />
    </svg>
  );
}

export default function PositionsTable({
  rows, own, cur, transactions, locations, classes, dayChanges, watchlist, rate,
}: {
  rows: Position[]; own: boolean; cur: Cur; transactions: Record<string, TxRow[]>;
  locations: string[]; classes: AssetClass[];
  dayChanges: Record<string, DayChange>; watchlist: WatchItem[]; rate: number;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [closingId, setClosingId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<ColKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [filters, setFilters] = useState<Record<FilterKey, string[]>>({
    class: [], currency: [], location: [], weight: [],
  });
  // Dropdown tablo hücresinin içinde kalsa overflow-x-auto onu kırpardı;
  // bu yüzden buton koordinatına sabitlenmiş (position:fixed) olarak çizilir.
  const [menu, setMenu] = useState<FilterKey | null>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const menuRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  // Filtre sonrası sayfa kısalıp kaydırma konumu zıplamasın diye altta tutulan boşluk.
  const [spacer, setSpacer] = useState(0);
  const keepScroll = useRef<number | null>(null);

  // Menü fixed konumlu: sayfa/tablo kaydırılınca ya da başlık yer değiştirince
  // (filtre özeti çubuğu belirdiğinde tablo aşağı iner) butonun altında kalsın.
  const place = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = Math.max(8, Math.min(r.left, window.innerWidth - 190));
    const y = r.bottom + 4;
    setPos((p) => (Math.abs(p.x - x) > 1 || Math.abs(p.y - y) > 1 ? { x, y } : p));
  }, []);

  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      // Huni butonunun kendisini dışarı sayma: yoksa mousedown menüyü kapatır,
      // ardından click onu yeniden açar ve buton hiç kapatmaz.
      if (t.closest('[data-filter-btn]') || menuRef.current?.contains(t)) return;
      setMenu(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
    };
  }, [menu, place]);

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
  // Değer sorguda iki para biriminde birden hesaplanıyor — burada çevirmiyoruz,
  // üst bardaki seçime karşılık gelen kolonu okuyoruz.
  const valOf = (p: Position) =>
    cur === 'USD' ? (own ? p.own_value_usd : p.value_usd) : (own ? p.own_value_try : p.value_try);
  const wOf = (p: Position) => (own ? p.own_weight_pct : p.weight_pct);
  const dayOf = (p: Position) => dayChanges[p.instrument_id] ?? null;
  // Günlük tutar veritabanında TL; görüntüleme birimine çevrilir.
  const dayAmt = (d: DayChange) => conv(own ? d.own_abs_try : d.abs_try, cur, rate);

  // Pozisyonlar ve izlenen enstrümanlar TEK liste. Ayrı bölüm yok: sıralama ve
  // filtre ikisini birlikte gezdiriyor, izlenen satır da kendi fiyatına ya da
  // günlük değişimine göre listenin ortasına oturabiliyor. Ayrımı taşıyan tek
  // şey satırın kendi görünümü (soluk ton + Adet sütununda "izleniyor").
  const classNameOf = (code: string) => classes.find((c) => c.code === code)?.name ?? code;
  const items: Item[] = [
    ...rows.map((p): Item => ({ kind: 'pos', id: p.instrument_id, p })),
    ...watchlist.map((w): Item => ({ kind: 'watch', id: w.instrument_id, w })),
  ];

  const columns: {
    key: ColKey; label: string; align: 'left' | 'right' | 'center'; cls: string;
    filter?: FilterKey; sortVal: (it: Item) => string | number;
  }[] = [
    // w-[1%]: tablo hücresi içeriğine göre daralsın — sütun genişliğini varlık
    // KODU belirlesin, altındaki uzun görünen ad değil (o zaten kırpılıyor).
    { key: 'symbol', label: 'Varlık', align: 'left', cls: 'px-4 sm:px-5 w-[1%]', sortVal: (it) => it.kind === 'pos' ? it.p.symbol : it.w.symbol },
    // Fiyat ve Günlük ikisinde de var — izlenen satır burada gerçekten sıraya girer.
    { key: 'price', label: 'Fiyat', align: 'right', cls: 'px-3', sortVal: (it) => (it.kind === 'pos' ? it.p.price : it.w.price) ?? -Infinity },
    { key: 'class', label: 'Grup', align: 'left', cls: 'px-3', filter: 'class', sortVal: (it) => it.kind === 'pos' ? it.p.class_name : classNameOf(it.w.class_code) },
    { key: 'currency', label: 'Kur Riski', align: 'center', cls: 'px-3', filter: 'currency', sortVal: (it) => it.kind === 'pos' ? it.p.currency : it.w.currency },
    { key: 'location', label: 'Konum', align: 'left', cls: 'px-3', filter: 'location', sortVal: (it) => it.kind === 'pos' ? it.p.locations.join(', ') : '' },
    // Adedi/değeri olmayan izleme satırı sayısal sütunlarda listenin ucuna gider.
    { key: 'qty', label: 'Adet', align: 'right', cls: 'px-3', sortVal: (it) => it.kind === 'pos' ? qtyOf(it.p) : -Infinity },
    // Maliyet, Fiyat'ın hemen SOLUNDA: "birimine ne ödedim → bugün ne ediyor"
    // yan yana okunsun. İkisi de fiyatın kendi para biriminde (avg_cost,
    // v_holdings'te işlemlerin birim fiyatından türer; girilmemişse 0 → "—").
    { key: 'avgCost', label: 'Ort. Maliyet', align: 'right', cls: 'px-3', sortVal: (it) => (it.kind === 'pos' ? it.p.avg_cost : null) ?? -Infinity },
    { key: 'value', label: `Değer (${curSymbol(cur)})`, align: 'right', cls: 'px-3', sortVal: (it) => (it.kind === 'pos' ? valOf(it.p) : null) ?? -Infinity },
    // Günlük = TR saatiyle bugün 00:00'dan bu yana. Kar/Zarar'ın yanında ama
    // ondan bağımsız bir soru: "alışımdan beri" değil, "bugün".
    { key: 'day', label: 'Günlük', align: 'right', cls: 'px-3', sortVal: (it) => dayChanges[it.id]?.pct ?? -Infinity },
    { key: 'pnl', label: 'Kar/Zarar', align: 'right', cls: 'px-3', sortVal: (it) => (it.kind === 'pos' ? it.p.pnl_pct : null) ?? -Infinity },
    { key: 'weight', label: 'Ağırlık', align: 'right', cls: 'px-3', filter: 'weight', sortVal: (it) => (it.kind === 'pos' ? wOf(it.p) : null) ?? -Infinity },
    // İzlenen satırda "açılış" = izlemeye alındığı tarih; ikisi de bir başlangıç.
    { key: 'opened', label: 'Açılış', align: 'left', cls: 'px-3', sortVal: (it) => (it.kind === 'pos' ? it.p.opened_at : it.w.created_at) ?? '' },
    { key: 'closed', label: 'Kapanış', align: 'left', cls: 'px-4 sm:px-5', sortVal: (it) => (it.kind === 'pos' ? it.p.closed_at : null) ?? '' },
  ];

  // Seçenekler her zaman FİLTRESİZ listeden türetilir — bir seçim yapınca
  // diğer seçenekler menüden kaybolmasın.
  const uniq = (xs: string[]) => [...new Set(xs)].sort((a, b) => a.localeCompare(b, 'tr-TR'));
  const options: Record<FilterKey, { id: string; label: string }[]> = {
    class: uniq([...rows.map((p) => p.class_name), ...watchlist.map((w) => classNameOf(w.class_code))]).map((v) => ({ id: v, label: v })),
    currency: uniq([...rows.map((p) => p.currency), ...watchlist.map((w) => w.currency)]).map((v) => ({ id: v, label: v })),
    location: [
      ...uniq(rows.flatMap((p) => p.locations)).map((v) => ({ id: v, label: v })),
      ...(rows.some((p) => p.locations.length === 0) || watchlist.length ? [{ id: NO_LOC, label: 'Konumsuz' }] : []),
    ],
    weight: WEIGHT_BUCKETS.map((b) => ({ id: b.id, label: b.label })),
  };

  const matches = (it: Item, key: FilterKey): boolean => {
    const sel = filters[key];
    if (!sel.length) return true;
    if (key === 'class') {
      return sel.includes(it.kind === 'pos' ? it.p.class_name : classNameOf(it.w.class_code));
    }
    if (key === 'currency') return sel.includes(it.kind === 'pos' ? it.p.currency : it.w.currency);
    if (key === 'location') {
      if (it.kind === 'watch') return sel.includes(NO_LOC); // izlenen enstrümanın konumu olmaz
      return it.p.locations.length ? it.p.locations.some((l) => sel.includes(l)) : sel.includes(NO_LOC);
    }
    // Ağırlık: izlenen satırın ağırlığı yok, o filtre seçiliyken elenir.
    if (it.kind === 'watch') return false;
    const w = wOf(it.p);
    if (w == null) return false;
    return WEIGHT_BUCKETS.some((b) => sel.includes(b.id) && b.test(w));
  };

  const toggleSort = (key: ColKey) => {
    if (sortKey !== key) { setSortKey(key); setSortDir('asc'); }
    else if (sortDir === 'asc') setSortDir('desc');
    else { setSortKey(null); setSortDir('asc'); }
  };

  const toggleOption = (key: FilterKey, id: string) => {
    // Kaydırma konumunu DOM değişmeden ÖNCE al: satırlar silinince tarayıcı
    // scrollTop'u kırpar, sonradan okursak zaten kaymış değeri okuruz.
    keepScroll.current = window.scrollY;
    setFilters((f) => ({
      ...f,
      [key]: f[key].includes(id) ? f[key].filter((v) => v !== id) : [...f[key], id],
    }));
  };

  let displayRows = items.filter((it) => (['class', 'currency', 'location', 'weight'] as FilterKey[]).every((k) => matches(it, k)));

  if (sortKey) {
    const col = columns.find((c) => c.key === sortKey)!;
    displayRows = [...displayRows].sort((a, b) => {
      const av = col.sortVal(a), bv = col.sortVal(b);
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv), 'tr-TR');
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }

  // Toplamlar filtreden GEÇMİŞ satırlara göre: kullanıcı bir grubu süzdüğünde
  // toplam da o grubun toplamı olmalı.
  // Toplamlar YALNIZ pozisyonlardan; izlenen enstrüman hiçbir toplama girmez.
  const posRows = displayRows.filter((it): it is Extract<Item, { kind: 'pos' }> => it.kind === 'pos');
  const totals = (() => {
    let value = 0, weight = 0, pnl = 0, cost = 0, noCost = 0;
    // Günlük: tutarlar toplanabilir. Oran da tutardan TÜRETİLİR — satır
    // oranlarının ortalaması değil: gün başındaki büyüklük = bugünkü değer
    // eksi bugünkü kazanç, oran da ikisinin bölümü. Yalnız günlük ölçüsü olan
    // satırlar paydaya girer, yoksa payda şişer ve oran olduğundan küçük çıkar.
    let dayAbs = 0, dayBase = 0;
    for (const { p } of posRows) {
      value += valOf(p) ?? 0;
      weight += wOf(p) ?? 0;
      const d = dayOf(p);
      if (d) { const a = dayAmt(d); dayAbs += a; dayBase += (valOf(p) ?? 0) - a; }
      // Maliyet SATIRIN KENDİ maliyetinden okunur (cost_try), "değer − K/Z"
      // farkından değil: alış fiyatı girilmemiş satırda K/Z null olduğu için o
      // fark satırın TÜM değerini maliyet sanıyordu — payda şişiyor, oran
      // olduğundan küçük çıkıyor ve uyarı hiç görünmüyordu.
      const rowCost = own ? p.own_cost_try : p.cost_try;
      // Maliyeti meçhul satır: sayı üretmek yerine neden hesaplanamadığını söyle.
      if (rowCost == null || rowCost <= 0) {
        if ((valOf(p) ?? 0) > 0) noCost++;
        continue;
      }
      cost += rowCost;
      pnl += (own ? p.own_pnl_try : p.pnl_try) ?? 0;
    }
    return {
      value, weight, pnl, noCost, dayAbs,
      dayPct: dayBase > 0 ? (dayAbs / dayBase) * 100 : null,
      pnlPct: noCost === 0 && cost > 0 ? (pnl / cost) * 100 : null,
    };
  })();

  const activeCount = Object.values(filters).reduce((n, v) => n + v.length, 0);


  // Filtre satır sayısını düşürdüğünde belge kısalır, tarayıcı scrollTop'u
  // kırpar ve sayfa gözle görülür biçimde kayar. İki adımda önlüyoruz:
  // (1) sayfanın altına tam da kırpmayı önleyecek kadar — bir piksel fazlası
  // değil — boşluk bırak, (2) tıklama anında alınan konuma geri dön.
  // Filtre temizlenince ya da satırlar geri gelince boşluk kendiliğinden kalkar.
  useIsoLayoutEffect(() => {
    const want = keepScroll.current;
    if (activeCount === 0) {
      keepScroll.current = null;
      if (spacer !== 0) setSpacer(0);
      return;
    }
    const naturalH = document.documentElement.scrollHeight - spacer;
    const target = want ?? window.scrollY;
    const need = Math.max(0, target + window.innerHeight - naturalH);
    if (Math.abs(need - spacer) > 1) {
      setSpacer(need); // boşluk uygulanınca efekt yeniden koşar, konum orada geri gelir
      return;
    }
    if (want != null) {
      // scroll-behavior:smooth global; geri dönüş anlık olmalı, animasyonlu değil.
      if (Math.abs(window.scrollY - want) > 1) window.scrollTo({ top: want, behavior: 'instant' as ScrollBehavior });
      keepScroll.current = null;
    }
  }, [displayRows.length, activeCount, spacer]);

  // Seçim sonrası tablo yeniden dizilir (özet çubuğu belirir, sütun genişlikleri
  // değişir) — menü açıksa butonun altına yeniden hizala.
  useIsoLayoutEffect(() => {
    if (menu) place();
  }, [menu, place, activeCount, displayRows.length, spacer]);

  return (
    <>
    <div className="panel overflow-hidden">
      {activeCount > 0 && (
        <div className="px-4 sm:px-5 pt-3 flex items-center gap-3 t-label" style={{ color: 'var(--muted)' }}>
          <span>{posRows.length} / {rows.length} pozisyon</span>
          <button
            type="button"
            onClick={() => setFilters({ class: [], currency: [], location: [], weight: [] })}
            className="underline underline-offset-2 hover:opacity-80"
          >
            filtreleri temizle
          </button>
        </div>
      )}
      {/* data-scrolled: sabit sütunun gölgesi yalnız yatayda kayınca çıksın. */}
      <div
        className="overflow-x-auto tbl-scroll"
        onScroll={(e) => {
          const on = e.currentTarget.scrollLeft > 0 ? '1' : '0';
          if (e.currentTarget.dataset.scrolled !== on) e.currentTarget.dataset.scrolled = on;
        }}
      >
        {/* min-w 11 kolonun tamamını sığdırır: dar ekranda kolon GİZLEMEK
            yerine yatay kaydırma bırakıyoruz — mobilde de konum, açılış,
            kapanış gibi sütunlara erişilebilsin. */}
        <table className="tbl w-full t-head min-w-[1260px]">
          <thead>
            <tr style={{ color: 'var(--muted)' }} className="t-label uppercase tracking-wide">
              {columns.map((c) => {
                const on = c.filter ? filters[c.filter].length > 0 : false;
                return (
                  <th key={c.key} className={`font-medium py-2.5 ${c.cls}`} style={{ textAlign: c.align }}>
                    <div className={`flex items-center gap-1.5 ${c.align === 'right' ? 'justify-end' : c.align === 'center' ? 'justify-center' : ''}`}>
                      {c.filter && (
                        <button
                          type="button"
                          data-filter-btn
                          aria-label={`${c.label} filtrele`}
                          aria-expanded={menu === c.filter}
                          title={`${c.label} filtrele`}
                          onClick={(e) => {
                            anchorRef.current = e.currentTarget;
                            setMenu((m) => (m === c.filter ? null : c.filter!));
                          }}
                          className="shrink-0 leading-none"
                          style={{ color: on ? 'var(--text)' : 'inherit', opacity: on ? 1 : 0.4 }}
                        >
                          <FunnelIcon />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => toggleSort(c.key)}
                        title={`${c.label} sırala`}
                        className="inline-flex items-center gap-1 min-w-0"
                      >
                        <span className="truncate">{c.label}</span>
                        <span className="tnum shrink-0 t-strong leading-none" style={{ opacity: sortKey === c.key ? 1 : 0.3 }}>
                          {sortKey === c.key ? (sortDir === 'asc' ? '▲' : '▼') : '▲'}
                        </span>
                      </button>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {/* Toplam satırı — başlıkların hemen altında ve FİLTRELENMİŞ
                listeye göre. Yalnız toplanabilir büyüklükler yazılır: adet ve
                fiyat farklı varlıklarda farklı birim, toplamı anlamsız olurdu.
                K/Z oranı ağırlıklı: toplam K/Z ÷ toplam maliyet. */}
            {posRows.length > 0 && (
              <tr className="tbl-total">
                <td className="px-4 sm:px-5 py-2 t-label font-medium">
                  Toplam
                  <div className="t-label font-normal" style={{ color: 'var(--muted)' }}>
                    {posRows.length} pozisyon
                  </div>
                </td>
                <td className="text-right px-3 py-2 t-label" style={{ color: 'var(--faint)' }}>—</td>
                <td className="px-3 py-2" />
                <td className="px-3 py-2" />
                <td className="px-3 py-2" />
                <td className="text-right px-3 py-2 t-label" style={{ color: 'var(--faint)' }}>—</td>
                <td className="text-right px-3 py-2 t-label" style={{ color: 'var(--faint)' }}>—</td>
                <td className="text-right px-3 py-2 tnum t-body font-medium whitespace-nowrap">
                  {money(totals.value, cur)}
                </td>
                <td className="text-right px-3 py-2 tnum whitespace-nowrap"
                    style={{ color: totals.dayPct == null ? 'var(--faint)' : totals.dayPct >= 0 ? 'var(--up)' : 'var(--down)' }}
                    title="Bugün 00:00'dan (TR) bu yana — toplam kazanç ÷ gün başı büyüklük">
                  {totals.dayPct != null ? (
                    <>
                      <div className="t-body">{pct(totals.dayPct)}</div>
                      <div className="t-label opacity-80">{totals.dayAbs >= 0 ? '+' : ''}{money(totals.dayAbs, cur)}</div>
                    </>
                  ) : '—'}
                </td>
                <td
                  className="text-right px-3 py-2 tnum t-body whitespace-nowrap"
                  style={{ color: totals.pnlPct == null ? 'var(--faint)' : totals.pnlPct >= 0 ? 'var(--up)' : 'var(--down)' }}
                  title={totals.pnlPct == null
                    ? `${totals.noCost} pozisyonda alış fiyatı girilmemiş — toplam oran hesaplanamıyor`
                    : 'Toplam kâr/zarar ÷ toplam maliyet'}
                >
                  {totals.pnlPct != null ? pct(totals.pnlPct) : '—'}
                </td>
                <td className="text-right px-3 py-2 tnum t-body whitespace-nowrap" style={{ color: 'var(--muted)' }}>
                  %{num(totals.weight, 1)}
                </td>
                <td className="px-3 py-2" />
                <td className="px-4 sm:px-5 py-2" />
              </tr>
            )}
            {displayRows.length === 0 && (
              <tr>
                <td colSpan={13} className="px-4 sm:px-5 py-6 text-center t-label" style={{ color: 'var(--faint)' }}>
                  Filtreye uyan kayıt yok.
                </td>
              </tr>
            )}
            {displayRows.map((it) => {
              if (it.kind === 'watch') return <WatchRow key={it.id} wi={it.w} d={dayChanges[it.id] ?? null}
                className={classNameOf(it.w.class_code)} classes={classes} locations={locations} />;
              const p = it.p;
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
                    {/* nowrap hücrede DEĞİL içerikte: hücrede olursa içinde
                        render edilen düzenleme popup'ı da miras alıyor ve
                        dar ekranda metinleri kırpıyor. */}
                    <td className="px-4 sm:px-5 py-3 w-[1%]">
                      <div className="font-medium flex items-center gap-2 whitespace-nowrap">
                        {p.symbol}
                        {p.pending && <span title="Fiyat bekleniyor — bir sonraki turda gelir" className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'var(--c3)' }} />}
                        {!p.pending && p.is_stale && <span title="Taşınmış fiyat (piyasa kapalı)" className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'var(--faint)' }} />}
                        <EditInstrument
                          id={p.instrument_id} symbol={p.symbol} displayName={p.display_name}
                          classCode={p.class_code} currency={p.currency} price={p.price}
                          taxRate={p.tax_rate}
                          txCount={(transactions[p.instrument_id] ?? []).length}
                          positionLocations={p.locations}
                          classes={classes} locations={locations}
                        />
                      </div>
                      {/* Grup/kur ve K/Z'nin mobile özel kopyaları kaldırıldı:
                          o sütunlar artık her ekranda görünüyor, ikinci kez
                          yazmak satırı gereksiz yükseltiyordu. */}
                      <div className="t-label truncate max-w-[84px] sm:max-w-[104px]" style={{ color: 'var(--muted)' }}>{p.display_name}</div>
                    </td>
                    <td className="text-right px-3 py-3 tnum whitespace-nowrap"
                        title={p.price != null ? num(p.price, 4) : undefined}>
                      {p.price != null
                        ? `${numInt(p.price)} ${p.price_currency === 'USD' ? '$' : '₺'}`
                        : <span style={{ color: 'var(--faint)' }}>bekliyor</span>}
                    </td>
                    <td className="px-3 py-3 t-label" style={{ color: 'var(--muted)' }}>{p.class_name}</td>
                    <td className="px-3 py-3 text-center">
                      <CurrencyDot currency={p.currency} />
                    </td>
                    {/* Adet ve fiyat TAM SAYI: kuruş basamağı sütunu uzatıyor,
                        okuyuşa bir şey katmıyordu. numInt yalnız 1'in altındaki
                        değerlerde (0,08 BTC) basamak bırakır; tamı title'da. */}
                    <td className="px-3 py-3 t-label" style={{ color: 'var(--muted)' }}>
                      {p.locations.length ? p.locations.join(', ') : '—'}
                    </td>
                    {/* Alış fiyatı girilmemişse maliyet 0 DEĞİL meçhuldür — sayı
                        uydurmak yerine "—". Kullanıcı işlemi girdikçe dolar. */}
                    <td className="text-right px-3 py-3 tnum whitespace-nowrap" title={num(qtyOf(p), 4)}>
                      {numInt(qtyOf(p))}
                      {p.external_quantity > 0 && (
                        <div className="t-label" style={{ color: 'var(--faint)' }}>
                          {own
                            ? `${numInt(p.quantity)} toplam`
                            : `${numInt(p.external_quantity)} emanet`}
                        </div>
                      )}
                    </td>
                    <td className="text-right px-3 py-3 tnum whitespace-nowrap"
                        title={p.avg_cost && p.avg_cost > 0 ? num(p.avg_cost, 4) : 'Alış fiyatı girilmemiş'}>
                      {p.avg_cost && p.avg_cost > 0
                        ? `${numInt(p.avg_cost)} ${p.price_currency === 'USD' ? '$' : '₺'}`
                        : <span style={{ color: 'var(--faint)' }}>—</span>}
                    </td>
                    <td className="text-right px-3 py-3 tnum whitespace-nowrap">{valOf(p) != null ? money(valOf(p)!, cur) : '—'}</td>
                    {/* Günlük: üstte oran, altında daha küçük puntoyla tutar.
                        Ölçülecek yeni gözlem yoksa (piyasa kapalı, fon NAV'ı
                        gelmemiş) sayı uydurulmaz — "—". */}
                    <td className="text-right px-3 py-3 tnum whitespace-nowrap" style={{ color: dayColor(dayOf(p)) }}
                        title={dayOf(p) ? `Ölçüm başlangıcı ${dateTimeStr(dayOf(p)!.since)}` : 'Bugün yeni fiyat gözlemi yok'}>
                      {dayOf(p)?.pct != null ? (
                        <>
                          <div>{pct(dayOf(p)!.pct!)}</div>
                          <div className="t-label opacity-80">
                            {dayAmt(dayOf(p)!) >= 0 ? '+' : ''}{money(dayAmt(dayOf(p)!), cur)}
                          </div>
                        </>
                      ) : '—'}
                    </td>
                    <td className="text-right px-3 py-3 tnum whitespace-nowrap" style={{ color: pnlColor(p.pnl_pct) }}>
                      {p.pnl_pct != null ? pct(p.pnl_pct) : '—'}
                    </td>
                    <td className="text-right px-3 py-3 tnum whitespace-nowrap" style={{ color: 'var(--muted)' }}>
                      {wOf(p) != null ? `%${num(wOf(p)!, 1)}` : '—'}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap" style={{ color: 'var(--muted)' }}>
                      {p.opened_at ? dateStr(p.opened_at) : '—'}
                    </td>
                    <td className="px-4 sm:px-5 py-3 whitespace-nowrap" style={{ color: 'var(--muted)' }}>
                      {p.closed_at ? dateStr(p.closed_at) : '—'}
                    </td>
                  </tr>
                  {(isOpen || isClosing) && tx.length === 0 && (
                    <tr className={`tx-row ${isClosing ? 'tx-row-out' : ''}`}>
                      <td colSpan={13} className="px-4 sm:px-5 py-3 t-label" style={{ color: 'var(--faint)' }}>İşlem kaydı yok.</td>
                    </tr>
                  )}
                  {(isOpen || isClosing) && tx.map((t) => {
                    // Ana satırla AYNI sütunlar, aynı hizada — ayrı başlıklı bir mini
                    // tablo yerine tarih, alış/satış tarihi olarak Açılış/Kapanış
                    // sütununa yerleşir (diğer tipler Açılış'ta gösterilir).
                    const dateInOpen = t.type !== 'sell';
                    return (
                      <tr key={t.id} className={`tx-row ${isClosing ? 'tx-row-out' : ''}`}>
                        <td className="px-4 sm:px-5 py-2 t-body font-medium">
                          <div className="flex items-center gap-2">
                            {TX_LABEL[t.type] ?? t.type}
                            <EditTransaction tx={t} locations={locations} />
                          </div>
                        </td>
                        <td className="text-right px-3 py-2 tnum whitespace-nowrap t-body" style={{ color: 'var(--muted)' }}>—</td>
                        <td className="px-3 py-2 t-label" style={{ color: 'var(--muted)' }}>—</td>
                        <td className="px-3 py-2 text-center">
                          <CurrencyDot currency={t.currency} />
                        </td>
                        <td className="px-3 py-2 t-label" style={{ color: 'var(--muted)' }}>{t.location ?? '—'}</td>
                        <td className="text-right px-3 py-2 tnum whitespace-nowrap t-body" title={num(t.quantity, 4)}>
                          {numInt(t.quantity)}
                          {t.external_quantity > 0 && (
                            <div className="t-label" style={{ color: 'var(--faint)' }}>{numInt(t.external_quantity)} emanet</div>
                          )}
                        </td>
                        {/* İşlemin kendi fiyatı MALİYET sütununda: üstündeki
                            pozisyon satırının ortalaması tam da bu satırların
                            ağırlıklı ortalaması. Piyasa fiyatı sütunu işlem
                            satırında boş — o an geçerli olan fiyat değil. */}
                        <td className="text-right px-3 py-2 tnum whitespace-nowrap t-body"
                            title={t.unit_price != null ? num(t.unit_price, 4) : undefined}>
                          {t.unit_price != null ? `${numInt(t.unit_price)} ${t.currency === 'USD' ? '$' : '₺'}` : '—'}
                        </td>
                        <td className="text-right px-3 py-2 tnum whitespace-nowrap t-body" style={{ color: 'var(--muted)' }}>—</td>
                        <td className="text-right px-3 py-2 tnum whitespace-nowrap t-body" style={{ color: 'var(--muted)' }}>—</td>
                        <td className="text-right px-3 py-2 tnum whitespace-nowrap t-body" style={{ color: 'var(--muted)' }}>—</td>
                        <td className="text-right px-3 py-2 tnum whitespace-nowrap t-body" style={{ color: 'var(--muted)' }}>—</td>
                        <td className="px-3 py-2 t-body whitespace-nowrap" style={{ color: 'var(--muted)' }}>
                          {dateInOpen ? dateStr(t.executed_at) : '—'}
                        </td>
                        <td className="px-4 sm:px-5 py-2 t-body whitespace-nowrap" style={{ color: 'var(--muted)' }}>
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

      {menu && (
        <div
          ref={menuRef}
          role="menu"
          className="menu fixed z-50 p-1.5 min-w-[170px] max-h-[280px] overflow-y-auto normal-case tracking-normal"
          style={{ left: pos.x, top: pos.y }}
        >
          {options[menu].length === 0 ? (
            <div className="px-2 py-1.5 t-label" style={{ color: 'var(--faint)' }}>Seçenek yok</div>
          ) : (
            <>
              {options[menu].map((o) => {
                const checked = filters[menu].includes(o.id);
                return (
                  <label
                    key={o.id}
                    className="flex items-center gap-2 px-2 py-1.5 t-body cursor-pointer rounded"
                    style={{ background: checked ? 'var(--panel-3)' : undefined }}
                  >
                    <input
                      type="checkbox" checked={checked}
                      onChange={() => toggleOption(menu, o.id)}
                      className="shrink-0"
                    />
                    <span className="truncate">{o.label}</span>
                  </label>
                );
              })}
              {filters[menu].length > 0 && (
                <button
                  type="button"
                  onClick={() => setFilters((f) => ({ ...f, [menu]: [] }))}
                  className="w-full text-left px-2 py-1.5 mt-1 t-label hover:opacity-80"
                  style={{ color: 'var(--muted)' }}
                >
                  Seçimi temizle
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>

    {/* Filtre sonrası belge kısalmasın diye ayrılan boşluk — panelin dışında,
        yoksa panelin kendisi uzar ve boş bir blok gibi görünür. */}
    {spacer > 0 && <div aria-hidden="true" style={{ height: spacer }} />}
    </>
  );
}
