import { handle } from './server/api.js';
import { repositoryFor } from './server/api.js';
import { syncToSheets } from './server/sheets-sync.js';
import { handleReportImage } from './server/report-images.js';
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/lab/report-image/')) return handleReportImage(request, env, repositoryFor(env));
    if (url.pathname.startsWith('/api/lab/')) return handle(request, env);
    if (url.pathname.startsWith('/apps/life-science-lab/')) {
      url.pathname = url.pathname.slice('/apps/life-science-lab'.length) || '/';
    }
    const response = await env.ASSETS.fetch(new Request(url, request));
    const headers = new Headers(response.headers);
    headers.set('X-Content-Type-Options','nosniff');
    headers.set('Referrer-Policy','same-origin');
    headers.set('X-Frame-Options','DENY');
    headers.set('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
    return new Response(response.body,{status:response.status,headers});
  },
  // Cron (wrangler.jsonc triggers): copy D1 changes to the teachers' Google Sheet.
  async scheduled(event, env, ctx) {
    if (!env.LAB_DB) return;
    // Drop expired login-rate rows (only used when the Cloudflare rate limiter is absent).
    ctx.waitUntil(env.LAB_DB.prepare("DELETE FROM Settings WHERE id LIKE 'rate:%' AND json_extract(data, '$.expiresAt') < ?").bind(new Date().toISOString()).run().catch(() => {}));
    // Failures are logged (wrangler tail) and recorded in Meta.syncError; the next run retries.
    ctx.waitUntil(syncToSheets(env).catch((e) => console.error('sheets-sync failed:', e?.message || e)));
  }
};
