'use server';
import { q } from '@/lib/db';
import { revalidatePath } from 'next/cache';

export async function addTransaction(formData: FormData) {
  const instrument_id = String(formData.get('instrument_id') || '');
  const type = String(formData.get('type') || 'buy');
  const quantity = Number(formData.get('quantity'));
  const unit_price = formData.get('unit_price') ? Number(formData.get('unit_price')) : null;
  const currency = String(formData.get('currency') || 'TRY');
  const executed_at = String(formData.get('executed_at') || '') || new Date().toISOString();

  if (!instrument_id || !quantity) return { ok: false, error: 'Enstrüman ve adet zorunlu' };

  await q(
    `insert into transactions (instrument_id, type, quantity, unit_price, currency, executed_at)
     values ($1,$2,$3,$4,$5,$6)`,
    [instrument_id, type, quantity, unit_price, currency, executed_at]);
  revalidatePath('/');
  return { ok: true };
}
