/**
 * Beat geçmiş onarımı — geriye dönük işlemler grafiğe de yansısın.
 *
 * Snapshot'lar saat başı yazılan TARİHSEL kayıtlar: motor her turda "şu an
 * elimde ne var" diye bakar. Bu yüzden bir işlemin tarihi geriye çekildiğinde
 * (ya da geçmişe dönük yeni bir işlem girildiğinde) canlı sayılar anında
 * düzelir ama grafik işlemi hâlâ deftere GİRDİĞİ anda gösterir. Bu araç o
 * andan sonraki snapshot'ları defterle yeniden hizalar.
 *
 * Hesabın kendisi veritabanında (bkz. migration 0022, rebuild_snapshots):
 * arayüzün sunucu eylemleri de aynı fonksiyonu çağırıyor, yani onarım tek
 * yerde tanımlı. Bu CLI elle/toplu düzeltmeler için.
 *
 *   npm run rebuild -- 2026-09-09T13:00:00Z          # kuru çalıştırma (yazmaz)
 *   npm run rebuild -- 2026-09-09T13:00:00Z --apply  # yazar
 *   npm run rebuild -- 2026-08-01T00:00:00Z --force  # defter başlangıcının altına in
 *
 * Başlangıç anı ZORUNLU: argümansız bir "hepsini onar" defterin bugünkü halini
 * portföyün en eski snapshot'ına kadar geriye yansıtırdı. Aynı gerekçeyle
 * onarım app_settings.ledger_epoch'un altına inmez — o tarihten önce defter
 * eksikti, snapshot'lar ise o gün beyan edilmiş gerçeği taşıyor. --force bu
 * tabanı bilerek aşar.
 *
 * Fiyatlara DOKUNULMAZ: her snapshot kendi kayıtlı fiyatını korur; yalnız
 * adetler ve onlardan türeyen tutarlar yeniden hesaplanır.
 */
import './core/env.js';
import { pool } from './core/db.js';

const fmt = (n: number) => n.toLocaleString('tr-TR', { maximumFractionDigits: 0 });

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const force = args.includes('--force');
  const fromRaw = args.find((a) => !a.startsWith('--'));

  if (!fromRaw) {
    console.error('Kullanım: npm run rebuild -- <ISO tarih> [--apply]');
    console.error('Örnek   : npm run rebuild -- 2026-09-09T13:00:00Z --apply');
    await pool.end(); process.exit(1);
  }
  const from = new Date(fromRaw);
  if (Number.isNaN(from.getTime())) {
    console.error(`Tarih anlaşılmadı: ${fromRaw}`);
    await pool.end(); process.exit(1);
  }

  const client = await pool.connect();
  try {
    await client.query('begin');

    // Taban (defter başlangıcı) başlangıcı ileri çekebilir — kapsam raporu da
    // gerçekten taranan aralığı göstersin.
    const epoch = (await client.query<{ value: string }>(
      `select value from app_settings where key='ledger_epoch'`)).rows[0]?.value;
    const clamped = !force && epoch && new Date(epoch) > from;
    const start = clamped ? new Date(epoch!) : from;

    // Öncesi/sonrası kıyası: onarım yalnız GERÇEKTEN değişen snapshot'lara
    // dokunuyor, o yüzden "kaç satır değişti" tek başına anlamlı bir çıktı.
    const before = await client.query<{ ts: string; total_value_try: string }>(
      `select ts, total_value_try from portfolio_snapshots
        where granularity='hourly' and ts >= date_trunc('hour', $1::timestamptz) order by ts`, [start]);

    const res = await client.query<{ rebuilt_at: string; positions: number }>(
      `select * from rebuild_snapshots($1, $2)`, [from, force]);

    const after = new Map((await client.query<{ ts: string; total_value_try: string }>(
      `select ts, total_value_try from portfolio_snapshots
        where granularity='hourly' and ts >= date_trunc('hour', $1::timestamptz) order by ts`, [start]))
      .rows.map((r) => [new Date(r.ts).toISOString(), Number(r.total_value_try)]));

    console.log(`\nBeat geçmiş onarımı · ${start.toISOString()} sonrası`);
    if (clamped) {
      console.log(`taban: defter başlangıcı ${epoch} — başlangıç oraya çekildi (aşmak için --force)`);
    }
    console.log(`kapsam: ${before.rows.length} snapshot · değişen: ${res.rows.length}`);
    console.log('─'.repeat(72));
    for (const r of res.rows) {
      const key = new Date(r.rebuilt_at).toISOString();
      const old = Number(before.rows.find((b) => new Date(b.ts).toISOString() === key)?.total_value_try ?? 0);
      const now = after.get(key) ?? 0;
      const d = now - old;
      console.log(`${key}  ${fmt(old).padStart(14)} → ${fmt(now).padStart(14)} TL  ` +
                  `(${d >= 0 ? '+' : ''}${fmt(d)})  ${r.positions} pozisyon`);
    }
    console.log('─'.repeat(72));

    if (apply) {
      await client.query('commit');
      console.log('YAZILDI ✓\n');
    } else {
      await client.query('rollback');
      console.log('kuru çalıştırma — hiçbir şey yazılmadı (yazmak için --apply)\n');
    }
  } catch (e) {
    await client.query('rollback');
    throw e;
  } finally {
    client.release();
  }
  await pool.end();
}

main().catch(async (e) => { console.error(e); try { await pool.end(); } catch {} process.exit(1); });
