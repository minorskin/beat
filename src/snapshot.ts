/**
 * Beat snapshot motoru — Faz 2.
 * v_holdings (adet) × v_latest_price (son gözlemlenen fiyat) → saatlik portföy değeri.
 * İlkeler:
 *  - Değer HEM TRY HEM USD tutulur (USDTRY 7/24 oynar; TL değeri piyasa kapalıyken bile değişir).
 *  - Piyasa kapalıyken son fiyat TAŞINIR ama is_stale=true + gerçek price_ts ile işaretlenir.
 *  - ts = saat başına yuvarlanır (date_trunc('hour')). Aynı saatte tekrar çalışırsa günceller.
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
  quantity: number; avg_cost: number | null;
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
    select h.instrument_id, h.symbol, h.class_code, h.currency, h.quantity, h.avg_cost,
           lp.price, lp.price_ts, i.cadence
    from v_holdings h
    join instruments i on i.id = h.instrument_id
    left join v_latest_price lp on lp.instrument_id = h.instrument_id
    where h.quantity <> 0
    order by h.class_code, h.symbol`);

  const now = new Date();
  const positions: {
    instrument_id: string; quantity: number; price: number; price_ts: Date; is_stale: boolean;
    value_try: number; value_usd: number;
  }[] = [];
  let totalTry = 0, totalUsd = 0, totalCostTry = 0;
  const missing: string[] = [];

  for (const r of rows) {
    if (r.price == null || r.price_ts == null) { missing.push(r.symbol); continue; }
    // Değeri enstrümanın para biriminden TRY ve USD'ye çevir.
    let valueTry: number, valueUsd: number;
    if (r.currency === 'TRY') { valueTry = r.quantity * r.price; valueUsd = valueTry / usdtry; }
    else if (r.currency === 'USD') { valueUsd = r.quantity * r.price; valueTry = valueUsd * usdtry; }
    else { missing.push(`${r.symbol}(${r.currency}?)`); continue; }

    const ageSec = (now.getTime() - new Date(r.price_ts).getTime()) / 1000;
    const isStale = ageSec > (STALE_WINDOW[r.cadence] ?? 6 * 3600);

    // Maliyet (yaklaşık): ortalama maliyet × adet, güncel kurla TRY'ye.
    const costNative = (r.avg_cost ?? 0) * r.quantity;
    const costTry = r.currency === 'USD' ? costNative * usdtry : costNative;

    totalTry += valueTry; totalUsd += valueUsd; totalCostTry += costTry;
    positions.push({ instrument_id: r.instrument_id, quantity: r.quantity, price: r.price,
      price_ts: new Date(r.price_ts), is_stale: isStale, value_try: valueTry, value_usd: valueUsd });
  }

  const unrealizedTry = totalTry - totalCostTry;

  // Saat başına yuvarlanmış tek snapshot (idempotent).
  const client = await pool.connect();
  try {
    await client.query('begin');
    const snap = await client.query<{ id: string }>(`
      insert into portfolio_snapshots (ts, granularity, total_value_try, total_value_usd, total_cost_try, unrealized_pnl_try)
      values (date_trunc('hour', now()), $1, $2, $3, $4, $5)
      on conflict (granularity, ts) do update set
        total_value_try=excluded.total_value_try, total_value_usd=excluded.total_value_usd,
        total_cost_try=excluded.total_cost_try, unrealized_pnl_try=excluded.unrealized_pnl_try
      returning id`, [kind, totalTry, totalUsd, totalCostTry, unrealizedTry]);
    const snapId = snap.rows[0].id;
    await client.query(`delete from position_snapshots where snapshot_id=$1`, [snapId]);
    for (const p of positions) {
      await client.query(`
        insert into position_snapshots
          (snapshot_id, instrument_id, quantity, price, price_ts, is_stale, value_try, value_usd, weight_pct)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [snapId, p.instrument_id, p.quantity, p.price, p.price_ts, p.is_stale,
         p.value_try, p.value_usd, totalTry > 0 ? (p.value_try / totalTry) * 100 : 0]);
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
    console.log(`${p.is_stale ? '~' : ' '} ${r.symbol.padEnd(10)} ${p.value_try.toFixed(2).padStart(14)} TL  %${((p.value_try / totalTry) * 100).toFixed(1).padStart(5)}`);
  }
  console.log('─'.repeat(70));
  console.log(`TOPLAM  ${totalTry.toFixed(2)} TL  /  ${totalUsd.toFixed(2)} USD`);
  console.log(`MALİYET ${totalCostTry.toFixed(2)} TL   K/Z ${unrealizedTry >= 0 ? '+' : ''}${unrealizedTry.toFixed(2)} TL (%${pnlPct.toFixed(2)})`);
  if (missing.length) console.log(`fiyatı olmayan: ${missing.join(', ')}`);
  console.log(`(~ = taşınmış/stale fiyat)\n`);

  await pool.end();
}

main().catch(async (e) => { console.error(e); try { await pool.end(); } catch {} process.exit(1); });
