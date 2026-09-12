import {
  getLatestSnapshot, getPositions, getHistory, getInstruments,
  getLastFetch, getAssetClasses, getPeriodLegs, getMoverLegs,
  getTransactionsByInstrument, getLocations, getUsdTry, getAnnualClosings,
  getProjectionScenarios, getDayChanges, getWatchlist, getCalendars, livePoint,
  type Change, type Position, type SeriesPoint, type PeriodKey,
} from '@/lib/data';
import {
  buildBook, bySymbol, foldChanges, foldMovers, netDayChanges, netHistory, netPositions,
} from '@/lib/netview';
import { scheduleLabel } from '@/lib/schedule';
import { money, conv, num, pct, timeAgoShort, dateTimeStr, type Cur } from '@/lib/format';
import { concLevel, CONC_HIGH, CONC_MID } from '@/lib/risk';
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
import MarketPulse, { type MarketRow } from '@/components/MarketPulse';
import Balance from '@/components/Balance';
import { logout } from './actions';

export const dynamic = 'force-dynamic';

export default async function Page({ searchParams }: { searchParams: Promise<{ range?: string; own?: string; cur?: string; net?: string }> }) {
  const sp = await searchParams;
  const range = sp.range ?? 'A';
  // ?own=0 → emanet (başkası adına tutulan) pay dahil toplam büyüklük.
  // VARSAYILAN bana ait (BT); sayfadaki her sayı tek bu bayrağa bakar.
  const own = sp.own !== '0';
  // ?cur=USD → tüm sayfa dolar üzerinden değerlendirilir.
  const cur: Cur = sp.cur === 'USD' ? 'USD' : 'TRY';
  // ?net=0 → brüt (kesintisiz piyasa değeri). VARSAYILAN net: vergi ve yönetim
  // ücreti düşülmüş, yani "bugün çıksam elimde ne kalır". Oranı girilmemiş
  // varlıkta ikisi aynı sayı olduğu için varsayılan kimseyi şaşırtmıyor.
  const net = sp.net !== '0';

  const [snap, grossPositions, grossHistory, instruments, lastFetch, classes, periodLegs, moverLegs, transactions, locations, rate, closings, scenarios, grossDayChanges, watchlist, calendars] =
    await Promise.all([
      getLatestSnapshot(), getPositions(), getHistory(range), getInstruments(),
      getLastFetch(), getAssetClasses(), getPeriodLegs(), getMoverLegs(),
      getTransactionsByInstrument(), getLocations(), getUsdTry(), getAnnualClosings(),
      getProjectionScenarios(), getDayChanges(), getWatchlist(), getCalendars(),
    ]);

  // ── Net / brüt tek noktada uygulanır ────────────────────────────────────
  // Aşağıdaki her hesap `positions`, `changes`, `movers`, `dayChanges` ve
  // `history` üzerinden gidiyor; kesinti bu beşine burada girince KPI kartları,
  // dağılım, grafik, tablo ve projeksiyon kendiliğinden aynı dili konuşuyor.
  // Defter boşsa (hiçbir varlığa oran girilmemişse) netPositions ve arkadaşları
  // nesneyi olduğu gibi geçirir — net mod bedava.
  const book = net ? buildBook(grossPositions, rate) : null;
  const positions = book ? netPositions(grossPositions, book) : grossPositions;
  const changes = foldChanges(periodLegs, book);
  const movers = foldMovers(moverLegs, book);
  const dayChanges = book ? netDayChanges(grossDayChanges, book) : grossDayChanges;
  const history = book
    ? { ...grossHistory, points: netHistory(grossHistory.points, bySymbol(grossPositions, book)) }
    : grossHistory;
  // İzleme listesi = kataloğa eklenmiş ama pozisyonu olmayan enstrüman
  // (v_watchlist). Hesaba KATILMAZ: portföy büyüklüğü, dağılım, grafik ve
  // dönemsel kartların hepsi `positions`tan besleniyor, bu dizi oraya hiç
  // girmiyor — yalnız Varlık tablosunun altında ayrı bir bölüm olarak çizilir.

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
  // Maliyeti MEÇHUL bir pozisyon varsa portföy düzeyinde K/Z diye bir sayı
  // yoktur: pay da payda da eksik. Varlık tablosu bunu zaten böyle yapıyordu
  // (PositionsTable → noCost === 0), Özet kartı yapmıyordu; sonuç, alış
  // fiyatlarının çoğu girilmemişken "TÜM" seçilince ₺0 / +%0,00 yazmasıydı —
  // portföy 22,3M'den 22,9M'ye çıkmışken. Aynı soruya iki sayfa aynı cevabı
  // versin diye kural buraya da taşındı.
  const noCostCount = positions.filter((p) => {
    const v = own ? p.own_value_try : p.value_try;
    const c = own ? p.own_cost_try : p.cost_try;
    return (v ?? 0) > 0 && (c == null || c <= 0);
  }).length;
  const pnlKnown = noCostCount === 0 && costTry > 0;
  const pnl = pnlKnown ? conv(pnlTry, cur, rate) : null;
  const pnlPct = pnlKnown ? (pnlTry / costTry) * 100 : null;

  // "Bana ait" görünümünde payı sıfırlanmış pozisyonlar listede yer tutmasın.
  const rows = own ? positions.filter((p) => p.own_quantity !== 0) : positions;
  const valOf = (p: (typeof positions)[number]) =>
    (cur === 'USD' ? (own ? p.own_value_usd : p.value_usd) : (own ? p.own_value_try : p.value_try)) ?? 0;

  // Bayatlık artık her grubun KENDİ takviminden ölçülüyor (gün + aralık +
  // sıklık, bkz. migration 0016): kapalı geçen saatler fiyatı yaşlandırmıyor.
  // İki durum ayrı sayılıyor çünkü ayrı şeyler: penceresi kapalı bir varlığın
  // fiyatının kımıldamaması beklenen davranış, penceresi AÇIKKEN kımıldamaması
  // ise gelmeyen veridir.
  const staleClosed = rows.filter((p) => p.is_stale && p.is_closed).length;
  const staleLate = rows.filter((p) => p.is_stale && !p.is_closed).length;
  const staleCount = staleClosed + staleLate;
  // Şu an güncelleme penceresi açık olan gruplar — özet kartındaki güncelleme
  // yaşının hangi zemine oturduğunu söyler. Takvim kodu ("DOVIZ") kullanıcıya
  // bir şey anlatmadığı için sınıfın kendi adıyla yazılıyor.
  const groupName = new Map(rows.map((p) => [p.calendar_code, p.class_name]));
  const calByCode = new Map(calendars.map((c) => [c.code, c]));
  const openGroups = [...new Set(rows.filter((p) => !p.is_closed).map((p) => p.calendar_code))]
    .map((code) => `${groupName.get(code) ?? code} (${scheduleLabel(calByCode.get(code))})`);

  // Piyasa kartı — izlediğin referanslar + USD/TRY. Oran `pct_native`:
  // enstrümanın kendi para birimindeki günlük değişim (bkz. DayChange).
  //
  // USD/TRY izleme listesinde DEĞİL, elde tutulan bir pozisyon — ama bir Türk
  // yatırımcı için en önemli referans o, bu yüzden pozisyonlardan çekilip
  // listenin başına konuyor. Yoksa satır düşer, kart kalanla çizilir.
  const usdTryPos = positions.find((p) => p.symbol === 'USDTRY');
  const market: MarketRow[] = [
    ...(usdTryPos ? [{
      symbol: 'USD/TRY', name: usdTryPos.display_name,
      price: usdTryPos.price, priceCur: usdTryPos.price_currency,
      pct: dayChanges[usdTryPos.instrument_id]?.pct_native ?? null,
    }] : []),
    ...watchlist.map((w) => ({
      symbol: w.symbol, name: w.display_name,
      price: w.price, priceCur: w.price_currency,
      pct: dayChanges[w.instrument_id]?.pct_native ?? null,
    })),
    // Üst sınır 10: kartın yüksekliği diğer üçüyle aynı kalsın diye punto
    // küçültüldü, sığan satır sayısı bu. Fazlası kartı uzatırdı.
  ].slice(0, 10);

  // Kur riski kırılımı. instruments.currency artık para birimi değil RİSK
  // ETİKETİ (bkz. WatchItem yorumu): 'USD' = dolar bazlı, kur hareketine
  // karşı korunaklı; geri kalanı TL bazlı, yani açık pozisyon. Varlık
  // tablosundaki renkli nokta ile aynı kural — kartta yalnız sayısı duruyor.
  const fxSafe = rows.filter((p) => p.currency === 'USD').length;
  const fxRisky = rows.length - fxSafe;

  // Dağılım kutucukları: alan = büyüklük, kutu grubunun rengiyle boyanır.
  const alloc = rows
    .filter((p) => valOf(p) > 0)
    .map((p) => ({ symbol: p.symbol, name: p.display_name, group: p.ui_group, value: valOf(p), currency: p.currency }))
    .sort((a, b) => b.value - a.value);

  // Yoğunluk kırılımı — eşikler lib/risk.ts'te, dağılım kutucuklarıyla ORTAK.
  // Payda `alloc` toplamı: değeri henüz bilinmeyen (fiyatı bekleyen) pozisyon
  // paya girmez, yoksa herkesin oranı olduğundan küçük çıkar.
  // Grafikteki kur riski serisi için: sembol → kur riski etiketi. Geçmiş
  // seride artık elde olmayan sembol de geçebilir; katalogda bulunmayan
  // sembolü grafik TL bazlı sayıyor (bkz. PortfolioChart).
  const symbolCurrency = Object.fromEntries(positions.map((p) => [p.symbol, p.currency]));

  const allocTotal = alloc.reduce((a, it) => a + it.value, 0);
  const shares = allocTotal > 0 ? alloc.map((it) => (it.value / allocTotal) * 100) : [];
  const concHigh = shares.filter((v) => concLevel(v) === 'high').length;
  const concMid = shares.filter((v) => concLevel(v) === 'mid').length;

  // "TÜM" aralığı: motor öncesi yıl kapanışları + bugünkü değer. Bu seride
  // varlık kırılımı YOK (kullanıcı o yılları yalnız toplam olarak biliyor),
  // bu yüzden sembol serileri boş geçilir ve grafik tek çizgi çizer.
  //
  // Kapanışlar NET MODDA DA BRÜT kalır. Bu satırlar elle girilmiş toplamlar:
  // ne varlık kırılımı ne maliyeti var, yani o yılların gerçek kesintisi
  // hesaplanamaz. Bugünkü efektif oranı geçmişe uygulamak sayıyı sürekli
  // gösterirdi ama uydurma olurdu — girilmemiş bir veriyi varsayımla doldurmak
  // yerine kullanıcının girdiği sayı olduğu gibi duruyor. Son nokta ise canlı
  // pozisyonlardan geldiği için net; net modda serinin sağ ucundaki kırılma
  // bir çizim hatası değil, tam da kesintinin kendisi.
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

  // Geçmiş serinin sağ ucuna CANLI nokta eklenir. Snapshot saat başı yazılıyor;
  // arada bir işlem girildiğinde ya da fiyat güncellendiğinde grafik bir saate
  // kadar geride kalıyor, kartlar ile Varlık tablosu ise çoktan yeni sayıyı
  // gösteriyordu — aynı sayfa iki farklı toplam anlatıyordu. Nokta `positions`
  // ile ÜRETİLİR, yani birinci karttaki büyüklükle birebir aynı sayıdır.
  // Yeni eklenmiş bir varlık henüz hiçbir snapshot'ta yok; sembol listesi de
  // bu yüzden canlı noktayla birleştiriliyor, yoksa çizgisi hiç çizilmezdi.
  const live = positions.length ? livePoint(positions) : null;
  const points = live ? [...history.points, live] : history.points;
  const chartSymbols = live
    ? [...new Set([...history.symbols, ...Object.keys(live.s)])].sort()
    : history.symbols;

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
      {/* Sticky üst bar — sol: sekmeler · sağ: ayarlar + dönem.
          Para birimi ve çıkış dişlinin içinde: ikisi de seyrek dokunulan
          anahtarlar, barda yer kaplamalarına gerek yok.

          Üçü de TEK flex kutusunda, sarmalayıcı gruplar olmadan. Ayarlar ve
          dönem eskiden ortak bir kutudaydı; dar ekranda o kutu bütün olarak
          alt satıra düşüyor ve `justify-between` tek eleman kaldığı için onu
          SOLA yaslıyordu — dişli sayfanın sol kenarında, dönem seçicisi
          ortada asılı kalıyordu. Şimdi dişli `ms-auto` ile her genişlikte sağ
          uca gidiyor; dönem seçicisi mobilde kendi satırını boydan boya
          kaplıyor (bkz. RangeSwitcher), masaüstünde dişlinin yanında kalıyor. */}
      <div className="appbar">
        <div className="w-full px-3 sm:px-5 lg:px-8 py-2 sm:py-0 sm:h-14 flex flex-wrap items-center gap-x-2 gap-y-1.5">
          <SectionNav />
          <div className="shrink-0 ms-auto">
            <SettingsMenu cur={cur} own={own} net={net} closings={closings} logoutAction={logout} />
          </div>
          <RangeSwitcher range={range} />
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
          {/* Özet başlığı ve emanet özeti kaldırıldı: sekme adı zaten "Özet",
              başlık satırı bir bilgi taşımadan yükseklik harcıyordu. Güncelleme
              yaşı birinci kartın sağ üst köşesine taşındı. */}
          {/* KPI — dört kart: varlık · dönemsel K/Z · öne çıkanlar · piyasa */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2 sm:gap-3 mb-3 sm:mb-4 items-stretch">

            {/* 1 — Toplam varlık */}
            {/* Başlık satırı yok: kartın kendisi büyüklüğü söylüyor, hangi
                sahiplik görünümünde olduğu da hemen üstteki emanet satırından
                okunuyor. Mod yine de title'da duruyor. */}
            <div className="panel p-3 sm:p-4 flex flex-col" title={own ? 'Bana ait varlık' : 'Toplam varlık'}>
              {/* Tutarlar ve gizleme anahtarı istemci tarafında (bkz. Balance).
                  Tazelik rozeti sunucuda çizilip prop olarak geçiliyor:
                  timeAgoShort Date.now()'a bakar, istemcide hesaplansa
                  hydration'da farklı metin üretirdi. */}
              <Balance
                main={money(value, cur)}
                alt={money(altValue, altCur)}
                badge={
                  <span
                    className="t-body tnum leading-none"
                    style={{ color: 'var(--faint)' }}
                    title={lastFetch
                      ? `Son güncelleme ${dateTimeStr(lastFetch.finished_at)} · ${lastFetch.status}\n`
                        + (openGroups.length
                          ? `Güncelleme penceresi şu an açık: ${openGroups.join(' · ')}`
                          : 'Şu an hiçbir grubun güncelleme penceresi açık değil')
                      : 'Henüz veri yok'}
                    suppressHydrationWarning
                  >
                    {lastFetch ? timeAgoShort(lastFetch.finished_at) : '—'}
                  </span>
                } />
              <div className="mt-auto pt-3 space-y-1.5">
                {/* Tutar ve oran ayrı satırda: ikisi farklı soruyu cevaplıyor
                    ("ne kadar kazandım" / "ne kadar büyüdüm") ve tek satıra
                    sıkışınca ikisi de küçük punto kalıyordu. */}
                <StatLine
                  label="Değişim Tutar"
                  note={range}
                  title={isAll
                    ? (pnlKnown
                        ? 'Alış fiyatına göre gerçekleşmemiş kâr/zarar — pozisyon açıldığından beri.'
                        : `${noCostCount} pozisyonda alış fiyatı girilmemiş — toplam kâr/zarar hesaplanamıyor.`)
                    : `Değişim tutarı · ${rangeLong}. Dönem başındaki sepetin fiyat hareketi; araya giren para giriş/çıkışı sayılmaz.${sinceNote}`}
                  value={chgAbs == null ? '—' : `${chgUp ? '+' : ''}${money(chgAbs, cur)}`}
                  color={chgColor}
                />
                <StatLine
                  label="Değişim Oran"
                  note={range}
                  title={isAll
                    ? (pnlKnown
                        ? 'Kâr/zarar ÷ maliyet.'
                        : `${noCostCount} pozisyonda alış fiyatı girilmemiş — toplam oran hesaplanamıyor.`)
                    : `Değişim oranı · ${rangeLong}. Dönem başındaki sepetin fiyat hareketi.${sinceNote}`}
                  value={chgPct == null ? '—' : pct(chgPct)}
                  color={chgColor}
                />
                {/* Yoğunluk riski — kur riski satırıyla aynı dilbilgisi: kaç
                    varlık hangi kovada. Kırmızı = payı %33 üstü (portföy artık
                    o varlığın kendisi), sarı = %20–33 (izle), gri = toplam
                    varlık. Eski "Pozisyon" satırı buraya taşındı: adet zaten
                    gri rozette, bayat fiyat uyarısı da onun title'ında. */}
                <div className="flex items-baseline justify-between gap-2 t-head">
                  <span className="shrink-0" style={{ color: 'var(--muted)' }}>Yoğunluk Riski</span>
                  <span className="flex items-center gap-1 shrink-0">
                    <Chip tone="tone-down" n={concHigh} title={`${concHigh} varlığın payı %${CONC_HIGH} üstünde — yoğunluk riski yüksek`} />
                    <Chip tone="tone-warn" n={concMid}  title={`${concMid} varlığın payı %${CONC_MID}–${CONC_HIGH} arasında — izlenmeli`} />
                    <Chip tone="tone-flat" n={rows.length}
                      title={staleCount
                        ? [`Toplam ${rows.length} varlık · ${staleCount} tanesinin fiyatı taşınmış`,
                           staleClosed ? `${staleClosed} tanesi grubunun güncelleme penceresi kapalı olduğu için` : '',
                           staleLate ? `${staleLate} tanesinde pencere açık ama yeni gözlem gelmedi` : ''].filter(Boolean).join(' · ')
                        : `Toplam ${rows.length} varlık`} />
                  </span>
                </div>
                {/* Kur riski — üç rozet: açık · korunaklı · toplam. Renk burada
                    süs değil kodlama: kırmızı = TL bazlı (kur karşısında açık),
                    yeşil = USD bazlı, gri = toplam varlık (ilk ikisinin
                    toplamı, yani satır kendi kendini denetliyor). Renge tek
                    başına güvenilmesin diye üçünün de anlamı title'da. */}
                <div className="flex items-baseline justify-between gap-2 t-head">
                  <span className="shrink-0" style={{ color: 'var(--muted)' }}>Kur Riski</span>
                  <span className="flex items-center gap-1 shrink-0">
                    <Chip tone="tone-down" n={fxRisky} title={`${fxRisky} varlık TL bazlı — kur riski var`} />
                    <Chip tone="tone-up"   n={fxSafe}  title={`${fxSafe} varlık USD bazlı — kur riski yok`} />
                    <Chip tone="tone-flat" n={rows.length} title={`Toplam ${rows.length} varlık`} />
                  </span>
                </div>
              </div>
            </div>

            {/* 2 — Dönemsel kâr/zarar: 3 satır × 2 eşit kutu */}
            <div className="panel p-3 sm:p-4 flex flex-col">
              <div className="t-body mb-2 truncate" style={{ color: 'var(--muted)' }}>Kâr / Zarar — Dönemsel</div>
              <div className="grid grid-cols-2 grid-rows-3 gap-1.5 flex-1">
                <PeriodBox label="Saatlik"   c={own ? changes.hour.own : changes.hour.total}       cur={cur} rate={rate} />
                <PeriodBox label="Günlük"    c={own ? changes.day.own : changes.day.total}         cur={cur} rate={rate} />
                <PeriodBox label="Haftalık"  c={own ? changes.week.own : changes.week.total}       cur={cur} rate={rate} />
                <PeriodBox label="Aylık"     c={own ? changes.month.own : changes.month.total}     cur={cur} rate={rate} />
                <PeriodBox label="Çeyreklik" c={own ? changes.quarter.own : changes.quarter.total} cur={cur} rate={rate} />
                <PeriodBox label="Yıllık"    c={own ? changes.year.own : changes.year.total}       cur={cur} rate={rate} />
              </div>
            </div>

            {/* 3 — Öne çıkanlar: tek kart, iki yarı (oran | tutar). Dönem üst bardan. */}
            <Movers data={movers} range={range} own={own} cur={cur} rate={rate} />

            {/* 4 — Piyasa. Diğer üçü içeriye bakıyor (elimde ne var, ne
                kazandım, hangi varlık öne çıktı); dışarıda ne olduğunu
                söyleyen yoktu. Portföyün günlük hareketi ancak dolar, S&P ve
                VIX'in yanında bir anlam taşıyor. */}
            <MarketPulse rows={market} />
          </div>

          {/* Grafik + dağılım */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 sm:gap-4 mb-3 sm:mb-4">
            <div className="lg:col-span-2 min-w-0">
              <PortfolioChart
                data={isAll ? yearly : points}
                symbols={isAll ? [] : chartSymbols}
                yearly={isAll}
                symbolCurrency={symbolCurrency}
                currency={cur} own={own} />
            </div>
            <AllocationTreemap data={alloc} cur={cur} />
          </div>

          </>
          )}
          </TabPanel>

          <TabPanel id="varlik">
          {/* Başlık ve özet satırı kaldırıldı: sekme adı zaten "Varlık", pozisyon
              sayısı ve toplam da tablonun kendi Toplam satırında duruyor. */}
          <div className="mb-3 sm:mb-4 flex items-end justify-end gap-3">
            <div className="shrink-0 flex items-center gap-2 flex-wrap justify-end">
              <AddInstrument classes={classes} calendars={calendars} />
              <AddTransaction instruments={instruments} locations={locations} />
            </div>
          </div>

          {rows.length === 0 && watchlist.length === 0 ? (
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
            <PositionsTable
              rows={rows} own={own} cur={cur} transactions={transactions}
              locations={locations} classes={classes}
              dayChanges={dayChanges} watchlist={watchlist} rate={rate}
              calendars={calendars} net={net} />
          )}
          </TabPanel>

          {/* Projeksiyon kendi sekmesinde: Özet'in dibinde dururken oraya
              varmak için bütün sayfayı kaydırmak gerekiyordu, üstelik geri
              kalanı "şu an ne var" derken tek başına "ne olabilir" diyordu.
              Kart olduğu gibi taşındı — içindeki senaryolar, kaydetme ve
              grafik aynı bileşen. */}
          <TabPanel id="simulasyon">
            <Projection current={value} cur={cur} rate={rate} scenarios={scenarios} />
          </TabPanel>
      </main>
    </TabsProvider>
  );
}

function StatLine({ label, note, value, color, title }: {
  label: string; note?: string; value: string; color?: string; title?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 t-head" title={title}>
      {/* Dönem rozeti üst bardaki anahtarla AYNI kısaltmayı kullanır (S/G/H/…);
          uzun hâli title'da. Hangi sayının hangi dönemi ölçtüğü kartın kendi
          üstünde yazsın diye — bakış üst bara gitmek zorunda kalmasın. */}
      <span className="shrink-0" style={{ color: 'var(--muted)' }}>
        {label}
        {note && <span className="t-body tnum" style={{ color: 'var(--faint)' }}> · {note}</span>}
      </span>
      <span className="tnum truncate text-right font-medium" style={{ color: color ?? 'var(--text)' }}>{value}</span>
    </div>
  );
}

/**
 * Sayı rozeti — kur riski ve yoğunlaşma satırlarının ortak yapıtaşı. Dönemsel
 * kutularla aynı tonal aile (tone-up/down/warn/flat), tek satıra sığacak kadar
 * küçük. Renk tek başına anlam taşımasın diye her rozetin bir de title'ı var.
 */
function Chip({ tone, n, title }: { tone: string; n: number; title: string }) {
  return (
    <span
      className={`${tone} rounded-[var(--r-sm)] px-1.5 py-0.5 t-body tnum leading-none font-medium`}
      title={title}
    >
      {n}
    </span>
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
      <div className="t-head font-semibold tnum leading-tight mt-1 truncate">
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
