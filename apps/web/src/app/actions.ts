'use server';
import { q, pool } from '@/lib/db';
import { CLASS_DEFAULTS, SYMBOL_RE, defaultsFor, symbolFromName } from '@/lib/catalog';
import { parseAmount } from '@/lib/format';
import { resolveInstrumentMeta, GOLD_OPTIONS } from '@/lib/resolve';
import { revalidatePath } from 'next/cache';

type Result = { ok: boolean; error?: string };

export async function addTransaction(formData: FormData): Promise<Result> {
  const instrument_id = String(formData.get('instrument_id') || '');
  const type = String(formData.get('type') || 'buy');
  const currency = String(formData.get('currency') || 'TRY');
  const executed_at = String(formData.get('executed_at') || '') || new Date().toISOString();
  const external = Number(formData.get('external_quantity') || 0) || 0;
  const location = String(formData.get('location') || '').trim() || null;

  if (!instrument_id) return { ok: false, error: 'Enstrüman zorunlu' };

  // 'transfer' = saf sahiplik düzeltmesi. Adet değişmez; yalnız emanet payı
  // delta olarak yazılır (negatif olabilir). Mevcut pozisyonları geriye dönük
  // paylaştırmak için tek yol bu.
  if (type === 'transfer') {
    if (!external) return { ok: false, error: 'Emanet adedi değişmiyor' };
    await q(
      `insert into transactions (instrument_id, type, quantity, external_quantity, currency, executed_at, note)
       values ($1,'transfer',0,$2,$3,$4,'emanet düzeltmesi')`,
      [instrument_id, external, currency, executed_at]);
    revalidatePath('/');
    return { ok: true };
  }

  const quantity = Number(formData.get('quantity'));
  const unit_price = formData.get('unit_price') ? Number(formData.get('unit_price')) : null;
  if (!quantity) return { ok: false, error: 'Adet zorunlu' };

  // Emanet payı yalnız alım/satımda anlamlı; diğer tiplerde adet değişmiyor.
  const ext = type === 'buy' || type === 'sell' ? external : 0;
  if (ext < 0) return { ok: false, error: 'Emanet adedi negatif olamaz' };
  if (ext > Math.abs(quantity)) return { ok: false, error: 'Emanet adedi işlem adedini aşamaz' };

  await q(
    `insert into transactions (instrument_id, type, quantity, external_quantity, unit_price, currency, executed_at, location)
     values ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [instrument_id, type, quantity, ext, unit_price, currency, executed_at, location]);
  revalidatePath('/');
  return { ok: true };
}

/**
 * Kataloğa yeni enstrüman ekler. Pozisyonu olmadığı sürece izleme listesinde
 * durur; fiyatı bir sonraki fetch turundan itibaren çekilmeye başlar.
 *
 * Görünen ad ve (gerekliyse) kaynak kodu kullanıcıdan istenmez — ilgili
 * kaynaktan (Yahoo/TEFAS/CoinGecko) otomatik çekilir; altın için sabit bir
 * listeden seçilir. Kullanıcı yalnız varlık sınıfı + sembol girer.
 */
export async function addInstrument(formData: FormData): Promise<Result> {
  const class_code = String(formData.get('class_code') || '');
  const def = CLASS_DEFAULTS[class_code];
  if (!def) return { ok: false, error: 'Geçersiz varlık sınıfı' };

  let symbol: string, display_name: string, provider_symbol: string;

  if (class_code === 'realty') {
    // Gayrimenkulün borsa kodu yok: kullanıcı mülkü adlandırır, sembolü addan
    // türetilir. Değerleme fiyat kaynağının kendisidir (constant sağlayıcı).
    display_name = String(formData.get('display_name') || '').trim();
    if (display_name.length < 2) return { ok: false, error: 'Mülkün adını yaz (ör. Ataşehir AVM)' };
    symbol = symbolFromName(display_name);
    if (!SYMBOL_RE.test(symbol)) return { ok: false, error: 'Ad en az 2 harf/rakam içermeli' };
    const value = parseAmount(String(formData.get('value') || ''));
    if (value == null || value <= 0) return { ok: false, error: 'Güncel değeri gir (ör. 25.000.000)' };
    provider_symbol = String(value);
  } else if (class_code === 'gold') {
    const goldCode = String(formData.get('gold_code') || '');
    const g = GOLD_OPTIONS.find((o) => o.code === goldCode);
    if (!g) return { ok: false, error: 'Altın türü seç' };
    symbol = g.symbol; display_name = g.display_name; provider_symbol = g.code;
  } else {
    symbol = String(formData.get('symbol') || '').trim().toUpperCase();
    if (!SYMBOL_RE.test(symbol)) return { ok: false, error: 'Sembol 2-20 karakter olmalı (harf, rakam, . veya -)' };
    if (class_code === 'fx' && symbol.length !== 6) return { ok: false, error: 'Döviz sembolü 6 harf olmalı (ör. GBPTRY)' };

    const resolved = await resolveInstrumentMeta(class_code, symbol);
    if ('error' in resolved) return { ok: false, error: resolved.error };
    display_name = resolved.display_name;
    provider_symbol = resolved.provider_symbol;
  }

  // Kâr vergisi oranı isteğe bağlı: boş bırakılırsa NULL ("girilmedi") yazılır.
  // 0 girmek ayrı bir bilgi ("vergi yok"), bu yüzden boş ≠ 0.
  const taxRaw = String(formData.get('tax_rate') || '').trim().replace(',', '.');
  let tax_rate: number | null = null;
  if (taxRaw) {
    const n = Number(taxRaw);
    if (!Number.isFinite(n) || n < 0 || n > 100) return { ok: false, error: 'Vergi oranı 0 ile 100 arasında olmalı' };
    tax_rate = n;
  }

  const dup = await q<{ symbol: string }>(`select symbol from instruments where symbol=$1`, [symbol]);
  if (dup.length) return { ok: false, error: `${symbol} zaten kayıtlı` };

  // Takvim/ritim/para birimi ve kaynak zinciri sembole göre çözülür — nakit
  // (TRYTRY) döviz sınıfının içinde yaşayan bir istisna.
  const d = defaultsFor(class_code, symbol, provider_symbol)!;
  const sources = d.sources;
  const client = await pool.connect();
  try {
    await client.query('begin');
    const ins = await client.query<{ id: string }>(
      `insert into instruments (class_code, symbol, display_name, currency, calendar_code, cadence, tax_rate)
       values ($1,$2,$3,$4,$5,$6,$7) returning id`,
      [class_code, symbol, display_name, d.currency, d.calendar, d.cadence, tax_rate]);
    const id = ins.rows[0].id;
    for (const s of sources) {
      await client.query(
        `insert into instrument_sources (instrument_id, provider_id, provider_symbol, priority)
         values ($1,$2,$3,$4)`,
        [id, s.provider, s.providerSymbol, s.priority]);
    }
    await client.query('commit');
  } catch (e) {
    await client.query('rollback');
    return { ok: false, error: e instanceof Error ? e.message : 'Eklenemedi' };
  } finally {
    client.release();
  }

  revalidatePath('/');
  return { ok: true };
}

/** Var olan bir işlemi düzenler — instrument_id sabit kalır, geri kalan alanlar yeniden yazılır. */
export async function updateTransaction(formData: FormData): Promise<Result> {
  const id = String(formData.get('id') || '');
  if (!id) return { ok: false, error: 'Kayıt yok' };
  const type = String(formData.get('type') || 'buy');
  const currency = String(formData.get('currency') || 'TRY');
  const executed_at = String(formData.get('executed_at') || '') || new Date().toISOString();
  const external = Number(formData.get('external_quantity') || 0) || 0;
  const location = String(formData.get('location') || '').trim() || null;

  if (type === 'transfer') {
    await q(
      `update transactions set type='transfer', quantity=0, external_quantity=$2, currency=$3, executed_at=$4, location=$5
       where id=$1`,
      [id, external, currency, executed_at, location]);
    revalidatePath('/');
    return { ok: true };
  }

  const quantity = Number(formData.get('quantity'));
  const unit_price = formData.get('unit_price') ? Number(formData.get('unit_price')) : null;
  if (!quantity) return { ok: false, error: 'Adet zorunlu' };

  const ext = type === 'buy' || type === 'sell' ? external : 0;
  if (ext < 0) return { ok: false, error: 'Emanet adedi negatif olamaz' };
  if (ext > Math.abs(quantity)) return { ok: false, error: 'Emanet adedi işlem adedini aşamaz' };

  await q(
    `update transactions set type=$2, quantity=$3, external_quantity=$4, unit_price=$5, currency=$6, executed_at=$7, location=$8
     where id=$1`,
    [id, type, quantity, ext, unit_price, currency, executed_at, location]);
  revalidatePath('/');
  return { ok: true };
}

/**
 * Kataloğa kayıtlı bir varlığın adını, grubunu, dövizini ve konumunu düzenler.
 * Sembol ve fiyat kaynakları dokunulmaz — onlar ekleme anında çözülüyor.
 *
 * Konum şemada TRANSACTION'a bağlı (bkz. 0003_location.sql); buradan girilen
 * değer varlığın tüm işlemlerine yazılır. Kullanıcı alanı değiştirmediyse
 * (orig_location ile aynıysa) işlemlere hiç dokunulmaz — böylece işlem işlem
 * ayrılmış konumlar yanlışlıkla tek değere ezilmez.
 */
export async function updateInstrument(formData: FormData): Promise<Result> {
  const instrument_id = String(formData.get('instrument_id') || '');
  if (!instrument_id) return { ok: false, error: 'Enstrüman yok' };
  const display_name = String(formData.get('display_name') || '').trim();
  if (!display_name) return { ok: false, error: 'Ad zorunlu' };

  const class_code = String(formData.get('class_code') || '').trim();
  if (!class_code) return { ok: false, error: 'Grup zorunlu' };
  const cls = await q<{ code: string }>(`select code from asset_classes where code=$1`, [class_code]);
  if (!cls.length) return { ok: false, error: 'Geçersiz grup' };

  const location = String(formData.get('location') || '').trim();
  const orig_location = String(formData.get('orig_location') || '').trim();

  // Yalnız gayrimenkul formunda var; boş bırakılırsa değerleme değişmez.
  const rawValue = String(formData.get('value') || '').trim();
  let newValue: number | null = null;
  if (rawValue) {
    newValue = parseAmount(rawValue);
    if (newValue == null || newValue <= 0) return { ok: false, error: 'Değer geçersiz (ör. 25.000.000)' };
  }

  // Grup değişince takvim/periyot da o grubun varsayılanına çekilir; aksi halde
  // motor varlığı yanlış saatlerde çekmeye devam ederdi. Nakit sembolleri
  // (TRYTRY) için varsayılan sembolden çözülür, sınıftan değil.
  const cur = await q<{ symbol: string }>(`select symbol from instruments where id=$1`, [instrument_id]);
  const def = cur.length ? defaultsFor(class_code, cur[0].symbol) : null;
  // Para birimi kullanıcı tercihi DEĞİL: fiyatın hangi cinsten geldiğini
  // kaynak belirler. Elle seçilebildiğinde yanlış seçim değeri sessizce kurla
  // ikinci kez çarpıyordu (450 gr altın 3,1M yerine 148M TL).
  const currency = def?.currency ?? 'TRY';

  const client = await pool.connect();
  try {
    await client.query('begin');
    if (def) {
      await client.query(
        `update instruments set display_name=$2, class_code=$3, currency=$4, calendar_code=$5, cadence=$6 where id=$1`,
        [instrument_id, display_name, class_code, currency, def.calendar, def.cadence]);
    } else {
      await client.query(
        `update instruments set display_name=$2, class_code=$3, currency=$4 where id=$1`,
        [instrument_id, display_name, class_code, currency]);
    }
    if (location !== orig_location) {
      await client.query(
        `update transactions set location=$2 where instrument_id=$1`,
        [instrument_id, location || null]);
    }
    // İşlemler enstrümanın para birimini izler: enstrüman TL fiyatlanıyorsa
    // alış bedeli de TL'dir. Grup değişip para birimi kaydığında eski
    // damgayla kalan işlemler maliyeti yanlış cinsten okuturdu.
    await client.query(
      `update transactions set currency=$2 where instrument_id=$1 and currency is distinct from $2`,
      [instrument_id, currency]);
    // Gayrimenkulde "fiyat" = kullanıcının girdiği değerleme; sabit
    // sağlayıcının provider_symbol'ünde durur. Yeni değer bir sonraki fetch
    // turunda (≤30 dk) fiyata yansır.
    if (newValue != null) {
      await client.query(
        `update instrument_sources set provider_symbol=$2
         where instrument_id=$1 and provider_id='constant'`,
        [instrument_id, String(newValue)]);
    }
    await client.query('commit');
  } catch (e) {
    await client.query('rollback');
    return { ok: false, error: e instanceof Error ? e.message : 'Güncellenemedi' };
  } finally {
    client.release();
  }

  revalidatePath('/');
  return { ok: true };
}

/** İzleme listesinden çıkarır. İşlem geçmişi varsa reddeder — veri kaybı olmasın. */
export async function removeInstrument(formData: FormData): Promise<Result> {
  const id = String(formData.get('instrument_id') || '');
  if (!id) return { ok: false, error: 'Enstrüman yok' };
  const used = await q<{ id: string }>(`select id from transactions where instrument_id=$1 limit 1`, [id]);
  if (used.length) return { ok: false, error: 'İşlem geçmişi var — silinemez' };
  await q(`delete from instruments where id=$1`, [id]);
  revalidatePath('/');
  return { ok: true };
}

export async function logout() {
  'use server';
  const { cookies } = await import('next/headers');
  (await cookies()).delete('beat_auth');
  const { redirect } = await import('next/navigation');
  redirect('/login');
}
