/**
 * index.ts — Worker 진입점 (0단계 골격).
 *
 * 공개: GET /api/version
 * 점검(SMOKE_ENABLED="1" 이고 ADMIN_PASSWORD 가 맞을 때만, 아니면 404/401):
 *   POST /api/_smoke   D1 실제 테이블 조회 + DO SQLite 카운터·alarm 예약
 *   GET  /api/_smoke   DO alarm 발화 여부·소켓 수·bootId
 *   GET  /ws/_smoke    DO WebSocket (관리자 헤더로 인증한 뒤에만 DO 에 넘긴다)
 * 점검 인스턴스는 고정 코드 하나뿐이라 실행할수록 저장소가 쌓이지 않는다.
 * 나머지는 정적 자산(dist/client).
 *
 * ⚠️ DO 를 부르기 **전에** 인증한다 — 인증 없이 idFromName → fetch 를 하면 누구나 DO 를 깨워
 *    생성자(저장소 준비)를 돌릴 수 있다.
 * ⚠️ 인증값은 헤더로만. URL 쿼리로 받지 않는다(로그에 남는다).
 * ⚠️ Worker 진입 모듈은 핸들러·DO 클래스 말고는 내보내면 안 된다(workerd 가 시작을 거부한다).
 */
import { TrapRoom } from '../do/TrapRoom.ts';
import type { Env } from '../do/TrapRoom.ts';
import { safeEqual } from './auth.ts';

export { TrapRoom };

const VERSION = '0.1.0-skeleton';
const SMOKE_CODE = '_SMOKE';

const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const ok = (data: unknown) => json({ ok: true, data });
const fail = (error: string, status: number) => json({ ok: false, error }, status);

async function isAdmin(request: Request, env: Env): Promise<boolean> {
  if (!env.ADMIN_PASSWORD) return false;
  return safeEqual(request.headers.get('X-Admin-Password') ?? '', env.ADMIN_PASSWORD);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;

    if (path === '/api/version') return ok({ app: 'animal-trap', v: VERSION });

    if (path === '/api/_smoke' || path === '/ws/_smoke') {
      // 꺼져 있으면 존재 자체를 드러내지 않는다
      if (env.SMOKE_ENABLED !== '1' || !env.ADMIN_PASSWORD) return fail('NOT_FOUND', 404);
      if (!(await isAdmin(request, env))) return fail('ADMIN_DENIED', 401);
      const room = env.TRAP_ROOM.get(env.TRAP_ROOM.idFromName(SMOKE_CODE));
      if (path === '/ws/_smoke') return room.fetch(request);
      if (request.method === 'POST') {
        // SELECT 1 은 migration 이 안 된 DB 에서도 성공한다 — 실제 테이블을 본다
        const q = await env.DB.prepare('SELECT COUNT(*) AS n FROM questions').first<{ n: number }>();
        return ok({ d1Questions: q?.n ?? null, room: await room.smoke() });
      }
      if (request.method === 'GET') return ok(await room.smokeStatus());
      return fail('METHOD', 405);
    }

    if (path.startsWith('/api/') || path.startsWith('/ws/')) return fail('NOT_FOUND', 404);
    return env.ASSETS.fetch(request);
  }
} satisfies ExportedHandler<Env>;
