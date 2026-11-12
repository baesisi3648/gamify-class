import { handle } from './server/api.js';
import { sheetsRepository } from './server/repository.js';
import { handleReportImage } from './server/report-images.js';
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/lab/report-image/')) return handleReportImage(request, env, sheetsRepository(env));
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
  }
};
