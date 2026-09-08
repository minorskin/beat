/**
 * Ham veriyi (lib/data) sayfanın göstereceği hâle çeviren katman.
 *
 * Buradaki her fonksiyon `book` alır: null ise BRÜT, dolu ise NET üretir. İki
 * mod için iki ayrı kod yolu yazmamak kasıtlı — dönemsel kart ile Varlık
 * tablosu aynı sayıyı iki farklı yerde hesaplarsa er geç ayrışırlar.
 *
 * ── Kesinti neden burada, SQL'de değil ───────────────────────────────────
 * Stopaj enstrümanın KENDİ oranına ve KENDİ maliyetine bağlı, yani "önce topla
 * sonra kes" yanlış sonuç verir: vergisi olan bir varlığın kârı, vergisi
 * olmayan bir varlığın zararıyla toplandığında matrah kaybolur. Bu yüzden
 * toplama işi SQL'den alınıp buraya taşındı; sorgular enstrüman × dönem ham
 * bacak döndürür.
 *
 * ── Geçmişte maliyet yok ─────────────────────────────────────────────────
 * position_snapshots adet ve değer tutar, maliyet TUTMAZ. Geçmiş bir noktanın
 * vergisi için matrah gerektiğinden BUGÜNKÜ ortalama birim maliyet kullanılır
 * (unitCostTry × o günkü adet). Yaklaşık bir sayıdır: araya giren alımlar
 * ortalama maliyeti kaydırmış olabilir.
 */
import { cutOf, hasTax, keepRatio } from './net';
import type {
  Change, DayChange, MoverLeg, MoverRow, PeriodChanges, PeriodKey, PeriodLeg,
  PeriodMovers, Position, SeriesPoint, SymPoint,
} from './data';

export interface BookEntry {
  /** Kâr üzerinden kesilecek stopaj oranı (%). */
  taxRate: number | null;
  /** Ortalama maliyet, TL/birim. Alış fiyatı girilmemişse null (meçhul). */
  unitCostTry: number | null;
}
/** instrument_id → kesinti kuralı. null geçmek "brüt göster" demektir. */
export type Book = Map<string, BookEntry>;

const EMPTY_PERIODS = (): PeriodKey[] => ['hour', 'day', 'week', 'month', 'quarter', 'year'];

/**
 * Kesinti defterini canlı pozisyonlardan kurar.
 *
 * Birim maliyet TL'ye burada çevrilir: avg_cost fiyatın KENDİ para birimindedir
 * (bkz. getPositions), değerler ise TL. İkisi aynı zemine gelmeden çıkarılamaz.
 */
export function buildBook(positions: Position[], rate: number): Book {
  const book: Book = new Map();
  for (const p of positions) {
    // Yönetim ücreti defterde YOK: fon fiyatına zaten yansımış bir kalem,
    // kesinti üretmez (bkz. lib/net.ts). Yalnız stopaj oranı hesaba girer.
    if (!hasTax(p.tax_rate)) continue; // oranı olmayan varlık defterde yer tutmaz
    const fx = p.price_currency === 'USD' ? rate : 1;
    book.set(p.instrument_id, {
      taxRate: p.tax_rate,
      unitCostTry: p.avg_cost != null && p.avg_cost > 0 ? p.avg_cost * fx : null,
    });
  }
  return book;
}

/** Aynı defter, sembol anahtarlı — geçmiş seri enstrüman id'si taşımıyor. */
export function bySymbol(positions: Position[], book: Book): Map<string, BookEntry> {
  const out = new Map<string, BookEntry>();
  for (const p of positions) {
    const e = book.get(p.instrument_id);
    if (e) out.set(p.symbol, e);
  }
  return out;
}

/**
 * Pozisyonların değerini, K/Z'sini ve ağırlığını nete çeker.
 *
 * Fiyat ve ortalama maliyet DOKUNULMADAN kalır: ikisi de fiyat, değer değil —
 * "bir gram altın kaç lira" sorusunun cevabı vergiye göre değişmez. Değer
 * sütununun artık fiyat × adet'e eşit olmaması bunun sonucu; satırın ipucu
 * metni farkı brüt/vergi olarak açıyor (bkz. Position.cut).
 */
export function netPositions(positions: Position[], book: Book): Position[] {
  const out = positions.map((p) => {
    const e = book.get(p.instrument_id);
    if (!e) return p;

    const t = cutOf(p.value_try ?? 0, p.cost_try, e.taxRate);
    const o = cutOf(p.own_value_try ?? 0, p.own_cost_try, e.taxRate);
    const kt = keepRatio(t), ko = keepRatio(o);
    // Oran, adetten bağımsız: değer de maliyet de adetle ölçeklenir, kesinti de.
    // Bu yüzden hangi boyutun payı varsa oradan okunur (tamamı borç verilmiş
    // varlıkta toplam 0'a iner ama "bana ait" durur).
    const base = t.gross > 0 ? t : o;
    const baseCost = t.gross > 0 ? p.cost_try : p.own_cost_try;

    return {
      ...p,
      value_try: p.value_try == null ? null : t.net,
      value_usd: p.value_usd == null ? null : p.value_usd * kt,
      own_value_try: p.own_value_try == null ? null : o.net,
      own_value_usd: p.own_value_usd == null ? null : p.own_value_usd * ko,
      // K/Z net değerden yeniden kurulur: "elde kalacak tutar − ödediğim".
      pnl_try: p.cost_try == null ? null : t.net - p.cost_try,
      own_pnl_try: p.own_cost_try == null ? null : o.net - p.own_cost_try,
      pnl_pct: baseCost != null && baseCost > 0 ? ((base.net - baseCost) / baseCost) * 100 : p.pnl_pct,
      cut: { total: t, own: o },
    };
  });

  // Ağırlık paydası da değişti: kesinti oranı varlıktan varlığa farklı olduğu
  // için brüt ağırlıkları taşımak toplamı %100'den kaydırırdı.
  return reweight(out);
}

function reweight(list: Position[]): Position[] {
  const sum = (f: (p: Position) => number | null) => list.reduce((a, p) => a + (f(p) ?? 0), 0);
  const tTry = sum((p) => p.value_try);
  const tOwn = sum((p) => p.own_value_try);
  return list.map((p) => ({
    ...p,
    weight_pct: tTry > 0 && p.value_try != null ? (p.value_try / tTry) * 100 : p.weight_pct,
    own_weight_pct: tOwn > 0 && p.own_value_try != null ? (p.own_value_try / tOwn) * 100 : p.own_weight_pct,
  }));
}

/**
 * Geçmiş seriyi nete çeker. Toplam satırı sıfırdan toplanmaz, KESİNTİ KADAR
 * azaltılır: snapshot toplamı yetkili sayıdır ve kırılımı eksik olabilir
 * (kataloğdan düşmüş bir enstrüman, fiyatsız kalmış bir satır). Sıfırdan
 * toplamak o farkı sessizce silerdi.
 */
export function netHistory(points: SeriesPoint[], book: Map<string, BookEntry>): SeriesPoint[] {
  if (book.size === 0) return points;
  return points.map((pt) => {
    let dTry = 0, dUsd = 0, dOwnTry = 0, dOwnUsd = 0;
    const s: Record<string, SymPoint> = {};
    for (const [sym, v] of Object.entries(pt.s)) {
      const e = book.get(sym);
      if (!e) { s[sym] = v; continue; }
      const [vt, vu, ot, ou, qty, oqty] = v;
      const ct = cutOf(vt, e.unitCostTry != null ? e.unitCostTry * qty : null, e.taxRate);
      const co = cutOf(ot, e.unitCostTry != null ? e.unitCostTry * oqty : null, e.taxRate);
      const kt = keepRatio(ct), ko = keepRatio(co);
      s[sym] = [ct.net, vu * kt, co.net, ou * ko, qty, oqty];
      dTry += vt - ct.net; dUsd += vu * (1 - kt);
      dOwnTry += ot - co.net; dOwnUsd += ou * (1 - ko);
    }
    return {
      ts: pt.ts,
      try: Math.max(0, pt.try - dTry), usd: Math.max(0, pt.usd - dUsd),
      own_try: Math.max(0, pt.own_try - dOwnTry), own_usd: Math.max(0, pt.own_usd - dOwnUsd),
      s,
    };
  });
}

/**
 * Dönemsel değişim — enstrüman bacaklarından toplanır.
 *
 * Net modda kesinti İKİ UCA DA uygulanır: dönem başındaki net ile bugünkü net
 * arasındaki fark. Brüt farkı tek bir katsayıyla küçültmek yanlış olurdu —
 * vergi yalnız kârdan kesildiği için zararda olan bir dönemde kesinti yoktur.
 */
export function foldChanges(legs: PeriodLeg[], book: Book | null): PeriodChanges {
  const acc = new Map<PeriodKey, { base: number; now: number; baseOwn: number; nowOwn: number; since: string }>();
  for (const l of legs) {
    const a = acc.get(l.period) ?? { base: 0, now: 0, baseOwn: 0, nowOwn: 0, since: l.base_ts };
    const e = book?.get(l.instrument_id);
    if (!e) {
      a.base += l.base_try; a.now += l.now_try;
      a.baseOwn += l.base_own_try; a.nowOwn += l.now_own_try;
    } else {
      const c = e.unitCostTry != null ? e.unitCostTry * l.quantity : null;
      const co = e.unitCostTry != null ? e.unitCostTry * l.own_quantity : null;
      a.base += cutOf(l.base_try, c, e.taxRate).net;
      a.now += cutOf(l.now_try, c, e.taxRate).net;
      a.baseOwn += cutOf(l.base_own_try, co, e.taxRate).net;
      a.nowOwn += cutOf(l.now_own_try, co, e.taxRate).net;
    }
    acc.set(l.period, a);
  }

  const mk = (now: number, base: number, since: string): Change =>
    ({ abs: now - base, pct: base ? ((now - base) / base) * 100 : null, since });
  const out = {} as PeriodChanges;
  for (const k of EMPTY_PERIODS()) {
    const a = acc.get(k);
    out[k] = a ? { total: mk(a.now, a.base, a.since), own: mk(a.nowOwn, a.baseOwn, a.since) }
               : { total: null, own: null };
  }
  return out;
}

/**
 * Öne çıkanlar. Oran BİRİM üzerinden hesaplanır (adet 1): kesinti de değer de
 * adetle ölçeklendiği için oran adetten bağımsızdır, ama adedi 0 olan bir
 * satırda 0/0 çıkardı.
 */
export function foldMovers(legs: MoverLeg[], book: Book | null): PeriodMovers {
  const out = { hour: [], day: [], week: [], month: [], quarter: [], year: [] } as PeriodMovers;
  for (const l of legs) {
    if (l.base_unit == null || l.base_unit === 0) continue;
    const e = book?.get(l.instrument_id);
    let row: MoverRow;
    if (!e) {
      const delta = l.now_unit - l.base_unit;
      row = {
        symbol: l.symbol,
        pct: (delta / l.base_unit) * 100,
        abs: delta * l.quantity,
        own_abs: delta * l.own_quantity,
      };
    } else {
      const netAt = (unit: number, qty: number) =>
        cutOf(unit * qty, e.unitCostTry != null ? e.unitCostTry * qty : null, e.taxRate).net;
      const ub = netAt(l.base_unit, 1), un = netAt(l.now_unit, 1);
      row = {
        symbol: l.symbol,
        pct: ub > 0 ? (un / ub - 1) * 100 : 0,
        abs: netAt(l.now_unit, l.quantity) - netAt(l.base_unit, l.quantity),
        own_abs: netAt(l.now_unit, l.own_quantity) - netAt(l.base_unit, l.own_quantity),
      };
    }
    out[l.period].push(row);
  }
  return out;
}

/**
 * Günlük değişim. `pct_native` DOKUNULMAZ: o, enstrümanın kendi para
 * birimindeki FİYAT hareketi — izlenen referanslar için tek anlamlı ölçü ve
 * fiyatın vergisi olmaz.
 */
export function netDayChanges(
  day: Record<string, DayChange>, book: Book,
): Record<string, DayChange> {
  const out: Record<string, DayChange> = {};
  for (const [id, d] of Object.entries(day)) {
    const e = book.get(id);
    if (!e) { out[id] = d; continue; }
    const netAt = (unit: number, qty: number) =>
      cutOf(unit * qty, e.unitCostTry != null ? e.unitCostTry * qty : null, e.taxRate).net;
    const ub = netAt(d.unit_base_try, 1), un = netAt(d.unit_now_try, 1);
    out[id] = {
      ...d,
      pct: ub > 0 ? (un / ub - 1) * 100 : d.pct,
      abs_try: netAt(d.unit_now_try, d.quantity) - netAt(d.unit_base_try, d.quantity),
      own_abs_try: netAt(d.unit_now_try, d.own_quantity) - netAt(d.unit_base_try, d.own_quantity),
    };
  }
  return out;
}

