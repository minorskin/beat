/**
 * Beat cron watchdog — Cloudflare Worker.
 * GitHub'ın scheduled cron'u bu repoda ateşlemiyor; dispatch ise çalışıyor.
 * Bu Worker her 30 dk'da fetch.yml'i workflow_dispatch ile tetikler.
 * Secret: GH_TOKEN (fine-grained PAT, repo=minorskin/beat, Actions: read+write).
 */
export interface Env {
  GH_TOKEN: string;
  REPO?: string;        // "owner/repo" (vars'ta; yoksa default)
  TRIGGER_KEY?: string; // opsiyonel: ayarlıysa /trigger bu sırla korunur; yoksa /trigger kapalı
}

const DEFAULT_REPO = 'minorskin/beat';
const WORKFLOW = 'fetch.yml';

async function dispatch(env: Env): Promise<{ ok: boolean; status: number; body: string }> {
  const repo = env.REPO ?? DEFAULT_REPO;
  const url = `https://api.github.com/repos/${repo}/actions/workflows/${WORKFLOW}/dispatches`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.GH_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'beat-cron-worker',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ ref: 'main' }),
  });
  // Başarıda GitHub 204 döner (gövde boş).
  const body = res.ok ? '' : await res.text();
  return { ok: res.ok, status: res.status, body };
}

export default {
  // Zamanlanmış tetik (cron).
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(
      dispatch(env).then((r) => {
        if (!r.ok) console.log(`dispatch FAILED ${r.status}: ${r.body.slice(0, 200)}`);
        else console.log('dispatch ok (204)');
      }),
    );
  },
  // HTTP yüzeyi varsayılan KAPALI (workers_dev:false). Bir route eklenirse bile
  // savunma: /trigger yalnız TRIGGER_KEY ayarlıysa ve X-Beat-Key eşleşirse çalışır;
  // aksi halde 404 (varlığı ele vermemek için 403 değil).
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === '/trigger' && env.TRIGGER_KEY && req.headers.get('X-Beat-Key') === env.TRIGGER_KEY) {
      const r = await dispatch(env);
      return new Response(JSON.stringify(r), { status: r.ok ? 200 : 502, headers: { 'content-type': 'application/json' } });
    }
    return new Response('Not found', { status: 404 });
  },
};
