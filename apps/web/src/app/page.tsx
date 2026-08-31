import {
  getLatestSnapshot, getPositions, getHistory, getInstruments,
  getLastFetch, getAssetClasses, getPeriodChanges, getPeriodMovers,
  getTransactionsByInstrument, getLocations, getUsdTry, getAnnualClosings,
  type Change, type SeriesPoint,
} from '@/lib/data';
import { money, conv, num, pct, timeAgo, type Cur } from '@/lib/format';
import PortfolioChart from '@/components/PortfolioChart';
import AllocationTreemap from '@/components/AllocationTreemap';
import AddTransaction from '@/components/AddTransaction';
import AddInstrument from '@/components/AddInstrument';
import PositionsTable from '@/components/PositionsTable';
import Projection from '@/components/Projection';
import SectionNav from '@/components/SectionNav';
import TabsProvider, { TabPanel } from '@/components/Tabs';
import OwnershipToggle from '@/components/OwnershipToggle';
import CurrencyToggle from '@/components/CurrencyToggle';
import RangeSwitcher from '@/components/RangeSwitcher';
import Movers from '@/components/Movers';
import AnnualClosings from '@/components/AnnualClosings';
import LogoutButton from '@/components/LogoutButton';
import { logout } from './actions';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<{ range?: string; own?: string; cur?: string }> }) {
  const sp = await searchParams;
  const range = sp.range ?? 'A';
  // ?own=0 → emanet (başkası adına tutulan) pay dahil toplam büyüklük.
  // VARSAYILAN bana ait (BT); sayfadaki her sayı tek bu bayrağa bakar.
  const own = sp.own !== '0';
  // ?cur=USD → tüm sayfa dolar üzerinden değerlendirilir.
  const cur: Cur = sp.cur === 'USD' ? 'USD' : 'TRY';

  const [snap, positions, history, instruments, lastFetch, classes, changes, movers, transactions, locations, rate, closings] =
    await Promise.all([
      getLatestSnapshot(), getPositions(), getHistory(range), getInstruments(),
      getLastFetch(), getAssetClasses(), getPeriodChanges(), getPeriodMovers(),
      getTransactionsByInstrument(), getLocations(), getUsdTry(), getAnnualClosings(),
    ]);

  // Portföy değeri snapshot'ta iki para biriminde de duruyor — çevirmiyoruz,
  // ilgili kolonu okuyoruz. Maliyet/K-Z yalnız TL tutulduğu için güncel kurla.
  const valueTry = own ? (snap?.own_value_try ?? 0) : (snap?.total_value_try ?? 0);
  const valueUsd = own ? (snap?.own_value_usd ?? 0) : (snap?.total_value_usd ?? 0);
  const value = cur === 'USD' ? valueUsd : valueTry;
  const altValue = cur === 'USD' ? valueTry : valueUsd;
  const altCur: Cur = cur === 'USD' ? 'TRY' : 'USD';
  const costTry = own ? (snap?.own_cost_try ?? 0) : (snap?.total_cost_try ?? 0);
  const pnlTry = own ? (snap?.own_unrealized_pnl_try ?? 0) : (snap?.unrealized_pnl_try ?? 0);
  const cost = conv(costTry, cur, rate);
  const pnl = conv(pnlTry, cur, rate);
  const pnlPct = costTry > 0 ? (pnlTry / costTry) * 100 : 0;
  const up = pnl >= 0;

  // Emanet: toplam ile bana-ait arasındaki fark. Anahtarın ne kadar şey
  // gizlediğini/gösterdiğini kullanıcıya sayıyla söylemek gerekiyor.
  const emanet = cur === 'USD'
    ? (snap?.total_value_usd ?? 0) - (snap?.own_value_usd ?? 0)
    : (snap?.total_value_try ?? 0) - (snap?.own_value_try ?? 0);
  const emanetCount = positions.filter((p) => p.external_quantity > 0).length;

  // "Bana ait" görünümünde payı sıfırlanmış pozisyonlar listede yer tutmasın.
  const rows = own ? positions.filter((p) => p.own_quantity !== 0) : positions;
  const valOf = (p: (typeof positions)[number]) =>
    (cur === 'USD' ? (own ? p.own_value_usd : p.value_usd) : (own ? p.own_value_try : p.value_try)) ?? 0;

  const staleCount = rows.filter((p) => p.is_stale).length;

  // Dağılım kutucukları: alan = büyüklük, kutu grubunun rengiyle boyanır.
  const alloc = rows
    .filter((p) => valOf(p) > 0)
    .map((p) => ({ symbol: p.symbol, name: p.display_name, group: p.ui_group, value: valOf(p) }))
    .sort((a, b) => b.value - a.value);

  // "TÜM" aralığı: motor öncesi yıl kapanışları + bugünkü değer. Bu seride
  // varlık kırılımı YOK (kullanıcı o yılları yalnız toplam olarak biliyor),
  // bu yüzden sembol serileri boş geçilir ve grafik tek çizgi çizer.
  const yearly: SeriesPoint[] = closings.map((c) => {
    const t = c.total_value_try;
    const u = c.total_value_usd ?? (rate > 0 ? t / rate : 0);
    return { ts: `${c.year}-12-31T20:59:59.000Z`, try: t, usd: u, own_try: t, own_usd: u, s: {} };
  });
  if (snap && yearly.length) {
    yearly.push({
      ts: snap.ts, try: snap.total_value_try, usd: snap.total_value_usd,
      own_try: snap.own_value_try, own_usd: snap.own_value_usd, s: {},
    });
  }
  const isAll = range === 'TÜM';

  return (
    <TabsProvider>
      {/* Sticky üst bar — sol: sekmeler + çıkış · orta: para birimi ·
          sağ: sahiplik + dönem. Dar ekranda gruplar alt satıra sarar. */}
      <div className="appbar">
        <div className="w-full px-3 sm:px-5 lg:px-8 py-2 sm:py-0 sm:h-14 flex flex-wrap items-center justify-between gap-x-2 gap-y-1 sm:grid sm:grid-cols-[1fr_auto_1fr]">
          <div className="flex items-center gap-1 min-w-0">
            <SectionNav />
            <LogoutButton action={logout} />
          </div>
          <div className="sm:justify-self-center">
            <CurrencyToggle cur={cur} />
          </div>
          <div className="sm:justify-self-end shrink-0 flex items-center gap-2">
            <OwnershipToggle own={own} />
            <RangeSwitcher range={range} />
          </div>
        </div>
      </div>

      <main className="w-full px-3 sm:px-5 lg:px-8 pb-8 sm:pb-12">
      {/* Sekmeler HER ZAMAN çizilir. Boş durumda bütün sayfayı tek mesajla
          değiştirmek, "işlem ekle" diyen mesajın ekleme butonlarını da
          gizlemesi demekti — kullanıcı hiçbir şey giremiyordu. */}
          <TabPanel id="ozet">
          {!snap ? (
            <div className="panel p-8 text-center text-sm" style={{ color: 'var(--muted)' }}>
              Henüz snapshot yok.<br />
              <span className="text-[12px]" style={{ color: 'var(--faint)' }}>
                Varlık sekmesinden enstrümanını ve ilk işlemini ekle; motor bir sonraki turda (≤30 dk) fiyatı çeker.
              </span>
            </div>
          ) : (
          <>
          <div className="mb-3 sm:mb-4">
            <h2 className="text-base sm:text-lg font-semibold tracking-tight">Özet</h2>
            {/* timeAgo Date.now()'a bakar: sunucudaki render ile tarayıcıdaki
                hydration arasında saniyeler geçtiği için metin kaçınılmaz
                olarak farklı çıkar ("12sn önce" / "14sn önce"). Bu tek satır
                için uyuşmazlığı bastırıyoruz. */}
            <p className="text-[11px] sm:text-xs truncate" style={{ color: 'var(--muted)' }} suppressHydrationWarning>
              {lastFetch ? `Son güncelleme ${timeAgo(lastFetch.finished_at)} · ${lastFetch.status}` : 'Henüz veri yok'}
            </p>
          </div>

          {emanet !== 0 && (
            <p className="text-[11px] mb-3 tnum" style={{ color: 'var(--faint)' }}>
              {own
                ? `${money(emanet, cur)} emanet düşüldü · ${emanetCount} pozisyon`
                : `${money(emanet, cur)}’si emanet (${emanetCount} pozisyon) — “BT” ile hariç tut`}
            </p>
          )}

          {/* KPI — dört kart: varlık · dönemsel K/Z · oransal öne çıkanlar · tutarsal öne çıkanlar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2 sm:gap-3 mb-3 sm:mb-4 items-stretch">

            {/* 1 — Toplam varlık */}
            <div className="panel p-3 sm:p-4 flex flex-col">
              <div className="text-[11px] mb-1 truncate" style={{ color: 'var(--muted)' }}>
                {own ? 'Bana Ait Varlık' : 'Toplam Varlık'}
              </div>
              <div className="text-xl sm:text-2xl font-semibold tnum truncate">{money(value, cur)}</div>
              <div className="text-[11px] mt-0.5 tnum truncate" style={{ color: 'var(--muted)' }}>{money(altValue, altCur)}</div>
              <div className="mt-auto pt-3 space-y-1">
                <StatLine label="Maliyet" value={money(cost, cur)} />
                <StatLine
                  label="Kâr / Zarar"
                  value={`${up ? '+' : ''}${money(pnl, cur)} · ${pct(pnlPct)}`}
                  color={up ? 'var(--up)' : 'var(--down)'}
                />
                <StatLine label="Pozisyon" value={staleCount ? `${rows.length} · ${staleCount} taşınmış` : String(rows.length)} />
              </div>
            </div>

            {/* 2 — Dönemsel kâr/zarar: 3 satır × 2 eşit kutu */}
            <div className="panel p-3 sm:p-4 flex flex-col">
              <div className="text-[11px] mb-2 truncate" style={{ color: 'var(--muted)' }}>Kâr / Zarar — Dönemsel</div>
              <div className="grid grid-cols-2 grid-rows-3 gap-1.5 flex-1">
                <PeriodBox label="Saatlik"   c={own ? changes.hour.own : changes.hour.total}       cur={cur} rate={rate} />
                <PeriodBox label="Günlük"    c={own ? changes.day.own : changes.day.total}         cur={cur} rate={rate} />
                <PeriodBox label="Haftalık"  c={own ? changes.week.own : changes.week.total}       cur={cur} rate={rate} />
                <PeriodBox label="Aylık"     c={own ? changes.month.own : changes.month.total}     cur={cur} rate={rate} />
                <PeriodBox label="Çeyreklik" c={own ? changes.quarter.own : changes.quarter.total} cur={cur} rate={rate} />
                <PeriodBox label="Yıllık"    c={own ? changes.year.own : changes.year.total}       cur={cur} rate={rate} />
              </div>
            </div>

            {/* 3 & 4 — Öne çıkanlar (oran + tutar). Dönem seçicisi ikisinde ortak. */}
            <Movers data={movers} range={range} own={own} cur={cur} rate={rate} />
          </div>

          {/* Grafik + dağılım */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 mb-3 sm:mb-4">
            <div className="lg:col-span-2 min-w-0">
              <PortfolioChart
                data={isAll ? yearly : history.points}
                symbols={isAll ? [] : history.symbols}
                yearly={isAll}
                currency={cur} own={own} />
            </div>
            <AllocationTreemap data={alloc} cur={cur} />
          </div>

          {/* Projeksiyon */}
          <div>
            <Projection current={value} cur={cur} />
          </div>
          </>
          )}
          </TabPanel>

          <TabPanel id="varlik">
          <div className="mb-3 sm:mb-4 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-semibold tracking-tight">Varlık</h2>
              <p className="text-[11px] sm:text-xs" style={{ color: 'var(--muted)' }}>
                {rows.length === 0
                  ? `Henüz pozisyon yok · katalogda ${instruments.length} enstrüman`
                  : `${rows.length} pozisyon · ${money(value, cur)}${own ? ' · yalnız bana ait' : ''}`}
              </p>
            </div>
            <div className="shrink-0 flex items-center gap-2 flex-wrap justify-end">
              <AnnualClosings rows={closings} />
              <AddInstrument classes={classes} />
              <AddTransaction instruments={instruments} locations={locations} />
            </div>
          </div>

          {rows.length === 0 ? (
            <div className="panel p-8 text-center text-sm" style={{ color: 'var(--muted)' }}>
              {instruments.length === 0 ? (
                <>
                  Katalog boş.<br />
                  <span className="text-[12px]" style={{ color: 'var(--faint)' }}>
                    Önce <b style={{ color: 'var(--muted)' }}>+ Enstrüman</b> ile varlığı tanımla (ad ve fiyat kaynağı
                    otomatik çözülür), sonra <b style={{ color: 'var(--muted)' }}>+ İşlem</b> ile alımını gir.
                  </span>
                </>
              ) : (
                <>
                  Henüz işlem yok.<br />
                  <span className="text-[12px]" style={{ color: 'var(--faint)' }}>
                    <b style={{ color: 'var(--muted)' }}>+ İşlem</b> ile ilk alımını gir; pozisyon burada listelenir.
                  </span>
                </>
              )}
            </div>
          ) : (
            <PositionsTable rows={rows} own={own} cur={cur} transactions={transactions} locations={locations} classes={classes} />
          )}
          </TabPanel>
      </main>
    </TabsProvider>
  );
}

function StatLine({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-[11px]">
      <span className="shrink-0" style={{ color: 'var(--muted)' }}>{label}</span>
      <span className="tnum truncate text-right" style={{ color: color ?? 'var(--text)' }}>{value}</span>
    </div>
  );
}

// Dönemsel kutu — baz snapshot yoksa (o kadar geçmiş birikmemiş) nötr ton + '—'.
function PeriodBox({ label, c, cur, rate }: { label: string; c: Change | null; cur: Cur; rate: number }) {
  const has = c != null && c.pct != null;
  const good = has && (c!.pct as number) >= 0;
  const tone = !has ? 'tone-flat' : good ? 'tone-up' : 'tone-down';
  return (
    <div className={`${tone} rounded-[var(--r-sm)] px-2 py-1.5 flex flex-col justify-center min-w-0`}>
      <div className="text-[10px] leading-none truncate" style={{ color: 'var(--muted)' }}>{label}</div>
      <div className="text-[13px] font-semibold tnum leading-tight mt-1 truncate">
        {has ? `${good ? '+' : ''}${num(c!.pct as number, 2)}%` : '—'}
      </div>
      {has && (
        <div className="text-[10px] leading-none tnum truncate opacity-80">
          {good ? '+' : ''}{money(conv(c!.abs, cur, rate), cur)}
        </div>
      )}
    </div>
  );
}
