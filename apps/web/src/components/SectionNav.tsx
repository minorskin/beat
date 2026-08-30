'use client';
import { useEffect, useState } from 'react';

const SECTIONS = [
  { id: 'dashboard', label: 'Dashboard' },
  { id: 'portfoy', label: 'Portföy' },
  { id: 'izleme', label: 'İzleme' },
] as const;

export default function SectionNav() {
  const [active, setActive] = useState<string>('dashboard');

  useEffect(() => {
    const els = SECTIONS.map((s) => document.getElementById(s.id)).filter(Boolean) as HTMLElement[];
    if (!els.length) return;

    // Sayfa sonundayken son bölümü aktif say, aksi halde en üstteki görünür bölüm
    const pick = () => {
      const atBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 8;
      if (atBottom) return setActive(SECTIONS[SECTIONS.length - 1].id);
      const top = els.find((el) => el.getBoundingClientRect().bottom > 96) ?? els[0];
      setActive(top.id);
    };

    pick();
    window.addEventListener('scroll', pick, { passive: true });
    window.addEventListener('resize', pick);
    return () => {
      window.removeEventListener('scroll', pick);
      window.removeEventListener('resize', pick);
    };
  }, []);

  return (
    <nav className="flex items-center gap-1 min-w-0">
      {SECTIONS.map((s) => (
        <a
          key={s.id}
          href={`#${s.id}`}
          className={`navlink ${active === s.id ? 'navlink-on' : ''}`}
          aria-current={active === s.id ? 'page' : undefined}
        >
          {s.label}
        </a>
      ))}
    </nav>
  );
}
