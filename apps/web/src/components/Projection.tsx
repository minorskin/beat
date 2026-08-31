'use client';
import { useMemo, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { curSymbol, type Cur } from '@/lib/format';

// Aylık ekleme kaydırıcısı seçilen birimde anlamlı olmalı: ₺10.000 ile $10.000
// aynı şey değil. Adım/üst sınır da birimle birlikte ölçekleniyor.
const MONTHLY: Record<Cur, { init: number; max: number; step: number }> = {
  TRY: { init: 10000, max: 100000, step: 1000 },
  USD: { init: 250, max: 2500, step: 50 },
};

const MAX_MONTHS = 360; // 30 yıl

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

export default function Projection({ current, cur }: { current: number; cur: Cur }) {
  const unit = curSymbol(cur);
  const cfg = MONTHLY[cur];
  const [rate, setRate] = useState(30);      // yıllık getiri %
  const [monthly, setMonthly] = useState(cfg.init); // aylık ekleme (seçili birim)
  const [months, setMonths] = useState(60);  // süre — ay olarak, tek ay adımlarıyla

  // Birim değişince kaydırıcı değeri de o birime taşınır — yoksa USD'ye
  // geçince "aylık 10.000 $" gibi kazara bir varsayım kalıyor.
  const [lastCur, setLastCur] = useState<Cur>(cur);
  if (lastCur !== cur) { setLastCur(cur); setMonthly(cfg.init); }

  const { data, final, contributed } = useMemo(() => {
    const r = rate / 100 / 12;
    // Süre ay ay ayarlandığı için nokta aralığı da süreye göre seyrelir:
    // kısa vadede her ay, uzun vadede yılda bir işaret.
    const stride = Math.max(1, Math.ceil(months / 36));
    let v = current;
    const pts: { m: number; label: string; deger: number; anapara: number }[] = [];
    let contrib = current;
    for (let m = 0; m <= months; m++) {
      if (m > 0) { v = v * (1 + r) + monthly; contrib += monthly; }
      if (m % stride === 0 || m === months) {
        const label = m === 0 ? 'Bugün'
          : months <= 36 ? `${m}a`
          : m % 12 === 0 ? `${m / 12}y`
          : `${(m / 12).toFixed(1)}y`;
        pts.push({ m, label, deger: Math.round(v), anapara: Math.round(contrib) });
      }
    }
    return { data: pts, final: v, contributed: contrib };
  }, [current, rate, monthly, months]);

  const fmtC = (n: number) => new Intl.NumberFormat('tr-TR', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
  const fmt = (n: number) => new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(n);
  const growth = final - contributed;

  return (
    <div className="panel p-3 sm:p-5">
      <h2 className="text-[15px] font-medium mb-3 sm:mb-4" style={{ color: 'var(--muted)' }}>Büyüme Projeksiyonu</h2>

      <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-3 sm:mb-4">
        <Stat label={`${durShort(months)} sonra`} value={`${fmtC(final)} ${unit}`} tone="text" />
        <Stat label="Yatırılan" value={`${fmtC(contributed)} ${unit}`} tone="muted" />
        <Stat label="Getiri" value={`${fmtC(growth)} ${unit}`} tone="up" />
      </div>

      <div className="w-full h-[160px] sm:h-[190px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ left: 0, right: 4, top: 4, bottom: 0 }}>
            <defs>
              <linearGradient id="pg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22c55e" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#a8a8a8' }} minTickGap={30} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={fmtC} tick={{ fontSize: 11, fill: '#a8a8a8' }} width={48} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: '#1c1c1c', border: 'none', borderRadius: 4, fontSize: 13, boxShadow: '0 4px 16px rgba(0,0,0,0.5)' }}
              labelStyle={{ color: '#a8a8a8' }}
              itemStyle={{ color: '#f4f4f4' }}
              formatter={(v, n) => [`${fmt(Number(v))} ${unit}`, n === 'deger' ? 'Değer' : 'Anapara'] as [string, string]} />
            <Area type="monotone" dataKey="anapara" stroke="#8f8f8f" strokeWidth={1} strokeDasharray="3 3" fill="none" />
            <Area type="monotone" dataKey="deger" stroke="#22c55e" strokeWidth={2} fill="url(#pg)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="space-y-3 sm:space-y-4 mt-4">
        <Slider label="Yıllık getiri" value={`%${rate}`} min={0} max={100} step={1} v={rate} set={setRate} />
        <Slider label="Aylık ekleme" value={`${fmt(monthly)} ${unit}`} min={0} max={cfg.max} step={cfg.step} v={monthly} set={setMonthly} />
        <Slider label="Süre" value={durText(months)} min={1} max={MAX_MONTHS} step={1} v={months} set={setMonths} />
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: 'text' | 'muted' | 'up' }) {
  const c = tone === 'up' ? 'var(--up)' : tone === 'muted' ? 'var(--muted)' : 'var(--text)';
  return (
    <div>
      <div className="text-[12.5px] mb-0.5 truncate" style={{ color: 'var(--muted)' }}>{label}</div>
      <div className="text-[15px] font-semibold tnum truncate" style={{ color: c }}>{value}</div>
    </div>
  );
}

function Slider({ label, value, min, max, step, v, set }: {
  label: string; value: string; min: number; max: number; step: number; v: number; set: (n: number) => void;
}) {
  return (
    <div>
      <div className="flex justify-between text-[12.5px] mb-1.5">
        <span style={{ color: 'var(--muted)' }}>{label}</span>
        <span className="tnum" style={{ color: 'var(--text)' }}>{value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={v}
        onChange={(e) => set(Number(e.target.value))}
        className="w-full" />
    </div>
  );
}
