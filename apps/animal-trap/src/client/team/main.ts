/**
 * team/main.ts — 팀 폰 화면 (DESIGN §8). 받은 teamView 를 그릴 뿐, 규칙은 판단하지 않는다(서버 권위).
 *
 * 입장: 주소 #CODE 또는 #CODE-팀번호(QR) → 팀 고르기 → PIN → join. 조작권 토큰은 이 기기에만 저장(localStorage).
 * 진행: 대기 → 덫 설치(자동 배치 보기·옮기기·교환·확정) → [이동 → 문제 → 결과·정찰] 반복 → 종료·복습.
 * 조작: 보드를 누르거나, 같은 일을 하는 버튼(8방향 이동판·덫 목록)으로 — 작은 화면·키보드·스크린리더 대응.
 * ⚠️ 서버에서 온 글(문항·판 제목)은 전부 esc() 로 넣는다 — 교사가 등록한 문항에 HTML 이 섞여도 실행되지 않게.
 */
import type { PublicEvent, TeamView } from '../../game/views.ts';
import { cellAt, colOf, draw, neighbors, OASIS, rowOf, TEAM_COLORS, TRAP_ICON, TRAP_NAME, zoneOf, type BoardModel } from '../shared/board.ts';
import { call, command, Countdown, errText, live, mmss } from '../shared/net.ts';

const ANIMALS = ['🐆 치타', '🐅 호랑이', '🦓 얼룩말', '🐎 말', '🦒 기린', '🦘 캥거루', '🐇 토끼', '🐢 거북이'];
const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const app = $('#app');
const CODE_RE = /^[A-HJ-NP-Z2-9]{6}$/;
const ZOOM_N = 8; // 확대 시 8×8 = 360px 폭에서 칸당 약 45px

interface Creds { code: string; team: number; pin: string; token: string | null }
const storeKey = (code: string) => 'animal-trap:' + code;
function load(code: string): Creds | null {
  try {
    const v = JSON.parse(localStorage.getItem(storeKey(code)) ?? 'null');
    if (!v || typeof v !== 'object') return null;
    const team = v.team, pin = v.pin, token = v.token;
    if (!Number.isInteger(team) || team < 0 || team > 7 || typeof pin !== 'string' || !/^\d{4}$/.test(pin)) return null;
    return { code, team, pin, token: typeof token === 'string' && /^[A-Z2-9]{20,40}$/.test(token) ? token : null };
  } catch { return null; }
}
const save = (c: Creds) => { try { localStorage.setItem(storeKey(c.code), JSON.stringify({ team: c.team, pin: c.pin, token: c.token })); } catch { /* 저장 못 해도 진행 */ } };
const forget = (code: string) => { try { localStorage.removeItem(storeKey(code)); } catch { /* */ } };

let toastTimer: number | undefined;
function toast(msg: string) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = window.setTimeout(() => (t.hidden = true), 3500); }

// ── 세션 (재입장 시 이전 것을 완전히 정리한다) ─────────────────────
let session: { close(): void } | null = null;
function endSession() { session?.close(); session = null; view = null; clock = null; sessionNo++; resetUiAll(); $('#banners').innerHTML = ''; }

// ── 입장 ─────────────────────────────────────────────────────
function parseHash(): { code: string; team: number | null } {
  const m = location.hash.slice(1).toUpperCase().match(/^([A-HJ-NP-Z2-9]{6})(?:-(\d))?$/);
  return m ? { code: m[1], team: m[2] !== undefined && Number(m[2]) < 8 ? Number(m[2]) : null } : { code: '', team: null };
}

function renderEntry(message = '') {
  endSession();
  const h = parseHash();
  let team = h.team;
  app.innerHTML = `
    <section class="hero"><div class="logo" aria-hidden="true">🌴</div><h1>애니멀 트랩</h1><p class="muted">오아시스 쟁탈전 · 우리 팀 화면</p></section>
    <section class="card actions">
      ${message ? `<p role="alert" style="color:var(--danger);font-weight:700;margin:0">${esc(message)}</p>` : ''}
      <label class="field">판 코드<input id="code" inputmode="text" autocomplete="off" autocapitalize="characters" maxlength="6" value="${esc(h.code)}" placeholder="칠판의 6자리"></label>
      <fieldset style="border:0;padding:0;margin:0"><legend style="font-weight:700;margin-bottom:6px">우리 팀</legend><div class="teams" id="teams">
        ${ANIMALS.map((a, i) => { const [e, n] = a.split(' '); return `<button type="button" data-team="${i}" aria-pressed="${team === i}" style="--c:${TEAM_COLORS[i]}"><span class="e" aria-hidden="true">${e}</span>${n}</button>`; }).join('')}
      </div></fieldset>
      <label class="field">팀 PIN (4자리)<input id="pin" inputmode="numeric" autocomplete="off" maxlength="4" pattern="[0-9]{4}" placeholder="••••"></label>
      <button class="btn" id="go">입장하기</button>
    </section>`;
  $('#teams').onclick = (e) => {
    const b = (e.target as HTMLElement).closest('button[data-team]') as HTMLButtonElement | null; if (!b) return;
    team = Number(b.dataset.team);
    document.querySelectorAll('#teams button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
  };
  $('#go').onclick = async () => {
    const code = $<HTMLInputElement>('#code').value.trim().toUpperCase(), pin = $<HTMLInputElement>('#pin').value.trim();
    if (!CODE_RE.test(code)) return toast('판 코드 6자리를 확인해 주세요.');
    if (team === null) return toast('우리 팀을 골라 주세요.');
    if (!/^\d{4}$/.test(pin)) return toast('PIN 4자리를 입력해 주세요.');
    const btn = $<HTMLButtonElement>('#go'); btn.disabled = true;
    const mine = sessionNo;
    const r = await call<{ role: string; token: string | null }>(`/api/game/${code}/join`, { 'X-Team-Pin': pin }, { team });
    if (mine !== sessionNo) return;                   // 응답을 기다리는 사이 다른 판으로 이동했으면 무시
    btn.disabled = false;
    if (!r.ok) return toast(errText(r.error));
    const creds: Creds = { code, team, pin, token: r.data.token };
    save(creds);
    if (location.hash.slice(1).toUpperCase() !== code) history.replaceState(null, '', '#' + code);
    start(creds);
  };
}

// ── 진행 화면 ────────────────────────────────────────────────
let creds: Creds;
let view: TeamView | null = null;
let clock: Countdown | null = null;
let canvas: HTMLCanvasElement | null = null;
const ui = { selectedTrap: null as number | null, pick: null as number | null, zoom: false, focus: null as number | null, reconMode: false, reconTL: null as number | null, busy: false };
let resetKey = '';
let dirty = true;
let sessionNo = 0; // 세션이 바뀌면 이전 세션의 늦은 응답은 무시한다

function headers() { return { 'X-Team-Pin': creds.pin, 'X-Control-Token': creds.token ?? '' }; }
async function send(cmd: Record<string, unknown>): Promise<unknown | null> {
  if (ui.busy) return null;
  const mine = sessionNo;
  ui.busy = true; render();
  const r = await command(`/api/game/${creds.code}/team`, headers(), { team: creds.team, cmd });
  if (mine !== sessionNo) return null;               // 그사이 다른 판·팀으로 들어갔다
  ui.busy = false; render();
  if (!r.ok) { toast(errText(r.error)); return null; }
  return r.data ?? true;
}

function resetUiAll() { Object.assign(ui, { selectedTrap: null, pick: null, zoom: false, focus: null, reconMode: false, reconTL: null, busy: false }); resetKey = ''; }

function start(c: Creds) {
  endSession();
  sessionNo++; resetUiAll();
  creds = c;
  app.innerHTML = `
    <header class="hud" id="hud"></header>
    <div class="phase" id="phase" role="status"></div>
    <div class="chips" id="chips"></div>
    <div class="board-bar"><span class="muted" id="boardHint"></span><span class="pan" id="pan"></span><button class="zoom" id="zoom" hidden>🔍 확대</button></div>
    <div class="board-wrap"><canvas class="board" id="board" role="img" aria-label="게임판"></canvas></div>
    <section id="panel" class="actions"></section>`;
  canvas = $('#board') as HTMLCanvasElement;
  canvas.addEventListener('click', onBoardClick);
  $('#zoom').onclick = () => { ui.zoom = !ui.zoom; ui.focus = null; render(); };
  const sock = live<TeamView>({
    code: c.code,
    hello: () => ({ role: 'team', team: c.team, pin: c.pin, token: c.token ?? '' }),
    onState: (v) => {
      view = v; clock = Countdown.of(v);
      const key = [v.phase, v.round, v.step, v.me.controller, v.paused].join('|');
      if (key !== resetKey) { resetKey = key; ui.selectedTrap = null; ui.pick = null; if (!reconOpen(v)) ui.reconMode = false; }
      render();
    },
    onStatus: (up) => { $('#banners').innerHTML = (up ? '' : '<div class="banner off" role="alert">연결이 끊겼어요. 다시 연결하는 중…</div>') + viewerBanner(); },
    onClosedForGood: (code) => { if (code === 4003) { $('#banners').innerHTML = '<div class="banner off" role="alert">이 판에 기기가 너무 많이 접속해 이 화면의 연결을 끊었어요. 새로 고치면 다시 연결돼요.</div>'; return; } forget(c.code); renderEntry('PIN이 바뀌었거나 입장 정보가 맞지 않아요. 선생님께 PIN을 다시 받아 주세요.'); }
  });
  const timer = window.setInterval(tickClock, 250);
  session = { close: () => { sock.close(); clearInterval(timer); canvas = null; } };
}

/** 그리기 루프: 상태가 바뀌었을 때 + 반짝임이 있을 때만 초당 약 12번 (모션 감소면 바뀔 때만) */
let lastDraw = 0;
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
function frame(t: number) {
  if (view && canvas?.isConnected) {
    const animate = !reduceMotion.matches && document.visibilityState === 'visible';
    if (dirty || (animate && t - lastDraw > 80)) { draw(canvas, boardModel(view), t); dirty = false; lastDraw = t; }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
window.addEventListener('resize', () => (dirty = true));

const viewerBanner = () => (view && !view.me.controller ? '<div class="banner view">보기 전용 기기예요 · <button id="takeControl" style="background:#fff;color:var(--navy);padding:4px 10px;font-weight:800">이 기기로 조작하기</button></div>' : '');

/** 조작권이 비어 있으면(선생님이 해제했거나 처음 기기가 없을 때) 이 기기가 다시 받는다 */
async function takeControl() {
  const mine = sessionNo, from = creds;
  const r = await call<{ role: string; token: string | null }>(`/api/game/${from.code}/join`, { 'X-Team-Pin': from.pin }, { team: from.team });
  if (mine !== sessionNo) return;                     // 그사이 다른 판·팀으로 바뀌었으면 무시
  if (!r.ok) return toast(errText(r.error));
  if (r.data.role !== 'controller') return toast('다른 기기가 조작 중이에요. 바꾸려면 선생님께 조작권 해제를 부탁하세요.');
  creds = { ...from, token: r.data.token }; save(creds); start(creds);
}
document.addEventListener('click', (e) => { if ((e.target as HTMLElement).id === 'takeControl') void takeControl(); });

function tickClock() {
  if (!view || !clock) return;
  const m = document.getElementById('mainClock'); if (m) m.textContent = mmss(clock.mainLeft());
  const p = document.getElementById('phaseClock'); const left = clock.phaseLeft(); if (p) p.textContent = left === null ? '' : mmss(left);
}

const myPos = (v: TeamView) => v.teams[v.me.team].pos;
const myZone = (v: TeamView) => v.teams[v.me.team].zone;
const ownCells = (v: TeamView) => new Set(v.me.traps.filter((t) => t.active).map((t) => t.cell));
const canAct = (v: TeamView) => v.me.controller && !v.paused && !ui.busy;
const canMove = (v: TeamView) => v.phase === 'RUNNING' && v.step === 'MOVE_OPEN' && canAct(v) && !v.teams[v.me.team].status.moved && v.teams[v.me.team].status.boundLeft === 0;
const setupOpen = (v: TeamView) => v.phase === 'TRAP_SETUP' && canAct(v) && !v.teams[v.me.team].status.setupConfirmed;
const reconOpen = (v: TeamView) => v.me.reconAvailable && v.me.controller && !v.paused && ((v.phase === 'RUNNING' && (v.step === 'ROUND_SUMMARY' || v.step === 'MOVE_OPEN')) || v.phase === 'FINISHED' || v.phase === 'REVIEW');
const coord = (cell: number) => `세로 ${rowOf(cell) + 1}·가로 ${colOf(cell) + 1}`;

function allowedTrapCells(v: TeamView): Set<number> {
  const own = ownCells(v), zone = myZone(v);
  return new Set([...Array(256).keys()].filter((c) => !OASIS.includes(c) && zoneOf(c) !== zone && !own.has(c)));
}

function zoomWindow(v: TeamView): BoardModel['view'] | undefined {
  if (!ui.zoom) return undefined;
  const sel = v.me.traps.find((t) => t.id === ui.selectedTrap)?.cell;
  const f = ui.focus ?? sel ?? myPos(v) ?? 7 * 16 + 7;
  const clamp = (x: number) => Math.max(0, Math.min(16 - ZOOM_N, x));
  return { r0: clamp(rowOf(f) - ZOOM_N / 2 + 1), c0: clamp(colOf(f) - ZOOM_N / 2 + 1), n: ZOOM_N };
}

function boardModel(v: TeamView): BoardModel {
  const pos = myPos(v);
  const m: BoardModel = {
    animals: v.teams.map((t) => ({ team: t.team, emoji: t.animal.emoji, pos: t.pos, highlight: t.team === v.me.team })),
    zones: v.teams.map((t) => t.zone), myTeam: v.me.team, myTraps: v.me.traps, selectedTrap: ui.selectedTrap,
    visited: v.me.visited, recon: v.me.recon, trapMap: v.trapMap,
    sensor: v.phase === 'RUNNING' && pos !== null ? { cell: pos, value: v.me.sensor } : null,
    view: zoomWindow(v)
  };
  if (setupOpen(v) && ui.selectedTrap !== null) m.allowedCells = allowedTrapCells(v);
  if (canMove(v) && pos !== null) { m.candidates = neighbors(pos); m.pick = ui.pick; }
  if (ui.reconMode) m.reconPreview = ui.reconTL;
  return m;
}

async function onBoardClick(e: MouseEvent) {
  const v = view; if (!v || !canvas) return;
  const model = boardModel(v);
  const cell = cellAt(canvas, e, model.view);
  if (cell === null) return;
  if (ui.reconMode) { ui.reconTL = Math.max(0, Math.min(13, rowOf(cell) - 1)) * 16 + Math.max(0, Math.min(13, colOf(cell) - 1)); render(); return; }
  if (setupOpen(v)) {
    const hit = v.me.traps.find((t) => t.cell === cell);
    if (hit) await pickTrap(hit.id);
    else if (ui.selectedTrap !== null && model.allowedCells?.has(cell)) { const id = ui.selectedTrap; ui.selectedTrap = null; await send({ type: 'trapMove', trapId: id, to: cell }); }
    else if (ui.selectedTrap !== null) toast('그 칸에는 옮길 수 없어요 (오아시스·우리 출발 구역·우리 덫이 있는 칸).');
    render(); return;
  }
  if (canMove(v) && model.candidates?.includes(cell)) { ui.pick = cell; render(); }
}

async function pickTrap(id: number) {
  if (ui.selectedTrap === null) ui.selectedTrap = id;
  else if (ui.selectedTrap === id) ui.selectedTrap = null;
  else { const a = ui.selectedTrap; ui.selectedTrap = null; await send({ type: 'trapSwap', a, b: id }); }
  render();
}

// ── 그리기 ──────────────────────────────────────────────────
const PHASE_TEXT: Record<string, string> = { LOBBY: '선생님을 기다리는 중', DRAWN: '출발 구역이 정해졌어요', TRAP_SETUP: '덫 설치 시간', READY: '곧 시작해요', FINISHED: '게임 끝!', REVIEW: '문제 복습' };
const STEP_TEXT: Record<string, string> = { MOVE_OPEN: '이동할 칸 고르기', QUESTION_OPEN: '문제 풀이', ROUND_SUMMARY: '라운드 결과' };

function render() {
  const v = view; if (!v || !canvas) return;
  dirty = true;
  const me = v.teams[v.me.team];
  $('#banners').innerHTML = viewerBanner();
  $('#hud').innerHTML = `
    <div class="me" style="--c:${TEAM_COLORS[v.me.team]}"><span class="e" aria-hidden="true">${me.animal.emoji}</span><span>${esc(me.animal.name)}팀</span></div>
    <div class="score">${me.score}점 <span class="muted" style="font-size:.9rem">${v.phase === 'RUNNING' || v.phase === 'FINISHED' || v.phase === 'REVIEW' ? me.rank + '위' : ''}</span></div>
    <div class="clock"><span class="muted" style="font-size:.8rem">${v.round ? v.round + '라운드' : '게임 시간'}</span><b id="mainClock">${mmss(v.mainRemainingMs)}</b></div>`;
  const label = v.paused ? '⏸ 선생님이 잠시 멈췄어요' : v.phase === 'RUNNING' ? STEP_TEXT[v.step ?? ''] ?? '' : PHASE_TEXT[v.phase];
  const ph = $('#phase'); ph.className = 'phase' + (v.paused ? ' paused' : '');
  ph.innerHTML = `<span>${esc(label)}</span><span class="t" id="phaseClock"></span>`;
  const chips: string[] = [];
  if (me.status.boundLeft) chips.push(`<span class="chip bad">⛓️ 속박 ${me.status.boundLeft}라운드</span>`);
  if (me.status.confusedLeft) chips.push(`<span class="chip bad">🌫️ 혼란 ${me.status.confusedLeft}라운드</span>`);
  if (me.oasisRank) chips.push(`<span class="chip">🌴 오아시스 ${me.oasisRank}등</span>`);
  if (v.me.reconAvailable) chips.push('<span class="chip">🔭 정찰권 1회</span>');
  $('#chips').innerHTML = chips.join('');
  const zoomable = v.phase === 'RUNNING' || v.phase === 'TRAP_SETUP' || ui.reconMode;
  const zoomBtn = $('#zoom'); zoomBtn.hidden = !zoomable; if (!zoomable) ui.zoom = false;
  zoomBtn.textContent = ui.zoom ? '🗺 전체' : '🔍 확대';
  $('#pan').innerHTML = ui.zoom ? ['↑:-4:0', '↓:4:0', '←:0:-4', '→:0:4'].map((x) => { const [a, dr, dc] = x.split(':'); return `<button data-pan="${dr},${dc}" aria-label="확대 화면 옮기기 ${a}">${a}</button>`; }).join('') : '';
  $('#boardHint').textContent = ui.zoom ? '' : v.phase === 'TRAP_SETUP' ? '반짝이는 칸이 우리 덫' : v.phase === 'RUNNING' ? '빨간 숫자 = 주변 덫 수' : '';
  canvas.setAttribute('aria-label', `게임판. 우리 위치 ${myPos(v) === null ? '없음' : coord(myPos(v) as number)}`);
  $('#panel').innerHTML = panel(v);
  bindPanel(v);
  tickClock();
}

function sensorCard(v: TeamView) {
  const s = v.me.sensor;
  const cls = s === null ? 'hidden' : s === 0 ? 'zero' : '';
  return `<div class="card sensor"><div class="n ${cls}" aria-hidden="true">${s === null ? '?' : s}</div><div><b>주변 8칸의 덫 ${s === null ? '(숨겨짐)' : s + '개'}</b><div class="muted" style="font-size:.9rem">${s === null ? '혼란 덫 때문에 지금은 보이지 않아요' : '우리 팀 덫·다른 팀 덫·특수 덫을 모두 센 숫자예요'}</div></div></div>`;
}

const pts = (n: number) => `<span class="p ${n >= 0 ? 'plus' : 'minus'}">${n >= 0 ? '+' : '−'}${Math.abs(n)}</span>`;
function eventLine(e: PublicEvent): string | null {
  switch (e.type) {
    case 'safe': return `<li>🌱 처음 밟은 안전한 칸${pts(e.points)}</li>`;
    case 'zone': return `<li>🏁 다른 팀 출발 구역 도착${pts(e.points)}</li>`;
    case 'quiz': return `<li>${e.correct ? '🎉 정답! 덫을 모두 없앴어요' : e.timeout ? '⏰ 시간 초과(오답)' : '😵 오답 · 덫이 남았어요'}${pts(e.points)}</li>`;
    case 'effect': return `<li>${{ return: '🌀 귀환 덫! 출발 칸으로 돌아갔어요', bind: '⛓️ 속박 덫! 다음 2라운드 이동 불가', confuse: '🌫️ 혼란 덫! 다음 2라운드 센서가 숨겨져요' }[e.effect]}</li>`;
    case 'oasis': return `<li>🌴 오아시스 ${e.rank}등 도착! 정찰권을 얻었어요${pts(e.points)}</li>`;
    case 'stay': return `<li>${e.reason === 'bound' ? '⛓️ 속박되어 제자리' : '⏳ 이동을 정하지 않아 제자리'}</li>`;
    default: return null;
  }
}

const DIRS: [number, number, string, string][] = [[-1, -1, '↖', '왼쪽 위'], [-1, 0, '↑', '위'], [-1, 1, '↗', '오른쪽 위'], [0, -1, '←', '왼쪽'], [0, 0, '', ''], [0, 1, '→', '오른쪽'], [1, -1, '↙', '왼쪽 아래'], [1, 0, '↓', '아래'], [1, 1, '↘', '오른쪽 아래']];
function movePad(v: TeamView): string {
  const pos = myPos(v) as number;
  return `<div class="pad" role="group" aria-label="이동 방향">${DIRS.map(([dr, dc, a, label]) => {
    if (!dr && !dc) return `<div class="me" aria-hidden="true">${v.teams[v.me.team].animal.emoji}</div>`;
    const r = rowOf(pos) + dr, c = colOf(pos) + dc, ok = r >= 0 && r < 16 && c >= 0 && c < 16, cell = r * 16 + c;
    return `<button data-dir="${ok ? cell : ''}" aria-label="${label}으로" aria-pressed="${ui.pick === cell}" ${ok && canMove(v) ? '' : 'disabled'}>${a}</button>`;
  }).join('')}</div>`;
}

const disabledUnlessActive = (v: TeamView) => (canAct(v) ? '' : 'disabled');

/** 키보드·스크린리더용 칸 지정: 세로·가로 번호를 골라 '적용' (보드를 누르는 것과 같은 일) */
function cellPicker(id: string, label: string, max: number, preset: number | null, v: TeamView): string {
  const opts = (sel: number) => Array.from({ length: max }, (_, i) => `<option value="${i}" ${i === sel ? 'selected' : ''}>${i + 1}</option>`).join('');
  const r = preset === null ? 0 : rowOf(preset), c = preset === null ? 0 : colOf(preset);
  return `<div class="card" style="display:flex;flex-wrap:wrap;gap:8px;align-items:end"><span style="width:100%;font-weight:700">${label}</span>
    <label>세로 <select id="${id}R">${opts(r)}</select></label><label>가로 <select id="${id}C">${opts(c)}</select></label>
    <button class="btn ghost" id="${id}Go" style="padding:8px 14px" ${disabledUnlessActive(v)}>적용</button></div>`;
}

function panel(v: TeamView): string {
  const me = v.teams[v.me.team];
  if (v.phase === 'LOBBY') return `<div class="card"><h2>입장 완료!</h2><p class="muted" style="margin:0">선생님이 출발 구역을 추첨하면 시작해요.</p></div>`;
  if (v.phase === 'DRAWN') return `<div class="card"><h2>출발 구역이 정해졌어요</h2><p class="muted" style="margin:0">게임판에서 동그라미 친 우리 동물 자리를 확인하세요. 곧 덫 설치가 시작돼요.</p></div>`;
  if (v.phase === 'TRAP_SETUP') {
    if (me.status.setupConfirmed) return `<div class="card"><h2>✅ 설치 확정!</h2><p class="muted" style="margin:0">다른 팀이 끝나기를 기다리는 중이에요.</p></div>`;
    const count = (t: string) => v.me.traps.filter((x) => x.type === t).length;
    return `<div class="card"><h2>🪤 덫 13개가 자동으로 놓였어요</h2>
      <p class="muted" style="margin:0 0 10px">덫을 고르고(보드나 아래 목록) → 옮길 칸을 누르면 이동해요. 덫 두 개를 차례로 고르면 자리를 바꿔요. 칸이 작으면 🔍 확대를 쓰세요.<br>오아시스·우리 출발 구역에는 놓을 수 없고, 우리 덫도 우리에게 발동해요!</p>
      <div class="legend">${(['normal', 'return', 'bind', 'confuse'] as const).map((t) => `<span>${TRAP_ICON[t]} ${TRAP_NAME[t]} ${count(t)}개</span>`).join('')}</div></div>
      ${v.me.controller ? `<div class="trap-list" role="group" aria-label="우리 덫 목록">${v.me.traps.map((t) => `<button data-trap="${t.id}" aria-pressed="${ui.selectedTrap === t.id}" ${disabledUnlessActive(v)}>${TRAP_ICON[t.type]} ${coord(t.cell)}</button>`).join('')}</div>
      ${ui.selectedTrap !== null ? cellPicker('trapTo', '고른 덫을 옮길 칸 (키보드로 고르기)', 16, null, v) : ''}
      <button class="btn" id="confirm" ${disabledUnlessActive(v)}>설치 확정하기</button>` : ''}`;
  }
  if (v.phase === 'READY') return `<div class="card"><h2>모든 팀 설치 완료</h2><p class="muted" style="margin:0">선생님이 시작하면 첫 라운드가 열려요.</p></div>`;
  if (v.phase === 'RUNNING') {
    const recon = reconOpen(v) ? `<button class="btn ghost" id="recon" ${disabledUnlessActive(v)}>🔭 정찰권 쓰기 (3×3 덫 위치 보기)</button>` : '';
    if (v.step === 'MOVE_OPEN') {
      if (ui.reconMode) return reconPanel(v);
      if (me.status.boundLeft) return sensorCard(v) + `<div class="card"><h2>⛓️ 속박 중</h2><p class="muted" style="margin:0">이번 라운드는 제자리에 있어요.</p></div>` + recon;
      if (me.status.moved) return sensorCard(v) + `<div class="card"><h2>👣 이동 확정</h2><p class="muted" style="margin:0">다른 팀을 기다리는 중이에요.</p></div>` + recon;
      return sensorCard(v) + `<div class="card"><h2>어디로 갈까요?</h2><p class="muted" style="margin:0 0 10px">반짝이는 8칸 중 하나를 누르거나 아래 방향을 고른 뒤 <b>‘이 칸으로 이동하기’</b>를 눌러요. 시간 안에 안 누르면 제자리예요.</p>${v.me.controller ? movePad(v) : ''}</div>
        ${v.me.controller ? `<button class="btn" id="move" ${ui.pick === null || !canMove(v) ? 'disabled' : ''}>${ui.pick === null ? '칸을 먼저 고르세요' : '이 칸으로 이동하기 (' + coord(ui.pick) + ')'}</button>` : ''}${recon}`;
    }
    if (v.step === 'QUESTION_OPEN') {
      const q = v.me.question;
      if (!q) return sensorCard(v) + `<div class="card"><h2>다른 팀이 문제를 푸는 중</h2><p class="muted" style="margin:0">우리 팀은 이번 라운드에 문제가 없어요.</p></div>`;
      const a = v.me.answer;
      return `<div class="card quiz"><span class="lv ${esc(q.level)}">${esc(q.level)}</span><p class="q">${esc(q.text)}</p>
        <div class="choices" role="group" aria-label="보기">${q.choices.map((c, i) => {
          const cls = a && a.choice === i + 1 ? (a.correct ? 'right' : 'wrong') : '';
          return `<button data-choice="${i + 1}" class="${cls}" ${a || !canAct(v) ? 'disabled' : ''}><b>${i + 1}</b>${esc(c)}</button>`;
        }).join('')}</div>
        ${a ? `<p role="status" style="font-weight:800;margin:12px 0 0;color:${a.correct ? 'var(--ok)' : 'var(--danger)'}">${a.correct ? '정답이에요! 🎉' : '아쉬워요, 오답이에요.'}</p>` : ''}</div>`;
    }
    if (v.step === 'ROUND_SUMMARY') {
      if (ui.reconMode) return reconPanel(v);
      const mine = v.events.map((e) => ('team' in e && e.team === v.me.team ? eventLine(e) : null)).filter(Boolean);
      return `<div class="card"><h2>${v.round}라운드 결과</h2><ul class="events">${mine.length ? mine.join('') : '<li>이번 라운드는 점수 변화가 없어요</li>'}</ul></div>` + sensorCard(v) + recon;
    }
  }
  if (v.phase === 'FINISHED' || v.phase === 'REVIEW') {
    const order = [...v.teams].sort((a, b) => a.rank - b.rank || a.team - b.team);
    const winners = order.filter((t) => t.rank === 1), s = me.summary;
    return (ui.reconMode ? reconPanel(v) : '') + `<div class="card big-result"><span class="e" aria-hidden="true">${me.rank === 1 ? '🏆' : '🌿'}</span>${me.rank === 1 ? (winners.length > 1 ? '공동 우승!' : '우승!') : me.rank + '위'} · ${me.score}점
      ${s ? `<div class="stats" style="margin-top:12px"><div><b>${s.correct}</b>정답</div><div><b>${s.wrong}</b>오답</div><div><b>${s.zones}</b>상대 구역</div><div><b>${s.oasisRank ?? '–'}</b>오아시스 등수</div></div>` : ''}</div>
      <div class="card"><h2>최종 순위</h2><ol class="rank">${order.map((t) => `<li class="${t.team === v.me.team ? 'mine' : ''}" style="--c:${TEAM_COLORS[t.team]}"><span>${t.rank}위</span><span aria-hidden="true">${t.animal.emoji}</span><span>${esc(t.animal.name)}${t.team === v.me.team ? ' (우리)' : ''}</span><span>${t.score}점</span></li>`).join('')}</ol></div>
      ${reconOpen(v) && !ui.reconMode ? `<button class="btn ghost" id="recon">🔭 남은 정찰권 쓰기</button>` : ''}
      ${v.trapMap ? '<div class="card"><h2>🗺 전체 덫 지도 공개</h2><p class="muted" style="margin:0">게임판에 모든 팀의 덫이 팀 색 점으로 표시됐어요(흐린 점은 없어진 덫).</p></div>' : ''}
      ${v.reviewQuestions.length ? `<div class="card"><h2>📖 복습 문제</h2>${v.reviewQuestions.map((q) => `<details class="review"><summary>${esc(q.text)}</summary><ol>${q.choices.map((c, i) => `<li style="${i + 1 === q.answer ? 'color:var(--ok);font-weight:800' : ''}">${esc(c)}${i + 1 === q.answer ? ' ✔ 정답' : ''}</li>`).join('')}</ol>${q.explanation ? `<p class="muted">${esc(q.explanation)}</p>` : ''}</details>`).join('')}</div>` : ''}`;
  }
  return '';
}

function reconPanel(v: TeamView) {
  return `<div class="card"><h2>🔭 정찰할 3×3 구역 고르기</h2><p class="muted" style="margin:0">게임판을 누르면 그 칸을 가운데로 3×3 구역이 잡혀요. 확정하면 되돌릴 수 없어요.${ui.reconTL !== null ? '<br>고른 구역: ' + coord(ui.reconTL) + '부터 3×3' : ''}</p></div>
    ${cellPicker('reconAt', '구역의 왼쪽 위 칸 (키보드로 고르기, 최대 14)', 14, ui.reconTL, v)}
    <button class="btn" id="reconGo" ${ui.reconTL === null || !canAct(v) ? 'disabled' : ''}>이 구역 정찰하기</button><button class="btn ghost" id="reconCancel">취소</button>`;
}

function bindPanel(v: TeamView) {
  const on = (id: string, fn: () => void) => { const el = document.getElementById(id); if (el) el.onclick = fn; };
  on('confirm', async () => {
    if (!confirm('설치를 확정할까요? 확정하면 더 옮길 수 없어요.')) return;
    if (!view || !setupOpen(view)) return toast('지금은 확정할 수 없어요.'); // 대화상자가 열린 사이 바뀌었을 수 있다
    await send({ type: 'trapConfirm' });
  });
  on('move', async () => { if (ui.pick === null || !view || !canMove(view)) return; const to = ui.pick; if (await send({ type: 'move', round: view.round, to })) ui.pick = null; render(); });
  on('recon', () => { ui.reconMode = true; ui.reconTL = null; render(); });
  on('reconCancel', () => { ui.reconMode = false; render(); });
  on('reconGo', async () => { if (ui.reconTL === null || !view || !reconOpen(view)) return; if (await send({ type: 'recon', topLeft: ui.reconTL })) { ui.reconMode = false; toast('정찰 완료! 게임판에 상대 덫 위치가 표시돼요.'); } render(); });
  document.querySelectorAll<HTMLButtonElement>('[data-choice]').forEach((b) => (b.onclick = async () => {
    if (!view || !canAct(view)) return;
    await send({ type: 'answer', round: view.round, choice: Number(b.dataset.choice) }); // 결과는 서버 푸시로 다시 그린다
  }));
  const picked = (id: string) => Number((document.getElementById(id + 'R') as HTMLSelectElement).value) * 16 + Number((document.getElementById(id + 'C') as HTMLSelectElement).value);
  on('trapToGo', async () => {
    if (!view || !setupOpen(view) || ui.selectedTrap === null) return;
    const to = picked('trapTo');
    if (!allowedTrapCells(view).has(to)) return toast('그 칸에는 옮길 수 없어요 (오아시스·우리 출발 구역·우리 덫이 있는 칸).');
    const id = ui.selectedTrap; ui.selectedTrap = null;
    await send({ type: 'trapMove', trapId: id, to }); render();
  });
  on('reconAtGo', () => { ui.reconTL = picked('reconAt'); render(); });
  document.querySelectorAll<HTMLButtonElement>('[data-dir]').forEach((b) => (b.onclick = () => { if (b.dataset.dir) { ui.pick = Number(b.dataset.dir); render(); } }));
  document.querySelectorAll<HTMLButtonElement>('[data-trap]').forEach((b) => (b.onclick = () => void pickTrap(Number(b.dataset.trap))));
  document.querySelectorAll<HTMLButtonElement>('[data-pan]').forEach((b) => (b.onclick = () => {
    const [dr, dc] = (b.dataset.pan as string).split(',').map(Number);
    const w = zoomWindow(v); if (!w) return;
    const r = Math.max(0, Math.min(15, w.r0 + ZOOM_N / 2 - 1 + dr)), c = Math.max(0, Math.min(15, w.c0 + ZOOM_N / 2 - 1 + dc));
    ui.focus = r * 16 + c; render();
  }));
}

// ── 시작 ────────────────────────────────────────────────────
const h0 = parseHash();
const stored = h0.code ? load(h0.code) : null;
if (stored) start(stored); else renderEntry();
window.addEventListener('hashchange', () => { const h = parseHash(); const s = h.code ? load(h.code) : null; if (s) start(s); else renderEntry(); });
