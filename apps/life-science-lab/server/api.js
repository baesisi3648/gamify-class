import { passwordHash, verifyPassword, signSession, readSession, hmac, validStudentSecret } from './auth.js';
import { sheetsRepository } from './repository.js';
import { d1Repository } from './d1-repository.js';
import { syncToSheets, migrateFromSheets } from './sheets-sync.js';
// D1 is the source of truth when the LAB_DB binding exists; otherwise the old Sheets path.
export const repositoryFor = (env) => (env.LAB_DB ? d1Repository(env) : sheetsRepository(env));
const STUDENT = new Set(['myReports','report.open','report.save','report.submit']);
const ADMIN = new Set(['groups.create','groups.update','students.list','students.import','student.update','assessments.list','assessment.save','reports.list','review','publications.list','publication.generate','publication.save','publication.publish','publication.hide']);
const PUBLIC = new Set(['groups.list','bootstrap','archive']);
ADMIN.add('sheets.refresh');
ADMIN.add('migrate.fromSheets');
const json = (data, status = 200, headers = {}) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers }
});
export async function handle(request, env, injectedRepository) {
  try {
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname.endsWith('/health')) {
      return json({ configured: !!(env.LAB_SESSION_SECRET && env.LAB_ADMIN_HASH && (env.LAB_DB || (env.LAB_SHEETS_URL && env.LAB_SHEETS_SECRET))), storage: env.LAB_DB ? 'd1' : 'sheets' });
    }
    if (request.method !== 'POST') return json({ error: 'POST 요청이 필요합니다.' }, 405);
    if (request.headers.get('Origin') !== url.origin) return json({ error: '허용되지 않은 요청 출처입니다.' }, 403);
    if (!(request.headers.get('Content-Type') || '').startsWith('application/json')) return json({ error: 'JSON 요청이 필요합니다.' }, 415);
    const raw = await request.text();
    if (raw.length > 120000) return json({ error: '요청이 너무 큽니다.' }, 413);
    const { action, payload = {} } = JSON.parse(raw);
    const repo = injectedRepository || repositoryFor(env);
    if (PUBLIC.has(action)) return json({ result: await repo.execute(action, payload) });
    if (!env.LAB_SESSION_SECRET || !env.LAB_ADMIN_HASH) return json({ error: '교사 인증 설정을 준비 중입니다.' }, 503);
    const cookie = (token, age = 28800) => 'lab_session=' + token + '; HttpOnly; SameSite=Strict; Path=/api/lab; Max-Age=' + age + (url.protocol === 'https:' ? '; Secure' : '');
    if (action === 'logout') return json({ result: true }, 200, { 'Set-Cookie': cookie('', 0) });
    if (action === 'login') {
      const ip = request.headers.get('CF-Connecting-IP') || 'local';
      const groupId=String(payload.groupId || 'legacy');
      const teacherLogin = payload.role === 'teacher';
      const identity = groupId+':' + (teacherLogin ? 'teacher' : [payload.year, payload.grade, payload.classNo, payload.number].join(':'));
      const password = String(payload.password || '').slice(0, 128);
      const setupPin = !teacherLogin && payload.setupPin===true;
      // Legacy "register PIN" form (old cached pages) still works and still requires confirmation.
      if(setupPin && (!/^\d{4}$/.test(password) || password!==payload.pinConfirm)) return json({error:'같은 숫자 4자리 PIN을 두 번 입력하세요.'},400);
      // Rate limiting: prefer Cloudflare's rate limiter (no storage round trip). Without it,
      // the counters ride along inside the single auth.login storage request.
      // A whole school often shares one public IP, so the IP limit must fit a full class.
      let rateKeys = [];
      if (env.LOGIN_IP_LIMITER && env.LOGIN_ID_LIMITER) {
        const ipKey = await hmac(env.LAB_SESSION_SECRET, 'ip:' + ip), idKey = await hmac(env.LAB_SESSION_SECRET, identity);
        const [ipOk, idOk] = await Promise.all([env.LOGIN_IP_LIMITER.limit({ key: ipKey }), env.LOGIN_ID_LIMITER.limit({ key: idKey })]);
        if (!ipOk.success || !idOk.success) return json({ error: '로그인 시도가 너무 많습니다. 1분 후 다시 시도하세요.' }, 429);
      } else {
        rateKeys = [
          { key: await hmac(env.LAB_SESSION_SECRET, 'ip:' + ip), limit: 600 },
          { key: await hmac(env.LAB_SESSION_SECRET, identity), limit: 10 }
        ];
      }
      // Only whitelisted fields reach the system-privileged storage action.
      // claimHash is never taken from the browser; the server derives it below.
      const loginPayload = { groupId, role: teacherLogin ? 'teacher' : 'student', rateKeys };
      if (!teacherLogin) for (const k of ['year','grade','classNo','number','name']) loginPayload[k] = payload[k];
      let found = await repo.execute('auth.login', loginPayload, { role: 'system' });
      let user, pinCreated = false;
      if (teacherLogin) {
        const hash=groupId==='legacy' ? env.LAB_ADMIN_HASH : (found?.group?.passwordHash || '0'.repeat(32)+':'+ '0'.repeat(64));
        if (await verifyPassword(password, hash) && found?.me && (groupId==='legacy' || found.group)) user = { role: 'teacher',groupId,owner:groupId==='legacy',groupVersion:found.group?.authVersion || 1 };
      } else {
        let s = found?.student;
        if (setupPin && (!s || s.passwordHash)) return json({error:'명단 정보를 확인하세요. 이미 PIN/접속 코드가 있으면 기존 정보로 로그인하거나 선생님께 재설정을 요청하세요.'},409);
        if (s && !s.passwordHash) {
          // First visit: the 4-digit number the student types becomes their PIN.
          // (No separate "register PIN" screen.) A second storage call happens only here.
          if (!/^\d{4}$/.test(password)) return json({ error:'처음 접속이면 앞으로 사용할 숫자 4자리 PIN을 입력하세요.' }, 400);
          const claimPayload = { ...loginPayload, rateKeys: [], claimHash: await passwordHash(password) };
          found = await repo.execute('auth.login', claimPayload, { role: 'system' });
          s = found?.student;
          if (s) { user = { role:'student', groupId, id:s.id, authVersion:s.authVersion }; pinCreated = true; }
        }
        // Constant-cost password derivation even when a roster entry doesn't exist.
        const stored = s?.passwordHash || '00000000000000000000000000000000:' + '0'.repeat(64);
        if (!user && await verifyPassword(password, stored) && s) user = { role: 'student', groupId, id: s.id, authVersion: s.authVersion };
      }
      if (!user || !found?.me) return json({ error: '등록 정보 또는 접속 코드가 일치하지 않습니다.' }, 401);
      return json({ result: pinCreated ? { ...found.me, pinCreated: true } : found.me }, 200, { 'Set-Cookie': cookie(await signSession(user, env.LAB_SESSION_SECRET)) });
    }
    const user = await readSession(request, env.LAB_SESSION_SECRET);
    if (!user) return json({ error: '로그인해 주세요.' }, 401);
    if (action === 'me') return json({ result: await repo.execute('me', {}, user) });
    if(action==='groups.enter') {
      const group=await repo.execute(action,payload,user);
      const next={role:'teacher',owner:true,groupId:group.id};
      return json({result:await repo.execute('me',{},next)},200,{'Set-Cookie':cookie(await signSession(next,env.LAB_SESSION_SECRET))});
    }
    if (!STUDENT.has(action) && !ADMIN.has(action)) return json({ error: '지원하지 않는 요청입니다.' }, 404);
    if ((ADMIN.has(action) && user.role !== 'teacher') || (STUDENT.has(action) && user.role !== 'student')) return json({ error: '접근 권한이 없습니다.' }, 403);
    if(action==='groups.create' || action==='groups.update') {
      delete payload.passwordHash;
      if(payload.password){
        if(typeof payload.password!=='string' || payload.password.length<7 || payload.password.length>128) return json({error:'그룹 교사 암호는 7~128자로 지정하세요.'},400);
        payload.passwordHash=await passwordHash(payload.password);
      }
      delete payload.password;
    }
    if (action === 'students.import') {
      if (!Array.isArray(payload.students) || payload.students.length > 100) return json({ error: '1~100명씩 등록하세요.' }, 400);
      const rows = [];
      for (const student of payload.students) {
        const password = String(student.password || '');
        if (password && !validStudentSecret(password)) return json({ error: '학생 PIN은 숫자 4자리, 기존 접속 코드는 8~128자입니다.' }, 400);
        const { password: ignored, passwordHash: untrusted, ...info } = student;
        rows.push({ ...info, ...(password ? { passwordHash: await passwordHash(password) } : {}) });
      }
      payload.students = rows;
    }
    if (action === 'student.update') {
      delete payload.passwordHash;
      if (payload.password) {
        if (!validStudentSecret(payload.password)) return json({ error: '학생 PIN은 숫자 4자리, 기존 접속 코드는 8~128자입니다.' }, 400);
        payload.passwordHash = await passwordHash(payload.password);
      }
      delete payload.password;
    }
    if (env.LAB_DB && !injectedRepository && (action === 'sheets.refresh' || action === 'migrate.fromSheets')) {
      if (!user.owner) return json({ error: '전체 관리자만 실행할 수 있습니다.' }, 403);
      if (action === 'migrate.fromSheets') return json({ result: await migrateFromSheets(env, { force: payload.force === true }) });
      const synced = await syncToSheets(env, { force: true });
      return json({ result: { ok: true, views: synced.views || null } });
    }
    return json({ result: await repo.execute(action, payload, user) });
  } catch (error) {
    const status = error.status || (error instanceof SyntaxError ? 400 : 502);
    return json({ error: error.status ? error.message : '요청을 처리하지 못했습니다. 저장 상태를 확인하고 다시 시도하세요.' }, status);
  }
}
