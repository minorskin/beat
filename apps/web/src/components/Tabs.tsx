'use client';
import { createContext, useCallback, useContext, useRef, useState } from 'react';

export const TABS = [
  { id: 'ozet', label: 'Özet' },
  { id: 'varlik', label: 'Varlık' },
] as const;
export type TabId = (typeof TABS)[number]['id'];

const Ctx = createContext<{ tab: TabId; setTab: (t: TabId) => void } | null>(null);

export function useTabs() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useTabs, TabsProvider dışında çağrıldı');
  return c;
}

/**
 * Özet ve Varlık artık tek akış değil, iki sekme. Durum URL'de değil React
 * state'inde: sekme değişimi sunucuya gidip tüm sorguları tekrar çalıştırmasın,
 * geçiş anında olsun. İki panel de DOM'da kalır (yalnız gizlenir) — grafikler
 * her geçişte sıfırdan çizilmez.
 *
 * Mobil: yatay kaydırma sekme değiştirir. Eşik dikey harekete göre ölçülür,
 * yoksa sayfayı aşağı kaydırırken kazara sekme atlıyor.
 */
export default function TabsProvider({ children }: { children: React.ReactNode }) {
  const [tab, setTabState] = useState<TabId>('ozet');
  const start = useRef<{ x: number; y: number } | null>(null);

  const setTab = useCallback((t: TabId) => {
    setTabState((prev) => {
      // Sekme değişince sayfa başına dön: tablonun ortasından Özet'e geçip
      // boşluğa bakmak gibi bir durum olmasın.
      if (t !== prev) window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
      return t;
    });
  }, []);

  const move = (dir: 1 | -1) => {
    const i = TABS.findIndex((t) => t.id === tab);
    const next = TABS[i + dir];
    if (next) setTab(next.id);
  };

  return (
    <Ctx.Provider value={{ tab, setTab }}>
      <div
        style={{ touchAction: 'pan-y' }}
        onTouchStart={(e) => {
          const t = e.touches[0];
          start.current = { x: t.clientX, y: t.clientY };
        }}
        onTouchEnd={(e) => {
          const s = start.current;
          start.current = null;
          if (!s) return;
          const t = e.changedTouches[0];
          const dx = t.clientX - s.x;
          const dy = t.clientY - s.y;
          if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
          move(dx < 0 ? 1 : -1);
        }}
      >
        {children}
      </div>
    </Ctx.Provider>
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
