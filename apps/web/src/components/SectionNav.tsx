'use client';
import { TABS, useTabs } from './Tabs';

/** Üst bardaki sekme anahtarı — Özet ↔ Varlık. */
export default function SectionNav() {
  const { tab, setTab } = useTabs();
  return (
    <nav className="flex items-center gap-1 min-w-0" role="tablist" aria-label="Bölümler">
      {TABS.map((t) => (
        <button
          key={t.id}
          id={`tab-${t.id}`}
          type="button"
          role="tab"
          aria-selected={tab === t.id}
          aria-controls={t.id}
          onClick={() => setTab(t.id)}
          className={`navlink ${tab === t.id ? 'navlink-on' : ''}`}
        >
          {t.label}
        </button>
      ))}
    </nav>
  );
}
