import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Beat · Portföy',
  description: 'Kişisel finansal portföy ve varlık takibi',
  // Adres arama sonuçlarında görünmesin: pano kişisel, aranabilir olmasının
  // faydası yok. robots.txt + X-Robots-Tag ile birlikte üçüncü katman (bkz.
  // src/app/robots.ts ve next.config.ts).
  robots: { index: false, follow: false, nocache: true },
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Beat' },
  icons: {
    // SVG önce: destekleyen tarayıcı sekmede vektörü kullanır, kalanlar PNG'ye düşer.
    //
    // ?v= ŞART: ana ekrana eklenmiş bir PWA ikonu kurulum anında kopyalanır ve
    // aynı URL'de kaldığı sürece bir daha istenmez — dosyayı değiştirmek yetmez,
    // adresin de değişmesi gerekir. İkon her değiştiğinde bu sayı artırılmalı
    // (manifest.webmanifest'teki değerlerle AYNI kalsın).
    icon: [
      { url: '/icon.svg?v=4', type: 'image/svg+xml' },
      { url: '/icon-192.png?v=4', sizes: '192x192', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png?v=4',
  },
};
export const viewport: Viewport = {
  themeColor: '#0a0a0a',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="tr">
      <body>{children}</body>
    </html>
  );
}
