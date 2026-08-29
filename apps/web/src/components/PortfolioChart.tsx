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
    <div className="panel p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-medium" style={{ color: 'var(--muted)' }}>Portföy Değeri</h2>
        <div className="flex gap-1">
          {(['TRY', 'USD'] as const).map((c) => (
            <button key={c} onClick={() => setCur(c)}
              className="px-2.5 py-1 rounded-md text-xs tnum"
              style={{ background: cur === c ? 'var(--accent)' : 'var(--panel-2)', color: cur === c ? '#fff' : 'var(--muted)' }}>
              {c}
            </button>
          ))}
        </div>
      </div>
      <div style={{ width: '100%', height: 240 }}>
        <ResponsiveContainer>
          <AreaChart data={rows} margin={{ left: 4, right: 8, top: 4, bottom: 0 }}>
            <defs>
              <linearGradient id="g" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--muted)' }} minTickGap={40} axisLine={false} tickLine={false} />
            <YAxis tickFormatter={fmtY} tick={{ fontSize: 10, fill: 'var(--muted)' }} width={44} axisLine={false} tickLine={false} />
            <Tooltip
              contentStyle={{ background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12 }}
              labelStyle={{ color: 'var(--muted)' }}
              formatter={(v) => {
                const s = new Intl.NumberFormat('tr-TR').format(Math.round(Number(v))) + (cur === 'TRY' ? ' ₺' : ' $');
                return [s, 'Değer'] as [string, string];
              }} />
            <Area type="monotone" dataKey={key} stroke="var(--accent)" strokeWidth={2} fill="url(#g)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="flex gap-1 mt-4">
        {RANGES.map((r) => (
          <a key={r} href={`?range=${r}`}
            className="flex-1 text-center py-1.5 rounded-md text-xs tnum"
            style={{ background: r === range ? 'var(--panel-2)' : 'transparent', color: r === range ? 'var(--text)' : 'var(--muted)', border: '1px solid var(--border)' }}>
            {r === 'TUM' ? 'TÜMÜ' : r}
          </a>
        ))}
      </div>
    </div>
  );
}
