import { num } from '@/lib/format';

// Ağırlık yüzdesi — pct() işaretli (+%12,40) ve getiri için; ağırlık hiç
// negatif olmuyor, bir ondalık yetiyor.
const wpct = (frac: number) => `%${num(frac * 100, 1)}`;

export interface ConcItem { symbol: string; value: number }

/**
 * Yoğunlaşma (konsantrasyon) riski — 4'lü KPI satırının dördüncü kartı.
 *
 * Sayfadaki diğer üç kart "ne kadarım var / ne kazandım / hangi varlık öne
 * çıktı" sorularını cevaplıyor; hiçbiri **portföyün ne kadar tek bir kâğıda
 * bağlı olduğunu** söylemiyordu. Dağılım kutucukları (treemap) kırılımı
 * gösterir ama bunu bir SAYIYA indirmez — "ilk 3 varlık toplamın %71'i" gibi
 * bir eşiği oradan gözle kestirmek mümkün değil.
 *
 * Üç ölçü:
 *  • En büyük pozisyonun ağırlığı — tek isim riski.
 *  • İlk 3'ün payı — klasik CR3 yoğunlaşma oranı.
 *  • Etkin varlık sayısı = 1 / Σwᵢ²  (Herfindahl'ın tersi). "Kaç kalemim var"a
 *    değil "kaç kalem GİBİ dağılmışım"a cevap verir: 10 varlığın 9'u %1'se
 *    etkin sayı 1'e yaklaşır. Çeşitlendirmenin tek satırlık özeti.
 *
 * Ağırlıklar sayfanın geri kalanıyla aynı sepetten (alloc) gelir — sahiplik
 * ve para birimi anahtarları zaten orada uygulanmıştır, burada tekrar edilmez.
 */
export default function Concentration({ items }: { items: ConcItem[] }) {
  const total = items.reduce((a, it) => a + it.value, 0);
  // Değeri olmayan (fiyatı bekleyen) portföyde oran tanımsız — kart boş durur.
  if (total <= 0 || items.length === 0) {
    return (
      <div className="panel p-3 sm:p-4 flex flex-col">
        <Head />
        <div className="t-label flex-1 flex items-center" style={{ color: 'var(--faint)' }}>
          Ağırlık hesaplanacak değer yok.
        </div>
      </div>
    );
  }

  const sorted = [...items].sort((a, b) => b.value - a.value);
  const w = sorted.map((it) => it.value / total);       // fraksiyon (0–1)
  const top1 = w[0];
  const top3 = w.slice(0, 3).reduce((a, x) => a + x, 0);
  const hhi = w.reduce((a, x) => a + x * x, 0);
  const effective = hhi > 0 ? 1 / hhi : 0;

  // CR3 eşikleri: rekabet analizinden ödünç, portföye uyarlanmış. %50 altı
  // dağınık, %75 üstü tek elde toplanmış sayılır. Renk tek başına anlam
  // taşımasın diye eşiğin adı title'da yazılı.
  const level = top3 >= 0.75 ? 'yüksek' : top3 >= 0.5 ? 'orta' : 'düşük';
  const levelColor = top3 >= 0.75 ? 'var(--down)' : top3 >= 0.5 ? 'var(--c3)' : 'var(--up)';

  // Şerit: ilk üç varlık kendi payı kadar yer kaplar, kalan hepsi tek nötr blok.
  // Kutucuk dağılımının minyatürü DEĞİL — burada okunacak şey ilk üçün toplam
  // içinde ne kadar yer tuttuğu.
  const bar = [
    ...sorted.slice(0, 3).map((it, i) => ({
      key: it.symbol, frac: w[i], color: levelColor, opacity: 1 - i * 0.28,
      title: `${it.symbol} · ${wpct(w[i])}`,
    })),
    ...(w.length > 3
      ? [{ key: '__rest', frac: 1 - top3, color: 'var(--panel-3)', opacity: 1,
           title: `Kalan ${w.length - 3} varlık · ${wpct(1 - top3)}` }]
      : []),
  ];

  return (
    <div className="panel p-3 sm:p-4 flex flex-col" title={`Yoğunlaşma riski: ${level}`}>
      <Head />

      <div className="flex items-baseline gap-2 min-w-0">
        <div className="t-kpi font-semibold tnum truncate" style={{ color: levelColor }}>
          {wpct(top3)}
        </div>
        <div className="t-label truncate" style={{ color: 'var(--muted)' }}>ilk 3 varlık</div>
      </div>

      {/* Yığılı şerit — sayının görsel karşılığı. Yükseklik ince: kart bir
          grafik değil, gösterge. */}
      <div className="flex gap-0.5 mt-2 h-1.5 rounded-full overflow-hidden">
        {bar.map((s) => (
          <div
            key={s.key}
            title={s.title}
            style={{ width: `${Math.max(s.frac * 100, 0.5)}%`, background: s.color, opacity: s.opacity }}
          />
        ))}
      </div>

      <div className="mt-auto pt-3 space-y-1.5">
        <Row
          label="En büyük"
          note={sorted[0].symbol}
          value={wpct(top1)}
          title={`${sorted[0].symbol} tek başına portföyün ${wpct(top1)}'i — tek isim riski.`}
        />
        <Row
          label="Etkin varlık"
          value={`${num(effective, 1)} / ${items.length}`}
          title={'1 / Σ(ağırlık²) — Herfindahl endeksinin tersi. Portföy kaç EŞİT '
            + 'ağırlıklı varlık gibi dağılmış onu söyler; gerçek adede yaklaştıkça '
            + 'çeşitlendirme iyi, 1\'e yaklaştıkça portföy tek kâğıda bağlı demektir.'}
        />
        <Row
          label="Yoğunlaşma"
          value={level}
          color={levelColor}
          title="İlk 3'ün payı: %50 altı düşük · %50–75 orta · %75 üstü yüksek."
        />
      </div>
    </div>
  );
}

function Head() {
  return <div className="t-label mb-2 truncate" style={{ color: 'var(--muted)' }}>Yoğunlaşma Riski</div>;
}

// Birinci karttaki StatLine ile aynı ritim — dört kart tek dil konuşsun.
function Row({ label, note, value, color, title }: {
  label: string; note?: string; value: string; color?: string; title?: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 t-strong" title={title}>
      <span className="shrink-0" style={{ color: 'var(--muted)' }}>
        {label}
        {note && <span className="t-label" style={{ color: 'var(--faint)' }}> · {note}</span>}
      </span>
      <span className="tnum truncate text-right font-medium" style={{ color: color ?? 'var(--text)' }}>{value}</span>
    </div>
  );
}
