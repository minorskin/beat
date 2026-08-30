'use client';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { useState } from 'react';

type Point = { ts: string; try: number; usd: number };
const RANGES = ['1G', '1H', '1A', '1Y', 'TUM'] as const;

export default function PortfolioChart({
  data, range, currency,
}: { data: Point[]; range: string; currency: 'TRY' | 'USD' }) {
  const [cur, setCur] = useState<'TRY' | 'USD'>(currency);
  const key = cur === 'TRY' ? 'try' : 'usd';
  const fmtY = (n: number) =>
    new Intl.NumberFormat('tr-TR', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
  const rows = data.map((d) => ({
    ...d,
    label: new Date(d.ts).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
  }));

  return (
    <div className="panel p-3 sm:p-5">
      <div className="flex items-center justify-between mb-3 sm:mb-4 gap-2">
        <h2 className="text-sm font-medium" style={{ color: 'var(--muted)' }}>Portföy Değeri</h2>
        <div className="flex gap-1 shrink-0">
          {(['TRY', 'USD'] as const).map((c) => (
            <button key={c} onClick={() => setCur(c)} className={`seg tnum ${cur === c ? 'seg-on' : ''}`}>
              {c}
            </button>
          ))}
        </div>
      </div>
      <div className="w-full h-[200px] sm:h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={rows} margin={{ left: 0, right: 4, top: 4, bottom: 0 }}>
            <defs>
              <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#8a8a8a' }} minTickGap={40} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={fmtY} tick={{ fontSize: 10, fill: '#8a8a8a' }} width={42} axisLine={false} tickLine={false} />
            <Tooltip
              cursor={{ stroke: '#3d3d3d', strokeWidth: 1 }}
              contentStyle={{ background: '#1c1c1c', border: 'none', borderRadius: 4, fontSize: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.5)' }}
              labelStyle={{ color: '#8a8a8a' }}
              itemStyle={{ color: '#ededed' }}
              formatter={(v) => {
                const s = new Intl.NumberFormat('tr-TR').format(Math.round(Number(v))) + (cur === 'TRY' ? ' ₺' : ' $');
                return [s, 'Değer'] as [string, string];
              }} />
            <Area type="monotone" dataKey={key} stroke="#3b82f6" strokeWidth={2} fill="url(#g)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="flex gap-1 mt-3 sm:mt-4">
        {RANGES.map((r) => (
          <a key={r} href={`?range=${r}`} className={`seg tnum flex-1 text-center ${r === range ? 'seg-on' : ''}`}>
            {r === 'TUM' ? 'TÜMÜ' : r}
          </a>
        ))}
      </div>
    </div>
  );
}
