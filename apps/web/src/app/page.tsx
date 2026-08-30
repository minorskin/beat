import {
  getLatestSnapshot, getPositions, getHistory, getInstruments,
  getLastFetch, getWatchlist, getAssetClasses, getPeriodChanges,
  type Change,
} from '@/lib/data';
import { tl, usd, num, pct, timeAgo } from '@/lib/format';
import PortfolioChart from '@/components/PortfolioChart';
import AllocationDonut from '@/components/AllocationDonut';
import AddTransaction from '@/components/AddTransaction';
import Projection from '@/components/Projection';
import SectionNav from '@/components/SectionNav';
import OwnershipToggle from '@/components/OwnershipToggle';
import Watchlist from '@/components/Watchlist';
import { logout } from './actions';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<{ range?: string; own?: string }> }) {
  const sp = await searchParams;
  const range = sp.range ?? '1A';
  // ?own=1 → emanet (başkası adına tutulan) pay düşülmüş büyüklükler.
  // Sayfadaki her sayı tek bu bayrağa bakar; karışık görünüm olmaz.
  const own = sp.own === '1';

  const [snap, positions, history, instruments, lastFetch, watchlist, classes, changes] = await Promise.all([
    getLatestSnapshot(), getPositions(), getHistory(range), getInstruments(),
    getLastFetch(), getWatchlist(), getAssetClasses(), getPeriodChanges(),
  ]);

  const value = own ? (snap?.own_value_try ?? 0) : (snap?.total_value_try ?? 0);
  const valueUsd = own ? (snap?.own_value_usd ?? 0) : (snap?.total_value_usd ?? 0);
  const cost = own ? (snap?.own_cost_try ?? 0) : (snap?.total_cost_try ?? 0);
  const pnl = own ? (snap?.own_unrealized_pnl_try ?? 0) : (snap?.unrealized_pnl_try ?? 0);
  const pnlPct = cost > 0 ? (pnl / cost) * 100 : 0;
  const up = pnl >= 0;

  // Emanet: toplam ile bana-ait arasındaki fark. Anahtarın ne kadar şey
  // gizlediğini/gösterdiğini kullanıcıya sayıyla söylemek gerekiyor.
  const emanetTry = (snap?.total_value_try ?? 0) - (snap?.own_value_try ?? 0);
  const emanetCount = positions.filter((p) => p.external_quantity > 0).length;

  // "Bana ait" görünümünde payı sıfırlanmış pozisyonlar listede yer tutmasın.
  const rows = own ? positions.filter((p) => p.own_quantity !== 0) : positions;
  const qtyOf = (p: (typeof positions)[number]) => (own ? p.own_quantity : p.quantity);
  const valOf = (p: (typeof positions)[number]) => (own ? p.own_value_try : p.value_try);
  const wOf = (p: (typeof positions)[number]) => (own ? p.own_weight_pct : p.weight_pct);

  // Donut: ui_group bazında topla
  const byGroup = new Map<string, number>();
  for (const p of rows) byGroup.set(p.ui_group, (byGroup.get(p.ui_group) ?? 0) + valOf(p));
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
          <div className="mb-3 sm:mb-4 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-semibold tracking-tight">Dashboard</h2>
              <p className="text-[11px] sm:text-xs truncate" style={{ color: 'var(--muted)' }}>
                {lastFetch ? `Son güncelleme ${timeAgo(lastFetch.finished_at)} · ${lastFetch.status}` : 'Henüz veri yok'}
              </p>
            </div>
            <div className="shrink-0"><OwnershipToggle own={own} /></div>
          </div>

          {emanetTry !== 0 && (
            <p className="text-[11px] mb-3 tnum" style={{ color: 'var(--faint)' }}>
              {own
                ? `${tl(emanetTry)} emanet düşüldü · ${emanetCount} pozisyon`
                : `${tl(emanetTry)}’si emanet (${emanetCount} pozisyon) — “Bana Ait” ile hariç tut`}
            </p>
          )}

          {/* KPI */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 mb-3 sm:mb-4">
            <Kpi label={own ? 'Bana Ait Değer' : 'Toplam Değer'} value={tl(value)} sub={usd(valueUsd)} />
            <Kpi label="Maliyet" value={tl(cost)} sub={own ? 'bana ait alım' : 'toplam alım'} />
            <Kpi label="Kâr / Zarar" value={`${up ? '+' : ''}${tl(pnl)}`} sub={pct(pnlPct)} tone={up ? 'up' : 'down'} />
            <Kpi label="Pozisyon" value={String(rows.length)} sub={`${rows.filter((p) => p.is_stale).length} taşınmış fiyat`} />
          </div>

          {/* Dönemsel değişim */}
          <div className="grid grid-cols-4 gap-2 sm:gap-3 mb-3 sm:mb-4">
            <ChangeCell label="Gün" c={own ? changes.day.own : changes.day.total} />
            <ChangeCell label="Hafta" c={own ? changes.week.own : changes.week.total} />
            <ChangeCell label="Ay" c={own ? changes.month.own : changes.month.total} />
            <ChangeCell label="Başından" c={own ? changes.all.own : changes.all.total} />
          </div>

          {/* Grafik + Donut */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 mb-3 sm:mb-4">
            <div className="lg:col-span-2 min-w-0">
              <PortfolioChart data={history} range={range} currency="TRY" own={own} />
            </div>
            <AllocationDonut data={alloc} />
          </div>

          {/* Projeksiyon */}
          <div>
            <Projection current={value} />
          </div>
          </section>

          {/* Portföy */}
          <section id="portfoy" className="pt-8 sm:pt-10">
          <div className="mb-3 sm:mb-4 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-semibold tracking-tight">Portföy</h2>
              <p className="text-[11px] sm:text-xs" style={{ color: 'var(--muted)' }}>
                {rows.length} pozisyon · {tl(value)}{own && ' · yalnız bana ait'}
              </p>
            </div>
            <div className="shrink-0"><OwnershipToggle own={own} /></div>
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
                  {rows.map((p) => (
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
                      <td className="text-right px-3 py-3 tnum whitespace-nowrap">
                        {num(qtyOf(p), Math.abs(qtyOf(p)) < 1 ? 4 : 2)}
                        {p.external_quantity > 0 && (
                          <div className="text-[11px]" style={{ color: 'var(--faint)' }}>
                            {own
                              ? `${num(p.quantity, p.quantity < 1 ? 4 : 2)} toplam`
                              : `${num(p.external_quantity, p.external_quantity < 1 ? 4 : 2)} emanet`}
                          </div>
                        )}
                      </td>
                      <td className="text-right px-3 py-3 tnum whitespace-nowrap">{num(p.price, 2)} {p.currency === 'USD' ? '$' : '₺'}</td>
                      <td className="text-right px-3 py-3 tnum whitespace-nowrap">{tl(valOf(p))}</td>
                      <td className="text-right px-3 py-3 tnum hidden sm:table-cell whitespace-nowrap" style={{ color: (p.pnl_pct ?? 0) >= 0 ? 'var(--up)' : 'var(--down)' }}>
                        {p.pnl_pct != null ? pct(p.pnl_pct) : '—'}
                      </td>
                      <td className="text-right px-4 sm:px-5 py-3 tnum hidden sm:table-cell whitespace-nowrap" style={{ color: 'var(--muted)' }}>%{num(wOf(p), 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          </section>

          {/* İzleme listesi — henüz sahip olunmayan enstrümanlar */}
          <section id="izleme" className="pt-8 sm:pt-10">
            <div className="mb-3 sm:mb-4">
              <h2 className="text-base sm:text-lg font-semibold tracking-tight">İzleme</h2>
              <p className="text-[11px] sm:text-xs" style={{ color: 'var(--muted)' }}>
                Portföyde olmayan, ileride alınabilecek varlıklar
              </p>
            </div>
            <Watchlist items={watchlist} classes={classes} />
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

// Dönemsel değişim hücresi — baz yoksa (yeterli geçmiş yok) '—'.
function ChangeCell({ label, c }: { label: string; c: Change | null }) {
  const has = c != null && c.pct != null;
  const good = has && (c!.pct as number) >= 0;
  const color = !has ? 'var(--muted)' : good ? 'var(--up)' : 'var(--down)';
  return (
    <div className="panel p-2.5 sm:p-3">
      <div className="text-[11px] mb-0.5 truncate" style={{ color: 'var(--muted)' }}>{label}</div>
      <div className="text-sm sm:text-base font-semibold tnum" style={{ color }}>
        {has ? `${good ? '+' : ''}${num(c!.pct as number, 2)}%` : '—'}
      </div>
      {has && (
        <div className="text-[11px] mt-0.5 tnum truncate" style={{ color: 'var(--muted)' }}>
          {good ? '+' : ''}{tl(c!.abs)}
        </div>
      )}
    </div>
  );
}
