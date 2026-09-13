// ===== ADMIN PAGE =====
// The first visitor on each browser chooses a local password.
// CRUD on localStorage key 'bio-marble.quizzes'
// Import/export JSON, reset to default

const LS_KEY_QUIZZES = 'bio-marble.quizzes';
const DEFAULT_JSON_PATH = 'data/default-quizzes.json';
const LS_KEY_UNLOCKED = 'bio-marble.admin-session';
const LS_KEY_PASSWORD_HASH = 'bio-marble.admin-password-hash';

let quizzes = [];
let editingId = null;

// ===== LOCAL LOCK =====
// This is a browser-local guard for browser-local quiz data, not server authentication.
async function hashPassword(value) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}

async function tryUnlock() {
  const pwd = document.getElementById('lock-pwd').value;
  const savedHash = localStorage.getItem(LS_KEY_PASSWORD_HASH);
  const err = document.getElementById('lock-error');

  if (!savedHash) {
    if (pwd.length < 8) {
      err.textContent = '처음 사용할 비밀번호를 8자리 이상 입력하세요.';
      return;
    }
    localStorage.setItem(LS_KEY_PASSWORD_HASH, await hashPassword(pwd));
    sessionStorage.setItem(LS_KEY_UNLOCKED, '1');
    unlock();
    return;
  }

  if (await hashPassword(pwd) === savedHash) {
    sessionStorage.setItem(LS_KEY_UNLOCKED, '1');
    unlock();
    return;
  }

  err.textContent = '이 브라우저에 설정한 비밀번호와 다릅니다.';
  document.getElementById('lock-pwd').value = '';
}

function unlock() {
  document.getElementById('lock-screen').style.display = 'none';
  document.getElementById('admin-panel').classList.add('show');
  loadQuizzes().then(renderList);
}

// ===== DATA =====
async function loadQuizzes() {
  const stored = localStorage.getItem(LS_KEY_QUIZZES);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (Array.isArray(parsed)) {
        quizzes = parsed;
        return;
      }
    } catch (e) {
      console.warn('Failed to parse:', e);
    }
  }
  // Load defaults
  try {
    const res = await fetch(DEFAULT_JSON_PATH);
    const json = await res.json();
    quizzes = json.quizzes || [];
    saveQuizzes();
  } catch (e) {
    console.error('Failed to load defaults:', e);
    quizzes = [];
  }
}

function saveQuizzes() {
  localStorage.setItem(LS_KEY_QUIZZES, JSON.stringify(quizzes));
}

function nextId() {
  return quizzes.length
    ? Math.max(...quizzes.map(q => q.id || 0)) + 1
    : 1;
}

// ===== RENDER =====
function escapeHtml(s) {
  return (s || '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
}

function renderList() {
  document.getElementById('stat-count').textContent = quizzes.length;
  const list = document.getElementById('quiz-list');
  if (quizzes.length === 0) {
    list.innerHTML = `<div class="empty-state">등록된 문제가 없습니다. 위에서 추가해주세요.</div>`;
    return;
  }
  list.innerHTML = quizzes.map((qz, i) => renderRow(qz, i)).join('');
  // Wire buttons
  quizzes.forEach(qz => {
    const root = document.getElementById(`quiz-${qz.id}`);
    if (!root) return;
    const btnEdit = root.querySelector('.btn-edit');
    const btnDel  = root.querySelector('.btn-del');
    const btnSave = root.querySelector('.btn-save');
    const btnCancel = root.querySelector('.btn-cancel');
    if (btnEdit)   btnEdit.onclick   = () => startEdit(qz.id);
    if (btnDel)    btnDel.onclick    = () => deleteQuiz(qz.id);
    if (btnSave)   btnSave.onclick   = () => saveEdit(qz.id);
    if (btnCancel) btnCancel.onclick = () => { editingId = null; renderList(); };
  });
}

function renderRow(qz, i) {
  const isEditing = (qz.id === editingId);
  if (isEditing) {
    return `
      <div class="quiz-item editing" id="quiz-${qz.id}">
        <div class="quiz-num">${i + 1}</div>
        <div><textarea class="edit-q">${escapeHtml(qz.q)}</textarea></div>
        <div><textarea class="edit-a">${escapeHtml(qz.a)}</textarea></div>
        <div class="quiz-actions">
          <button class="btn-save">💾 저장</button>
          <button class="btn-cancel">취소</button>
        </div>
      </div>`;
  }
  return `
    <div class="quiz-item" id="quiz-${qz.id}">
      <div class="quiz-num">${i + 1}</div>
      <div class="quiz-q">${escapeHtml(qz.q)}</div>
      <div class="quiz-a">${escapeHtml(qz.a)}</div>
      <div class="quiz-actions">
        <button class="btn-edit">✏️</button>
        <button class="btn-del">🗑️</button>
      </div>
    </div>`;
}

// ===== CRUD =====
function addQuiz() {
  const qEl = document.getElementById('add-q');
  const aEl = document.getElementById('add-a');
  const q = qEl.value.trim();
  const a = aEl.value.trim();
  if (!q || !a) {
    toast('문제와 정답을 모두 입력해주세요.', 'error');
    return;
  }
  quizzes.push({ id: nextId(), q, a });
  saveQuizzes();
  qEl.value = '';
  aEl.value = '';
  renderList();
  toast('문제를 추가했습니다.', 'success');
}

function startEdit(id) {
  editingId = id;
  renderList();
}

function saveEdit(id) {
  const root = document.getElementById(`quiz-${id}`);
  if (!root) return;
  const q = root.querySelector('.edit-q').value.trim();
  const a = root.querySelector('.edit-a').value.trim();
  if (!q || !a) {
    toast('문제와 정답을 모두 입력해주세요.', 'error');
    return;
  }
  const idx = quizzes.findIndex(x => x.id === id);
  if (idx >= 0) {
    quizzes[idx] = { ...quizzes[idx], q, a };
    saveQuizzes();
  }
  editingId = null;
  renderList();
  toast('저장되었습니다.', 'success');
}

function deleteQuiz(id) {
  const qz = quizzes.find(x => x.id === id);
  if (!qz) return;
  if (!confirm(`"${qz.q.slice(0, 30)}..." 문제를 삭제하시겠습니까?`)) return;
  quizzes = quizzes.filter(x => x.id !== id);
  saveQuizzes();
  renderList();
  toast('삭제되었습니다.', 'success');
}

// ===== IMPORT / EXPORT =====
function exportJson() {
  const data = { version: 1, quizzes };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const date = new Date().toISOString().slice(0, 10);
  a.download = `bio-marble-quizzes-${date}.json`;
  a.click();
  URL.revokeObjectURL(url);
  toast('JSON을 내보냈습니다.', 'success');
}

function importJson(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const json = JSON.parse(e.target.result);
      const arr = Array.isArray(json) ? json : json.quizzes;
      if (!Array.isArray(arr)) throw new Error('Invalid structure');
      // Validate
      const cleaned = arr
        .filter(x => x && typeof x.q === 'string' && typeof x.a === 'string')
        .map((x, i) => ({ id: x.id || (i + 1), q: x.q, a: x.a }));
      if (cleaned.length === 0) throw new Error('No valid entries');
      if (!confirm(`${cleaned.length}개의 문제를 가져옵니다. 현재 ${quizzes.length}개는 덮어쓰여집니다. 계속?`)) return;
      quizzes = cleaned;
      saveQuizzes();
      renderList();
      toast(`${cleaned.length}개 문제를 가져왔습니다.`, 'success');
    } catch (err) {
      toast('JSON 파일이 올바르지 않습니다.', 'error');
      console.error(err);
    }
  };
  reader.readAsText(file);
}

async function resetToDefault() {
  if (!confirm('기본값으로 초기화합니다. 현재 저장된 문제는 모두 삭제되고 서버의 기본 문제 세트로 대체됩니다. 계속?')) return;
  try {
    const res = await fetch(DEFAULT_JSON_PATH + '?ts=' + Date.now());
    const json = await res.json();
    quizzes = json.quizzes || [];
    saveQuizzes();
    renderList();
    toast('기본값으로 초기화했습니다.', 'success');
  } catch (e) {
    toast('초기화 실패', 'error');
  }
}

// ===== TOAST =====
let toastTimer = null;
function toast(msg, type = '') {
  const el = document.getElementById('toast');
  el.className = type;
  el.textContent = msg;
  el.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2500);
}

// ===== BOOTSTRAP =====
document.addEventListener('DOMContentLoaded', () => {
  // If already unlocked in this session, skip lock
  if (sessionStorage.getItem(LS_KEY_UNLOCKED) === '1') {
    unlock();
  } else {
    document.getElementById('btn-unlock').onclick = tryUnlock;
    document.getElementById('lock-pwd').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') tryUnlock();
    });
    document.getElementById('lock-pwd').focus();
  }

  // Wire panel buttons
  document.getElementById('btn-add').onclick    = addQuiz;
  document.getElementById('btn-export').onclick = exportJson;
  document.getElementById('btn-reset').onclick  = resetToDefault;
  document.getElementById('btn-import').onclick = () => document.getElementById('import-file').click();
  document.getElementById('import-file').onchange = (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) importJson(f);
    e.target.value = '';
  };
});
