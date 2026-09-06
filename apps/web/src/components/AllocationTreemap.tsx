'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { money, moneyShort, num, type Cur } from '@/lib/format';
import { concLevel, CONC_COLOR, CONC_LABEL, CONC_NOTE } from '@/lib/risk';

// currency = kur riski etiketi (instruments.currency). Varlık tablosundaki
// nokta ile AYNI anlam: USD fiyatlı korunaklı (yeşil), TL fiyatlı kur
// karşısında açık (kırmızı).
export type AllocItem = {
  symbol: string; name: string; group: string; value: number; currency?: string;
  /** Kuyruğun toplandığı sanal kutucuk — tek bir varlık değil, risk noktası taşımaz. */
  agg?: boolean;
};
type Rect = AllocItem & { x: number; y: number; w: number; h: number };

// 20 kutucuktan sonrası okunamayacak kadar küçülüyor — kuyruk "Diğer"de toplanır.
const MAX_TILES = 20;

/**
 * Dikdörtgen dağılım (treemap). ALAN = BÜYÜKLÜK; renk de aynı şeyi söyler —
 * pay büyüdükçe ton parlar. Artış/azalış BİLİNÇLİ OLARAK kodlanmıyor: bu
 * grafiğin sorusu "ne kadarı ne", "bugün ne oldu" değil; yeşil/kırmızı burada
 * yanlış soruyu cevaplardı.
 */
function tone(t: number) {
  // t: 0..1 (paydan türetilmiş). Tek hue (lacivert), koyu → parlak.
  // Alt sınır %18: daha koyusu panel zemininde (#131313) kayboluyor.
  const l = 18 + t * 26;
  const s = 40 + t * 28;
  return `hsl(224 ${s}% ${l}%)`;
}

/**
 * Kutucuk içi risk göstergesi.
 *
 * Geniş kutuda ADIYLA birlikte kendi satırında durur — renk tek başına anlam
 * taşımasın diye. Dar kutuda ad düşer (`label` verilmez): orada iki nokta
 * tutar satırının ucuna dizilir, anlamları kutucuğun detay kartında ve ekran
 * okuyucu etiketinde kalır.
 */
function Dot({ label, color, aria }: { label?: string; color: string; aria: string }) {
  const dot = (
    <span
      aria-label={aria}
      className="inline-block w-2 h-2 rounded-full shrink-0"
      style={{ background: color }} />
  );
  if (!label) return dot;
  return (
    <span className="flex flex-wrap items-center gap-x-1 mt-1 t-micro leading-tight min-w-0">
      <span className="opacity-75">{label}</span>
      {dot}
    </span>
  );
}

// Sıralı listeyi ikiye bölerek yerleştirir; her adımda uzun kenardan kesilir,
// böylece kutular kareye yakın kalır (ince şeritler okunmaz olurdu).
function split(items: AllocItem[], x: number, y: number, w: number, h: number, out: Rect[]) {
  if (items.length === 0) return;
  if (items.length === 1) { out.push({ ...items[0], x, y, w, h }); return; }
  const total = items.reduce((s, i) => s + i.value, 0);
  let run = 0, best = Infinity, at = 1, acc = items[0].value;
  for (let k = 0; k < items.length - 1; k++) {
    run += items[k].value;
    const d = Math.abs(run / total - 0.5);
    if (d < best) { best = d; at = k + 1; acc = run; }
  }
  const f = total > 0 ? acc / total : 0.5;
  if (w >= h) {
    split(items.slice(0, at), x, y, w * f, h, out);
    split(items.slice(at), x + w * f, y, w * (1 - f), h, out);
  } else {
    split(items.slice(0, at), x, y, w, h * f, out);
    split(items.slice(at), x, y + h * f, w, h * (1 - f), out);
  }
}

export default function AllocationTreemap({ data, cur }: { data: AllocItem[]; cur: Cur }) {
  const boxRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  // Dokunmatikte hover yok: `title` balonu telefonda hiç açılmıyor, yani
  // kutucuğun tam adı ve risk gerekçesi orada tamamen erişilemezdi. Tıklama
  // aynı içeriği grafiğin içinde bir karta açar (masaüstünde de çalışır —
  // hover'ın yanında ikinci bir yol olması zarar vermiyor).
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      setSize((p) => (Math.abs(p.w - width) > 1 || Math.abs(p.h - height) > 1 ? { w: width, h: height } : p));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const items = useMemo(() => {
    const sorted = [...data].filter((d) => d.value > 0).sort((a, b) => b.value - a.value);
    if (sorted.length <= MAX_TILES) return sorted;
    const head = sorted.slice(0, MAX_TILES - 1);
    const restVal = sorted.slice(MAX_TILES - 1).reduce((s, d) => s + d.value, 0);
    // "Diğer" birden çok varlığın toplamı — ne tek bir kur riski ne de tek
    // bir yoğunlaşma payı taşır; iki nokta da orada çizilmez.
    return [...head, { symbol: 'Diğer', name: `${sorted.length - head.length} varlık`, group: '—', value: restVal, agg: true }];
  }, [data]);

  const total = items.reduce((s, d) => s + d.value, 0) || 1;

  const rects = useMemo(() => {
    if (!size.w || !size.h || !items.length) return [];
    const out: Rect[] = [];
    split(items, 0, 0, size.w, size.h, out);
    return out;
  }, [items, size.w, size.h]);

  const max = items[0]?.value ?? 1;

  // Seçim, sembolde tutuluyor (dikdörtgende değil): pencere yeniden
  // ölçüldüğünde `rects` baştan üretilir, kart yeni konuma kendiliğinden uyar.
  const sel = rects.find((r) => r.symbol === active);

  // Escape ile kapanmalı — kart grafiğin üstünü kapatıyor.
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setActive(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active]);

  // Grup kırılımı — kutucuklar tek tek varlık; hangi grubun ne kadar tuttuğu
  // altta özetlenir (aynı ton ölçeği, aynı anlam: koyu küçük, parlak büyük).
  const groups = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of data) m.set(d.group, (m.get(d.group) ?? 0) + d.value);
    return [...m].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [data]);
  const gTotal = groups.reduce((s, g) => s + g.value, 0) || 1;

  return (
    <div className="panel p-3 sm:p-5 flex flex-col">
      <h2 className="t-head font-medium mb-2" style={{ color: 'var(--muted)' }}>Varlık Dağılımı</h2>

      {/* Yükseklik grafiğin yanındaki panelin boşluğunu yiyecek kadar arttı:
          kutucuklar büyüdükçe hem hacim farkı gözle okunur oluyor hem de
          içlerine sığan satır sayısı artıyor (pay → tutar → kur → yoğunluk). */}
      <div
        ref={boxRef}
        onClick={(e) => { if (e.target === e.currentTarget) setActive(null); }}
        className="relative w-full h-[300px] sm:h-[380px] overflow-hidden rounded-[var(--r-sm)]">
        {rects.map((r) => {
          const share = (r.value / total) * 100;
          const t = Math.sqrt(r.value / max);
          const big = r.w > 46 && r.h > 30;
          // Karar YALNIZ yüksekliğe bakar. Genişlik de şart koşulunca dar ama
          // uzun kutular (DFI, RITIM) boş yer dururken iki satıra iniyordu;
          // oysa orada beş satır rahat sığıyor. Genişlik artık kısıt değil:
          // sığmayan satır kesilmek yerine SARIYOR, kaç satıra taştığı önemli
          // değil — kutunun boyu bitince overflow zaten kırpıyor.
          const full = r.h > 104;
          // Risk noktalarının ADI yalnız genişlik elverdiğinde yazılır.
          // "Yoğunluk" 12,5px'te ~58px yer ister; dar ama uzun bir kutuda
          // (USDTRY) satır kutunun kenarından taşıp yarıda kesiliyordu.
          // Orada iki nokta yan yana dizilir — anlamları detay kartında.
          const wide = r.w > 86;
          const on = active === r.symbol;
          return (
            <button
              key={r.symbol}
              type="button"
              title={`${r.symbol} — ${r.name}\n${money(r.value, cur)} · %${num(share, 1)}${
                r.currency ? `\nKur: ${r.currency} — ${r.currency === 'USD' ? 'kur riski yok' : 'kur riski var'}` : ''}${
                r.agg ? '' : `\nYoğunluk: ${CONC_LABEL[concLevel(share)]} — ${CONC_NOTE[concLevel(share)]}`}`}
              onClick={() => setActive((p) => (p === r.symbol ? null : r.symbol))}
              // block ŞART: <button> içeriğini varsayılan olarak dikeyde
              // ORTALAR (anonim flex kutusu). Kutucuk metni ortada asılı
              // kalıyordu; blok akışında üstten başlıyor.
              className="absolute block overflow-hidden rounded-[2px] px-1.5 py-1 leading-tight text-left cursor-pointer"
              style={{
                left: r.x + 1, top: r.y + 1,
                width: Math.max(0, r.w - 2), height: Math.max(0, r.h - 2),
                background: tone(t),
                // Lacivertin en parlağı bile koyu kalıyor; yazı hep açık.
                color: 'rgba(233,237,247,0.92)',
                // Seçili kutucuk: kart hangi kutuyu anlattığı belli olsun.
                boxShadow: on ? 'inset 0 0 0 2px rgba(233,237,247,0.85)' : undefined,
              }}
            >
              {/* Kutucuk yüksekliği elverdikçe kademeli açılır: kod → pay →
                  tutar. Tutar kısaltılmış, çünkü kutunun genişliği payın
                  kendisiyle sınırlı; tamı title'da. */}
              {big && (
                <>
                  <span className="block t-label font-medium break-words">{r.symbol}</span>
                  {/* Eşikler lib/risk.ts'te — özet kartındaki "Yoğunluk Riski"
                      rozetiyle ORTAK, ikisi aynı sayıyı okuyor. */}
                  {full ? (
                    <>
                      <span className="block t-micro tnum opacity-90">%{num(share, 1)}</span>
                      <span className="block t-micro tnum break-words opacity-75">{moneyShort(r.value, cur)}</span>
                      <span className={wide ? '' : 'flex items-center gap-1 mt-1.5'}>
                        {r.currency && (
                          <Dot
                            label={wide ? 'Kur' : undefined}
                            color={r.currency === 'USD' ? 'var(--up)' : 'var(--down)'}
                            aria={`${r.currency} — ${r.currency === 'USD' ? 'kur riski yok' : 'kur riski var'}`} />
                        )}
                        {!r.agg && (
                          <Dot
                            label={wide ? 'Yoğunluk' : undefined}
                            color={CONC_COLOR[concLevel(share)]}
                            aria={`Yoğunluk riski ${CONC_LABEL[concLevel(share)]}`} />
                        )}
                      </span>
                    </>
                  ) : r.h > 44 && (
                    <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5 t-micro leading-tight min-w-0">
                      {/* Pay da tutar da HER ZAMAN yazılır — "yüzdesi var ama
                          tutarı yok" kutucuk yarım bilgi demekti. Yan yana
                          sığmazlarsa alt alta geçerler; kaç satır olduğu
                          serbest, kesme yok. */}
                      <span className="tnum shrink-0 opacity-90">%{num(share, 1)}</span>
                      <span className="tnum shrink-0 opacity-75">{moneyShort(r.value, cur)}</span>
                      <span className="flex items-center gap-1 shrink-0 ml-auto">
                        {r.currency && (
                          <Dot
                            color={r.currency === 'USD' ? 'var(--up)' : 'var(--down)'}
                            aria={`${r.currency} — ${r.currency === 'USD' ? 'kur riski yok' : 'kur riski var'}`} />
                        )}
                        {!r.agg && (
                          <Dot
                            color={CONC_COLOR[concLevel(share)]}
                            aria={`Yoğunluk riski ${CONC_LABEL[concLevel(share)]}`} />
                        )}
                      </span>
                    </span>
                  )}
                </>
              )}
            </button>
          );
        })}

        {sel && <Detail r={sel} total={total} cur={cur} boxH={size.h} onClose={() => setActive(null)} />}
      </div>

      {/* Grup kırılımı yalnız PAY taşır — tutarlar kutucukların içinde yazılı,
          burada tekrarlanınca aynı sayı iki yerde duruyordu. Tam tutar title'da. */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-3">
        {groups.map((g) => (
          <div
            key={g.name}
            className="flex items-center gap-2 t-label min-w-0"
            title={`${g.name} — ${money(g.value, cur)} · %${num((g.value / gTotal) * 100, 1)}`}
          >
            <span
              className="w-2 h-2 rounded-[2px] shrink-0"
              style={{ background: tone(Math.sqrt(g.value / (groups[0]?.value || 1))) }} />
            <span className="truncate" style={{ color: 'var(--muted)' }}>{g.name}</span>
            <span className="ml-auto tnum shrink-0" style={{ color: 'var(--text)' }}>%{num((g.value / gTotal) * 100, 1)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Seçili kutucuğun detay kartı — masaüstünde hover'da çıkan `title` balonunun
 * dokunmatik karşılığı. İçeriği bilerek AYNI: tam ad, tutar, pay, kur riski ve
 * yoğunluk gerekçesi. Balon telefonda hiç açılmadığı için bu bilgiler orada
 * yalnızca ekran okuyucuya kalıyordu.
 *
 * Konum: seçilen kutu üst yarıdaysa kart alta, alt yarıdaysa üste oturur —
 * anlattığı kutuyu kendisi örtmesin.
 */
function Detail({ r, total, cur, boxH, onClose }: {
  r: Rect; total: number; cur: Cur; boxH: number; onClose: () => void;
}) {
  const share = (r.value / total) * 100;
  const lvl = concLevel(share);
  const top = r.y + r.h / 2 < boxH / 2;
  return (
    <div
      role="dialog"
      aria-label={`${r.symbol} detayı`}
      className="absolute left-2 right-2 z-10 rounded-[var(--r-sm)] px-3 py-2.5"
      style={{
        [top ? 'bottom' : 'top']: 8,
        // Kart grafiğin ÜSTÜNDE duruyor; yarı saydam zemin + bulanıklık
        // altındaki kutucukları tamamen silmesin (grafikteki imleç kutusuyla
        // aynı reçete).
        background: 'rgba(24,24,24,0.72)',
        backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
        boxShadow: '0 4px 16px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(255,255,255,0.10)',
      }}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0">
          <div className="t-label font-medium" style={{ color: 'var(--text)' }}>{r.symbol}</div>
          <div className="t-micro" style={{ color: 'var(--muted)' }}>{r.name}</div>
        </div>
        <button
          type="button" onClick={onClose} aria-label="Kapat"
          className="ml-auto t-icon leading-none shrink-0 cursor-pointer"
          style={{ color: 'var(--faint)' }}
        >✕</button>
      </div>

      <div className="flex items-baseline gap-2 mt-1.5 t-body tnum" style={{ color: 'var(--text)' }}>
        <span>{money(r.value, cur)}</span>
        <span className="t-label" style={{ color: 'var(--muted)' }}>%{num(share, 1)}</span>
      </div>

      {/* "Diğer" birden çok varlığın toplamı — tek bir kur ya da yoğunluk
          değeri taşımaz, o yüzden bu iki satır orada hiç çizilmez. */}
      {r.currency && (
        <div className="flex items-start gap-1.5 mt-1.5 t-micro leading-snug" style={{ color: 'var(--muted)' }}>
          <span className="flex items-center shrink-0" style={{ height: '1.4em' }}><Dot
            color={r.currency === 'USD' ? 'var(--up)' : 'var(--down)'}
            aria={`${r.currency} — ${r.currency === 'USD' ? 'kur riski yok' : 'kur riski var'}`} /></span>
          <span>Kur: {r.currency} — {r.currency === 'USD' ? 'kur riski yok' : 'kur riski var'}</span>
        </div>
      )}
      {!r.agg && (
        <div className="flex items-start gap-1.5 mt-1 t-micro leading-snug" style={{ color: 'var(--muted)' }}>
          <span className="flex items-center shrink-0" style={{ height: '1.4em' }}>
            <Dot color={CONC_COLOR[lvl]} aria={`Yoğunluk riski ${CONC_LABEL[lvl]}`} />
          </span>
          <span>Yoğunluk: {CONC_LABEL[lvl]} — {CONC_NOTE[lvl]}</span>
        </div>
      )}
    </div>
  );
}
