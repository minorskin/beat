/**
 * Net / brüt görünümün TEK hesap yeri.
 *
 * Soru şu: "bugün çıksam elimde ne kalır?" Brüt görünüm piyasanın söylediği
 * tutar; net görünüm ondan STOPAJI düşer:
 *
 *   kâr   = değer − maliyet
 *   vergi = kâr > 0 ? kâr × vergi_oranı : 0
 *   net   = değer − vergi
 *
 * ── Yönetim ücreti neden burada yok ──────────────────────────────────────
 * Bir zamanlar bu dosya ücreti de düşüyordu; yanlıştı. TEFAS fonlarında
 * yönetim ücreti yatırımcıdan ayrıca tahsil EDİLMEZ: fon varlığından her gün
 * yıllık oranın 1/365'i kadar kesilir ve birim pay değeri bu kesintiden SONRA
 * oluşur. Yani ücret, çekilen fiyatın içinde zaten erimiş durumda — güncel
 * tutardan bir kez daha düşmek onu ikinci kez saymak olurdu (üç fonda ~303 bin
 * TL fazladan kesinti çıkıyordu).
 *
 * Aynı sebeple stopajın matrahı da "satış bedeli − alış bedeli"dir; ücret
 * matrahtan indirilmez, çünkü fiyata çoktan yansımıştır. İlk yazımda vergiyi
 * ücret düşülmüş kârdan hesaplıyordum ve banka ekranına göre TLY'de 32.494 ₺,
 * DFI'de 8.345 ₺ eksik stopaj çıkıyordu.
 *
 * instruments.mgmt_fee_rate yine de duruyor: fonun künye bilgisi, arayüzde
 * "fiyata dahil" notuyla gösteriliyor (bkz. feeNote). Hesaba GİRMEZ.
 *
 * ── Zarardan vergi kesilmez ──────────────────────────────────────────────
 * Kâr negatifse vergi 0. Negatif vergiyi (iade) yazmak portföyü olduğundan
 * büyük gösterirdi: zarar mahsubu başka varlıkların kârına karşı çalışır,
 * varlık bazında kendiliğinden geri ödenmez.
 *
 * ── Maliyet meçhulse ─────────────────────────────────────────────────────
 * Alış fiyatı girilmemiş varlıkta maliyet 0 değil BİLİNMEZ (bkz. getPositions).
 * Kâr hesaplanamadığı için vergi de hesaplanamaz: kesinti yapılmaz ve
 * `taxUnknown` ile bu işaretlenir.
 */

export interface Cut {
  /** Kesinti öncesi tutar. */
  gross: number;
  tax: number;
  /** gross − tax */
  net: number;
  /** Maliyet bilinmediği için vergi hesaplanamadı. */
  taxUnknown: boolean;
}

/** Bu varlıkta düşülecek bir şey var mı — yoksa net ile brüt aynı sayıdır. */
export function hasTax(rate: number | null): boolean {
  return (rate ?? 0) > 0;
}

/**
 * Tek bir tutarın stopajı. `value` ve `cost` AYNI para biriminde olmalı
 * (sayfanın her yerinde TL — çevrim kesintiden sonra yapılır, yoksa yuvarlama
 * iki ayrı yerde iki farklı sonuç üretir).
 */
export function cutOf(value: number, cost: number | null, rate: number | null): Cut {
  const none: Cut = { gross: value, tax: 0, net: value, taxUnknown: false };
  // Değeri olmayan (ya da negatif) satırdan kesilecek bir şey yok. Negatif
  // değer normalde oluşmaz; oluşursa oranla çarpmak işareti bozardı.
  if (!Number.isFinite(value) || value <= 0 || !hasTax(rate)) return none;

  // Oran girilmiş ama maliyet meçhulse kesinti yapılmaz — sayı uydurmak yerine
  // hesaplanamadığını söyleriz.
  if (cost == null || cost <= 0) return { ...none, taxUnknown: true };

  const gain = value - cost;
  const tax = gain > 0 ? gain * ((rate ?? 0) / 100) : 0;
  return { gross: value, tax, net: value - tax, taxUnknown: false };
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
  if (!c) return null;
  if (c.taxUnknown) return 'Vergi hesaplanamadı: alış fiyatı girilmemiş, kâr bilinmiyor';
  if (c.tax === 0) return null;
  return `Brüt ${fmt(c.gross)} · vergi −${fmt(c.tax)}`;
}

/**
 * Yönetim ücreti künye satırı. Kesinti DEĞİL bilgi: oran fon fiyatına günlük
 * olarak zaten yansımış durumda, tabloda gördüğün tutar ondan arınmış.
 */
export function feeNote(rate: number | null, fmtPct: (n: number) => string): string | null {
  return rate != null && rate > 0
    ? `Fon yönetim ücreti ${fmtPct(rate)}/yıl — fiyata günlük yansıyor, ayrıca düşülmez`
    : null;
}
