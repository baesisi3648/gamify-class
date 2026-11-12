import { hmac, readSession } from './auth.js';

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const json = (data, status = 200) => new Response(JSON.stringify(data), {
  status,
  headers: { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' }
});

function validSignature(type, bytes) {
  if (type === 'image/jpeg') return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === 'image/png') return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a;
  if (type === 'image/webp') return String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP';
  return false;
}

async function authorizedReport(repo, user, reportId) {
  const data = user.role === 'student'
    ? await repo.execute('myReports', {}, user)
    : await repo.execute('reports.list', {}, user);
  const report = data.reports.find((item) => item.id === reportId);
  if (!report) throw Object.assign(new Error('보고서를 찾을 수 없습니다.'), { status:404 });
  return report;
}

export async function handleReportImage(request, env, repo) {
  try {
    const url = new URL(request.url);
    const encoded = url.pathname.match(/^\/api\/lab\/report-image\/([^/]+)$/)?.[1];
    if (!encoded) return json({ error:'사진 경로를 확인해 주세요.' }, 404);
    const reportId = decodeURIComponent(encoded);
    if (!reportId || reportId.length > 120 || !/^[a-zA-Z0-9_-]+$/.test(reportId)) return json({ error:'보고서 번호를 확인해 주세요.' }, 400);
    if (!env.REPORT_IMAGES) return json({ error:'사진 저장소 연결을 준비 중입니다.' }, 503);
    const user = await readSession(request, env.LAB_SESSION_SECRET);
    if (!user) return json({ error:'로그인해 주세요.' }, 401);
    const report = await authorizedReport(repo, user, reportId);
    const groupId = user.groupId || 'legacy';
    const key = 'report-images/' + await hmac(env.LAB_SESSION_SECRET, groupId + ':' + reportId);

    if (request.method === 'GET') {
      const object = await env.REPORT_IMAGES.get(key);
      if (!object) return json({ error:'등록된 사진이 없습니다.' }, 404);
      const headers = new Headers({
        'Content-Type':object.httpMetadata?.contentType || object.customMetadata?.contentType || 'application/octet-stream',
        'Content-Length':String(object.size),
        'Cache-Control':'private, no-store',
        'Content-Disposition':'inline',
        'X-Content-Type-Options':'nosniff'
      });
      return new Response(object.body, { headers });
    }

    if (!['PUT','DELETE'].includes(request.method)) return json({ error:'지원하지 않는 사진 요청입니다.' }, 405);
    if (request.headers.get('Origin') !== url.origin) return json({ error:'허용되지 않은 요청 출처입니다.' }, 403);
    if (user.role !== 'student' || !['draft','revision'].includes(report.status)) return json({ error:'작성 중이거나 보완 중인 본인 보고서 사진만 변경할 수 있습니다.' }, 403);

    if (request.method === 'DELETE') {
      await env.REPORT_IMAGES.delete(key);
      return json({ result:true });
    }

    const type = (request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
    const declaredLength = Number(request.headers.get('Content-Length') || 0);
    if (!ALLOWED_TYPES.has(type)) return json({ error:'JPG, PNG, WebP 사진만 등록할 수 있습니다.' }, 415);
    if (declaredLength > MAX_IMAGE_BYTES) return json({ error:'사진은 5MB 이하로 등록해 주세요.' }, 413);
    const buffer = await request.arrayBuffer();
    if (!buffer.byteLength || buffer.byteLength > MAX_IMAGE_BYTES) return json({ error:'사진은 5MB 이하로 등록해 주세요.' }, 413);
    if (!validSignature(type, new Uint8Array(buffer, 0, Math.min(buffer.byteLength, 16)))) return json({ error:'사진 파일 형식을 확인해 주세요.' }, 415);
    await env.REPORT_IMAGES.put(key, buffer, {
      httpMetadata:{ contentType:type },
      customMetadata:{ contentType:type, reportId, groupId, studentId:String(report.studentId || user.id || '') }
    });
    return json({ result:{ size:buffer.byteLength, contentType:type } });
  } catch (error) {
    return json({ error:error.status ? error.message : '사진 요청을 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.' }, error.status || 502);
  }
}

export { MAX_IMAGE_BYTES };
