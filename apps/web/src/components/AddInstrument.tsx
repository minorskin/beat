'use client';
import { useState, useTransition } from 'react';
import { addInstrument } from '@/app/actions';
import { CLASS_DEFAULTS, defaultsFor, symbolFromName } from '@/lib/catalog';
import { GOLD_OPTIONS } from '@/lib/resolve';
import type { AssetClass } from '@/lib/data';

/**
 * Henüz sahip olunmayan bir enstrümanı kataloğa ekler.
 * Kullanıcı yalnız varlık sınıfı + sembol girer (altında sabit bir listeden
 * seçer) — görünen ad ve kaynak kodu sunucu tarafında otomatik çözülür.
 */
// Teknik kodlar kullanıcıya bir şey anlatmıyor: "CRYPTO_24_7" gayrimenkulde
// düpedüz kafa karıştırıcı. Aynı bilgiyi insan diliyle yazıyoruz.
const CAL_LABEL: Record<string, string> = {
  CRYPTO_24_7: '7/24', FX_24_5: 'hafta içi 7/24', BIST: 'BIST seansı',
  NYSE: 'NYSE seansı', TEFAS_DAILY: 'TEFAS kapanışı',
};
const CADENCE_LABEL: Record<string, string> = {
  hourly: 'saatlik', market_hours: 'seans içi saatlik', daily_close: 'günlük',
};

export default function AddInstrument({ classes }: { classes: AssetClass[] }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState('');
  const [cls, setCls] = useState('stock_us');
  const [symbol, setSymbol] = useState('');
  const [name, setName] = useState('');

  const def = CLASS_DEFAULTS[cls];
  const isGold = cls === 'gold';
  const isRealty = cls === 'realty';
  // Bilgi satırı yazılan sembole göre çözülür: nakit (TRYTRY) döviz sınıfının
  // içinde ama takvimi 7/24 — sınıf varsayılanını göstermek yanlış olurdu.
  const eff = defaultsFor(cls, isRealty ? symbolFromName(name) : symbol.toUpperCase());

  const reset = () => { setOpen(false); setMsg(''); setSymbol(''); setName(''); };

  return (
    <>
      <button onClick={() => setOpen(true)} className="btn btn-ghost">+ Enstrüman</button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
          style={{ background: 'rgba(0,0,0,0.65)' }}
          onClick={reset}
        >
          <form
            onClick={(e) => e.stopPropagation()}
            action={(fd) => start(async () => {
              const r = await addInstrument(fd);
              setMsg(r.ok ? 'Eklendi ✓ — fiyatı bir sonraki turda gelir' : r.error || 'Hata');
              if (r.ok) setTimeout(reset, 1600);
            })}
            className="sheet w-full sm:max-w-md p-4 sm:p-5 grid grid-cols-2 gap-3 max-h-[90vh] overflow-y-auto"
          >
            <div className="col-span-2 flex items-center justify-between mb-1">
              <h2 className="t-head font-medium">Enstrüman Ekle</h2>
              <button type="button" onClick={reset} className="seg t-icon leading-none" aria-label="Kapat">✕</button>
            </div>

            <p className="col-span-2 t-label -mt-2" style={{ color: 'var(--faint)' }}>
              {isRealty
                ? 'Mülkü adıyla tanımla ve güncel değerini gir. Sonra “+ İşlem” ile adet 1, birim fiyat = alış bedeli olarak kaydet; kâr/zarar değerleme ile alış farkından çıkar.'
                : 'Henüz almadığın bir varlığı ekle; izleme listesinde durur, fiyatı çekilmeye başlar. İlk alımı girdiğinde kendiliğinden pozisyona döner. Ad ve kaynak otomatik çözülür.'}
            </p>

            <label className="col-span-2 t-label" style={{ color: 'var(--muted)' }}>
              Varlık Sınıfı
              <select name="class_code" className="field mt-1" value={cls} onChange={(e) => setCls(e.target.value)}>
                {classes.filter((c) => CLASS_DEFAULTS[c.code]).map((c) => (
                  <option key={c.code} value={c.code}>{c.name}</option>
                ))}
              </select>
            </label>

            {isRealty ? (
              <>
                <label className="col-span-2 t-label" style={{ color: 'var(--muted)' }}>
                  Mülkün Adı
                  <input
                    name="display_name" required className="field mt-1"
                    value={name} onChange={(e) => setName(e.target.value)}
                    placeholder="ör. Ataşehir AVM" autoComplete="off"
                  />
                  <span className="block mt-1" style={{ color: 'var(--faint)' }}>
                    {name.trim().length >= 2
                      ? `Sembol: ${symbolFromName(name)}`
                      : 'Sembol addan türetilir (Ataşehir AVM → ATASEHIR-AVM).'}
                  </span>
                </label>
                <label className="col-span-2 t-label" style={{ color: 'var(--muted)' }}>
                  Güncel Değer (₺)
                  <input
                    name="value" required inputMode="decimal" className="field mt-1 tnum"
                    placeholder="ör. 25.000.000" autoComplete="off"
                  />
                  <span className="block mt-1" style={{ color: 'var(--faint)' }}>
                    Borsada işlem görmediği için fiyatı sen belirlersin; sonradan
                    varlık satırındaki ✎ ile güncellersin.
                  </span>
                </label>
              </>
            ) : isGold ? (
              <label className="col-span-2 t-label" style={{ color: 'var(--muted)' }}>
                Altın Türü
                <select name="gold_code" className="field mt-1" required defaultValue="">
                  <option value="" disabled>Seç…</option>
                  {GOLD_OPTIONS.map((g) => <option key={g.code} value={g.code}>{g.display_name}</option>)}
                </select>
              </label>
            ) : (
              <label className="col-span-2 t-label" style={{ color: 'var(--muted)' }}>
                Sembol
                <input
                  name="symbol" required className="field mt-1 tnum uppercase"
                  value={symbol} onChange={(e) => setSymbol(e.target.value)}
                  autoCapitalize="characters" autoCorrect="off" spellCheck={false}
                />
                <span className="block mt-1" style={{ color: 'var(--faint)' }}>{def?.symbolHint}</span>
              </label>
            )}

            <label className="col-span-2 sm:col-span-1 t-label" style={{ color: 'var(--muted)' }}>
              Kur Riski
              <select name="currency" key={eff?.currency ?? 'x'} defaultValue={eff?.currency ?? 'TRY'} className="field mt-1 tnum">
                <option value="TRY">TRY</option>
                <option value="USD">USD</option>
              </select>
              <span className="block mt-1" style={{ color: 'var(--faint)' }}>
                Varlığın hangi para birimine bağlı olduğu. Gruba göre seçili gelir, gerekirse değiştir.
              </span>
            </label>

            <label className="col-span-2 sm:col-span-1 t-label" style={{ color: 'var(--muted)' }}>
              Kâr Vergisi (%) <span style={{ color: 'var(--faint)' }}>— isteğe bağlı</span>
              {/* type=number DEĞİL: tarayıcı yerel ayarı İngilizce olduğunda
                  "12,5" geçersiz sayılıp alan sessizce boşalıyor. Metin olarak
                  alınıp sunucuda virgül noktaya çevriliyor. */}
              <input
                name="tax_rate" type="text" inputMode="decimal"
                pattern="[0-9]{1,3}([.,][0-9]{1,3})?" placeholder="ör. 10"
                title="0 ile 100 arası bir oran (ör. 10 veya 12,5)"
                className="field mt-1 tnum"
              />
              <span className="block mt-1" style={{ color: 'var(--faint)' }}>
                Kâr üzerinden kesilecek vergi oranı. Bilmiyorsan boş bırak.
              </span>
            </label>

            {eff && !isGold && (
              <div className="col-span-2 t-label" style={{ color: 'var(--faint)' }}>
                <span className="tnum">{eff.currency}</span> · fiyat {CADENCE_LABEL[eff.cadence] ?? eff.cadence}
                {' · '}{CAL_LABEL[eff.calendar] ?? eff.calendar}
                {eff.sources[0]?.provider === 'constant' && ' · sabit değer (kaynak yok)'}
              </div>
            )}

            <div className="col-span-2 flex items-center gap-3 mt-1">
              <button type="submit" disabled={pending} className="btn btn-primary flex-1 sm:flex-none">
                {pending ? 'Ekleniyor…' : 'Ekle'}
              </button>
              {msg && <span className="t-body" style={{ color: 'var(--muted)' }}>{msg}</span>}
            </div>
          </form>
        </div>
      )}
    </>
  );
}
