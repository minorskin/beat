/**
 * Yoğunluk (konsantrasyon) eşikleri — TEK KAYNAK.
 *
 * Aynı kural üç yerde çiziliyor: özet kartındaki rozet satırı, dağılım
 * kutucuklarındaki nokta ve ikisinin title'ları. Eşik sayısı koda üç kez
 * yazılırsa biri değişip diğerleri kalır; kart "2 riskli" derken kutucuk
 * yeşil gösterir. Onun için burada duruyor.
 *
 * Eşikler PAY üzerinden: bir varlık portföyün üçte birini geçtiyse artık
 * portföy o varlığın kendisidir (yüksek), beşte biri aşmışsa dikkat ister
 * (orta), altındaysa dağılım sağlıklı (düşük).
 */
export const CONC_HIGH = 33;   // % — üstü: tek isim riski
export const CONC_MID = 20;    // % — bu ile CONC_HIGH arası: izlenmeli

export type ConcLevel = 'high' | 'mid' | 'low';

/** share: portföy içindeki pay, YÜZDE olarak (0–100). */
export const concLevel = (share: number): ConcLevel =>
  share > CONC_HIGH ? 'high' : share >= CONC_MID ? 'mid' : 'low';

// Renk tek başına anlam taşımasın diye her seviyenin bir de adı var; ikisi
// hep birlikte kullanılıyor (nokta + title).
export const CONC_COLOR: Record<ConcLevel, string> = {
  high: 'var(--down)', mid: 'var(--warn)', low: 'var(--up)',
};
export const CONC_LABEL: Record<ConcLevel, string> = {
  high: 'yüksek', mid: 'orta', low: 'düşük',
};
export const CONC_NOTE: Record<ConcLevel, string> = {
  high: `payı %${CONC_HIGH} üstünde — yoğunluk riski yüksek`,
  mid: `payı %${CONC_MID}–${CONC_HIGH} arasında — yoğunluk riski orta`,
  low: `payı %${CONC_MID} altında — yoğunluk riski düşük`,
};
