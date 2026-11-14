/**
 * tv/main.ts — 교실 TV 공용 화면 (DESIGN §8). 읽기 전용: 서버는 TV 열쇠로 어떤 쓰기 명령도 받지 않는다.
 *
 * TV 열쇠는 주소의 #해시(/tv#CODE.KEY)로만 받는다 — 해시는 서버로 전송되지 않는다(암호화는 아님).
 * 읽는 즉시 history.replaceState 로 주소창에서 지우고, 새로고침에 대비해 이 탭(sessionStorage)에만 둔다.
 * 게임 중에는 덫 위치가 없다(tvView 에 아예 실리지 않는다). 종료 후 교사가 공개하면 덫 지도가 온다.
 */
import type { PublicEvent, TvView } from '../../game/views.ts';
import { draw, TEAM_COLORS, type BoardModel } from '../shared/board.ts';
import { Countdown, live, mmss } from '../shared/net.ts';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const esc = (v: unknown) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
const app = $('#app');
const SS = 'animal-trap-tv';

function readKey(): { code: string; key: string } | null {
  const m = location.hash.slice(1).match(/^([A-HJ-NP-Z2-9]{6})\.([A-Z2-9]{20,40})$/);
  if (m) {
    history.replaceState(null, '', location.pathname); // 주소창·방문 기록에서 열쇠 제거
    try { sessionStorage.setItem(SS, JSON.stringify({ code: m[1], key: m[2] })); } catch { /* */ }
    return { code: m[1], key: m[2] };
  }
  try { const v = JSON.parse(sessionStorage.getItem(SS) ?? 'null'); if (v && /^[A-HJ-NP-Z2-9]{6}$/.test(v.code) && /^[A-Z2-9]{20,40}$/.test(v.key)) return v; } catch { /* */ }
  return null;
}

let view: TvView | null = null;
let clock: Countdown | null = null;
let lastEventsKey = '';
let idleText = '';
let stopAll: () => void = () => {};

function waitScreen(msg: string) {
  app.style.display = 'block';
  app.innerHTML = `<div class="wait"><div><div style="font-size:4rem">📺</div><h1>애니멀 트랩 TV</h1><p class="muted">${esc(msg)}</p></div></div>`;
}

// ── 배경 음악: 브라우저 자동재생 제한 때문에 버튼을 눌러야 시작 ────────────
const bgm = new Audio('/audio/bgm.mp3'); bgm.loop = true; bgm.volume = 0.35;
function toggleBgm() { if (bgm.paused) void bgm.play().catch(() => {}); else bgm.pause(); renderTools(); }

function renderTools() {
  const t = document.getElementById('tools'); if (!t) return;
  t.innerHTML = `<button id="music" aria-pressed="${!bgm.paused}">${bgm.paused ? '🔈 음악 켜기' : '🔊 음악 끄기'}</button>
    <input id="vol" type="range" min="0" max="1" step="0.05" value="${bgm.volume}" aria-label="음악 크기">
    <button id="fs">${document.fullscreenElement ? '↙ 전체화면 끝' : '⛶ 전체화면'}</button>`;
  (document.getElementById('music') as HTMLButtonElement).onclick = toggleBgm;
  (document.getElementById('vol') as HTMLInputElement).oninput = (e) => { bgm.volume = Number((e.target as HTMLInputElement).value); };
  (document.getElementById('fs') as HTMLButtonElement).onclick = () => { if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen().catch(() => {}); };
}
document.addEventListener('fullscreenchange', renderTools);

function shell() {
  app.style.display = '';
  app.innerHTML = `
    <div class="stage"><canvas class="board" id="board" role="img" aria-label="공용 게임판"></canvas><div id="overlay"></div></div>
    <aside class="side">
      <div class="title"><h1 id="title"></h1><span class="code" id="code"></span></div>
      <div class="clocks"><div class="card"><div class="lbl">남은 게임 시간</div><b id="mainClock">--:--</b></div><div class="card step" id="stepBox"><div class="lbl" id="stepLabel"></div><b id="phaseClock"></b></div></div>
      <div style="display:grid;gap:1.2vh;min-height:0;grid-template-rows:auto 1fr"><ol class="board-list" id="scores"></ol><ul class="feed" id="feed"></ul></div>
      <div class="tools" id="tools"></div>
    </aside>`;
  renderTools();
}

const STEP: Record<string, string> = { MOVE_OPEN: '이동 고르는 중', QUESTION_OPEN: '문제 풀이', ROUND_SUMMARY: '라운드 결과' };
const PHASE: Record<string, string> = { LOBBY: '입장 대기', DRAWN: '출발 구역 추첨', TRAP_SETUP: '덫 설치 중', READY: '곧 시작', FINISHED: '게임 끝', REVIEW: '문제 복습' };

function eventText(v: TvView, e: PublicEvent): string | null {
  const a = (t: number) => `${v.teams[t].animal.emoji} ${esc(v.teams[t].animal.name)}`;
  const p = (n: number) => `<span style="color:${n >= 0 ? 'var(--ok)' : 'var(--danger)'}">${n >= 0 ? '+' : '−'}${Math.abs(n)}</span>`;
  switch (e.type) {
    case 'quiz': return `<li><span>${a(e.team)} ${e.correct ? '🎉 정답! 덫 제거' : e.timeout ? '⏰ 시간 초과' : '😵 오답'}</span>${p(e.points)}</li>`;
    case 'oasis': return `<li><span>${a(e.team)} 🌴 오아시스 ${e.rank}등!</span>${p(e.points)}</li>`;
    case 'zone': return `<li><span>${a(e.team)} 🏁 상대 출발 구역</span>${p(e.points)}</li>`;
    case 'effect': return `<li><span>${a(e.team)} ${{ return: '🌀 귀환!', bind: '⛓️ 속박!', confuse: '🌫️ 혼란!' }[e.effect]}</span><span></span></li>`;
    default: return null;
  }
}

function render() {
  const v = view; if (!v) return;
  if (!document.getElementById('board')) shell();
  $('#title').textContent = v.title;
  $('#code').textContent = v.code;
  const box = $('#stepBox'); box.className = 'card step' + (v.paused ? ' paused' : '');
  $('#stepLabel').textContent = v.paused ? '⏸ 잠시 멈춤' : v.phase === 'RUNNING' ? `${v.round}라운드 · ${STEP[v.step ?? '']}` : PHASE[v.phase];
  // 단계 시계가 없을 때 초록 칸이 비지 않게 — 큰 글씨로 지금 상황
  const joined = v.teams.filter((t) => t.status.joined).length;
  idleText = v.paused ? '⏸' : v.phase === 'LOBBY' ? `${joined}/8 입장` : v.phase === 'DRAWN' ? '추첨 완료' : v.phase === 'READY' ? '곧 시작' : v.phase === 'RUNNING' && v.step === 'ROUND_SUMMARY' ? '결과 발표' : v.phase === 'FINISHED' ? '🏁' : v.phase === 'REVIEW' ? '📖' : '';
  const order = [...v.teams].sort((a, b) => a.rank - b.rank || a.team - b.team);
  const status = (t: TvView['teams'][number]) => {
    if (v.phase === 'TRAP_SETUP') return t.status.setupConfirmed ? '설치 확정' : '설치 중';
    if (v.phase === 'LOBBY' || v.phase === 'DRAWN') return t.status.joined ? '✔ 입장' : '대기';
    if (v.phase !== 'RUNNING') return t.oasisRank ? `🌴 ${t.oasisRank}등` : '';
    const s: string[] = [];
    if (v.step === 'MOVE_OPEN') s.push(t.status.boundLeft ? '⛓️ 속박' : t.status.moved ? '✔ 이동' : '…');
    if (v.step === 'QUESTION_OPEN' && t.status.quiz !== 'none') s.push(t.status.quiz === 'pending' ? '❓ 문제 중' : '✔ 답함');
    if (t.status.confusedLeft) s.push('🌫️');
    if (t.oasisRank) s.push(`🌴${t.oasisRank}`);
    return s.join(' ');
  };
  $('#scores').innerHTML = order.map((t) => `<li style="--c:${TEAM_COLORS[t.team]}"><span class="rk">${t.rank}</span><span class="an" aria-hidden="true">${t.animal.emoji}</span><span>${esc(t.animal.name)}</span><span class="st">${status(t)}</span><span class="sc">${t.score}</span></li>`).join('');
  // 라운드 사건(결과 단계에서만, 새 라운드일 때만 다시 그려 애니메이션)
  const key = `${v.round}:${v.step}:${v.events.length}`;
  if (key !== lastEventsKey) {
    lastEventsKey = key;
    $('#feed').innerHTML = v.phase === 'RUNNING' && v.step === 'ROUND_SUMMARY' ? v.events.map((e) => eventText(v, e)).filter(Boolean).slice(0, 6).join('') : '';
  }
  $('#overlay').innerHTML = overlay(v);
  tickClock();
}

function overlay(v: TvView): string {
  if (v.phase === 'LOBBY') return `<div class="overlay"><div class="box"><h2>🌴 애니멀 트랩</h2><p style="font-size:3vh;margin:0 0 2.4vh">팀 카드 QR을 찍거나, 이 주소에서 판 코드·PIN을 넣어요</p>
    <div class="join"><div><div class="muted">학생 주소</div><b>${esc(location.host)}</b></div><div><div class="muted">판 코드</div><b class="codebig">${esc(v.code)}</b></div></div></div></div>`;
  // 종료 후에는 교사가 고른 것(순위 / 덫 지도 / 문항 하나)만 띄운다
  const d = v.reviewDisplay;
  const focusQ = d.mode === 'question' ? v.reviewQuestions.find((x) => x.id === d.questionId) : undefined;
  if (focusQ) {
    const q = focusQ;
    return `<div class="overlay"><div class="box"><div class="muted" style="font-size:2.4vh">📖 복습 · ${esc(q.level)}</div><h2 style="font-size:4vh">${esc(q.text)}</h2>
      <ol>${q.choices.map((c, i) => `<li class="${i + 1 === q.answer ? 'ans' : ''}">${esc(c)}${i + 1 === q.answer ? ' ✔' : ''}</li>`).join('')}</ol>${q.explanation ? `<p class="muted" style="font-size:2.4vh">${esc(q.explanation)}</p>` : ''}</div></div>`;
  }
  if (v.phase === 'FINISHED' || v.phase === 'REVIEW') {
    if (d.mode === 'map' && v.trapMap) return '';
    const winners = v.teams.filter((t) => t.rank === 1);
    const order = [...v.teams].sort((a, b) => a.rank - b.rank || a.team - b.team);
    return `<div class="overlay"><div class="box"><div class="big" aria-hidden="true">🏆 ${winners.map((w) => w.animal.emoji).join(' ')}</div><h2>${winners.length > 1 ? '공동 우승!' : '우승!'} ${winners.map((w) => esc(w.animal.name)).join(' · ')}</h2>
      <p style="font-size:2.6vh;margin:0 0 1.6vh">${winners[0]?.score ?? 0}점 · ${v.endReason === 'manual' ? '선생님이 게임을 마쳤어요' : '시간 종료'}</p>
      <table class="summary"><thead><tr><th>순위</th><th>팀</th><th>정답</th><th>오답</th><th>상대 구역</th><th>🌴</th><th>점수</th></tr></thead><tbody>${order.map((t) => `<tr><td>${t.rank}</td><td>${t.animal.emoji} ${esc(t.animal.name)}</td><td>${t.summary?.correct ?? 0}</td><td>${t.summary?.wrong ?? 0}</td><td>${t.summary?.zones ?? 0}</td><td>${t.summary?.oasisRank ?? '–'}</td><td><b>${t.score}</b></td></tr>`).join('')}</tbody></table></div></div>`;
  }
  return '';
}

function tickClock() {
  if (!clock) return;
  const m = document.getElementById('mainClock'); if (m) m.textContent = mmss(clock.mainLeft());
  const p = document.getElementById('phaseClock'); const l = clock.phaseLeft();
  if (p) { p.textContent = l === null ? idleText : mmss(l); p.classList.toggle('idle', l === null); }
}

function boardModel(v: TvView): BoardModel {
  // 이번 라운드에 움직인 동물은 반짝임으로 강조
  const moved = new Set(v.phase === 'RUNNING' && v.step !== 'MOVE_OPEN' ? v.events.filter((e) => e.type === 'move').map((e) => (e as { team: number }).team) : []);
  return { animals: v.teams.map((t) => ({ team: t.team, emoji: t.animal.emoji, pos: t.pos, highlight: moved.has(t.team) })), zones: v.teams.map((t) => t.zone), trapMap: v.trapMap };
}

// ── 시작 ────────────────────────────────────────────────────
const cred = readKey();
if (!cred) waitScreen('교사 화면의 ‘TV 화면 열기’로 열어 주세요.');
else {
  waitScreen('연결 중…');
  live<TvView>({
    code: cred.code,
    hello: () => ({ role: 'tv', key: cred.key }),
    onState: (v) => { view = v; clock = Countdown.of(v); render(); },
    onStatus: (up) => { $('#banners').innerHTML = up ? '' : '<div class="banner off">연결이 끊겼어요. 다시 연결하는 중…</div>'; },
    onClosedForGood: (code) => { if (code === 4003) { waitScreen('같은 판의 TV 화면이 너무 많이 열려 이 화면의 연결을 끊었어요. 새로 고치면 다시 연결돼요.'); return; } stopAll(); try { sessionStorage.removeItem(SS); } catch { /* */ } view = null; waitScreen('TV 열쇠가 바뀌었어요. 교사 화면에서 ‘TV 화면 열기’를 다시 눌러 주세요.'); }
  });
  const timer = window.setInterval(tickClock, 250);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  let last = 0, raf = 0;
  const loop = (t: number) => { const c = document.getElementById('board') as HTMLCanvasElement | null; if (c && view && (!reduce.matches ? t - last > 80 : t - last > 1000)) { draw(c, boardModel(view), t); last = t; } raf = requestAnimationFrame(loop); };
  raf = requestAnimationFrame(loop);
  // 열쇠가 무효가 되면 음악·시계·그리기를 모두 멈춘다
  stopAll = () => { bgm.pause(); clearInterval(timer); cancelAnimationFrame(raf); };
}
