/**
 * Net / brüt görünümün TEK hesap yeri.
 *
 * Soru şu: "bugün çıksam elimde ne kalır?" Brüt görünüm piyasanın söylediği
 * tutardır; net görünüm ondan iki kesintiyi düşer:
 *
 *   yönetim ücreti — GÜNCEL TUTAR üzerinden (matrah = varlığın bugünkü değeri)
 *   vergi          — KÂR üzerinden          (matrah = değer − maliyet)
 *
 * ── Sıra neden bu ────────────────────────────────────────────────────────
 * Ücret önce, vergi sonra. Yönetim ücreti yönetilen varlığın büyüklüğünden
 * alınır; verginin olup olmaması onu ilgilendirmez, o yüzden matrahı brüt
 * değerdir ("vergi hariç"). Vergi ise kazancın üzerinden alınır ve yönetim
 * ücreti kazancı azaltan bir GİDERDİR — ücret ödendikten sonra geriye kalan
 * kadar kâr etmişsindir. Ters sırada (önce vergi) aynı paradan iki kez kesinti
 * yapılır, yani gerçekte olmayan bir yük çıkar.
 *
 *   ücret = değer × ücret_oranı
 *   kâr   = (değer − ücret) − maliyet
 *   vergi = kâr > 0 ? kâr × vergi_oranı : 0
 *   net   = değer − ücret − vergi
 *
 * ── Zarardan vergi kesilmez ──────────────────────────────────────────────
 * Kâr negatifse vergi 0. Negatif vergiyi (iade) yazmak, portföyü olduğundan
 * büyük gösterirdi: zarar mahsubu başka varlıkların kârına karşı çalışır,
 * varlık bazında kendiliğinden geri ödenmez.
 *
 * ── Maliyet meçhulse ─────────────────────────────────────────────────────
 * Alış fiyatı girilmemiş varlıkta maliyet 0 değil BİLİNMEZ (bkz. getPositions).
 * Kâr hesaplanamadığı için vergi de hesaplanamaz: yalnız yönetim ücreti düşülür
 * ve `taxUnknown` ile bu işaretlenir — sayfanın "maliyeti meçhul" uyarısı zaten
 * aynı satırları gösteriyor.
 */

/** Bir enstrümanın kesinti oranları (yüzde). null = girilmedi → o kesinti yok. */
export interface Levy {
  tax: number | null;
  fee: number | null;
}

export interface Cut {
  /** Kesinti öncesi tutar. */
  gross: number;
  fee: number;
  tax: number;
  /** gross − fee − tax */
  net: number;
  /** Maliyet bilinmediği için vergi hesaplanamadı (ücret yine de düşüldü). */
  taxUnknown: boolean;
}

export const NO_LEVY: Levy = { tax: null, fee: null };

/** Bu varlıkta düşülecek bir şey var mı — yoksa net ile brüt aynı sayıdır. */
export function hasLevy(l: Levy): boolean {
  return (l.tax ?? 0) > 0 || (l.fee ?? 0) > 0;
}

/**
 * Tek bir tutarın kesintileri. `value` ve `cost` AYNI para biriminde olmalı
 * (sayfanın her yerinde TL — çevrim kesintiden sonra yapılır, yoksa yuvarlama
 * iki ayrı yerde iki farklı sonuç üretir).
 */
export function cutOf(value: number, cost: number | null, l: Levy): Cut {
  const none: Cut = { gross: value, fee: 0, tax: 0, net: value, taxUnknown: false };
  // Değeri olmayan (ya da negatif) satırdan kesilecek bir şey yok. Negatif
  // değer normalde oluşmaz; oluşursa oranla çarpmak işareti bozardı.
  if (!Number.isFinite(value) || value <= 0 || !hasLevy(l)) return none;

  const fee = value * ((l.fee ?? 0) / 100);
  const afterFee = value - fee;
  const known = cost != null && cost > 0;
  const gain = known ? afterFee - cost : null;
  const tax = gain != null && gain > 0 ? gain * ((l.tax ?? 0) / 100) : 0;
  return {
    gross: value,
    fee,
    tax,
    net: value - fee - tax,
    // Vergi oranı girilmiş ama maliyet meçhulse hesaplanamadı demektir; vergi
    // oranı hiç girilmemişse ortada hesaplanacak bir şey yok.
    taxUnknown: !known && (l.tax ?? 0) > 0,
  };
}

/** Kesintiden sonra geriye kalanın brüte oranı — geçmiş serileri ölçeklerken. */
export function keepRatio(c: Cut): number {
  return c.gross > 0 ? c.net / c.gross : 1;
}

/**
 * Bir satırın kesinti dökümü — "neden bu sayı" sorusunun ipucu metni.
 * Biçimlendirmeyi çağıran verir (sayfa TL/USD arasında geçiş yapabiliyor).
 */
export function cutNote(c: Cut | null | undefined, fmt: (n: number) => string): string | null {
  if (!c || (c.fee === 0 && c.tax === 0 && !c.taxUnknown)) return null;
  const parts = [`Brüt ${fmt(c.gross)}`];
  if (c.fee > 0) parts.push(`yönetim ücreti −${fmt(c.fee)}`);
  if (c.tax > 0) parts.push(`vergi −${fmt(c.tax)}`);
  if (c.taxUnknown) parts.push('vergi hesaplanamadı: maliyet meçhul');
  return parts.join(' · ');
}
