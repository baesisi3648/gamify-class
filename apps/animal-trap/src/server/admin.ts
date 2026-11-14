/**
 * admin.ts — 문제은행 관리 라우트 (DESIGN §7). env 를 모른다 — AdminPorts 만 안다.
 * 모든 요청에서 X-Admin-Password 를 확인한다(세션 없음). 비밀번호 시도는 IP별 제한(포트가 있을 때).
 *
 *   GET  /api/admin/sets                         세트 목록·난이도별 개수
 *   POST /api/admin/questions        {setName}   세트의 문항 (정답·해설 포함 — 관리자 전용)
 *   POST /api/admin/import/preview   {json, setName?}
 *   POST /api/admin/import           {json, setName?, mode: add|replace}
 *   POST /api/admin/export           {setName}   → {fileName, content}
 *   POST /api/admin/sets/delete      {setName}
 *   POST /api/admin/questions/delete {id}
 */
import type { Level } from '../game/types.ts';
import { cleanSetName, exportFileName, LEVELS, LIMITS, parseImport, toPortable, type QuestionRow } from './bank.ts';

export type Envelope = { ok: true; data: unknown } | { ok: false; error: string; message?: string };

export interface StoredQuestion extends QuestionRow { id: number }
export interface AdminPorts {
  adminPassword: string | undefined;
  eq(a: string, b: string): Promise<boolean>;
  now(): number;
  /** 관리자 비밀번호 시도 제한 (false 면 거절). 없으면 제한 없음 */
  adminAttempt?(clientKey: string): Promise<boolean>;
  listSets(): Promise<{ name: string; counts: Record<Level, number> }[]>;
  listQuestions(setName: string): Promise<StoredQuestion[]>;
  /** add: 이어 붙이기 / replace: 같은 이름 세트를 지우고 넣기 — 한 트랜잭션 */
  importRows(setName: string, mode: 'add' | 'replace', rows: QuestionRow[]): Promise<number | 'FULL'>;
  deleteSet(setName: string): Promise<number>;
  deleteQuestion(id: number): Promise<boolean>;
}

const ok = (data: unknown): Envelope => ({ ok: true, data });
const no = (error: string, message?: string): Envelope => (message ? { ok: false, error, message } : { ok: false, error });
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export const isAdminPath = (path: string) => path.startsWith('/api/admin/');

/** 꺼짐 → 시도 제한 → 비밀번호. 통과하면 null. index.ts 가 **본문을 읽기 전에** 부른다 */
export async function adminGate(headers: Record<string, string>, p: Pick<AdminPorts, 'adminPassword' | 'adminAttempt' | 'eq'>): Promise<Envelope | null> {
  if (!p.adminPassword) return no('ADMIN_DISABLED');
  if (p.adminAttempt && !(await p.adminAttempt(headers['cf-connecting-ip'] ?? 'local'))) return no('ADMIN_RATE_LIMITED', '비밀번호를 너무 여러 번 시도했어요. 1분 뒤 다시 해 주세요.');
  if (!(await p.eq(headers['x-admin-password'] ?? '', p.adminPassword))) return no('ADMIN_DENIED');
  return null;
}

/** adminChecked: index.ts 가 이미 adminGate 를 통과시켰다(시도 횟수를 두 번 세지 않게). 헤더로는 켤 수 없다 */
export async function adminRoute(req: { method: string; path: string; headers: Record<string, string>; body: unknown; adminChecked?: boolean }, p: AdminPorts): Promise<Envelope | null> {
  if (!isAdminPath(req.path)) return null;
  if (!req.adminChecked) { const denied = await adminGate(req.headers, p); if (denied) return denied; }
  const b = obj(req.body), m = req.method, path = req.path;

  if (path === '/api/admin/sets' && m === 'GET') {
    const sets = await p.listSets();
    return ok({ sets: sets.map((s) => ({ ...s, total: LEVELS.reduce((n, l) => n + (s.counts[l] ?? 0), 0) })) });
  }
  if (m !== 'POST') return no('METHOD');
  if (path === '/api/admin/questions') {
    const setName = cleanSetName(b.setName);
    if (!setName) return no('BAD_REQUEST', '세트 이름이 필요해요.');
    return ok({ setName, questions: await p.listQuestions(setName) });
  }
  if (path === '/api/admin/import/preview' || path === '/api/admin/import') {
    const parsed = parseImport(b.json, typeof b.setName === 'string' ? b.setName : null);
    if (typeof parsed === 'string') return no('BAD_FILE', parsed);
    const setName = cleanSetName(b.setName) || parsed.summary.title;
    const have = (await p.listSets()).find((s) => s.name === setName);
    const existing = !!have, haveCount = have ? LEVELS.reduce((n, l) => n + (have.counts[l] ?? 0), 0) : 0;
    if (path === '/api/admin/import/preview') return ok({ setName, existing, existingCount: haveCount, ...parsed.summary });
    const mode = b.mode === 'replace' ? 'replace' : b.mode === 'add' ? 'add' : null;
    if (!mode) return no('BAD_REQUEST', '가져오기 방식은 add(추가) 또는 replace(같은 이름 세트 교체)예요.');
    if (!setName) return no('BAD_REQUEST', '세트 이름이 없어요. 파일에 "title" 을 넣거나 세트 이름을 적어 주세요.');
    // ⚠️ 0문항이면 아무것도 바꾸지 않는다 — replace 가 세트를 비우고 끝나는 사고 방지
    if (!parsed.rows.length) return no('BAD_FILE', `넣을 수 있는 문항이 없어요 (${parsed.summary.errors.length}개 모두 형식 오류). 아무것도 바꾸지 않았어요.`);
    // 한 세트는 300문항까지 — 판 하나가 받는 최대치(BANK_MAX)이자 가져오기 한 번의 최대치. 넘치면 판도 못 만들고 백업 복원도 안 된다
    if (mode === 'add' && haveCount + parsed.rows.length > LIMITS.perImport) return no('BAD_FILE', `한 세트는 ${LIMITS.perImport}문항까지예요 (지금 ${haveCount} + 새로 ${parsed.rows.length}). 세트를 나누거나 교체로 넣어 주세요.`);
    // 위 검사는 안내용. 동시에 두 번 넣는 경우는 importRows 가 같은 트랜잭션 안에서 다시 세어 통째로 되돌린다('FULL')
    const inserted = await p.importRows(setName, mode, parsed.rows.map((r) => ({ ...r, setName })));
    if (inserted === 'FULL') return no('BAD_FILE', `한 세트는 ${LIMITS.perImport}문항까지예요. 그사이 다른 곳에서 문항이 들어왔어요 — 목록을 새로 보고 다시 해 주세요. 아무것도 바꾸지 않았어요.`);
    return ok({ setName, inserted, skipped: parsed.summary.errors.length, errors: parsed.summary.errors });
  }
  if (path === '/api/admin/export') {
    const setName = cleanSetName(b.setName);
    if (!setName) return no('BAD_REQUEST', '세트 이름이 필요해요.');
    const rows = await p.listQuestions(setName);
    if (!rows.length) return no('NOT_FOUND', '그 세트에 문항이 없어요.');
    return ok({ fileName: exportFileName(setName, p.now()), content: toPortable(setName, rows) });
  }
  if (path === '/api/admin/sets/delete') {
    const setName = cleanSetName(b.setName);
    if (!setName) return no('BAD_REQUEST', '세트 이름이 필요해요.');
    return ok({ setName, deleted: await p.deleteSet(setName) });
  }
  if (path === '/api/admin/questions/delete') {
    const id = Number(b.id);
    if (!Number.isInteger(id) || id <= 0) return no('BAD_REQUEST');
    return (await p.deleteQuestion(id)) ? ok({ id }) : no('NOT_FOUND');
  }
  return no('NOT_FOUND');
}
