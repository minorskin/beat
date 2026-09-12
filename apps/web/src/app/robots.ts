import type { MetadataRoute } from 'next';

// Pano kişisel portföy gösteriyor: aranabilir olmasının hiçbir faydası yok,
// adresin arama sonuçlarında belirmesinin ise gerçek bir maliyeti var — o an
// şifre TEK koruma katmanı olarak kalır ve adres, şifre deneyen botlara açık
// bir hedefe dönüşür. Vercel `.vercel.app` üretim adreslerine kendiliğinden
// noindex koymuyor (yanıt başlıklarında doğrulandı), bu yüzden açıkça diyoruz.
//
// Bu dosya VERİYİ korumaz — onu middleware'deki şifre kapısı yapıyor. Buradaki
// tek iş, adresin dizine girmesini engellemek.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', disallow: '/' },
  };
}
