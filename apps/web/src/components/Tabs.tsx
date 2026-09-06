'use client';
import { createContext, useCallback, useContext, useState } from 'react';

export const TABS = [
  { id: 'ozet', label: 'Özet' },
  { id: 'varlik', label: 'Varlık' },
  // Projeksiyon Özet'in en altındaydı: sayfanın geri kalanı "şu an ne var"
  // sorusunu cevaplarken tek başına "ne olabilir" diyordu ve oraya ulaşmak
  // için bütün özeti kaydırmak gerekiyordu. Kendi sekmesinde duruyor.
  { id: 'simulasyon', label: 'Simülasyon' },
] as const;
export type TabId = (typeof TABS)[number]['id'];

const Ctx = createContext<{ tab: TabId; setTab: (t: TabId) => void } | null>(null);

export function useTabs() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useTabs, TabsProvider dışında çağrıldı');
  return c;
}

/**
 * Özet, Varlık ve Simülasyon tek akış değil, üç sekme. Durum URL'de değil React
 * state'inde: sekme değişimi sunucuya gidip tüm sorguları tekrar çalıştırmasın,
 * geçiş anında olsun. İki panel de DOM'da kalır (yalnız gizlenir) — grafikler
 * her geçişte sıfırdan çizilmez.
 *
 * Sekme YALNIZCA üst bardaki düğmelerle değişir. Kaydırma jesti bilerek yok:
 * tablo yatay kayıyor, grafiklerin kendi dokunma davranışı var; jest ikisiyle
 * çakışıp istemeden sekme atlatıyordu.
 */
export default function TabsProvider({ children }: { children: React.ReactNode }) {
  const [tab, setTabState] = useState<TabId>('ozet');

  const setTab = useCallback((t: TabId) => {
    setTabState((prev) => {
      // Sekme değişince sayfa başına dön: tablonun ortasından Özet'e geçip
      // boşluğa bakmak gibi bir durum olmasın.
      if (t !== prev) window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
      return t;
    });
  }, []);

  return (
    <Ctx.Provider value={{ tab, setTab }}>{children}</Ctx.Provider>
  );
}

export function TabPanel({ id, children }: { id: TabId; children: React.ReactNode }) {
  const { tab } = useTabs();
  return (
    <section
      id={id}
      role="tabpanel"
      aria-labelledby={`tab-${id}`}
      className={tab === id ? 'pt-4 sm:pt-6' : 'hidden'}
    >
      {children}
    </section>
  );
}
