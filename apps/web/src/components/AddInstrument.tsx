'use client';
import { useState, useTransition } from 'react';
import { addInstrument } from '@/app/actions';
import { CLASS_DEFAULTS, defaultsFor, symbolFromName } from '@/lib/catalog';
import { GOLD_OPTIONS, INDEX_OPTIONS } from '@/lib/resolve';
import { byCode, scheduleLabel, tzLabel } from '@/lib/schedule';
import type { AssetClass, Calendar } from '@/lib/data';

/**
 * Henüz sahip olunmayan bir enstrümanı kataloğa ekler.
 * Kullanıcı yalnız varlık sınıfı + sembol girer (altında sabit bir listeden
 * seçer) — görünen ad ve kaynak kodu sunucu tarafında otomatik çözülür.
 */
// Takvim kodu ("HISSE_TR") kullanıcıya bir şey anlatmaz; planın kendisi anlatır.
// Gün/aralık/sıklık veritabanından okunup insan diline çevriliyor (lib/schedule).

export default function AddInstrument({ classes, calendars }: { classes: AssetClass[]; calendars: Calendar[] }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState('');
  const [cls, setCls] = useState('stock_us');
  const [symbol, setSymbol] = useState('');
  const [name, setName] = useState('');

  const cals = byCode(calendars);
  const def = CLASS_DEFAULTS[cls];
  const isGold = cls === 'gold';
  const isIndex = cls === 'index';
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
            ) : isIndex ? (
              <label className="col-span-2 t-label" style={{ color: 'var(--muted)' }}>
                Endeks / Çapraz Kur
                <select name="index_code" className="field mt-1" required defaultValue="">
                  <option value="" disabled>Seç…</option>
                  {INDEX_OPTIONS.map((x) => <option key={x.code} value={x.code}>{x.display_name}</option>)}
                </select>
                <span className="block mt-1" style={{ color: 'var(--faint)' }}>
                  Tutulan varlık değil, referans: izleme satırı olarak listelenir,
                  hesaba ve özet sekmesine girmez.
                </span>
              </label>
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

            {/* Tam genişlik: altındaki açıklama iki satıra sığmıyordu ve yarım
                sütunda kaldığında bir sonraki satıra taşarak Kâr Vergisi ile
                Yönetim Ücreti'ni birbirinden ayırıyordu — o ikisi yan yana
                dursun diye bu alan kendi satırını alıyor. */}
            <label className="col-span-2 t-label" style={{ color: 'var(--muted)' }}>
              Kur Riski
              {/* Değer TRY/USD kalıyor (şema para birimi bekliyor); etiket
                  kullanıcının sorduğu soruyu soruyor: TL dışı bir para birimine
                  bağlı mı, değil mi. */}
              <select name="currency" key={eff?.currency ?? 'x'} defaultValue={eff?.currency ?? 'TRY'} className="field mt-1">
                <option value="TRY">Yok</option>
                <option value="USD">Var</option>
              </select>
              <span className="block mt-1" style={{ color: 'var(--faint)' }}>
                Varlık TL dışı bir para birimine bağlıysa “Var”. Gruba göre seçili gelir, gerekirse değiştir.
              </span>
            </label>

            {/* Net görünümün iki kesintisi. Aynı biçimde girilirler ama matrahları
                ayrı: vergi KÂRDAN, yönetim ücreti GÜNCEL TUTARDAN kesilir — bu
                yüzden yan yana duruyorlar ve açıklamaları ortak. */}
            <label className="col-span-2 sm:col-span-1 t-label" style={{ color: 'var(--muted)' }}>
              Kâr Vergisi (%)
              {/* type=number DEĞİL: tarayıcı yerel ayarı İngilizce olduğunda
                  "12,5" geçersiz sayılıp alan sessizce boşalıyor. Metin olarak
                  alınıp sunucuda virgül noktaya çevriliyor. */}
              <input
                name="tax_rate" type="text" inputMode="decimal"
                pattern="[0-9]{1,3}([.,][0-9]{1,3})?" placeholder="ör. 10"
                title="0 ile 100 arası bir oran (ör. 10 veya 12,5)"
                className="field mt-1 tnum"
              />
            </label>

            <label className="col-span-2 sm:col-span-1 t-label" style={{ color: 'var(--muted)' }}>
              Yönetim Ücreti (%)
              <input
                name="mgmt_fee_rate" type="text" inputMode="decimal"
                pattern="[0-9]{1,3}([.,][0-9]{1,3})?" placeholder="ör. 2"
                title="0 ile 100 arası bir oran (ör. 2 veya 1,5)"
                className="field mt-1 tnum"
              />
            </label>

            <p className="col-span-2 t-label -mt-1" style={{ color: 'var(--faint)' }}>
              İkisi de yalnız <b style={{ color: 'var(--muted)' }}>Net</b> görünümde kesilir: vergi
              kârdan, yönetim ücreti varlığın güncel tutarından. Biri, ikisi ya da hiçbiri
              olabilir; bilmiyorsan boş bırak.
            </p>

            {eff && !isGold && (
              <div className="col-span-2 t-label" style={{ color: 'var(--faint)' }}>
                <span className="tnum">{eff.currency}</span> · güncelleme {scheduleLabel(cals[eff.calendar])}{tzLabel(cals[eff.calendar])}
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
