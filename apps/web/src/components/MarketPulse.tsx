import { numPrice, num } from '@/lib/format';

export interface MarketRow {
  symbol: string; name: string;
  price: number | null;
  /** Fiyatın kote edildiği birim — TRY/USD. */
  priceCur: string | null;
  /** Bugünkü değişim, enstrümanın KENDİ para biriminde (DayChange.pct_native). */
  pct: number | null;
}

/**
 * Piyasa — 4'lü KPI satırının dördüncü kartı.
 *
 * Sayfanın tamamı içeriye bakıyor: elimde ne var, ne kazandım, hangi varlık
 * öne çıktı. Hiçbir yerde DIŞARIDA ne olduğu yazmıyordu — oysa portföyün
 * bugünkü hareketi ancak dolar, S&P ve VIX'in yanında bir anlam taşıyor
 * ("%2 kazanmışım ama dolar %2,5 artmış" başka bir cümledir). Her finansal
 * arayüzde bir piyasa özeti tile'ı bunun için var.
 *
 * Kaynak: izleme listesi (kataloğa eklenmiş ama pozisyonu olmayan enstrüman)
 * — kullanıcının kendi seçtiği referanslar, sabit bir liste değil. Bu satırlar
 * hiçbir toplama girmez; kart yalnız okuma yapar.
 *
 * Oran `pct_native`: enstrümanın kendi para birimindeki değişim. TL bazlı oran
 * burada yanlış olurdu — "S&P bugün ne yaptı"nın cevabına TL'nin hareketi
 * karışmamalı (bkz. DayChange yorumu).
 */
export default function MarketPulse({ rows }: { rows: MarketRow[] }) {
  return (
    <div className="panel p-3 sm:p-4 flex flex-col">
      <div className="flex items-baseline justify-between gap-2 mb-2 min-w-0">
        <div className="t-label truncate" style={{ color: 'var(--muted)' }}>Piyasa</div>
        <div className="t-micro shrink-0" style={{ color: 'var(--faint)' }}>bugün</div>
      </div>

      {rows.length === 0 ? (
        <div className="t-label flex-1 flex items-center" style={{ color: 'var(--faint)' }}>
          İzlenen referans yok. Varlık sekmesinden enstrüman ekleyip işlem
          girmezsen burada referans olarak görünür.
        </div>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r) => (
            <div
              key={r.symbol}
              className="flex items-baseline justify-between gap-2 t-label min-w-0"
              title={`${r.symbol} — ${r.name}${r.pct == null ? '\nBugün için ölçüm yok' : ''}`}
            >
              <span className="truncate" style={{ color: 'var(--muted)' }}>{r.symbol}</span>
              <span className="flex items-baseline gap-2 shrink-0 tnum">
                <span style={{ color: 'var(--text)' }}>
                  {r.price == null ? '—' : `${numPrice(r.price)}${r.priceCur === 'USD' ? '$' : '₺'}`}
                </span>
                {/* Sabit genişlik: oranlar sağda tek kolon halinde hizalansın,
                    işaret değişince satırlar oynamasın. */}
                <span
                  className="text-right"
                  style={{
                    width: '4.6em',
                    color: r.pct == null ? 'var(--faint)' : r.pct >= 0 ? 'var(--up)' : 'var(--down)',
                  }}
                >
                  {r.pct == null ? '—' : `${r.pct >= 0 ? '+' : ''}${num(r.pct, 2)}%`}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
