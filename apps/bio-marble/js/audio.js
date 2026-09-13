// ===== AUDIO MODULE =====
// BGM: single track on endless loop.
// SFX: named map, supports overlap via cloneNode()
// Volume persisted to localStorage

const BGM_TRACK = { file: 'assets/bgm/bgm-suryeon-forest.mp3', name: '수련의 숲' };

const SFX_FILES = {
  dice:       'assets/sfx/dice-roll.mp3',
  correct:    'assets/sfx/correct.mp3',
  wrong:      'assets/sfx/wrong.mp3',
  coin:       'assets/sfx/coin.mp3',
  jail:       'assets/sfx/jail.mp3',
  zooBuild:   'assets/sfx/zoo-build.mp3',
  goldenKey:  'assets/sfx/golden-key.mp3',
  quizAmb:    'assets/sfx/quiz-ambience.mp3',
  timerTick:  'assets/sfx/timer-tick.mp3',
};

const LS_KEY_BGM_VOL = 'bio-marble.bgm-volume';
const LS_KEY_SFX_VOL = 'bio-marble.sfx-volume';
const LS_KEY_MUTED   = 'bio-marble.muted';

const AudioMgr = (() => {
  let bgmAudio = null;          // <audio> element for BGM
  let bgmStarted = false;       // user gesture happened
  let bgmVolume = 0.4;
  let sfxVolume = 0.7;
  let muted = false;

  // Dedicated looping SFX elements
  let quizAmbienceEl = null;
  let timerTickEl = null;

  // Preloaded SFX pool
  const sfxPool = {};

  function load() {
    const bv = localStorage.getItem(LS_KEY_BGM_VOL);
    const sv = localStorage.getItem(LS_KEY_SFX_VOL);
    const m  = localStorage.getItem(LS_KEY_MUTED);
    if (bv !== null) bgmVolume = parseFloat(bv);
    if (sv !== null) sfxVolume = parseFloat(sv);
    if (m === 'true') muted = true;
  }

  function save() {
    localStorage.setItem(LS_KEY_BGM_VOL, String(bgmVolume));
    localStorage.setItem(LS_KEY_SFX_VOL, String(sfxVolume));
    localStorage.setItem(LS_KEY_MUTED, String(muted));
  }

  function preloadSfx() {
    for (const [key, file] of Object.entries(SFX_FILES)) {
      const a = new Audio(file);
      a.preload = 'auto';
      sfxPool[key] = a;
    }
  }

  function init() {
    load();
    preloadSfx();
    // Build looping elements (quiz-ambience / timer-tick)
    quizAmbienceEl = new Audio(SFX_FILES.quizAmb);
    quizAmbienceEl.loop = true;
    timerTickEl = new Audio(SFX_FILES.timerTick);
    timerTickEl.loop = true;
  }

  function startBgm() {
    if (bgmStarted) return;
    bgmStarted = true;
    bgmAudio = new Audio(BGM_TRACK.file);
    bgmAudio.loop = true;
    bgmAudio.volume = muted ? 0 : bgmVolume;
    bgmAudio.play().catch(e => console.warn('BGM play failed:', e));
    updateTrackDisplay(BGM_TRACK.name);
  }

  function updateTrackDisplay(name) {
    const el = document.getElementById('bgm-track-name');
    if (el) el.textContent = `♪ ${name}`;
  }

  function setBgmVolume(v) {
    bgmVolume = Math.max(0, Math.min(1, v));
    if (bgmAudio && !muted) bgmAudio.volume = bgmVolume;
    save();
  }

  function setSfxVolume(v) {
    sfxVolume = Math.max(0, Math.min(1, v));
    if (quizAmbienceEl && !muted) quizAmbienceEl.volume = sfxVolume * 0.6;
    if (timerTickEl && !muted) timerTickEl.volume = sfxVolume * 0.8;
    save();
  }

  function toggleMute() {
    muted = !muted;
    if (bgmAudio) bgmAudio.volume = muted ? 0 : bgmVolume;
    if (quizAmbienceEl) quizAmbienceEl.volume = muted ? 0 : sfxVolume * 0.6;
    if (timerTickEl) timerTickEl.volume = muted ? 0 : sfxVolume * 0.8;
    save();
    return muted;
  }

  function playSfx(name) {
    if (muted) return;
    const src = sfxPool[name];
    if (!src) { console.warn('SFX not found:', name); return; }
    // Clone node so overlapping plays are possible
    const clone = src.cloneNode();
    clone.volume = sfxVolume;
    clone.play().catch(() => {});
  }

  function startQuizAmbience() {
    if (!quizAmbienceEl) return;
    quizAmbienceEl.currentTime = 0;
    quizAmbienceEl.volume = muted ? 0 : sfxVolume * 0.6;
    quizAmbienceEl.play().catch(() => {});
  }

  function stopQuizAmbience() {
    if (!quizAmbienceEl) return;
    quizAmbienceEl.pause();
    quizAmbienceEl.currentTime = 0;
  }

  function startTimerTick() {
    if (!timerTickEl) return;
    timerTickEl.currentTime = 0;
    timerTickEl.volume = muted ? 0 : sfxVolume * 0.8;
    timerTickEl.play().catch(() => {});
  }

  function stopTimerTick() {
    if (!timerTickEl) return;
    timerTickEl.pause();
    timerTickEl.currentTime = 0;
  }

  function getState() {
    return { bgmVolume, sfxVolume, muted };
  }

  return {
    init, startBgm,
    playSfx,
    setBgmVolume, setSfxVolume, toggleMute,
    startQuizAmbience, stopQuizAmbience,
    startTimerTick, stopTimerTick,
    getState,
  };
})();

window.AudioMgr = AudioMgr;
