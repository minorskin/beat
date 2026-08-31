'use client';
import { useState, useTransition } from 'react';
import { updateInstrument, removeInstrument } from '@/app/actions';
import ConfirmDialog from './ConfirmDialog';
import type { AssetClass } from '@/lib/data';

/**
 * Var olan bir varlığın grup (sınıf), döviz, konum ve görünen adını düzenler.
 * Sembol ve fiyat kaynakları sabit kalır — onlar eklerken çözülüyor.
 *
 * Konum aslında İŞLEM bazında tutulur; buradan girilen değer varlığın tüm
 * işlemlerine yazılır. Bu yüzden birden fazla konumu olan bir varlıkta alan
 * boş açılır ve yalnız kullanıcı gerçekten değiştirirse güncelleme yapılır.
 */
export default function EditInstrument({
  id, symbol, displayName, classCode, currency, price, taxRate, txCount, positionLocations, classes, locations,
}: {
  id: string; symbol: string; displayName: string; classCode: string; currency: string;
  price: number | null; taxRate: number | null; txCount: number; positionLocations: string[];
  classes: AssetClass[]; locations: string[];
}) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState('');
  const [askDelete, setAskDelete] = useState(false);

  // Gayrimenkulün "fiyatı" kullanıcının girdiği değerlemedir — buradan güncellenir.
  const isRealty = classCode === 'realty';
  const single = positionLocations.length === 1 ? positionLocations[0] : '';
  const mixed = positionLocations.length > 1;

  const reset = () => { setOpen(false); setMsg(''); setAskDelete(false); };

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(true); }}
        className="shrink-0 text-[11px] leading-none opacity-50 hover:opacity-100"
        style={{ color: 'var(--muted)' }}
        title="Varlığı düzenle"
        aria-label="Varlığı düzenle"
      >
        ✎
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 whitespace-normal text-left normal-case tracking-normal"
          style={{ background: 'rgba(0,0,0,0.65)' }}
          onClick={(e) => { e.stopPropagation(); reset(); }}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            action={(fd) => start(async () => {
              const r = await updateInstrument(fd);
              setMsg(r.ok ? 'Kaydedildi ✓' : r.error || 'Hata');
              if (r.ok) setTimeout(reset, 1200);
            })}
            className="sheet w-full sm:max-w-md p-4 sm:p-5 grid grid-cols-2 gap-3 max-h-[90vh] overflow-y-auto"
          >
            <div className="col-span-2 flex items-center justify-between mb-1">
              <h2 className="text-sm font-medium">{symbol} — Varlığı Düzenle</h2>
              <button type="button" onClick={reset} className="seg text-[15px] leading-none" aria-label="Kapat">✕</button>
            </div>

            <input type="hidden" name="instrument_id" value={id} />

            <label className="col-span-2 text-[11px]" style={{ color: 'var(--muted)' }}>
              Görünen Ad
              <input name="display_name" required defaultValue={displayName} className="field mt-1" />
            </label>

            {isRealty && (
              <label className="col-span-2 text-[11px]" style={{ color: 'var(--muted)' }}>
                Güncel Değer (₺)
                <input
                  name="value" inputMode="decimal" className="field mt-1 tnum"
                  defaultValue={price != null ? String(price) : ''}
                  placeholder="ör. 25.000.000" autoComplete="off"
                />
                <span className="block mt-1" style={{ color: 'var(--faint)' }}>
                  Yeni değerleme bir sonraki turda (≤30 dk) fiyata yansır.
                </span>
              </label>
            )}

            <label className="col-span-2 sm:col-span-1 text-[11px]" style={{ color: 'var(--muted)' }}>
              Grup
              <select name="class_code" defaultValue={classCode} className="field mt-1">
                {classes.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
              </select>
            </label>

            <label className="col-span-2 sm:col-span-1 text-[11px]" style={{ color: 'var(--muted)' }}>
              Fiyat Para Birimi
              <select name="currency" defaultValue={currency} className="field mt-1 tnum">
                <option value="TRY">TRY</option>
                <option value="USD">USD</option>
              </select>
            </label>

            <label className="col-span-2 sm:col-span-1 text-[11px]" style={{ color: 'var(--muted)' }}>
              Kâr Vergisi (%) <span style={{ color: 'var(--faint)' }}>— boş: girilmedi</span>
              <input
                name="tax_rate" type="text" inputMode="decimal"
                pattern="[0-9]{1,3}([.,][0-9]{1,3})?"
                defaultValue={taxRate != null ? String(taxRate) : ''}
                placeholder="ör. 10" title="0 ile 100 arası bir oran (ör. 10 veya 12,5)"
                className="field mt-1 tnum"
              />
            </label>

            <label className="col-span-2 text-[11px]" style={{ color: 'var(--muted)' }}>
              Konum
              <input
                name="location" list={`ins-location-options-${id}`} autoComplete="off"
                defaultValue={single} className="field mt-1"
                placeholder={mixed ? `Karışık: ${positionLocations.join(', ')}` : 'ör. İş Yatırım'}
              />
              <datalist id={`ins-location-options-${id}`}>
                {locations.map((l) => <option key={l} value={l} />)}
              </datalist>
              <input type="hidden" name="orig_location" value={single} />
              <span className="block mt-1" style={{ color: 'var(--faint)' }}>
                {mixed
                  ? 'Bu varlığın işlemleri farklı konumlarda. Buraya yazarsan hepsi bu konuma taşınır.'
                  : 'Varlığın tüm işlemlerine yazılır. Tek tek ayırmak için işlem satırındaki ✎ kullan.'}
              </span>
            </label>

            <p className="col-span-2 text-[11px]" style={{ color: 'var(--faint)' }}>
              Para birimi, gelen FİYATIN hangi cinsten olduğudur — kaç liraya
              aldığın değil. Kaynağın verdiği fiyat TL ise TRY seç: USD seçilirse
              değer bir kez daha kurla çarpılır. Değiştirdiğinde bu varlığın tüm
              işlemleri de aynı birime geçer.
            </p>

            <div className="col-span-2 flex items-center gap-3 mt-1">
              <button type="submit" disabled={pending} className="btn btn-primary flex-1 sm:flex-none">
                {pending ? 'Kaydediliyor…' : 'Kaydet'}
              </button>
              {/* Silme kaydetmeden ayrı durur ve kendi onayını ister: geri
                  alınamayan tek eylem bu. */}
              <button
                type="button" disabled={pending}
                onClick={() => setAskDelete(true)}
                className="btn btn-danger ml-auto"
              >
                Sil
              </button>
              {msg && <span className="text-xs" style={{ color: 'var(--muted)' }}>{msg}</span>}
            </div>
          </form>
        </div>
      )}

      {askDelete && (
        <ConfirmDialog
          title={`${symbol} silinsin mi?`}
          danger
          confirmLabel="Kalıcı olarak sil"
          pending={pending}
          onCancel={() => setAskDelete(false)}
          onConfirm={() => start(async () => {
            const fd = new FormData();
            fd.set('instrument_id', id);
            fd.set('confirm', '1');
            const r = await removeInstrument(fd);
            if (r.ok) reset();
            else { setAskDelete(false); setMsg(r.error || 'Silinemedi'); }
          })}
          message={
            <>
              <b style={{ color: 'var(--text)' }}>{displayName}</b> katalogdan kaldırılacak.
              {txCount > 0
                ? <> Bu varlığa ait <b style={{ color: 'var(--text)' }}>{txCount} işlem</b>, fiyat geçmişi ve
                    geçmiş grafiklerdeki payı da silinir.</>
                : <> Bu varlığın işlemi yok; yalnız katalog kaydı ve fiyat geçmişi silinir.</>}
              <br />Bu işlem geri alınamaz.
            </>
          }
        />
      )}
    </>
  );
}
