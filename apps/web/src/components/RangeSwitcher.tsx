'use client';
import { useParamNav } from './useParamNav';
import { RANGES } from '@/lib/ranges';

/**
 * Dönem anahtarı — sayfanın TEK zaman ekseni. Hem varlık değişimi grafiğini
 * hem öne çıkanlar kartlarını sürer; ikisinin ayrı seçicisi olduğunda grafik
 * bir dönemi, kartlar başka dönemi gösteriyordu.
 *
 * TEK SATIR, yedi sütun. Dört sütunlu iki satır hâli yedinci düğmeden sonra
 * bir hücreyi boş bırakıyordu: "TÜM" alt satırın ortasında kalıyor, seçici
 * ne sağa ne sola hizalanmış görünüyordu. Yedi eşit sütunda hem sıra
 * (kısadan uzuna) tek yönde okunuyor hem de blok dikdörtgen kalıyor.
 *
 * Mobilde barın kendi satırını boydan boya kaplar (`w-full`): dar ekranda
 * sekmelerin yanına sığmıyor, alt satıra düşüyor ve orada yarım genişlikte
 * durmasının bir sebebi yok — tam genişlik hem dokunma hedeflerini büyütüyor
 * hem sayfanın kenarlarıyla hizalıyor.
 */
export default function RangeSwitcher({ range }: { range: string }) {
  const setParam = useParamNav();
  return (
    <div
      className="grid grid-cols-7 gap-0.5 w-full sm:w-auto shrink-0"
      role="group" aria-label="Dönem">
      {RANGES.map((r) => (
        <button
          key={r.id}
          type="button"
          onClick={() => setParam('range', r.id)}
          aria-pressed={range === r.id}
          title={r.long}
          className={`seg seg-xs tnum text-center ${range === r.id ? 'seg-on' : ''}`}
        >
          {r.id}
        </button>
      ))}
    </div>
  );
}
