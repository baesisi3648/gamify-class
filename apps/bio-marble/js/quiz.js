// ===== QUIZ POOL MODULE =====
// Loads quizzes from localStorage (if admin edited) or default JSON.
// Per Q10-A: shuffled queue created at game start (reset each new game).
// Per Q3-B: single unified pool (no region split).
// Pool exhausted during game => reshuffle and continue.

const LS_KEY_QUIZZES = 'bio-marble.quizzes';
const DEFAULT_JSON_PATH = 'data/default-quizzes.json';

const QuizPool = (() => {
  let masterList = [];   // all available quizzes
  let queue = [];        // shuffled queue for current cycle
  let cycleCount = 0;    // how many full cycles completed in this game

  async function init() {
    // Try localStorage first
    const stored = localStorage.getItem(LS_KEY_QUIZZES);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          masterList = parsed;
          return;
        }
      } catch (e) {
        console.warn('Failed to parse stored quizzes:', e);
      }
    }
    // Fallback: fetch default JSON
    try {
      const res = await fetch(DEFAULT_JSON_PATH);
      const json = await res.json();
      masterList = json.quizzes || [];
      // Seed localStorage on first load so admin has something to edit
      localStorage.setItem(LS_KEY_QUIZZES, JSON.stringify(masterList));
    } catch (e) {
      console.error('Failed to load default quizzes:', e);
      masterList = [];
    }
  }

  function shuffle(arr) {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  function newGame() {
    // Re-load in case admin changed quizzes since init()
    const stored = localStorage.getItem(LS_KEY_QUIZZES);
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          masterList = parsed;
        }
      } catch (e) {}
    }
    queue = shuffle(masterList);
    cycleCount = 0;
  }

  function draw() {
    if (masterList.length === 0) return null;
    if (queue.length === 0) {
      queue = shuffle(masterList);
      cycleCount++;
    }
    return queue.shift();
  }

  function size() { return masterList.length; }
  function remaining() { return queue.length; }
  function currentCycle() { return cycleCount + 1; }

  return { init, newGame, draw, size, remaining, currentCycle };
})();

window.QuizPool = QuizPool;
