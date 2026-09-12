import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // robots.txt yalnızca "tarama" ricasıdır: başka bir yerden adrese link
  // verilmişse arama motoru sayfayı taramadan da dizine ekleyebilir. X-Robots-Tag
  // yanıtın kendisinde taşındığı için bu boşluğu kapatır. İkisi + layout'taki
  // meta etiketi birlikte, adresin hangi yoldan keşfedilirse keşfedilsin
  // listelenmemesini sağlar.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' }],
      },
    ];
  },
};

export default nextConfig;
