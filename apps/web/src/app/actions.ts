'use server';
import { q, pool } from '@/lib/db';
import { CLASS_DEFAULTS, SYMBOL_RE } from '@/lib/catalog';
import { revalidatePath } from 'next/cache';

type Result = { ok: boolean; error?: string };

export async function addTransaction(formData: FormData): Promise<Result> {
  const instrument_id = String(formData.get('instrument_id') || '');
  const type = String(formData.get('type') || 'buy');
  const currency = String(formData.get('currency') || 'TRY');
  const executed_at = String(formData.get('executed_at') || '') || new Date().toISOString();
  const external = Number(formData.get('external_quantity') || 0) || 0;

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
    `insert into transactions (instrument_id, type, quantity, external_quantity, unit_price, currency, executed_at)
     values ($1,$2,$3,$4,$5,$6,$7)`,
    [instrument_id, type, quantity, ext, unit_price, currency, executed_at]);
  revalidatePath('/');
  return { ok: true };
}

/**
 * Kataloğa yeni enstrüman ekler. Pozisyonu olmadığı sürece izleme listesinde
 * durur; fiyatı bir sonraki fetch turundan itibaren çekilmeye başlar.
 */
export async function addInstrument(formData: FormData): Promise<Result> {
  const class_code = String(formData.get('class_code') || '');
  const symbol = String(formData.get('symbol') || '').trim().toUpperCase();
  const display_name = String(formData.get('display_name') || '').trim();
  const provider_symbol = String(formData.get('provider_symbol') || '').trim();

  const def = CLASS_DEFAULTS[class_code];
  if (!def) return { ok: false, error: 'Geçersiz varlık sınıfı' };
  if (!SYMBOL_RE.test(symbol)) return { ok: false, error: 'Sembol 2-20 karakter olmalı (harf, rakam, . veya -)' };
  if (!display_name) return { ok: false, error: 'Görünen ad zorunlu' };
  if (def.needsProviderSymbol && !provider_symbol) return { ok: false, error: def.providerHint ?? 'Kaynak sembolü zorunlu' };
  if (class_code === 'fx' && symbol.length !== 6) return { ok: false, error: 'Döviz sembolü 6 harf olmalı (ör. GBPTRY)' };

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
