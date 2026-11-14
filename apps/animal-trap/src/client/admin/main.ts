/**
 * admin/main.ts — 문제은행 관리 (DESIGN §7).
 *
 * - 관리자 비밀번호는 이 탭의 메모리에만 둔다(저장 안 함). 새로 고치면 다시 입력.
 * - 가져오기: 파일 고르기 또는 붙여넣기 → 미리보기(서버가 형식 검사, 저장 안 함) → 추가 / 같은 이름 세트 교체.
 * - 내보내기: 서버가 만든 JSON 을 Blob 으로 내려받는다(애니멀 더비와 같은 형식).
 * ⚠️ 문항·세트 이름은 교사가 넣은 글이라 반드시 esc() 로.
 */
import type { StoredQuestion } from '../../server/admin.ts';
import type { ImportSummary } from '../../server/bank.ts';
import type { Level } from '../../game/types.ts';
import { call, errText, type Envelope } from '../shared/net.ts';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const app = $('#app');
const LEVELS: Level[] = ['쉬움', '보통', '어려움'];

let toastTimer: number | undefined;
function toast(msg: string) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = window.setTimeout(() => (t.hidden = true), 5000); }
const say = (r: { ok: false; error: string; message?: string }) => toast(r.message || errText(r.error));

let password = '';
interface SetInfo { name: string; counts: Record<Level, number>; total: number }
let sets: SetInfo[] = [];
let openSet: string | null = null;
let questions: StoredQuestion[] = [];
let pending: { json: unknown; preview: ImportSummary & { setName: string; existing: boolean } } | null = null;

async function api<T>(path: string, body?: unknown, method = 'POST'): Promise<Envelope<T>> {
  const r = await call<T>(path, { 'X-Admin-Password': password }, body, method);
  if (!r.ok && (r.error === 'ADMIN_DENIED' || r.error === 'ADMIN_DISABLED')) { password = ''; say(r); renderGate(); }
  return r;
}

// ── 비밀번호 ───────────────────────────────────────────────
function renderGate() {
  app.innerHTML = `
    <section class="card form gate">
      <h1>📚 문제은행</h1>
      <p class="muted" style="margin:0">애니멀 트랩 문제 세트를 가져오고 내보내요.</p>
      <label>관리자 비밀번호<input id="pw" type="password" autocomplete="current-password"></label>
      <button class="btn" id="enter">들어가기</button>
      <a class="small" href="/teacher" style="text-align:center;text-decoration:none">← 교사 화면</a>
    </section>`;
  const go = async () => {
    const v = ($('#pw') as HTMLInputElement).value;
    if (!v) return toast('비밀번호를 입력해 주세요.');
    password = v;
    $<HTMLButtonElement>('#enter').disabled = true;
    if (await loadSets()) render(); else if (password) { password = ''; $<HTMLButtonElement>('#enter').disabled = false; }
  };
  $('#enter').onclick = go;
  ($('#pw') as HTMLInputElement).onkeydown = (e) => { if (e.key === 'Enter') go(); };
  ($('#pw') as HTMLInputElement).focus();
}

async function loadSets(): Promise<boolean> {
  const r = await api<{ sets: SetInfo[] }>('/api/admin/sets', undefined, 'GET');
  if (!r.ok) { if (password) say(r); return false; }
  sets = r.data.sets;
  if (openSet && !sets.some((s) => s.name === openSet)) { openSet = null; questions = []; }
  return true;
}

async function loadQuestions(name: string) {
  const r = await api<{ questions: StoredQuestion[] }>('/api/admin/questions', { setName: name });
  if (!r.ok) return say(r);
  openSet = name; questions = r.data.questions; render();
  document.getElementById('detail')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// ── 화면 ───────────────────────────────────────────────────
const chips = (c: Record<Level, number>) => `<span class="chips">${LEVELS.map((l) => `<span class="chip ${c[l] ? '' : 'zero'}">${l} ${c[l] ?? 0}</span>`).join('')}</span>`;

function render() {
  if (!password) return renderGate();
  const anyZero = sets.some((s) => LEVELS.some((l) => !s.counts[l]));
  app.innerHTML = `
    <div class="top"><h1>📚 문제은행</h1><div class="row"><a class="small" href="/teacher" style="text-decoration:none">교사 화면 →</a><button class="small" id="logout">잠그기</button></div></div>
    <div class="layout">
      <div style="display:grid;gap:14px;min-width:0">
        <section class="card">
          <h2>문제 세트 (${sets.length})</h2>
          ${sets.length ? `<div class="sets">${sets.map((s) => `
            <div class="set ${s.name === openSet ? 'on' : ''}">
              <div style="display:grid;gap:4px;min-width:0"><span class="name">${esc(s.name)}</span>${chips(s.counts)}</div>
              <div class="row"><button class="small" data-open="${esc(s.name)}">문항 보기</button><button class="small" data-export="${esc(s.name)}">내보내기</button><button class="small warn" data-del="${esc(s.name)}">세트 삭제</button></div>
            </div>`).join('')}</div>` : '<p class="muted" style="margin:0">아직 문제가 없어요. 오른쪽에서 문제 파일을 가져오세요.</p>'}
          ${anyZero ? '<p class="muted" style="font-size:.85rem;margin:10px 0 0">빨간 칸: 그 난이도 문제가 없으면 이 세트만으로는 판을 만들 수 없어요(쉬움·보통·어려움 각 1개 이상).</p>' : ''}
          <p class="muted" style="font-size:.85rem;margin:8px 0 0">판을 만들 때 세트 이름을 비우면 모든 세트의 문제를 함께 써요.</p>
        </section>
        ${openSet ? detailHtml() : ''}
      </div>
      <section class="card form" aria-labelledby="imp">${importHtml()}</section>
    </div>`;
  bind();
}

function detailHtml() {
  return `<section class="card" id="detail">
    <div class="top" style="margin-bottom:10px"><h2 style="margin:0">${esc(openSet)} · ${questions.length}문항</h2><button class="small" id="closeDetail">닫기</button></div>
    <div class="qlist">${questions.map((q, i) => `
      <div class="qitem">
        <div class="head"><div><span class="lv-${q.level}" style="font-weight:800">${q.level}</span> <span class="muted">#${i + 1}</span><div style="font-weight:700;margin-top:2px">${esc(q.text)}</div></div>
          <button class="small warn" data-qdel="${q.id}" aria-label="${i + 1}번 문항 삭제">삭제</button></div>
        <ol>${q.choices.map((c, j) => `<li class="${j + 1 === q.answer ? 'ans' : ''}">${esc(c)}${j + 1 === q.answer ? ' ✓' : ''}</li>`).join('')}</ol>
        ${q.explanation ? `<div class="meta muted">해설: ${esc(q.explanation)}</div>` : ''}
      </div>`).join('')}</div>
  </section>`;
}

function importHtml() {
  const p = pending?.preview;
  return `
    <h2 id="imp">문제 가져오기</h2>
    <p class="muted" style="margin:0;font-size:.88rem">애니멀 더비·애니멀 트랩에서 내보낸 JSON 파일을 그대로 넣을 수 있어요. <button class="small" id="sample" type="button">빈 양식 받기</button></p>
    <label>파일 고르기<input id="file" type="file" accept=".json,application/json"></label>
    <label>또는 붙여넣기<textarea id="paste" spellcheck="false" placeholder='{ "title": "…", "questions": [ … ] }'></textarea></label>
    <label>세트 이름 <span class="muted" style="font-weight:400">(비우면 파일의 title)</span><input id="importName" maxlength="60" list="setNames" value="${esc(p?.setName ?? '')}"></label>
    <datalist id="setNames">${sets.map((s) => `<option value="${esc(s.name)}">`).join('')}</datalist>
    <button class="btn ghost" id="preview" type="button">미리보기</button>
    ${p ? `<div class="preview" aria-live="polite">
      <div><b>${esc(p.setName || '(이름 없음)')}</b> — 넣을 수 있는 문항 <b>${p.total}</b>개 ${chips(p.byLevel)}</div>
      ${p.errors.length ? `<div><b class="no">건너뛸 문항 ${p.errors.length}개</b><ul class="errors">${p.errors.map((e) => `<li>${e.index + 1}번째: ${esc(e.reason)}</li>`).join('')}</ul></div>` : ''}
      ${p.existing ? `<p class="muted" style="margin:0;font-size:.88rem">같은 이름의 세트가 이미 있어요. <b>추가</b>는 뒤에 이어 붙이고, <b>교체</b>는 기존 문항을 지우고 새로 넣어요.</p>` : ''}
      <div class="row">
        <button class="btn" id="doAdd" ${p.total && p.setName ? '' : 'disabled'}>${p.existing ? '추가하기' : '가져오기'}</button>
        ${p.existing ? `<button class="btn warn" id="doReplace" ${p.total ? '' : 'disabled'}>교체하기</button>` : ''}
        <button class="small" id="cancel">취소</button>
      </div>
      ${!p.setName ? '<p class="no" style="margin:0">세트 이름을 적고 다시 미리보기 해 주세요.</p>' : ''}
    </div>` : ''}`;
}

function bind() {
  $('#logout').onclick = () => { password = ''; sets = []; questions = []; openSet = null; pending = null; renderGate(); };
  app.querySelectorAll<HTMLButtonElement>('[data-open]').forEach((b) => (b.onclick = () => loadQuestions(b.dataset.open as string)));
  app.querySelectorAll<HTMLButtonElement>('[data-export]').forEach((b) => (b.onclick = () => exportSet(b.dataset.export as string)));
  app.querySelectorAll<HTMLButtonElement>('[data-del]').forEach((b) => (b.onclick = () => deleteSet(b.dataset.del as string)));
  app.querySelectorAll<HTMLButtonElement>('[data-qdel]').forEach((b) => (b.onclick = () => deleteQuestion(Number(b.dataset.qdel))));
  const close = document.getElementById('closeDetail'); if (close) close.onclick = () => { openSet = null; questions = []; render(); };
  $('#sample').onclick = () => download('애니멀트랩_양식.json', SAMPLE);
  $('#file').onchange = async () => {
    const f = ($('#file') as HTMLInputElement).files?.[0]; if (!f) return;
    if (f.size > 2_000_000) return toast('파일이 너무 커요 (2MB까지).');
    ($('#paste') as HTMLTextAreaElement).value = await f.text();
    preview();
  };
  $('#preview').onclick = preview;
  const cancel = document.getElementById('cancel'); if (cancel) cancel.onclick = () => { pending = null; render(); };
  const add = document.getElementById('doAdd'); if (add) add.onclick = () => doImport('add');
  const rep = document.getElementById('doReplace'); if (rep) rep.onclick = () => doImport('replace');
}

// ── 동작 ───────────────────────────────────────────────────
let working = false;
async function busy<T>(f: () => Promise<T>): Promise<T | undefined> {
  if (working) return; working = true;
  app.querySelectorAll<HTMLButtonElement>('button').forEach((b) => (b.disabled = true));
  try { return await f(); } finally { working = false; if (password) render(); }
}

async function preview() {
  const text = ($('#paste') as HTMLTextAreaElement).value.trim();
  const name = ($('#importName') as HTMLInputElement).value;
  if (!text) return toast('파일을 고르거나 내용을 붙여넣어 주세요.');
  let json: unknown;
  try { json = JSON.parse(text.replace(/^﻿/, '')); } catch { return toast('JSON 형식이 아니에요. 괄호·따옴표·쉼표를 확인해 주세요.'); }
  await busy(async () => {
    const r = await api<ImportSummary & { setName: string; existing: boolean }>('/api/admin/import/preview', { json, setName: name });
    if (!r.ok) { pending = null; if (password) say(r); return; }
    pending = { json, preview: r.data };
  });
  const ta = document.getElementById('paste') as HTMLTextAreaElement | null; if (ta) ta.value = text;
}

async function doImport(mode: 'add' | 'replace') {
  if (!pending) return;
  const { json, preview: p } = pending;
  if (mode === 'replace' && !confirm(`'${p.setName}' 세트의 기존 문항을 모두 지우고 ${p.total}문항으로 바꿀까요?\n(되돌릴 수 없어요. 먼저 내보내기로 백업해 두면 안전해요.)`)) return;
  await busy(async () => {
    const r = await api<{ setName: string; inserted: number; skipped: number }>('/api/admin/import', { json, setName: p.setName, mode });
    if (!r.ok) { if (password) say(r); return; }
    pending = null;
    toast(`'${r.data.setName}' 세트${mode === 'replace' ? '를' : '에'} ${r.data.inserted}문항${mode === 'replace' ? '으로 교체했' : '을 넣었'}어요.${r.data.skipped ? ` (${r.data.skipped}개 건너뜀)` : ''}`);
    await loadSets();
    if (openSet === r.data.setName || !openSet) { const q = await api<{ questions: StoredQuestion[] }>('/api/admin/questions', { setName: r.data.setName }); if (q.ok) { openSet = r.data.setName; questions = q.data.questions; } }
  });
}

async function exportSet(name: string) {
  await busy(async () => {
    const r = await api<{ fileName: string; content: string }>('/api/admin/export', { setName: name });
    if (!r.ok) { if (password) say(r); return; }
    download(r.data.fileName, r.data.content);
  });
}

async function deleteSet(name: string) {
  const s = sets.find((x) => x.name === name);
  if (!confirm(`'${name}' 세트(${s?.total ?? 0}문항)를 삭제할까요?\n되돌릴 수 없어요. 필요하면 먼저 내보내기로 백업하세요.\n(이미 만든 판은 영향 없어요.)`)) return;
  await busy(async () => {
    const r = await api<{ deleted: number }>('/api/admin/sets/delete', { setName: name });
    if (!r.ok) { if (password) say(r); return; }
    toast(`'${name}' 세트 ${r.data.deleted}문항을 삭제했어요.`);
    if (openSet === name) { openSet = null; questions = []; }
    await loadSets();
  });
}

async function deleteQuestion(id: number) {
  const q = questions.find((x) => x.id === id);
  if (!q || !confirm(`이 문항을 삭제할까요?\n\n${q.text.slice(0, 80)}`)) return;
  await busy(async () => {
    const r = await api('/api/admin/questions/delete', { id, setName: openSet, text: q.text });
    if (!r.ok) {
      if (password) say(r);
      if (r.error === 'NOT_FOUND' && openSet) { const fresh = await api<{ questions: StoredQuestion[] }>('/api/admin/questions', { setName: openSet }); if (fresh.ok) questions = fresh.data.questions; await loadSets(); }
      return;
    }
    questions = questions.filter((x) => x.id !== id);
    await loadSets();
  });
}

function download(name: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json;charset=utf-8' }));
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const SAMPLE = JSON.stringify({
  title: '세트 이름을 여기에',
  questions: [
    { difficulty: 'easy', question: '쉬운 문제 예시: 효소의 주성분은?', choices: ['탄수화물', '단백질', '지방', '핵산'], answer: 2, explanation: '효소는 대부분 단백질로 이루어져 있다.' },
    { difficulty: 'medium', question: '보통 문제 예시', choices: ['보기 1', '보기 2', '보기 3', '보기 4'], answer: 1, explanation: '해설은 비워도 돼요.' },
    { difficulty: 'hard', question: '어려운 문제 예시', choices: ['보기 1', '보기 2', '보기 3', '보기 4'], answer: 4, explanation: '' }
  ]
}, null, 2);

renderGate();
