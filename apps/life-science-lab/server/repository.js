import { hmac, randomHex } from './auth.js';
export function sheetsRepository(env) {
  return {
    async execute(action, payload = {}, actor = {}, options = {}) {
      if (!env.LAB_SHEETS_URL || !env.LAB_SHEETS_SECRET) {
        throw Object.assign(new Error('연구소 저장소 연결을 준비 중입니다. 교사에게 문의하세요.'), { status: 503 });
      }
      const url = new URL(env.LAB_SHEETS_URL);
      if (url.origin !== 'https://script.google.com' || !url.pathname.endsWith('/exec')) throw new Error('Invalid Apps Script endpoint');
      const body = JSON.stringify({ action, payload, actor, timestamp: Date.now(), nonce: randomHex() });
      // Keep transport JSON encoding-independent. JSON.parse restores Unicode;
      // the receiver explicitly uses UTF-8 for the same signed body string.
      const envelope = JSON.stringify({ body, signature: await hmac(env.LAB_SHEETS_SECRET, body) })
        .replace(/[\u007f-\uffff]/g, (c) => '\\u' + c.charCodeAt(0).toString(16).padStart(4,'0'));
      const response = await fetch(url, {
        method: 'POST', headers: { 'Content-Type': 'application/json; charset=UTF-8' },
        body: envelope,
        signal: AbortSignal.timeout(options.timeout || 25000), redirect: 'follow'
      });
      let data;
      try { data = await response.json(); } catch { throw Object.assign(new Error('저장소 응답을 확인하지 못했습니다. 잠시 후 다시 시도하세요.'), { status: 502 }); }
      if (!data.ok) throw Object.assign(new Error(data.error || '저장소 요청 실패'), { status: data.status || 502 });
      return data.result;
    }
  };
}
