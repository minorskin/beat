'use client';
import { useMemo, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

export default function Projection({ current }: { current: number }) {
  const [rate, setRate] = useState(30);      // yıllık getiri %
  const [monthly, setMonthly] = useState(10000); // aylık ekleme TL
  const [years, setYears] = useState(5);

  const { data, final, contributed } = useMemo(() => {
    const r = rate / 100 / 12;
    const months = years * 12;
    let v = current;
    const pts: { m: number; label: string; deger: number; anapara: number }[] = [];
    let contrib = current;
    for (let m = 0; m <= months; m++) {
      if (m > 0) { v = v * (1 + r) + monthly; contrib += monthly; }
      if (m % 3 === 0 || m === months) {
        pts.push({ m, label: m === 0 ? 'Bugün' : `${(m / 12).toFixed(1)}y`, deger: Math.round(v), anapara: Math.round(contrib) });
      }
    }
    return { data: pts, final: v, contributed: contrib };
  }, [current, rate, monthly, years]);

  const fmtC = (n: number) => new Intl.NumberFormat('tr-TR', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
  const fmt = (n: number) => new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(n);
  const growth = final - contributed;

  return (
    <div className="panel p-3 sm:p-5">
      <h2 className="text-sm font-medium mb-3 sm:mb-4" style={{ color: 'var(--muted)' }}>Büyüme Projeksiyonu</h2>

      <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-3 sm:mb-4">
        <Stat label={`${years} yıl sonra`} value={`${fmtC(final)} ₺`} tone="text" />
        <Stat label="Yatırılan" value={`${fmtC(contributed)} ₺`} tone="muted" />
        <Stat label="Getiri" value={`${fmtC(growth)} ₺`} tone="up" />
      </div>

      <div className="w-full h-[160px] sm:h-[190px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ left: 0, right: 4, top: 4, bottom: 0 }}>
            <defs>
              <linearGradient id="pg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#4cae63" stopOpacity={0.3} />
                <stop offset="100%" stopColor="#4cae63" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#8a8a8a' }} minTickGap={30} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={fmtC} tick={{ fontSize: 10, fill: '#8a8a8a' }} width={42} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: '#1c1c1c', border: 'none', borderRadius: 4, fontSize: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.5)' }}
              labelStyle={{ color: '#8a8a8a' }}
              itemStyle={{ color: '#ededed' }}
              formatter={(v, n) => [`${fmt(Number(v))} ₺`, n === 'deger' ? 'Değer' : 'Anapara'] as [string, string]} />
            <Area type="monotone" dataKey="anapara" stroke="#6b6b6b" strokeWidth={1} strokeDasharray="3 3" fill="none" />
            <Area type="monotone" dataKey="deger" stroke="#4cae63" strokeWidth={2} fill="url(#pg)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="space-y-3 sm:space-y-4 mt-4">
        <Slider label="Yıllık getiri" value={`%${rate}`} min={0} max={100} step={1} v={rate} set={setRate} />
        <Slider label="Aylık ekleme" value={`${fmt(monthly)} ₺`} min={0} max={100000} step={1000} v={monthly} set={setMonthly} />
        <Slider label="Süre" value={`${years} yıl`} min={1} max={30} step={1} v={years} set={setYears} />
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: 'text' | 'muted' | 'up' }) {
  const c = tone === 'up' ? 'var(--up)' : tone === 'muted' ? 'var(--muted)' : 'var(--text)';
  return (
    <div>
      <div className="text-[11px] mb-0.5 truncate" style={{ color: 'var(--muted)' }}>{label}</div>
      <div className="text-sm font-semibold tnum truncate" style={{ color: c }}>{value}</div>
    </div>
  );
}

function Slider({ label, value, min, max, step, v, set }: {
  label: string; value: string; min: number; max: number; step: number; v: number; set: (n: number) => void;
}) {
  return (
    <div>
      <div className="flex justify-between text-[11px] mb-1.5">
        <span style={{ color: 'var(--muted)' }}>{label}</span>
        <span className="tnum" style={{ color: 'var(--text)' }}>{value}</span>
      </div>
      <input type="range" min={min} max={max} step={step} value={v}
        onChange={(e) => set(Number(e.target.value))}
        className="w-full" />
    </div>
  );
}
