// ===== GAME CORE =====
// State, turn management, movement, landing handlers, quiz flow, keys.

const START_COINS = 30;
const RESERVE_FEE = 5;          // paid into pool when pool is empty
const START_PASS_BONUS = 5;
const START_LAND_BONUS = 7;
const QUIZ_TIME_SEC = 10;
const JAIL_ESCAPE_COST = 3;
// 레벨별 건설/업그레이드 기본 비용 (추가로 지역 세금이 붙음)
// 성공: 지역세금 + 기본비용
// 실패: 지역세금×2 + 기본비용
// 모든 레벨(Lv.1 신규 / Lv.2 / Lv.3 업그레이드)에 퀴즈 존재
const BUILD_LV_COST = { 1: 3, 2: 4, 3: 5 };
const TOLL_BASE = 2;                    // 관람비 기본 = (세금 + 2) × 레벨배수
const TOLL_FAIL_EXTRA = 3;              // 실패 시 관람비에 +3 flat
// 관람비 배수: Lv.1 x1, Lv.2 x2, Lv.3 x3
const TOLL_MULT = { 1: 1, 2: 2, 3: 3 };

// TILES, PLAYER_COLORS, PLAYER_AVATARS are global consts from render.js — do not redeclare.

const GOLDEN_KEYS = [
  { text:'생물 구조에 성공했습니다! 상금 +2 코인',  effect:'coins',       value:2 },
  { text:'생물 구조에 성공했습니다! 상금 +4 코인',  effect:'coins',       value:4 },
  { text:'생물 구조에 성공했습니다! 상금 +6 코인',  effect:'coins',       value:6 },
  { text:'생물 구조에 성공했습니다! 상금 +8 코인',  effect:'coins',       value:8 },
  { text:'생물 구조에 실패했습니다... 벌금 -2 코인', effect:'coins',       value:-2 },
  { text:'생물 구조에 실패했습니다... 벌금 -4 코인', effect:'coins',       value:-4 },
  { text:'원하는 곳으로 이동할 수 있습니다!',        effect:'teleport',   value:0 },
  { text:'상대 팀의 동물원 하나를 가로챌 수 있습니다!', effect:'steal',     value:0 },
  { text:'상대 팀과 우리 팀의 동물원을 교체합니다!',   effect:'swap',      value:0 },
  { text:'상대 팀 동물원 하나를 폐쇄합니다!',          effect:'close',     value:0 },
  { text:'원하는 곳에 동물원을 무상 설립!',            effect:'free_zoo',  value:0 },
  { text:'다음 턴에 주사위를 두 번 던집니다!',         effect:'double_turn', value:0 },
  { text:'다른 팀 하나를 감옥으로 보냅니다!',          effect:'jail_opponent', value:0 },
  { text:'다른 팀과 코인을 교환합니다!',               effect:'swap_coins', value:0 },
];

let state = {
  players: [], current: 0, phase: 'roll',
  diceResult: 0, doubleTurnNext: [],
  zoos: {}, jailTurns: {},
  reservePool: 0,
  currentQuiz: null, quizContext: null,
  quizTimerHandle: null,
};
window.gameState = state;

// ===== SETUP =====
function updatePlayerInputs() {
  const n = +document.getElementById('player-count').value;
  const div = document.getElementById('player-inputs');
  div.innerHTML = '';
  for (let i = 0; i < n; i++) {
    div.innerHTML +=
      `<div class="player-name-row">
         <div class="color-dot" style="background:${PLAYER_COLORS[i]}">${PLAYER_AVATARS[i]}</div>
         <input id="pname-${i}" placeholder="${i+1}모둠" value="${i+1}모둠">
       </div>`;
  }
}

async function startGame() {
  const n = +document.getElementById('player-count').value;
  state = {
    players: [], current: 0, phase: 'roll',
    diceResult: 0, doubleTurnNext: [],
    zoos: {}, jailTurns: {},
    reservePool: 0,
    currentQuiz: null, quizContext: null,
    quizTimerHandle: null,
  };
  window.gameState = state;

  for (let i = 0; i < n; i++) {
    state.players.push({
      name: document.getElementById(`pname-${i}`).value || `${i+1}모둠`,
      color: PLAYER_COLORS[i],
      coins: START_COINS,
      position: 0,
      bankrupt: false,
    });
  }

  // Initialize new quiz cycle for this game
  QuizPool.newGame();

  document.getElementById('setup-screen').style.display = 'none';
  document.getElementById('game-screen').style.display = 'block';

  Render.renderBoard(state);
  wireGameControls();

  // First user gesture reached game start click => BGM starts
  AudioMgr.startBgm();

  // Lock dice roll button until user reads the rules
  state.phase = 'rules';
  Render.updateTurnInfo(state);
  showRulesModal(() => checkJailOnTurn());
}

function showRulesModal(onConfirm) {
  const html = `
    <div class="rules-card">
      <div class="rules-section">
        <div class="rules-section-title">🎮 기본</div>
        <ul>
          <li>주사위 2개를 굴려 합산만큼 이동 (2~12칸)</li>
          <li>시작 코인 <b style="color:#ffd700">30개</b></li>
          <li>⚡ <b>더블</b>(같은 숫자)이 나오면 <b>한 번 더</b> 굴립니다</li>
          <li>코인이 0이 되면 파산, 마지막 1팀이 우승!</li>
        </ul>
      </div>

      <div class="rules-section">
        <div class="rules-section-title">🏁 특수 칸</div>
        <ul>
          <li>🏁 <b>START</b>: 통과 <b style="color:#ffd700">+5</b> / 도착 <b style="color:#ffd700">+7</b> 코인</li>
          <li>🏕️ <b>생물보호구역</b>: 비었으면 5코인 납부, 찼으면 누적 전액 획득</li>
          <li>⛓️ <b>감옥</b>: 2턴 정지 / 3코인 납부 / 주사위 <b>더블</b>로 탈출</li>
          <li>✈️ <b>세계동물여행</b>: 원하는 동물 칸으로 즉시 이동</li>
          <li>🔑 <b>생물구조열쇠</b>: 랜덤 카드 (상금/벌금/이동/강탈 등)</li>
        </ul>
      </div>

      <div class="rules-section">
        <div class="rules-section-title">🐾 동물 칸 (퀴즈 & 건설/업그레이드)</div>
        <ul>
          <li>[시작] 버튼 → <b>3-2-1</b> → <b>10초</b> 문제 풀이</li>
          <li>건설비 = <b>지역세금 + 레벨비용</b> · 실패 시 <b>지역세금만 2배</b></li>
          <li>🎡 <b>Lv.1 건설</b>: 레벨비용 <b>3</b> (예: 초원 성공 4 / 실패 5)</li>
          <li>🎢 <b>Lv.2 업그레이드</b>: 레벨비용 <b>4</b> (자기 동물원 재방문)</li>
          <li>🏰 <b>Lv.3 업그레이드</b>: 레벨비용 <b>5</b> (무적)</li>
          <li>모든 레벨 업그레이드 시 퀴즈 필수</li>
        </ul>
      </div>

      <div class="rules-section">
        <div class="rules-section-title">🏛️ 상대 동물원 방문</div>
        <ul>
          <li>관람비 = <b>(세금 + 2) × Lv배수</b> (Lv.1 ×1 / Lv.2 ×2 / Lv.3 ×3)</li>
          <li>퀴즈 실패 시 관람비에 <b>+3코인</b> 추가</li>
          <li>퀴즈 성공 + <b>Lv.1 동물원</b>일 때만 <b>2배 지불로 인수</b> 가능</li>
          <li>Lv.2 이상은 인수 불가 (관람비만 지불)</li>
          <li>인수해도 레벨은 Lv.1 유지 (업그레이드 X)</li>
        </ul>
      </div>

      <div class="rules-hint">진행자(선생님)가 성공/실패를 판정합니다.</div>
    </div>`;
  showModal('📜', '게임 규칙', html, [
    { text: '🎮 시작하기', class: 'btn-success', action() {
        closeModal();
        onConfirm();
    }}
  ]);
}

function wireGameControls() {
  const btn = document.getElementById('btn-roll');
  if (btn) btn.onclick = rollDice;
}

// ===== DICE =====
async function rollDice() {
  if (state.phase !== 'roll') return;
  state.phase = 'rolling';
  document.getElementById('btn-roll').disabled = true;

  AudioMgr.playSfx('dice');

  const r1 = Math.floor(Math.random() * 6) + 1;
  const r2 = Math.floor(Math.random() * 6) + 1;
  const total = r1 + r2;
  const isDouble = r1 === r2;
  state.diceResult = total;

  await Render.animateDiceRoll(r1, r2);

  if (isDouble) {
    // Queue an extra roll for the same player (nextTurn consumes from doubleTurnNext)
    state.doubleTurnNext.push(state.current);
    showDoubleEffect();
    setTimeout(() => movePlayer(total), 1300);
  } else {
    setTimeout(() => movePlayer(total), 350);
  }
}

// Celebratory overlay shown briefly when doubles are rolled
function showDoubleEffect(title = '⚡ 더블! ⚡', subtitle = '한 번 더 굴릴 수 있어요!') {
  const old = document.getElementById('double-effect');
  if (old) old.remove();
  const overlay = document.createElement('div');
  overlay.id = 'double-effect';
  overlay.innerHTML =
    `<div class="double-text">${title}<span>${subtitle}</span></div>`;
  document.body.appendChild(overlay);
  AudioMgr.playSfx('goldenKey');
  setTimeout(() => overlay.remove(), 1400);
}

// ===== MOVEMENT =====
function movePlayer(steps) {
  state.phase = 'moving';
  const p = state.players[state.current];
  let moved = 0;
  console.log('[bio] movePlayer start', { player: p.name, steps, from: p.position });
  const iv = setInterval(() => {
    try {
      moved++;
      p.position = (p.position + 1) % 28;
      if (p.position === 0 && moved < steps) {
        p.coins += START_PASS_BONUS;
        AudioMgr.playSfx('coin');
        Render.renderPlayers(state);
      }
      Render.renderTokens(state);
      Render.hopToken(state.current);
      Render.highlightTile(p.position);
      Render.updateTurnInfo(state);
      if (moved >= steps) {
        clearInterval(iv);
        console.log('[bio] movePlayer done, landing at', p.position, TILES[p.position]?.name);
        setTimeout(() => {
          try { handleLanding(); }
          catch (e) { console.error('[bio] handleLanding error:', e); }
        }, 350);
      }
    } catch (e) {
      console.error('[bio] movePlayer step error:', e);
      clearInterval(iv);
    }
  }, 220);
}

// ===== LANDING =====
function handleLanding() {
  const p = state.players[state.current];
  const tile = TILES[p.position];
  console.log('[bio] handleLanding', { player: p.name, pos: p.position, tile });
  if (!tile) {
    console.error('[bio] No tile at position', p.position);
    showNextTurn();
    return;
  }
  Render.highlightTile(p.position);

  switch (tile.type) {
    case 'start':
      p.coins += START_LAND_BONUS;
      AudioMgr.playSfx('coin');
      Render.renderPlayers(state);
      Render.updateTurnInfo(state);
      showNextTurn();
      break;
    case 'key': drawGoldenKey(); break;
    case 'animal': handleAnimal(tile); break;
    case 'jail': handleJail(); break;
    case 'reserve':
      handleReserve();
      break;
    case 'travel': handleTravel(); break;
    default:
      console.warn('[bio] Unknown tile type:', tile.type);
      showNextTurn();
  }
}

function handleAnimal(tile) {
  const zoo = state.zoos[tile.id];
  if (zoo && zoo.owner === state.current) handleOwnZoo(tile, zoo);
  else if (zoo) handleOpponentZoo(tile, zoo);
  else askStartQuiz(tile, 'build');
}

// ===== 생물보호구역 (누적 시스템) =====
// Pool empty  → player pays RESERVE_FEE (5) into pool
// Pool filled → player claims pool total, pool resets to 0
function handleReserve() {
  const p = state.players[state.current];
  if (state.reservePool > 0) {
    const claim = state.reservePool;
    p.coins += claim;
    state.reservePool = 0;
    AudioMgr.playSfx('coin');
    Render.renderPlayers(state);
    Render.updateTurnInfo(state);
    Render.renderReservePool(state);
    showModal('🏕️', '생물 보호 구역',
      `<p style="text-align:center">누적된 보호 기금을</p>
       <p style="text-align:center;font-size:1.8em;color:#ffd700;font-weight:bold">+${claim} 코인 획득!</p>
       <p style="text-align:center;color:#888;font-size:0.9em">누적 기금이 초기화됩니다.</p>`,
      [{ text:'확인', class:'btn-close-modal', action(){ closeModal(); showNextTurn(); } }]);
  } else {
    const fee = Math.min(RESERVE_FEE, p.coins);
    p.coins -= fee;
    state.reservePool += fee;
    AudioMgr.playSfx('coin');
    if (p.coins <= 0) checkBankrupt(state.current);
    Render.renderPlayers(state);
    Render.updateTurnInfo(state);
    Render.renderReservePool(state);
    showModal('🏕️', '생물 보호 구역',
      `<p style="text-align:center">생물 보호 기금 납부</p>
       <p style="text-align:center;font-size:1.6em;color:#ef5350;font-weight:bold">-${fee} 코인</p>
       <p style="text-align:center;color:#888;font-size:0.9em">누적 기금: ${state.reservePool}코인<br>다음 도착자가 전액 수령합니다.</p>`,
      [{ text:'확인', class:'btn-close-modal', action(){ closeModal(); showNextTurn(); } }]);
  }
}

// ===== QUIZ FLOW =====
// Stage 1: [시작] button in center action box
function askStartQuiz(tile, purpose) {
  const quiz = QuizPool.draw();
  console.log('[bio] askStartQuiz', { tile: tile.name, purpose, quizId: quiz?.id });
  if (!quiz) {
    // No questions available
    showModal('⚠️', '문제가 없습니다',
      '<p style="text-align:center">관리자 페이지에서 문제를 먼저 등록해주세요.</p>',
      [{ text:'다음 턴', class:'btn-close-modal', action(){ closeModal(); showNextTurn(); } }]);
    return;
  }
  state.currentQuiz = quiz;
  state.quizContext = { tile, purpose };
  state.phase = 'quiz-ready';

  showAction([{
    text: `▶️ ${tile.name} 문제 시작`,
    class: 'action-btn btn-start-quiz',
    action: beginQuizCountdown,
  }]);
}

// Stage 2: 3-2-1 countdown
function beginQuizCountdown() {
  state.phase = 'quiz-countdown';
  Render.showCountdown(() => launchQuiz());
}

// Stage 3: full-screen quiz with 10s timer
function launchQuiz() {
  state.phase = 'quiz-active';
  const quiz = state.currentQuiz;
  const { tile } = state.quizContext;
  const p = state.players[state.current];

  const overlay = document.getElementById('quiz-overlay');
  overlay.innerHTML = `
    <div class="quiz-header">
      <div class="quiz-player">
        <div class="p-avatar" style="border-color:${p.color}">${PLAYER_AVATARS[state.current]}</div>
        <div class="quiz-player-name" style="color:${p.color}">${p.name}</div>
      </div>
      <div class="quiz-tile-name">${tile.emoji} ${tile.name}</div>
    </div>
    <div class="quiz-question-box">${escapeHtml(quiz.q).replace(/\n/g,'<br>')}</div>
    <div class="quiz-timer-big" id="quiz-timer">${QUIZ_TIME_SEC}</div>
    <div id="quiz-action-area"></div>
  `;
  overlay.classList.add('show');

  AudioMgr.startQuizAmbience();

  let timeLeft = QUIZ_TIME_SEC;
  const timerEl = document.getElementById('quiz-timer');
  let tickStarted = false;
  state.quizTimerHandle = setInterval(() => {
    timeLeft--;
    timerEl.textContent = timeLeft;
    if (timeLeft <= 3 && !tickStarted) {
      tickStarted = true;
      timerEl.classList.add('urgent');
      AudioMgr.startTimerTick();
    }
    if (timeLeft <= 0) {
      clearInterval(state.quizTimerHandle);
      state.quizTimerHandle = null;
      AudioMgr.stopTimerTick();
      AudioMgr.stopQuizAmbience();
      showRevealButton();
    }
  }, 1000);
}

// Stage 4: "정답 공개" button (manual)
function showRevealButton() {
  state.phase = 'quiz-reveal';
  const area = document.getElementById('quiz-action-area');
  if (!area) return;
  area.innerHTML = `
    <div class="quiz-buttons-big">
      <button class="btn-reveal" id="btn-reveal">🔓 정답 공개</button>
    </div>`;
  document.getElementById('btn-reveal').onclick = revealAnswer;
}

// Stage 5: show answer + success/fail buttons
function revealAnswer() {
  state.phase = 'quiz-judge';
  const quiz = state.currentQuiz;
  const area = document.getElementById('quiz-action-area');
  area.innerHTML = `
    <div class="quiz-answer-box">
      <span class="quiz-answer-label">✨ 정답</span>
      ${escapeHtml(quiz.a).replace(/\n/g,'<br>')}
    </div>
    <div class="quiz-buttons-big">
      <button class="btn-correct-big" id="btn-correct">⭕ 성공!</button>
      <button class="btn-wrong-big" id="btn-wrong">❌ 실패...</button>
    </div>`;
  document.getElementById('btn-correct').onclick = () => finishQuiz(true);
  document.getElementById('btn-wrong').onclick   = () => finishQuiz(false);
}

function finishQuiz(ok) {
  const overlay = document.getElementById('quiz-overlay');
  overlay.classList.remove('show');
  overlay.innerHTML = '';

  AudioMgr.playSfx(ok ? 'correct' : 'wrong');

  const { tile, purpose } = state.quizContext;
  state.currentQuiz = null;
  state.quizContext = null;

  if (purpose === 'build') buildAfterQuiz(tile, ok);
  else if (purpose === 'toll') tollAfterQuiz(tile, ok);
  else if (purpose === 'upgrade') upgradeAfterQuiz(tile, ok);
}

function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, c =>
    ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

// ===== BUILD / TOLL =====
function buildAfterQuiz(tile, ok) {
  const p = state.players[state.current];
  const base = BUILD_LV_COST[1];                    // Lv.1: 3코인
  const taxCost = ok ? tile.tax : tile.tax * 2;     // 실패 시 지역세금만 2배
  const cost = taxCost + base;                      // 예: 초원1+3=4 성공 / 초원2+3=5 실패
  if (p.coins >= cost) {
    showAction([
      { text: `🏛️ 동물원 건설 (${cost}코인)`, class: 'action-btn btn-build', action() {
          p.coins -= cost;
          state.zoos[tile.id] = { owner: state.current, level: 1 };
          AudioMgr.playSfx('zooBuild');
          Render.renderZoos(state);
          Render.renderPlayers(state);
          Render.updateTurnInfo(state);
          showNextTurn();
        }
      },
      { text:'건너뛰기', class:'action-btn btn-skip', action(){ showNextTurn(); } },
    ]);
  } else {
    showModal('💸','코인 부족','<p style="text-align:center">동물원을 건설할 코인이 부족합니다.</p>',
      [{ text:'다음 턴', class:'btn-close-modal', action(){ closeModal(); showNextTurn(); } }]);
  }
}

function handleOpponentZoo(tile, zoo) {
  askStartQuiz(tile, 'toll');
}

function tollAfterQuiz(tile, ok) {
  const p = state.players[state.current];
  const zoo = state.zoos[tile.id];
  if (!zoo) { showNextTurn(); return; }
  const owner = state.players[zoo.owner];
  const mult = TOLL_MULT[zoo.level] || 1;
  // 관람비 = (세금 + 2) × Lv배수, 실패 시 +3코인 flat
  const base = (tile.tax + TOLL_BASE) * mult;
  const toll = ok ? base : base + TOLL_FAIL_EXTRA;

  const acts = [{
    text: `💰 관람비 ${toll}코인 지불`,
    class: 'action-btn btn-pay',
    action() {
      const paid = Math.min(toll, p.coins);
      p.coins -= paid;
      owner.coins += paid;
      AudioMgr.playSfx('coin');
      if (p.coins <= 0) { p.coins = 0; checkBankrupt(state.current); }
      Render.renderPlayers(state);
      Render.updateTurnInfo(state);
      showNextTurn();
    }
  }];

  // 인수는 Lv.1 동물원만 가능 (Lv.2, Lv.3 인수 불가)
  // 인수해도 레벨은 그대로 Lv.1 유지 (업그레이드 X)
  if (ok && zoo.level === 1) {
    const tc = toll * 2;
    if (p.coins >= tc) acts.push({
      text: `🔄 인수 (${tc}코인)`,
      class: 'action-btn btn-takeover',
      action() {
        p.coins -= tc; owner.coins += tc;
        zoo.owner = state.current;
        // level stays at 1 on takeover
        AudioMgr.playSfx('zooBuild');
        Render.renderZoos(state);
        Render.renderPlayers(state);
        Render.updateTurnInfo(state);
        showNextTurn();
      }
    });
  }
  showAction(acts);
}

function handleOwnZoo(tile, zoo) {
  if (zoo.level >= 3) {
    showModal('🛡️','무적 동물원',
      '<p style="text-align:center">이미 최고 등급입니다.</p>',
      [{ text:'확인', class:'btn-close-modal', action(){ closeModal(); showNextTurn(); } }]);
    return;
  }
  const nextLv = zoo.level + 1;
  const base = BUILD_LV_COST[nextLv];
  // 안내용 예상 비용 (성공/실패 기준)
  const successCost = tile.tax + base;
  const failCost    = tile.tax * 2 + base;
  showAction([
    {
      text: `⬆️ Lv.${nextLv} 업그레이드 도전 (성공 ${successCost} / 실패 ${failCost}코인)`,
      class: 'action-btn btn-upgrade',
      action() { askStartQuiz(tile, 'upgrade'); }
    },
    { text:'건너뛰기', class:'action-btn btn-skip', action(){ showNextTurn(); } },
  ]);
}

// 업그레이드 퀴즈 결과 처리 — 건설과 동일하게 지역세금에 성공/실패 가산
function upgradeAfterQuiz(tile, ok) {
  const p = state.players[state.current];
  const zoo = state.zoos[tile.id];
  if (!zoo || zoo.owner !== state.current) { showNextTurn(); return; }
  const nextLv = Math.min(zoo.level + 1, 3);
  const base = BUILD_LV_COST[nextLv];
  const taxCost = ok ? tile.tax : tile.tax * 2;
  const cost = taxCost + base;
  if (p.coins >= cost) {
    showAction([
      {
        text: `⬆️ 업그레이드 Lv.${nextLv} (${cost}코인)${nextLv === 3 ? ' 🛡️무적!' : ''}`,
        class: 'action-btn btn-upgrade',
        action() {
          p.coins -= cost;
          zoo.level = nextLv;
          AudioMgr.playSfx('zooBuild');
          Render.renderZoos(state);
          Render.renderPlayers(state);
          Render.updateTurnInfo(state);
          showNextTurn();
        }
      },
      { text:'건너뛰기', class:'action-btn btn-skip', action(){ showNextTurn(); } },
    ]);
  } else {
    showModal('💸','코인 부족',
      `<p style="text-align:center">Lv.${nextLv} 업그레이드 비용 <b>${cost}코인</b>이 부족합니다.</p>`,
      [{ text:'다음 턴', class:'btn-close-modal', action(){ closeModal(); showNextTurn(); } }]);
  }
}

// ===== JAIL =====
// 처음 감옥 칸에 도착했을 때 — 주사위 더블 탈출은 불가 (다음 턴부터)
function handleJail() {
  const p = state.players[state.current];
  state.jailTurns[state.current] = 2;
  AudioMgr.playSfx('jail');
  const btns = [
    { text:'감옥에서 대기', class:'btn-fail', action(){ closeModal(); showNextTurn(); } },
  ];
  if (p.coins >= JAIL_ESCAPE_COST) btns.unshift({
    text:`💰 ${JAIL_ESCAPE_COST}코인으로 탈출`, class:'btn-success',
    action(){
      p.coins -= JAIL_ESCAPE_COST;
      delete state.jailTurns[state.current];
      closeModal();
      Render.renderPlayers(state);
      Render.updateTurnInfo(state);
      showNextTurn();
    }
  });
  showModal('⛓️','감옥!',
    `<p style="text-align:center">${JAIL_ESCAPE_COST}코인 납부 또는 2턴 정지<br>` +
    `<span style="color:#aaa;font-size:0.9em">(다음 턴부터 주사위 더블로 탈출 가능)</span></p>`, btns);
}

function checkJailOnTurn() {
  const p = state.players[state.current];
  if (p.bankrupt) { nextTurn(); return; }

  if (state.jailTurns[state.current] !== undefined) {
    if (state.jailTurns[state.current] <= 0) {
      delete state.jailTurns[state.current];
      state.phase = 'roll';
      Render.updateTurnInfo(state);
    } else {
      state.jailTurns[state.current]--;
      const remain = state.jailTurns[state.current];
      const btns = [
        { text:'🎲 주사위 탈출 시도', class:'btn-upgrade', action(){ closeModal(); tryJailEscape(); } },
        { text:'대기', class:'btn-fail', action(){ closeModal(); showNextTurn(); } },
      ];
      if (p.coins >= JAIL_ESCAPE_COST) btns.unshift({
        text:`💰 ${JAIL_ESCAPE_COST}코인 탈출`, class:'btn-success',
        action(){
          p.coins -= JAIL_ESCAPE_COST;
          delete state.jailTurns[state.current];
          closeModal();
          Render.renderPlayers(state);
          Render.updateTurnInfo(state);
          state.phase = 'roll';
          Render.updateTurnInfo(state);
        }
      });
      showModal('⛓️','감옥',
        `<p style="text-align:center">${remain}턴 남음<br>주사위 더블이 나오면 즉시 탈출!</p>`, btns);
    }
  } else {
    state.phase = 'roll';
    Render.updateTurnInfo(state);
  }
}

// Roll a pair of dice from jail. Doubles -> escape + move by sum. Otherwise -> turn ends.
async function tryJailEscape() {
  state.phase = 'rolling';
  AudioMgr.playSfx('dice');
  const r1 = Math.floor(Math.random() * 6) + 1;
  const r2 = Math.floor(Math.random() * 6) + 1;
  const total = r1 + r2;
  await Render.animateDiceRoll(r1, r2);

  if (r1 === r2) {
    // Doubles — escape (no extra roll bonus on jail escape)
    delete state.jailTurns[state.current];
    showDoubleEffect('🔓 탈출 성공!', `더블 ${r1}+${r2}=${total} · 이동합니다`);
    setTimeout(() => movePlayer(total), 1300);
  } else {
    setTimeout(() => {
      showModal('⛓️', '탈출 실패',
        `<p style="text-align:center">주사위 <b>${r1}</b> + <b>${r2}</b> — 더블이 아닙니다.<br>다음 턴에 다시 시도하세요.</p>`,
        [{ text:'확인', class:'btn-close-modal', action(){ closeModal(); showNextTurn(); } }]);
    }, 500);
  }
}

// ===== TRAVEL =====
function handleTravel() {
  showTeleport();
}

function showTeleport() {
  const animals = TILES.filter(t => t.type === 'animal');
  const opts = animals.map(t => {
    const occ = tileOccupancy(t.id);
    return `<button class="pick-btn ${occ.cls}" onclick="teleportTo(${t.id})">` +
           `<span class="pick-main">${t.emoji} ${t.name}</span>` +
           `<span class="pick-sub">${occ.text}</span></button>`;
  }).join('');
  showModal('✈️','세계 동물 여행',
    `<p style="text-align:center">이동할 칸을 선택하세요</p>
     <div class="pick-list">${opts}</div>`,
    [], { picker: true, targets: animals.map(t => t.id) });
}

function teleportTo(id) {
  closeModal();
  const p = state.players[state.current];
  const from = p.position;
  const to = id;

  // Going clockwise from `from` to `to` — does the path pass position 0 as an intermediate tile?
  const forwardDist = (to - from + 28) % 28;
  let passedStart = false;
  for (let step = 1; step < forwardDist; step++) {
    if ((from + step) % 28 === 0) { passedStart = true; break; }
  }

  if (passedStart) {
    p.coins += START_PASS_BONUS;
    AudioMgr.playSfx('coin');
    Render.renderPlayers(state);
    Render.updateTurnInfo(state);
  }

  p.position = to;
  Render.renderTokens(state);
  Render.highlightTile(to);
  setTimeout(() => handleLanding(), 400);
}
window.teleportTo = teleportTo;

// ===== GOLDEN KEY =====
function drawGoldenKey() {
  const p = state.players[state.current];
  const card = GOLDEN_KEYS[Math.floor(Math.random() * GOLDEN_KEYS.length)];
  AudioMgr.playSfx('goldenKey');
  const ch = `<div class="key-card">🔑 ${card.text}</div>`;

  switch (card.effect) {
    case 'coins':
      p.coins = Math.max(0, p.coins + card.value);
      AudioMgr.playSfx('coin');
      if (p.coins <= 0) checkBankrupt(state.current);
      Render.renderPlayers(state);
      Render.updateTurnInfo(state);
      showModal('🔑','생물 구조 열쇠', ch,
        [{ text:'확인', class:'btn-close-modal', action(){ closeModal(); showNextTurn(); } }]);
      break;
    case 'teleport':
      showModal('🔑','생물 구조 열쇠', ch,
        [{ text:'이동할 곳 선택', class:'btn-success', action(){ closeModal(); showTeleport(); } }]);
      break;
    case 'double_turn':
      state.doubleTurnNext.push(state.current);
      showModal('🔑','생물 구조 열쇠', ch,
        [{ text:'확인', class:'btn-close-modal', action(){ closeModal(); showNextTurn(); } }]);
      break;
    case 'steal':    showZooPick('steal', ch); break;
    case 'close':    showZooPick('close', ch); break;
    case 'swap':     showZooPick('swap', ch); break;
    case 'free_zoo': showFreeZooPick(ch); break;
    case 'jail_opponent': showJailOpponentPick(ch); break;
    case 'swap_coins':    showCoinSwapPick(ch); break;
  }
}

// Occupancy caption shown under each tile name in a picker button.
function tileOccupancy(tileId) {
  const z = state.zoos[tileId];
  if (!z) return { text: '비어있음', cls: 'pick-empty' };
  const o = state.players[z.owner];
  const shield = z.level >= 3 ? ' 🛡️' : '';
  return { text: `${o.name} · Lv.${z.level}${shield}`, cls: 'pick-occupied' };
}

function showZooPick(action, ch) {
  const targetIds = Object.entries(state.zoos)
    .filter(([, z]) => z.owner !== state.current && z.level < 3)
    .map(([tid]) => +tid);
  const zoos = targetIds.map(tid => {
      const t = TILES[tid], z = state.zoos[tid], o = state.players[z.owner];
      return `<button class="pick-btn" style="background:${o.color}" onclick="zooAction('${action}',${tid})">` +
             `<span class="pick-main">${t.emoji} ${t.name}</span>` +
             `<span class="pick-sub">${o.name} · Lv.${z.level}</span></button>`;
    });
  if (!zoos.length) {
    showModal('🔑','생물 구조 열쇠',
      `${ch}<p style="text-align:center">대상 동물원이 없습니다.</p>`,
      [{ text:'확인', class:'btn-close-modal', action(){ closeModal(); showNextTurn(); } }]);
    return;
  }
  const lb = action === 'steal' ? '가로챌' : action === 'close' ? '폐쇄할' : '교체할';
  showModal('🔑','생물 구조 열쇠',
    `${ch}<p style="text-align:center">${lb} 동물원 선택:</p><div class="pick-list">${zoos.join('')}</div>`,
    [], { picker: true, targets: targetIds });
}

function zooAction(action, tid) {
  closeModal();
  const p = state.players[state.current];
  const t = TILES[tid], z = state.zoos[tid];
  if (!z) { showNextTurn(); return; }
  if (action === 'steal') {
    z.owner = state.current;
    AudioMgr.playSfx('zooBuild');
  } else if (action === 'close') {
    delete state.zoos[tid];
  } else if (action === 'swap') {
    showSwapPick(tid); return;
  }
  Render.renderZoos(state);
  Render.renderPlayers(state);
  showNextTurn();
}
window.zooAction = zooAction;

function showSwapPick(targetId) {
  const myIds = Object.entries(state.zoos)
    .filter(([, z]) => z.owner === state.current)
    .map(([tid]) => +tid);
  const my = myIds.map(tid =>
      `<button class="pick-btn" style="background:#2196f3" onclick="doSwap(${targetId},${tid})">` +
      `<span class="pick-main">${TILES[tid].emoji} ${TILES[tid].name}</span>` +
      `<span class="pick-sub">내 동물원 · Lv.${state.zoos[tid].level}</span></button>`
    );
  if (!myIds.length) { showNextTurn(); return; }
  showModal('🔄','교체할 내 동물원',
    `<div class="pick-list">${my.join('')}</div>`, [], { picker: true, targets: myIds });
}

function doSwap(a, b) {
  closeModal();
  const za = state.zoos[a], zb = state.zoos[b];
  const tmp = za.owner; za.owner = zb.owner; zb.owner = tmp;
  AudioMgr.playSfx('zooBuild');
  Render.renderZoos(state);
  Render.renderPlayers(state);
  showNextTurn();
}
window.doSwap = doSwap;

function showFreeZooPick(ch) {
  const emptyTiles = TILES.filter(t => t.type === 'animal' && !state.zoos[t.id]);
  const empty = emptyTiles.map(t =>
    `<button class="pick-btn pick-empty" onclick="freeBuild(${t.id})">` +
    `<span class="pick-main">${t.emoji} ${t.name}</span>` +
    `<span class="pick-sub">${t.region} · 세금 ${t.tax}💰</span></button>`);
  if (!empty.length) {
    showModal('🔑','생물 구조 열쇠',
      `${ch}<p style="text-align:center">빈 칸이 없습니다.</p>`,
      [{ text:'확인', class:'btn-close-modal', action(){ closeModal(); showNextTurn(); } }]);
    return;
  }
  showModal('🔑','무상 건설',
    `${ch}<p style="text-align:center">건설할 칸을 선택하세요</p><div class="pick-list">${empty.join('')}</div>`,
    [], { picker: true, targets: emptyTiles.map(t => t.id) });
}

function freeBuild(id) {
  closeModal();
  state.zoos[id] = { owner: state.current, level: 1 };
  AudioMgr.playSfx('zooBuild');
  Render.renderZoos(state);
  Render.renderPlayers(state);
  showNextTurn();
}
window.freeBuild = freeBuild;

// 다른 팀 하나를 감옥(tile 14)으로 보내기
function showJailOpponentPick(ch) {
  const me = state.current;
  const rows = state.players
    .map((p, i) => ({ player: p, idx: i }))
    .filter(x => !x.player.bankrupt && x.idx !== me && state.jailTurns[x.idx] === undefined)
    .map(x =>
      `<button class="pick-btn" style="background:${x.player.color}" onclick="sendToJail(${x.idx})">` +
      `${PLAYER_AVATARS[x.idx]} ${x.player.name}</button>`
    ).join('');
  if (!rows) {
    showModal('🔑','생물 구조 열쇠',
      `${ch}<p style="text-align:center">감옥으로 보낼 수 있는 팀이 없습니다.</p>`,
      [{ text:'확인', class:'btn-close-modal', action(){ closeModal(); showNextTurn(); } }]);
    return;
  }
  showModal('🔑','생물 구조 열쇠',
    `${ch}<p style="text-align:center">감옥으로 보낼 팀 선택:</p><div class="pick-list">${rows}</div>`,
    [], { picker: true });
}

function sendToJail(idx) {
  closeModal();
  const target = state.players[idx];
  target.position = 14;
  state.jailTurns[idx] = 2;
  AudioMgr.playSfx('jail');
  Render.renderTokens(state);
  Render.highlightTile(14);
  showModal('⛓️','감옥행!',
    `<p style="text-align:center"><b style="color:${target.color}">${PLAYER_AVATARS[idx]} ${target.name}</b>을(를) 감옥으로 보냈습니다.</p>`,
    [{ text:'확인', class:'btn-close-modal', action(){ closeModal(); showNextTurn(); } }]);
}
window.sendToJail = sendToJail;

// 다른 팀과 코인 교환 (모든 팀 코인 표시, 자기 팀 포함 선택 가능)
function showCoinSwapPick(ch) {
  const me = state.current;
  const rows = state.players
    .map((p, i) => ({ player: p, idx: i }))
    .filter(x => !x.player.bankrupt)
    .map(x => {
      const isMe = x.idx === me;
      const border = isMe ? 'outline:3px dashed #fff;' : '';
      const meLabel = isMe ? ' (우리 조)' : '';
      return `<button class="pick-btn" style="background:${x.player.color};${border}min-width:150px;line-height:1.3" onclick="pickCoinSwap(${x.idx})">` +
        `${PLAYER_AVATARS[x.idx]} ${x.player.name}${meLabel}<br>` +
        `<span style="font-size:1.1em;color:#ffd700">💰 ${x.player.coins}</span></button>`;
    }).join('');
  showModal('🔑','생물 구조 열쇠',
    `${ch}<p style="text-align:center">코인을 교환할 팀 선택 (자기 팀 선택 시 교환 없음)</p>` +
    `<div class="pick-list">${rows}</div>`,
    [], { picker: true });
}

function pickCoinSwap(idx) {
  closeModal();
  if (idx === state.current) {
    // Self-selected — no swap
    showModal('🔑','교환 취소',
      '<p style="text-align:center">자기 팀을 선택해서 교환이 일어나지 않았습니다.</p>',
      [{ text:'확인', class:'btn-close-modal', action(){ closeModal(); showNextTurn(); } }]);
    return;
  }
  const a = state.players[state.current];
  const b = state.players[idx];
  const tmp = a.coins; a.coins = b.coins; b.coins = tmp;
  AudioMgr.playSfx('coin');
  Render.renderPlayers(state);
  Render.updateTurnInfo(state);
  showModal('💱','코인 교환 완료',
    `<p style="text-align:center"><b style="color:${a.color}">${a.name}</b> 💰${a.coins} ⇄ ` +
    `<b style="color:${b.color}">${b.name}</b> 💰${b.coins}</p>`,
    [{ text:'확인', class:'btn-close-modal', action(){ closeModal(); showNextTurn(); } }]);
}
window.pickCoinSwap = pickCoinSwap;

// ===== BANKRUPT =====
function checkBankrupt(idx) {
  const p = state.players[idx];
  if (p.coins <= 0) {
    p.bankrupt = true; p.coins = 0;
    Object.keys(state.zoos).forEach(t => {
      if (state.zoos[t].owner === idx) delete state.zoos[t];
    });
    Render.renderZoos(state);
    Render.renderPlayers(state);
    const alive = state.players.filter(p => !p.bankrupt);
    if (alive.length <= 1) {
      state.phase = 'ended';
      const winner = alive[0];
      showModal('🏆','게임 종료!',
        `<div style="text-align:center;font-size:1.6em;margin:20px 0;color:${winner?.color || '#fff'}">
          ${PLAYER_AVATARS[state.players.indexOf(winner)] || ''} ${winner?.name || '???'} 우승! 🎉
         </div>`,
        [{ text:'새 게임', class:'btn-success', action(){ closeModal(); location.reload(); } }]);
    }
  }
}

// ===== TURNS =====
function showNextTurn() {
  state.phase = 'action';
  showAction([{ text:'➡️ 다음 턴', class:'action-btn btn-next', action(){ nextTurn(); } }]);
}

function showAction(acts) {
  const box = document.getElementById('action-box');
  if (!box) {
    console.error('[bio] action-box not found in DOM');
    return;
  }
  console.log('[bio] showAction', acts.map(a => a.text));
  box.innerHTML = '';
  acts.forEach(a => {
    const b = document.createElement('button');
    b.className = a.class;
    b.textContent = a.text;
    b.onclick = () => {
      box.innerHTML = '';
      try { a.action(); }
      catch (e) { console.error('[bio] action error:', e); }
    };
    box.appendChild(b);
  });
}

function nextTurn() {
  const ab = document.getElementById('action-box');
  if (ab) ab.innerHTML = '';
  Render.highlightTile(-1);

  const di = state.doubleTurnNext.indexOf(state.current);
  if (di !== -1) {
    state.doubleTurnNext.splice(di, 1);
    state.phase = 'roll';
    Render.updateTurnInfo(state);
    return;
  }
  let next = (state.current + 1) % state.players.length, s = 0;
  while (state.players[next].bankrupt && s < state.players.length) {
    next = (next + 1) % state.players.length; s++;
  }
  state.current = next;
  state.phase = 'roll';
  Render.renderTokens(state);       // refresh active-turn spotlight
  Render.renderPlayers(state);
  Render.updateTurnInfo(state);
  checkJailOnTurn();
}

// ===== MODAL =====
// opts.picker  — keep the board readable behind the modal (no blur, light dim)
// opts.targets — tile ids to glow on the board as valid choices
function showModal(emoji, title, content, buttons = [], opts = {}) {
  const m = document.getElementById('modal');
  const o = document.getElementById('modal-overlay');
  o.classList.toggle('picker-mode', !!opts.picker);
  if (opts.targets && opts.targets.length) Render.highlightPickTargets(opts.targets);
  else Render.clearPickTargets();
  m.innerHTML =
    `<div class="modal-emoji">${emoji}</div>
     <h2>${title}</h2>
     ${content}
     <div class="modal-buttons" id="modal-buttons"></div>`;
  const btnBox = document.getElementById('modal-buttons');
  buttons.forEach(b => {
    const btn = document.createElement('button');
    btn.className = b.class;
    btn.textContent = b.text;
    btn.onclick = b.action;
    btnBox.appendChild(btn);
  });
  o.classList.add('show');
}

function closeModal() {
  const o = document.getElementById('modal-overlay');
  o.classList.remove('show');
  o.classList.remove('picker-mode');
  Render.clearPickTargets();
}

// Expose to window for inline handlers & bootstrap
window.updatePlayerInputs = updatePlayerInputs;
window.startGame = startGame;
