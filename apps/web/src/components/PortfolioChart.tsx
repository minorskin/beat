'use client';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine, type TooltipContentProps,
} from 'recharts';
import { useMemo, useState } from 'react';
import type { SeriesPoint } from '@/lib/data';
import type { Cur } from '@/lib/format';

/**
 * Kategorik seri renkleri — koyu yüzey (#131313) için seçilmiş 8 ton.
 * Renk körlüğü ayrımı ve yüzey kontrastı doğrulayıcıdan geçirildi:
 * en zayıf komşu çift ΔE 8.4 (hedef ≥8), sekizi de ≥3:1 kontrast.
 * SIRA KOZMETİK DEĞİL — güvenlik mekanizması, karıştırma.
 */
const PALETTE = [
  '#3987e5', '#d95926', '#199e70', '#c98500',
  '#d55181', '#008300', '#9085e9', '#e66767',
];
const TOTAL_COLOR = '#ededed';
const TOTAL_KEY = '__total';

/**
 * 8'den fazla varlıkta yeni ton üretmek yasak (CVD altında ayırt edilemez).
 * Onun yerine bileşik kodlama: aynı ton + kesik çizgi. Lejantta da kesik
 * gösteriliyor, yani ayrım renge tek başına yüklenmiyor.
 */
function styleFor(i: number) {
  return { color: PALETTE[i % PALETTE.length], dashed: i >= PALETTE.length };
}

type Mode = 'pct' | 'abs';
type Row = Record<string, number | string | null>;

export default function PortfolioChart({
  data, symbols, currency, own,
}: { data: SeriesPoint[]; symbols: string[]; currency: Cur; own: boolean }) {
  // Kur seçimi artık üst bardaki genel anahtarda — grafiğin kendi düğmesi
  // kaldırıldı; sayfanın geri kalanıyla farklı birimde durması karışıklıktı.
  const cur = currency;
  // Varsayılan "%": toplam ~₺1,4M iken tek tek varlıklar ₺4bin — aynı eksende
  // mutlak değerle çizilince küçükler düz çizgiye yapışıyor. Çift eksen ise
  // uydurma bir korelasyon yaratır; doğru çözüm ortak baza indekslemek.
  const [mode, setMode] = useState<Mode>('pct');
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const styles = useMemo(
    () => Object.fromEntries(symbols.map((sym, i) => [sym, styleFor(i)])),
    [symbols]);

  const rows: Row[] = useMemo(() => {
    const pickSym = (v: [number, number, number, number]) =>
      own ? (cur === 'TRY' ? v[2] : v[3]) : (cur === 'TRY' ? v[0] : v[1]);
    const pickTotal = (d: SeriesPoint) =>
      own ? (cur === 'TRY' ? d.own_try : d.own_usd) : (cur === 'TRY' ? d.try : d.usd);

    // Baz = serinin aralıktaki İLK gözlemi. Sonradan alınan bir varlık kendi
    // giriş anından itibaren %0'dan başlar; başlangıcı sıfırsa oran anlamsız.
    const base: Record<string, number> = {};
    // Etiket biçimi seçilen aralığa değil, verinin GERÇEK süresine bakar:
    // portföy 18 saatlikken "1Y" seçilince eksende "30 Ağu" on bir kez
    // tekrarlanıyordu — bu aralıkta ayırt edici olan saat, tarih değil.
    const tz = 'Europe/Istanbul';
    const spanH = data.length > 1
      ? (new Date(data[data.length - 1].ts).getTime() - new Date(data[0].ts).getTime()) / 3.6e6
      : 0;
    const fmt = new Intl.DateTimeFormat('tr-TR',
      spanH < 6 ? { timeZone: tz, hour: '2-digit', minute: '2-digit' }
      : spanH < 72 ? { timeZone: tz, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }
      : { timeZone: tz, day: '2-digit', month: 'short' });

    return data.map((d) => {
      const r: Row = { label: fmt.format(new Date(d.ts)) };
      const t = pickTotal(d);
      if (base[TOTAL_KEY] === undefined && t > 0) base[TOTAL_KEY] = t;
      r[TOTAL_KEY] = mode === 'pct'
        ? (base[TOTAL_KEY] ? (t / base[TOTAL_KEY] - 1) * 100 : 0)
        : t;

      for (const sym of symbols) {
        const v = d.s[sym];
        if (!v) { r[sym] = null; continue; }
        const x = pickSym(v);
        if (mode === 'abs') { r[sym] = x; continue; }
        if (base[sym] === undefined && x > 0) base[sym] = x;
        r[sym] = base[sym] ? (x / base[sym] - 1) * 100 : null;
      }
      return r;
    });
  }, [data, symbols, cur, own, mode]);

  const unit = cur === 'TRY' ? '₺' : '$';
  // 2 ondalık: günlük aralıkta oynama %1'in altında kalıyor, 0 ondalıkla
  // bütün etiketler "0%"a yuvarlanıp eksen okunmaz hale geliyordu.
  const fmtY = (n: number) => mode === 'pct'
    ? `${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(n)}%`
    : new Intl.NumberFormat('tr-TR', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
  const fmtV = (n: number) => mode === 'pct'
    ? `${n >= 0 ? '+' : ''}${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 2 }).format(n)}%`
    : `${new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(n)} ${unit}`;

  // 1–3 noktalı seride "monotone" çizgi bir yol üretmiyor: aralık kısa ya da
  // geçmiş henüz kısaysa grafik bomboş görünüyordu. O durumda noktaları çiz.
  const sparse = rows.length <= 3;

  const toggle = (k: string) => setHidden((prev) => {
    const next = new Set(prev);
    if (!next.delete(k)) next.add(k);
    return next;
  });

  return (
    <div className="panel p-3 sm:p-5">
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        <h2 className="text-sm font-medium" style={{ color: 'var(--muted)' }}>
          Varlık Değişimi{own && <span style={{ color: 'var(--faint)' }}> · bana ait</span>}
        </h2>
        <div className="flex gap-2 shrink-0">
          <div className="flex gap-1">
            {(['pct', 'abs'] as const).map((m) => (
              <button key={m} onClick={() => setMode(m)} className={`seg ${mode === m ? 'seg-on' : ''}`}>
                {m === 'pct' ? 'Değişim %' : 'Değer'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="w-full h-[240px] sm:h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ left: 0, right: 6, top: 4, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#232323" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#8a8a8a' }} minTickGap={40} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={fmtY} tick={{ fontSize: 10, fill: '#8a8a8a' }} width={46} axisLine={false} tickLine={false} />
            {mode === 'pct' && <ReferenceLine y={0} stroke="#3d3d3d" />}
            <Tooltip
              cursor={{ stroke: '#3d3d3d', strokeWidth: 1 }}
              content={(props) => <ChartTooltip {...props} fmt={fmtV} />} />

            {symbols.map((sym) => hidden.has(sym) ? null : (
              <Line
                key={sym} dataKey={sym} name={sym} type="monotone"
                stroke={styles[sym].color} strokeWidth={2}
                strokeDasharray={styles[sym].dashed ? '5 3' : undefined}
                dot={sparse ? { r: 3 } : false} isAnimationActive={false} connectNulls={false} />
            ))}
            {/* Toplam en sonda: diğer çizgilerin üstünde kalsın */}
            {!hidden.has(TOTAL_KEY) && (
              <Line
                dataKey={TOTAL_KEY} name="TOPLAM" type="monotone"
                stroke={TOTAL_COLOR} strokeWidth={2.5}
                dot={sparse ? { r: 3.5 } : false} isAnimationActive={false} />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Yatay lejant — tıklayınca ilgili çizgi açılıp kapanır */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-3">
        <LegendChip label="TOPLAM" color={TOTAL_COLOR} on={!hidden.has(TOTAL_KEY)} onClick={() => toggle(TOTAL_KEY)} />
        {symbols.map((sym) => (
          <LegendChip
            key={sym} label={sym} color={styles[sym].color} dashed={styles[sym].dashed}
            on={!hidden.has(sym)} onClick={() => toggle(sym)} />
        ))}
      </div>

    </div>
  );
}

// Etiket de serinin renginde yazılır: gözün yazıyla çizgiyi eşleştirmek için
// önce ince renk çubuğunu bulması gerekmesin.
function LegendChip({ label, color, dashed, on, onClick }: {
  label: string; color: string; dashed?: boolean; on: boolean; onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      title={on ? `${label} — gizle` : `${label} — göster`}
      className="flex items-center gap-1.5 text-[11px] leading-none py-0.5 cursor-pointer transition-opacity"
      style={{ opacity: on ? 1 : 0.35, color: on ? color : 'var(--muted)' }}
    >
      <span
        className="inline-block shrink-0"
        style={{
          width: 14, height: 0,
          borderTop: `2px ${dashed ? 'dashed' : 'solid'} ${color}`,
          filter: on ? undefined : 'grayscale(1)',
        }} />
      <span className={on ? '' : 'line-through'}>{label}</span>
    </button>
  );
}

// Çok serili grafikte varsayılan tooltip okunmaz uzunlukta oluyor:
// büyükten küçüğe sıralayıp ilk 8'i gösteriyoruz.
function ChartTooltip({ active, payload, label, fmt }:
  TooltipContentProps & { fmt: (n: number) => string }) {
  if (!active || !payload?.length) return null;
  const items = [...payload]
    .filter((p) => p.value != null)
    .sort((a, b) => Number(b.value) - Number(a.value));
  const shown = items.slice(0, 8);
  return (
    <div style={{
      background: '#1c1c1c', borderRadius: 4, fontSize: 12, padding: '8px 10px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.5)', minWidth: 140,
    }}>
      <div style={{ color: '#8a8a8a', marginBottom: 4 }}>{label}</div>
      {shown.map((p) => (
        <div key={String(p.dataKey)} className="flex items-baseline justify-between gap-3">
          <span className="flex items-center gap-1.5" style={{ color: '#ededed' }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color, display: 'inline-block' }} />
            {p.name}
          </span>
          <span className="tnum" style={{ color: '#ededed' }}>{fmt(Number(p.value))}</span>
        </div>
      ))}
      {items.length > shown.length && (
        <div style={{ color: '#5c5c5c', marginTop: 4 }}>+{items.length - shown.length} daha</div>
      )}
    </div>
  );
}
