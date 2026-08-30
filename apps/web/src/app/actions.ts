'use server';
import { q, pool } from '@/lib/db';
import { CLASS_DEFAULTS, SYMBOL_RE } from '@/lib/catalog';
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

  if (class_code === 'gold') {
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

  const dup = await q<{ symbol: string }>(`select symbol from instruments where symbol=$1`, [symbol]);
  if (dup.length) return { ok: false, error: `${symbol} zaten kayıtlı` };

  const sources = def.sources(symbol, provider_symbol);
  const client = await pool.connect();
  try {
    await client.query('begin');
    const ins = await client.query<{ id: string }>(
      `insert into instruments (class_code, symbol, display_name, currency, calendar_code, cadence)
       values ($1,$2,$3,$4,$5,$6) returning id`,
      [class_code, symbol, display_name, def.currency, def.calendar, def.cadence]);
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

/** Kataloğa kayıtlı bir enstrümanın görünen adını düzenler. */
export async function updateInstrument(formData: FormData): Promise<Result> {
  const instrument_id = String(formData.get('instrument_id') || '');
  if (!instrument_id) return { ok: false, error: 'Enstrüman yok' };
  const display_name = String(formData.get('display_name') || '').trim();
  if (!display_name) return { ok: false, error: 'Ad zorunlu' };
  await q(`update instruments set display_name=$2 where id=$1`, [instrument_id, display_name]);
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
