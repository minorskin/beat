import {
  getLatestSnapshot, getPositions, getHistory, getInstruments,
  getLastFetch, getAssetClasses, getPeriodChanges, getPeriodMovers,
  getTransactionsByInstrument, getLocations, getUsdTry, getAnnualClosings,
  getProjectionScenarios,
  type Change, type Position, type SeriesPoint, type PeriodKey,
} from '@/lib/data';
import { money, conv, num, pct, timeAgoShort, dateTimeStr, type Cur } from '@/lib/format';
import PortfolioChart from '@/components/PortfolioChart';
import AllocationTreemap from '@/components/AllocationTreemap';
import AddTransaction from '@/components/AddTransaction';
import AddInstrument from '@/components/AddInstrument';
import PositionsTable from '@/components/PositionsTable';
import Projection from '@/components/Projection';
import SectionNav from '@/components/SectionNav';
import TabsProvider, { TabPanel } from '@/components/Tabs';
import SettingsMenu from '@/components/SettingsMenu';
import RangeSwitcher from '@/components/RangeSwitcher';
import { rangeLongOf } from '@/lib/ranges';
import Movers from '@/components/Movers';
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

  const [snap, positions, history, instruments, lastFetch, classes, changes, movers, transactions, locations, rate, closings, scenarios] =
    await Promise.all([
      getLatestSnapshot(), getPositions(), getHistory(range), getInstruments(),
      getLastFetch(), getAssetClasses(), getPeriodChanges(), getPeriodMovers(),
      getTransactionsByInstrument(), getLocations(), getUsdTry(), getAnnualClosings(),
      getProjectionScenarios(),
    ]);

  // Özet büyüklükler CANLI pozisyonlardan toplanır, snapshot'tan OKUNMAZ.
  // Snapshot saat başı yazılır; arada bir işlem girildiğinde kart ile tablonun
  // toplamı birbirini tutmuyordu. Tek kaynak getPositions — o da adedi
  // v_holdings'ten, fiyatı v_latest_price'tan canlı okur.
  const sum = (f: (p: Position) => number | null) => positions.reduce((a, p) => a + (f(p) ?? 0), 0);
  const totalTry = sum((p) => p.value_try);
  const totalUsd = sum((p) => p.value_usd);
  const ownValueTry = sum((p) => p.own_value_try);
  const ownValueUsd = sum((p) => p.own_value_usd);
  const valueTry = own ? ownValueTry : totalTry;
  const valueUsd = own ? ownValueUsd : totalUsd;
  const value = cur === 'USD' ? valueUsd : valueTry;
  const altValue = cur === 'USD' ? valueTry : valueUsd;
  const altCur: Cur = cur === 'USD' ? 'TRY' : 'USD';
  // Maliyet ve K/Z yalnız alış fiyatı BİLİNEN pozisyonlardan toplanır: maliyeti
  // girilmemiş varlığın maliyeti 0 değil meçhuldür (cost_try null), yoksa
  // portföyün tamamı kâr görünür.
  const costTry = sum((p) => (own ? p.own_cost_try : p.cost_try));
  const pnlTry = sum((p) => (own ? p.own_pnl_try : p.pnl_try));
  const pnl = conv(pnlTry, cur, rate);
  const pnlPct = costTry > 0 ? (pnlTry / costTry) * 100 : 0;

  // Emanet: toplam ile bana-ait arasındaki fark. Anahtarın ne kadar şey
  // gizlediğini/gösterdiğini kullanıcıya sayıyla söylemek gerekiyor.
  const emanet = cur === 'USD' ? totalUsd - ownValueUsd : totalTry - ownValueTry;
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
  // Serinin son noktası da canlı toplam olmalı — yıl kapanışlarının yanına
  // bayat bir snapshot koyarsak grafik ile kart farklı sayı gösterir.
  if (yearly.length && positions.length) {
    yearly.push({
      ts: new Date().toISOString(), try: totalTry, usd: totalUsd,
      own_try: ownValueTry, own_usd: ownValueUsd, s: {},
    });
  }
  const isAll = range === 'TÜM';

  // Birinci karttaki değişim satırları da üst bardaki DÖNEM anahtarına bağlı —
  // sayfanın tek zaman ekseni o. Daha önce bu iki satır "pozisyon açıldığından
  // beri"yi gösteriyordu; yanı başındaki dönemsel kutular başka bir dönemi
  // gösterirken kartın kendisi sabit durunca hangi sayının neyi ölçtüğü
  // anlaşılmıyordu.
  //
  // TÜM = maliyet bazlı toplam K/Z (zaten "en baştan beri" demek). Diğer
  // dönemler getPeriodChanges'ten: dönem başındaki sepetin fiyat hareketi,
  // yani araya giren para giriş/çıkışı ölçüye karışmaz.
  const PERIOD_OF: Record<string, PeriodKey> = {
    S: 'hour', G: 'day', H: 'week', A: 'month', '3A': 'quarter', '1Y': 'year',
  };
  const periodKey = PERIOD_OF[range];
  const periodChange = periodKey ? (own ? changes[periodKey].own : changes[periodKey].total) : null;
  // O döneme yetecek geçmiş yoksa ölçü elimizdeki EN ESKİ gözlemden başlar
  // (getPeriodChanges'teki geriye düşüş) — "—" yazıp kartı boş bırakmak yerine
  // gidebildiği kadar geriye gider. Gerçek başlangıç title'da (sinceNote).
  const chgAbs = isAll ? pnl : (periodChange ? conv(periodChange.abs, cur, rate) : null);
  const chgPct = isAll ? pnlPct : (periodChange?.pct ?? null);
  const chgUp = (chgAbs ?? chgPct ?? 0) >= 0;
  const chgColor = chgAbs == null && chgPct == null
    ? undefined
    : chgUp ? 'var(--up)' : 'var(--down)';
  const rangeLong = rangeLongOf(range);
  // Dönemin tamamına yetecek geçmiş yoksa ölçü artık "—" değil: elimizdeki en
  // eski gözlemden başlıyor. Sayı görünür kalsın ama neyi ölçtüğü de bilinsin
  // diye gerçek başlangıç title'a yazılır (bkz. getPeriodChanges).
  const sinceNote = periodChange?.since ? ` Ölçüm başlangıcı: ${dateTimeStr(periodChange.since)}.` : '';

  return (
    <TabsProvider>
      {/* Sticky üst bar — sol: sekmeler · sağ: sahiplik + ayarlar + dönem.
          Para birimi ve çıkış dişlinin içinde: ikisi de seyrek dokunulan
          anahtarlar, barda yer kaplamalarına gerek yok. */}
      <div className="appbar">
        <div className="w-full px-3 sm:px-5 lg:px-8 py-2 sm:py-0 sm:h-14 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
          <SectionNav />
          <div className="shrink-0 flex items-center gap-2">
            <SettingsMenu cur={cur} own={own} closings={closings} logoutAction={logout} />
            <RangeSwitcher range={range} />
          </div>
        </div>
      </div>

      <main className="w-full px-3 sm:px-5 lg:px-8 pb-8 sm:pb-12">
      {/* Sekmeler HER ZAMAN çizilir. Boş durumda bütün sayfayı tek mesajla
          değiştirmek, "işlem ekle" diyen mesajın ekleme butonlarını da
          gizlemesi demekti — kullanıcı hiçbir şey giremiyordu. */}
          <TabPanel id="ozet">
          {!snap && positions.length === 0 ? (
            <div className="panel p-8 text-center t-head" style={{ color: 'var(--muted)' }}>
              Henüz snapshot yok.<br />
              <span className="t-body" style={{ color: 'var(--faint)' }}>
                Varlık sekmesinden enstrümanını ve ilk işlemini ekle; motor bir sonraki turda (≤30 dk) fiyatı çeker.
              </span>
            </div>
          ) : (
          <>
          {/* Güncelleme bilgisi başlığın SAĞ ucunda tek rozet: ikon + yaş.
              Başlığın altındaki tam cümle satırı bir bilgi için koca bir şerit
              harcıyordu; durum ve tam zaman damgası title'a taşındı. */}
          <div className="mb-3 sm:mb-4 flex items-center justify-between gap-3">
            <h2 className="t-h2 font-semibold tracking-tight">Özet</h2>
            {/* timeAgoShort Date.now()'a bakar: sunucudaki render ile tarayıcıdaki
                hydration arasında saniyeler geçtiği için metin kaçınılmaz
                olarak farklı çıkabilir. Bu tek düğüm için uyuşmazlığı bastırıyoruz. */}
            <span
              className="shrink-0 flex items-center gap-1.5 t-label whitespace-nowrap"
              style={{ color: 'var(--muted)' }}
              title={lastFetch
                ? `Son güncelleme ${dateTimeStr(lastFetch.finished_at)} · ${lastFetch.status}`
                : 'Henüz veri yok'}
              suppressHydrationWarning
            >
              <RefreshIcon />
              {lastFetch ? timeAgoShort(lastFetch.finished_at) : '—'}
            </span>
          </div>

          {emanet !== 0 && (
            <p className="t-label mb-3 tnum" style={{ color: 'var(--faint)' }}>
              {own
                ? `${money(emanet, cur)} emanet düşüldü · ${emanetCount} pozisyon`
                : `${money(emanet, cur)}’si emanet (${emanetCount} pozisyon) — “BT” ile hariç tut`}
            </p>
          )}

          {/* KPI — dört kart: varlık · dönemsel K/Z · oransal öne çıkanlar · tutarsal öne çıkanlar */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2 sm:gap-3 mb-3 sm:mb-4 items-stretch">

            {/* 1 — Toplam varlık */}
            {/* Başlık satırı yok: kartın kendisi büyüklüğü söylüyor, hangi
                sahiplik görünümünde olduğu da hemen üstteki emanet satırından
                okunuyor. Mod yine de title'da duruyor. */}
            <div className="panel p-3 sm:p-4 flex flex-col" title={own ? 'Bana ait varlık' : 'Toplam varlık'}>
              <div className="t-kpi font-semibold tnum truncate">{money(value, cur)}</div>
              <div className="t-label mt-0.5 tnum truncate" style={{ color: 'var(--muted)' }}>{money(altValue, altCur)}</div>
              <div className="mt-auto pt-3 space-y-1.5">
                {/* Tutar ve oran ayrı satırda: ikisi farklı soruyu cevaplıyor
                    ("ne kadar kazandım" / "ne kadar büyüdüm") ve tek satıra
                    sıkışınca ikisi de küçük punto kalıyordu. */}
                <StatLine
                  label="Değişim Tutar"
                  note={range}
                  title={isAll
                    ? 'Alış fiyatına göre gerçekleşmemiş kâr/zarar — pozisyon açıldığından beri.'
                    : `Değişim tutarı · ${rangeLong}. Dönem başındaki sepetin fiyat hareketi; araya giren para giriş/çıkışı sayılmaz.${sinceNote}`}
                  value={chgAbs == null ? '—' : `${chgUp ? '+' : ''}${money(chgAbs, cur)}`}
                  color={chgColor}
                />
                <StatLine
                  label="Değişim Oran"
                  note={range}
                  title={isAll
                    ? 'Kâr/zarar ÷ maliyet. Yalnız alış fiyatı girilmiş pozisyonlar sayılır.'
                    : `Değişim oranı · ${rangeLong}. Dönem başındaki sepetin fiyat hareketi.${sinceNote}`}
                  value={chgPct == null ? '—' : pct(chgPct)}
                  color={chgColor}
                />
                <StatLine label="Pozisyon" value={staleCount ? `${rows.length} · ${staleCount} taşınmış` : String(rows.length)} />
              </div>
            </div>

            {/* 2 — Dönemsel kâr/zarar: 3 satır × 2 eşit kutu */}
            <div className="panel p-3 sm:p-4 flex flex-col">
              <div className="t-label mb-2 truncate" style={{ color: 'var(--muted)' }}>Kâr / Zarar — Dönemsel</div>
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
            <Projection current={value} cur={cur} rate={rate} scenarios={scenarios} />
          </div>
          </>
          )}
          </TabPanel>

          <TabPanel id="varlik">
          <div className="mb-3 sm:mb-4 flex items-end justify-between gap-3">
            <div className="min-w-0">
              <h2 className="t-h2 font-semibold tracking-tight">Varlık</h2>
              <p className="t-sub" style={{ color: 'var(--muted)' }}>
                {rows.length === 0
                  ? `Henüz pozisyon yok · katalogda ${instruments.length} enstrüman`
                  : `${rows.length} pozisyon · ${money(value, cur)}${own ? ' · yalnız bana ait' : ''}`}
              </p>
            </div>
            <div className="shrink-0 flex items-center gap-2 flex-wrap justify-end">
              <AddInstrument classes={classes} />
              <AddTransaction instruments={instruments} locations={locations} />
            </div>
          </div>

          {rows.length === 0 ? (
            <div className="panel p-8 text-center t-head" style={{ color: 'var(--muted)' }}>
              {instruments.length === 0 ? (
                <>
                  Katalog boş.<br />
                  <span className="t-body" style={{ color: 'var(--faint)' }}>
                    Önce <b style={{ color: 'var(--muted)' }}>+ Enstrüman</b> ile varlığı tanımla (ad ve fiyat kaynağı
                    otomatik çözülür), sonra <b style={{ color: 'var(--muted)' }}>+ İşlem</b> ile alımını gir.
                  </span>
                </>
              ) : (
                <>
                  Henüz işlem yok.<br />
                  <span className="t-body" style={{ color: 'var(--faint)' }}>
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

// Güncelleme rozeti ikonu — döngüsel ok. Yalnız bir işaret, anlam metinde.
function RefreshIcon() {
  return (
    <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" className="shrink-0"
      fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" />
      <path d="M13.5 2.2v3.1h-3.1" />
    </svg>
  );
}

function StatLine({ label, note, value, color, title }: {
  label: string; note?: string; value: string; color?: string; title?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 t-strong" title={title}>
      {/* Dönem rozeti üst bardaki anahtarla AYNI kısaltmayı kullanır (S/G/H/…);
          uzun hâli title'da. Hangi sayının hangi dönemi ölçtüğü kartın kendi
          üstünde yazsın diye — bakış üst bara gitmek zorunda kalmasın. */}
      <span className="shrink-0" style={{ color: 'var(--muted)' }}>
        {label}
        {note && <span className="t-label tnum" style={{ color: 'var(--faint)' }}> · {note}</span>}
      </span>
      <span className="tnum truncate text-right font-medium" style={{ color: color ?? 'var(--text)' }}>{value}</span>
    </div>
  );
}

// Dönemsel kutu — baz snapshot yoksa (o kadar geçmiş birikmemiş) nötr ton + '—'.
function PeriodBox({ label, c, cur, rate }: { label: string; c: Change | null; cur: Cur; rate: number }) {
  const has = c != null && c.pct != null;
  const good = has && (c!.pct as number) >= 0;
  const tone = !has ? 'tone-flat' : good ? 'tone-up' : 'tone-down';
  return (
    <div
      className={`${tone} rounded-[var(--r-sm)] px-2 py-1.5 flex flex-col justify-center min-w-0`}
      title={c?.since ? `${label} — ölçüm başlangıcı ${dateTimeStr(c.since)}` : label}
    >
      <div className="t-micro leading-none truncate" style={{ color: 'var(--muted)' }}>{label}</div>
      <div className="t-strong font-semibold tnum leading-tight mt-1 truncate">
        {has ? `${good ? '+' : ''}${num(c!.pct as number, 2)}%` : '—'}
      </div>
      {has && (
        <div className="t-micro leading-none tnum truncate opacity-80">
          {good ? '+' : ''}{money(conv(c!.abs, cur, rate), cur)}
        </div>
      )}
    </div>
  );
}
