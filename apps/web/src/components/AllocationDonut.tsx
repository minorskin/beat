'use client';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';

type Slice = { name: string; value: number };
// gri tonlu rampa — mavi/renk yok
const COLORS = ['#fafafa', '#cfcfcf', '#a8a8a8', '#8a8a8a', '#6b6b6b', '#525252', '#404040', '#333333'];

export default function AllocationDonut({ data }: { data: Slice[] }) {
  const total = data.reduce((s, d) => s + d.value, 0) || 1;
  return (
    <div className="panel p-3 sm:p-5">
      <h2 className="text-sm font-medium mb-2" style={{ color: 'var(--muted)' }}>Varlık Dağılımı</h2>
      <div className="w-full h-[180px] sm:h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%"
              innerRadius="58%" outerRadius="88%" paddingAngle={2} stroke="none">
              {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip
              contentStyle={{ background: '#1c1c1c', border: 'none', borderRadius: 4, fontSize: 12, boxShadow: '0 4px 16px rgba(0,0,0,0.5)' }}
              labelStyle={{ color: '#8a8a8a' }}
              itemStyle={{ color: '#ededed' }}
              formatter={(v, n) => {
                const s = `${new Intl.NumberFormat('tr-TR').format(Math.round(Number(v)))} ₺  (%${((Number(v) / total) * 100).toFixed(1)})`;
                return [s, String(n)] as [string, string];
              }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 mt-3">
        {data.map((d, i) => (
          <div key={d.name} className="flex items-center gap-2 text-[11px] min-w-0">
            <span className="w-2 h-2 rounded-[2px] shrink-0" style={{ background: COLORS[i % COLORS.length] }} />
            <span className="truncate" style={{ color: 'var(--muted)' }}>{d.name}</span>
            <span className="ml-auto tnum shrink-0" style={{ color: 'var(--text)' }}>%{((d.value / total) * 100).toFixed(1)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
