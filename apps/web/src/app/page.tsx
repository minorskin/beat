import { getLatestSnapshot, getPositions, getHistory, getInstruments, getLastFetch } from '@/lib/data';
import { tl, usd, num, pct, timeAgo } from '@/lib/format';
import PortfolioChart from '@/components/PortfolioChart';
import AllocationDonut from '@/components/AllocationDonut';
import AddTransaction from '@/components/AddTransaction';
import Projection from '@/components/Projection';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const range = (await searchParams).range ?? '1A';
  const [snap, positions, history, instruments, lastFetch] = await Promise.all([
    getLatestSnapshot(), getPositions(), getHistory(range), getInstruments(), getLastFetch(),
  ]);

  const pnl = snap?.unrealized_pnl_try ?? 0;
  const pnlPct = snap && snap.total_cost_try > 0 ? (pnl / snap.total_cost_try) * 100 : 0;
  const up = pnl >= 0;

  // Donut: ui_group bazında topla
  const byGroup = new Map<string, number>();
  for (const p of positions) byGroup.set(p.ui_group, (byGroup.get(p.ui_group) ?? 0) + p.value_try);
  const alloc = [...byGroup].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

  return (
    <main className="max-w-6xl mx-auto px-4 py-6 sm:py-8">
      {/* Başlık */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Beat</h1>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            {lastFetch ? `Son güncelleme ${timeAgo(lastFetch.finished_at)} · ${lastFetch.status}` : 'Henüz veri yok'}
          </p>
        </div>
        <AddTransaction instruments={instruments} />
      </div>

      {!snap ? (
        <div className="panel p-8 text-center" style={{ color: 'var(--muted)' }}>
          Henüz snapshot yok. İşlem ekleyip motorun çalışmasını bekleyin.
        </div>
      ) : (
        <>
          {/* KPI */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
            <Kpi label="Toplam Değer" value={tl(snap.total_value_try)} sub={usd(snap.total_value_usd)} />
            <Kpi label="Maliyet" value={tl(snap.total_cost_try)} sub="toplam alım" />
            <Kpi label="Kâr / Zarar" value={`${up ? '+' : ''}${tl(pnl)}`} sub={pct(pnlPct)} tone={up ? 'up' : 'down'} />
            <Kpi label="Pozisyon" value={String(positions.length)} sub={`${positions.filter((p) => p.is_stale).length} taşınmış fiyat`} />
          </div>

          {/* Grafik + Donut */}
          <div className="grid lg:grid-cols-3 gap-4 mb-4">
            <div className="lg:col-span-2">
              <PortfolioChart data={history} range={range} currency="TRY" />
            </div>
            <AllocationDonut data={alloc} />
          </div>

          {/* Projeksiyon */}
          <div className="mb-4">
            <Projection current={snap.total_value_try} />
          </div>

          {/* Pozisyon tablosu */}
          <div className="panel overflow-hidden">
            <div className="px-4 sm:px-5 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
              <h2 className="text-sm font-medium" style={{ color: 'var(--muted)' }}>Pozisyonlar</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ color: 'var(--muted)' }} className="text-xs">
                    <th className="text-left font-medium px-4 sm:px-5 py-2.5">Varlık</th>
                    <th className="text-right font-medium px-3 py-2.5">Adet</th>
                    <th className="text-right font-medium px-3 py-2.5">Fiyat</th>
                    <th className="text-right font-medium px-3 py-2.5">Değer (₺)</th>
                    <th className="text-right font-medium px-3 py-2.5 hidden sm:table-cell">K/Z</th>
                    <th className="text-right font-medium px-4 sm:px-5 py-2.5">Ağırlık</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((p) => (
                    <tr key={p.symbol} className="border-t" style={{ borderColor: 'var(--border)' }}>
                      <td className="px-4 sm:px-5 py-3">
                        <div className="font-medium flex items-center gap-2">
                          {p.symbol}
                          {p.is_stale && <span title="Taşınmış fiyat (piyasa kapalı)" className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--muted)' }} />}
                        </div>
                        <div className="text-xs truncate max-w-[160px]" style={{ color: 'var(--muted)' }}>{p.display_name}</div>
                      </td>
                      <td className="text-right px-3 py-3 tnum">{num(p.quantity, p.quantity < 1 ? 4 : 2)}</td>
                      <td className="text-right px-3 py-3 tnum">{num(p.price, 2)} {p.currency === 'USD' ? '$' : '₺'}</td>
                      <td className="text-right px-3 py-3 tnum">{tl(p.value_try)}</td>
                      <td className="text-right px-3 py-3 tnum hidden sm:table-cell" style={{ color: (p.pnl_pct ?? 0) >= 0 ? 'var(--up)' : 'var(--down)' }}>
                        {p.pnl_pct != null ? pct(p.pnl_pct) : '—'}
                      </td>
                      <td className="text-right px-4 sm:px-5 py-3 tnum" style={{ color: 'var(--muted)' }}>%{num(p.weight_pct, 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </main>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'up' | 'down' }) {
  const color = tone === 'up' ? 'var(--up)' : tone === 'down' ? 'var(--down)' : 'var(--text)';
  return (
    <div className="panel p-4">
      <div className="text-xs mb-1" style={{ color: 'var(--muted)' }}>{label}</div>
      <div className="text-lg font-semibold tnum" style={{ color }}>{value}</div>
      {sub && <div className="text-xs mt-0.5 tnum" style={{ color: 'var(--muted)' }}>{sub}</div>}
    </div>
  );
}
