'use client';
import { useMemo, useState, useTransition } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  type TooltipContentProps,
} from 'recharts';
import { saveProjectionScenario } from '@/app/actions';
import type { ProjectionScenario } from '@/lib/data';
import { curSymbol, type Cur } from '@/lib/format';

/**
 * Senaryo renkleri — slot numarasından türer, seçime göre DEĞİŞMEZ.
 * PortfolioChart'taki doğrulanmış paletin ilk beş tonu: birbirine en yakın
 * komşu çift ΔE 8.4, hepsi koyu zeminde ≥3:1. Beş eğri aynı eksende üst üste
 * duracağı için ayrım tek güvencemiz — SIRAYI KARIŞTIRMA.
 */
const SCEN_COLORS = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181'];
const CONTRIB_COLOR = '#8f8f8f';

// Aylık ekleme kaydırıcısı seçilen birimde anlamlı olmalı: ₺10.000 ile $10.000
// aynı şey değil. Adım/üst sınır da birimle birlikte ölçekleniyor.
const MONTHLY: Record<Cur, { max: number; step: number }> = {
  TRY: { max: 100000, step: 1000 },
  USD: { max: 2500, step: 50 },
};

const MAX_MONTHS = 360; // 30 yıl

const yearFmt = new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

// Özet kartı üç sütuna sıkıştığı için orada kısa biçim kullanılıyor.
function durShort(m: number) {
  const y = Math.floor(m / 12);
  const mm = m % 12;
  if (y === 0) return `${mm}a`;
  if (mm === 0) return `${y}y`;
  return `${y}y ${mm}a`;
}

// "40 ay" gibi bir sayı okunmuyor — yıl + ay olarak yazıyoruz.
function durText(m: number) {
  const y = Math.floor(m / 12);
  const mm = m % 12;
  if (y === 0) return `${mm} ay`;
  if (mm === 0) return `${y} yıl`;
  return `${y} yıl ${mm} ay`;
}

/** Bileşik büyüme: her ay önce getiri işler, sonra katkı eklenir. */
function project(current: number, monthlyRate: number, monthly: number, months: number) {
  const r = monthlyRate / 100;
  const v: number[] = new Array(months + 1);
  const c: number[] = new Array(months + 1);
  v[0] = current;
  c[0] = current;
  for (let m = 1; m <= months; m++) {
    v[m] = v[m - 1] * (1 + r) + monthly;
    c[m] = c[m - 1] + monthly;
  }
  return { value: v, contributed: c };
}

type Scen = { slot: number; name: string; rate: number; monthlyTry: number; months: number };
const toScen = (s: ProjectionScenario): Scen => ({
  slot: s.slot, name: s.name, rate: Number(s.monthly_rate),
  monthlyTry: Number(s.monthly_try), months: s.months,
});
const same = (a: Scen, b: Scen) =>
  a.name === b.name && a.rate === b.rate && a.monthlyTry === b.monthlyTry && a.months === b.months;

export default function Projection({ current, cur, rate: fx, scenarios }: {
  current: number; cur: Cur; rate: number; scenarios: ProjectionScenario[];
}) {
  const unit = curSymbol(cur);
  const cfg = MONTHLY[cur];

  // İki kopya: `list` düzenlenen çalışma kopyası, `saved` en son kaydedilen
  // hâli. Farkları "kaydedilmemiş değişiklik var" rozetini besliyor — kullanıcı
  // kaydırıcıyı oynatıp sekme değiştirince ne kaybettiğini bilmeli.
  const [list, setList] = useState<Scen[]>(() => scenarios.map(toScen));
  const [saved, setSaved] = useState<Scen[]>(() => scenarios.map(toScen));
  const [sel, setSel] = useState(scenarios[0]?.slot ?? 1);
  // Görünürlük yalnız istemcide: hangi eğrilerin çizildiği bir varsayım değil,
  // anlık bir bakış tercihi — veritabanına yazmak için fazla uçucu.
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState('');
  // Beş senaryo üst üste çizilince eksen en agresif olanın esiri oluyor:
  // aylık %1 ile %5 arasındaki fark 60 ayda on kata çıkıyor ve düşük eğriler
  // tabana yapışıyor. Logaritmik eksende karşılaştırılan şey ORAN olur —
  // eğriler arasındaki dikey mesafe, büyüme hızı farkını okur.
  const [logScale, setLogScale] = useState(false);

  const cursel = list.find((s) => s.slot === sel) ?? list[0];

  // TL ↔ görüntüleme birimi. Kayıt hep TL; ekranda seçili birim.
  const toView = (tryValue: number) => (cur === 'USD' ? (fx > 0 ? tryValue / fx : 0) : tryValue);
  const toTry = (viewValue: number) => (cur === 'USD' ? viewValue * fx : viewValue);

  const patch = (p: Partial<Scen>) => {
    setMsg('');
    setList((prev) => prev.map((s) => (s.slot === sel ? { ...s, ...p } : s)));
  };

  const visible = list.filter((s) => !hidden.has(s.slot));
  const dirty = cursel && !same(cursel, saved.find((s) => s.slot === cursel.slot)!);

  const { rows, stat } = useMemo(() => {
    // Ortak eksen = görünür senaryoların EN UZUNU. Kısa senaryolar kendi
    // sürelerinden sonra null bırakılır (connectNulls=false), yani eğri
    // uzatılmış gibi görünmez.
    const span = Math.max(1, ...visible.map((s) => s.months), cursel?.months ?? 1);
    const stride = Math.max(1, Math.ceil(span / 36));

    const series = new Map<number, ReturnType<typeof project>>();
    for (const s of list) series.set(s.slot, project(current, s.rate, toView(s.monthlyTry), s.months));

    type Row = { m: number; label: string; anapara: number | null } & Record<string, number | string | null>;
    const pts: Row[] = [];
    for (let m = 0; m <= span; m++) {
      if (m % stride !== 0 && m !== span) continue;
      // Ondalık ayırıcı sayfanın geri kalanıyla aynı olmalı: "1,3y", "1.3y" değil.
      const label = m === 0 ? 'Bugün'
        : span <= 36 ? `${m}a`
        : m % 12 === 0 ? `${m / 12}y`
        : `${yearFmt.format(m / 12)}y`;
      const row = { m, label, anapara: null } as Row;
      for (const s of visible) {
        const p = series.get(s.slot)!;
        row[`s${s.slot}`] = m <= s.months ? Math.round(p.value[m]) : null;
      }
      // "Yatırılan" çizgisi yalnız SEÇİLİ senaryo için: beş anapara çizgisi
      // aynı eksende hiçbir soruyu cevaplamıyor, sadece gürültü.
      if (cursel && m <= cursel.months) {
        row.anapara = Math.round(series.get(cursel.slot)!.contributed[m]);
      }
      pts.push(row);
    }

    const p = cursel ? series.get(cursel.slot)! : null;
    const st = p && cursel
      ? { final: p.value[cursel.months], contributed: p.contributed[cursel.months] }
      : { final: current, contributed: current };
    return { rows: pts, stat: st };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [list, hidden, current, cur, fx, sel]);

  const fmtC = (n: number) => new Intl.NumberFormat('tr-TR', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
  const fmt = (n: number) => new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(n);
  // Aylık oran 0,1 adımlarla değişiyor: ondalık basamağı Türkçe virgülle yaz.
  const pct = (n: number) => new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(n);
  const growth = stat.final - stat.contributed;

  // Log ekseni sıfır ya da negatif değeri çizemez — portföy boşken ve aylık
  // ekleme de sıfırken bütün seri 0'dır. O durumda düğme kapalı kalır.
  const canLog = rows.every((r) =>
    Object.entries(r).every(([k, v]) =>
      k === 'label' || k === 'm' || v == null || Number(v) > 0));

  const colorOf = (slot: number) => SCEN_COLORS[(slot - 1) % SCEN_COLORS.length];

  const toggle = (slot: number) => setHidden((prev) => {
    const next = new Set(prev);
    if (!next.delete(slot)) next.add(slot);
    return next;
  });
  const allOn = list.every((s) => !hidden.has(s.slot));
  const toggleAll = () => setHidden(allOn ? new Set(list.map((s) => s.slot)) : new Set());

  const save = () => {
    if (!cursel) return;
    start(async () => {
      const fd = new FormData();
      fd.set('slot', String(cursel.slot));
      fd.set('name', cursel.name);
      fd.set('monthly_rate', String(cursel.rate));
      fd.set('monthly_try', String(Math.round(cursel.monthlyTry * 100) / 100));
      fd.set('months', String(cursel.months));
      const res = await saveProjectionScenario(fd);
      if (res.ok) {
        setSaved((prev) => prev.map((s) => (s.slot === cursel.slot ? { ...cursel } : s)));
        setMsg('Kaydedildi ✓');
      } else {
        setMsg(res.error || 'Kaydedilemedi');
      }
    });
  };

  if (!cursel) return null;

  return (
    <div className="panel p-3 sm:p-5">
      <div className="flex items-center justify-between gap-2 flex-wrap mb-3">
        <h2 className="t-head font-medium" style={{ color: 'var(--muted)' }}>Büyüme Projeksiyonu</h2>
        <div className="flex items-center gap-2 shrink-0">
          {dirty && (
            <span className="t-micro tnum" style={{ color: 'var(--faint)' }}>kaydedilmemiş</span>
          )}
          <div className="flex gap-1">
            {([false, true] as const).map((v) => (
              <button
                key={String(v)}
                onClick={() => setLogScale(v)}
                disabled={v && !canLog}
                title={v ? 'Logaritmik eksen — eğriler arasındaki oran farkını okur' : 'Doğrusal eksen — mutlak tutarı okur'}
                className={`seg ${logScale === v ? 'seg-on' : ''}`}
              >
                {v ? 'Log' : 'Doğrusal'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Senaryo seçici — tıklanan senaryo aşağıdaki kaydırıcılara bağlanır.
          Renk düğmede de görünüyor ki grafikteki hangi eğrinin düzenlendiği
          ayrıca aranmasın. */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {list.map((s) => {
          const on = s.slot === sel;
          const unsaved = !same(s, saved.find((x) => x.slot === s.slot)!);
          return (
            <button
              key={s.slot}
              onClick={() => { setSel(s.slot); setMsg(''); }}
              aria-pressed={on}
              className={`seg flex items-center gap-1.5 ${on ? 'seg-on' : ''}`}
              style={on ? { color: 'var(--text)' } : undefined}
            >
              <span
                className="inline-block shrink-0 rounded-full"
                style={{ width: 9, height: 9, background: colorOf(s.slot), opacity: hidden.has(s.slot) ? 0.3 : 1 }} />
              {s.name}
              {unsaved && <span style={{ color: 'var(--faint)' }}>•</span>}
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-3 sm:mb-4">
        <Stat label={`${durShort(cursel.months)} sonra`} value={`${fmtC(stat.final)} ${unit}`} tone="text" />
        <Stat label="Yatırılan" value={`${fmtC(stat.contributed)} ${unit}`} tone="muted" />
        <Stat label="Getiri" value={`${fmtC(growth)} ${unit}`} tone="up" />
      </div>

      <div className="w-full h-[200px] sm:h-[240px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ left: 0, right: 6, top: 4, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#232323" />
            <XAxis dataKey="label" tick={{ fontSize: 12.5, fill: '#a8a8a8' }} minTickGap={30} axisLine={false} tickLine={false} />
            <YAxis
              tickFormatter={fmtC} tick={{ fontSize: 12.5, fill: '#a8a8a8' }} width={52}
              axisLine={false} tickLine={false}
              scale={logScale && canLog ? 'log' : 'auto'}
              domain={logScale && canLog ? ['auto', 'auto'] : undefined}
              allowDataOverflow={logScale && canLog} />
            <Tooltip
              cursor={{ stroke: '#3d3d3d', strokeWidth: 1 }}
              content={(props) => (
                <ScenTooltip {...props} fmt={(n) => `${fmt(n)} ${unit}`} />
              )} />

            {/* Anapara en altta — referans çizgisi, veri değil. */}
            <Line
              dataKey="anapara" name="Yatırılan" type="monotone"
              stroke={CONTRIB_COLOR} strokeWidth={1} strokeDasharray="3 3"
              dot={false} isAnimationActive={false} connectNulls={false} />

            {/* Seçili senaryo EN SONDA çizilir: diğerlerinin üstünde kalsın. */}
            {visible.filter((s) => s.slot !== sel).map((s) => (
              <Line
                key={s.slot} dataKey={`s${s.slot}`} name={s.name} type="monotone"
                stroke={colorOf(s.slot)} strokeWidth={1.5} strokeOpacity={0.75}
                dot={false} isAnimationActive={false} connectNulls={false} />
            ))}
            {!hidden.has(sel) && (
              <Line
                dataKey={`s${sel}`} name={cursel.name} type="monotone"
                stroke={colorOf(sel)} strokeWidth={2.75}
                dot={false} isAnimationActive={false} connectNulls={false} />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Lejant — hangi senaryoların üst üste çizildiğini açar/kapatır.
          Grafiğin üstündeki düğme sırası DÜZENLEME seçimi, burası GÖRÜNÜRLÜK;
          ikisi ayrı sorular. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-3">
        <button
          onClick={toggleAll}
          aria-pressed={allOn}
          title={allOn ? 'Hepsini gizle' : 'Hepsini göster'}
          className="flex items-center gap-1.5 t-label leading-none py-0.5 cursor-pointer"
          style={{ color: allOn ? 'var(--text)' : 'var(--muted)' }}
        >
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
        {list.map((s) => {
          const on = !hidden.has(s.slot);
          return (
            <button
              key={s.slot}
              onClick={() => toggle(s.slot)}
              aria-pressed={on}
              title={on ? `${s.name} — gizle` : `${s.name} — göster`}
              className="flex items-center gap-1.5 t-label leading-none py-0.5 cursor-pointer transition-opacity"
              style={{ opacity: on ? 1 : 0.35, color: on ? colorOf(s.slot) : 'var(--muted)' }}
            >
              <span
                className="inline-block shrink-0"
                style={{ width: 14, height: 0, borderTop: `2px solid ${colorOf(s.slot)}`, filter: on ? undefined : 'grayscale(1)' }} />
              <span className={on ? '' : 'line-through'}>{s.name}</span>
            </button>
          );
        })}
      </div>

      {/* Seçili senaryonun varsayımları */}
      <div className="space-y-3 sm:space-y-4 mt-4">
        <div>
          <div className="t-label mb-1.5" style={{ color: 'var(--muted)' }}>Senaryo adı</div>
          <input
            value={cursel.name}
            maxLength={24}
            onChange={(e) => patch({ name: e.target.value })}
            className="field"
            aria-label="Senaryo adı" />
        </div>
        <Slider label="Aylık getiri" value={`%${pct(cursel.rate)}`} min={0} max={20} step={0.1}
          v={cursel.rate} set={(n) => patch({ rate: n })} />
        <Slider label="Aylık ekleme" value={`${fmt(toView(cursel.monthlyTry))} ${unit}`}
          min={0} max={cfg.max} step={cfg.step}
          v={toView(cursel.monthlyTry)} set={(n) => patch({ monthlyTry: toTry(n) })} />
        <Slider label="Süre" value={durText(cursel.months)} min={1} max={MAX_MONTHS} step={1}
          v={cursel.months} set={(n) => patch({ months: n })} />
      </div>

      <div className="flex items-center gap-3 mt-4 flex-wrap">
        <button
          type="button" onClick={save} disabled={pending || !dirty}
          className="btn btn-primary"
        >
          {pending ? 'Kaydediliyor…' : `${cursel.name} kaydet`}
        </button>
        {dirty && (
          <button
            type="button" disabled={pending}
            onClick={() => {
              const base = saved.find((s) => s.slot === sel)!;
              setList((prev) => prev.map((s) => (s.slot === sel ? { ...base } : s)));
              setMsg('');
            }}
            className="btn btn-ghost"
          >
            Geri al
          </button>
        )}
        {msg && <span className="t-body" style={{ color: 'var(--muted)' }}>{msg}</span>}
      </div>

      {cur === 'USD' && (
        <p className="t-micro mt-3" style={{ color: 'var(--faint)' }}>
          Aylık ekleme TL olarak saklanır; burada güncel kurla çevrilip gösteriliyor.
          Dolar cinsinden girdiğin tutar da o kurla TL’ye çevrilerek kaydedilir.
        </p>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: 'text' | 'muted' | 'up' }) {
  const c = tone === 'up' ? 'var(--up)' : tone === 'muted' ? 'var(--muted)' : 'var(--text)';
  return (
    <div>
      <div className="t-label mb-0.5 truncate" style={{ color: 'var(--muted)' }}>{label}</div>
      <div className="t-head font-semibold tnum truncate" style={{ color: c }}>{value}</div>
    </div>
  );
}

function Slider({ label, value, min, max, step, v, set }: {
  label: string; value: string; min: number; max: number; step: number; v: number; set: (n: number) => void;
}) {
  return (
    <div>
      <div className="flex justify-between t-label mb-1.5">
        <span style={{ color: 'var(--muted)' }}>{label}</span>
        <span className="tnum" style={{ color: 'var(--text)' }}>{value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={v}
        onChange={(e) => set(Number(e.target.value))}
        className="w-full" />
    </div>
  );
}

// Beş senaryo + anapara aynı anda görünürken varsayılan tooltip sırasız geliyor;
// büyükten küçüğe dizince "hangisi önde" sorusu tek bakışta cevaplanıyor.
function ScenTooltip({ active, payload, label, fmt }:
  TooltipContentProps & { fmt: (n: number) => string }) {
  if (!active || !payload?.length) return null;
  const items = [...payload]
    .filter((p) => p.value != null)
    .sort((a, b) => Number(b.value) - Number(a.value));
  return (
    <div style={{
      background: '#1c1c1c', borderRadius: 4, fontSize: 14.5, padding: '8px 10px',
      boxShadow: '0 4px 16px rgba(0,0,0,0.5)', minWidth: 150,
    }}>
      <div style={{ color: '#a8a8a8', marginBottom: 4 }}>{label}</div>
      {items.map((p) => (
        <div key={String(p.dataKey)} className="flex items-baseline justify-between gap-3">
          <span className="flex items-center gap-1.5" style={{ color: '#f4f4f4' }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: p.color, display: 'inline-block' }} />
            {p.name}
          </span>
          <span className="tnum" style={{ color: '#f4f4f4' }}>{fmt(Number(p.value))}</span>
        </div>
      ))}
    </div>
  );
}
