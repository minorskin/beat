/**
 * Beat snapshot motoru — Faz 2.
 * v_holdings (adet) × v_latest_price (son gözlemlenen fiyat) → saatlik portföy değeri.
 * İlkeler:
 *  - Değer HEM TRY HEM USD tutulur (USDTRY 7/24 oynar; TL değeri piyasa kapalıyken bile değişir).
 *  - Piyasa kapalıyken son fiyat TAŞINIR ama is_stale=true + gerçek price_ts ile işaretlenir.
 *  - ts = saat başına yuvarlanır (date_trunc('hour')). Aynı saatte tekrar çalışırsa günceller.
 *  - Sahiplik ayrı bir boyut: adetin bir kısmı başkası adına tutuluyor olabilir
 *    (v_holdings.external_qty). Her büyüklük HEM toplam HEM "bana ait" olarak yazılır,
 *    böylece arayüzdeki Toplam/Bana Ait anahtarı geçmiş grafiklerde de doğru çalışır.
 */
import './core/env.js';
import { pool } from './core/db.js';

// Bir gözlemin "taze" sayıldığı azami yaş (saniye) — cadence'e göre.
const STALE_WINDOW: Record<string, number> = {
  hourly: 3 * 3600,       // kripto/döviz/altın: 3 saatten eskiyse taşınmış
  market_hours: 6 * 3600, // hisse: seans içi son tick 6 saati aşmışsa (kapalı) taşınmış
  daily_close: 30 * 3600, // fon NAV: 30 saatten eskiyse taşınmış
};

interface Row {
  instrument_id: string; symbol: string; class_code: string; currency: string;
  quantity: number; external_qty: number; own_quantity: number; avg_cost: number | null;
  price: number | null; price_ts: Date | null; cadence: string;
}

async function main() {
  const kind = process.argv[2] ?? 'hourly';

  // USD/TRY: değer çevriminin çapası. fx_rates'ten en güncel.
  const fxRes = await pool.query<{ rate: number }>(
    `select rate from fx_rates where base='USD' and quote='TRY' order by ts desc limit 1`);
  const usdtry = fxRes.rows[0]?.rate;
  if (!usdtry) { console.error('USDTRY kuru yok — önce fetch çalışmalı.'); await pool.end(); process.exit(1); }

  const { rows } = await pool.query<Row>(`
    select h.instrument_id, h.symbol, h.class_code, h.currency,
           h.quantity, h.external_qty, h.own_quantity, h.avg_cost,
           lp.price, lp.price_ts, i.cadence
    from v_holdings h
    join instruments i on i.id = h.instrument_id
    left join v_latest_price lp on lp.instrument_id = h.instrument_id
    where h.quantity <> 0
    order by h.class_code, h.symbol`);

  const now = new Date();
  const positions: {
    instrument_id: string; quantity: number; own_quantity: number;
    price: number; price_ts: Date; is_stale: boolean;
    value_try: number; value_usd: number; own_value_try: number; own_value_usd: number;
  }[] = [];
  let totalTry = 0, totalUsd = 0, totalCostTry = 0;
  let ownTry = 0, ownUsd = 0, ownCostTry = 0;
  // Maliyeti BİLİNEN pozisyonların değeri. Kâr/zarar yalnız bunlar üzerinden
  // hesaplanır: alış fiyatı girilmemiş bir varlığın maliyeti 0 değil, MEÇHUL.
  // İkisini eşitlemek portföyün tamamını "kâr" gösteriyordu (20M girişte
  // +17,7M kâr gibi).
  let costedTry = 0, ownCostedTry = 0;
  const missing: string[] = [];

  for (const r of rows) {
    if (r.price == null || r.price_ts == null) { missing.push(r.symbol); continue; }
    if (r.currency !== 'TRY' && r.currency !== 'USD') { missing.push(`${r.symbol}(${r.currency}?)`); continue; }

    // Değeri enstrümanın para biriminden TRY'ye çevir. Aynı fiyat,
    // iki farklı adet: toplam ve bana ait olan.
    const price = r.price;
    const toTry = (qty: number) => (r.currency === 'USD' ? qty * price * usdtry : qty * price);

    const valueTry = toTry(r.quantity);
    const valueUsd = valueTry / usdtry;
    const ownValueTry = toTry(r.own_quantity);
    const ownValueUsd = ownValueTry / usdtry;

    const ageSec = (now.getTime() - new Date(r.price_ts).getTime()) / 1000;
    const isStale = ageSec > (STALE_WINDOW[r.cadence] ?? 6 * 3600);

    // Maliyet (yaklaşık): ortalama maliyet × adet, güncel kurla TRY'ye.
    const cost = (qty: number) => {
      const native = (r.avg_cost ?? 0) * qty;
      return r.currency === 'USD' ? native * usdtry : native;
    };
    const hasCost = (r.avg_cost ?? 0) > 0;

    totalTry += valueTry; totalUsd += valueUsd;
    ownTry += ownValueTry; ownUsd += ownValueUsd;
    if (hasCost) {
      totalCostTry += cost(r.quantity);
      ownCostTry += cost(r.own_quantity);
      costedTry += valueTry;
      ownCostedTry += ownValueTry;
    }
    positions.push({ instrument_id: r.instrument_id, quantity: r.quantity, own_quantity: r.own_quantity,
      price: r.price, price_ts: new Date(r.price_ts), is_stale: isStale,
      value_try: valueTry, value_usd: valueUsd, own_value_try: ownValueTry, own_value_usd: ownValueUsd });
  }

  // Kâr/zarar = maliyeti bilinen pozisyonların değeri − maliyeti. Meçhul
  // maliyetli pozisyonlar toplam büyüklüğe girer ama bu farka karışmaz.
  const unrealizedTry = costedTry - totalCostTry;
  const ownUnrealizedTry = ownCostedTry - ownCostTry;

  // Saat başına yuvarlanmış tek snapshot (idempotent).
  const client = await pool.connect();
  try {
    await client.query('begin');
    const snap = await client.query<{ id: string }>(`
      insert into portfolio_snapshots (ts, granularity, total_value_try, total_value_usd,
                                       total_cost_try, unrealized_pnl_try,
                                       own_value_try, own_value_usd, own_cost_try, own_unrealized_pnl_try)
      values (date_trunc('hour', now()), $1, $2, $3, $4, $5, $6, $7, $8, $9)
      on conflict (granularity, ts) do update set
        total_value_try=excluded.total_value_try, total_value_usd=excluded.total_value_usd,
        total_cost_try=excluded.total_cost_try, unrealized_pnl_try=excluded.unrealized_pnl_try,
        own_value_try=excluded.own_value_try, own_value_usd=excluded.own_value_usd,
        own_cost_try=excluded.own_cost_try, own_unrealized_pnl_try=excluded.own_unrealized_pnl_try
      returning id`, [kind, totalTry, totalUsd, totalCostTry, unrealizedTry,
                      ownTry, ownUsd, ownCostTry, ownUnrealizedTry]);
    const snapId = snap.rows[0].id;
    await client.query(`delete from position_snapshots where snapshot_id=$1`, [snapId]);
    for (const p of positions) {
      await client.query(`
        insert into position_snapshots
          (snapshot_id, instrument_id, quantity, price, price_ts, is_stale, value_try, value_usd, weight_pct,
           own_quantity, own_value_try, own_value_usd, own_weight_pct)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [snapId, p.instrument_id, p.quantity, p.price, p.price_ts, p.is_stale,
         p.value_try, p.value_usd, totalTry > 0 ? (p.value_try / totalTry) * 100 : 0,
         p.own_quantity, p.own_value_try, p.own_value_usd,
         ownTry > 0 ? (p.own_value_try / ownTry) * 100 : 0]);
    }
    await client.query('commit');
  } catch (e) { await client.query('rollback'); throw e; }
  finally { client.release(); }

  // Özet
  const pnlPct = totalCostTry > 0 ? (unrealizedTry / totalCostTry) * 100 : 0;
  console.log(`\nBeat snapshot · ${kind} · USDTRY=${usdtry}`);
  console.log('─'.repeat(70));
  for (const p of positions) {
    const r = rows.find((x) => x.instrument_id === p.instrument_id)!;
    const emanet = r.external_qty ? `  (emanet ${r.external_qty})` : '';
    console.log(`${p.is_stale ? '~' : ' '} ${r.symbol.padEnd(10)} ${p.value_try.toFixed(2).padStart(14)} TL  %${((p.value_try / totalTry) * 100).toFixed(1).padStart(5)}${emanet}`);
  }
  console.log('─'.repeat(70));
  console.log(`TOPLAM  ${totalTry.toFixed(2)} TL  /  ${totalUsd.toFixed(2)} USD`);
  console.log(`MALİYET ${totalCostTry.toFixed(2)} TL   K/Z ${unrealizedTry >= 0 ? '+' : ''}${unrealizedTry.toFixed(2)} TL (%${pnlPct.toFixed(2)})`);
  console.log(`BANA AİT ${ownTry.toFixed(2)} TL  /  ${ownUsd.toFixed(2)} USD   K/Z ${ownUnrealizedTry >= 0 ? '+' : ''}${ownUnrealizedTry.toFixed(2)} TL`);
  if (missing.length) console.log(`fiyatı olmayan: ${missing.join(', ')}`);
  console.log(`(~ = taşınmış/stale fiyat)\n`);

  await pool.end();
}

main().catch(async (e) => { console.error(e); try { await pool.end(); } catch {} process.exit(1); });
