'use client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

/**
 * Arama parametrelerini diğerlerini kaybetmeden değiştirir.
 * scroll:false — sayfa tek akış (dashboard/portföy/izleme bölümleri);
 * görünüm değiştirirken kullanıcıyı en başa fırlatmamalı.
 */
export function useParamNav() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  return useCallback((key: string, value: string | null) => {
    const next = new URLSearchParams(params.toString());
    if (value === null) next.delete(key);
    else next.set(key, value);
    const qs = next.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }, [router, pathname, params]);
}
