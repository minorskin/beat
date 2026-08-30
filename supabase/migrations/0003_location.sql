-- Beat · Şema v3 — işlem bazında konum (custody)
--
-- Aynı enstrüman birden fazla kurum/bölgede tutulabiliyor (ör. THYAO hem X
-- aracı kurumda hem Y'de). Konum instrument'a değil, TRANSACTION'a bağlı —
-- böylece bir pozisyonun farklı lot'ları farklı konumlarda görünebilir.
-- Açılış/kapanış tarihi ve konum listesi apps/web tarafında (data.ts) işlem
-- geçmişinden hesaplanır; motor (fetch/snapshot) ve v_holdings'e dokunulmaz.

alter table transactions
  add column if not exists location text;

comment on column transactions.location is
  'Bu işlemdeki varlığın saklandığı kurum/bölge (serbest metin, ör. "İş Yatırım", "Interactive Brokers"). Boş bırakılabilir.';
