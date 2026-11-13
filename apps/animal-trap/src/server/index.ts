/**
 * index.ts — Worker 진입점.
 *
 * 공개: GET /api/version. 판 생성·명령·소켓 라우트와 인증은 3단계에서 붙는다.
 * 나머지는 정적 자산(dist/client).
 *
 * ⚠️ 판 코드 하나 = DO 인스턴스 하나 (idFromName(code)). DO 를 부르는 통로는 RPC 와 소켓 업그레이드뿐 —
 *    인터넷에서 DO 에 직접 닿는 문을 만들지 않는다. DO 를 깨우기 **전에** 인증한다.
 * ⚠️ 인증값은 헤더로만. URL 쿼리로 받지 않는다(로그에 남는다).
 * ⚠️ Worker 진입 모듈은 핸들러·DO 클래스 말고는 내보내면 안 된다(workerd 가 시작을 거부한다).
 */
import { TrapRoom } from '../do/TrapRoom.ts';
import type { Env } from '../do/TrapRoom.ts';

export { TrapRoom };

const VERSION = '0.2.0-room';

const json = (data: unknown, status = 200): Response =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const path = new URL(request.url).pathname;
    if (path === '/api/version') return json({ ok: true, data: { app: 'animal-trap', v: VERSION } });
    if (path.startsWith('/api/') || path.startsWith('/ws/')) return json({ ok: false, error: 'NOT_FOUND' }, 404);
    return env.ASSETS.fetch(request);
  }
} satisfies ExportedHandler<Env>;
