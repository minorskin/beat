'use client';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

type Slice = { name: string; value: number };
const COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#ec4899', '#14b8a6', '#ef4444', '#64748b'];

export default function AllocationDonut({ data }: { data: Slice[] }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  return (
    <div className="panel p-4 sm:p-5">
      <h2 className="text-sm font-medium mb-2" style={{ color: 'var(--muted)' }}>Varlık Dağılımı</h2>
      <div style={{ width: '100%', height: 200 }}>
        <ResponsiveContainer>
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%"
              innerRadius={55} outerRadius={85} paddingAngle={2} stroke="none">
              {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip
              contentStyle={{ background: 'var(--panel-2)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12 }}
              formatter={(v, n) => {
                const s = `${new Intl.NumberFormat('tr-TR').format(Math.round(Number(v)))} ₺  (%${((Number(v) / total) * 100).toFixed(1)})`;
                return [s, String(n)] as [string, string];
              }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-3">
        {data.map((d, i) => (
          <div key={d.name} className="flex items-center gap-2 text-xs">
            <span className="w-2.5 h-2.5 rounded-sm shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
            <span className="truncate" style={{ color: 'var(--muted)' }}>{d.name}</span>
            <span className="ml-auto tnum" style={{ color: 'var(--text)' }}>%{((d.value / total) * 100).toFixed(1)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
