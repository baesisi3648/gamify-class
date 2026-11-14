/**
 * bank.ts — 문제 세트 JSON 읽고 쓰기 (DESIGN §7). **애니멀 더비 JSON 형식과 호환**:
 *
 * ```json
 * { "title": "세포와 물질대사 총정리",
 *   "questions": [ { "difficulty": "easy", "question": "…",
 *                    "choices": ["…","…","…","…"], "answer": 2, "explanation": "…" } ] }
 * ```
 *
 * - 런타임을 모른다(순수 함수) → 테스트가 workerd 없이 그대로 검사한다.
 * - 잘못된 문항은 건너뛰고 '몇 번째 문항이 왜' 틀렸는지 모은다. 파일 자체가 이 형식이 아닐 때만 통째로 거절.
 * - 난이도: easy·medium·hard(더비 파일) 또는 쉬움·보통·어려움(·중간)을 받는다. 저장은 쉬움·보통·어려움(D10).
 */
import type { Level } from '../game/types.ts';

export const LEVELS: readonly Level[] = ['쉬움', '보통', '어려움'];
export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export const LIMITS = { text: 500, choice: 150, explanation: 1000, setName: 60, perImport: 300 } as const;

export interface QuestionRow { setName: string; level: Level; text: string; choices: string[]; answer: number; explanation: string }
export interface ImportError { index: number; reason: string }
export interface ImportSummary { title: string; total: number; byLevel: Record<Level, number>; errors: ImportError[] }

export function levelOf(difficulty: unknown): Level | null {
  const d = String(difficulty ?? '').trim();
  const i = (DIFFICULTIES as readonly string[]).indexOf(d.toLowerCase());
  if (i >= 0) return LEVELS[i];
  if (d === '중간') return '보통'; // 예전 이름
  return (LEVELS as readonly string[]).includes(d) ? (d as Level) : null;
}
export const difficultyOf = (level: Level): string => DIFFICULTIES[LEVELS.indexOf(level)] ?? 'easy';

/** 세트 이름 정규화 — 가져오기·판 생성·조회 모두 이것 하나로(공백 차이로 세트를 못 찾는 일 방지) */
export const cleanSetName = (v: unknown) => (typeof v === 'string' ? v : '').trim().replace(/\s+/g, ' ').slice(0, LIMITS.setName);
/** 글자(또는 비어 있음)만 받는다. 숫자는 글자로 바꿔 준다(보기에 숫자를 그냥 적는 경우). 객체·배열·참거짓은 null */
const textOf = (v: unknown): string | null => (v === undefined || v === null ? '' : typeof v === 'string' ? v.trim() : typeof v === 'number' && Number.isFinite(v) ? String(v) : null);

function itemOf(raw: unknown, setName: string): QuestionRow | string {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return '문항이 객체가 아니에요';
  const r = raw as Record<string, unknown>;
  if (r.type !== undefined && r.type !== null && String(r.type).trim() !== '' && String(r.type).trim() !== 'multiple_choice') return `객관식만 지원해요 ('${String(r.type).trim()}' 형식은 넣을 수 없어요)`;
  const text = textOf(r.question ?? r.text);
  if (text === null) return '문제는 글자여야 해요';
  if (!text) return '문제가 비어 있어요';
  if (text.length > LIMITS.text) return `문제가 너무 길어요 (${text.length}자, 최대 ${LIMITS.text}자)`;
  if (!Array.isArray(r.choices)) return '보기 4개를 넣어 주세요';
  if (r.choices.length !== 4) return `보기는 4개여야 해요 (지금 ${r.choices.length}개)`;
  const cs = r.choices.map(textOf);
  const bad = cs.map((c, i) => (c === null ? i + 1 : 0)).filter(Boolean);
  if (bad.length) return `${bad.join('·')}번 보기는 글자여야 해요`;
  const choices = cs as string[];
  const empty = choices.map((c, i) => (c ? 0 : i + 1)).filter(Boolean);
  if (empty.length) return `${empty.join('·')}번 보기가 비어 있어요`;
  const long = choices.findIndex((c) => c.length > LIMITS.choice);
  if (long >= 0) return `${long + 1}번 보기가 너무 길어요 (최대 ${LIMITS.choice}자)`;
  const answer = typeof r.answer === 'number' ? r.answer : typeof r.answer === 'string' && /^\s*[1-4]\s*$/.test(r.answer) ? Number(r.answer) : NaN;
  if (!Number.isInteger(answer) || answer < 1 || answer > 4) return `정답은 1~4 중 하나여야 해요 ('${String(r.answer)}' 은(는) 아니에요)`;
  const level = levelOf(r.difficulty ?? r.level);
  if (!level) return `난이도는 easy·medium·hard(또는 쉬움·보통·어려움) 중 하나여야 해요 ('${String(r.difficulty ?? r.level)}' 은(는) 아니에요)`;
  const explanation = textOf(r.explanation);
  if (explanation === null) return '해설은 글자여야 해요';
  if (explanation.length > LIMITS.explanation) return `해설이 너무 길어요 (최대 ${LIMITS.explanation}자)`;
  return { setName, level, text, choices, answer, explanation };
}

/** 파일 전체 읽기. 파일이 이 형식이 아니면 거절 사유 문자열 */
export function parseImport(json: unknown, setName: string | null): { summary: ImportSummary; rows: QuestionRow[] } | string {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return 'JSON 객체가 아니에요. 애니멀 더비·애니멀 트랩에서 내보낸 파일인지 확인해 주세요.';
  const src = json as Record<string, unknown>;
  if (!Array.isArray(src.questions)) return "'questions' 가 배열이 아니에요. 내보내기로 받은 파일과 같은 모양이어야 해요.";
  if (src.questions.length > LIMITS.perImport) return `한 번에 ${LIMITS.perImport}문항까지 넣을 수 있어요 (지금 ${src.questions.length}문항).`;
  if (src.title !== undefined && src.title !== null && typeof src.title !== 'string') return "'title' 은 글자여야 해요.";
  const title = cleanSetName(src.title);
  const target = cleanSetName(setName ?? '') || title;
  const rows: QuestionRow[] = [], errors: ImportError[] = [];
  const byLevel: Record<Level, number> = { 쉬움: 0, 보통: 0, 어려움: 0 };
  src.questions.forEach((raw, i) => {
    const got = itemOf(raw, target);
    if (typeof got === 'string') { errors.push({ index: i, reason: got }); return; }
    rows.push(got); byLevel[got.level]++;
  });
  return { summary: { title, total: rows.length, byLevel, errors }, rows };
}

/**
 * 판에 넣을 문항이 max 를 넘으면(세트 이름을 비워 전체를 쓸 때) 난이도 비율대로 무작위로 줄인다.
 * 있는 난이도는 최소 1문항씩 남긴다. max 이하면 그대로.
 */
export function fitBank<T extends { level: Level }>(rows: T[], max: number, rand: () => number): T[] {
  if (rows.length <= max) return rows;
  const by = LEVELS.map((l) => rows.filter((r) => r.level === l));
  const take = by.map((g) => (g.length ? Math.max(1, Math.floor((g.length * max) / rows.length)) : 0));
  const sum = () => take.reduce((a, b) => a + b, 0);
  // 최소 1 때문에 넘치면 가장 많은 쪽에서 덜고, 모자라면 남은 쪽에 더한다 → 정확히 max
  while (sum() > max) { const i = take.indexOf(Math.max(...take)); take[i]--; }
  for (let i = 0; sum() < max; i = (i + 1) % 3) if (take[i] < by[i].length) take[i]++;
  return by.flatMap((g, i) => {
    const a = g.slice();
    for (let j = a.length - 1; j > 0; j--) { const k = Math.floor(rand() * (j + 1)); [a[j], a[k]] = [a[k], a[j]]; }
    return a.slice(0, take[i]);
  });
}

/** 내보내기: 들여쓰기 2칸(메모장으로 고칠 수 있게). id 는 사람이 부를 표시일 뿐 가져올 때 무시 */
export function toPortable(title: string, rows: Pick<QuestionRow, 'level' | 'text' | 'choices' | 'answer' | 'explanation'>[]): string {
  return JSON.stringify({
    title,
    questions: rows.map((q, i) => ({ id: 'q' + String(i + 1).padStart(3, '0'), difficulty: difficultyOf(q.level), question: q.text, choices: q.choices, answer: q.answer, explanation: q.explanation }))
  }, null, 2);
}

/** 파일 이름: 애니멀트랩_{세트}_{YYYY-MM-DD}.json (한국 시간 날짜, 파일 이름에 못 쓰는 글자 치환) */
export function exportFileName(setName: string, nowMs: number): string {
  const day = new Date(nowMs + 9 * 3600_000).toISOString().slice(0, 10);
  return `애니멀트랩_${(setName || '전체').replace(/[\\/:*?"<>|]/g, '_')}_${day}.json`;
}
