'use client';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer,
  CartesianGrid, ReferenceLine, type TooltipContentProps,
} from 'recharts';
import { useMemo, useState } from 'react';
import type { SeriesPoint, SymPoint } from '@/lib/data';
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
const TOTAL_COLOR = '#f4f4f4';
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
  data, symbols, currency, own, yearly = false,
}: { data: SeriesPoint[]; symbols: string[]; currency: Cur; own: boolean; yearly?: boolean }) {
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
    const pickSym = (v: SymPoint) =>
      own ? (cur === 'TRY' ? v[2] : v[3]) : (cur === 'TRY' ? v[0] : v[1]);
    const pickTotal = (d: SeriesPoint) =>
      own ? (cur === 'TRY' ? d.own_try : d.own_usd) : (cur === 'TRY' ? d.try : d.usd);
    // BİRİM DEĞER = değer / adet, yani varlığın TL (ya da USD) cinsinden fiyatı.
    // "% değişim" görünümünün ölçüsü budur, değerin kendisi değil: 116.000 TL
    // nakde para eklemek değeri %46 artırır ama bu getiri değil, katkıdır.
    // Sahiplikten bağımsız — emanet payı fiyatı değiştirmez, o yüzden hep
    // toplam üzerinden okunur.
    const unitOf = (v: SymPoint | undefined) => {
      if (!v || !(v[4] > 0)) return null;
      const val = cur === 'TRY' ? v[0] : v[1];
      return val > 0 ? val / v[4] : null;
    };

    // Baz = serinin aralıktaki İLK gözlemi. Sonradan alınan bir varlık kendi
    // giriş anından itibaren %0'dan başlar; başlangıcı sıfırsa oran anlamsız.
    const base: Record<string, number> = {};
    // Varlık kırılımı olmayan seride (TÜM = yıl kapanışları) birim değer
    // hesaplanamaz; orada toplamın kendi oranına düşülür.
    const hasBreakdown = data.some((d) => Object.keys(d.s).length > 0);
    // TOPLAM'ın oranı: zincirlenmiş getiri (TWR). Her adımda yalnız FİYAT
    // hareketi ölçülür — adetler bir önceki gözlemde sabitlenir — ve adımlar
    // çarpılarak birikir. Para giriş/çıkışı böylece eğriden tamamen düşer.
    let chain = 1;
    // Etiket biçimini belirleyen şey serinin SÜRESİ değil, iki nokta ARASINDAKİ
    // adımdır. Süreye bakan eski kural 102 saatlik seride saati atıyordu; oysa
    // kova 4,25 saatti, yani günde ~5 gözlem vardı ve beşi de aynı "04 Eyl"
    // etiketini taşıyordu — hangi okumaya bakıldığı ayırt edilemiyordu.
    const tz = 'Europe/Istanbul';
    const spanH = data.length > 1
      ? (new Date(data[data.length - 1].ts).getTime() - new Date(data[0].ts).getTime()) / 3.6e6
      : 0;
    const stepH = data.length > 1 ? spanH / (data.length - 1) : 0;
    const fmt = new Intl.DateTimeFormat('tr-TR',
      spanH < 6 ? { timeZone: tz, hour: '2-digit', minute: '2-digit' }
      // Yıllar boyunca uzanan seride gün/ay etiketi okunmaz; yıl ayırt edicidir.
      : spanH > 24 * 400 ? { timeZone: tz, year: 'numeric', month: 'short' }
      // Günde birden fazla gözlem varsa ayırt edici olan saattir.
      : stepH < 20 ? { timeZone: tz, day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }
      : { timeZone: tz, day: '2-digit', month: 'short' });

    return data.map((d, i) => {
      // x anahtarı SIRA NUMARASI, biçimlenmiş tarih DEĞİL. Etiket metni
      // tekrar edebiliyor (aynı güne düşen gözlemler) ve recharts aynı
      // kategoriyi tek noktaya indirdiği için 25 gözlem 6 noktaya çöküyordu:
      // günün son okumasına hiç ulaşılamıyor, hep daha eski biri seçili
      // kalıyordu. Sıra numarası benzersiz; okunur etiket tickFormatter'da.
      const r: Row = { i, label: fmt.format(new Date(d.ts)) };
      const t = pickTotal(d);
      if (base[TOTAL_KEY] === undefined && t > 0) base[TOTAL_KEY] = t;

      if (mode === 'abs') {
        r[TOTAL_KEY] = t;
      } else if (!hasBreakdown) {
        r[TOTAL_KEY] = base[TOTAL_KEY] ? (t / base[TOTAL_KEY] - 1) * 100 : 0;
      } else {
        const prev = data[i - 1];
        if (prev) {
          // Ağırlık = ÖNCEKİ gözlemdeki değer. Bu adımda alınan/eklenen
          // miktar ağırlığa girmez; getiriyi yalnız o an elde olan taşır.
          let num = 0, den = 0;
          for (const sym of symbols) {
            const u0 = unitOf(prev.s[sym]), u1 = unitOf(d.s[sym]);
            if (u0 == null || u1 == null) continue;
            const w = pickSym(prev.s[sym]);
            if (!(w > 0)) continue;
            num += w * (u1 / u0);
            den += w;
          }
          if (den > 0) chain *= num / den;
        }
        r[TOTAL_KEY] = (chain - 1) * 100;
      }

      for (const sym of symbols) {
        const v = d.s[sym];
        if (!v) { r[sym] = null; continue; }
        if (mode === 'abs') { r[sym] = pickSym(v); continue; }
        const u = unitOf(v);
        if (u == null) { r[sym] = null; continue; }
        if (base[sym] === undefined) base[sym] = u;
        r[sym] = base[sym] ? (u / base[sym] - 1) * 100 : null;
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

  // Eksen ve tooltip metni sıra numarasından okunur.
  const labelOf = (i: number) => String(rows[i]?.label ?? '');

  // 1–3 noktalı seride "monotone" çizgi bir yol üretmiyor: aralık kısa ya da
  // geçmiş henüz kısaysa grafik bomboş görünüyordu. O durumda noktaları çiz.
  const sparse = rows.length <= 3;

  const toggle = (k: string) => setHidden((prev) => {
    const next = new Set(prev);
    if (!next.delete(k)) next.add(k);
    return next;
  });

  // "HEPSİ" — tek tıkla bütün serileri kapatıp boş bir eksene bakmak (ya da
  // hepsini geri açmak) için. Tek tek 12 çizgiyi kapatmak, bir varlığı yalnız
  // görmek isteyen için katlanılmaz bir iş: kapat-hepsini + tek tık aç, iki
  // hamlede aynı yere varıyor.
  const allKeys = [TOTAL_KEY, ...symbols];
  const allOn = allKeys.every((k) => !hidden.has(k));
  // Kısmi seçimde düğme "kapalı" görünür; o hâlde tıklamanın hepsini AÇMASI
  // beklenir. Bu yüzden karar görünen duruma bağlanıyor, gizlenen sayısına değil.
  const toggleAll = () => setHidden(allOn ? new Set(allKeys) : new Set());

  return (
    <div className="panel p-3 sm:p-5">
      <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
        {/* Başlık çıplak: sahiplik ("bana ait") ve seri türü ("yıl kapanışları")
            ekleri kaldırıldı — ikisi de üst bardaki anahtarlardan okunuyor,
            başlıkta tekrar edilince gürültü oluyordu. Yıl kapanışları serisinin
            kendine has kuralları zaten grafiğin altındaki notta. */}
        <h2 className="t-head font-medium" style={{ color: 'var(--muted)' }}>
          Varlık Değişimi
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
            {/* padding.right ŞART: nokta ölçeğinde son gözlem tam çizim
                alanının sağ kenarına oturuyor ve recharts imleç çizim alanının
                DIŞINA çıktığı anda aktif noktayı güncellemeyi bırakıyor
                (combineActiveCartesianProps → isInCartesianRange). Sonuç:
                en sağa gidince bir önceki nokta seçili kalıyor, en güncel
                veriye hiç ulaşılamıyordu. 16px'lik pay son noktaya rahat bir
                yakalama alanı bırakır. */}
            <XAxis
              dataKey="i" type="category" tickFormatter={(v) => labelOf(Number(v))}
              tick={{ fontSize: 12.5, fill: '#a8a8a8' }} minTickGap={56}
              padding={{ right: 16 }} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={fmtY} tick={{ fontSize: 12.5, fill: '#a8a8a8' }} width={52} axisLine={false} tickLine={false} />
            {mode === 'pct' && <ReferenceLine y={0} stroke="#3d3d3d" />}
            <Tooltip
              cursor={{ stroke: '#3d3d3d', strokeWidth: 1 }}
              content={(props) => (
                <ChartTooltip {...props} fmt={fmtV} labelText={labelOf(Number(props.label))} />
              )} />

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

      {mode === 'pct' && !yearly && (
        <p className="t-label mt-2" style={{ color: 'var(--faint)' }}>
          Oranlar birim değer (fiyat) üzerinden — alım, satım ve para eklemesi
          eğriyi bozmaz. TOPLAM, her adımın ağırlıklı getirisinin zinciri.
          Yatırılan tutarı görmek için “Değer”e geç.
        </p>
      )}

      {yearly && (
        <p className="t-label mt-2" style={{ color: 'var(--faint)' }}>
          Elle girilen yıl sonu toplamları + bugünkü değer. Bu yıllarda varlık
          kırılımı yok; emanet ayrımı da uygulanmaz (toplam gösterilir).
        </p>
      )}

      {/* Yatay lejant — tıklayınca ilgili çizgi açılıp kapanır */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-3">
        <button
          onClick={toggleAll}
          aria-pressed={allOn}
          title={allOn ? 'Hepsini gizle' : 'Hepsini göster'}
          className="flex items-center gap-1.5 t-label leading-none py-0.5 cursor-pointer"
          style={{ color: allOn ? 'var(--text)' : 'var(--muted)' }}
        >
          {/* Renk çubuğu yerine kutu: bu bir seri değil, seri anahtarı. */}
          <span
            className="inline-block shrink-0 rounded-[2px]"
            style={{
              width: 11, height: 11,
              background: allOn ? 'var(--text)' : 'transparent',
              boxShadow: `inset 0 0 0 1.5px ${allOn ? 'var(--text)' : 'var(--faint)'}`,
            }} />
          HEPSİ
        </button>
        <span className="shrink-0" style={{ width: 1, height: 12, background: 'var(--panel-3)' }} />
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
      className="flex items-center gap-1.5 t-label leading-none py-0.5 cursor-pointer transition-opacity"
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
function ChartTooltip({ active, payload, labelText, fmt }:
  TooltipContentProps & { fmt: (n: number) => string; labelText: string }) {
  if (!active || !payload?.length) return null;
  const items = [...payload]
    .filter((p) => p.value != null)
    .sort((a, b) => Number(b.value) - Number(a.value));
  const shown = items.slice(0, 8);
  // Yarı saydam ve küçük: kutu grafiğin üstünde duruyor, altındaki çizgileri
  // tamamen örtmesin. Bulanıklık okunurluğu koruyor — saydamlık tek başına
  // metni arkadaki eğrilerle karıştırırdı.
  return (
    <div style={{
      background: 'rgba(24,24,24,0.78)',
      backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 5, fontSize: 12, lineHeight: 1.45, padding: '5px 7px',
      boxShadow: '0 4px 14px rgba(0,0,0,0.4)', minWidth: 112,
    }}>
      <div style={{ color: '#a8a8a8', marginBottom: 3 }}>{labelText}</div>
      {shown.map((p) => (
        <div key={String(p.dataKey)} className="flex items-baseline justify-between gap-2.5">
          <span className="flex items-center gap-1.5" style={{ color: '#f4f4f4' }}>
            <span style={{ width: 7, height: 7, borderRadius: 2, background: p.color, display: 'inline-block' }} />
            {p.name}
          </span>
          <span className="tnum" style={{ color: '#f4f4f4' }}>{fmt(Number(p.value))}</span>
        </div>
      ))}
      {items.length > shown.length && (
        <div style={{ color: '#7d7d7d', marginTop: 3 }}>+{items.length - shown.length} daha</div>
      )}
    </div>
  );
}
