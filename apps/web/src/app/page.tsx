import { getLatestSnapshot, getPositions, getHistory, getInstruments, getLastFetch } from '@/lib/data';
import { tl, usd, num, pct, timeAgo } from '@/lib/format';
import PortfolioChart from '@/components/PortfolioChart';
import AllocationDonut from '@/components/AllocationDonut';
import AddTransaction from '@/components/AddTransaction';
import Projection from '@/components/Projection';
import SectionNav from '@/components/SectionNav';
import { logout } from './actions';

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
    <>
      {/* Sticky üst bar */}
      <div className="appbar">
        <div className="max-w-6xl mx-auto px-3 sm:px-5 lg:px-8 h-14 flex items-center justify-between gap-2">
          <SectionNav />
          <div className="flex items-center gap-2 shrink-0">
            <AddTransaction instruments={instruments} />
            <form action={logout}>
              <button type="submit" className="btn btn-ghost">Çıkış</button>
            </form>
          </div>
        </div>
      </div>

      <main className="max-w-6xl mx-auto px-3 sm:px-5 lg:px-8 pb-8 sm:pb-12">
      {!snap ? (
        <div className="panel p-8 mt-6 text-center text-sm" style={{ color: 'var(--muted)' }}>
          Henüz snapshot yok. İşlem ekleyip motorun çalışmasını bekleyin.
        </div>
      ) : (
        <>
          {/* Dashboard — sayfanın başı */}
          <section id="dashboard" className="pt-4 sm:pt-6">
          <div className="mb-3 sm:mb-4">
            <h2 className="text-base sm:text-lg font-semibold tracking-tight">Dashboard</h2>
            <p className="text-[11px] sm:text-xs truncate" style={{ color: 'var(--muted)' }}>
              {lastFetch ? `Son güncelleme ${timeAgo(lastFetch.finished_at)} · ${lastFetch.status}` : 'Henüz veri yok'}
            </p>
          </div>

          {/* KPI */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 mb-3 sm:mb-4">
            <Kpi label="Toplam Değer" value={tl(snap.total_value_try)} sub={usd(snap.total_value_usd)} />
            <Kpi label="Maliyet" value={tl(snap.total_cost_try)} sub="toplam alım" />
            <Kpi label="Kâr / Zarar" value={`${up ? '+' : ''}${tl(pnl)}`} sub={pct(pnlPct)} tone={up ? 'up' : 'down'} />
            <Kpi label="Pozisyon" value={String(positions.length)} sub={`${positions.filter((p) => p.is_stale).length} taşınmış fiyat`} />
          </div>

          {/* Grafik + Donut */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 mb-3 sm:mb-4">
            <div className="lg:col-span-2 min-w-0">
              <PortfolioChart data={history} range={range} currency="TRY" />
            </div>
            <AllocationDonut data={alloc} />
          </div>

          {/* Projeksiyon */}
          <div>
            <Projection current={snap.total_value_try} />
          </div>
          </section>

          {/* Portföy — sayfanın sonu */}
          <section id="portfoy" className="pt-8 sm:pt-10">
          <div className="mb-3 sm:mb-4">
            <h2 className="text-base sm:text-lg font-semibold tracking-tight">Portföy</h2>
            <p className="text-[11px] sm:text-xs" style={{ color: 'var(--muted)' }}>
              {positions.length} pozisyon · {tl(snap.total_value_try)}
            </p>
          </div>

          {/* Pozisyon tablosu */}
          <div className="panel overflow-hidden">
            <div className="px-4 sm:px-5 pt-4 pb-3">
              <h3 className="text-sm font-medium" style={{ color: 'var(--muted)' }}>Pozisyonlar</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="tbl w-full text-sm min-w-[420px]">
                <thead>
                  <tr style={{ color: 'var(--muted)' }} className="text-[11px] uppercase tracking-wide">
                    <th className="text-left font-medium px-4 sm:px-5 py-2.5">Varlık</th>
                    <th className="text-right font-medium px-3 py-2.5">Adet</th>
                    <th className="text-right font-medium px-3 py-2.5">Fiyat</th>
                    <th className="text-right font-medium px-3 py-2.5">Değer (₺)</th>
                    <th className="text-right font-medium px-3 py-2.5 hidden sm:table-cell">K/Z</th>
                    <th className="text-right font-medium px-4 sm:px-5 py-2.5 hidden sm:table-cell">Ağırlık</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((p) => (
                    <tr key={p.symbol}>
                      <td className="px-4 sm:px-5 py-3">
                        <div className="font-medium flex items-center gap-2">
                          {p.symbol}
                          {p.is_stale && <span title="Taşınmış fiyat (piyasa kapalı)" className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'var(--faint)' }} />}
                        </div>
                        <div className="text-[11px] truncate max-w-[120px] sm:max-w-[180px]" style={{ color: 'var(--muted)' }}>{p.display_name}</div>
                        <div className="text-[11px] tnum mt-0.5 sm:hidden" style={{ color: (p.pnl_pct ?? 0) >= 0 ? 'var(--up)' : 'var(--down)' }}>
                          {p.pnl_pct != null ? pct(p.pnl_pct) : '—'}
                        </div>
                      </td>
                      <td className="text-right px-3 py-3 tnum whitespace-nowrap">{num(p.quantity, p.quantity < 1 ? 4 : 2)}</td>
                      <td className="text-right px-3 py-3 tnum whitespace-nowrap">{num(p.price, 2)} {p.currency === 'USD' ? '$' : '₺'}</td>
                      <td className="text-right px-3 py-3 tnum whitespace-nowrap">{tl(p.value_try)}</td>
                      <td className="text-right px-3 py-3 tnum hidden sm:table-cell whitespace-nowrap" style={{ color: (p.pnl_pct ?? 0) >= 0 ? 'var(--up)' : 'var(--down)' }}>
                        {p.pnl_pct != null ? pct(p.pnl_pct) : '—'}
                      </td>
                      <td className="text-right px-4 sm:px-5 py-3 tnum hidden sm:table-cell whitespace-nowrap" style={{ color: 'var(--muted)' }}>%{num(p.weight_pct, 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          </section>
        </>
      )}
      </main>
    </>
  );
}

function Kpi({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'up' | 'down' }) {
  const color = tone === 'up' ? 'var(--up)' : tone === 'down' ? 'var(--down)' : 'var(--text)';
  return (
    <div className="panel p-3 sm:p-4">
      <div className="text-[11px] mb-1 truncate" style={{ color: 'var(--muted)' }}>{label}</div>
      <div className="text-base sm:text-lg font-semibold tnum truncate" style={{ color }}>{value}</div>
      {sub && <div className="text-[11px] mt-0.5 tnum truncate" style={{ color: 'var(--muted)' }}>{sub}</div>}
    </div>
  );
}
