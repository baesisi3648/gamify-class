// ===== RENDER MODULE =====
// Board, tiles, tokens (large emoji characters), 3D zoo buildings, 3D dice.

const PLAYER_COLORS  = ['#f44336', '#2196f3', '#4caf50', '#ff9800'];
const PLAYER_AVATARS = ['🦊', '🐯', '🐼', '🐰'];

const TILES = [
  { id:0,  name:'START',        type:'start',   region:null,     tax:0, emoji:'🏁' },
  { id:1,  name:'생물구조열쇠', type:'key',     region:null,     tax:0, emoji:'🔑' },
  { id:2,  name:'하이에나',     type:'animal',  region:'초원',   tax:1, emoji:'🦴' },
  { id:3,  name:'하마',         type:'animal',  region:'초원',   tax:1, emoji:'🦛' },
  { id:4,  name:'얼룩말',       type:'animal',  region:'초원',   tax:1, emoji:'🦓' },
  { id:5,  name:'기린',         type:'animal',  region:'초원',   tax:1, emoji:'🦒' },
  { id:6,  name:'코끼리',       type:'animal',  region:'초원',   tax:1, emoji:'🐘' },
  { id:7,  name:'생물구조열쇠', type:'key',     region:null,     tax:0, emoji:'🔑' },
  { id:8,  name:'사자',         type:'animal',  region:'초원',   tax:1, emoji:'🦁' },
  { id:9,  name:'생물보호구역', type:'reserve', region:null,     tax:0, emoji:'🏕️' },
  { id:10, name:'펭귄',         type:'animal',  region:'극지방', tax:2, emoji:'🐧' },
  { id:11, name:'생물구조열쇠', type:'key',     region:null,     tax:0, emoji:'🔑' },
  { id:12, name:'바다사자',     type:'animal',  region:'극지방', tax:2, emoji:'🦭' },
  { id:13, name:'북극곰',       type:'animal',  region:'극지방', tax:2, emoji:'🐻‍❄️' },
  { id:14, name:'감옥',         type:'jail',    region:null,     tax:0, emoji:'⛓️' },
  { id:15, name:'문어',         type:'animal',  region:'바다',   tax:3, emoji:'🐙' },
  { id:16, name:'산호',         type:'animal',  region:'바다',   tax:3, emoji:'🪸' },
  { id:17, name:'게',           type:'animal',  region:'바다',   tax:3, emoji:'🦀' },
  { id:18, name:'상어',         type:'animal',  region:'바다',   tax:3, emoji:'🦈' },
  { id:19, name:'해마',         type:'animal',  region:'바다',   tax:3, emoji:'🐠' },
  { id:20, name:'생물구조열쇠', type:'key',     region:null,     tax:0, emoji:'🔑' },
  { id:21, name:'바다거북',     type:'animal',  region:'바다',   tax:3, emoji:'🐢' },
  { id:22, name:'고래',         type:'animal',  region:'바다',   tax:3, emoji:'🐋' },
  { id:23, name:'세계동물여행', type:'travel',  region:null,     tax:0, emoji:'✈️' },
  { id:24, name:'판다',         type:'animal',  region:'삼림',   tax:4, emoji:'🐼' },
  { id:25, name:'생물구조열쇠', type:'key',     region:null,     tax:0, emoji:'🔑' },
  { id:26, name:'독수리',       type:'animal',  region:'삼림',   tax:4, emoji:'🦅' },
  { id:27, name:'호랑이',       type:'animal',  region:'삼림',   tax:4, emoji:'🐯' },
];

// 10 cols x 6 rows grid. START bottom-right, clockwise.
const TILE_POS = {
  0:[5,9], 1:[5,8], 2:[5,7], 3:[5,6], 4:[5,5], 5:[5,4], 6:[5,3], 7:[5,2], 8:[5,1], 9:[5,0],
  10:[4,0], 11:[3,0], 12:[2,0], 13:[1,0],
  14:[0,0], 15:[0,1], 16:[0,2], 17:[0,3], 18:[0,4], 19:[0,5], 20:[0,6], 21:[0,7], 22:[0,8], 23:[0,9],
  24:[1,9], 25:[2,9], 26:[3,9], 27:[4,9]
};

function getTileClass(t) {
  if (t.type === 'start')   return 'tile-start';
  if (t.type === 'key')     return 'tile-key';
  if (t.type === 'jail')    return 'tile-jail';
  if (t.type === 'reserve') return 'tile-reserve';
  if (t.type === 'travel')  return 'tile-travel';
  if (t.region === '초원')   return 'tile-grassland';
  if (t.region === '극지방') return 'tile-polar';
  if (t.region === '바다')   return 'tile-ocean';
  if (t.region === '삼림')   return 'tile-forest';
  return '';
}

function renderBoard(state) {
  const board = document.getElementById('board');
  board.innerHTML = '';

  // Place tiles
  for (const [id, pos] of Object.entries(TILE_POS)) {
    const tile = TILES[+id];
    const cell = document.createElement('div');
    cell.className = `tile ${getTileClass(tile)}`;
    cell.id = `tile-${tile.id}`;
    cell.style.gridRow = pos[0] + 1;
    cell.style.gridColumn = pos[1] + 1;

    let regionBar = '';
    if (tile.region) {
      const rc = { '초원':'#66bb6a', '극지방':'#4fc3f7', '바다':'#1e88e5', '삼림':'#2e7d32' };
      regionBar = `<div class="region-bar" style="background:${rc[tile.region]}"></div>`;
    }
    const taxSpan = tile.tax > 0
      ? `<span class="tile-tax">${tile.region} ${tile.tax}💰</span>` : '';
    let nm = tile.name;
    if (tile.type === 'key')     nm = '생물구조<br>열쇠';
    if (tile.type === 'reserve') nm = '생물<br>보호구역';
    if (tile.type === 'travel')  nm = '세계<br>동물여행';

    const poolBadge = (tile.type === 'reserve')
      ? `<div class="reserve-pool" id="reserve-pool">💰0</div>` : '';
    cell.innerHTML =
      `${regionBar}` +
      `<div class="tile-emoji">${tile.emoji}</div>` +
      `<div class="tile-label">` +
        `<span class="tile-name">${nm}</span>` +
        taxSpan +
      `</div>` +
      poolBadge +
      `<div class="tile-tokens" id="tokens-${tile.id}"></div>`;
    board.appendChild(cell);
  }

  // Center panel
  //   ┌────────────────────────────────┐
  //   │  🌍 생명 마블 제작.배성용 (top) │
  //   ├────────────────┬───────────────┤
  //   │                │ 모둠 현황     │
  //   │  turn + dice   │ (players)     │
  //   │  (left)        ├───────────────┤
  //   │                │ action-box    │
  //   └────────────────┴───────────────┘
  const cp = document.createElement('div');
  cp.id = 'center-panel';
  cp.innerHTML = `
    <div id="center-title">
      <span class="title-emoji">🌍</span>
      <span class="title-text">생명 마블</span>
      <span class="title-by">제작. 용인삼계고 교사 배성용</span>
    </div>
    <div id="dice-section">
      <div id="turn-box">
        <div class="turn-label">현재 차례</div>
        <div class="turn-name" id="current-name">-</div>
        <div class="turn-coins" id="current-coins">-</div>
      </div>
      <div id="dice-box">
        <div id="dice-display">
          <div class="dice-3d" id="dice1"><div class="dice-face">?</div></div>
          <div class="dice-3d" id="dice2"><div class="dice-face">?</div></div>
        </div>
        <div id="dice-sum"></div>
        <button id="btn-roll">🎲 주사위 굴리기</button>
      </div>
    </div>
    <div id="right-column">
      <div id="players-box">
        <h4>모둠 현황</h4>
        <div id="players-list"></div>
      </div>
      <div id="action-box"></div>
    </div>`;
  board.appendChild(cp);

  renderTokens(state);
  renderZoos(state);
  renderPlayers(state);
  updateTurnInfo(state);
}

function renderTokens(state) {
  document.querySelectorAll('.tile-tokens').forEach(el => el.innerHTML = '');
  state.players.forEach((p, i) => {
    if (p.bankrupt) return;
    const c = document.getElementById(`tokens-${p.position}`);
    if (!c) return;
    const t = document.createElement('div');
    t.className = 'token';
    if (i === state.current) t.classList.add('active-turn');
    t.style.borderColor = p.color;
    t.textContent = PLAYER_AVATARS[i];
    t.title = p.name;
    c.appendChild(t);
  });
}

function hopToken(playerIdx) {
  // Add brief hop animation when a player token moves one step.
  const p = window.gameState?.players?.[playerIdx];
  if (!p) return;
  const c = document.getElementById(`tokens-${p.position}`);
  if (!c) return;
  // Find last-appended token (the one that was just moved)
  const tokens = c.querySelectorAll('.token');
  const last = tokens[tokens.length - 1];
  if (last) {
    last.classList.remove('moving');
    // Force reflow to restart animation
    void last.offsetWidth;
    last.classList.add('moving');
  }
}

// Amusement-park themed zoo: different ride per level
const ZOO_RIDES = {
  1: '🎡', // Ferris wheel
  2: '🎢', // Roller coaster
  3: '🏰', // Castle (invincible)
};

function renderZoos(state) {
  document.querySelectorAll('.zoo-indicator').forEach(el => el.remove());
  Object.entries(state.zoos).forEach(([tid, zoo]) => {
    const el = document.getElementById(`tile-${tid}`);
    if (!el) return;
    const color = state.players[zoo.owner].color;
    const lvl = zoo.level;
    const ride = ZOO_RIDES[lvl] || '🎡';

    const ind = document.createElement('div');
    ind.className = `zoo-indicator zoo-lv${lvl}`;
    ind.style.setProperty('--zoo-color', color);
    ind.innerHTML = `
      <div class="zoo-park">
        <div class="zoo-ride">${ride}</div>
        ${lvl >= 2 ? '<span class="zoo-sparkle s1">✨</span><span class="zoo-sparkle s2">⭐</span>' : ''}
        ${lvl >= 3 ? '<span class="zoo-sparkle s3">🎆</span><span class="zoo-sparkle s4">🎇</span>' : ''}
      </div>`;
    el.appendChild(ind);
  });
}

function updateTurnInfo(state) {
  const p = state.players[state.current];
  const ne = document.getElementById('current-name');
  if (!ne) return;
  ne.textContent = `${PLAYER_AVATARS[state.current]} ${p.name}`;
  ne.style.color = p.color;
  document.getElementById('current-coins').textContent = `💰 ${p.coins} 코인`;
  const btn = document.getElementById('btn-roll');
  if (btn) btn.disabled = (state.phase !== 'roll');
}

function renderPlayers(state) {
  const div = document.getElementById('players-list');
  if (!div) return;
  div.innerHTML = '';
  state.players.forEach((p, i) => {
    const zc = Object.values(state.zoos).filter(z => z.owner === i).length;
    div.innerHTML +=
      `<div class="player-row ${i === state.current ? 'active' : ''} ${p.bankrupt ? 'bankrupt' : ''}">
        <div class="p-avatar" style="border-color:${p.color}">${PLAYER_AVATARS[i]}</div>
        <div class="p-name">${p.name}</div>
        <div class="p-coins">💰 ${p.coins}</div>
        <div class="p-zoos">🏛️ ${zc}</div>
      </div>`;
  });
}

function renderReservePool(state) {
  const el = document.getElementById('reserve-pool');
  if (!el) return;
  const n = state.reservePool || 0;
  el.textContent = `💰${n}`;
  if (n > 0) el.classList.add('has-pool');
  else el.classList.remove('has-pool');
}

// Board tiles that are valid choices while a picker modal is open.
function highlightPickTargets(ids) {
  clearPickTargets();
  ids.forEach(id => {
    const el = document.getElementById(`tile-${id}`);
    if (el) el.classList.add('pick-target');
  });
}

function clearPickTargets() {
  document.querySelectorAll('.tile.pick-target')
    .forEach(el => el.classList.remove('pick-target'));
}

function highlightTile(id) {
  document.querySelectorAll('.tile').forEach(t => t.classList.remove('landed'));
  if (id < 0) return;
  const el = document.getElementById(`tile-${id}`);
  if (el) el.classList.add('landed');
}

// ===== 3D DICE ANIMATION =====
const DICE_FACES = ['⚀','⚁','⚂','⚃','⚄','⚅'];

function animateDiceRoll(r1, r2) {
  return new Promise(resolve => {
    const d1 = document.getElementById('dice1');
    const d2 = document.getElementById('dice2');
    const f1 = d1.querySelector('.dice-face');
    const f2 = d2.querySelector('.dice-face');
    const sumEl = document.getElementById('dice-sum');
    sumEl.textContent = '';

    d1.classList.add('rolling');
    d2.classList.add('rolling');

    // Rapidly change face while tumbling
    let ticks = 0;
    const iv = setInterval(() => {
      f1.textContent = DICE_FACES[Math.floor(Math.random()*6)];
      f2.textContent = DICE_FACES[Math.floor(Math.random()*6)];
      ticks++;
      if (ticks >= 7) clearInterval(iv);
    }, 110);

    // Settle after tumble animation finishes
    setTimeout(() => {
      clearInterval(iv);
      f1.textContent = DICE_FACES[r1 - 1];
      f2.textContent = DICE_FACES[r2 - 1];
      d1.classList.remove('rolling');
      d2.classList.remove('rolling');
      sumEl.textContent = `${r1} + ${r2} = ${r1 + r2}`;
      resolve();
    }, 950);
  });
}

// ===== COUNTDOWN =====
function showCountdown(onComplete) {
  const overlay = document.getElementById('countdown-overlay');
  const num = document.getElementById('countdown-number');
  let i = 3;
  overlay.classList.add('show');
  num.textContent = i;
  // Re-trigger animation
  num.style.animation = 'none';
  void num.offsetWidth;
  num.style.animation = '';
  const tick = setInterval(() => {
    i--;
    if (i <= 0) {
      clearInterval(tick);
      overlay.classList.remove('show');
      onComplete();
      return;
    }
    num.textContent = i;
    num.style.animation = 'none';
    void num.offsetWidth;
    num.style.animation = '';
  }, 900);
}

window.Render = {
  TILES, TILE_POS, PLAYER_COLORS, PLAYER_AVATARS,
  renderBoard, renderTokens, renderZoos, renderPlayers,
  updateTurnInfo, highlightTile, hopToken,
  highlightPickTargets, clearPickTargets,
  animateDiceRoll, showCountdown, renderReservePool,
};
